import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Model, LoadDef, SupportType, Vec, add, scale, sub, norm } from '../engine/model.ts';
import { analyze, Solution } from '../engine/analysis.ts';
import { normalize, Structure } from '../engine/normalize.ts';
import { buildSteps, Step, Block, fmt } from '../engine/steps.ts';
import { Drawing, Hover, EditEvent } from './Drawing.tsx';
import { NudoDiagram } from './Nudo.tsx';
import { guardarJson } from './guardar.ts';
import { svgToPng, imprimirInforme } from './exportar.ts';
import { PanelIA } from './PanelIA.tsx';
import type { Propuesta } from '../ai/gemini.ts';
import { EXAMPLES, UNIT_SYSTEMS, convertModel } from './examples.ts';

const STORAGE = 'calculadora-esfuerzos:v1';

interface Saved {
  model: Model;
  unidades: string;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return JSON.parse(raw);
  } catch {
    /* sin almacenamiento disponible */
  }
  return { model: structuredClone(EXAMPLES[0].model), unidades: EXAMPLES[0].unidades };
}

const num = (s: string) => {
  const v = parseFloat(s.replace(',', '.'));
  return isFinite(v) ? v : 0;
};

/** Convierte la notación `_{…}` / `^{…}` en subíndices y supraíndices. */
export function Math_({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /([_^])\{([^{}]*)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    parts.push(m[1] === '_' ? <sub key={k++}>{m[2]}</sub> : <sup key={k++}>{m[2]}</sup>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export function NumIn({ value, onChange, label, width = 64 }: { value: number; onChange: (v: number) => void; label: string; width?: number }) {
  const [txt, setTxt] = useState(String(value).replace('.', ','));
  useEffect(() => {
    if (num(txt) !== value) setTxt(String(value).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      style={{ width }}
      value={txt}
      onChange={(e) => {
        setTxt(e.target.value);
        onChange(num(e.target.value));
      }}
    />
  );
}

export function App({ onHome }: { onHome?: () => void }) {
  const initial = useMemo(load, []);
  const [model, setModel] = useState<Model>(initial.model);
  const [unidadesId, setUnidadesId] = useState(initial.unidades);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [dce, setDce] = useState(true);
  const [todo, setTodo] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ isostatico: true });
  const [tab, setTab] = useState<'editor' | 'dibujo' | 'pasos'>('dibujo');
  const [hover, setHover] = useState<Hover | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [grid, setGrid] = useState(0.5);
  const [pending, setPending] = useState<Vec | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ia, setIa] = useState(false);
  const [previo, setPrevio] = useState<{ model: Model; unidades: string } | null>(null);
  const aplicarIA = (p: Propuesta) => {
    setPrevio({ model, unidades: unidadesId });
    setModel(p.model);
    if (p.unidades) setUnidadesId(p.unidades);
    setHighlight(null);
    setIa(false);
    setAviso(`Estructura propuesta por la IA: revisá nodos, vínculos y cargas antes de usar los resultados.${p.notas.length ? ' Notas: ' + p.notas.join(' ') : ''}`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pending) setPending(null);
        else setTool(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);
  const fileRef = useRef<HTMLInputElement>(null);
  const units = UNIT_SYSTEMS.find((u) => u.id === unidadesId) ?? UNIT_SYSTEMS[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ model, unidades: unidadesId }));
    } catch {
      /* ignorado */
    }
  }, [model, unidadesId]);

  const result = useMemo(() => {
    try {
      const st: Structure = normalize(model);
      const sol: Solution = analyze(model);
      const steps: Step[] = buildSteps(sol, units);
      return { st, sol, steps, error: null as string | null };
    } catch (e) {
      let st: Structure | null = null;
      try {
        st = normalize(model);
      } catch {
        // Para poder seguir editando, se dibuja lo que sea válido (o una grilla vacía).
        try {
          st = normalize(limpiar(structuredClone(model)));
        } catch {
          st = normalize({ nodes: [], bars: [], supports: [], hinges: [], loads: [] });
        }
      }
      return { st, sol: null, steps: [] as Step[], error: (e as Error).message };
    }
  }, [model, units]);

  const set = (fn: (m: Model) => void) =>
    setModel((m) => {
      const c = structuredClone(m);
      fn(c);
      return limpiar(c);
    });

  const nodeIds = model.nodes.map((n) => n.id);
  const barIds = model.bars.map((b) => b.id);
  const nextNode = () => {
    const used = new Set(nodeIds);
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !used.has(l)) ?? `N${nodeIds.length + 1}`;
  };

  /** Clic del editor gráfico sobre la estructura. */
  const onEdit = (ev: EditEvent) => {
    if (!tool || !st) return;
    const sbar = ev.bar ? st.bars.find((b) => b.id === ev.bar!.id) : null;
    // Ubicación sobre la barra original del modelo: distancia desde su nodo `from`.
    const onModelBar = () => {
      if (!sbar) return null;
      const mb = model.bars.find((b) => b.id === sbar.orig);
      const from = mb && model.nodes.find((n) => n.id === mb.from);
      if (!mb || !from) return null;
      return { bar: mb.id, at: +norm(sub(ev.p, { x: from.x, y: from.y })).toFixed(6) };
    };
    set((m) => {
      const used = new Set(m.nodes.map((n) => n.id));
      const nodeAt = (p: Vec): string => {
        const ex = m.nodes.find((n) => Math.abs(n.x - p.x) < 1e-6 && Math.abs(n.y - p.y) < 1e-6);
        if (ex) return ex.id;
        const id = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !used.has(l)) ?? `N${m.nodes.length + 1}`;
        used.add(id);
        m.nodes.push({ id, x: +p.x.toFixed(6), y: +p.y.toFixed(6) });
        return id;
      };
      // Los nodos detectados automáticamente (cruces, cargas) se agregan al modelo al usarlos.
      const nodeFor = () => (ev.node && m.nodes.some((n) => n.id === ev.node) ? ev.node : nodeAt(ev.p));
      switch (tool) {
        case 'nodo':
          nodeFor();
          return;
        case 'barra': {
          if (!pending) return void setPending(ev.p);
          if (norm(sub(pending, ev.p)) < 1e-9) return void setPending(null);
          const a = nodeAt(pending), b = nodeAt(ev.p);
          let id = `${a}${b}`;
          while (m.bars.some((x) => x.id === id)) id += "'";
          m.bars.push({ id, from: a, to: b });
          setPending(ev.p);
          return;
        }
        case 'movil':
        case 'fijo':
        case 'empotramiento': {
          const n = nodeFor();
          m.supports = m.supports.filter((x) => x.node !== n);
          m.supports.push({ node: n, type: tool });
          return;
        }
        case 'articulacion': {
          const n = nodeFor();
          const had = (m.hinges ?? []).some((h) => h.node === n);
          m.hinges = (m.hinges ?? []).filter((h) => h.node !== n);
          if (!had) m.hinges.push({ node: n });
          return;
        }
        case 'puntual':
        case 'cupla': {
          const ob = ev.node ? null : onModelBar();
          const where = ob ?? { node: nodeFor() };
          m.loads.push(tool === 'puntual' ? { type: 'puntual', ...where, value: 10, angle: -90 } : { type: 'cupla', ...where, value: 10 });
          setAviso('Carga agregada: editá su valor y dirección en la pestaña Datos o en la lista de cargas.');
          return;
        }
        case 'distribuida': {
          if (!sbar) return void setAviso('Hacé clic sobre una barra para cargarla.');
          const mb = m.bars.find((b) => b.id === sbar.orig)!;
          const from = m.nodes.find((n) => n.id === mb.from)!;
          const P0 = sbar.P0, P1 = add(sbar.P0, scale(sbar.e, sbar.L));
          const d0 = norm(sub(P0, { x: from.x, y: from.y })), d1 = norm(sub(P1, { x: from.x, y: from.y }));
          m.loads.push({ type: 'distribuida', bar: mb.id, from: +Math.min(d0, d1).toFixed(6), to: +Math.max(d0, d1).toFixed(6), q1: 5, q2: 5 });
          setAviso(`Carga distribuida agregada en el tramo ${sbar.from}${sbar.to}: editá q en la lista de cargas.`);
          return;
        }
        case 'borrar': {
          if (ev.node && m.nodes.some((n) => n.id === ev.node)) {
            const id = ev.node;
            m.nodes = m.nodes.filter((n) => n.id !== id);
            m.bars = m.bars.filter((b) => b.from !== id && b.to !== id);
            m.supports = m.supports.filter((x) => x.node !== id);
            m.hinges = (m.hinges ?? []).filter((h) => h.node !== id);
            m.loads = m.loads.filter((l) => !('node' in l) || l.node !== id);
          } else if (sbar) {
            m.bars = m.bars.filter((b) => b.id !== sbar.orig);
            m.loads = m.loads.filter((l) => !('bar' in l) || l.bar !== sbar.orig);
          }
          m.loads = m.loads.filter((l) => !('bar' in l) || m.bars.some((b) => b.id === l.bar));
          return;
        }
      }
    });
  };

  const exportJson = async () => {
    const n = await guardarJson({ version: 1, tipo: 'esfuerzos', unidades: unidadesId, ...model }, 'estructura.json');
    if (n) setAviso(`Guardado como ${n}.`);
  };
  const importJson = (f: File) => {
    f.text().then((t) => {
      try {
        const j = JSON.parse(t);
        if (!Array.isArray(j.nodes) || !Array.isArray(j.bars)) throw new Error('sin nodos o barras');
        setModel({ nodes: j.nodes, bars: j.bars, supports: j.supports ?? [], hinges: j.hinges ?? [], loads: j.loads ?? [] });
        setHighlight(null);
        if (j.unidades) setUnidadesId(j.unidades);
      } catch {
        alert('El archivo no es un .json de estructura válido.');
      }
    });
  };

  const { st, sol, steps, error } = result;
  const status = sol?.classification.status;
  const resuelto = sol && status === 'isostatico';
  const isFrame = model.nodes.some((n) => n.y !== model.nodes[0].y);

  return (
    <div className="app">
      <header className="cabecera">
        <div className="titulo">
          {onHome && <span className="nav-sup"><button className="volver" onClick={onHome}>← Inicio</button> <a className="volver enlace" href="#ayuda">Cómo usar</a></span>}
          <h1>Esfuerzos característicos</h1>
          <p>Vigas y pórticos isostáticos según el método de la cátedra Estática 67.02, ITBA</p>
        </div>
        <div className="acciones">
          <label>
            Ejemplo
            <select
              value=""
              onChange={(e) => {
                const ex = EXAMPLES.find((x) => x.id === e.target.value);
                if (ex) {
                  setModel(structuredClone(ex.model));
                  setUnidadesId(ex.unidades);
                  setHighlight(null);
                }
              }}
            >
              <option value="">Cargar un ejemplo…</option>
              {EXAMPLES.map((x) => (
                <option key={x.id} value={x.id}>{x.nombre}</option>
              ))}
            </select>
          </label>
          <label>
            Unidades
            <select value={unidadesId} onChange={(e) => {
              const to = e.target.value;
              setModel((m) => convertModel(m, unidadesId, to));
              setAviso(`Valores convertidos de ${UNIT_SYSTEMS.find((u) => u.id === unidadesId)?.nombre} a ${UNIT_SYSTEMS.find((u) => u.id === to)?.nombre}.`);
              setUnidadesId(to);
            }}>
              {UNIT_SYSTEMS.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </label>
          <button onClick={() => setModel({ nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 4, y: 0 }], bars: [{ id: 'AB', from: 'A', to: 'B' }], supports: [], hinges: [], loads: [] })}>Nuevo</button>
          <button onClick={() => fileRef.current?.click()}>Abrir .json</button>
          <button onClick={() => setIa((v) => !v)} aria-expanded={ia}>Desde foto (IA)</button>
          <button onClick={exportJson}>Guardar .json</button>
          <button onClick={() => imprimirInforme(setTodo)} title="Abre el diálogo de impresión: elegí «Guardar como PDF»">Informe PDF</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            // Permite volver a abrir el mismo archivo: sin esto el navegador no avisa el cambio.
            e.target.value = '';
          }} />
        </div>
      </header>

      {ia && <PanelIA tipo="esfuerzos" onPropuesta={aplicarIA} onCerrar={() => setIa(false)} />}
      {previo && aviso?.startsWith('Estructura propuesta') && (
        <p className="aviso" role="status">
          {aviso}{' '}
          <button onClick={() => { setModel(previo.model); setUnidadesId(previo.unidades); setPrevio(null); setAviso(null); }}>Deshacer</button>{' '}
          <button onClick={() => { setPrevio(null); setAviso(null); }}>Aceptar</button>
        </p>
      )}
      <nav className="pestanas" aria-label="Secciones">
        {(['editor', 'dibujo', 'pasos'] as const).map((t) => (
          <button key={t} className={tab === t ? 'activa' : ''} onClick={() => setTab(t)}>
            {t === 'editor' ? 'Datos' : t === 'dibujo' ? 'Diagramas' : 'Paso a paso'}
          </button>
        ))}
      </nav>

      <main className="trabajo" data-tab={tab}>
        {/* ---------- Editor ---------- */}
        <section className="panel editor" aria-label="Datos de la estructura">
          <h2>Nodos</h2>
          <table>
            <thead>
              <tr><th>Nodo</th><th>x [{units.longitud}]</th><th>y [{units.longitud}]</th><th title="Articulación interna">Art.</th><th /></tr>
            </thead>
            <tbody>
              {model.nodes.map((n, i) => (
                <tr key={i}>
                  <td><input aria-label="Nombre del nodo" style={{ width: 40 }} value={n.id} onChange={(e) => set((m) => {
                    const old = m.nodes[i].id;
                    const nu = e.target.value.trim() || old;
                    m.nodes[i].id = nu;
                    m.bars.forEach((b) => { if (b.from === old) b.from = nu; if (b.to === old) b.to = nu; });
                    m.supports.forEach((s) => { if (s.node === old) s.node = nu; });
                    (m.hinges ?? []).forEach((h) => { if (h.node === old) h.node = nu; });
                    m.loads.forEach((l) => { if ('node' in l && l.node === old) l.node = nu; });
                  })} /></td>
                  <td><NumIn label={`x de ${n.id}`} value={n.x} onChange={(v) => set((m) => { m.nodes[i].x = v; })} /></td>
                  <td><NumIn label={`y de ${n.id}`} value={n.y} onChange={(v) => set((m) => { m.nodes[i].y = v; })} /></td>
                  <td><input type="checkbox" aria-label={`Articulación en ${n.id}`} checked={(model.hinges ?? []).some((h) => h.node === n.id)} onChange={(e) => set((m) => {
                    m.hinges = (m.hinges ?? []).filter((h) => h.node !== n.id);
                    if (e.target.checked) m.hinges.push({ node: n.id });
                  })} /></td>
                  <td><button className="quitar" aria-label={`Quitar nodo ${n.id}`} onClick={() => set((m) => {
                    m.nodes.splice(i, 1);
                    m.bars = m.bars.filter((b) => b.from !== n.id && b.to !== n.id);
                    m.supports = m.supports.filter((s) => s.node !== n.id);
                    m.loads = m.loads.filter((l) => !('node' in l) || l.node !== n.id);
                  })}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="agregar" onClick={() => set((m) => { const last = m.nodes[m.nodes.length - 1]; m.nodes.push({ id: nextNode(), x: (last?.x ?? 0) + 2, y: last?.y ?? 0 }); })}>Agregar nodo</button>

          <h2>Barras</h2>
          <table>
            <thead><tr><th>Barra</th><th>Desde</th><th>Hasta</th><th title="Invertir el sentido de recorrido">Invertir</th><th /></tr></thead>
            <tbody>
              {model.bars.map((b, i) => (
                <tr key={i}>
                  <td><input aria-label="Nombre de la barra" style={{ width: 48 }} value={b.id} onChange={(e) => set((m) => {
                    const old = m.bars[i].id; const nu = e.target.value.trim() || old;
                    m.bars[i].id = nu; m.loads.forEach((l) => { if ('bar' in l && l.bar === old) l.bar = nu; });
                  })} /></td>
                  <td><select aria-label="Nodo inicial" value={b.from} onChange={(e) => set((m) => { m.bars[i].from = e.target.value; })}>{nodeIds.map((id) => <option key={id}>{id}</option>)}</select></td>
                  <td><select aria-label="Nodo final" value={b.to} onChange={(e) => set((m) => { m.bars[i].to = e.target.value; })}>{nodeIds.map((id) => <option key={id}>{id}</option>)}</select></td>
                  <td><input type="checkbox" aria-label="Invertir sentido" checked={!!b.reverse} onChange={(e) => set((m) => { m.bars[i].reverse = e.target.checked; })} /></td>
                  <td><button className="quitar" aria-label={`Quitar barra ${b.id}`} onClick={() => set((m) => { m.bars.splice(i, 1); m.loads = m.loads.filter((l) => !('bar' in l) || l.bar !== b.id); })}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="agregar" onClick={() => set((m) => { const a = m.nodes[0]?.id, z = m.nodes[m.nodes.length - 1]?.id; if (a && z) m.bars.push({ id: `${a}${z}${m.bars.length ? m.bars.length : ''}`, from: a, to: z }); })}>Agregar barra</button>

          <h2>Vínculos</h2>
          <table>
            <thead><tr><th>Nodo</th><th>Tipo</th><th title="Móvil: ángulo del plano de apoyo. Biela: ángulo del eje.">Ángulo [°]</th><th /></tr></thead>
            <tbody>
              {model.supports.map((s, i) => (
                <tr key={i}>
                  <td><select aria-label="Nodo del vínculo" value={s.node} onChange={(e) => set((m) => { m.supports[i].node = e.target.value; })}>{nodeIds.map((id) => <option key={id}>{id}</option>)}</select></td>
                  <td><select aria-label="Tipo de vínculo" value={s.type} onChange={(e) => set((m) => { m.supports[i].type = e.target.value as SupportType; })}>
                    <option value="movil">Apoyo móvil</option><option value="fijo">Apoyo fijo</option><option value="empotramiento">Empotramiento</option><option value="biela">Biela</option>
                  </select></td>
                  <td>{s.type === 'movil' || s.type === 'biela' ? <NumIn label="Ángulo del vínculo" width={52} value={s.angle ?? (s.type === 'biela' ? 90 : 0)} onChange={(v) => set((m) => { m.supports[i].angle = v; })} /> : null}</td>
                  <td><button className="quitar" aria-label="Quitar vínculo" onClick={() => set((m) => { m.supports.splice(i, 1); })}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="agregar" onClick={() => set((m) => { m.supports.push({ node: nodeIds[0], type: 'movil' }); })}>Agregar vínculo</button>

          <h2>Cargas</h2>
          <div className="cargas">
            {model.loads.map((l, i) => <LoadRow key={i} l={l} nodeIds={nodeIds} barIds={barIds} units={units} onChange={(nl) => set((m) => { m.loads[i] = nl; })} onRemove={() => set((m) => { m.loads.splice(i, 1); })} />)}
          </div>
          <div className="agregar-cargas">
            <button className="agregar" onClick={() => set((m) => { m.loads.push({ type: 'puntual', node: nodeIds[0], value: 10, angle: -90 }); })}>Puntual</button>
            <button className="agregar" onClick={() => set((m) => { m.loads.push({ type: 'cupla', node: nodeIds[0], value: 10 }); })}>Cupla</button>
            <button className="agregar" onClick={() => set((m) => { m.loads.push({ type: 'distribuida', bar: barIds[0], from: 0, to: 1, q1: 5, q2: 5 }); })}>Distribuida</button>
          </div>
          <p className="ayuda">Ángulos medidos desde el eje x, antihorario positivo (−90° = hacia abajo). Las cuplas son positivas en sentido antihorario. Las distribuidas son por unidad de longitud real de la barra.</p>
        </section>

        {/* ---------- Dibujo y diagramas ---------- */}
        <section className="panel dibujo" aria-label="Estructura y diagramas">
          <div className={`estado ${resuelto ? 'ok' : 'mal'}`} role="status">
            {error
              ? `No se puede resolver: ${error}`
              : status === 'isostatico'
                ? `Isostático e invariable: ${sol!.classification.chapas} chapa${sol!.classification.chapas > 1 ? 's' : ''}, ${sol!.classification.restricciones} condiciones de vínculo. Las reacciones se dibujan con su sentido real (DCE).`
                : sol?.classification.motivo}
          </div>
          {st && (
            <figure>
              <div className="fig-cabecera">
                <figcaption>Estructura {resuelto && dce ? 'y reacciones (DCE)' : '(DCL)'}</figcaption>
                <PngBtn nombre="estructura" />
                {resuelto && <label className="interruptor"><input type="checkbox" checked={dce} onChange={(e) => setDce(e.target.checked)} /> Mostrar reacciones</label>}
              </div>
              <Herramientas tool={tool} setTool={(t) => { setTool(t); setPending(null); }} grid={grid} setGrid={setGrid} unidad={units.longitud} />
              {aviso && <p className="aviso" role="status">{aviso} <button className="quitar" aria-label="Cerrar aviso" onClick={() => setAviso(null)}>×</button></p>}
              <Drawing st={st} sol={sol} mode="estructura" showReactions={dce && !tool} highlight={highlight} onPick={setHighlight} unidades={units} hover={hover} onHover={setHover} tool={tool} grid={grid} onEdit={onEdit} pending={pending} />
            </figure>
          )}
          {resuelto && (
            <p className="lectura" aria-live="polite">
              {(() => {
                const r = hover && sol!.bars.find((b) => b.bar.id === hover.bar);
                if (!r || !hover) return 'Pasá el mouse sobre una barra para ver N, Q y Mf en esa sección.';
                const L = units.longitud;
                return (
                  <>
                    Tramo {r.bar.from}{r.bar.to}, a {fmt(hover.x)} {L} de {r.bar.from}: <b>N = {fmt(r.N.eval(hover.x))}</b> {units.fuerza} · <b>Q = {fmt(r.Q.eval(hover.x))}</b> {units.fuerza} · <b>Mf = {fmt(r.M.eval(hover.x))}</b> {units.fuerza}·{L}
                  </>
                );
              })()}
            </p>
          )}
          {resuelto && st && (['N', 'Q', 'M'] as const).map((k) => (
            <figure key={k}>
              <div className="fig-cabecera">
                <figcaption>{k === 'N' ? 'Esfuerzo normal N' : k === 'Q' ? 'Esfuerzo de corte Q' : 'Momento flector Mf'}</figcaption>
                <PngBtn nombre={`diagrama-${k === 'M' ? 'Mf' : k}`} />
              </div>
              <Drawing st={st} sol={sol} mode={k} highlight={highlight} onPick={(b) => { setHighlight(b); }} unidades={units} hover={hover} onHover={setHover} />
            </figure>
          ))}
          {resuelto && (
            <table className="resumen">
              <thead><tr><th>Reacción</th><th>Valor</th></tr></thead>
              <tbody>
                {sol!.unknowns.map((u, j) => u.source === 'vinculo' && (
                  <tr key={j}><td><Math_ text={u.name} /></td><td>{fmt(sol!.values[j])} {u.kind === 'momento' ? `${units.fuerza}·${units.longitud}` : units.fuerza}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ---------- Paso a paso ---------- */}
        <section className="panel pasos" aria-label="Desarrollo paso a paso">
          <h2>Paso a paso</h2>
          {steps.length === 0 && <p className="ayuda">Completá la estructura para ver el desarrollo.</p>}
          {steps.map((s) => (
            <details key={s.id} open={todo || !!open[s.id] || (!!s.bar && s.bar === highlight)} onToggle={(e) => {
              const isOpen = (e.target as HTMLDetailsElement).open;
              setOpen((o) => ({ ...o, [s.id]: isOpen }));
              if (isOpen && s.bar) setHighlight(s.bar);
            }} className={s.bar && s.bar === highlight ? 'paso hl' : 'paso'}>
              <summary>{s.titulo}</summary>
              {s.blocks.map((b, i) => <BlockView key={i} b={b} />)}
            </details>
          ))}
        </section>
      </main>
    </div>
  );
}

export function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'p': return <p><Math_ text={b.text} /></p>;
    case 'eq': return <p className="ecuacion"><Math_ text={b.text} /></p>;
    case 'ok': return <p className="control ok"><span aria-hidden>✓</span> <Math_ text={b.text} /></p>;
    case 'warn': return <p className="control mal"><span aria-hidden>!</span> <Math_ text={b.text} /></p>;
    case 'nudo': return <NudoDiagram node={b.node} elems={b.elems} />;
    case 'list': return <ul>{b.items.map((t, i) => <li key={i}><Math_ text={t} /></li>)}</ul>;
    case 'table':
      return (
        <div className="tabla-scroll">
          <table>
            <thead><tr>{b.head.map((h, i) => <th key={i}><Math_ text={h} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Math_ text={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
  }
}

function LoadRow({ l, nodeIds, barIds, units, onChange, onRemove }: { l: LoadDef; nodeIds: string[]; barIds: string[]; units: { fuerza: string; longitud: string }; onChange: (l: LoadDef) => void; onRemove: () => void }) {
  const where = l.type !== 'distribuida' ? (
    <>
      <select aria-label="Ubicación" value={l.bar !== undefined ? 'barra' : 'nodo'} onChange={(e) => onChange(e.target.value === 'barra' ? { ...l, node: undefined, bar: barIds[0], at: 0 } : { ...l, bar: undefined, at: undefined, node: nodeIds[0] })}>
        <option value="nodo">en nodo</option><option value="barra">en barra</option>
      </select>
      {l.bar !== undefined ? (
        <>
          <select aria-label="Barra" value={l.bar} onChange={(e) => onChange({ ...l, bar: e.target.value })}>{barIds.map((b) => <option key={b}>{b}</option>)}</select>
          <span>a</span><NumIn label="Distancia desde el nodo inicial" width={48} value={l.at ?? 0} onChange={(v) => onChange({ ...l, at: v })} /><span>{units.longitud}</span>
        </>
      ) : (
        <select aria-label="Nodo" value={l.node} onChange={(e) => onChange({ ...l, node: e.target.value })}>{nodeIds.map((n) => <option key={n}>{n}</option>)}</select>
      )}
    </>
  ) : null;
  return (
    <div className="carga">
      <strong>{l.type === 'puntual' ? 'Puntual' : l.type === 'cupla' ? 'Cupla' : 'Distribuida'}</strong>
      {l.type === 'puntual' && (
        <>
          {where}
          <NumIn label="Módulo" width={56} value={l.value} onChange={(v) => onChange({ ...l, value: v })} /><span>{units.fuerza}</span>
          <span>a</span><NumIn label="Ángulo" width={48} value={l.angle} onChange={(v) => onChange({ ...l, angle: v })} /><span>°</span>
        </>
      )}
      {l.type === 'cupla' && (
        <>
          {where}
          <NumIn label="Momento" width={56} value={l.value} onChange={(v) => onChange({ ...l, value: v })} /><span>{units.fuerza}·{units.longitud}</span>
        </>
      )}
      {l.type === 'distribuida' && (
        <>
          <select aria-label="Barra" value={l.bar} onChange={(e) => onChange({ ...l, bar: e.target.value })}>{barIds.map((b) => <option key={b}>{b}</option>)}</select>
          <span>de</span><NumIn label="Desde" width={44} value={l.from} onChange={(v) => onChange({ ...l, from: v })} />
          <span>a</span><NumIn label="Hasta" width={44} value={l.to} onChange={(v) => onChange({ ...l, to: v })} /><span>{units.longitud}</span>
          <span>q</span><NumIn label="q inicial" width={44} value={l.q1} onChange={(v) => onChange({ ...l, q1: v })} />
          <span>→</span><NumIn label="q final" width={44} value={l.q2} onChange={(v) => onChange({ ...l, q2: v })} /><span>{units.fuerza}/{units.longitud}</span>
          <span>a</span><NumIn label="Ángulo" width={44} value={l.angle ?? -90} onChange={(v) => onChange({ ...l, angle: v })} /><span>°</span>
        </>
      )}
      <button className="quitar" aria-label="Quitar carga" onClick={onRemove}>×</button>
    </div>
  );
}

type Tool = 'nodo' | 'barra' | 'movil' | 'fijo' | 'empotramiento' | 'articulacion' | 'puntual' | 'cupla' | 'distribuida' | 'borrar';

const TOOLS: { id: Tool; nombre: string; ayuda: string }[] = [
  { id: 'nodo', nombre: 'Nodo', ayuda: 'Clic en la grilla para crear un nodo; si cae sobre una barra, la divide.' },
  { id: 'barra', nombre: 'Barra', ayuda: 'Clic en el inicio y clic en el fin; sigue desde el último punto. Esc termina.' },
  { id: 'movil', nombre: 'Apoyo móvil', ayuda: 'Clic en un nodo o sobre una barra.' },
  { id: 'fijo', nombre: 'Apoyo fijo', ayuda: 'Clic en un nodo o sobre una barra.' },
  { id: 'empotramiento', nombre: 'Empotramiento', ayuda: 'Clic en el extremo de una barra.' },
  { id: 'articulacion', nombre: 'Articulación', ayuda: 'Clic en un nodo para ponerla o quitarla.' },
  { id: 'puntual', nombre: 'Carga puntual', ayuda: 'Clic en un nodo o sobre una barra; después editá el valor.' },
  { id: 'cupla', nombre: 'Cupla', ayuda: 'Clic en un nodo o sobre una barra; después editá el valor.' },
  { id: 'distribuida', nombre: 'Distribuida', ayuda: 'Clic sobre un tramo de barra; después editá q.' },
  { id: 'borrar', nombre: 'Borrar', ayuda: 'Clic en un nodo (borra sus barras y cargas) o en una barra.' },
];

function Herramientas({ tool, setTool, grid, setGrid, unidad }: { tool: Tool | null; setTool: (t: Tool | null) => void; grid: number; setGrid: (g: number) => void; unidad: string }) {
  const actual = TOOLS.find((t) => t.id === tool);
  return (
    <div className="herramientas">
      <div className="herr-botones" role="toolbar" aria-label="Editor gráfico">
        <button className={!tool ? 'activa' : ''} onClick={() => setTool(null)} aria-pressed={!tool}>Ver</button>
        {TOOLS.map((t) => (
          <button key={t.id} className={tool === t.id ? 'activa' : ''} aria-pressed={tool === t.id} onClick={() => setTool(tool === t.id ? null : t.id)}>
            {t.nombre}
          </button>
        ))}
        <label className="herr-grilla">
          Grilla
          <NumIn label="Paso de la grilla" width={58} value={grid} onChange={(v) => v > 0 && setGrid(v)} />
          {unidad}
        </label>
      </div>
      {actual && <p className="ayuda">{actual.ayuda}</p>}
    </div>
  );
}

/** Quita referencias huérfanas: barras sin nodos, vínculos, articulaciones y cargas sin nodo o barra. */
export function limpiar(m: Model): Model {
  const ns = new Set(m.nodes.map((n) => n.id));
  m.bars = m.bars.filter((b) => ns.has(b.from) && ns.has(b.to) && b.from !== b.to);
  const bs = new Set(m.bars.map((b) => b.id));
  m.supports = m.supports.filter((x) => ns.has(x.node));
  m.hinges = (m.hinges ?? []).filter((h) => ns.has(h.node));
  m.loads = m.loads.filter((l) => (l.type === 'distribuida' ? bs.has(l.bar) : l.bar !== undefined ? bs.has(l.bar) : l.node !== undefined && ns.has(l.node)));
  return m;
}

/** Botón que exporta a PNG el dibujo de la figura que lo contiene. */
export function PngBtn({ nombre }: { nombre: string }) {
  return (
    <button
      className="png"
      title="Descargar como imagen PNG"
      onClick={(e) => {
        const svg = e.currentTarget.closest('figure')?.querySelector('svg.lamina') as SVGSVGElement | null;
        if (svg) svgToPng(svg, nombre);
      }}
    >
      PNG
    </button>
  );
}

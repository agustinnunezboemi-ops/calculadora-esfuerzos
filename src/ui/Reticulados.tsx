import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Model, Vec, vec, add, scale, sub, norm, dot, dirDeg } from '../engine/model.ts';
import { solveTruss, sectionMethod, TrussSolution, TrussError } from '../engine/truss.ts';
import { buildTrussSteps, buildSectionSteps, estado } from '../engine/trussSteps.ts';
import { Step, fmt } from '../engine/steps.ts';
import { Structure } from '../engine/normalize.ts';
import { BlockView, NumIn, limpiar, PngBtn } from './App.tsx';
import { Arrow, Support } from './Drawing.tsx';
import { UNIT_SYSTEMS, convertModel } from './examples.ts';
import { guardarJson } from './guardar.ts';
import { imprimirInforme } from './exportar.ts';
import { PanelIA } from './PanelIA.tsx';
import { NodoEnRecta } from './NodoEnRecta.tsx';
import { alinearNodos } from '../engine/geometria.ts';
import tp5_1h from '../../tests/casos/tp5-1h.json';
import type { Propuesta } from '../ai/gemini.ts';

import tp5_1i from '../../tests/casos/tp5-1i.json';

const STORAGE = 'calculadora-reticulados:v1';
const bars = (...ids: string[]) => ids.map((id) => ({ id, from: id[0], to: id[1] }));
const P = (node: string, value: number, angle = -90) => ({ type: 'puntual' as const, node, value, angle });

const EJEMPLOS: { id: string; nombre: string; unidades: string; model: Model }[] = [
  {
    id: 'tp5-resuelto',
    nombre: 'TP N°5 · ejercicio resuelto (nodos)',
    unidades: 'lb-ft',
    model: {
      nodes: [{ id: 'A', x: 0, y: 8 }, { id: 'B', x: 12, y: 8 }, { id: 'C', x: 24, y: 8 }, { id: 'D', x: 6, y: 0 }, { id: 'E', x: 18, y: 0 }],
      bars: bars('AB', 'BC', 'AD', 'DB', 'DE', 'BE', 'EC'),
      supports: [{ node: 'C', type: 'fijo' }, { node: 'E', type: 'movil' }],
      loads: [P('A', 2000), P('B', 1000)],
    },
  },
  {
    id: 'tp5-1a',
    nombre: 'TP N°5 · 1a',
    unidades: 'kN-m',
    model: {
      nodes: [{ id: 'A', x: 3, y: 5.25 }, { id: 'B', x: 0, y: 4 }, { id: 'C', x: 3, y: 0 }],
      bars: bars('AB', 'AC', 'BC'),
      supports: [{ node: 'A', type: 'fijo' }, { node: 'C', type: 'movil', angle: 90 }],
      loads: [P('B', 84)],
    },
  },
  {
    id: 'tp5-1b',
    nombre: 'TP N°5 · 1b',
    unidades: 'lb-ft',
    model: {
      nodes: [{ id: 'A', x: 12, y: 9 }, { id: 'B', x: 0, y: 0 }, { id: 'C', x: 15.75, y: 0 }],
      bars: bars('AB', 'AC', 'BC'),
      supports: [{ node: 'B', type: 'fijo' }, { node: 'C', type: 'movil' }],
      loads: [P('A', 945)],
    },
  },
  {
    id: 'tp5-1c',
    nombre: 'TP N°5 · 1c',
    unidades: 'kip-ft',
    model: {
      nodes: [{ id: 'A', x: 0, y: 6.4 }, { id: 'B', x: 12, y: 6.4 }, { id: 'C', x: 24, y: 6.4 }, { id: 'D', x: 0, y: 0 }, { id: 'E', x: 12, y: 0 }, { id: 'F', x: 24, y: 0 }],
      bars: bars('AB', 'BC', 'AD', 'BD', 'BE', 'BF', 'CF', 'DE', 'EF'),
      supports: [{ node: 'D', type: 'movil' }, { node: 'F', type: 'fijo' }],
      loads: [P('A', 1), P('B', 4), P('C', 1), P('E', 2.4)],
    },
  },
  {
    id: 'tp5-1h',
    nombre: 'TP N°5 · 1h (cuerdas oblicuas)',
    unidades: 'kN-m',
    model: alinearNodos({ nodes: tp5_1h.nodes, bars: tp5_1h.bars, supports: tp5_1h.supports as Model['supports'], hinges: [], loads: tp5_1h.loads as Model['loads'] }).model,
  },
  {
    id: 'tp5-1i',
    nombre: 'TP N°5 · 1i (cercha simétrica)',
    unidades: (tp5_1i as { unidades?: string }).unidades ?? 'lb-ft',
    model: { nodes: tp5_1i.nodes, bars: tp5_1i.bars, supports: tp5_1i.supports as Model['supports'], hinges: [], loads: tp5_1i.loads as Model['loads'] },
  },
];

type Tool = 'nodo' | 'barra' | 'fijo' | 'movil' | 'carga' | 'borrar' | 'cortar';
const TOOLS: { id: Tool; nombre: string; ayuda: string }[] = [
  { id: 'nodo', nombre: 'Nodo', ayuda: 'Clic en la grilla para crear un nodo.' },
  { id: 'barra', nombre: 'Barra', ayuda: 'Clic en dos nodos (o puntos de la grilla); sigue desde el último. Esc termina.' },
  { id: 'fijo', nombre: 'Apoyo fijo', ayuda: 'Clic en un nodo.' },
  { id: 'movil', nombre: 'Apoyo móvil', ayuda: 'Clic en un nodo; el ángulo del plano se edita en la tabla.' },
  { id: 'carga', nombre: 'Carga', ayuda: 'Clic en un nodo; después editá el valor y la dirección.' },
  { id: 'borrar', nombre: 'Borrar', ayuda: 'Clic en un nodo (borra sus barras y cargas) o en una barra.' },
  { id: 'cortar', nombre: 'Cortar (secciones)', ayuda: 'Elegí 2 o 3 barras que separen el reticulado en dos partes.' },
];

function load(): { model: Model; unidades: string } {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return JSON.parse(raw);
  } catch {
    /* sin almacenamiento */
  }
  return { model: structuredClone(EJEMPLOS[0].model), unidades: EJEMPLOS[0].unidades };
}

export function Reticulados({ onHome }: { onHome: () => void }) {
  const init = useMemo(load, []);
  const [model, setModel] = useState<Model>(init.model);
  const [unidadesId, setUnidadesId] = useState(init.unidades);
  const [tool, setTool] = useState<Tool | null>(null);
  const [grid, setGrid] = useState(1);
  const [pending, setPending] = useState<string | null>(null);
  const [corte, setCorte] = useState<string[]>([]);
  const [todo, setTodo] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ rigidez: true });
  const [tab, setTab] = useState<'editor' | 'dibujo' | 'pasos'>('dibujo');
  const [aviso, setAviso] = useState<string | null>(null);
  const [ia, setIa] = useState(false);
  const [previo, setPrevio] = useState<{ model: Model; unidades: string } | null>(null);
  const aplicarIA = (p: Propuesta) => {
    setPrevio({ model, unidades: unidadesId });
    setModel(p.model);
    if (p.unidades) setUnidadesId(p.unidades);
    setCorte([]);
    setIa(false);
    setAviso(`Estructura propuesta por la IA: revisá nodos, vínculos y cargas antes de usar los resultados.${p.notas.length ? ' Notas: ' + p.notas.join(' ') : ''}`);
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const units = UNIT_SYSTEMS.find((u) => u.id === unidadesId) ?? UNIT_SYSTEMS[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ model, unidades: unidadesId }));
    } catch {
      /* ignorado */
    }
  }, [model, unidadesId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') pending ? setPending(null) : setTool(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  const res = useMemo(() => {
    try {
      const sol = solveTruss(model);
      const steps: Step[] = buildTrussSteps(sol, units);
      const validCut = corte.filter((c) => sol.bars.some((b) => b.id === c));
      if (sol.status === 'isostatico' && validCut.length >= 2) steps.push(buildSectionSteps(sol, sectionMethod(sol, validCut), units));
      return { sol, steps, error: null as string | null };
    } catch (e) {
      return { sol: null, steps: [] as Step[], error: e instanceof TrussError ? e.message : (e as Error).message };
    }
  }, [model, units, corte]);
  const { sol, steps, error } = res;

  const set = (fn: (m: Model) => void) =>
    setModel((m) => {
      const c = structuredClone(m);
      fn(c);
      return limpiar(c);
    });
  const nodeIds = model.nodes.map((n) => n.id);
  const newId = (m: Model) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !m.nodes.some((n) => n.id === l)) ?? `N${m.nodes.length + 1}`;

  const onEdit = (p: Vec, node: string | null, barIdx: number | null) => {
    if (tool === 'cortar') {
      if (barIdx === null || !sol) return;
      const id = sol.bars[barIdx].id;
      setCorte((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-3)));
      setOpen((o) => ({ ...o, secciones: true }));
      return;
    }
    set((m) => {
      const nodeAt = (q: Vec) => {
        const ex = m.nodes.find((n) => Math.abs(n.x - q.x) < 1e-6 && Math.abs(n.y - q.y) < 1e-6);
        if (ex) return ex.id;
        const id = newId(m);
        m.nodes.push({ id, x: +q.x.toFixed(6), y: +q.y.toFixed(6) });
        return id;
      };
      switch (tool) {
        case 'nodo':
          nodeAt(p);
          return;
        case 'barra': {
          const id = node ?? nodeAt(p);
          if (!pending) return void setPending(id);
          if (id === pending) return void setPending(null);
          if (!m.bars.some((b) => (b.from === pending && b.to === id) || (b.from === id && b.to === pending))) m.bars.push({ id: `${pending}${id}`, from: pending, to: id });
          setPending(id);
          return;
        }
        case 'fijo':
        case 'movil': {
          if (!node) return void setAviso('Hacé clic sobre un nodo.');
          m.supports = m.supports.filter((s) => s.node !== node);
          m.supports.push({ node, type: tool });
          return;
        }
        case 'carga': {
          if (!node) return void setAviso('En un reticulado las cargas van en los nodos: hacé clic sobre un nodo.');
          m.loads.push(P(node, 10));
          setAviso('Carga agregada: editá su valor y dirección en la tabla de cargas.');
          return;
        }
        case 'borrar': {
          if (node) {
            m.nodes = m.nodes.filter((n) => n.id !== node);
            m.bars = m.bars.filter((b) => b.from !== node && b.to !== node);
            m.supports = m.supports.filter((s) => s.node !== node);
            m.loads = m.loads.filter((l) => !('node' in l) || l.node !== node);
          } else if (barIdx !== null) m.bars.splice(barIdx, 1);
          return;
        }
      }
    });
  };

  const exportJson = async () => {
    const n = await guardarJson({ version: 1, tipo: 'reticulado', unidades: unidadesId, ...model }, 'reticulado.json');
    if (n) setAviso(`Guardado como ${n}.`);
  };
  const importJson = (f: File) =>
    f.text().then((t) => {
      try {
        const j = JSON.parse(t);
        if (!Array.isArray(j.nodes) || !Array.isArray(j.bars)) throw new Error();
        setModel({ nodes: j.nodes, bars: j.bars, supports: j.supports ?? [], hinges: [], loads: j.loads ?? [] });
        if (j.unidades) setUnidadesId(j.unidades);
        setCorte([]);
      } catch {
        setAviso('El archivo no es un .json de reticulado válido.');
      }
    });

  const ok = sol?.status === 'isostatico';
  const actual = TOOLS.find((t) => t.id === tool);

  return (
    <div className="app">
      <header className="cabecera">
        <div className="titulo">
          <span className="nav-sup"><button className="volver" onClick={onHome}>← Inicio</button> <a className="volver enlace" href="#ayuda">Cómo usar</a></span>
          <h1>Reticulados</h1>
          <p>Fuerza en cada barra por los métodos de los nodos y de las secciones, como en el TP N°5</p>
        </div>
        <div className="acciones">
          <label>
            Ejemplo
            <select value="" onChange={(e) => {
              const ex = EJEMPLOS.find((x) => x.id === e.target.value);
              if (ex) { setModel(structuredClone(ex.model)); setUnidadesId(ex.unidades); setCorte([]); }
            }}>
              <option value="">Cargar un ejemplo…</option>
              {EJEMPLOS.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </label>
          <label>
            Unidades
            <select value={unidadesId} onChange={(e) => { const to = e.target.value; setModel((m) => convertModel(m, unidadesId, to)); setUnidadesId(to); }}>
              {UNIT_SYSTEMS.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
          <button onClick={() => { setModel({ nodes: [], bars: [], supports: [], hinges: [], loads: [] }); setCorte([]); setTool('nodo'); }}>Nuevo</button>
          <button onClick={() => fileRef.current?.click()}>Abrir .json</button>
          <button onClick={() => setIa((v) => !v)} aria-expanded={ia}>Desde foto (IA)</button>
          <button onClick={exportJson}>Guardar .json</button>
          <button onClick={() => imprimirInforme(setTodo)} title="Abre el diálogo de impresión: elegí «Guardar como PDF»">Informe PDF</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
        </div>
      </header>

      {ia && <PanelIA tipo="reticulado" onPropuesta={aplicarIA} onCerrar={() => setIa(false)} />}
      {previo && aviso?.startsWith('Estructura propuesta') && (
        <p className="aviso" role="status">
          {aviso}{' '}
          <button onClick={() => { setModel(previo.model); setUnidadesId(previo.unidades); setPrevio(null); setAviso(null); }}>Deshacer</button>{' '}
          <button onClick={() => { setPrevio(null); setAviso(null); }}>Aceptar</button>
        </p>
      )}
      <nav className="pestanas" aria-label="Secciones">
        {(['editor', 'dibujo', 'pasos'] as const).map((t) => (
          <button key={t} className={tab === t ? 'activa' : ''} onClick={() => setTab(t)}>{t === 'editor' ? 'Datos' : t === 'dibujo' ? 'Reticulado' : 'Paso a paso'}</button>
        ))}
      </nav>

      <main className="trabajo" data-tab={tab}>
        <section className="panel editor" aria-label="Datos del reticulado">
          <h2>Nodos</h2>
          <table>
            <thead><tr><th>Nodo</th><th>x [{units.longitud}]</th><th>y [{units.longitud}]</th><th /></tr></thead>
            <tbody>
              {model.nodes.map((n, i) => (
                <tr key={i}>
                  <td><input aria-label="Nombre del nodo" style={{ width: 40 }} value={n.id} onChange={(e) => set((m) => {
                    const old = m.nodes[i].id; const nu = e.target.value.trim() || old;
                    m.nodes[i].id = nu;
                    m.bars.forEach((b) => { if (b.from === old) b.from = nu; if (b.to === old) b.to = nu; });
                    m.supports.forEach((s) => { if (s.node === old) s.node = nu; });
                    m.loads.forEach((l) => { if ('node' in l && l.node === old) l.node = nu; });
                  })} /></td>
                  <td><NumIn label={`x de ${n.id}`} value={n.x} onChange={(v) => set((m) => { m.nodes[i].x = v; })} /></td>
                  <td><NumIn label={`y de ${n.id}`} value={n.y} onChange={(v) => set((m) => { m.nodes[i].y = v; })} /></td>
                  <td><button className="quitar" aria-label={`Quitar nodo ${n.id}`} onClick={() => onEditDelete(n.id)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="agregar" onClick={() => set((m) => { const l = m.nodes[m.nodes.length - 1]; m.nodes.push({ id: newId(m), x: (l?.x ?? 0) + 2, y: l?.y ?? 0 }); })}>Agregar nodo</button>
          <NodoEnRecta model={model} unidad={units.longitud} onModel={(m) => setModel(limpiar(m))} onAviso={setAviso} />

          <h2>Barras</h2>
          <table>
            <thead><tr><th>Desde</th><th>Hasta</th><th>Fuerza</th><th /></tr></thead>
            <tbody>
              {model.bars.map((b, i) => (
                <tr key={i}>
                  <td><select aria-label="Nodo inicial" value={b.from} onChange={(e) => set((m) => { m.bars[i].from = e.target.value; })}>{nodeIds.map((id) => <option key={id}>{id}</option>)}</select></td>
                  <td><select aria-label="Nodo final" value={b.to} onChange={(e) => set((m) => { m.bars[i].to = e.target.value; })}>{nodeIds.map((id) => <option key={id}>{id}</option>)}</select></td>
                  <td className="fuerza-celda">{ok && sol ? `${fmt(sol.forces[sol.bars[i].id])} ${sol.forces[sol.bars[i].id] > 1e-9 ? 'T' : sol.forces[sol.bars[i].id] < -1e-9 ? 'C' : ''}` : ''}</td>
                  <td><button className="quitar" aria-label="Quitar barra" onClick={() => set((m) => { m.bars.splice(i, 1); })}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="agregar" onClick={() => set((m) => { if (m.nodes.length >= 2) m.bars.push({ id: `b${m.bars.length + 1}`, from: m.nodes[0].id, to: m.nodes[1].id }); })}>Agregar barra</button>

          <h2>Vínculos</h2>
          <table>
            <thead><tr><th>Nodo</th><th>Tipo</th><th title="Móvil: ángulo del plano de apoyo">Ángulo [°]</th><th /></tr></thead>
            <tbody>
              {model.supports.map((s, i) => (
                <tr key={i}>
                  <td><select aria-label="Nodo del vínculo" value={s.node} onChange={(e) => set((m) => { m.supports[i].node = e.target.value; })}>{nodeIds.map((id) => <option key={id}>{id}</option>)}</select></td>
                  <td><select aria-label="Tipo de vínculo" value={s.type} onChange={(e) => set((m) => { m.supports[i].type = e.target.value as 'fijo' | 'movil'; })}><option value="movil">Apoyo móvil</option><option value="fijo">Apoyo fijo</option></select></td>
                  <td>{s.type === 'movil' ? <NumIn label="Ángulo del plano de apoyo" width={52} value={s.angle ?? 0} onChange={(v) => set((m) => { m.supports[i].angle = v; })} /> : null}</td>
                  <td><button className="quitar" aria-label="Quitar vínculo" onClick={() => set((m) => { m.supports.splice(i, 1); })}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="agregar" onClick={() => set((m) => { if (nodeIds[0]) m.supports.push({ node: nodeIds[0], type: 'movil' }); })}>Agregar vínculo</button>

          <h2>Cargas en los nodos</h2>
          <table>
            <thead><tr><th>Nodo</th><th>Módulo [{units.fuerza}]</th><th>Ángulo [°]</th><th /></tr></thead>
            <tbody>
              {model.loads.map((l, i) => l.type === 'puntual' && (
                <tr key={i}>
                  <td><select aria-label="Nodo de la carga" value={l.node} onChange={(e) => set((m) => { (m.loads[i] as { node?: string }).node = e.target.value; })}>{nodeIds.map((id) => <option key={id}>{id}</option>)}</select></td>
                  <td><NumIn label="Módulo" width={64} value={l.value} onChange={(v) => set((m) => { (m.loads[i] as { value: number }).value = v; })} /></td>
                  <td><NumIn label="Ángulo" width={52} value={l.angle} onChange={(v) => set((m) => { (m.loads[i] as { angle: number }).angle = v; })} /></td>
                  <td><button className="quitar" aria-label="Quitar carga" onClick={() => set((m) => { m.loads.splice(i, 1); })}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="agregar" onClick={() => set((m) => { if (nodeIds[0]) m.loads.push(P(nodeIds[0], 10)); })}>Agregar carga</button>
          <p className="ayuda">Ángulos desde el eje x, antihorario positivo (−90° = hacia abajo).</p>
        </section>

        <section className="panel dibujo" aria-label="Reticulado">
          <div className={`estado ${ok ? 'ok' : 'mal'}`} role="status">
            {error ? `No se puede resolver: ${error}` : !sol ? '' : ok ? `Rígido (b = ${sol.b} = 2v − 3) e isostático. Azul: tracción (T); rojo: compresión (C); gris punteado: fuerza nula.` : sol.motivo}
          </div>
          <div className="herramientas">
            <div className="herr-botones" role="toolbar" aria-label="Editor del reticulado">
              <button className={!tool ? 'activa' : ''} aria-pressed={!tool} onClick={() => { setTool(null); setPending(null); }}>Ver</button>
              {TOOLS.map((t) => (
                <button key={t.id} className={tool === t.id ? 'activa' : ''} aria-pressed={tool === t.id} onClick={() => { setTool(tool === t.id ? null : t.id); setPending(null); }}>{t.nombre}</button>
              ))}
              <label className="herr-grilla">Grilla <NumIn label="Paso de la grilla" width={58} value={grid} onChange={(v) => v > 0 && setGrid(v)} /> {units.longitud}</label>
            </div>
            {actual && <p className="ayuda">{actual.ayuda}{tool === 'cortar' && corte.length ? ` Cortadas: ${corte.join(', ')}.` : ''}</p>}
          </div>
          {aviso && <p className="aviso" role="status">{aviso} <button className="quitar" aria-label="Cerrar aviso" onClick={() => setAviso(null)}>×</button></p>}
          <figure>
            <div className="fig-cabecera"><figcaption>Reticulado {ok ? 'y fuerzas en las barras' : ''}</figcaption><PngBtn nombre="reticulado" /></div>
            <TrussDrawing model={model} sol={sol} tool={tool} grid={grid} pending={pending} corte={corte} onEdit={onEdit} units={units} />
          </figure>
          {ok && sol && (
            <table className="resumen">
              <thead><tr><th>Barra</th><th>Fuerza</th><th>Estado</th></tr></thead>
              <tbody>{sol.bars.map((b) => <tr key={b.id}><td>{b.id}</td><td>{fmt(sol.forces[b.id])} {units.fuerza}</td><td>{estado(sol.forces[b.id])}</td></tr>)}</tbody>
            </table>
          )}
        </section>

        <section className="panel pasos" aria-label="Desarrollo paso a paso">
          <h2>Paso a paso</h2>
          {!steps.length && <p className="ayuda">Dibujá el reticulado para ver el desarrollo.</p>}
          {steps.map((s) => (
            <details key={s.id} open={todo || !!open[s.id]} onToggle={(e) => { const o = (e.target as HTMLDetailsElement).open; setOpen((x) => ({ ...x, [s.id]: o })); }} className="paso">
              <summary>{s.titulo}</summary>
              {s.blocks.map((b, i) => <BlockView key={i} b={b} />)}
            </details>
          ))}
          {ok && corte.length < 2 && <p className="ayuda">Para el método de las secciones, elegí la herramienta “Cortar” y tocá 2 o 3 barras.</p>}
        </section>
      </main>
    </div>
  );

  function onEditDelete(id: string) {
    set((m) => {
      m.nodes = m.nodes.filter((n) => n.id !== id);
      m.bars = m.bars.filter((b) => b.from !== id && b.to !== id);
      m.supports = m.supports.filter((s) => s.node !== id);
      m.loads = m.loads.filter((l) => !('node' in l) || l.node !== id);
    });
  }
}

const W = 760;

function TrussDrawing({ model, sol, tool, grid, pending, corte, onEdit, units }: {
  model: Model; sol: TrussSolution | null; tool: Tool | null; grid: number; pending: string | null; corte: string[];
  onEdit: (p: Vec, node: string | null, bar: number | null) => void; units: { fuerza: string; longitud: string };
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [mouse, setMouse] = useState<Vec | null>(null);
  const pts = model.nodes.length >= 2 ? model.nodes : [...model.nodes, { id: '', x: 0, y: 0 }, { id: '', x: 4, y: 3 }];
  let minX = Math.min(...pts.map((n) => n.x)), maxX = Math.max(...pts.map((n) => n.x));
  let minY = Math.min(...pts.map((n) => n.y)), maxY = Math.max(...pts.map((n) => n.y));
  if (tool && tool !== 'cortar') {
    const ext = Math.max(maxX - minX, maxY - minY, 4 * grid) * 0.3;
    minX -= ext; maxX += ext; minY -= ext; maxY += ext;
  }
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const pad = 80;
  const kx = (W - 2 * pad) / spanX;
  const height = Math.max(260, Math.min(620, spanY * kx + 2 * pad));
  const k = Math.min(kx, (height - 2 * pad) / spanY);
  const ox = W / 2 - ((minX + maxX) / 2) * k, oy = height / 2 + ((minY + maxY) / 2) * k;
  const T = (p: Vec) => vec(ox + p.x * k, oy - p.y * k);
  const toWorld = (q: Vec) => vec((q.x - ox) / k, (oy - q.y) / k);
  const pos = (id: string) => { const n = model.nodes.find((x) => x.id === id)!; return vec(n.x, n.y); };

  const svgPt = (ev: React.MouseEvent | React.PointerEvent) => {
    const svg = ref.current; const m = svg?.getScreenCTM(); if (!svg || !m) return null;
    const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const r = p.matrixTransform(m.inverse()); return vec(r.x, r.y);
  };
  const nearNode = (q: Vec) => model.nodes.map((n) => ({ id: n.id, d: norm(sub(q, T(vec(n.x, n.y)))) })).filter((x) => x.d < 14).sort((a, b) => a.d - b.d)[0]?.id ?? null;
  const nearBar = (q: Vec) => {
    let best: { i: number; d: number } | null = null;
    model.bars.forEach((b, i) => {
      if (!model.nodes.some((n) => n.id === b.from) || !model.nodes.some((n) => n.id === b.to)) return;
      const a = T(pos(b.from)), c = T(pos(b.to));
      const L = norm(sub(c, a)); if (L < 1e-9) return;
      const u = scale(sub(c, a), 1 / L);
      const t = Math.max(0, Math.min(L, dot(sub(q, a), u)));
      const d = norm(sub(q, add(a, scale(u, t))));
      if (d < 12 && (!best || d < best.d)) best = { i, d };
    });
    return best ? (best as { i: number }).i : null;
  };
  const snap = (q: Vec) => { const n = nearNode(q); if (n) return pos(n); const w = toWorld(q); const r = (v: number) => +(Math.round(v / grid) * grid).toFixed(6); return vec(r(w.x), r(w.y)); };

  const st = { bars: [], node: () => ({ p: vec(0, 0) }) } as unknown as Structure;
  const maxF = sol && sol.status === 'isostatico' ? Math.max(1e-9, ...Object.values(sol.forces).map(Math.abs)) : 1;

  const grilla: React.ReactNode[] = [];
  if (tool && tool !== 'cortar') {
    const a = toWorld(vec(0, height)), b = toWorld(vec(W, 0));
    const x0 = Math.ceil(a.x / grid), x1 = Math.floor(b.x / grid), y0 = Math.ceil(a.y / grid), y1 = Math.floor(b.y / grid);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 4000)
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const p = T(vec(i * grid, j * grid)); grilla.push(<circle key={`${i}-${j}`} cx={p.x} cy={p.y} r={1.3} />); }
  }

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${height}`} className={tool ? 'lamina editando' : 'lamina'} role="img" aria-label="Reticulado con fuerzas en las barras"
      onPointerMove={(ev) => { const q = svgPt(ev); if (q && tool) setMouse(snap(q)); }}
      onPointerLeave={() => setMouse(null)}
      onClick={(ev) => { if (!tool) return; const q = svgPt(ev); if (!q) return; const n = nearNode(q); onEdit(snap(q), n, n ? null : nearBar(q)); }}>
      <defs>
        <marker id="flecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className="punta" /></marker>
        <marker id="flecha-r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className="punta-r" /></marker>
      </defs>
      <g className="grilla" pointerEvents="none">{grilla}</g>
      {model.bars.map((b, i) => {
        if (!model.nodes.some((n) => n.id === b.from) || !model.nodes.some((n) => n.id === b.to)) return null;
        const a = T(pos(b.from)), c = T(pos(b.to));
        const tb = sol?.bars[i];
        const f = tb && sol?.status === 'isostatico' ? sol.forces[tb.id] : null;
        const cls = f === null ? '' : Math.abs(f) < 1e-9 ? 'nula' : f > 0 ? 'traccion' : 'compresion';
        const cut = tb && corte.includes(tb.id);
        const mid = scale(add(a, c), 0.5);
        const ang = (Math.atan2(c.y - a.y, c.x - a.x) * 180) / Math.PI;
        const rot = ang > 90 || ang < -90 ? ang + 180 : ang;
        const w = f === null ? 4 : 2.5 + 4 * (Math.abs(f) / maxF);
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={c.x} y2={c.y} className={`rt-barra ${cls} ${cut ? 'cortada' : ''}`} strokeWidth={w} />
            {f !== null && (
              <text x={mid.x} y={mid.y} transform={`rotate(${rot} ${mid.x} ${mid.y}) translate(0 -8)`} textAnchor="middle" className={`rt-valor ${cls}`}>
                {fmt(f, 2)}{Math.abs(f) < 1e-9 ? '' : f > 0 ? ' T' : ' C'}
              </text>
            )}
          </g>
        );
      })}
      {sol && corte.length >= 2 && (() => {
        // Línea de corte n–n: pasa por el punto medio de las barras cortadas, como en el TP.
        const mids = corte.map((id) => {
          const i = sol.bars.findIndex((b) => b.id === id);
          const b = model.bars[i];
          return b ? scale(add(T(pos(b.from)), T(pos(b.to))), 0.5) : null;
        }).filter((p): p is Vec => !!p);
        if (mids.length < 2) return null;
        const vert = Math.abs(mids[0].y - mids[mids.length - 1].y) >= Math.abs(mids[0].x - mids[mids.length - 1].x);
        mids.sort((a, b) => (vert ? a.y - b.y : a.x - b.x));
        const d0 = sub(mids[0], mids[1]), d1 = sub(mids[mids.length - 1], mids[mids.length - 2]);
        const a = add(mids[0], scale(d0, 30 / Math.max(norm(d0), 1e-9)));
        const z = add(mids[mids.length - 1], scale(d1, 30 / Math.max(norm(d1), 1e-9)));
        const pts = [a, ...mids, z];
        return (
          <g className="rt-corte" pointerEvents="none">
            <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />
            <text x={a.x + 6} y={a.y + (vert ? -4 : 14)}>n</text>
            <text x={z.x + 6} y={z.y + (vert ? 14 : -4)}>n</text>
          </g>
        );
      })()}
      {model.supports.map((s, i) => model.nodes.some((n) => n.id === s.node) && <Support key={i} s={s} p={T(pos(s.node))} st={st} T={T} />)}
      {model.loads.map((l, i) => {
        if (l.type !== 'puntual' || !l.node || !model.nodes.some((n) => n.id === l.node)) return null;
        const d = dirDeg(l.angle);
        return <Arrow key={i} p={T(pos(l.node))} d={vec(d.x, -d.y)} label={`${fmt(l.value, 2)}`} />;
      })}
      {sol?.status === 'isostatico' && sol.reactions.map((re, i) => Math.abs(re.value) > 1e-9 && (
        <Arrow key={`r${i}`} p={T(pos(re.node))} d={vec(re.dir.x * Math.sign(re.value), -re.dir.y * Math.sign(re.value))} label={fmt(Math.abs(re.value), 2)} reaction tail />
      ))}
      {model.nodes.map((n) => { const p = T(vec(n.x, n.y)); return (
        <g key={n.id}>
          <circle cx={p.x} cy={p.y} r={4.5} className={`rt-nodo ${pending === n.id ? 'activo' : ''}`} />
          <text x={p.x + 8} y={p.y - 9} className="nodo">{n.id}</text>
        </g>
      ); })}
      {tool && tool !== 'cortar' && mouse && (() => { const m = T(mouse); const a = pending && model.nodes.some((n) => n.id === pending) ? T(pos(pending)) : null; return (
        <g className="editor-guia" pointerEvents="none">
          {a && <line x1={a.x} y1={a.y} x2={m.x} y2={m.y} className="barra-fantasma" />}
          <circle cx={m.x} cy={m.y} r={5} />
          <text x={m.x + 9} y={m.y + 18}>({fmt(mouse.x, 2)}; {fmt(mouse.y, 2)}) {units.longitud}</text>
        </g>
      ); })()}
    </svg>
  );
}

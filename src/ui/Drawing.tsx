import React, { useRef, useState } from 'react';
import { Solution } from '../engine/analysis.ts';
import { Structure } from '../engine/normalize.ts';
import { Vec, vec, add, scale, sub, dot, norm, dirDeg, SupportDef } from '../engine/model.ts';
import { reactionDir } from '../engine/analysis.ts';
import { fmt } from '../engine/steps.ts';

export type Mode = 'estructura' | 'N' | 'Q' | 'M';

/** Sección bajo el cursor: tramo y distancia desde su inicio. */
export interface Hover {
  bar: string;
  x: number;
}

/** Clic del editor gráfico, en coordenadas del mundo (ya ajustadas a la grilla). */
export interface EditEvent {
  p: Vec;
  node: string | null;
  /** Tramo bajo el cursor y distancia desde su inicio. */
  bar: { id: string; x: number } | null;
}

interface Props {
  st: Structure;
  sol: Solution | null;
  mode: Mode;
  highlight?: string | null;
  onPick?: (barId: string) => void;
  showReactions?: boolean;
  maxHeight?: number;
  unidades: { fuerza: string; longitud: string };
  hover?: Hover | null;
  onHover?: (h: Hover | null) => void;
  /** Herramienta activa del editor; null = solo lectura. */
  tool?: string | null;
  grid?: number;
  onEdit?: (e: EditEvent) => void;
  /** Primer punto de una barra en construcción. */
  pending?: Vec | null;
}

const W = 760;

export function Drawing({ st, sol, mode, highlight, onPick, showReactions, maxHeight = 620, unidades, hover, onHover, tool, grid = 0.5, onEdit, pending }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mouse, setMouse] = useState<Vec | null>(null);
  // Sin nodos (estructura borrada) se muestra una grilla de 4 × 3 para empezar a dibujar.
  // Con 0 o 1 nodo se mantiene un encuadre fijo de 4 × 3 para que la vista no salte al dibujar.
  const few = st.nodes.length < 2;
  const xs = [...st.nodes.map((n) => n.p.x), ...(few ? [0, 4] : [])];
  const ys = [...st.nodes.map((n) => n.p.y), ...(few ? [0, 3] : [])];
  let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (tool) {
    // Al editar se aleja la vista para dejar grilla libre alrededor de la estructura.
    const ext = Math.max(maxX - minX, maxY - minY, 4 * grid) * 0.35;
    minX -= ext; maxX += ext; minY -= ext; maxY += ext;
  }
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  // Misma escala y posición en la estructura y en los tres diagramas: el margen
  // reserva lugar para el diagrama, y la altura se adapta a la proporción de la estructura.
  const hDiag = 80;
  const anyNotHoriz = st.bars.some((b) => Math.abs(b.e.y) > 1e-9);
  const anyNotVert = st.bars.some((b) => Math.abs(b.e.x) > 1e-9);
  const padX = anyNotHoriz ? hDiag + 44 : 64;
  const padY = anyNotVert ? hDiag + 36 : 64;
  const kx = (W - 2 * padX) / spanX;
  const height = Math.max(200, Math.min(maxHeight, (spanY > 1e-6 ? spanY * kx : 0) + 2 * padY));
  const k = Math.min(kx, spanY > 1e-6 ? (height - 2 * padY) / spanY : Infinity);
  const ox = W / 2 - ((minX + maxX) / 2) * k;
  const oy = height / 2 + ((minY + maxY) / 2) * k;
  const T = (p: Vec) => vec(ox + p.x * k, oy - p.y * k);
  const toWorld = (q: Vec) => vec((q.x - ox) / k, (oy - q.y) / k);

  // ---- interacción: sección bajo el cursor y editor ----
  const svgPoint = (ev: React.PointerEvent | React.MouseEvent): Vec | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const r = pt.matrixTransform(m.inverse());
    return vec(r.x, r.y);
  };
  const nearestBar = (q: Vec, tol = 18) => {
    let best: { id: string; x: number; d: number } | null = null;
    for (const b of st.bars) {
      const a = T(b.P0);
      const u = vec(b.e.x, -b.e.y);
      const len = b.L * k;
      const t = Math.max(0, Math.min(len, dot(sub(q, a), u)));
      const d = norm(sub(q, add(a, scale(u, t))));
      if (d <= tol && (!best || d < best.d)) best = { id: b.id, x: t / k, d };
    }
    return best;
  };
  const nearestNode = (q: Vec, tol = 14) => {
    let best: { id: string; d: number } | null = null;
    for (const n of st.nodes) {
      const d = norm(sub(q, T(n.p)));
      if (d <= tol && (!best || d < best.d)) best = { id: n.id, d };
    }
    return best;
  };
  const snap = (q: Vec): Vec => {
    const nn = nearestNode(q);
    if (nn) return st.node(nn.id).p;
    const w = toWorld(q);
    const r = (v: number) => +(Math.round(v / grid) * grid).toFixed(6);
    return vec(r(w.x), r(w.y));
  };
  const onMove = (ev: React.PointerEvent) => {
    const q = svgPoint(ev);
    if (!q) return;
    if (tool) {
      setMouse(snap(q));
      return;
    }
    const nb = nearestBar(q, mode === 'estructura' ? 18 : 120);
    onHover?.(nb ? { bar: nb.id, x: nb.x } : null);
  };
  const onClickSvg = (ev: React.MouseEvent) => {
    if (!tool || !onEdit) return;
    const q = svgPoint(ev);
    if (!q) return;
    const nn = nearestNode(q);
    const nb = nn ? null : nearestBar(q, 12);
    let p = snap(q);
    // Sobre una barra, el punto se proyecta sobre ella (con la distancia redondeada a la grilla).
    let bar: EditEvent['bar'] = null;
    if (nb) {
      const b = st.bars.find((x) => x.id === nb.id)!;
      const xr = Math.max(0, Math.min(b.L, Math.round(nb.x / grid) * grid));
      p = add(b.P0, scale(b.e, xr));
      bar = { id: b.id, x: xr };
    }
    onEdit({ p, node: nn?.id ?? null, bar });
  };
  /** Dirección del mundo → pantalla (y invertida). */
  const D = (d: Vec) => vec(d.x, -d.y);

  const diagram = mode !== 'estructura' && sol && sol.bars.length ? renderDiagram() : null;

  function renderDiagram() {
    const key = mode as 'N' | 'Q' | 'M';
    const maxAbs = Math.max(1e-9, ...sol!.bars.flatMap((r) => sample(r[key], r.bar.L).map(([, v]) => Math.abs(v))));
    const h = hDiag;
    const s = h / maxAbs;
    const labeled = new Set<string>();
    return sol!.bars.map((r) => {
      const b = r.bar;
      const pts = sample(r[key], b.L);
      const axis = (x: number) => T(add(b.P0, scale(b.e, x)));
      const n = D(b.n);
      const off = (x: number, v: number) => add(axis(x), scale(n, v * s));
      const poly = [axis(0), ...pts.map(([x, v]) => off(x, v)), axis(b.L)];
      const hatch = [];
      const step = Math.max(6, (b.L * k) / 40);
      for (let px = 0; px <= b.L * k + 0.01; px += step) {
        const x = Math.min(b.L, px / k);
        const v = r[key].eval(x);
        if (Math.abs(v * s) < 0.8) continue;
        const a = axis(x), c = off(x, v);
        hatch.push(<line key={px} x1={a.x} y1={a.y} x2={c.x} y2={c.y} className={v >= 0 ? 'hatch pos' : 'hatch neg'} />);
      }
      const ends = [0, b.L].map((x, i) => {
        const v = r[key].eval(x);
        if (Math.abs(v) < 1e-9) return null;
        const c = off(x, v);
        const spot = `${Math.round(c.x)},${Math.round(c.y)}`;
        if (labeled.has(spot)) return null;
        labeled.add(spot);
        const nudge = scale(n, (v >= 0 ? 1 : -1) * 12);
        return (
          <text key={i} x={c.x + nudge.x} y={c.y + nudge.y + 4} className="valor" textAnchor={i === 0 ? 'start' : 'end'}>
            {fmt(v, 2)}
          </text>
        );
      });
      // Signo ⊕/⊖ en el punto de mayor valor absoluto del tramo.
      // (con valores iguales se prefiere el más cercano al centro del tramo)
      const [xm, vm] = pts.reduce((a, p) => {
        const d = Math.abs(p[1]) - Math.abs(a[1]);
        if (d > 1e-9 * maxAbs) return p;
        if (Math.abs(d) <= 1e-9 * maxAbs && Math.abs(p[0] - b.L / 2) < Math.abs(a[0] - b.L / 2)) return p;
        return a;
      }, [0, 0] as [number, number]);
      const mid = Math.abs(vm) > 1e-9 ? add(axis(xm), scale(n, vm * s * 0.5)) : null;
      const hl = highlight === b.id;
      return (
        <g key={b.id} className={hl ? 'tramo hl' : 'tramo'} onClick={() => !tool && onPick?.(b.id)}>
          <polygon points={poly.map((p) => `${p.x},${p.y}`).join(' ')} className={`area ${key}`} />
          {hatch}
          <polyline points={pts.map(([x, v]) => off(x, v)).map((p) => `${p.x},${p.y}`).join(' ')} className="curva" />
          {mid && (
            <g>
              <circle cx={mid.x} cy={mid.y} r={8} className="signo-bg" />
              <text x={mid.x} y={mid.y + 4.5} textAnchor="middle" className="signo">{vm >= 0 ? '+' : '−'}</text>
            </g>
          )}
          {ends}
        </g>
      );
    });
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${height}`}
      className={tool ? 'lamina editando' : 'lamina'}
      onPointerMove={onMove}
      onPointerLeave={() => {
        setMouse(null);
        onHover?.(null);
      }}
      onClick={onClickSvg}
      role="img" aria-label={mode === 'estructura' ? 'Estructura con vínculos y cargas' : `Diagrama de ${mode === 'M' ? 'momento flector' : mode === 'Q' ? 'esfuerzo de corte' : 'esfuerzo normal'}`}>
      <defs>
        <marker id="flecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="punta" />
        </marker>
        <marker id="flecha-r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="punta-r" />
        </marker>
      </defs>
      {tool && mode === 'estructura' && <Grid toWorld={toWorld} T={T} height={height} grid={grid} />}
      {diagram}
      {st.bars.map((b) => {
        const a = T(b.P0), c = T(add(b.P0, scale(b.e, b.L)));
        return <line key={b.id} x1={a.x} y1={a.y} x2={c.x} y2={c.y} className={highlight === b.id ? 'barra hl' : 'barra'} onClick={() => !tool && onPick?.(b.id)} />;
      })}
      {mode === 'estructura' && st.bars.map((b) => b.dist.map((d, i) => <Dist key={`${b.id}-${i}`} b={b} d={d} T={T} D={D} k={k} st={st} />))}
      {st.supports.map((s) => <Support key={s.node} s={s} p={T(st.node(s.node).p)} st={st} T={T} />)}
      {mode === 'estructura' && st.forces.map((f, i) => <Arrow key={i} p={T(st.node(f.node).p)} d={D(scale(f.F, 1 / Math.hypot(f.F.x, f.F.y)))} label={`${fmt(Math.hypot(f.F.x, f.F.y), 2)}`} />)}
      {mode === 'estructura' && st.couples.map((c, i) => <Couple key={i} p={T(st.node(c.node).p)} M={c.M} />)}
      {mode === 'estructura' && showReactions && sol && sol.values.length > 0 && sol.unknowns.map((u, j) => {
        if (u.source !== 'vinculo' || u.kind === 'momento' || Math.abs(sol.values[j]) < 1e-9) return null;
        const v = sol.values[j];
        const d = D(scale(u.dir, v >= 0 ? 1 : -1));
        return <Arrow key={j} p={T(st.node(u.node).p)} d={d} label={`${fmt(Math.abs(v), 2)}`} reaction tail />;
      })}
      {st.nodes.filter((n) => n.hinge).map((n) => {
        const p = T(n.p);
        return <circle key={n.id} cx={p.x} cy={p.y} r={5} className="rotula" />;
      })}
      {st.nodes.map((n) => {
        const p = T(n.p);
        return (
          <text key={n.id} x={p.x + 8} y={p.y - 9} className="nodo">
            {n.id}
          </text>
        );
      })}
      {hover && !tool && (() => {
        const b = st.bars.find((x) => x.id === hover.bar);
        if (!b) return null;
        const P = T(add(b.P0, scale(b.e, hover.x)));
        const n = D(b.n);
        const a = add(P, scale(n, 26)), c = sub(P, scale(n, 26));
        const r = sol?.bars.find((x) => x.bar.id === b.id);
        let val: React.ReactNode = null;
        if (r && mode !== 'estructura') {
          const v = r[mode].eval(hover.x);
          const s2 = Math.max(1e-9, ...sol!.bars.flatMap((rr) => sample(rr[mode], rr.bar.L).map(([, w]) => Math.abs(w))));
          const q = add(P, scale(n, (v * 80) / s2));
          val = (
            <g className="cursor-valor">
              <circle cx={q.x} cy={q.y} r={4} />
              <text x={q.x + 8} y={q.y - 8}>{fmt(v, 3)}</text>
            </g>
          );
        }
        return (
          <g className="cursor-seccion" pointerEvents="none">
            <line x1={a.x} y1={a.y} x2={c.x} y2={c.y} />
            {val}
          </g>
        );
      })()}
      {tool && mouse && (() => {
        const m = T(mouse);
        return (
          <g className="editor-guia" pointerEvents="none">
            {pending && (() => {
              const a = T(pending);
              return <line x1={a.x} y1={a.y} x2={m.x} y2={m.y} className="barra-fantasma" />;
            })()}
            <circle cx={m.x} cy={m.y} r={5} />
            <text x={m.x + 9} y={m.y + 18}>({fmt(mouse.x, 2)}; {fmt(mouse.y, 2)})</text>
          </g>
        );
      })()}
      {mode !== 'estructura' && (
        <text x={14} y={22} className="eje">
          {mode === 'M' ? 'Mf' : mode} [{mode === 'M' ? `${unidades.fuerza}·${unidades.longitud}` : unidades.fuerza}]
        </text>
      )}
    </svg>
  );
}

function Grid({ toWorld, T, height, grid }: { toWorld: (q: Vec) => Vec; T: (p: Vec) => Vec; height: number; grid: number }) {
  const a = toWorld(vec(0, height));
  const b = toWorld(vec(W, 0));
  const x0 = Math.ceil(a.x / grid), x1 = Math.floor(b.x / grid);
  const y0 = Math.ceil(a.y / grid), y1 = Math.floor(b.y / grid);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) return null;
  const pts: React.ReactNode[] = [];
  for (let i = x0; i <= x1; i++)
    for (let j = y0; j <= y1; j++) {
      const p = T(vec(i * grid, j * grid));
      pts.push(<circle key={`${i}-${j}`} cx={p.x} cy={p.y} r={i === 0 && j === 0 ? 2.6 : 1.3} />);
    }
  return <g className="grilla" pointerEvents="none">{pts}</g>;
}

function sample(p: { eval: (x: number) => number }, L: number): [number, number][] {
  const n = 40;
  return Array.from({ length: n + 1 }, (_, i) => [(L * i) / n, p.eval((L * i) / n)] as [number, number]);
}

export function Arrow({ p, d, label, reaction, tail }: { p: Vec; d: Vec; label: string; reaction?: boolean; tail?: boolean }) {
  const len = 46;
  // Cargas: la punta toca el nodo. Reacciones: nacen en el nodo (tail).
  const start = tail ? add(p, scale(d, 6)) : sub(p, scale(d, len + 4));
  const end = tail ? add(p, scale(d, len + 6)) : sub(p, scale(d, 4));
  const lab = tail ? add(end, scale(d, 12)) : sub(start, scale(d, 10));
  return (
    <g className={reaction ? 'fuerza reaccion' : 'fuerza'}>
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} markerEnd={`url(#${reaction ? 'flecha-r' : 'flecha'})`} />
      <text x={lab.x} y={lab.y + 4} textAnchor="middle" className="valor">{label}</text>
    </g>
  );
}

function Couple({ p, M }: { p: Vec; M: number }) {
  const r = 20;
  const ccw = M > 0;
  // Arco de 270° alrededor del nodo; la punta indica el sentido.
  const a0 = ccw ? -0.25 * Math.PI : 0.25 * Math.PI + Math.PI;
  const a1 = ccw ? 1.25 * Math.PI : -0.25 * Math.PI;
  const P = (a: number) => vec(p.x + r * Math.cos(a), p.y - r * Math.sin(a));
  const s = P(a0), e = P(a1);
  return (
    <g className="fuerza">
      <path d={`M${s.x} ${s.y} A${r} ${r} 0 1 ${ccw ? 0 : 1} ${e.x} ${e.y}`} fill="none" markerEnd="url(#flecha)" />
      <text x={p.x} y={p.y - r - 8} textAnchor="middle" className="valor">{fmt(Math.abs(M), 2)}</text>
    </g>
  );
}

function Dist({ b, d, T, D, k, st }: { b: Structure['bars'][number]; d: { q1: number; q2: number; d: Vec }; T: (p: Vec) => Vec; D: (d: Vec) => Vec; k: number; st: Structure }) {
  void st;
  const qmax = Math.max(Math.abs(d.q1), Math.abs(d.q2), 1e-9);
  const hmax = 34;
  const dir = D(d.d);
  const n = Math.max(2, Math.round((b.L * k) / 22));
  const arrows = [];
  const top: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (b.L * i) / n;
    const q = d.q1 + ((d.q2 - d.q1) * x) / b.L;
    const tip = sub(T(add(b.P0, scale(b.e, x))), scale(dir, 3));
    const tail = sub(tip, scale(dir, (Math.abs(q) / qmax) * hmax + 6));
    top.push(tail);
    if (Math.abs(q) > 1e-9) arrows.push(<line key={i} x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} markerEnd="url(#flecha)" />);
  }
  const mid = top[Math.floor(top.length / 2)];
  const label = Math.abs(d.q1 - d.q2) < 1e-9 ? fmt(d.q1, 2) : `${fmt(d.q1, 2)} → ${fmt(d.q2, 2)}`;
  return (
    <g className="fuerza dist">
      {arrows}
      <polyline points={top.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" />
      <text x={mid.x} y={mid.y - 8} textAnchor="middle" className="valor">q = {label}</text>
    </g>
  );
}

export function Support({ s, p, st, T }: { s: SupportDef; p: Vec; st: Structure; T: (p: Vec) => Vec }) {
  if (s.type === 'empotramiento') {
    // Pared perpendicular a la barra que llega al nodo, del lado de afuera.
    const b = st.bars.find((x) => x.from === s.node || x.to === s.node);
    let out = vec(-1, 0);
    if (b) {
      const into = b.from === s.node ? b.e : scale(b.e, -1);
      out = vec(-into.x, into.y); // pantalla (y invertida)
    }
    const t = vec(-out.y, out.x);
    const a = add(p, scale(t, 22)), c = sub(p, scale(t, 22));
    const hatch = Array.from({ length: 6 }, (_, i) => {
      const q = add(c, scale(sub(a, c), i / 5));
      const r = add(q, add(scale(out, 10), scale(t, -8)));
      return <line key={i} x1={q.x} y1={q.y} x2={r.x} y2={r.y} />;
    });
    return (
      <g className="vinculo">
        <line x1={a.x} y1={a.y} x2={c.x} y2={c.y} strokeWidth={2.5} />
        {hatch}
      </g>
    );
  }
  // Apoyo fijo, móvil o biela: triángulo orientado según la reacción.
  const rd = s.type === 'fijo' ? vec(0, 1) : reactionDir(s);
  const up = vec(rd.x, -rd.y); // hacia la estructura, en pantalla
  const down = scale(up, -1);
  const t = vec(-down.y, down.x);
  const h = 18;
  const base = add(p, scale(down, h));
  const l = add(base, scale(t, 12)), r = sub(base, scale(t, 12));
  const ground = add(base, scale(down, s.type === 'fijo' ? 0 : 8));
  const gl = add(ground, scale(t, 18)), gr = sub(ground, scale(t, 18));
  return (
    <g className="vinculo">
      <polygon points={`${p.x},${p.y} ${l.x},${l.y} ${r.x},${r.y}`} />
      {s.type !== 'fijo' && [-6, 6].map((o) => {
        const c = add(add(base, scale(down, 4)), scale(t, o));
        return <circle key={o} cx={c.x} cy={c.y} r={3.2} />;
      })}
      <line x1={gl.x} y1={gl.y} x2={gr.x} y2={gr.y} />
      {Array.from({ length: 5 }, (_, i) => {
        const q = add(gr, scale(sub(gl, gr), i / 4));
        const z = add(q, add(scale(down, 7), scale(t, -6)));
        return <line key={i} x1={q.x} y1={q.y} x2={z.x} y2={z.y} className="tierra" />;
      })}
    </g>
  );
}

export { dirDeg };

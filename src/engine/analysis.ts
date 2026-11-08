/**
 * Clasificación cinemática, reacciones de vínculo externo (RVE) y esfuerzos
 * característicos N, Q, Mf por el método de las secciones, con la convención
 * de signos del módulo ITBA 10:
 *   por izquierda: N = −[ΣF·e]   Q = +[ΣF·n]   Mf = −[ΣM_G]
 *   por derecha:   N = +[ΣF·e]   Q = −[ΣF·n]   Mf = +[ΣM_G]
 * (e, n: ejes x', y' del SRP de la barra; momentos antihorarios positivos).
 */
import { Model, Vec, vec, sub, add, scale, dot, cross, norm, dirDeg, SupportDef } from './model.ts';
import { normalize, Structure, SBar, SNode, ModelError } from './normalize.ts';
import { Poly } from './poly.ts';
import { rank, solve } from './linalg.ts';

// ---------- tipos de resultado ----------

export type Status = 'isostatico' | 'hipostatico' | 'hiperestatico' | 'aparente';

export interface Unknown {
  name: string;
  kind: 'fuerza' | 'momento';
  /** Dirección supuesta positiva (SRG) para fuerzas. */
  dir: Vec;
  node: string;
  /** Cuerpo sobre el que actúa: índice de chapa, o 'pin:<nodo>'. */
  body: string;
  /** Origen: reacción de un vínculo externo o esfuerzo en una articulación. */
  source: 'vinculo' | 'articulacion';
  /** Chapa sobre la que actúa la fuerza de articulación. */
  chapa?: number;
  supportType?: SupportDef['type'];
}

export interface Classification {
  chapas: number;
  gradosLibertad: number;
  restricciones: number;
  detalleRestricciones: { node: string; tipo: string; restringe: number }[];
  status: Status;
  motivo: string;
}

export interface BarResult {
  bar: SBar;
  /** Número de sección (1-1, 2-2, …). */
  seccion: number;
  N: Poly;
  Q: Poly;
  M: Poly;
  /** Mismos esfuerzos calculados por derecha (control). */
  Nder: Poly;
  Qder: Poly;
  Mder: Poly;
  izqIgualDer: boolean;
  /** Nodos del lado izquierdo (recorrido) de la sección, sin contar la barra cortada. */
  nodosIzq: string[];
  nodosDer: string[];
}

export interface Extreme {
  esfuerzo: 'N' | 'Q' | 'M';
  valor: number;
  bar: string;
  /** Distancia desde el inicio del tramo. */
  x: number;
  p: Vec;
}

export interface NodeCheck {
  node: string;
  Fx: number;
  Fy: number;
  M: number;
  ok: boolean;
}

export interface Solution {
  structure: Structure;
  classification: Classification;
  unknowns: Unknown[];
  values: number[];
  bars: BarResult[];
  extremes: { max: Record<'N' | 'Q' | 'M', Extreme>; min: Record<'N' | 'Q' | 'M', Extreme> };
  nodeChecks: NodeCheck[];
  /** Máximo residuo de equilibrio global (control). */
  residual: number;
  /** Chapa de cada tramo (mismo orden que structure.bars). */
  chapaOf: number[];
  /** Nodos que son articulaciones efectivas entre chapas. */
  pins: string[];
}

// ---------- chapas ----------

function chapasOf(st: Structure): number[] {
  const parent = st.bars.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const n of st.nodes) {
    if (n.hinge) continue;
    const inc = st.bars.map((b, i) => (b.from === n.id || b.to === n.id ? i : -1)).filter((i) => i >= 0);
    for (let k = 1; k < inc.length; k++) parent[find(inc[k])] = find(inc[0]);
  }
  const roots = [...new Set(st.bars.map((_, i) => find(i)))];
  return st.bars.map((_, i) => roots.indexOf(find(i)));
}

const supportRestr = { movil: 1, biela: 1, fijo: 2, empotramiento: 3 } as const;
const tipoNombre = { movil: 'apoyo móvil', biela: 'biela', fijo: 'apoyo fijo', empotramiento: 'empotramiento' } as const;

function axisName(d: Vec): 'x' | 'y' | '' {
  if (Math.abs(d.y) < 1e-12) return 'x';
  if (Math.abs(d.x) < 1e-12) return 'y';
  return '';
}

/** Dirección de la reacción de un apoyo móvil o biela. */
export function reactionDir(s: SupportDef): Vec {
  let d: Vec;
  if (s.type === 'movil') {
    const a = ((s.angle ?? 0) * Math.PI) / 180;
    d = vec(-Math.sin(a), Math.cos(a));
  } else d = dirDeg(s.angle ?? 90);
  d = vec(Math.abs(d.x) < 1e-12 ? 0 : d.x, Math.abs(d.y) < 1e-12 ? 0 : d.y);
  // Sentido supuesto positivo según el SRG (módulo 10): hacia +x, o hacia +y si es vertical.
  if (d.x < 0 || (d.x === 0 && d.y < 0)) d = vec(-d.x, -d.y);
  return vec(d.x || 0, d.y || 0);
}

// ---------- análisis ----------

export function analyze(model: Model): Solution {
  const st = normalize(model);
  const chapa = chapasOf(st);
  const nChapas = chapa.length ? Math.max(...chapa) + 1 : 0;
  const barsAt = (id: string) => st.bars.map((b, i) => ({ b, i })).filter(({ b }) => b.from === id || b.to === id);
  const chapasAt = (id: string) => [...new Set(barsAt(id).map(({ i }) => chapa[i]))];

  // Articulaciones efectivas: nodos con hinge que unen ≥ 2 chapas.
  const pins = st.nodes.filter((n) => n.hinge && chapasAt(n.id).length >= 2);
  const isPin = (id: string) => pins.some((p) => p.id === id);
  const bodyOfNode = (id: string): string => {
    if (isPin(id)) return `pin:${id}`;
    const cs = chapasAt(id);
    if (!cs.length) throw new ModelError(`El nodo "${id}" no pertenece a ninguna barra.`);
    return String(cs[0]);
  };

  // Incógnitas.
  const unknowns: Unknown[] = [];
  const detalle: Classification['detalleRestricciones'] = [];
  for (const s of st.supports) {
    const body = bodyOfNode(s.node);
    detalle.push({ node: s.node, tipo: tipoNombre[s.type], restringe: supportRestr[s.type] });
    if (s.type === 'fijo' || s.type === 'empotramiento') {
      unknowns.push({ name: `R_{${s.node}x}`, kind: 'fuerza', dir: vec(1, 0), node: s.node, body, source: 'vinculo', supportType: s.type });
      unknowns.push({ name: `R_{${s.node}y}`, kind: 'fuerza', dir: vec(0, 1), node: s.node, body, source: 'vinculo', supportType: s.type });
      if (s.type === 'empotramiento')
        unknowns.push({ name: `Me_{${s.node}}`, kind: 'momento', dir: vec(0, 0), node: s.node, body, source: 'vinculo', supportType: s.type });
    } else {
      const d = reactionDir(s);
      unknowns.push({ name: `R_{${s.node}${axisName(d)}}`, kind: 'fuerza', dir: d, node: s.node, body, source: 'vinculo', supportType: s.type });
    }
  }
  for (const p of pins) {
    const cs = chapasAt(p.id);
    detalle.push({ node: p.id, tipo: `articulación entre ${cs.length} chapas`, restringe: 2 * (cs.length - 1) });
    for (const c of cs) {
      unknowns.push({ name: `V_{${p.id}x}^{(${c + 1})}`, kind: 'fuerza', dir: vec(1, 0), node: p.id, body: String(c), source: 'articulacion', chapa: c });
      unknowns.push({ name: `V_{${p.id}y}^{(${c + 1})}`, kind: 'fuerza', dir: vec(0, 1), node: p.id, body: String(c), source: 'articulacion', chapa: c });
    }
  }
  if (st.couples.some((c) => isPin(c.node)))
    throw new ModelError('Una cupla no puede aplicarse directamente sobre una articulación; ubicala sobre una de las barras.');

  // Ecuaciones: 3 por chapa (ΣFx, ΣFy, ΣM respecto del primer nodo de la chapa) + 2 por articulación.
  const bodies: string[] = [...Array(nChapas).keys()].map(String).concat(pins.map((p) => `pin:${p.id}`));
  const refPoint = (body: string): Vec => {
    if (body.startsWith('pin:')) return st.node(body.slice(4)).p;
    const b = st.bars[chapa.indexOf(+body)];
    return b.P0;
  };
  const rowsOf = (body: string) => (body.startsWith('pin:') ? 2 : 3);
  const rowIndex = new Map<string, number>();
  let nRows = 0;
  for (const b of bodies) {
    rowIndex.set(b, nRows);
    nRows += rowsOf(b);
  }
  const A = Array.from({ length: nRows }, () => new Array(unknowns.length).fill(0));
  const f = new Array(nRows).fill(0);
  const addForce = (body: string, P: Vec, F: Vec, col: number | null) => {
    const r = rowIndex.get(body)!;
    const target = col === null ? null : col;
    const put = (row: number, v: number) => (target === null ? (f[row] += v) : (A[row][target] += v));
    put(r, F.x);
    put(r + 1, F.y);
    if (rowsOf(body) === 3) put(r + 2, cross(sub(P, refPoint(body)), F));
  };
  const addMoment = (body: string, M: number, col: number | null) => {
    const r = rowIndex.get(body)! + 2;
    if (col === null) f[r] += M;
    else A[r][col] += M;
  };

  unknowns.forEach((u, j) => {
    const P = st.node(u.node).p;
    if (u.kind === 'momento') return addMoment(u.body, 1, j);
    addForce(u.body, P, u.dir, j);
    if (u.source === 'articulacion') addForce(`pin:${u.node}`, P, scale(u.dir, -1), j);
  });
  for (const F of st.forces) addForce(bodyOfNode(F.node), st.node(F.node).p, F.F, null);
  for (const C of st.couples) addMoment(bodyOfNode(C.node), C.M, null);
  st.bars.forEach((b, i) => {
    for (const d of b.dist) {
      const { R, M0 } = distResultant(b, d, b.L);
      const body = String(chapa[i]);
      addForce(body, b.P0, R, null);
      addMoment(body, M0, null);
    }
  });

  // Clasificación (módulo 09) + invariancia (rango).
  const restricciones = detalle.reduce((s, d) => s + d.restringe, 0);
  const gl = 3 * nChapas;
  let status: Status;
  let motivo: string;
  const loops = [...Array(nChapas).keys()].some((c) => {
    const bs = st.bars.filter((_, i) => chapa[i] === c);
    const ns = new Set(bs.flatMap((b) => [b.from, b.to]));
    return bs.length >= ns.size;
  });
  if (loops) {
    status = 'hiperestatico';
    motivo = 'Una chapa forma un contorno cerrado de barras, lo que la hace internamente hiperestática.';
  } else if (restricciones < gl) {
    status = 'hipostatico';
    motivo = `Hay menos condiciones de vínculo (${restricciones}) que grados de libertad (${gl}).`;
  } else if (restricciones > gl) {
    status = 'hiperestatico';
    motivo = `Hay más condiciones de vínculo (${restricciones}) que grados de libertad (${gl}).`;
  } else if (rank(A) < unknowns.length) {
    status = 'aparente';
    motivo = apparentReason(st, unknowns, nChapas);
  } else {
    status = 'isostatico';
    motivo = `Las condiciones de vínculo (${restricciones}) igualan a los grados de libertad (${gl}) y el sistema es cinemáticamente invariable.`;
  }
  const classification: Classification = { chapas: nChapas, gradosLibertad: gl, restricciones, detalleRestricciones: detalle, status, motivo };

  if (status !== 'isostatico') {
    return { structure: st, classification, unknowns, values: [], bars: [], extremes: emptyExtremes(), nodeChecks: [], residual: NaN, chapaOf: chapa, pins: pins.map((p) => p.id) };
  }

  const values = solve(A, f.map((v) => -v));
  const residual = Math.max(...A.map((row, i) => Math.abs(row.reduce((s, a, j) => s + a * values[j], 0) + f[i])));

  // Fuerzas exteriores que actúan sobre cada chapa (para el método de las secciones).
  interface Ext {
    node: string;
    F: Vec;
    M: number;
  }
  const extOnChapa = (c: number, nodeId: string): Ext[] => {
    const out: Ext[] = [];
    if (isPin(nodeId)) {
      unknowns.forEach((u, j) => {
        if (u.source === 'articulacion' && u.node === nodeId && u.chapa === c) out.push({ node: nodeId, F: scale(u.dir, values[j]), M: 0 });
      });
      return out;
    }
    for (const F of st.forces) if (F.node === nodeId) out.push({ node: nodeId, F: F.F, M: 0 });
    for (const C of st.couples) if (C.node === nodeId) out.push({ node: nodeId, F: vec(0, 0), M: C.M });
    unknowns.forEach((u, j) => {
      if (u.source === 'vinculo' && u.node === nodeId)
        out.push(u.kind === 'momento' ? { node: nodeId, F: vec(0, 0), M: values[j] } : { node: nodeId, F: scale(u.dir, values[j]), M: 0 });
    });
    return out;
  };

  /** Componente conexa de la chapa c al quitar la barra `skip`, desde `start`. */
  const component = (c: number, skip: number, start: string) => {
    const nodesSet = new Set<string>([start]);
    const barsSet = new Set<number>();
    const stack = [start];
    while (stack.length) {
      const id = stack.pop()!;
      st.bars.forEach((b, i) => {
        if (i === skip || chapa[i] !== c || barsSet.has(i)) return;
        if (b.from !== id && b.to !== id) return;
        barsSet.add(i);
        const other = b.from === id ? b.to : b.from;
        if (!nodesSet.has(other)) {
          nodesSet.add(other);
          stack.push(other);
        }
      });
    }
    return { nodes: [...nodesSet], bars: [...barsSet] };
  };

  /** Resultante y momento respecto de O de las fuerzas exteriores de una parte. */
  const sumPart = (c: number, part: { nodes: string[]; bars: number[] }, O: Vec) => {
    let F = vec(0, 0);
    let M = 0;
    for (const id of part.nodes)
      for (const x of extOnChapa(c, id)) {
        F = add(F, x.F);
        M += cross(sub(st.node(id).p, O), x.F) + x.M;
      }
    for (const i of part.bars) {
      const b = st.bars[i];
      for (const d of b.dist) {
        const { R, M0 } = distResultant(b, d, b.L);
        F = add(F, R);
        M += cross(sub(b.P0, O), R) + M0;
      }
    }
    return { F, M };
  };

  const bars: BarResult[] = st.bars.map((b, i) => {
    const c = chapa[i];
    const left = component(c, i, b.from);
    const right = component(c, i, b.to);
    const P1 = add(b.P0, scale(b.e, b.L));
    const sl = sumPart(c, left, b.P0);
    const sr = sumPart(c, right, P1);
    const x = Poly.linear(0, 1);

    // Fuerzas de la parte izquierda proyectadas sobre el SRP; luego se suma la
    // carga distribuida de la propia barra entre 0 y ξ.
    let Fl_e = Poly.const(dot(sl.F, b.e));
    let Fl_n = Poly.const(dot(sl.F, b.n));
    // Momento respecto de G(ξ) = P0 + ξ·e de las fuerzas de la parte izquierda: M0 − ξ (e × F)
    let Ml = Poly.const(sl.M).sub(x.scale(cross(b.e, sl.F)));
    let Fr_e = Poly.const(dot(sr.F, b.e));
    let Fr_n = Poly.const(dot(sr.F, b.n));
    // Respecto de G: M_r + (L − ξ)(e × F_r)
    let Mr = Poly.const(sr.M).add(Poly.linear(b.L, -1).scale(cross(b.e, sr.F)));
    for (const d of b.dist) {
      const w = Poly.linear(d.q1, (d.q2 - d.q1) / b.L);
      const W = w.integrate(); // ∫0^ξ w
      const T = x.mul(w).integrate(); // ∫0^ξ t·w
      const ed = cross(b.e, d.d);
      Fl_e = Fl_e.add(W.scale(dot(d.d, b.e)));
      Fl_n = Fl_n.add(W.scale(dot(d.d, b.n)));
      Ml = Ml.add(T.sub(x.mul(W)).scale(ed));
      const WL = W.eval(b.L);
      const TL = T.eval(b.L);
      const Wr = Poly.const(WL).sub(W);
      const Tr = Poly.const(TL).sub(T);
      Fr_e = Fr_e.add(Wr.scale(dot(d.d, b.e)));
      Fr_n = Fr_n.add(Wr.scale(dot(d.d, b.n)));
      Mr = Mr.add(Tr.sub(x.mul(Wr)).scale(ed));
    }
    const N = Fl_e.scale(-1);
    const Q = Fl_n;
    const M = Ml.scale(-1);
    const Nder = Fr_e;
    const Qder = Fr_n.scale(-1);
    const Mder = Mr;
    const sc = Math.max(1, ...[N, Q, M].flatMap((p) => p.c.map(Math.abs)));
    const izqIgualDer = N.approxEquals(Nder, sc) && Q.approxEquals(Qder, sc) && M.approxEquals(Mder, sc);
    return { bar: b, seccion: i + 1, N, Q, M, Nder, Qder, Mder, izqIgualDer, nodosIzq: left.nodes, nodosDer: right.nodes };
  });

  // Extremos.
  const ext = emptyExtremes();
  for (const r of bars) {
    const cand = (key: 'N' | 'Q' | 'M', p: Poly) => {
      const xs = [0, r.bar.L];
      const dp = p.derivative();
      if (dp.degree >= 1 && dp.degree <= 2) xs.push(...dp.rootsIn(0, r.bar.L));
      for (const xv of xs) {
        const v = clean(p.eval(xv));
        const e: Extreme = { esfuerzo: key, valor: v, bar: r.bar.id, x: xv, p: add(r.bar.P0, scale(r.bar.e, xv)) };
        if (v > ext.max[key].valor + 1e-9) ext.max[key] = e;
        if (v < ext.min[key].valor - 1e-9) ext.min[key] = e;
      }
    };
    cand('N', r.N);
    cand('Q', r.Q);
    cand('M', r.M);
  }

  // Equilibrio de nudos con los esfuerzos en los extremos de barra.
  const nodeChecks: NodeCheck[] = st.nodes.map((n) => {
    let F = vec(0, 0);
    let M = 0;
    bars.forEach((r) => {
      const b = r.bar;
      if (b.from === n.id) {
        F = add(F, sub(scale(b.e, r.N.eval(0)), scale(b.n, r.Q.eval(0))));
        M += r.M.eval(0);
      }
      if (b.to === n.id) {
        F = add(F, sub(scale(b.n, r.Q.eval(b.L)), scale(b.e, r.N.eval(b.L))));
        M -= r.M.eval(b.L);
      }
    });
    for (const x of st.forces) if (x.node === n.id) F = add(F, x.F);
    for (const x of st.couples) if (x.node === n.id) M += x.M;
    unknowns.forEach((u, j) => {
      if (u.source !== 'vinculo' || u.node !== n.id) return;
      if (u.kind === 'momento') M += values[j];
      else F = add(F, scale(u.dir, values[j]));
    });
    const sc = Math.max(1, ...values.map(Math.abs));
    return { node: n.id, Fx: clean(F.x), Fy: clean(F.y), M: clean(M), ok: norm(F) < 1e-7 * sc && Math.abs(M) < 1e-7 * sc };
  });

  return { structure: st, classification, unknowns, values: values.map(clean), bars, extremes: ext, nodeChecks, residual, chapaOf: chapa, pins: pins.map((p) => p.id) };
}

/** Resultante R de una carga distribuida sobre [0, L] de la barra y su momento respecto de P0. */
function distResultant(b: SBar, d: { q1: number; q2: number; d: Vec }, L: number) {
  const W = ((d.q1 + d.q2) / 2) * L;
  const T = (d.q1 * L * L) / 2 + ((d.q2 - d.q1) * L * L) / 3; // ∫ t·w dt
  return { R: scale(d.d, W), M0: T * cross(b.e, d.d) };
}

function clean(v: number) {
  return Math.abs(v) < 1e-10 ? 0 : +v.toPrecision(12);
}

function emptyExtremes(): Solution['extremes'] {
  const z = (k: 'N' | 'Q' | 'M', v: number): Extreme => ({ esfuerzo: k, valor: v, bar: '', x: 0, p: vec(0, 0) });
  return { max: { N: z('N', -Infinity), Q: z('Q', -Infinity), M: z('M', -Infinity) }, min: { N: z('N', Infinity), Q: z('Q', Infinity), M: z('M', Infinity) } };
}

/** Explicación geométrica de la vinculación aparente (módulo 09). */
function apparentReason(st: Structure, unknowns: Unknown[], nChapas: number): string {
  const ext = unknowns.filter((u) => u.source === 'vinculo');
  if (nChapas === 1) {
    const fijo = st.supports.find((s) => s.type === 'fijo');
    const movil = st.supports.find((s) => s.type === 'movil' || s.type === 'biela');
    if (fijo && movil && st.supports.length === 2) {
      return `La normal del ${movil.type === 'movil' ? 'apoyo móvil' : 'eje de la biela'} ${movil.node} pasa por el apoyo fijo ${fijo.node}: la chapa puede girar alrededor de ${fijo.node} (vinculación aparente).`;
    }
    const lines = ext.filter((u) => u.kind === 'fuerza');
    if (lines.length === 3 && lines.every((u) => Math.abs(cross(u.dir, lines[0].dir)) < 1e-9))
      return 'Las tres reacciones son paralelas: sus rectas de acción se cortan en un punto impropio y la chapa puede trasladarse (vinculación aparente).';
    return 'Las rectas de acción de las reacciones concurren en un punto, que actúa como centro de giro de la chapa (vinculación aparente).';
  }
  return 'El conteo da isostático, pero la disposición de los vínculos permite un movimiento: el sistema es cinemáticamente variable (vinculación aparente).';
}

export { normalize };
export type { Structure, SBar, SNode };

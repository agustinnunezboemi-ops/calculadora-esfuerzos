/**
 * Normalización del modelo:
 *  - orienta cada barra según el sentido de recorrido por defecto del SRP
 *    (horizontales de izquierda a derecha, verticales de abajo hacia arriba,
 *    inclinadas desde su extremo izquierdo; `reverse` lo invierte);
 *  - detecta nodos: extremos, cruces de barras, nodos sobre barras, cargas puntuales,
 *    cuplas e inicio/fin de cargas distribuidas;
 *  - divide las barras en tramos entre nodos consecutivos.
 */
import { Model, NodeDef, Vec, vec, sub, add, scale, dot, cross, norm, dirDeg, SupportDef } from './model.ts';

export const TOL = 1e-9;

export interface SNode {
  id: string;
  p: Vec;
  hinge: boolean;
  auto: boolean;
}

export interface SDist {
  /** Intensidad al inicio y al final del tramo. */
  q1: number;
  q2: number;
  /** Dirección unitaria en el SRG. */
  d: Vec;
}

export interface SBar {
  id: string;
  from: string;
  to: string;
  /** Barra original del modelo. */
  orig: string;
  L: number;
  /** Eje x' del SRP (unitario, sentido de recorrido). */
  e: Vec;
  /** Eje y' del SRP: x' girado 90° antihorario. */
  n: Vec;
  P0: Vec;
  dist: SDist[];
}

export interface NodeForce {
  node: string;
  F: Vec;
  label: string;
}

export interface NodeCouple {
  node: string;
  M: number;
  label: string;
}

export interface Structure {
  nodes: SNode[];
  bars: SBar[];
  supports: SupportDef[];
  forces: NodeForce[];
  couples: NodeCouple[];
  node(id: string): SNode;
}

export class ModelError extends Error {}

function nextName(used: Set<string>): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let round = 0; ; round++) {
    for (const l of letters) {
      const id = round === 0 ? l : `${l}${round}`;
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  }
}

const fmtNum = (v: number) => +v.toFixed(6);

export function normalize(model: Model): Structure {
  const used = new Set(model.nodes.map((n) => n.id));
  const nodes: SNode[] = model.nodes.map((n) => ({ id: n.id, p: vec(n.x, n.y), hinge: false, auto: false }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const getNode = (id: string) => {
    const n = byId.get(id);
    if (!n) throw new ModelError(`El nodo "${id}" no existe.`);
    return n;
  };
  const findOrCreate = (p: Vec): SNode => {
    const ex = nodes.find((n) => norm(sub(n.p, p)) < 1e-7);
    if (ex) return ex;
    const n: SNode = { id: nextName(used), p, hinge: false, auto: true };
    nodes.push(n);
    byId.set(n.id, n);
    return n;
  };

  // 1. Orientación de barras (sentido de recorrido) y cargas expresadas sobre ellas.
  interface OBar {
    id: string;
    a: SNode;
    b: SNode;
    L: number;
    e: Vec;
    flipped: boolean;
  }
  const obars: OBar[] = model.bars.map((bd) => {
    let a = getNode(bd.from);
    let b = getNode(bd.to);
    const d = sub(b.p, a.p);
    const L = norm(d);
    if (L < 1e-9) throw new ModelError(`La barra "${bd.id}" tiene longitud nula.`);
    let flip = d.x < -1e-9 || (Math.abs(d.x) <= 1e-9 && d.y < 0);
    if (bd.reverse) flip = !flip;
    if (flip) [a, b] = [b, a];
    return { id: bd.id, a, b, L, e: scale(sub(b.p, a.p), 1 / L), flipped: flip };
  });
  const obar = (id: string) => {
    const b = obars.find((o) => o.id === id);
    if (!b) throw new ModelError(`La barra "${id}" no existe.`);
    return b;
  };
  /** Posición medida desde el nodo `from` original → posición en el sentido de recorrido. */
  const pos = (b: OBar, at: number) => {
    if (at < -1e-9 || at > b.L + 1e-9) throw new ModelError(`Posición ${at} fuera de la barra "${b.id}".`);
    return b.flipped ? b.L - at : at;
  };

  // 2. Cruces entre barras: se agrega un nodo en la intersección.
  for (let i = 0; i < obars.length; i++)
    for (let j = i + 1; j < obars.length; j++) {
      const p = obars[i];
      const q = obars[j];
      const r = scale(p.e, p.L);
      const s = scale(q.e, q.L);
      const den = cross(r, s);
      if (Math.abs(den) < 1e-12) continue;
      const qp = sub(q.a.p, p.a.p);
      const t = cross(qp, s) / den;
      const u = cross(qp, r) / den;
      if (t > -1e-9 && t < 1 + 1e-9 && u > -1e-9 && u < 1 + 1e-9) findOrCreate(add(p.a.p, scale(r, t)));
    }

  // 3. Puntos de quiebre de cada barra.
  const breaks = new Map<string, number[]>(obars.map((b) => [b.id, [0, b.L]]));
  const addBreak = (b: OBar, s: number) => breaks.get(b.id)!.push(s);
  for (const b of obars)
    for (const n of nodes) {
      const rel = sub(n.p, b.a.p);
      const s = dot(rel, b.e);
      if (s > 1e-9 && s < b.L - 1e-9 && Math.abs(cross(b.e, rel)) < 1e-7) addBreak(b, s);
    }
  for (const ld of model.loads) {
    if (ld.type === 'distribuida') {
      const b = obar(ld.bar);
      addBreak(b, pos(b, ld.from));
      addBreak(b, pos(b, ld.to));
    } else if (ld.bar !== undefined) {
      const b = obar(ld.bar);
      addBreak(b, pos(b, ld.at ?? 0));
    }
  }

  // 4. Tramos.
  const bars: SBar[] = [];
  const segsOf = new Map<string, { s0: number; s1: number; bar: SBar }[]>();
  const usedBarIds = new Set<string>();
  for (const b of obars) {
    const bs = [...breaks.get(b.id)!].sort((x, y) => x - y).filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-9);
    const pts = bs.map((s) => (s === 0 ? b.a : Math.abs(s - b.L) < 1e-9 ? b.b : findOrCreate(add(b.a.p, scale(b.e, s)))));
    const list: { s0: number; s1: number; bar: SBar }[] = [];
    for (let k = 0; k < bs.length - 1; k++) {
      let id = `${pts[k].id}${pts[k + 1].id}`;
      while (usedBarIds.has(id)) id += "'";
      usedBarIds.add(id);
      const bar: SBar = {
        id,
        from: pts[k].id,
        to: pts[k + 1].id,
        orig: b.id,
        L: bs[k + 1] - bs[k],
        e: b.e,
        n: vec(-b.e.y, b.e.x),
        P0: pts[k].p,
        dist: [],
      };
      bars.push(bar);
      list.push({ s0: bs[k], s1: bs[k + 1], bar });
    }
    segsOf.set(b.id, list);
  }

  // 5. Cargas → nodos y tramos.
  const forces: NodeForce[] = [];
  const couples: NodeCouple[] = [];
  const nodeAt = (b: OBar, s: number): SNode => {
    if (Math.abs(s) < 1e-9) return b.a;
    if (Math.abs(s - b.L) < 1e-9) return b.b;
    return findOrCreate(add(b.a.p, scale(b.e, s)));
  };
  model.loads.forEach((ld, i) => {
    if (ld.type === 'distribuida') {
      const b = obar(ld.bar);
      let s0 = pos(b, ld.from);
      let s1 = pos(b, ld.to);
      let q0 = ld.q1;
      let q1 = ld.q2;
      if (s1 < s0) {
        [s0, s1] = [s1, s0];
        [q0, q1] = [q1, q0];
      }
      const qAt = (s: number) => q0 + ((q1 - q0) * (s - s0)) / (s1 - s0);
      const d = dirDeg(ld.angle ?? -90);
      for (const seg of segsOf.get(b.id)!) {
        if (seg.s0 >= s0 - 1e-9 && seg.s1 <= s1 + 1e-9) seg.bar.dist.push({ q1: qAt(seg.s0), q2: qAt(seg.s1), d });
      }
      return;
    }
    const node = ld.node !== undefined ? getNode(ld.node) : nodeAt(obar(ld.bar!), pos(obar(ld.bar!), ld.at ?? 0));
    if (ld.type === 'puntual') {
      forces.push({ node: node.id, F: scale(dirDeg(ld.angle), ld.value), label: `P${i + 1}` });
    } else {
      couples.push({ node: node.id, M: ld.value, label: `M${i + 1}` });
    }
  });

  for (const h of model.hinges ?? []) getNode(h.node).hinge = true;
  for (const s of model.supports) getNode(s.node);

  return { nodes, bars, supports: model.supports, forces, couples, node: getNode };
}

export { fmtNum };
export type { NodeDef };

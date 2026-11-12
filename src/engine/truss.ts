/**
 * Reticulados planos (TP N°5): barras articuladas en los nodos, cargas solo en los nodos.
 * Convención: barras supuestas traccionadas (la fuerza sale del nodo). Positivo = tracción (T),
 * negativo = compresión (C).
 * Condición de rigidez (criterio de Agustín): b = 2v − 3. Vinculación externa: 3 condiciones.
 */
import { Model, Vec, vec, sub, add, scale, dot, cross, norm, dirDeg, SupportDef } from './model.ts';
import { rank, solve } from './linalg.ts';
import { reactionDir } from './analysis.ts';

export type TrussStatus = 'isostatico' | 'hipostatico' | 'hiperestatico' | 'aparente' | 'invalido';

export interface TBar {
  id: string;
  a: string;
  b: string;
  L: number;
}

export interface TReaction {
  name: string;
  node: string;
  dir: Vec;
  type: SupportDef['type'];
  value: number;
}

export interface NodeEq {
  node: string;
  /** Barras con fuerza desconocida al llegar a este nodo. */
  unknown: string[];
  /** Fuerzas conocidas que actúan sobre el nodo: cargas, reacciones y barras ya resueltas. */
  known: { name: string; F: Vec; bar?: string }[];
  /** Para cada barra del nodo, vector unitario desde el nodo hacia la barra. */
  dirs: Record<string, Vec>;
  /** Verificación: nodo sin incógnitas. */
  verifica: boolean;
}

export interface ZeroBar {
  bar: string;
  node: string;
  regla: 'dos-barras' | 'tres-barras';
  /** Barras colineales (regla de tres barras). */
  colineales?: string[];
}

export interface TrussSolution {
  model: Model;
  bars: TBar[];
  pos: Record<string, Vec>;
  b: number;
  v: number;
  r: number;
  rigido: boolean;
  status: TrussStatus;
  motivo: string;
  reactions: TReaction[];
  forces: Record<string, number>;
  zero: ZeroBar[];
  /** Orden del método de los nodos; `atascado` = no quedan nodos con ≤ 2 incógnitas. */
  orden: NodeEq[];
  atascado: string[];
  residual: number;
}

export class TrussError extends Error {}

const restr = { movil: 1, biela: 1, fijo: 2, empotramiento: 3 } as const;

export function solveTruss(model: Model): TrussSolution {
  const pos: Record<string, Vec> = {};
  for (const n of model.nodes) pos[n.id] = vec(n.x, n.y);
  const nodeIds = model.nodes.map((n) => n.id);
  const bars: TBar[] = model.bars.map((bd) => {
    if (!pos[bd.from] || !pos[bd.to]) throw new TrussError(`La barra "${bd.id}" usa un nodo que no existe.`);
    const L = norm(sub(pos[bd.to], pos[bd.from]));
    if (L < 1e-9) throw new TrussError(`La barra "${bd.id}" tiene longitud nula.`);
    return { id: `${bd.from}${bd.to}`, a: bd.from, b: bd.to, L };
  });
  // Ids legibles por nodos (F_AB); si se repiten, se agrega una marca.
  const seen = new Set<string>();
  for (const b of bars) {
    while (seen.has(b.id)) b.id += "'";
    seen.add(b.id);
  }
  for (const l of model.loads) {
    if (l.type !== 'puntual' || !l.node) throw new TrussError('En un reticulado las cargas van solo en los nodos (cargas puntuales).');
  }
  const v = nodeIds.length;
  const b = bars.length;
  const reactions: TReaction[] = [];
  for (const s of model.supports) {
    if (s.type === 'empotramiento') throw new TrussError('Un reticulado no lleva empotramientos: usá apoyos fijos y móviles.');
    if (s.type === 'fijo') {
      reactions.push({ name: `R_{${s.node}x}`, node: s.node, dir: vec(1, 0), type: s.type, value: 0 });
      reactions.push({ name: `R_{${s.node}y}`, node: s.node, dir: vec(0, 1), type: s.type, value: 0 });
    } else {
      const d = reactionDir(s);
      const ax = Math.abs(d.y) < 1e-12 ? 'x' : Math.abs(d.x) < 1e-12 ? 'y' : '';
      reactions.push({ name: `R_{${s.node}${ax}}`, node: s.node, dir: d, type: s.type, value: 0 });
    }
  }
  const r = model.supports.reduce((s, x) => s + restr[x.type], 0);
  const rigido = b === 2 * v - 3;
  const dirFrom = (bar: TBar, node: string) => {
    const other = bar.a === node ? bar.b : bar.a;
    return scale(sub(pos[other], pos[node]), 1 / bar.L);
  };
  const loadsAt = (node: string) =>
    model.loads.filter((l) => l.type === 'puntual' && l.node === node).map((l, i) => ({ name: `P_{${node}}${i ? "'".repeat(i) : ''}`, F: scale(dirDeg((l as { angle: number }).angle), (l as { value: number }).value) }));

  const base = { model, bars, pos, b, v, r, rigido, reactions, forces: {} as Record<string, number>, zero: [] as ZeroBar[], orden: [] as NodeEq[], atascado: [] as string[], residual: NaN };
  const loose = nodeIds.filter((n) => !bars.some((x) => x.a === n || x.b === n));
  if (loose.length) return { ...base, status: 'invalido', motivo: `Hay nodos sin barras (${loose.join(', ')}).` };
  if (b < 2 * v - 3) return { ...base, status: 'hipostatico', motivo: `No se cumple la condición de rigidez: b = ${b} < 2v − 3 = ${2 * v - 3}. El reticulado es deformable.` };
  if (b > 2 * v - 3) return { ...base, status: 'hiperestatico', motivo: `No se cumple la condición de rigidez: b = ${b} > 2v − 3 = ${2 * v - 3}. Hay barras de más (hiperestático interno).` };
  if (r < 3) return { ...base, status: 'hipostatico', motivo: `Hay ${r} condiciones de vínculo externo y el reticulado, como cuerpo rígido, necesita 3.` };
  if (r > 3) return { ...base, status: 'hiperestatico', motivo: `Hay ${r} condiciones de vínculo externo; con 3 alcanza (hiperestático externo).` };

  // Sistema global: 2 ecuaciones por nodo; incógnitas = fuerzas en barras + reacciones.
  const nU = b + reactions.length;
  const A = Array.from({ length: 2 * v }, () => new Array(nU).fill(0));
  const f = new Array(2 * v).fill(0);
  nodeIds.forEach((n, i) => {
    bars.forEach((bar, j) => {
      if (bar.a !== n && bar.b !== n) return;
      const u = dirFrom(bar, n);
      A[2 * i][j] += u.x;
      A[2 * i + 1][j] += u.y;
    });
    reactions.forEach((re, j) => {
      if (re.node !== n) return;
      A[2 * i][b + j] += re.dir.x;
      A[2 * i + 1][b + j] += re.dir.y;
    });
    for (const l of loadsAt(n)) {
      f[2 * i] += l.F.x;
      f[2 * i + 1] += l.F.y;
    }
  });
  if (rank(A) < nU)
    return {
      ...base,
      status: 'aparente',
      motivo: 'Se cumple el conteo, pero la geometría o los vínculos permiten un movimiento (vinculación aparente o reticulado crítico, por ejemplo tres nodos alineados o reacciones concurrentes).',
    };
  const x = solve(A, f.map((t) => -t));
  const clean = (t: number) => (Math.abs(t) < 1e-9 ? 0 : +t.toPrecision(12));
  const forces: Record<string, number> = {};
  bars.forEach((bar, j) => (forces[bar.id] = clean(x[j])));
  reactions.forEach((re, j) => (re.value = clean(x[b + j])));
  const residual = Math.max(...A.map((row, i) => Math.abs(row.reduce((s, a, j) => s + a * x[j], 0) + f[i])));

  // Barras de fuerza nula por inspección (nodos sin carga ni vínculo).
  const zero: ZeroBar[] = [];
  const isZero = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodeIds) {
      if (loadsAt(n).length || model.supports.some((s) => s.node === n)) continue;
      const act = bars.filter((bar) => (bar.a === n || bar.b === n) && !isZero.has(bar.id));
      if (act.length === 2) {
        const [u1, u2] = act.map((bar) => dirFrom(bar, n));
        if (Math.abs(cross(u1, u2)) > 1e-9)
          for (const bar of act) {
            isZero.add(bar.id);
            zero.push({ bar: bar.id, node: n, regla: 'dos-barras' });
            changed = true;
          }
      } else if (act.length === 3) {
        const us = act.map((bar) => dirFrom(bar, n));
        for (let k = 0; k < 3; k++) {
          const [p, q] = [0, 1, 2].filter((t) => t !== k);
          if (Math.abs(cross(us[p], us[q])) < 1e-9 && Math.abs(cross(us[k], us[p])) > 1e-9) {
            isZero.add(act[k].id);
            zero.push({ bar: act[k].id, node: n, regla: 'tres-barras', colineales: [act[p].id, act[q].id] });
            changed = true;
            break;
          }
        }
      }
    }
  }

  // Método de los nodos: orden con a lo sumo dos incógnitas por nodo.
  const known = new Set<string>(); // barras resueltas
  const visited = new Set<string>();
  const orden: NodeEq[] = [];
  while (visited.size < v) {
    const cand = nodeIds
      .filter((n) => !visited.has(n))
      .map((n) => ({ n, unk: bars.filter((bar) => (bar.a === n || bar.b === n) && !known.has(bar.id)).map((bar) => bar.id) }))
      .filter((c) => c.unk.length <= 2)
      .map((c) => ({
        ...c,
        // Criterio parecido al del TP: primero nodos sin reacciones, siguiendo por vecinos de lo ya
        // resuelto; el apoyo con más reacciones queda al final para verificar.
        reac: reactions.filter((re) => re.node === c.n).length,
        vecino: visited.size === 0 || bars.some((bar) => (bar.a === c.n || bar.b === c.n) && known.has(bar.id)) ? 0 : 1,
      }))
      .sort((p, q) => p.reac - q.reac || p.vecino - q.vecino || p.unk.length - q.unk.length || nodeIds.indexOf(p.n) - nodeIds.indexOf(q.n));
    // Se prefiere un nodo que todavía tenga incógnitas; los que no tienen quedan para verificar al final.
    const pick = cand.find((c) => c.unk.length > 0) ?? cand[0];
    if (!pick) break;
    const n = pick.n;
    const dirs: Record<string, Vec> = {};
    const kn: NodeEq['known'] = [];
    for (const bar of bars) {
      if (bar.a !== n && bar.b !== n) continue;
      dirs[bar.id] = dirFrom(bar, n);
      if (known.has(bar.id)) kn.push({ name: `F_{${bar.id}}`, F: scale(dirs[bar.id], forces[bar.id]), bar: bar.id });
    }
    for (const l of loadsAt(n)) kn.push({ name: l.name, F: l.F });
    for (const re of reactions) if (re.node === n) kn.push({ name: re.name, F: scale(re.dir, re.value) });
    orden.push({ node: n, unknown: pick.unk, known: kn, dirs, verifica: pick.unk.length === 0 });
    pick.unk.forEach((id) => known.add(id));
    visited.add(n);
  }
  const atascado = nodeIds.filter((n) => !visited.has(n));
  return { ...base, status: 'isostatico', motivo: `b = ${b} = 2v − 3 = ${2 * v - 3} y 3 condiciones de vínculo externo, sin vinculación aparente.`, forces, zero, orden, atascado, residual };
}

// ---------- método de las secciones ----------

export interface SectionBar {
  bar: string;
  value: number;
  /** Punto de momentos (Ritter) o dirección de proyección si las otras dos son paralelas. */
  ecuacion: { tipo: 'momento'; punto: Vec; nombre: string } | { tipo: 'proyeccion'; dir: Vec };
  /** Términos de las fuerzas exteriores del lado elegido: nombre y aporte. */
  terminos: { name: string; aporte: number; F: Vec; P: Vec }[];
  /** Coeficiente de la barra incógnita (brazo o proyección de la fuerza unitaria). */
  coef: number;
}

export interface SectionResult {
  ok: boolean;
  motivo?: string;
  lado: string[];
  barras: SectionBar[];
}

export function sectionMethod(sol: TrussSolution, cut: string[]): SectionResult {
  const { bars, pos, model } = sol;
  if (cut.length < 2 || cut.length > 3) return { ok: false, motivo: 'Elegí 2 o 3 barras para cortar.', lado: [], barras: [] };
  const cutSet = new Set(cut);
  // Partes que quedan al quitar las barras cortadas.
  const nodeIds = model.nodes.map((n) => n.id);
  const comp = new Map<string, number>();
  let c = 0;
  for (const n of nodeIds) {
    if (comp.has(n)) continue;
    const stack = [n];
    comp.set(n, c);
    while (stack.length) {
      const m = stack.pop()!;
      for (const bar of bars) {
        if (cutSet.has(bar.id) || (bar.a !== m && bar.b !== m)) continue;
        const o = bar.a === m ? bar.b : bar.a;
        if (!comp.has(o)) {
          comp.set(o, c);
          stack.push(o);
        }
      }
    }
    c++;
  }
  if (c !== 2) return { ok: false, motivo: 'El corte tiene que separar el reticulado en exactamente dos partes.', lado: [], barras: [] };
  for (const id of cut) {
    const bar = bars.find((x) => x.id === id)!;
    if (comp.get(bar.a) === comp.get(bar.b)) return { ok: false, motivo: `La barra ${id} no atraviesa el corte.`, lado: [], barras: [] };
  }
  // Fuerzas exteriores por parte: se elige la que tiene menos.
  const extOf = (k: number) => {
    const out: { name: string; F: Vec; P: Vec }[] = [];
    for (const n of nodeIds) {
      if (comp.get(n) !== k) continue;
      model.loads.forEach((l) => {
        if (l.type === 'puntual' && l.node === n) out.push({ name: `P_{${n}}`, F: scale(dirDeg(l.angle), l.value), P: pos[n] });
      });
      for (const re of sol.reactions) if (re.node === n && Math.abs(re.value) > 1e-12) out.push({ name: re.name, F: scale(re.dir, re.value), P: pos[n] });
    }
    return out;
  };
  const side = extOf(0).length <= extOf(1).length ? 0 : 1;
  const ext = extOf(side);
  const lado = nodeIds.filter((n) => comp.get(n) === side);
  // Para cada barra cortada: punto (en la parte elegida) y dirección de la fuerza de tracción sobre esa parte.
  const info = cut.map((id) => {
    const bar = bars.find((x) => x.id === id)!;
    const n = comp.get(bar.a) === side ? bar.a : bar.b;
    const o = n === bar.a ? bar.b : bar.a;
    return { id, P: pos[n], u: scale(sub(pos[o], pos[n]), 1 / bar.L) };
  });
  const nodeAtPoint = (p: Vec) => nodeIds.find((n) => norm(sub(pos[n], p)) < 1e-6);
  const out: SectionBar[] = info.map((me) => {
    const others = info.filter((o) => o.id !== me.id);
    let ecuacion: SectionBar['ecuacion'];
    if (others.length === 2 && Math.abs(cross(others[0].u, others[1].u)) < 1e-9) {
      // Paralelas: proyección perpendicular a ellas.
      ecuacion = { tipo: 'proyeccion', dir: vec(-others[0].u.y, others[0].u.x) };
    } else {
      let P: Vec;
      if (others.length === 2) {
        const [o1, o2] = others;
        const t = cross(sub(o2.P, o1.P), o2.u) / cross(o1.u, o2.u);
        P = add(o1.P, scale(o1.u, t));
      } else P = others[0].P;
      const nm = nodeAtPoint(P);
      ecuacion = { tipo: 'momento', punto: P, nombre: nm ?? `(${+P.x.toFixed(3)}; ${+P.y.toFixed(3)})` };
    }
    const aporte = (F: Vec, Q: Vec) => (ecuacion.tipo === 'momento' ? cross(sub(Q, ecuacion.punto), F) : dot(F, ecuacion.dir));
    const terminos = ext.map((e) => ({ name: e.name, aporte: aporte(e.F, e.P), F: e.F, P: e.P }));
    const coef = aporte(me.u, me.P);
    const value = Math.abs(coef) < 1e-12 ? NaN : -terminos.reduce((s, t) => s + t.aporte, 0) / coef;
    return { bar: me.id, value: Math.abs(value) < 1e-9 ? 0 : value, ecuacion, terminos, coef };
  });
  return { ok: true, lado, barras: out };
}

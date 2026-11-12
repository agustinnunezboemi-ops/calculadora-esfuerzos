import assert from 'node:assert/strict';
import { Model, SupportDef, LoadDef } from '../src/engine/model.ts';
import { analyze, Solution } from '../src/engine/analysis.ts';

/** Viga horizontal: nodos en las abscisas dadas, una sola barra del primero al último. */
export function beam(points: Record<string, number>, supports: SupportDef[], loads: LoadDef[]): Model {
  const ids = Object.keys(points).sort((a, b) => points[a] - points[b]);
  return {
    nodes: ids.map((id) => ({ id, x: points[id], y: 0 })),
    bars: [{ id: 'viga', from: ids[0], to: ids[ids.length - 1] }],
    supports,
    loads,
  };
}

export const down = (node: string, value: number): LoadDef => ({ type: 'puntual', node, value, angle: -90 });
export const up = (node: string, value: number): LoadDef => ({ type: 'puntual', node, value, angle: 90 });

export function close(actual: number, expected: number, msg = '', tol = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)), `${msg}: esperado ${expected}, obtenido ${actual}`);
}

export function reaction(sol: Solution, name: string): number {
  const i = sol.unknowns.findIndex((u) => u.name === name);
  assert.ok(i >= 0, `no existe la incógnita ${name}; hay: ${sol.unknowns.map((u) => u.name).join(', ')}`);
  return sol.values[i];
}

/** Valor de un esfuerzo en un nodo: 'izq' = justo a la izquierda (fin del tramo que llega), 'der' = justo a la derecha. */
export function at(sol: Solution, key: 'N' | 'Q' | 'M', node: string, side: 'izq' | 'der'): number {
  if (side === 'izq') {
    const r = sol.bars.find((b) => b.bar.to === node);
    assert.ok(r, `ningún tramo termina en ${node}`);
    return r[key].eval(r.bar.L);
  }
  const r = sol.bars.find((b) => b.bar.from === node);
  assert.ok(r, `ningún tramo empieza en ${node}`);
  return r[key].eval(0);
}

export function solved(model: Model): Solution {
  const sol = analyze(model);
  assert.equal(sol.classification.status, 'isostatico', sol.classification.motivo);
  assert.ok(sol.residual < 1e-8, 'residuo de equilibrio');
  for (const b of sol.bars) assert.ok(b.izqIgualDer, `por izquierda ≠ por derecha en el tramo ${b.bar.id}`);
  for (const n of sol.nodeChecks) assert.ok(n.ok, `equilibrio del nudo ${n.node}: ${JSON.stringify(n)}`);
  return sol;
}

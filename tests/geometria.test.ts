import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { puntoEnRecta, alinearNodos } from '../src/engine/geometria.ts';
import { solveTruss } from '../src/engine/truss.ts';
import { close } from './helpers.ts';

test('punto sobre una recta oblicua por tangente (SOH CAH TOA)', () => {
  const r = puntoEnRecta({ x: 0, y: 0 }, { x: 7, y: 2.4 }, 3.8);
  close(r.y, (2.4 * 3.8) / 7, 'y de B');
  close(r.theta, (Math.atan(2.4 / 7) * 180) / Math.PI, 'θ');
  assert.match(r.desarrollo.join(' '), /θ = 18,925°/);
  const v = puntoEnRecta({ x: 2, y: 0 }, { x: 2, y: 5 }, 3, true);
  assert.deepEqual([v.x, v.y], [2, 3]);
  assert.throws(() => puntoEnRecta({ x: 2, y: 0 }, { x: 2, y: 5 }, 1), /vertical/);
});

test('TP N°5 · 1h: alinear B y F sobre las cuerdas da las fuerzas exactas', () => {
  const m = JSON.parse(readFileSync(new URL('./casos/tp5-1h.json', import.meta.url), 'utf8'));
  const { model, cambios } = alinearNodos(m);
  assert.deepEqual(cambios.map((c) => `${c.node}:${c.entre.join('')}`).sort(), ['B:AD', 'F:DH']);
  close(model.nodes.find((n: { id: string }) => n.id === 'B').y, (2.4 * 3.8) / 7, 'B sobre A–D');
  const s = solveTruss(model);
  assert.equal(s.status, 'isostatico');
  close(s.forces.AC, 44.625, 'AC');
  close(s.forces.CD, 17.5, 'CD');
  close(s.forces.AB, -47.175, 'AB');
  close(s.forces.BD, s.forces.AB, 'BD = AB (colineales)');
  close(s.forces.BC, -10.5, 'BC');
  close(s.forces.DE, 0, 'DE');
  // Un nodo claramente fuera de la recta no se toca
  assert.equal(alinearNodos(model).cambios.length, 0);
});

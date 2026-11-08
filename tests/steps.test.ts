import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/engine/analysis.ts';
import { buildSteps } from '../src/engine/steps.ts';
import { beam, down } from './helpers.ts';

const units = { fuerza: 'kN', longitud: 'm' };
const text = (steps: ReturnType<typeof buildSteps>) => steps.flatMap((s) => s.blocks.map((b) => ('text' in b ? b.text : JSON.stringify(b)))).join('\n');

test('paso a paso del Ejemplo 1 con la forma del apunte', () => {
  const s = analyze(beam({ A: 0, C: 2, B: 4 }, [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil' }], [down('C', 10), { type: 'puntual', node: 'B', value: 2, angle: 0 }]));
  const t = text(buildSteps(s, units));
  assert.match(t, /N_\{1–1\}\^\{IZQ\} = −\[ − R_\{Ax\} \]/);
  assert.match(t, /Q_\{1–1\}\^\{IZQ\} = \+\[ R_\{Ay\} \]/);
  assert.match(t, /Mf_\{1–1\}\^\{IZQ\} = −\[ − R_\{Ay\}·x_\{1\} \]/);
  assert.match(t, /Mf_\{2–2\}\^\{IZQ\} = −\[ P_\{C\}·x_\{2\} − R_\{Ay\}·\(2 \+ x_\{2\}\) \]/);
  assert.match(t, /se invierte el sentido supuesto/);
  assert.doesNotMatch(t, /warn/);
});

test('el paso a paso se detiene si no es isostático o hay vinculación aparente', () => {
  const hipo = buildSteps(analyze(beam({ A: 0, B: 4 }, [{ node: 'A', type: 'movil' }], [down('B', 1)])), units);
  assert.equal(hipo.length, 1);
  const ap = buildSteps(analyze(beam({ A: 0, B: 4 }, [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil', angle: 90 }], [down('B', 1)])), units);
  assert.equal(ap.length, 2);
  assert.equal(ap[1].blocks[0].t, 'warn');
});

test('paso a paso de pórtico y de viga Gerber sin advertencias', () => {
  const portico = analyze({
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: 3 }, { id: 'C', x: 4, y: 3 }],
    bars: [{ id: 'col', from: 'A', to: 'B' }, { id: 'viga', from: 'B', to: 'C' }],
    supports: [{ node: 'A', type: 'fijo' }, { node: 'C', type: 'movil' }],
    loads: [{ type: 'distribuida', bar: 'viga', from: 0, to: 4, q1: 2, q2: 2 }, { type: 'puntual', node: 'B', value: 4, angle: 0 }],
  });
  const gerber = analyze({
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'D', x: 4, y: 0 }, { id: 'B', x: 6, y: 0 }, { id: 'C', x: 10, y: 0 }],
    bars: [{ id: 'v', from: 'A', to: 'C' }],
    supports: [{ node: 'A', type: 'fijo' }, { node: 'D', type: 'movil' }, { node: 'C', type: 'movil' }],
    hinges: [{ node: 'B' }],
    loads: [{ type: 'puntual', bar: 'v', at: 8, value: 10, angle: -90 }],
  });
  for (const s of [portico, gerber]) {
    const steps = buildSteps(s, units);
    assert.ok(steps.length > 8);
    assert.ok(!steps.some((st) => st.blocks.some((b) => b.t === 'warn')), text(steps));
  }
});

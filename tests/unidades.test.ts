import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertModel } from '../src/ui/examples.ts';
import { analyze } from '../src/engine/analysis.ts';
import { close } from './helpers.ts';

test('convertir kN-m → kip-ft y volver deja el modelo igual', () => {
  const m = {
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 6, y: 0 }],
    bars: [{ id: 'AB', from: 'A', to: 'B' }],
    supports: [{ node: 'A', type: 'fijo' as const }, { node: 'B', type: 'movil' as const }],
    loads: [
      { type: 'distribuida' as const, bar: 'AB', from: 0, to: 6, q1: 3, q2: 3 },
      { type: 'cupla' as const, node: 'A', value: 10 },
    ],
  };
  const ft = convertModel(m, 'kN-m', 'kip-ft');
  close(ft.nodes[1].x, 19.685, 'L en ft', 1e-4);
  const back = convertModel(ft, 'kip-ft', 'kN-m');
  close(back.nodes[1].x, 6, 'L');
  close((back.loads[0] as { q1: number }).q1, 3, 'q', 1e-5);
  close((back.loads[1] as { value: number }).value, 10, 'cupla', 1e-5);
});

test('el momento máximo convertido coincide con la conversión del resultado', () => {
  const m = {
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 6, y: 0 }],
    bars: [{ id: 'AB', from: 'A', to: 'B' }],
    supports: [{ node: 'A', type: 'fijo' as const }, { node: 'B', type: 'movil' as const }],
    loads: [{ type: 'distribuida' as const, bar: 'AB', from: 0, to: 6, q1: 3, q2: 3 }],
  };
  const mSI = analyze(m).extremes.max.M.valor; // 13,5 kN·m
  const mUS = analyze(convertModel(m, 'kN-m', 'kip-ft')).extremes.max.M.valor;
  close(mUS, (mSI * 1000) / 4448.2216152605 / 0.3048, 'kip·ft', 1e-4);
});

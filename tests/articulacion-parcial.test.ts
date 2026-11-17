import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/engine/analysis.ts';
import caso from './casos/beer-chapa-L.json' with { type: 'json' };
import { Model } from '../src/engine/model.ts';

const modelo = () => structuredClone(caso) as unknown as Model;
const val = (sol: ReturnType<typeof analyze>, name: string) => sol.values[sol.unknowns.findIndex((u) => u.name === name)];

test('chapa en L que pasa por el pasador B y barra BD articulada en B: 2 chapas, isostática', () => {
  const sol = analyze(modelo());
  assert.equal(sol.classification.status, 'isostatico');
  assert.equal(new Set(sol.chapaOf).size, 2);
  // Equilibrio de la chapa I (A–E–B–C) con BD biela: ΣM_C = 0 → F_BD y RC (Beer 4.?)
  const RDx = val(sol, 'R_{Dx}'), RDy = val(sol, 'R_{Dy}');
  // BD es una biela (sin cargas): la reacción en D es colineal con BD (240; 450)
  assert.ok(Math.abs(RDx * 450 - RDy * 240) < 1e-6);
  // ΣM_C: 400·0,135 = F_BDx·0,45 (brazo de la componente horizontal en B respecto de C)
  assert.ok(Math.abs(Math.abs(RDx) - (400 * 0.135) / 0.45) < 1e-6);
});

test('sin indicar barras articuladas: hipostática con pista de la barra pasante', () => {
  const m = modelo();
  m.hinges = [{ node: 'B' }];
  const sol = analyze(m);
  assert.equal(sol.classification.status, 'hipostatico');
  assert.match(sol.classification.motivo, /EC pasa continua/);
});

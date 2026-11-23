/** Reticulados: ejercicio resuelto y ejercicio 1 del TP N°5. Positivo = tracción. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solveTruss, sectionMethod } from '../src/engine/truss.ts';
import { Model } from '../src/engine/model.ts';
import { close } from './helpers.ts';

const P = (node: string, value: number, angle = -90) => ({ type: 'puntual' as const, node, value, angle });
const bars = (...ids: string[]) => ids.map((id) => ({ id, from: id[0], to: id[1] }));

/** Ejercicio resuelto del TP N°5 (método de los nodos), en lb y ft. */
const resuelto: Model = {
  nodes: [{ id: 'A', x: 0, y: 8 }, { id: 'B', x: 12, y: 8 }, { id: 'C', x: 24, y: 8 }, { id: 'D', x: 6, y: 0 }, { id: 'E', x: 18, y: 0 }],
  bars: bars('AB', 'BC', 'AD', 'DB', 'DE', 'BE', 'EC'),
  supports: [{ node: 'C', type: 'fijo' }, { node: 'E', type: 'movil' }],
  loads: [P('A', 2000), P('B', 1000)],
};

test('TP N°5 · ejercicio resuelto: RVE y fuerzas en todas las barras', () => {
  const s = solveTruss(resuelto);
  assert.equal(s.status, 'isostatico', s.motivo);
  assert.ok(s.rigido);
  const R = (n: string) => s.reactions.find((r) => r.name === n)!.value;
  close(R('R_{Ey}'), 10000, 'E');
  close(R('R_{Cx}'), 0, 'Cx');
  close(R('R_{Cy}'), -7000, 'Cy (hacia abajo)');
  const F = s.forces;
  close(F.AB, 1500, 'AB (T)');
  close(F.AD, -2500, 'AD (C)');
  close(F.DB, 2500, 'DB (T)');
  close(F.DE, -3000, 'DE (C)');
  close(F.BE, -3750, 'BE (C)');
  close(F.BC, 5250, 'BC (T)');
  close(F.EC, -8750, 'EC (C)');
  // Orden del TP: A, D, B, E y C verifica
  assert.deepEqual(s.orden.map((o) => o.node), ['A', 'D', 'B', 'E', 'C']);
  assert.ok(s.orden[4].verifica);
  assert.equal(s.atascado.length, 0);
});

test('TP N°5 · 1a (kN, m)', () => {
  const s = solveTruss({
    nodes: [{ id: 'A', x: 3, y: 5.25 }, { id: 'B', x: 0, y: 4 }, { id: 'C', x: 3, y: 0 }],
    bars: bars('AB', 'AC', 'BC'),
    supports: [{ node: 'A', type: 'fijo' }, { node: 'C', type: 'movil', angle: 90 }],
    loads: [P('B', 84)],
  });
  assert.equal(s.status, 'isostatico', s.motivo);
  close(s.forces.AB, 52, 'AB');
  close(s.forces.AC, 64, 'AC');
  close(s.forces.BC, -80, 'BC');
});

test('TP N°5 · 1b (lb, ft)', () => {
  const s = solveTruss({
    nodes: [{ id: 'A', x: 12, y: 9 }, { id: 'B', x: 0, y: 0 }, { id: 'C', x: 15.75, y: 0 }],
    bars: bars('AB', 'AC', 'BC'),
    supports: [{ node: 'B', type: 'fijo' }, { node: 'C', type: 'movil' }],
    loads: [P('A', 945)],
  });
  close(s.forces.AB, -375, 'AB');
  close(s.forces.AC, -780, 'AC');
  close(s.forces.BC, 300, 'BC');
});

const ej1c: Model = {
  nodes: [{ id: 'A', x: 0, y: 6.4 }, { id: 'B', x: 12, y: 6.4 }, { id: 'C', x: 24, y: 6.4 }, { id: 'D', x: 0, y: 0 }, { id: 'E', x: 12, y: 0 }, { id: 'F', x: 24, y: 0 }],
  bars: bars('AB', 'BC', 'AD', 'BD', 'BE', 'BF', 'CF', 'DE', 'EF'),
  supports: [{ node: 'D', type: 'movil' }, { node: 'F', type: 'fijo' }],
  loads: [P('A', 1), P('B', 4), P('C', 1), P('E', 2.4)],
};

test('TP N°5 · 1c (kips, ft) y barras de fuerza nula', () => {
  const s = solveTruss(ej1c);
  assert.equal(s.status, 'isostatico', s.motivo);
  const F = s.forces;
  close(F.AB, 0, 'AB');
  close(F.BC, 0, 'BC');
  close(F.BD, -6.8, 'BD');
  close(F.BE, 2.4, 'BE');
  close(F.BF, -6.8, 'BF');
  close(F.DE, 6, 'DE');
  close(F.EF, 6, 'EF');
  // El TP indica F_AD = F_CF = 1 kip; la carga de 1 kip hacia abajo en A solo puede
  // equilibrarse con AD comprimida: F_AD = −1 kip (y F_CF = −1 kip).
  close(F.AD, -1, 'AD (errata de signo en el TP)');
  close(F.CF, -1, 'CF');
  // A y C tienen carga, pero colineal con AD y CF: AB y BC son nulas por inspección (carga colineal)
  assert.ok(s.zero.some((z) => z.bar === 'AB' && z.regla === 'carga-colineal'));
  assert.ok(s.zero.some((z) => z.bar === 'BC' && z.regla === 'carga-colineal'));
});

test('método de las secciones: coincide con el de los nodos', () => {
  const s = solveTruss(ej1c);
  const sec = sectionMethod(s, ['BC', 'BF', 'EF']);
  assert.ok(sec.ok, sec.motivo);
  for (const b of sec.barras) close(b.value, s.forces[b.bar], `sección ${b.bar}`);
  // Ritter: para EF el punto de momentos es B (intersección de BC y BF)
  const ef = sec.barras.find((b) => b.bar === 'EF')!;
  assert.equal(ef.ecuacion.tipo, 'momento');
  if (ef.ecuacion.tipo === 'momento') assert.equal(ef.ecuacion.nombre, 'B');
});

test('rigidez y vinculación: deformable, de más y vinculación aparente', () => {
  const cuadro: Model = {
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 4, y: 0 }, { id: 'C', x: 4, y: 3 }, { id: 'D', x: 0, y: 3 }],
    bars: bars('AB', 'BC', 'CD', 'DA'),
    supports: [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil' }],
    loads: [P('C', 1)],
  };
  assert.equal(solveTruss(cuadro).status, 'hipostatico');
  assert.equal(solveTruss({ ...cuadro, bars: bars('AB', 'BC', 'CD', 'DA', 'AC', 'BD') }).status, 'hiperestatico');
  const ap = solveTruss({ ...cuadro, bars: bars('AB', 'BC', 'CD', 'DA', 'AC'), supports: [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil', angle: 90 }] });
  assert.equal(ap.status, 'aparente');
});

test('barra de fuerza nula por la regla de dos barras', () => {
  const s = solveTruss({
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 4, y: 0 }, { id: 'C', x: 2, y: 3 }, { id: 'D', x: 6, y: 3 }],
    bars: bars('AB', 'AC', 'BC', 'BD', 'CD'),
    supports: [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil' }],
    loads: [P('C', 10)],
  });
  assert.equal(s.status, 'isostatico', s.motivo);
  const z = s.zero.map((x) => x.bar).sort();
  assert.deepEqual(z, ['BD', 'CD']);
  close(s.forces.BD, 0, 'BD');
  close(s.forces.CD, 0, 'CD');
});

test('TP N°5 · 1i (lb, ft), cargado por Agustín: simetría y nodo A', async () => {
  const { readFileSync } = await import('node:fs');
  const s = solveTruss(JSON.parse(readFileSync(new URL('./casos/tp5-1i.json', import.meta.url), 'utf8')));
  assert.equal(s.status, 'isostatico', s.motivo);
  const R = (n: string) => s.reactions.find((r) => r.name === n)!.value;
  close(R('R_{Ay}'), 1200, 'R_A');
  close(R('R_{Ey}'), 1200, 'R_E');
  // Nodo A: 0,6·F_FA + 1200 − 300 = 0 → F_FA = −1500; F_AB + 0,8·F_FA = 0 → 1200
  close(s.forces.FA, -1500, 'FA');
  close(s.forces.AB, 1200, 'AB');
  close(s.forces.EG, -1500, 'EG (simétrica de FA)');
  close(s.forces.HF, s.forces.GH, 'HF = GH por simetría');
  for (const id of ['FB', 'DG']) assert.ok(s.zero.some((z) => z.bar === id), `${id} nula por inspección`);
  for (const id of ['HC', 'GC', 'FC']) close(s.forces[id], 0, `${id} = 0 con esta carga`);
});

test('TP N°5 · 1d: reticulado de 4 nodos con apoyo móvil en D (kip-ft)', () => {
  const s = solveTruss(JSON.parse(readFileSync(new URL('./casos/tp5-1d.json', import.meta.url), 'utf8')));
  assert.equal(s.status, 'isostatico', s.motivo);
  const R = (n: string) => s.reactions.find((r) => r.name === n)!.value;
  close(R('R_{Dy}'), 10.8 * 80 / 22.5, 'R_D (ΣM_A)');
  close(R('R_{Ay}'), -16.8, 'R_A');
  // Nodo C: F_CD·(−12/37) = 10,8 → F_CD = −33,3; F_BC = −F_CD·35/37 = 31,5
  close(s.forces.CD, -33.3, 'CD');
  close(s.forces.BC, 31.5, 'BC');
  close(s.forces.AB, 31.5, 'AB');
  close(s.forces.BD, -10.8, 'BD');
  close(s.forces.DA, -35.7, 'DA');
});

test('TP N°5 · 1j: cordón superior recto; DF nula por la carga colineal con EF en F', () => {
  const s = solveTruss(JSON.parse(readFileSync(new URL('./casos/tp5-1j.json', import.meta.url), 'utf8')));
  assert.equal(s.status, 'isostatico', s.motivo);
  close(s.forces.AB, -6.24, 'AB');
  close(s.forces.AC, 5.76, 'AC');
  close(s.forces.BD, -4.16, 'BD');
  close(s.forces.CE, 2.88, 'CE');
  close(s.forces.EF, -1.2, 'EF');
  close(s.forces.DF, 0, 'DF');
  assert.ok(s.zero.some((z) => z.bar === 'DF' && z.regla === 'carga-colineal'), 'DF nula por inspección');
});

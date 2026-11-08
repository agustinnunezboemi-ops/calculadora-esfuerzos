import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/engine/analysis.ts';
import { beam, down, close, at, reaction, solved } from './helpers.ts';

test('hipostático: solo un apoyo móvil', () => {
  const s = analyze(beam({ A: 0, B: 4 }, [{ node: 'A', type: 'movil' }], [down('B', 1)]));
  assert.equal(s.classification.status, 'hipostatico');
});

test('hiperestático: dos apoyos fijos', () => {
  const s = analyze(beam({ A: 0, B: 4 }, [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'fijo' }], [down('B', 1)]));
  assert.equal(s.classification.status, 'hiperestatico');
});

test('vinculación aparente: la normal del móvil pasa por el fijo', () => {
  const s = analyze(beam({ A: 0, B: 4 }, [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil', angle: 90 }], [down('B', 1)]));
  assert.equal(s.classification.status, 'aparente');
  assert.match(s.classification.motivo, /pasa por el apoyo fijo A/);
});

test('vinculación aparente: tres móviles paralelos', () => {
  const s = analyze(beam({ A: 0, B: 2, C: 4 }, [{ node: 'A', type: 'movil' }, { node: 'B', type: 'movil' }, { node: 'C', type: 'movil' }], [down('B', 1)]));
  assert.equal(s.classification.status, 'aparente');
});

test('columna empotrada: SRP con x\' hacia arriba e y\' hacia la izquierda', () => {
  const P = 2, H = 3;
  const s = solved({
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: H }],
    bars: [{ id: 'col', from: 'B', to: 'A' }], // se reorienta sola de abajo hacia arriba
    supports: [{ node: 'A', type: 'empotramiento' }],
    loads: [{ type: 'puntual', node: 'B', value: P, angle: 0 }],
  });
  const b = s.bars[0];
  assert.equal(b.bar.from, 'A');
  close(b.bar.n.x, -1, "y' apunta a la izquierda del SRG");
  close(b.Q.eval(0), P, 'Q = +P');
  close(b.M.eval(0), -P * H, 'Mf en la base = −P·H');
  close(b.M.eval(H), 0, 'Mf en el extremo libre');
  close(reaction(s, 'Me_{A}'), P * H, 'momento de empotramiento');
});

test('pórtico en L: equilibrio del nudo rígido', () => {
  const s = solved({
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: 3 }, { id: 'C', x: 4, y: 3 }],
    bars: [{ id: 'col', from: 'A', to: 'B' }, { id: 'viga', from: 'B', to: 'C' }],
    supports: [{ node: 'A', type: 'fijo' }, { node: 'C', type: 'movil' }],
    loads: [
      { type: 'puntual', bar: 'viga', at: 2, value: 10, angle: -90 },
      { type: 'puntual', node: 'B', value: 4, angle: 0 },
    ],
  });
  // Momento continuo en el nudo rígido B: fin de la columna = inicio de la viga
  close(at(s, 'M', 'B', 'izq'), at(s, 'M', 'B', 'der'), 'Mf continuo en B');
});

test('viga Gerber (dos chapas con articulación)', () => {
  const s = solved({
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'D', x: 4, y: 0 }, { id: 'B', x: 6, y: 0 }, { id: 'E', x: 8, y: 0 }, { id: 'C', x: 10, y: 0 }],
    bars: [{ id: 'viga', from: 'A', to: 'C' }],
    supports: [{ node: 'A', type: 'fijo' }, { node: 'D', type: 'movil' }, { node: 'C', type: 'movil' }],
    hinges: [{ node: 'B' }],
    loads: [down('E', 10)],
  });
  assert.equal(s.classification.chapas, 2);
  close(reaction(s, 'R_{Cy}'), 5, 'R_C');
  close(reaction(s, 'R_{Dy}'), 7.5, 'R_D');
  close(reaction(s, 'R_{Ay}'), -2.5, 'R_A');
  close(at(s, 'M', 'B', 'izq'), 0, 'Mf = 0 en la articulación');
  close(at(s, 'M', 'B', 'der'), 0, 'Mf = 0 en la articulación');
  close(at(s, 'M', 'D', 'izq'), -10, 'Mf en D');
  close(at(s, 'M', 'E', 'izq'), 10, 'Mf bajo la carga');
});

test('carga triangular: máximo en L/√3', () => {
  const q0 = 6, L = 3;
  const s = solved(beam({ A: 0, B: L }, [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil' }], [{ type: 'distribuida', bar: 'viga', from: 0, to: L, q1: 0, q2: q0 }]));
  close(reaction(s, 'R_{Ay}'), (q0 * L) / 6, 'R_A');
  close(reaction(s, 'R_{By}'), (q0 * L) / 3, 'R_B');
  close(s.extremes.max.M.valor, (q0 * L * L) / (9 * Math.sqrt(3)), 'Mmax');
  close(s.extremes.max.M.x, L / Math.sqrt(3), 'x de Mmax');
});

test('barra inclinada con carga vertical por unidad de longitud real', () => {
  // Barra a 30°, longitud real 4, q vertical 2 por metro de barra: resultante 8
  const c = Math.cos(Math.PI / 6), sn = Math.sin(Math.PI / 6), Lr = 4;
  const s = solved({
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: Lr * c, y: Lr * sn }],
    bars: [{ id: 'b', from: 'A', to: 'B' }],
    supports: [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil' }],
    loads: [{ type: 'distribuida', bar: 'b', from: 0, to: Lr, q1: 2, q2: 2 }],
  });
  close(reaction(s, 'R_{Ay}') + reaction(s, 'R_{By}'), 8, 'ΣR = q·L real');
  close(s.extremes.max.M.valor, (2 * c * Lr * Lr) / 8, 'Mmax = q·cos(α)·L²/8');
});

test('apoyo móvil sobre plano vertical: la reacción se supone hacia +x (SRG)', () => {
  const s = solved({
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: 3 }],
    bars: [{ id: 'col', from: 'A', to: 'B' }],
    supports: [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil', angle: 90 }],
    loads: [{ type: 'puntual', node: 'B', value: 5, angle: 180 }],
  });
  const u = s.unknowns.find((x) => x.name === 'R_{Bx}')!;
  assert.deepEqual([u.dir.x, u.dir.y], [1, 0]);
  close(reaction(s, 'R_{Bx}'), 5, 'R_Bx = +5 (hacia la derecha)');
});

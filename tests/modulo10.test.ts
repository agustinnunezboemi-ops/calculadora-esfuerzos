/** Ejemplos 1 y 2 del módulo ITBA 10 (Prof. N. G. Franco). */
import { test } from 'node:test';
import { beam, down, close, reaction, at, solved } from './helpers.ts';

test('Ejemplo 1: puntual P en L/2 y horizontal F en B', () => {
  const L = 4, P = 10, F = 2;
  const sol = solved(
    beam({ A: 0, C: L / 2, B: L }, [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil' }], [
      down('C', P),
      { type: 'puntual', node: 'B', value: F, angle: 0 },
    ]),
  );
  close(reaction(sol, 'R_{Ax}'), -F, 'R_Ax = −F');
  close(reaction(sol, 'R_{Ay}'), P / 2, 'R_Ay');
  close(reaction(sol, 'R_{By}'), P / 2, 'R_By');
  // N = +F (tracción) en toda la viga
  for (const b of sol.bars) close(b.N.eval(0), F, 'N'), close(b.N.eval(b.bar.L), F, 'N');
  // Q1-1 = +P/2 ; Q2-2 = −P/2
  close(at(sol, 'Q', 'A', 'der'), P / 2, 'Q1-1');
  close(at(sol, 'Q', 'C', 'der'), -P / 2, 'Q2-2');
  // Mf1-1 = P/2·x1 ; Mf2-2 = PL/4 − P/2·x2
  const t1 = sol.bars[0];
  close(t1.M.c[0], 0, 'Mf1-1 ordenada'), close(t1.M.c[1], P / 2, 'Mf1-1 pendiente');
  const t2 = sol.bars[1];
  close(t2.M.c[0], (P * L) / 4, 'Mf2-2 ordenada'), close(t2.M.c[1], -P / 2, 'Mf2-2 pendiente');
  close(sol.extremes.max.M.valor, (P * L) / 4, 'Mf máx');
});

test('Ejemplo 2: carga uniforme q en toda la luz', () => {
  const L = 6, q = 3;
  const sol = solved(
    beam({ A: 0, B: L }, [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil' }], [
      { type: 'distribuida', bar: 'viga', from: 0, to: L, q1: q, q2: q },
    ]),
  );
  close(reaction(sol, 'R_{Ax}'), 0, 'R_Ax');
  close(reaction(sol, 'R_{Ay}'), (q * L) / 2, 'R_Ay');
  close(reaction(sol, 'R_{By}'), (q * L) / 2, 'R_By');
  const t = sol.bars[0];
  // Q = qL/2 − q·x ; Mf = −q/2·x² + qL/2·x
  close(t.Q.c[0], (q * L) / 2, 'Q h'), close(t.Q.c[1], -q, 'Q m');
  close(t.M.c[0], 0, 'Mf c'), close(t.M.c[1], (q * L) / 2, 'Mf b'), close(t.M.c[2], -q / 2, 'Mf a');
  close(sol.extremes.max.M.valor, (q * L * L) / 8, 'vértice y_v');
  close(sol.extremes.max.M.x, L / 2, 'vértice x_v');
  // dQ/dx = −q, dMf/dx = Q
  close(t.Q.derivative().c[0], -q, 'dQ/dx');
  close(t.M.derivative().c[1], t.Q.c[1], 'dMf/dx');
});

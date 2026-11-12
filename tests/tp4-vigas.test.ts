/**
 * TP N°4, ejercicio 1 (vigas de una chapa). Valores de las respuestas del TP;
 * los casos con letras se resuelven con valores numéricos elegidos.
 * Notas sobre erratas del TP: en 1f el TP indica Mb = PL, pero con Q = −P constante
 * Mb = Ma − P·L = 0; en 1l el TP da Mc = 60 kNm, que por la convención del módulo 10
 * es −60 kNm (voladizo); el resto de 1l coincide.
 */
import { test } from 'node:test';
import { beam, down, up, close, at, solved } from './helpers.ts';

const fijo = (node: string) => ({ node, type: 'fijo' as const });
const movil = (node: string) => ({ node, type: 'movil' as const });
const emp = (node: string) => ({ node, type: 'empotramiento' as const });

test('1a: P a L/3', () => {
  const P = 9, L = 3;
  const s = solved(beam({ A: 0, B: L / 3, C: L }, [fijo('A'), movil('C')], [down('B', P)]));
  close(at(s, 'Q', 'A', 'der'), (2 / 3) * P, 'Qa');
  close(at(s, 'Q', 'B', 'izq'), (2 / 3) * P, 'Qb izq');
  close(at(s, 'Q', 'B', 'der'), -(1 / 3) * P, 'Qb der');
  close(at(s, 'Q', 'C', 'izq'), -(1 / 3) * P, 'Qc');
  close(at(s, 'M', 'B', 'izq'), (2 / 9) * P * L, 'Mb');
  close(at(s, 'M', 'C', 'izq'), 0, 'Mc');
});

test('1b: voladizo con dos cargas P', () => {
  const P = 1, a = 2;
  const s = solved(beam({ A: 0, B: a, C: 2 * a }, [emp('C')], [down('A', P), down('B', P)]));
  close(at(s, 'Q', 'A', 'der'), -P, 'Qa');
  close(at(s, 'Q', 'B', 'der'), -2 * P, 'Qb der');
  close(at(s, 'M', 'B', 'izq'), -P * a, 'Mb');
  close(at(s, 'M', 'C', 'izq'), -3 * P * a, 'Mc');
});

test('1c: voladizo con w en la mitad libre', () => {
  const w = 2, L = 4;
  const s = solved(beam({ A: 0, B: L / 2, C: L }, [emp('C')], [{ type: 'distribuida', bar: 'viga', from: 0, to: L / 2, q1: w, q2: w }]));
  close(at(s, 'Q', 'A', 'der'), 0, 'Qa');
  close(at(s, 'Q', 'B', 'izq'), -(w * L) / 2, 'Qb');
  close(at(s, 'M', 'B', 'izq'), -(w * L * L) / 8, 'Mb');
  close(at(s, 'M', 'C', 'izq'), -(3 / 8) * w * L * L, 'Mc');
});

test('1d: w en la mitad central', () => {
  const w = 4, L = 4;
  const s = solved(beam({ A: 0, B: L / 4, C: (3 * L) / 4, D: L }, [fijo('A'), movil('D')], [{ type: 'distribuida', bar: 'viga', from: L / 4, to: (3 * L) / 4, q1: w, q2: w }]));
  close(at(s, 'Q', 'A', 'der'), (w * L) / 4, 'Qa');
  close(at(s, 'Q', 'C', 'izq'), -(w * L) / 4, 'Qc');
  close(at(s, 'M', 'B', 'izq'), (w * L * L) / 16, 'Mb');
  close(s.extremes.max.M.valor, (3 / 32) * w * L * L, 'Mmax');
  close(s.extremes.max.M.p.x, L / 2, 'x de Mmax');
});

test('1e: cupla M0 horaria en el centro', () => {
  const M0 = 8, L = 4;
  const s = solved(beam({ A: 0, B: L / 2, C: L }, [fijo('A'), movil('C')], [{ type: 'cupla', node: 'B', value: -M0 }]));
  close(at(s, 'Q', 'A', 'der'), -M0 / L, 'Qa');
  close(at(s, 'M', 'B', 'izq'), -M0 / 2, 'Mb izq');
  close(at(s, 'M', 'B', 'der'), M0 / 2, 'Mb der');
  close(at(s, 'M', 'C', 'izq'), 0, 'Mc');
});

test('1f: voladizo con P y cupla PL horaria en el extremo libre', () => {
  const P = 3, L = 2;
  const s = solved(beam({ A: 0, B: L }, [emp('B')], [down('A', P), { type: 'cupla', node: 'A', value: -P * L }]));
  close(at(s, 'Q', 'A', 'der'), -P, 'Qa');
  close(at(s, 'M', 'A', 'der'), P * L, 'Ma');
  close(at(s, 'M', 'B', 'izq'), 0, 'Mb (el TP dice PL: errata)');
});

test('1g: voladizo con cupla, 30 y 20 kN', () => {
  const s = solved(
    beam({ A: 0, C: 1, D: 1.5, E: 2, B: 2.5 }, [emp('B')], [up('A', 15), { type: 'cupla', node: 'C', value: 10 }, down('D', 30), down('E', 20)]),
  );
  close(at(s, 'Q', 'A', 'der'), 15, 'Qa');
  close(at(s, 'Q', 'D', 'der'), -15, 'Qd der');
  close(at(s, 'Q', 'E', 'der'), -35, 'Qe der');
  close(at(s, 'M', 'C', 'izq'), 15, 'Mc izq');
  close(at(s, 'M', 'C', 'der'), 5, 'Mc der');
  close(at(s, 'M', 'D', 'izq'), 12.5, 'Md');
  close(at(s, 'M', 'E', 'izq'), 5, 'Me');
  close(at(s, 'M', 'B', 'izq'), -12.5, 'Mb');
});

test('1h: tres cargas puntuales (kN)', () => {
  const s = solved(beam({ A: 0, C: 0.6, D: 1.5, E: 3, B: 3.2 }, [fijo('A'), movil('B')], [down('C', 40), down('D', 32), down('E', 16)]));
  close(at(s, 'Q', 'A', 'der'), 50.5, 'Qa');
  close(at(s, 'Q', 'C', 'der'), 10.5, 'Qc der');
  close(at(s, 'Q', 'D', 'der'), -21.5, 'Qd der');
  close(at(s, 'Q', 'E', 'der'), -37.5, 'Qe der');
  close(at(s, 'M', 'C', 'izq'), 30.3, 'Mc');
  close(at(s, 'M', 'D', 'izq'), 39.75, 'Md');
  close(at(s, 'M', 'E', 'izq'), 7.5, 'Me');
});

test('1i: voladizo derecho (kips, ft)', () => {
  const s = solved(beam({ A: 0, C: 2, D: 4, E: 6, B: 8 }, [fijo('A'), movil('E')], [down('C', 6), down('D', 12), down('B', 4.5)]));
  close(at(s, 'Q', 'A', 'der'), 6.5, 'Qa');
  close(at(s, 'Q', 'C', 'der'), 0.5, 'Qc der');
  close(at(s, 'Q', 'D', 'der'), -11.5, 'Qd der');
  close(at(s, 'Q', 'E', 'der'), 4.5, 'Qe der');
  close(at(s, 'M', 'C', 'izq'), 13, 'Mc');
  close(at(s, 'M', 'D', 'izq'), 14, 'Md');
  close(at(s, 'M', 'E', 'izq'), -9, 'Me');
});

test('1j: dos voladizos (lb, in)', () => {
  const s = solved(beam({ A: 0, C: 10, D: 35, E: 55, B: 70 }, [fijo('C'), movil('E')], [down('A', 120), down('D', 300), down('B', 120)]));
  close(at(s, 'Q', 'A', 'der'), -120, 'Qa');
  close(at(s, 'Q', 'C', 'der'), 120, 'Qc der');
  close(at(s, 'Q', 'D', 'der'), -180, 'Qd der');
  close(at(s, 'Q', 'E', 'der'), 120, 'Qe der');
  close(at(s, 'M', 'C', 'izq'), -1200, 'Mc');
  close(at(s, 'M', 'D', 'izq'), 1800, 'Md');
  close(at(s, 'M', 'E', 'izq'), -1800, 'Me');
});

test('1k: puntual y distribuida parcial (kN, m)', () => {
  const s = solved(beam({ A: 0, C: 2, D: 3, B: 5 }, [fijo('A'), movil('B')], [down('C', 60), { type: 'distribuida', bar: 'viga', from: 3, to: 5, q1: 25, q2: 25 }]));
  close(at(s, 'Q', 'A', 'der'), 46, 'Qa');
  close(at(s, 'Q', 'C', 'der'), -14, 'Qc der');
  close(at(s, 'Q', 'B', 'izq'), -64, 'Qb');
  close(at(s, 'M', 'C', 'izq'), 92, 'Mc');
  close(at(s, 'M', 'D', 'izq'), 78, 'Md');
});

test('1l: voladizo izquierdo con distribuida', () => {
  const s = solved(beam({ A: 0, C: 2, D: 5, B: 7 }, [movil('C'), fijo('B')], [{ type: 'distribuida', bar: 'viga', from: 0, to: 2, q1: 30, q2: 30 }, down('D', 80)]));
  close(at(s, 'Q', 'A', 'der'), 0, 'Qa');
  close(at(s, 'Q', 'C', 'izq'), -60, 'Qc izq');
  close(at(s, 'Q', 'C', 'der'), 44, 'Qc der');
  close(at(s, 'Q', 'D', 'der'), -36, 'Qd der');
  close(at(s, 'M', 'C', 'izq'), -60, 'Mc (el TP dice 60: errata de signo)');
  close(at(s, 'M', 'D', 'izq'), 72, 'Md');
});

test('1m: distribuida entre dos puntuales (kips/ft)', () => {
  const s = solved(
    beam({ A: 0, C: 2, D: 7, B: 9 }, [fijo('A'), movil('B')], [down('C', 8), down('D', 8), { type: 'distribuida', bar: 'viga', from: 2, to: 7, q1: 4, q2: 4 }]),
  );
  close(at(s, 'Q', 'A', 'der'), 18, 'Qa');
  close(at(s, 'Q', 'C', 'der'), 10, 'Qc der');
  close(at(s, 'Q', 'D', 'izq'), -10, 'Qd izq');
  close(at(s, 'Q', 'D', 'der'), -18, 'Qd der');
  close(s.extremes.max.M.valor, 48.5, 'Mmax');
  close(s.extremes.max.M.p.x, 4.5, 'x de Mmax');
});

test('1n: distribuida y puntual de 12 kips', () => {
  const s = solved(beam({ A: 0, C: 6, B: 10 }, [fijo('A'), movil('B')], [{ type: 'distribuida', bar: 'viga', from: 0, to: 6, q1: 2.5, q2: 2.5 }, down('C', 12)]));
  close(at(s, 'Q', 'A', 'der'), 15.3, 'Qa');
  close(at(s, 'Q', 'C', 'izq'), 0.3, 'Qc izq');
  close(at(s, 'Q', 'C', 'der'), -11.7, 'Qc der');
  close(s.extremes.max.M.valor, 46.8, 'Mmax');
  close(s.extremes.max.M.p.x, 6, 'x de Mmax');
});

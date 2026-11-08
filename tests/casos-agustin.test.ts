/**
 * Casos cargados por Agustín en la app y verificados contra su resolución en papel.
 * Sirven como pruebas de regresión: si un cambio del motor altera estos valores, falla.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { close, reaction, at, solved } from './helpers.ts';

const caso = (f: string) => JSON.parse(readFileSync(new URL(`./casos/${f}`, import.meta.url), 'utf8'));

test('TP N°4 · 5b: pórtico en T (P = 1 kN, L = 1 m), coincide con las respuestas del TP', () => {
  const s = solved(caso('tp4-5b.json'));
  close(reaction(s, 'R_{By}'), 4, 'R_By');
  close(reaction(s, 'R_{Dy}'), -3, 'R_Dy');
  close(reaction(s, 'R_{Ex}'), 1, 'R_Ex (hacia la derecha, supuesta positiva según el SRG)');
  // Viga A–B–C–D
  close(at(s, 'Q', 'A', 'der'), -1, 'Q en A');
  close(at(s, 'M', 'B', 'izq'), -0.25, 'Mf en B');
  close(at(s, 'Q', 'B', 'der'), 3, 'Q a la derecha de B');
  close(at(s, 'M', 'C', 'izq'), 0.5, 'Mf en C (fin de BC)');
  close(at(s, 'N', 'C', 'der'), -3, 'N en CD');
  close(at(s, 'M', 'C', 'der'), -1.5, 'Mf en C (inicio de CD)');
  close(at(s, 'M', 'D', 'izq'), 0, 'Mf en D');
  // Columna F–G–E–C, recorrida de abajo hacia arriba (SRP: y′ hacia la izquierda)
  close(at(s, 'Q', 'G', 'der'), -2, 'Q en GE');
  close(at(s, 'M', 'E', 'izq'), -0.5, 'Mf en E (fin de GE)');
  close(at(s, 'Q', 'E', 'der'), -3, 'Q en EC');
  close(at(s, 'M', 'C', 'izq') - at(s, 'M', 'C', 'der'), 2, 'salto de Mf en el nudo C = Mf que entra por la columna');
  assert.ok(s.bars.every((b) => b.izqIgualDer));
});

test('TP N°4 · 1b: voladizo con dos cargas de 10 kN (a = 2 m)', () => {
  const s = solved(caso('tp4-1b.json'));
  const P = 10, a = 2;
  close(at(s, 'Q', 'A', 'der'), -P, 'Qa = −P');
  close(at(s, 'Q', 'B', 'izq'), -P, 'Qb izq = −P');
  close(at(s, 'Q', 'B', 'der'), -2 * P, 'Qb der = −2P');
  close(at(s, 'Q', 'C', 'izq'), -2 * P, 'Qc = −2P');
  close(at(s, 'M', 'A', 'der'), 0, 'Ma = 0');
  close(at(s, 'M', 'B', 'izq'), -P * a, 'Mb = −Pa');
  close(at(s, 'M', 'C', 'izq'), -3 * P * a, 'Mc = −3Pa');
  close(reaction(s, 'R_{Cy}'), 2 * P, 'R_Cy');
  close(reaction(s, 'Me_{C}'), -3 * P * a, 'Me_C = −60 (horario en el DCE)');
});

test('TP N°4 · 6: pórtico con columna central, cupla y voladizos (coincide con el TP salvo errata en Mf der)', () => {
  const s = solved(caso('tp4-6.json'));
  close(reaction(s, 'R_{Ey}'), 8, 'R_Ey');
  close(reaction(s, 'R_{Cx}'), 0, 'R_Cx');
  close(reaction(s, 'R_{Cy}'), 8, 'R_Cy');
  // Viga inferior A–B–C
  close(at(s, 'Q', 'A', 'der'), -6, 'Qa');
  close(at(s, 'Q', 'B', 'der'), -8, 'Qb der');
  close(at(s, 'M', 'B', 'izq'), -12, 'Mb izq');
  close(at(s, 'M', 'B', 'der'), 16, 'Mb der');
  close(at(s, 'M', 'C', 'izq'), 0, 'Mc');
  // Columna B–D–F: N = −2, Q = 0
  close(at(s, 'N', 'B', 'der') , 0, 'N en BC'); // BC es horizontal
  const col = s.bars.filter((b) => b.bar.from === 'B' && b.bar.to === 'D' || b.bar.from === 'D' && b.bar.to === 'F');
  for (const b of col) close(b.N.eval(0), -2, `N en ${b.bar.id}`), close(b.Q.eval(0), 0, `Q en ${b.bar.id}`);
  close(col[0].M.eval(0), -28, 'Mb arriba');
  close(col[0].M.eval(2), -28, 'Md izq (abajo)');
  close(col[1].M.eval(0), -24, 'Md der (arriba)');
  close(col[1].M.eval(2), -24, 'Mf abajo');
  // Viga superior E–F–G
  close(at(s, 'Q', 'E', 'der'), 8, 'Qe');
  close(at(s, 'Q', 'F', 'izq'), 4, 'Qf izq');
  close(at(s, 'Q', 'F', 'der'), 6, 'Qf der');
  close(at(s, 'M', 'F', 'izq'), 12, 'Mf izq');
  // El TP indica Mf der = 12, pero el voladizo FG con 6 kN en G da −12 (como Mb izq = −12)
  // y solo así cierra el equilibrio del nudo F: −12 + (−12) − (−24) = 0.
  close(at(s, 'M', 'F', 'der'), -12, 'Mf der (errata del TP: dice 12)');
  close(at(s, 'M', 'G', 'izq'), 0, 'Mg');
});

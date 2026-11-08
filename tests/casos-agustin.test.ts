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
  close(reaction(s, 'R_{Ex}'), -1, 'R_Ex');
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

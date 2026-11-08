/**
 * Casos cargados por Agustín en la app y verificados contra su resolución en papel.
 * Sirven como pruebas de regresión: si un cambio del motor altera estos valores, falla.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { close, reaction, at, solved } from './helpers.ts';

const caso = (f: string) => JSON.parse(readFileSync(new URL(`./casos/${f}`, import.meta.url), 'utf8'));

test('pórtico en T con columna hacia abajo y tres apoyos móviles (8/11/2026)', () => {
  const s = solved(caso('agustin-portico-T.json'));
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

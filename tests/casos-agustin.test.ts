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
  const col = s.bars.filter((b) => b.bar.from === 'B' && b.bar.to === 'D' || b.bar.from === 'D' && b.bar.to === 'F');
  for (const b of col) close(b.N.eval(0), -2, `N en ${b.bar.id}`), close(b.Q.eval(0), 0, `Q en ${b.bar.id}`);
  close(col[0].M.eval(0), -28, 'Mb arriba');
  close(col[0].M.eval(2), -28, 'Md izq (abajo)');
  close(col[1].M.eval(0), -24, 'Md der (arriba)');
  close(col[1].M.eval(2), -24, 'Mf abajo');
  // Viga superior E–F–G
  close(at(s, 'Q', 'E', 'der'), 8, 'Qe');
  const ef = s.bars.find((b) => b.bar.from === 'E' && b.bar.to === 'F')!;
  close(ef.Q.eval(ef.bar.L), 4, 'Qf izq');
  close(at(s, 'Q', 'F', 'der'), 6, 'Qf der');
  close(ef.M.eval(ef.bar.L), 12, 'Mf izq');
  // El TP indica Mf der = 12, pero el voladizo FG con 6 kN en G da −12 (como Mb izq = −12)
  // y solo así cierra el equilibrio del nudo F: −12 + (−12) − (−24) = 0.
  close(at(s, 'M', 'F', 'der'), -12, 'Mf der (errata del TP: dice 12)');
  close(at(s, 'M', 'G', 'izq'), 0, 'Mg');
});

test('TP N°4 · 9c: dos chapas con articulación en C (coincide con todas las respuestas del TP)', () => {
  const s = solved(caso('tp4-9c.json'));
  assert.equal(s.classification.chapas, 2);
  const tramo = (a: string, b: string) => s.bars.find((r) => r.bar.from === a && r.bar.to === b)!;
  const AB = tramo('A', 'B'), BC = tramo('B', 'C'), CD = tramo('C', 'D'), DE = tramo('D', 'E'), FD = tramo('F', 'D');
  // N: Na = Nb izq = Nd der = Ne = 0; Nb der = Nc = Nd izq = −20; Nf = Nd inf = −30
  close(AB.N.eval(0), 0, 'Na');
  close(BC.N.eval(0), -20, 'Nb der');
  close(CD.N.eval(CD.bar.L), -20, 'Nd izq');
  close(DE.N.eval(0), 0, 'Nd der');
  close(FD.N.eval(0), -30, 'Nf');
  close(FD.N.eval(FD.bar.L), -30, 'Nd inf');
  // Q: Qa..Qd izq = 0; Qd der = Qe = 30; Qf = −10; Qd inf = 20
  for (const r of [AB, BC, CD]) close(r.Q.eval(0), 0, `Q en ${r.bar.id}`);
  close(DE.Q.eval(0), 30, 'Qd der');
  close(FD.Q.eval(0), -10, 'Qf');
  close(FD.Q.eval(FD.bar.L), 20, 'Qd inf');
  // M: Ma = Mb = Mc = Md izq = Me = 0; Md der = −45; Mf = −60; Mmin en FD = −65; Md inf = −45
  for (const r of [AB, BC, CD]) close(r.M.eval(r.bar.L), 0, `M en ${r.bar.id}`);
  close(DE.M.eval(0), -45, 'Md der');
  close(DE.M.eval(DE.bar.L), 0, 'Me');
  close(FD.M.eval(0), -60, 'Mf');
  close(s.extremes.min.M.valor, -65, 'Mfd mín');
  close(FD.M.eval(FD.bar.L), -45, 'Md inf');
});

test('TP N°4 · 3c: viga con ménsulas (las cargas llegan con su cupla de traslado)', () => {
  // Las cargas de 400 N actúan sobre ménsulas a 0,15 m de C, D y E: se trasladan a la viga
  // como 400 N hacia abajo más una cupla horaria de 400·0,15 = 60 N·m.
  const s = solved(caso('tp4-3c.json'));
  close(reaction(s, 'R_{Ay}'), 400, 'R_A');
  close(reaction(s, 'R_{By}'), 800, 'R_B');
  close(at(s, 'Q', 'A', 'der'), 400, 'Qa');
  close(at(s, 'Q', 'C', 'izq'), 400, 'Qc izq');
  close(at(s, 'Q', 'C', 'der'), 0, 'Qc der');
  close(at(s, 'Q', 'D', 'izq'), 0, 'Qd izq');
  close(at(s, 'Q', 'D', 'der'), -400, 'Qd der');
  close(at(s, 'Q', 'E', 'izq'), -400, 'Qe izq');
  close(at(s, 'Q', 'E', 'der'), -800, 'Qe der');
});

test('TP N°4 · 5e: pórtico con el SRP de la figura (columnas recorridas hacia arriba)', () => {
  // La figura del TP muestra en las dos columnas el símbolo x′ ↑, y′ ← (recorrido de abajo hacia arriba).
  const s = solved(caso('tp4-5e.json'));
  const tr = (a: string, b: string) => s.bars.find((r) => r.bar.from === a && r.bar.to === b)!;
  close(tr('A', 'B').N.eval(0), 1.458, 'Na = 1,46');
  close(tr('D', 'E').N.eval(0), -3, 'Nd der = −3');
  close(tr('H', 'G').N.eval(0), 1.042, 'Ng abajo = 1,04');
  close(tr('B', 'C').Q.eval(0), -2, 'Qb der');
  close(tr('C', 'D').Q.eval(0), -3, 'Qc der');
  close(tr('D', 'E').Q.eval(0), -1.458, 'Qd der');
  close(tr('E', 'F').Q.eval(0), -1.958, 'Qe');
  close(tr('F', 'G').Q.eval(0), 1.042, 'Qf der');
  close(tr('H', 'G').Q.eval(0), 3, 'Qg abajo');
  close(tr('J', 'I').Q.eval(0), 2, 'Qj');
  close(tr('C', 'D').M.eval(0), -0.668, 'Mc');
  close(tr('D', 'E').M.eval(0), -1.667, 'Md');
  close(tr('E', 'F').M.eval(0), -2.521, 'Me');
  close(tr('F', 'G').M.eval(0), -3.0105, 'Mf');
  close(tr('F', 'G').M.eval(0.25), -2.75, 'Mg en la viga');
  // Columna derecha: el TP imprime −2,75 / −2 / −1,5 / −1 / 0. Con el SRP de su propia figura
  // el nudo G solo cierra con +2,75 (la tracción de la fibra superior de la viga sigue por la
  // fibra exterior de la columna): los signos del TP en esa columna serían una errata.
  close(tr('H', 'G').M.eval(0.25), 2.75, 'Mg en la columna');
  close(tr('I', 'H').M.eval(0.25), 2, 'Mh');
  close(tr('J', 'I').M.eval(0.5), 1, 'Mi abajo de la cupla');
  close(tr('J', 'I').M.eval(0), 0, 'Mj');
});

test('TP N°4 · 9d: dos chapas, N y Q iguales al TP; Mf igual en valor absoluto', () => {
  const s = solved(caso('tp4-9d.json'));
  const tr = (a: string, b: string) => s.bars.find((r) => r.bar.from === a && r.bar.to === b)!;
  close(tr('C', 'B').N.eval(0), -26.667, 'N columna izquierda', 1e-4);
  close(tr('F', 'G').N.eval(0), 20, 'Nf der = Ng');
  close(tr('H', 'G').N.eval(0), 26.667, 'Nh', 1e-4);
  close(tr('C', 'B').Q.eval(0), -50, 'Q columna izquierda');
  close(tr('B', 'D').Q.eval(0), 26.667, 'Qb der', 1e-4);
  close(tr('F', 'E').Q.eval(0), -20, 'Qe');
  close(tr('H', 'G').Q.eval(0), -20, 'Qh');
  // Viga y columna derecha con el mismo signo que el TP
  close(tr('B', 'D').M.eval(0), -26.667, 'Mb der', 1e-4);
  close(tr('D', 'F').M.eval(2), 53.333, 'Mf izq', 1e-4);
  close(tr('F', 'E').M.eval(0), 30, 'Mf sup');
  close(tr('F', 'G').M.eval(0), 23.333, 'Mf der', 1e-4);
  close(tr('F', 'G').M.eval(1), 50, 'Mg sup');
  close(tr('H', 'G').M.eval(2.5), -50, 'Mg inf');
  // Columna izquierda: el TP da −173,33 / −48,33 / −75. La figura no tiene símbolos de SRP
  // (vale el recorrido por defecto, de abajo hacia arriba) y con esos signos el nudo B no cierra:
  // −(−48,33) + (−75) − 26,67 ≠ 0. Con los de la app sí: −48,33 + 75 − 26,67 = 0.
  close(Math.abs(tr('C', 'B').M.eval(0)), 173.333, '|Mc|', 1e-4);
  close(Math.abs(tr('C', 'B').M.eval(2.5)), 48.333, '|Mb inf|', 1e-4);
  close(Math.abs(tr('B', 'A').M.eval(0)), 75, '|Mb sup|');
});

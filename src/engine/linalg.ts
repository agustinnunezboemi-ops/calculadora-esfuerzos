/** Eliminación gaussiana con pivoteo parcial. */

export interface RankResult {
  rank: number;
}

export function rank(A: number[][], tol = 1e-9): number {
  const M = A.map((r) => [...r]);
  const rows = M.length;
  const cols = rows ? M[0].length : 0;
  const scale = Math.max(1, ...M.flat().map(Math.abs));
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let p = r;
    for (let i = r + 1; i < rows; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) <= tol * scale) continue;
    [M[r], M[p]] = [M[p], M[r]];
    for (let i = r + 1; i < rows; i++) {
      const f = M[i][c] / M[r][c];
      for (let j = c; j < cols; j++) M[i][j] -= f * M[r][j];
    }
    r++;
  }
  return r;
}

/** Resuelve A·x = b para A cuadrada no singular. */
export function solve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) < 1e-14) throw new Error('Sistema singular');
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = 0; i < n; i++) {
      if (i === c) continue;
      const f = M[i][c] / M[c][c];
      for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

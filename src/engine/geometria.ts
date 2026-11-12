/**
 * Ubicación exacta de nodos sobre rectas oblicuas (SOH CAH TOA).
 * Un nodo intermedio de una barra inclinada se calcula con el ángulo de la recta que une
 * los dos nodos extremos: θ = atan(Δy/Δx) e y = yP + (x − xP)·tan θ.
 */
import { Model } from './model.ts';

export interface PuntoEnRecta {
  x: number;
  y: number;
  /** Ángulo de la recta P→Q en grados. */
  theta: number;
  /** Desarrollo para mostrar al alumno. */
  desarrollo: string[];
}

const f = (v: number, d = 4) => (Math.abs(v) < 1e-12 ? '0' : (+v.toFixed(d)).toLocaleString('es-AR', { maximumFractionDigits: d, useGrouping: false }).replace('-', '−'));

/**
 * Punto de la recta P–Q con la abscisa dada (o, si la recta es vertical, con la ordenada dada).
 */
export function puntoEnRecta(P: { x: number; y: number }, Q: { x: number; y: number }, coord: number, porOrdenada = false): PuntoEnRecta {
  const dx = Q.x - P.x, dy = Q.y - P.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) throw new Error('Los dos nodos coinciden: no definen una recta.');
  const theta = (Math.atan2(dy, dx) * 180) / Math.PI;
  const vertical = Math.abs(dx) < 1e-12;
  if (!porOrdenada && vertical) throw new Error('La recta es vertical: indicá la ordenada y.');
  if (porOrdenada && Math.abs(dy) < 1e-12) throw new Error('La recta es horizontal: indicá la abscisa x.');
  if (!porOrdenada) {
    const t = Math.tan((theta * Math.PI) / 180);
    const y = P.y + (coord - P.x) * (dy / dx);
    return {
      x: coord,
      y,
      theta,
      desarrollo: [
        `tg θ = Δy/Δx = ${f(dy)}/${f(dx)} = ${f(t, 5)}  →  θ = ${f(theta, 3)}°`,
        `y = y_{P} + (x − x_{P})·tg θ = ${f(P.y)} + (${f(coord)} − ${f(P.x)})·${f(t, 5)} = ${f(y, 5)}`,
      ],
    };
  }
  const x = P.x + (coord - P.y) * (dx / dy);
  return {
    x,
    y: coord,
    theta,
    desarrollo: [`tg θ = Δy/Δx = ${f(dy)}/${f(dx)}  →  θ = ${f(theta, 3)}°`, `x = x_{P} + (y − y_{P})/tg θ = ${f(x, 5)}`],
  };
}

export interface Alineacion {
  node: string;
  entre: [string, string];
  antes: { x: number; y: number };
  despues: { x: number; y: number };
  desarrollo: string[];
}

/**
 * Busca nodos que quedaron casi sobre la recta de dos vecinos (P–N–Q casi alineados, N entre ambos)
 * y los lleva exactamente sobre esa recta, conservando la abscisa (o la ordenada si es vertical).
 * Tolerancia relativa a la longitud P–Q (por defecto 1 %). Devuelve un modelo nuevo y los cambios.
 */
export function alinearNodos(model: Model, tol = 0.01): { model: Model; cambios: Alineacion[] } {
  const m: Model = structuredClone(model);
  const pos = new Map(m.nodes.map((n) => [n.id, n]));
  const vecinos = (id: string) => [...new Set(m.bars.flatMap((b) => (b.from === id ? [b.to] : b.to === id ? [b.from] : [])))];
  const cambios: Alineacion[] = [];
  for (const n of m.nodes) {
    const vs = vecinos(n.id);
    let mejor: { P: string; Q: string; d: number } | null = null;
    for (let i = 0; i < vs.length; i++)
      for (let j = i + 1; j < vs.length; j++) {
        const P = pos.get(vs[i])!, Q = pos.get(vs[j])!;
        const dx = Q.x - P.x, dy = Q.y - P.y;
        const L = Math.hypot(dx, dy);
        if (L < 1e-9) continue;
        const t = ((n.x - P.x) * dx + (n.y - P.y) * dy) / (L * L);
        if (t <= 0.02 || t >= 0.98) continue; // N tiene que estar entre P y Q
        const d = Math.abs((n.x - P.x) * dy - (n.y - P.y) * dx) / L; // distancia de N a la recta
        if (d < 1e-9 || d > tol * L) continue; // ya alineado, o claramente fuera de la recta
        if (!mejor || d < mejor.d) mejor = { P: vs[i], Q: vs[j], d };
      }
    if (!mejor) continue;
    const P = pos.get(mejor.P)!, Q = pos.get(mejor.Q)!;
    const porOrdenada = Math.abs(Q.x - P.x) < 1e-9 || Math.abs(Q.y - P.y) > Math.abs(Q.x - P.x) * 20;
    const r = puntoEnRecta(P, Q, porOrdenada ? n.y : n.x, porOrdenada);
    cambios.push({ node: n.id, entre: [mejor.P, mejor.Q], antes: { x: n.x, y: n.y }, despues: { x: r.x, y: r.y }, desarrollo: r.desarrollo });
    n.x = r.x;
    n.y = r.y;
  }
  return { model: m, cambios };
}

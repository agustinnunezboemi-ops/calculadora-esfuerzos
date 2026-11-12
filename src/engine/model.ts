/**
 * Modelo de datos de un problema (ver documento de diseño, Etapa 1).
 * Todo en unidades coherentes (internamente SI: N, m). Ángulos en grados, medidos
 * desde el eje x del SRG, antihorario positivo.
 */

export type SupportType = 'movil' | 'biela' | 'fijo' | 'empotramiento';

export interface NodeDef {
  id: string;
  x: number;
  y: number;
}

export interface BarDef {
  id: string;
  from: string;
  to: string;
  /** Invierte el sentido de recorrido por defecto (SRP). */
  reverse?: boolean;
}

export interface SupportDef {
  node: string;
  type: SupportType;
  /**
   * movil: ángulo del plano de apoyo (0 = apoyo sobre plano horizontal, reacción vertical).
   * biela: ángulo del eje de la biela (por defecto 90 = vertical).
   */
  angle?: number;
}

export interface HingeDef {
  node: string;
}

/** Ubicación de una carga: en un nodo, o en una barra a una distancia `at` desde su nodo `from`. */
export interface Where {
  node?: string;
  bar?: string;
  at?: number;
}

export interface PointLoad extends Where {
  type: 'puntual';
  /** Módulo (≥ 0 normalmente). */
  value: number;
  /** Dirección de la fuerza en el SRG (−90 = vertical hacia abajo). */
  angle: number;
}

export interface CoupleLoad extends Where {
  type: 'cupla';
  /** Momento, antihorario positivo. */
  value: number;
}

export interface DistributedLoad {
  type: 'distribuida';
  bar: string;
  /** Desde / hasta, medidos sobre la barra desde su nodo `from`. */
  from: number;
  to: number;
  /** Intensidad por unidad de longitud real en `from` y en `to`. */
  q1: number;
  q2: number;
  /** Dirección en el SRG (por defecto −90 = hacia abajo). */
  angle?: number;
}

export type LoadDef = PointLoad | CoupleLoad | DistributedLoad;

export interface Model {
  nodes: NodeDef[];
  bars: BarDef[];
  supports: SupportDef[];
  hinges?: HingeDef[];
  loads: LoadDef[];
}

export type Vec = { x: number; y: number };

export const vec = (x: number, y: number): Vec => ({ x, y });
export const sub = (a: Vec, b: Vec): Vec => vec(a.x - b.x, a.y - b.y);
export const add = (a: Vec, b: Vec): Vec => vec(a.x + b.x, a.y + b.y);
export const scale = (a: Vec, k: number): Vec => vec(a.x * k, a.y * k);
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
/** Componente z de a × b (antihorario positivo). */
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const norm = (a: Vec): number => Math.hypot(a.x, a.y);
export const dirDeg = (deg: number): Vec => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return vec(Math.abs(c) < 1e-15 ? 0 : c, Math.abs(s) < 1e-15 ? 0 : s);
};

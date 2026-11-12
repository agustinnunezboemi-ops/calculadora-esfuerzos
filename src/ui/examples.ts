import { Model } from '../engine/model.ts';
import tp4_1b from '../../tests/casos/tp4-1b.json';
import tp4_3c from '../../tests/casos/tp4-3c.json';
import tp4_5b from '../../tests/casos/tp4-5b.json';
import tp4_5e from '../../tests/casos/tp4-5e.json';
import tp4_6 from '../../tests/casos/tp4-6.json';
import tp4_9c from '../../tests/casos/tp4-9c.json';
import tp4_9d from '../../tests/casos/tp4-9d.json';

/** Ejercicios cargados por Agustín y verificados contra las respuestas del TP N°4. */
const desdeArchivo = (j: unknown): Model => {
  const o = j as Model;
  return { nodes: o.nodes, bars: o.bars, supports: o.supports, hinges: o.hinges ?? [], loads: o.loads };
};
const unidadesDe = (j: unknown) => ((j as { unidades?: string }).unidades ?? 'kN-m');

export interface Example {
  id: string;
  nombre: string;
  unidades: string;
  model: Model;
}

export const EXAMPLES: Example[] = [
  {
    id: 'm10-ej1',
    nombre: 'Módulo 10 · Ejemplo 1 (P en L/2 y F en B)',
    unidades: 'kN-m',
    model: {
      nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 4, y: 0 }],
      bars: [{ id: 'AB', from: 'A', to: 'B' }],
      supports: [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil' }],
      hinges: [],
      loads: [
        { type: 'puntual', bar: 'AB', at: 2, value: 10, angle: -90 },
        { type: 'puntual', node: 'B', value: 2, angle: 0 },
      ],
    },
  },
  {
    id: 'm10-ej2',
    nombre: 'Módulo 10 · Ejemplo 2 (carga uniforme)',
    unidades: 'kN-m',
    model: {
      nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 6, y: 0 }],
      bars: [{ id: 'AB', from: 'A', to: 'B' }],
      supports: [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil' }],
      hinges: [],
      loads: [{ type: 'distribuida', bar: 'AB', from: 0, to: 6, q1: 3, q2: 3 }],
    },
  },
  {
    id: 'tp4-1g',
    nombre: 'TP N°4 · 1g (voladizo con cupla)',
    unidades: 'kN-m',
    model: {
      nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'C', x: 1, y: 0 }, { id: 'D', x: 1.5, y: 0 }, { id: 'E', x: 2, y: 0 }, { id: 'B', x: 2.5, y: 0 }],
      bars: [{ id: 'AB', from: 'A', to: 'B' }],
      supports: [{ node: 'B', type: 'empotramiento' }],
      hinges: [],
      loads: [
        { type: 'puntual', node: 'A', value: 15, angle: 90 },
        { type: 'cupla', node: 'C', value: 10 },
        { type: 'puntual', node: 'D', value: 30, angle: -90 },
        { type: 'puntual', node: 'E', value: 20, angle: -90 },
      ],
    },
  },
  {
    id: 'tp4-1k',
    nombre: 'TP N°4 · 1k (puntual y distribuida)',
    unidades: 'kN-m',
    model: {
      nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'C', x: 2, y: 0 }, { id: 'D', x: 3, y: 0 }, { id: 'B', x: 5, y: 0 }],
      bars: [{ id: 'AB', from: 'A', to: 'B' }],
      supports: [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil' }],
      hinges: [],
      loads: [
        { type: 'puntual', node: 'C', value: 60, angle: -90 },
        { type: 'distribuida', bar: 'AB', from: 3, to: 5, q1: 25, q2: 25 },
      ],
    },
  },
  {
    id: 'tp4-1m',
    nombre: 'TP N°4 · 1m (kips y pies)',
    unidades: 'kip-ft',
    model: {
      nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'C', x: 2, y: 0 }, { id: 'D', x: 7, y: 0 }, { id: 'B', x: 9, y: 0 }],
      bars: [{ id: 'AB', from: 'A', to: 'B' }],
      supports: [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'movil' }],
      hinges: [],
      loads: [
        { type: 'puntual', node: 'C', value: 8, angle: -90 },
        { type: 'puntual', node: 'D', value: 8, angle: -90 },
        { type: 'distribuida', bar: 'AB', from: 2, to: 7, q1: 4, q2: 4 },
      ],
    },
  },
  { id: 'tp4-1b', nombre: 'TP N°4 · 1b (voladizo, dos cargas)', unidades: unidadesDe(tp4_1b), model: desdeArchivo(tp4_1b) },
  { id: 'tp4-3c', nombre: 'TP N°4 · 3c (viga con ménsulas)', unidades: unidadesDe(tp4_3c), model: desdeArchivo(tp4_3c) },
  { id: 'tp4-5b', nombre: 'TP N°4 · 5b (pórtico en T)', unidades: unidadesDe(tp4_5b), model: desdeArchivo(tp4_5b) },
  { id: 'tp4-5e', nombre: 'TP N°4 · 5e (pórtico con cupla)', unidades: unidadesDe(tp4_5e), model: desdeArchivo(tp4_5e) },
  { id: 'tp4-6', nombre: 'TP N°4 · 6 (pórtico con columna central)', unidades: unidadesDe(tp4_6), model: desdeArchivo(tp4_6) },
  { id: 'tp4-9c', nombre: 'TP N°4 · 9c (dos chapas)', unidades: unidadesDe(tp4_9c), model: desdeArchivo(tp4_9c) },
  { id: 'tp4-9d', nombre: 'TP N°4 · 9d (dos chapas)', unidades: unidadesDe(tp4_9d), model: desdeArchivo(tp4_9d) },
  {
    id: 'portico-l',
    nombre: 'Pórtico en L (columna y viga)',
    unidades: 'kN-m',
    model: {
      nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: 3 }, { id: 'C', x: 4, y: 3 }],
      bars: [{ id: 'AB', from: 'A', to: 'B' }, { id: 'BC', from: 'B', to: 'C' }],
      supports: [{ node: 'A', type: 'fijo' }, { node: 'C', type: 'movil' }],
      hinges: [],
      loads: [
        { type: 'distribuida', bar: 'BC', from: 0, to: 4, q1: 2, q2: 2 },
        { type: 'puntual', node: 'B', value: 4, angle: 0 },
      ],
    },
  },
  {
    id: 'gerber',
    nombre: 'Viga Gerber (dos chapas)',
    unidades: 'kN-m',
    model: {
      nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'D', x: 4, y: 0 }, { id: 'B', x: 6, y: 0 }, { id: 'C', x: 10, y: 0 }],
      bars: [{ id: 'AC', from: 'A', to: 'C' }],
      supports: [{ node: 'A', type: 'fijo' }, { node: 'D', type: 'movil' }, { node: 'C', type: 'movil' }],
      hinges: [{ node: 'B' }],
      loads: [{ type: 'puntual', bar: 'AC', at: 8, value: 10, angle: -90 }],
    },
  },
];

// Orden del menú: módulo 10, TP N°4 por número de ejercicio y luego los demás.
const rango = (id: string) => (id.startsWith('m10') ? `0${id}` : id.startsWith('tp4-') ? `1${id.slice(4).replace(/^(\d)([a-z]?)$/, '0$1$2')}` : `2${id}`);
EXAMPLES.sort((a, b) => rango(a.id).localeCompare(rango(b.id)));

export const UNIT_SYSTEMS: { id: string; nombre: string; fuerza: string; longitud: string }[] = [
  { id: 'kN-m', nombre: 'SI · kN y m', fuerza: 'kN', longitud: 'm' },
  { id: 'N-m', nombre: 'SI · N y m', fuerza: 'N', longitud: 'm' },
  { id: 'kip-ft', nombre: 'Inglés · kip y ft', fuerza: 'kip', longitud: 'ft' },
  { id: 'lb-in', nombre: 'Inglés · lb e in', fuerza: 'lb', longitud: 'in' },
  { id: 'lb-ft', nombre: 'Inglés · lb y ft', fuerza: 'lb', longitud: 'ft' },
];

/** Factores a SI (N y m) de cada sistema. */
const FACTORES: Record<string, { F: number; L: number }> = {
  'kN-m': { F: 1000, L: 1 },
  'N-m': { F: 1, L: 1 },
  'kip-ft': { F: 4448.2216152605, L: 0.3048 },
  'lb-in': { F: 4.4482216152605, L: 0.0254 },
  'lb-ft': { F: 4.4482216152605, L: 0.3048 },
};

const r6 = (v: number) => +v.toPrecision(9); // 9 cifras: ida y vuelta sin pérdida visible

/** Convierte todos los valores del modelo de un sistema de unidades a otro. */
export function convertModel(m: Model, from: string, to: string): Model {
  const a = FACTORES[from], b = FACTORES[to];
  if (!a || !b || from === to) return m;
  const fL = a.L / b.L, fF = a.F / b.F;
  return {
    ...m,
    nodes: m.nodes.map((n) => ({ ...n, x: r6(n.x * fL), y: r6(n.y * fL) })),
    loads: m.loads.map((l) => {
      if (l.type === 'puntual') return { ...l, value: r6(l.value * fF), at: l.at === undefined ? undefined : r6(l.at * fL) };
      if (l.type === 'cupla') return { ...l, value: r6(l.value * fF * fL), at: l.at === undefined ? undefined : r6(l.at * fL) };
      return { ...l, from: r6(l.from * fL), to: r6(l.to * fL), q1: r6((l.q1 * fF) / fL), q2: r6((l.q2 * fF) / fL) };
    }),
  };
}

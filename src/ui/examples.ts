import { Model } from '../engine/model.ts';

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

export const UNIT_SYSTEMS: { id: string; nombre: string; fuerza: string; longitud: string }[] = [
  { id: 'kN-m', nombre: 'SI · kN y m', fuerza: 'kN', longitud: 'm' },
  { id: 'N-m', nombre: 'SI · N y m', fuerza: 'N', longitud: 'm' },
  { id: 'kip-ft', nombre: 'Inglés · kip y ft', fuerza: 'kip', longitud: 'ft' },
  { id: 'lb-in', nombre: 'Inglés · lb e in', fuerza: 'lb', longitud: 'in' },
  { id: 'lb-ft', nombre: 'Inglés · lb y ft', fuerza: 'lb', longitud: 'ft' },
];

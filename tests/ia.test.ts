/** Capa de IA: se prueba con respuestas simuladas de Gemini (sin red). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gemini, extraerJson, validarPropuesta } from '../src/ai/gemini.ts';
import { analyze } from '../src/engine/analysis.ts';

const respuesta = (obj: unknown, status = 200) =>
  (async () =>
    new Response(JSON.stringify(status === 200 ? { candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] } : obj), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;

test('la propuesta de la IA se valida y el motor la resuelve', async () => {
  const ia = new Gemini(
    { clave: 'x', modelo: 'gemini-2.5-flash' },
    respuesta({
      unidades: 'kN-m',
      nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'C', x: '2', y: 0 }, { id: 'B', x: 4, y: 0 }],
      bars: [{ id: 'AB', from: 'A', to: 'C' }, { id: 'CB', from: 'C', to: 'B' }],
      supports: [{ node: 'A', type: 'fijo' }, { node: 'B', type: 'móvil', angle: 0 }],
      loads: [{ type: 'puntual', node: 'C', value: 10, angle: -90 }, { type: 'cupla', node: 'Z', value: 3 }],
      notas: ['Cotas leídas de la figura.'],
    }),
  );
  const p = await ia.interpretar({ tipo: 'esfuerzos', texto: 'Viga simplemente apoyada de 4 m con 10 kN en el centro.' });
  assert.equal(p.unidades, 'kN-m');
  assert.equal(p.model.nodes[1].x, 2, 'acepta números como texto');
  assert.equal(p.model.supports[1].type, 'movil', 'normaliza "móvil"');
  assert.equal(p.model.loads.length, 1, 'descarta la cupla en un nodo inexistente');
  assert.ok(p.notas.some((n) => /descartaron 1/.test(n)));
  const s = analyze(p.model);
  assert.equal(s.classification.status, 'isostatico');
});

test('respuestas con ```json y errores de Gemini', async () => {
  assert.deepEqual(extraerJson('```json\n{"a":1}\n```'), { a: 1 });
  await assert.rejects(new Gemini({ clave: 'x', modelo: 'm' }, respuesta({ error: { message: 'API key not valid' } }, 400)).interpretar({ tipo: 'esfuerzos', texto: 'x' }), /clave de Gemini no es válida/);
  await assert.rejects(new Gemini({ clave: 'x', modelo: 'm' }, respuesta({ error: { message: 'quota' } }, 429)).interpretar({ tipo: 'esfuerzos', texto: 'x' }), /límite gratuito/);
  await assert.rejects(new Gemini({ clave: '', modelo: 'm' }).interpretar({ tipo: 'esfuerzos', texto: 'x' }), /Falta la clave/);
});

test('en reticulados se descartan cargas distribuidas y empotramientos', () => {
  const p = validarPropuesta(
    {
      nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 3, y: 0 }, { id: 'C', x: 0, y: 4 }],
      bars: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }],
      supports: [{ node: 'A', type: 'empotramiento' }, { node: 'B', type: 'movil' }],
      loads: [{ type: 'distribuida', bar: 'AB' }, { type: 'puntual', node: 'C', value: 5, angle: 0 }],
    },
    'reticulado',
  );
  assert.equal(p.model.supports.length, 1);
  assert.equal(p.model.loads.length, 1);
});

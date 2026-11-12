/**
 * Capa de IA opcional (Etapa 3): interpreta una foto o un enunciado y propone la estructura.
 * Proveedor: Google Gemini con la clave propia de cada usuario (guardada solo en su navegador).
 * La IA solo propone datos; el cálculo y el paso a paso los hace siempre el motor.
 */
import { Model, LoadDef, SupportDef } from '../engine/model.ts';
import { alinearNodos } from '../engine/geometria.ts';

export type Tipo = 'esfuerzos' | 'reticulado';

export interface ConfigIA {
  clave: string;
  modelo: string;
}

export interface Entrada {
  tipo: Tipo;
  texto?: string;
  imagen?: { mime: string; base64: string };
}

export interface Propuesta {
  model: Model;
  unidades: string | null;
  notas: string[];
}

export const MODELO_POR_DEFECTO = 'gemini-flash-latest';

/** Elige el mejor modelo para leer figuras: un "flash" estable de la versión más nueva. */
export function elegirModelo(nombres: string[]): string | null {
  const ok = nombres.map((n) => n.replace(/^models\//, '')).filter((n) => /gemini/.test(n) && /flash/.test(n) && !/(lite|image|tts|live|audio|embedding|thinking|exp)/.test(n));
  if (!ok.length) return nombres.map((n) => n.replace(/^models\//, '')).find((n) => /gemini/.test(n)) ?? null;
  const ver = (n: string) => +(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const estable = (n: string) => (/preview/.test(n) ? 1 : 0);
  return ok.sort((a, b) => estable(a) - estable(b) || ver(b) - ver(a) || a.length - b.length)[0];
}

/** Lista los modelos que la clave puede usar para generar contenido. */
export async function listarModelos(clave: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<string[]> {
  const r = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': clave } });
  if (!r.ok) throw new Error('No se pudo obtener la lista de modelos de Gemini.');
  const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (j.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
}

export class ModeloNoDisponible extends Error {}

/** Interfaz común para poder sumar otros proveedores sin tocar el resto de la app. */
export interface ProveedorIA {
  interpretar(e: Entrada): Promise<Propuesta>;
}

export function instrucciones(tipo: Tipo): string {
  const comunes = `Sos un asistente de la cátedra Estática 67.02 (ITBA). Tu tarea es leer el enunciado o la figura de un ejercicio y devolver SOLO un objeto JSON con la estructura, sin texto adicional.
Convenciones: sistema de referencia global con x hacia la derecha e y hacia arriba; coordenadas de los nodos en las unidades del enunciado; si un nodo está a mitad de una barra inclinada y el enunciado sólo da su abscisa, calculá su ordenada por trigonometría con los nodos extremos de esa barra (tg θ = Δy/Δx; y = yP + (x − xP)·tg θ) y escribila con todos sus decimales, sin redondear; ángulos en grados medidos desde el eje x, antihorario positivo (−90 = hacia abajo, 180 = hacia la izquierda).
Usá como id de los nodos las letras de la figura (A, B, C…). Si una cota no se ve, estimala y explicalo en "notas".
Formato:
{
  "unidades": "kN-m" | "N-m" | "kip-ft" | "lb-in" | "lb-ft",
  "nodes": [{"id": "A", "x": 0, "y": 0}],
  "bars": [{"id": "AB", "from": "A", "to": "B"}],
  "supports": [{"node": "A", "type": "fijo" | "movil"${tipo === 'esfuerzos' ? ' | "empotramiento"' : ''}, "angle": 0}],
  ${tipo === 'esfuerzos' ? '"hinges": [{"node": "C"}],\n  ' : ''}"loads": [ ... ],
  "notas": ["..."]
}
Apoyos: "fijo" = articulación fija (2 reacciones); "movil" = apoyo deslizante (1 reacción), "angle" = ángulo del plano de apoyo (0 = apoyado sobre un plano horizontal, reacción vertical; 90 = contra una pared vertical, reacción horizontal).
Cómo reconocer los apoyos en la figura (mirá con atención lo que hay DEBAJO del triángulo):
- Notación de la cátedra: triángulo SOLO (apoyado directamente, sin nada debajo, o sobre el suelo rayado) = "fijo"; triángulo con UNA RAYA o línea paralela separada debajo = "movil".
- Notación de libros (Beer, Hibbeler): triángulo sobre círculos o rodillos = "movil"; triángulo sobre una base rayada sin rodillos = "fijo"; pasador en una pared = "fijo"; rodillos contra una pared = "movil" con angle 90.
- Una pared o base con rayado donde la barra entra rígidamente = "empotramiento".
Si dudás entre fijo y móvil, elegí según el símbolo y dejalo explicado en "notas" indicando qué viste debajo de cada triángulo.`;
  if (tipo === 'reticulado')
    return `${comunes}
Es un RETICULADO: barras articuladas en los nodos y cargas solo en los nodos.
Cargas: {"type": "puntual", "node": "B", "value": 84, "angle": -90}. No uses empotramientos ni cargas distribuidas.`;
  return `${comunes}
Es una VIGA o PÓRTICO. Cada tramo recto entre nodos es una barra; poné un nodo en cada apoyo, articulación, carga puntual o cupla, cambio de dirección y en el inicio y fin de cada carga distribuida.
Articulaciones internas (rótulas) en "hinges".
Cargas:
- puntual: {"type": "puntual", "node": "C", "value": 10, "angle": -90}
- cupla: {"type": "cupla", "node": "C", "value": 10} (positiva antihoraria, negativa horaria)
- distribuida: {"type": "distribuida", "bar": "AB", "from": 0, "to": 4, "q1": 3, "q2": 3, "angle": -90}; "from"/"to" medidos sobre la barra desde su nodo "from", intensidad por unidad de longitud real de la barra (q1 al inicio, q2 al final; triangular si una es 0).`;
}

/** Extrae el JSON de la respuesta (tolera bloques ```json). */
export function extraerJson(texto: string): unknown {
  const limpio = texto.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(limpio);
  } catch {
    const i = limpio.indexOf('{');
    const j = limpio.lastIndexOf('}');
    if (i >= 0 && j > i) return JSON.parse(limpio.slice(i, j + 1));
    throw new Error('La IA no devolvió un JSON válido.');
  }
}

const num = (v: unknown, def = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && isFinite(+v.replace(',', '.')) ? +v.replace(',', '.') : def);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** Valida y normaliza lo que propone la IA; descarta lo que no tenga sentido y lo informa. */
export function validarPropuesta(j: unknown, tipo: Tipo): Propuesta {
  if (!j || typeof j !== 'object') throw new Error('La respuesta de la IA no tiene el formato esperado.');
  const o = j as Record<string, unknown>;
  const notas: string[] = Array.isArray(o.notas) ? o.notas.map(str).filter(Boolean) : [];
  const nodes = (Array.isArray(o.nodes) ? o.nodes : []).map((n) => {
    const x = n as Record<string, unknown>;
    return { id: str(x.id), x: num(x.x), y: num(x.y) };
  }).filter((n) => n.id);
  const ids = new Set(nodes.map((n) => n.id));
  if (nodes.length < 2) throw new Error('La IA no encontró al menos dos nodos. Probá con una foto más nítida o con el enunciado escrito.');
  const bars = (Array.isArray(o.bars) ? o.bars : []).map((b, i) => {
    const x = b as Record<string, unknown>;
    return { id: str(x.id) || `b${i + 1}`, from: str(x.from), to: str(x.to) };
  }).filter((b) => ids.has(b.from) && ids.has(b.to) && b.from !== b.to);
  const barIds = new Set(bars.map((b) => b.id));
  const tiposValidos = tipo === 'reticulado' ? ['fijo', 'movil'] : ['fijo', 'movil', 'empotramiento', 'biela'];
  const supports: SupportDef[] = (Array.isArray(o.supports) ? o.supports : []).flatMap((s) => {
    const x = s as Record<string, unknown>;
    const type = str(x.type).toLowerCase().replace('ó', 'o');
    if (!ids.has(str(x.node)) || !tiposValidos.includes(type)) return [];
    const sd: SupportDef = { node: str(x.node), type: type as SupportDef['type'] };
    if (x.angle !== undefined && (type === 'movil' || type === 'biela')) sd.angle = num(x.angle);
    return [sd];
  });
  const loads: LoadDef[] = (Array.isArray(o.loads) ? o.loads : []).flatMap((l): LoadDef[] => {
    const x = l as Record<string, unknown>;
    const t = str(x.type).toLowerCase();
    if (t === 'puntual' && ids.has(str(x.node))) return [{ type: 'puntual', node: str(x.node), value: num(x.value), angle: num(x.angle, -90) }];
    if (tipo === 'reticulado') return [];
    if (t === 'cupla' && ids.has(str(x.node))) return [{ type: 'cupla', node: str(x.node), value: num(x.value) }];
    if (t === 'distribuida' && barIds.has(str(x.bar)))
      return [{ type: 'distribuida', bar: str(x.bar), from: num(x.from), to: num(x.to), q1: num(x.q1), q2: num(x.q2, num(x.q1)), angle: num(x.angle, -90) }];
    return [];
  });
  const hinges = tipo === 'esfuerzos' && Array.isArray(o.hinges) ? o.hinges.map((h) => ({ node: str((h as Record<string, unknown>).node) })).filter((h) => ids.has(h.node)) : [];
  const descartados = (Array.isArray(o.loads) ? o.loads.length : 0) - loads.length + (Array.isArray(o.supports) ? o.supports.length : 0) - supports.length;
  if (descartados > 0) notas.push(`Se descartaron ${descartados} dato(s) que no se pudieron interpretar: revisá cargas y vínculos.`);
  const unidades = ['kN-m', 'N-m', 'kip-ft', 'lb-in', 'lb-ft'].includes(str(o.unidades)) ? str(o.unidades) : null;
  // Nodos intermedios de barras oblicuas: se ubican exactamente sobre la recta (θ = atan(Δy/Δx)).
  const { model, cambios } = alinearNodos({ nodes, bars, supports, hinges, loads });
  if (cambios.length)
    notas.push(`Se ubicaron exactamente sobre su recta (θ = atan(Δy/Δx), y = y_P + (x − x_P)·tg θ): ${cambios.map((c) => `${c.node} sobre ${c.entre.join('–')} (y = ${+c.despues.y.toFixed(4)})`).join(', ')}.`);
  return { model, unidades, notas };
}

export class Gemini implements ProveedorIA {
  constructor(private cfg: ConfigIA, private fetchImpl: typeof fetch = (...a) => fetch(...a)) {}

  async interpretar(e: Entrada): Promise<Propuesta> {
    if (!this.cfg.clave) throw new Error('Falta la clave de Gemini.');
    if (!e.texto?.trim() && !e.imagen) throw new Error('Cargá una foto o escribí el enunciado.');
    const parts: unknown[] = [{ text: instrucciones(e.tipo) }];
    if (e.texto?.trim()) parts.push({ text: `Enunciado:\n${e.texto.trim()}` });
    if (e.imagen) parts.push({ inline_data: { mime_type: e.imagen.mime, data: e.imagen.base64 } });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.cfg.modelo || MODELO_POR_DEFECTO)}:generateContent`;
    let r: Response;
    try {
      r = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.cfg.clave },
        body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
      });
    } catch {
      throw new Error('No se pudo conectar con Gemini. Revisá la conexión a internet.');
    }
    const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (!r.ok) {
      const msg = (body?.error as { message?: string } | undefined)?.message ?? `error ${r.status}`;
      if (r.status === 400 && /API key/i.test(msg)) throw new Error('La clave de Gemini no es válida.');
      if (r.status === 429) throw new Error('Se alcanzó el límite gratuito de Gemini por ahora. Probá en unos minutos.');
      if (r.status === 404) throw new ModeloNoDisponible(`El modelo "${this.cfg.modelo}" no está disponible.`);
      throw new Error(`Gemini respondió con un error: ${msg}`);
    }
    const cand = (body?.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0];
    const texto = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!texto) throw new Error('Gemini no devolvió ninguna respuesta.');
    return validarPropuesta(extraerJson(texto), e.tipo);
  }
}

/**
 * Generador del paso a paso con la redacción y el orden de los módulos ITBA 09 y 10.
 * Produce bloques de texto estructurados; la interfaz decide cómo mostrarlos.
 * Notación: `_{…}` = subíndice, `^{…}` = supraíndice.
 */
import { Solution, Unknown, BarResult } from './analysis.ts';
import { Poly } from './poly.ts';
import { Vec, vec, sub, add, scale, dot, cross } from './model.ts';
import { SBar, SDist } from './normalize.ts';

export interface Units {
  fuerza: string;
  longitud: string;
}

export type Block =
  | { t: 'p'; text: string }
  | { t: 'eq'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'ok'; text: string }
  | { t: 'warn'; text: string }
  | { t: 'nudo'; node: string; elems: NudoElem[] };

/** Acción sobre un nudo (para dibujar su DCL). Vectores en el SRG. */
export interface NudoElem {
  label: string;
  /** Dirección unitaria desde el nudo hacia la barra (solo extremos de barra). */
  dir?: Vec;
  /** Para extremos de barra: componente axil y de corte por separado. */
  axial?: Vec;
  shear?: Vec;
  F: Vec;
  M: number;
  tipo: 'barra' | 'carga' | 'reaccion';
  /** Esfuerzos del extremo de barra (convención del módulo 10). */
  esf?: { N: number; Q: number; M: number };
}

export interface Step {
  id: string;
  titulo: string;
  blocks: Block[];
  /** Tramo al que se refiere el paso (para resaltarlo en el dibujo). */
  bar?: string;
}

// ---------- formato ----------

export function fmt(v: number, digits = 3): string {
  if (!isFinite(v)) return '—';
  const r = Math.abs(v) < 5e-10 ? 0 : v;
  const s = Math.abs(r).toLocaleString('es-AR', { maximumFractionDigits: digits, useGrouping: false });
  return (r < 0 && s !== '0' ? '−' : '') + s;
}

/** "+ 5", "− 2,5" */
function signed(v: number): string {
  const s = fmt(Math.abs(v));
  return v < 0 ? `− ${s}` : `+ ${s}`;
}

/** Polinomio en la variable dada: "5 − 2,5·x_{1} + 0,75·x_{1}^{2}". */
export function fmtPoly(p: Poly, x: string): string {
  const parts: string[] = [];
  p.c.forEach((c, k) => {
    if (Math.abs(c) < 1e-10) return;
    const mag = fmt(Math.abs(c));
    const varPart = k === 0 ? '' : k === 1 ? x : `${x}^{${k}}`;
    const body = k === 0 ? mag : mag === '1' ? varPart : `${mag}·${varPart}`;
    parts.push((c < 0 ? '− ' : parts.length ? '+ ' : '') + body);
  });
  return parts.length ? parts.join(' ') : '0';
}

function termOf(coef: number, name: string, first: boolean): string {
  const mag = Math.abs(coef);
  const sign = coef < 0 ? '− ' : first ? '' : '+ ';
  const m = Math.abs(mag - 1) < 1e-12 ? '' : `${fmt(mag)}·`;
  return `${sign}${m}${name}`;
}

function joinTerms(terms: string[]): string {
  if (!terms.length) return '0';
  return terms.map((t, i) => (i === 0 ? t.replace(/^\+ /, '') : t)).join(' ');
}

const dirWords = (d: Vec): string => {
  if (Math.abs(d.y) < 1e-12) return d.x > 0 ? 'hacia la derecha' : 'hacia la izquierda';
  if (Math.abs(d.x) < 1e-12) return d.y > 0 ? 'hacia arriba' : 'hacia abajo';
  const ang = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  return `a ${fmt(ang, 1)}° del eje x`;
};

// ---------- ítems de fuerzas exteriores ----------

interface Item {
  name: string;
  P: Vec;
  F: Vec;
  M: number;
  unknownIndex?: number;
}

function loadNames(sol: Solution) {
  const st = sol.structure;
  const seen = new Map<string, number>();
  const nm = (base: string) => {
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    return k === 0 ? base : base.replace('_{', "'".repeat(k) + '_{');
  };
  const forces = st.forces.map((f) => ({ ...f, name: nm(`P_{${f.node}}`) }));
  const couples = st.couples.map((c) => ({ ...c, name: nm(`M_{${c.node}}`) }));
  return { forces, couples };
}

/** Fuerzas exteriores sobre la chapa c en un nodo (cargas, reacciones, o esfuerzos de articulación). */
function itemsAt(sol: Solution, c: number, nodeId: string, names: ReturnType<typeof loadNames>): Item[] {
  const st = sol.structure;
  const P = st.node(nodeId).p;
  const out: Item[] = [];
  if (sol.pins.includes(nodeId)) {
    sol.unknowns.forEach((u, j) => {
      if (u.source === 'articulacion' && u.node === nodeId && u.chapa === c)
        out.push({ name: u.name, P, F: scale(u.dir, sol.values[j]), M: 0, unknownIndex: j });
    });
    return out;
  }
  for (const f of names.forces) if (f.node === nodeId) out.push({ name: f.name, P, F: f.F, M: 0 });
  for (const m of names.couples) if (m.node === nodeId) out.push({ name: m.name, P, F: vec(0, 0), M: m.M });
  sol.unknowns.forEach((u, j) => {
    if (u.source !== 'vinculo' || u.node !== nodeId) return;
    out.push(u.kind === 'momento' ? { name: u.name, P, F: vec(0, 0), M: sol.values[j], unknownIndex: j } : { name: u.name, P, F: scale(u.dir, sol.values[j]), M: 0, unknownIndex: j });
  });
  return out;
}

function distItem(b: SBar, d: SDist, k: number): Item {
  const W = ((d.q1 + d.q2) / 2) * b.L;
  const T = (d.q1 * b.L * b.L) / 2 + ((d.q2 - d.q1) * b.L * b.L) / 3;
  const xc = W ? T / W : b.L / 2;
  return { name: `Q_{${b.from}${b.to}}${k ? "'".repeat(k) : ''}`, P: add(b.P0, scale(b.e, xc)), F: scale(d.d, W), M: 0 };
}

// ---------- pasos ----------

export function buildSteps(sol: Solution, u: Units): Step[] {
  const st = sol.structure;
  const cls = sol.classification;
  const F = u.fuerza;
  const L = u.longitud;
  const ML = `${F}·${L}`;
  const steps: Step[] = [];
  const names = loadNames(sol);

  // 1. ¿Es isostático?
  steps.push({
    id: 'isostatico',
    titulo: '1 – ¿Es isostático?',
    blocks: [
      { t: 'p', text: `La estructura está formada por ${cls.chapas} chapa${cls.chapas > 1 ? 's' : ''}. Cada chapa posee en el plano 3 grados de libertad (dos traslaciones y un giro): 3 × ${cls.chapas} = ${cls.gradosLibertad} grados de libertad.` },
      { t: 'table', head: ['Nodo', 'Vínculo', 'Grados de libertad que restringe'], rows: cls.detalleRestricciones.map((d) => [d.node, d.tipo, String(d.restringe)]) },
      { t: 'eq', text: `Condiciones de vínculo = ${cls.restricciones}   ·   Grados de libertad = ${cls.gradosLibertad}` },
      cls.status === 'hipostatico'
        ? { t: 'warn', text: `Sistema hipostático: ${cls.motivo} La estructura es un mecanismo y no puede resolverse con las ecuaciones de la estática.` }
        : cls.status === 'hiperestatico'
          ? { t: 'warn', text: `Sistema hiperestático: ${cls.motivo} Las ecuaciones de la estática no alcanzan; queda fuera del alcance de la materia.` }
          : { t: 'ok', text: 'Igual número de condiciones de vínculo que grados de libertad: el sistema es isostático.' },
    ],
  });
  if (cls.status === 'hipostatico' || cls.status === 'hiperestatico') return steps;

  // 2. Invariancia cinemática.
  steps.push({
    id: 'invariable',
    titulo: '2 – ¿Es cinemáticamente invariable?',
    blocks:
      cls.status === 'aparente'
        ? [{ t: 'warn', text: `${cls.motivo} No se puede continuar: hay que cambiar la disposición de los vínculos.` }]
        : [
            { t: 'p', text: cls.chapas === 1 && st.supports.length === 2 && st.supports.some((s) => s.type === 'fijo') ? 'La normal del apoyo móvil no pasa por el apoyo fijo.' : 'Las rectas de acción de las reacciones no concurren en un único punto ni son todas paralelas.' },
            { t: 'ok', text: 'El sistema es cinemáticamente invariable.' },
          ],
  });
  if (cls.status === 'aparente') return steps;

  // 3. DCL.
  const ext = sol.unknowns.filter((x) => x.source === 'vinculo');
  steps.push({
    id: 'dcl',
    titulo: '3 – Diagrama de Cuerpo Libre (DCL)',
    blocks: [
      { t: 'p', text: 'Se reemplazan los vínculos por sus reacciones. Los sentidos se suponen positivos, coincidentes con el Sistema de Referencia Global (x hacia la derecha, y hacia arriba, giro antihorario positivo).' },
      { t: 'list', items: ext.map((x) => `${x.name}: ${x.kind === 'momento' ? 'momento de empotramiento, supuesto antihorario' : `supuesta ${dirWords(x.dir)}`}`) },
      ...(sol.pins.length
        ? [{ t: 'p' as const, text: `En ${sol.pins.length === 1 ? 'la articulación' : 'las articulaciones'} ${sol.pins.join(', ')} se separan las chapas y aparecen las fuerzas que la articulación transmite a cada una (V_{x}, V_{y}), también supuestas positivas.` }]
        : []),
    ],
  });

  // 4. RVE.
  const rve: Block[] = [{ t: 'p', text: 'Para calcular las Reacciones de Vínculo Externo (RVE) se plantean las tres ecuaciones de equilibrio de la estática. Las cargas distribuidas se reemplazan, solo para este cálculo, por su resultante aplicada en el centroide.' }];
  for (const b of st.bars)
    b.dist.forEach((d, k) => {
      const it = distItem(b, d, k);
      const W = Math.hypot(it.F.x, it.F.y);
      rve.push({ t: 'p', text: `${it.name} = ${fmt(W)} ${F}, aplicada a ${fmt(dot(sub(it.P, b.P0), b.e))} ${L} de ${b.from} sobre el tramo ${b.from}${b.to}.` });
    });
  const nCh = cls.chapas;
  const verifRows: Block[] = [];
  for (let c = 0; c < nCh; c++) {
    const barsC = st.bars.filter((_, i) => sol.chapaOf[i] === c);
    const nodesC = [...new Set(barsC.flatMap((b) => [b.from, b.to]))];
    const items: Item[] = nodesC.flatMap((n) => itemsAt(sol, c, n, names));
    barsC.forEach((b) => b.dist.forEach((d, k) => items.push(distItem(b, d, k))));
    // Centro de momentos: el vínculo con más incógnitas de la chapa.
    const cand = nodesC
      .map((n) => ({ n, k: sol.unknowns.filter((x) => x.node === n && (x.source === 'vinculo' ? !sol.pins.includes(n) : x.chapa === c)).length }))
      .sort((a, b) => b.k - a.k);
    const O = cand[0].n;
    const PO = st.node(O).p;
    const eqTerms = (fn: (it: Item) => { coef: number; text?: string }) => {
      const terms: string[] = [];
      for (const it of items) {
        const { coef, text } = fn(it);
        if (Math.abs(coef) < 1e-12) continue;
        if (it.unknownIndex !== undefined) {
          const un = sol.unknowns[it.unknownIndex];
          const unit = un.kind === 'momento' ? 1 : 1;
          terms.push(termOf(coef / (sol.values[it.unknownIndex] || 1) * unit, un.name, !terms.length));
        } else terms.push(text ?? signed(coef));
      }
      return joinTerms(terms);
    };
    // Coeficientes de incógnitas: se recalculan con la dirección supuesta (valor unitario).
    const coefUnknown = (it: Item, comp: (dir: Vec, P: Vec, isMoment: boolean) => number) => {
      const un = sol.unknowns[it.unknownIndex!];
      return comp(un.dir, it.P, un.kind === 'momento');
    };
    const fx = (it: Item) => (it.unknownIndex !== undefined ? { coef: coefUnknown(it, (d, _p, m) => (m ? 0 : d.x)) * (sol.values[it.unknownIndex] || 1) } : { coef: it.F.x });
    const fy = (it: Item) => (it.unknownIndex !== undefined ? { coef: coefUnknown(it, (d, _p, m) => (m ? 0 : d.y)) * (sol.values[it.unknownIndex] || 1) } : { coef: it.F.y });
    const mo = (it: Item) => {
      if (it.unknownIndex !== undefined)
        return { coef: coefUnknown(it, (d, p, m) => (m ? 1 : cross(sub(p, PO), d))) * (sol.values[it.unknownIndex] || 1) };
      const r = sub(it.P, PO);
      const m = cross(r, it.F) + it.M;
      if (it.M) return { coef: m, text: signed(m) };
      const Fm = Math.hypot(it.F.x, it.F.y);
      const axis = Math.abs(it.F.x) < 1e-12 || Math.abs(it.F.y) < 1e-12;
      return { coef: m, text: axis && Fm ? `${m < 0 ? '−' : '+'} ${fmt(Fm)}·${fmt(Math.abs(m) / Fm)}` : signed(m) };
    };
    if (nCh > 1) rve.push({ t: 'p', text: `Chapa ${c + 1} (tramos ${barsC.map((b) => b.from + b.to).join(', ')}):` });
    rve.push({ t: 'eq', text: `① ΣF_{ix} = 0:   ${eqTerms(fx)} = 0` });
    rve.push({ t: 'eq', text: `② ΣF_{iy} = 0:   ${eqTerms(fy)} = 0` });
    rve.push({ t: 'eq', text: `③ ΣM_{i}^{${O}} = 0:   ${eqTerms(mo)} = 0` });

    // Verificación con momentos respecto de otro punto.
    const other = nodesC.find((n) => n !== O) ?? O;
    const PV = st.node(other).p;
    const sumV = items.reduce((s, it) => s + cross(sub(it.P, PV), it.F) + it.M, 0);
    verifRows.push({ t: 'eq', text: `ΣM_{i}^{${other}} = ${items.map((it) => signed(cross(sub(it.P, PV), it.F) + it.M)).filter((s) => s !== '+ 0').join(' ').replace(/^\+ /, '')} = ${fmt(sumV)}` });
  }
  for (const pin of sol.pins) {
    const vs = sol.unknowns.filter((x) => x.source === 'articulacion' && x.node === pin);
    rve.push({ t: 'p', text: `Equilibrio de la articulación ${pin}: la suma de las fuerzas que recibe de las chapas, de las cargas y de los vínculos aplicados en ella es nula (ΣF_{x} = 0, ΣF_{y} = 0), con ${vs.map((v) => v.name).join(', ')}.` });
  }
  rve.push({ t: 'p', text: 'Resolviendo el sistema de ecuaciones:' });
  rve.push({ t: 'table', head: ['Incógnita', 'Valor'], rows: sol.unknowns.map((x, j) => [x.name, `${fmt(sol.values[j])} ${x.kind === 'momento' ? ML : F}`]) });
  steps.push({ id: 'rve', titulo: '4 – Cálculo de las Reacciones de Vínculo Externo (RVE)', blocks: rve });

  // 5. Verificación.
  steps.push({
    id: 'verificacion',
    titulo: '5 – Verificación de las RVE',
    blocks: [{ t: 'p', text: 'Se toman momentos respecto de otro punto del cuerpo rígido; con los valores hallados la suma debe ser nula.' }, ...verifRows, { t: 'ok', text: 'Las reacciones verifican el equilibrio.' }],
  });

  // 6. DCE.
  steps.push({
    id: 'dce',
    titulo: '6 – Diagrama de Cuerpo Equilibrado (DCE)',
    blocks: [
      { t: 'p', text: 'Las reacciones que resultaron negativas tenían el sentido supuesto equivocado: en el DCE se dibujan con el sentido opuesto y su módulo.' },
      {
        t: 'list',
        items: ext.map((x) => {
          const v = sol.values[sol.unknowns.indexOf(x)];
          if (x.kind === 'momento') return `${x.name} = ${fmt(Math.abs(v))} ${ML}, ${v >= 0 ? 'antihorario' : 'horario (se invierte el sentido supuesto)'}`;
          return `${x.name} = ${fmt(Math.abs(v))} ${F}, ${dirWords(scale(x.dir, v >= 0 ? 1 : -1))}${v < 0 ? ' (se invierte el sentido supuesto)' : ''}`;
        }),
      },
    ],
  });

  // 7–10. Secciones.
  steps.push({
    id: 'secciones',
    titulo: '7 – Secciones y tramos',
    blocks: [
      { t: 'p', text: 'Cada tramo queda entre dos puntos donde cambia la carga. En cada uno se ubica una sección i–i con su variable local x_{i}, medida desde el inicio del tramo en el sentido de recorrido de la barra.' },
      {
        t: 'table',
        head: ['Sección', 'Tramo', 'Variable', 'Rango'],
        rows: sol.bars.map((r) => [`${r.seccion}–${r.seccion}`, `${r.bar.from}${r.bar.to}`, `x_{${r.seccion}}`, `0 ≤ x_{${r.seccion}} ≤ ${fmt(r.bar.L)} ${L}`]),
      },
      ...(sol.bars.some((r) => Math.abs(r.bar.e.y) > 1e-9)
        ? [{ t: 'p' as const, text: 'En las barras no horizontales se usa el Sistema de Referencia Particular (SRP): x′ a lo largo de la barra en el sentido de recorrido e y′ girado 90° antihorario. Los valores positivos se dibujan hacia +y′.' }]
        : []),
    ],
  });
  for (const r of sol.bars) steps.push(sectionStep(sol, r, names, u));

  // 11. Equilibrio de nudos de pórtico (T, cruz, esquinas).
  const nudos = nodeSteps(sol, names, u);
  if (nudos) steps.push(nudos);

  // 12. Tabla de valores.
  steps.push({
    id: 'valores',
    titulo: `${nudos ? 12 : 11} – Tabla de valores`,
    blocks: [
      {
        t: 'table',
        head: ['Punto', 'N', 'Q', 'Mf'],
        rows: sol.bars.flatMap((r) => [
          [`${r.bar.from} (inicio ${r.bar.from}${r.bar.to})`, fmt(r.N.eval(0)), fmt(r.Q.eval(0)), fmt(r.M.eval(0))],
          [`${r.bar.to} (fin ${r.bar.from}${r.bar.to})`, fmt(r.N.eval(r.bar.L)), fmt(r.Q.eval(r.bar.L)), fmt(r.M.eval(r.bar.L))],
        ]),
      },
      { t: 'p', text: `Unidades: N y Q en ${F}; Mf en ${ML}.` },
    ],
  });

  // 12. Controles.
  const ex = sol.extremes;
  const where = (e: typeof ex.max.M) => `tramo ${e.bar}, x = ${fmt(e.x)} ${L}`;
  steps.push({
    id: 'controles',
    titulo: `${nudos ? 13 : 12} – Máximos, mínimos y controles`,
    blocks: [
      {
        t: 'table',
        head: ['Esfuerzo', 'Máximo', 'Ubicación', 'Mínimo', 'Ubicación'],
        rows: (['N', 'Q', 'M'] as const).map((k) => [k === 'M' ? 'Mf' : k, fmt(ex.max[k].valor), where(ex.max[k]), fmt(ex.min[k].valor), where(ex.min[k])]),
      },
      { t: 'p', text: 'Relaciones diferenciales (con q positiva hacia abajo): dQ/dx = −q y dMf/dx = Q. El apunte escribe q = d²Mf/dx²; de las dos relaciones anteriores resulta d²Mf/dx² = −q.' },
      { t: sol.bars.every((r) => r.M.derivative().approxEquals(r.Q, 1)) ? 'ok' : 'warn', text: 'En todos los tramos la derivada del momento flector es el esfuerzo de corte.' },
      { t: sol.bars.every((r) => r.izqIgualDer) ? 'ok' : 'warn', text: 'En todas las secciones el cálculo por izquierda coincide con el cálculo por derecha.' },
      ...(sol.nodeChecks.length
        ? [{ t: (sol.nodeChecks.every((n) => n.ok) ? 'ok' : 'warn') as 'ok' | 'warn', text: `Equilibrio de nudos (${sol.nodeChecks.map((n) => n.node).join(', ')}): ΣF_{x} = 0, ΣF_{y} = 0 y ΣM = 0 en todos.` }]
        : []),
    ],
  });
  return steps;
}

/** ¿Conviene sacar un signo negativo afuera? Se busca que el término independiente quede positivo: (0,5 − x). */
function signOut(p: Poly): boolean {
  const nzc = p.c.filter((v) => Math.abs(v) > 1e-12);
  if (!nzc.length) return false;
  if (Math.abs(p.c[0]) > 1e-12) return p.c[0] < 0;
  return nzc.every((v) => v < 0);
}

/** Término polinómico con el signo afuera: "− 3·x_{1}", "+ (2 + x_{1})". */
function polyTerm(p: Poly, x: string): string {
  const nzc = p.c.filter((v) => Math.abs(v) > 1e-12);
  const neg = signOut(p);
  const txt = fmtPoly(neg ? p.scale(-1) : p, x);
  return `${neg ? '−' : '+'} ${nzc.length === 1 ? txt : `(${txt})`}`;
}

type Key = 'N' | 'Q' | 'M';
interface Terms {
  s: string[];
  n: string[];
  used: Item[];
}

/** Términos de N, Q y Mf de las fuerzas de un lado de la sección (forma simbólica y numérica). */
function sideTerms(sol: Solution, r: BarResult, names: ReturnType<typeof loadNames>, side: 'izq' | 'der', x: string): Record<Key, Terms> {
  const st = sol.structure;
  const b = r.bar;
  const c = sol.chapaOf[st.bars.indexOf(b)];
  const X = Poly.linear(0, 1);
  const nodes = side === 'izq' ? r.nodosIzq : r.nodosDer;
  const partBars = st.bars.filter((bb, k) => sol.chapaOf[k] === c && bb !== b && nodes.includes(bb.from) && nodes.includes(bb.to));
  const items: Item[] = nodes.flatMap((n) => itemsAt(sol, c, n, names));
  partBars.forEach((bb) => bb.dist.forEach((d, k) => items.push(distItem(bb, d, k))));
  const T: Record<Key, Terms> = { N: { s: [], n: [], used: [] }, Q: { s: [], n: [], used: [] }, M: { s: [], n: [], used: [] } };
  const nz = (p: Poly) => p.c.some((v) => Math.abs(v) > 1e-12);
  const symProj = (proj: number, mag: number, name: string) => {
    const k = Math.abs(proj) / mag;
    return `${proj < 0 ? '−' : '+'} ${Math.abs(k - 1) < 1e-9 ? '' : `${fmt(k)}·`}${name}`;
  };
  for (const it of items) {
    const mag = Math.hypot(it.F.x, it.F.y);
    const fe = dot(it.F, b.e);
    const fn = dot(it.F, b.n);
    if (Math.abs(fe) > 1e-12) T.N.s.push(symProj(fe, mag, it.name)), T.N.n.push(signed(fe)), T.N.used.push(it);
    if (Math.abs(fn) > 1e-12) T.Q.s.push(symProj(fn, mag, it.name)), T.Q.n.push(signed(fn)), T.Q.used.push(it);
    if (it.M) {
      T.M.s.push(`${it.M < 0 ? '−' : '+'} ${it.name}`);
      T.M.n.push(signed(it.M));
      T.M.used.push(it);
      continue;
    }
    // Momento respecto de G(x) = P0 + x·e (antihorario positivo): (P − P0) × F − x·(e × F)
    const mG = Poly.const(cross(sub(it.P, b.P0), it.F)).sub(X.scale(cross(b.e, it.F)));
    if (!nz(mG) || !mag) continue;
    let arm = mG.scale(1 / mag);
    const neg = signOut(arm);
    if (neg) arm = arm.scale(-1);
    const armTxt = fmtPoly(arm, x);
    const single = arm.c.filter((v) => Math.abs(v) > 1e-12).length === 1;
    T.M.s.push(`${neg ? '−' : '+'} ${it.name}·${single ? armTxt : `(${armTxt})`}`);
    T.M.n.push(mG.degree === 0 ? signed(mG.c[0]) : `${neg ? '−' : '+'} ${fmt(mag)}·${single ? armTxt : `(${armTxt})`}`);
    T.M.used.push(it);
  }
  // Carga distribuida del propio tramo: entre 0 y x (izquierda) o entre x y L (derecha).
  for (const d of b.dist) {
    const w = Poly.linear(d.q1, (d.q2 - d.q1) / b.L);
    const W0 = w.integrate();
    const T0 = X.mul(w).integrate();
    const W = side === 'izq' ? W0 : Poly.const(W0.eval(b.L)).sub(W0);
    const Tm = side === 'izq' ? T0 : Poly.const(T0.eval(b.L)).sub(T0);
    const pe = W.scale(dot(d.d, b.e));
    const pn = W.scale(dot(d.d, b.n));
    const pm = Tm.sub(X.mul(W)).scale(cross(b.e, d.d));
    const uniforme = Math.abs(d.q1 - d.q2) < 1e-12;
    const q = `q_{${b.from}${b.to}}`;
    const len = side === 'izq' ? x : `(${fmt(b.L)} − ${x})`;
    const proj = (dd: number, p: Poly) => {
      if (!nz(p)) return null;
      const k = Math.abs(dd);
      return {
        s: uniforme ? `${dd < 0 ? '−' : '+'} ${Math.abs(k - 1) < 1e-9 ? '' : `${fmt(k)}·`}${q}·${len}` : polyTerm(p, x),
        n: polyTerm(p, x),
      };
    };
    const a = proj(dot(d.d, b.e), pe);
    if (a) T.N.s.push(a.s), T.N.n.push(a.n);
    const c2 = proj(dot(d.d, b.n), pn);
    if (c2) T.Q.s.push(c2.s), T.Q.n.push(c2.n);
    if (nz(pm)) {
      // izquierda: ∫(t − x)·w ≤ 0 ; derecha: ∫(t − x)·w ≥ 0 ; el signo final lo da (e × d)
      const sgPos = side === 'izq' ? cross(b.e, d.d) < 0 : cross(b.e, d.d) > 0;
      T.M.s.push(uniforme ? `${sgPos ? '+' : '−'} ${q}·${len}·${len}/2` : polyTerm(pm, x));
      T.M.n.push(polyTerm(pm, x));
    }
  }
  return T;
}

const ESF = {
  N: { nombre: 'Esfuerzo Normal (N)', que: 'las proyecciones sobre la normal a la sección', izq: '−', der: '+', sym: 'N' },
  Q: { nombre: 'Esfuerzo de Corte (Q)', que: 'las proyecciones sobre el plano de la sección', izq: '+', der: '−', sym: 'Q' },
  M: { nombre: 'Momento Flector (Mf)', que: 'los momentos respecto del centroide G de la sección', izq: '−', der: '+', sym: 'Mf' },
} as const;

function sectionStep(sol: Solution, r: BarResult, names: ReturnType<typeof loadNames>, u: Units): Step {
  const b = r.bar;
  const i = r.seccion;
  const x = `x_{${i}}`;
  const L = sideTerms(sol, r, names, 'izq', x);
  const R = sideTerms(sol, r, names, 'der', x);
  const rng = `0 ≤ ${x} ≤ ${fmt(b.L)} ${u.longitud}`;
  const blocks: Block[] = [
    {
      t: 'p',
      text: `La sección ${i}–${i} corta el tramo ${b.from}${b.to} a una distancia ${x} de ${b.from}, con ${rng}. Lado izquierdo: ${r.nodosIzq.join(', ')}; lado derecho: ${r.nodosDer.join(', ')}. En cada esfuerzo se desarrolla el lado con menos términos y el otro se usa para verificar.`,
    },
  ];
  const res: Record<Key, { izq: Poly; der: Poly }> = { N: { izq: r.N, der: r.Nder }, Q: { izq: r.Q, der: r.Qder }, M: { izq: r.M, der: r.Mder } };
  const usedItems = new Map<string, Item>();
  const keyBlocks: Block[] = [];
  for (const k of ['N', 'Q', 'M'] as Key[]) {
    const e = ESF[k];
    const useDer = R[k].s.length < L[k].s.length;
    const side = useDer ? 'der' : 'izq';
    const T = useDer ? R[k] : L[k];
    T.used.forEach((it) => usedItems.set(it.name, it));
    const pre = e[side];
    const regla =
      pre === '−' ? `Por ${useDer ? 'derecha' : 'izquierda'} se antepone un signo negativo.` : `Por ${useDer ? 'derecha' : 'izquierda'} se toma la suma con su signo.`;
    const porque = useDer ? ` Se calcula por derecha: ${R[k].s.length} término${R[k].s.length === 1 ? '' : 's'} contra ${L[k].s.length} por izquierda.` : '';
    keyBlocks.push({ t: 'p', text: `${e.nombre}: suma de ${e.que} de las fuerzas a la ${useDer ? 'derecha' : 'izquierda'}. ${regla}${porque}` });
    const val = res[k][side];
    keyBlocks.push({
      t: 'eq',
      text: `${e.sym}_{${i}–${i}}^{${useDer ? 'DER' : 'IZQ'}} = ${pre}[ ${joinTerms(T.s)} ] = ${pre}[ ${joinTerms(T.n)} ] = ${fmtPoly(val, x)}`,
    });
    const other = res[k][useDer ? 'izq' : 'der'];
    keyBlocks.push({
      t: other.approxEquals(val, 1) ? 'ok' : 'warn',
      text: `Por ${useDer ? 'izquierda' : 'derecha'}: ${e.sym}_{${i}–${i}}^{${useDer ? 'IZQ' : 'DER'}} = ${fmtPoly(other, x)}, se arriba al mismo valor.`,
    });
  }
  const items = [...usedItems.values()];
  const qs = b.dist.filter((d) => Math.abs(d.q1 - d.q2) < 1e-12);
  const qVals = qs.length ? `${items.length ? '; ' : ''}q_{${b.from}${b.to}} = ${fmt(qs.reduce((s, d) => s + d.q1, 0))} ${u.fuerza}/${u.longitud}` : '';
  if (items.length || qVals)
    blocks.push({ t: 'p', text: `Valores (DCE): ${items.map((it) => `${it.name} = ${fmt(it.M ? Math.abs(it.M) : Math.hypot(it.F.x, it.F.y))}`).join('; ')}${qVals}.` });
  blocks.push(...keyBlocks);
  if (r.M.degree === 2) {
    const [cc, bb, a] = r.M.c;
    const xv = -bb / (2 * a);
    blocks.push({
      t: 'p',
      text: `Mf es una parábola (a = ${fmt(a)}, b = ${fmt(bb)}, c = ${fmt(cc)}) con ramas hacia ${a < 0 ? 'abajo' : 'arriba'}. Vértice: x_{v} = −b/2a = ${fmt(xv)} ${u.longitud}${xv > 0 && xv < b.L ? `, Mf_{v} = ${fmt(r.M.eval(xv))} ${u.fuerza}·${u.longitud} (dentro del tramo)` : ' (fuera del tramo)'}.`,
    });
  } else if (r.M.degree === 1) blocks.push({ t: 'p', text: `Mf varía linealmente (recta de pendiente ${fmt(r.M.c[1])} = Q).` });
  blocks.push({ t: 'table', head: [x, 'N', 'Q', 'Mf'], rows: [0, b.L].map((xv) => [`${fmt(xv)}`, fmt(r.N.eval(xv)), fmt(r.Q.eval(xv)), fmt(r.M.eval(xv))]) });
  return { id: `seccion-${i}`, titulo: `8 a 10 – Sección ${i}–${i}, tramo ${b.from}${b.to} (N, Q, Mf)`, blocks, bar: b.id };
}

/** Nudos donde se unen 3 o más barras, o 2 barras que forman ángulo (esquina). */
function frameNodes(sol: Solution): string[] {
  const st = sol.structure;
  return st.nodes
    .map((n) => n.id)
    .filter((id) => {
      const bs = st.bars.filter((b) => b.from === id || b.to === id);
      if (bs.length >= 3) return true;
      if (bs.length === 2) {
        const d = bs.map((b) => (b.from === id ? b.e : scale(b.e, -1)));
        return Math.abs(cross(d[0], d[1])) > 1e-6;
      }
      return false;
    });
}

function nodeSteps(sol: Solution, names: ReturnType<typeof loadNames>, u: Units): Step | null {
  const ids = frameNodes(sol);
  if (!ids.length) return null;
  const st = sol.structure;
  const F = u.fuerza;
  const ML = `${u.fuerza}·${u.longitud}`;
  const blocks: Block[] = [
    {
      t: 'p',
      text: 'En los nudos de pórtico (uniones en T, en cruz y esquinas) se aísla el nudo y se verifica su equilibrio. Sobre el nudo actúan, en cada extremo de barra, los esfuerzos N, Q y Mf con sentido opuesto al que actúan sobre la barra, más las cargas y reacciones aplicadas en él.',
    },
  ];
  for (const id of ids) {
    const elems: NudoElem[] = [];
    for (const r of sol.bars) {
      const b = r.bar;
      const nm = `${b.from}${b.to}`;
      if (b.from === id) {
        const N = r.N.eval(0), Q = r.Q.eval(0), M = r.M.eval(0);
        const axial = scale(b.e, N), shear = scale(b.n, -Q);
        elems.push({ label: `${nm} (inicio)`, dir: b.e, axial, shear, F: add(axial, shear), M, tipo: 'barra', esf: { N, Q, M } });
      }
      if (b.to === id) {
        const N = r.N.eval(b.L), Q = r.Q.eval(b.L), M = r.M.eval(b.L);
        const axial = scale(b.e, -N), shear = scale(b.n, Q);
        elems.push({ label: `${nm} (fin)`, dir: scale(b.e, -1), axial, shear, F: add(axial, shear), M: -M, tipo: 'barra', esf: { N, Q, M } });
      }
    }
    {
      for (const f of names.forces) if (f.node === id) elems.push({ label: f.name, F: f.F, M: 0, tipo: 'carga' });
      for (const c of names.couples) if (c.node === id) elems.push({ label: c.name, F: vec(0, 0), M: c.M, tipo: 'carga' });
      sol.unknowns.forEach((un, j) => {
        if (un.source !== 'vinculo' || un.node !== id) return;
        const v = sol.values[j];
        elems.push(un.kind === 'momento' ? { label: un.name, F: vec(0, 0), M: v, tipo: 'reaccion' } : { label: un.name, F: scale(un.dir, v), M: 0, tipo: 'reaccion' });
      });
    }
    const sum = (f: (e: NudoElem) => number) => elems.reduce((s2, e) => s2 + f(e), 0);
    const terms = (f: (e: NudoElem) => number) => joinTerms(elems.map(f).filter((v) => Math.abs(v) > 1e-10).map(signed));
    const bars = elems.filter((e) => e.tipo === 'barra').map((e) => e.label.split(' ')[0]);
    blocks.push({ t: 'p', text: `Nudo ${id}: se unen las barras ${bars.join(', ')}.` });
    blocks.push({ t: 'nudo', node: id, elems });
    blocks.push({
      t: 'table',
      head: ['Elemento', 'N', 'Q', 'Mf', `F_{x} sobre el nudo [${F}]`, `F_{y} [${F}]`, `M [${ML}]`],
      rows: elems.map((e) => [e.tipo === 'barra' ? `Barra ${e.label}` : e.label, e.esf ? fmt(e.esf.N) : '', e.esf ? fmt(e.esf.Q) : '', e.esf ? fmt(e.esf.M) : '', fmt(e.F.x), fmt(e.F.y), fmt(e.M)]),
    });
    const sx = sum((e) => e.F.x), sy = sum((e) => e.F.y), sm = sum((e) => e.M);
    blocks.push({ t: 'eq', text: `ΣF_{x} = ${terms((e) => e.F.x)} = ${fmt(sx)}` });
    blocks.push({ t: 'eq', text: `ΣF_{y} = ${terms((e) => e.F.y)} = ${fmt(sy)}` });
    blocks.push({ t: 'eq', text: `ΣM_{${id}} = ${terms((e) => e.M)} = ${fmt(sm)}` });
    const scl = Math.max(1, ...elems.map((e) => Math.max(Math.abs(e.F.x), Math.abs(e.F.y), Math.abs(e.M))));
    const ok = Math.abs(sx) < 1e-6 * scl && Math.abs(sy) < 1e-6 * scl && Math.abs(sm) < 1e-6 * scl;
    blocks.push({ t: ok ? 'ok' : 'warn', text: ok ? `El nudo ${id} está en equilibrio.` : `El nudo ${id} no cierra: revisar los datos.` });
  }
  return { id: 'nudos', titulo: '11 – Equilibrio de nudos', blocks };
}

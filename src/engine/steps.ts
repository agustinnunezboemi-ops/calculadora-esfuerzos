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
  | { t: 'warn'; text: string };

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

  // 11. Tabla de valores.
  steps.push({
    id: 'valores',
    titulo: '11 – Tabla de valores',
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
    titulo: '12 – Máximos, mínimos y controles',
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

/** Término polinómico con el signo afuera: "− 3·x_{1}", "+ (2 + x_{1})". */
function polyTerm(p: Poly, x: string): string {
  const nzc = p.c.filter((v) => Math.abs(v) > 1e-12);
  const neg = nzc.length > 0 && nzc.every((v) => v < 0);
  const txt = fmtPoly(neg ? p.scale(-1) : p, x);
  return `${neg ? '−' : '+'} ${nzc.length === 1 ? txt : `(${txt})`}`;
}

function sectionStep(sol: Solution, r: BarResult, names: ReturnType<typeof loadNames>, u: Units): Step {
  const st = sol.structure;
  const b = r.bar;
  const i = r.seccion;
  const x = `x_{${i}}`;
  const c = sol.chapaOf[st.bars.indexOf(b)];
  const X = Poly.linear(0, 1);
  const leftBars = st.bars.filter((bb, k) => sol.chapaOf[k] === c && bb !== b && r.nodosIzq.includes(bb.from) && r.nodosIzq.includes(bb.to));
  const items: Item[] = r.nodosIzq.flatMap((n) => itemsAt(sol, c, n, names));
  leftBars.forEach((bb) => bb.dist.forEach((d, k) => items.push(distItem(bb, d, k))));

  // Cada término se arma dos veces: con nombres (módulos del DCE) y con números.
  const nz = (p: Poly) => p.c.some((v) => Math.abs(v) > 1e-12);
  const T = { N: { s: [] as string[], n: [] as string[] }, Q: { s: [] as string[], n: [] as string[] }, M: { s: [] as string[], n: [] as string[] } };
  /** "± k·Nombre" a partir de la proyección y el módulo. */
  const symProj = (proj: number, mag: number, name: string) => {
    const k = Math.abs(proj) / mag;
    return `${proj < 0 ? '−' : '+'} ${Math.abs(k - 1) < 1e-9 ? '' : `${fmt(k)}·`}${name}`;
  };
  for (const it of items) {
    const mag = Math.hypot(it.F.x, it.F.y);
    const fe = dot(it.F, b.e);
    const fn = dot(it.F, b.n);
    if (Math.abs(fe) > 1e-12) T.N.s.push(symProj(fe, mag, it.name)), T.N.n.push(signed(fe));
    if (Math.abs(fn) > 1e-12) T.Q.s.push(symProj(fn, mag, it.name)), T.Q.n.push(signed(fn));
    if (it.M) {
      T.M.s.push(`${it.M < 0 ? '−' : '+'} ${it.name}`);
      T.M.n.push(signed(it.M));
      continue;
    }
    const mG = Poly.const(cross(sub(it.P, b.P0), it.F)).sub(X.scale(cross(b.e, it.F)));
    if (!nz(mG) || !mag) continue;
    // Brazo de palanca: mG / |F|, con el signo afuera.
    let arm = mG.scale(1 / mag);
    const neg = arm.c.filter((v) => Math.abs(v) > 1e-12).every((v) => v < 0);
    if (neg) arm = arm.scale(-1);
    const armTxt = fmtPoly(arm, x);
    const single = arm.c.filter((v) => Math.abs(v) > 1e-12).length === 1;
    T.M.s.push(`${neg ? '−' : '+'} ${it.name}·${single ? armTxt : `(${armTxt})`}`);
    T.M.n.push(mG.degree === 0 ? signed(mG.c[0]) : `${neg ? '−' : '+'} ${fmt(mag)}·${single ? armTxt : `(${armTxt})`}`);
  }
  // Carga distribuida sobre el propio tramo, entre 0 y x_i.
  b.dist.forEach((d) => {
    const w = Poly.linear(d.q1, (d.q2 - d.q1) / b.L);
    const W = w.integrate();
    const Tm = X.mul(w).integrate();
    const pe = W.scale(dot(d.d, b.e));
    const pn = W.scale(dot(d.d, b.n));
    const pm = Tm.sub(X.mul(W)).scale(cross(b.e, d.d));
    const uniforme = Math.abs(d.q1 - d.q2) < 1e-12;
    const q = `q_{${b.from}${b.to}}`;
    // Para carga uniforme: resultante q·x_i aplicada a x_i/2 de la sección.
    const symF = (k: number) => (uniforme ? `${k < 0 ? '−' : '+'} ${q}·${x}` : `${k < 0 ? '−' : '+'} (${fmtPoly(k < 0 ? W.scale(-1) : W, x)})`);
    const proj = (dd: number, p: Poly) => {
      if (!nz(p)) return null;
      return { s: uniforme ? `${dd < 0 ? '−' : '+'} ${Math.abs(Math.abs(dd) - 1) < 1e-9 ? '' : `${fmt(Math.abs(dd))}·`}${q}·${x}` : symF(dd), n: polyTerm(p, x) };
    };
    const a = proj(dot(d.d, b.e), pe);
    if (a) T.N.s.push(a.s), T.N.n.push(a.n);
    const c2 = proj(dot(d.d, b.n), pn);
    if (c2) T.Q.s.push(c2.s), T.Q.n.push(c2.n);
    if (nz(pm)) {
      const sg = cross(b.e, d.d) < 0 ? '+' : '−'; // ∫(t − x)·w dt ≤ 0
      T.M.s.push(uniforme ? `${sg} ${q}·${x}·${x}/2` : `+ (${fmtPoly(pm, x)})`);
      T.M.n.push(polyTerm(pm, x));
    }
  });
  const br = (t: string[]) => joinTerms(t);
  const nTerms = T.N.n;
  const qTerms = T.Q.n;
  const mTerms = T.M.n;
  const qVals = b.dist.length && b.dist.every((d) => Math.abs(d.q1 - d.q2) < 1e-12) ? `, con q_{${b.from}${b.to}} = ${fmt(b.dist.reduce((s, d) => s + d.q1, 0))} ${u.fuerza}/${u.longitud}` : '';
  const valuesLine = items.length
    ? `Valores (DCE): ${items.map((it) => `${it.name} = ${fmt(it.M ? Math.abs(it.M) : Math.hypot(it.F.x, it.F.y))}`).join('; ')}${qVals}.`
    : '';
  const rng = `0 ≤ ${x} ≤ ${fmt(b.L)} ${u.longitud}`;
  const blocks: Block[] = [
    { t: 'p', text: `La sección ${i}–${i} corta el tramo ${b.from}${b.to} a una distancia ${x} de ${b.from}, con ${rng}. Lado izquierdo: ${r.nodosIzq.join(', ')} y el trozo de barra hasta la sección.` },
    { t: 'p', text: 'Esfuerzo Normal (N): suma de las proyecciones sobre la normal a la sección de las fuerzas a la izquierda. Por izquierda se antepone un signo negativo.' },
    ...(valuesLine ? [{ t: 'p' as const, text: valuesLine }] : []),
    { t: 'eq', text: `N_{${i}–${i}}^{IZQ} = −[ ${br(T.N.s)} ] = −[ ${br(nTerms)} ] = ${fmtPoly(r.N, x)}` },
    { t: r.N.approxEquals(r.Nder, 1) ? 'ok' : 'warn', text: `Por derecha: N_{${i}–${i}}^{DER} = ${fmtPoly(r.Nder, x)}, se arriba al mismo valor.` },
    { t: 'p', text: 'Esfuerzo de Corte (Q): suma de las proyecciones sobre el plano de la sección de las fuerzas a la izquierda. Por derecha se antepone un signo negativo.' },
    { t: 'eq', text: `Q_{${i}–${i}}^{IZQ} = +[ ${br(T.Q.s)} ] = +[ ${br(qTerms)} ] = ${fmtPoly(r.Q, x)}` },
    { t: r.Q.approxEquals(r.Qder, 1) ? 'ok' : 'warn', text: `Por derecha: Q_{${i}–${i}}^{DER} = ${fmtPoly(r.Qder, x)}, se arriba al mismo valor.` },
    { t: 'p', text: 'Momento Flector (Mf): suma de los momentos respecto del centroide G de la sección de las fuerzas a la izquierda. Por izquierda se antepone un signo negativo.' },
    { t: 'eq', text: `Mf_{${i}–${i}}^{IZQ} = −[ ${br(T.M.s)} ] = −[ ${br(mTerms)} ] = ${fmtPoly(r.M, x)}` },
    { t: r.M.approxEquals(r.Mder, 1) ? 'ok' : 'warn', text: `Por derecha: Mf_{${i}–${i}}^{DER} = ${fmtPoly(r.Mder, x)}, se arriba al mismo valor.` },
  ];
  // Interpretación del momento.
  if (r.M.degree === 2) {
    const [cc, bb, a] = r.M.c;
    const xv = -bb / (2 * a);
    blocks.push({
      t: 'p',
      text: `Mf es una parábola (a = ${fmt(a)}, b = ${fmt(bb)}, c = ${fmt(cc)}) con ramas hacia ${a < 0 ? 'abajo' : 'arriba'}. Vértice: x_{v} = −b/2a = ${fmt(xv)} ${u.longitud}${xv > 0 && xv < b.L ? `, Mf_{v} = ${fmt(r.M.eval(xv))} ${u.fuerza}·${u.longitud} (dentro del tramo)` : ' (fuera del tramo)'}.`,
    });
  } else if (r.M.degree === 1) blocks.push({ t: 'p', text: `Mf varía linealmente (recta de pendiente ${fmt(r.M.c[1])} = Q).` });
  blocks.push({
    t: 'table',
    head: [x, 'N', 'Q', 'Mf'],
    rows: [0, b.L].map((xv) => [`${fmt(xv)}`, fmt(r.N.eval(xv)), fmt(r.Q.eval(xv)), fmt(r.M.eval(xv))]),
  });
  return { id: `seccion-${i}`, titulo: `8 a 10 – Sección ${i}–${i}, tramo ${b.from}${b.to} (N, Q, Mf)`, blocks, bar: b.id };
}

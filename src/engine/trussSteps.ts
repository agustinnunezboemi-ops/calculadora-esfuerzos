/** Paso a paso de reticulados con la redacción del TP N°5. */
import { TrussSolution, SectionResult } from './truss.ts';
import { Step, Block, Units, fmt } from './steps.ts';
import { Vec, vec, sub, cross } from './model.ts';

const tipoNombre = { movil: 'apoyo móvil', biela: 'biela', fijo: 'apoyo fijo', empotramiento: 'empotramiento' } as const;
const restr = { movil: 1, biela: 1, fijo: 2, empotramiento: 3 } as const;

export const estado = (v: number) => (Math.abs(v) < 1e-9 ? 'nula' : v > 0 ? 'tracción (T)' : 'compresión (C)');

function term(coef: number, name: string, first: boolean) {
  if (Math.abs(coef) < 1e-12) return '';
  const mag = Math.abs(coef);
  const k = Math.abs(mag - 1) < 1e-9 ? '' : `${fmt(mag, 4)}·`;
  return `${coef < 0 ? '− ' : first ? '' : '+ '}${k}${name}`;
}
function num(v: number, first: boolean) {
  if (Math.abs(v) < 1e-12) return '';
  return `${v < 0 ? '− ' : first ? '' : '+ '}${fmt(Math.abs(v))}`;
}
function join(parts: string[]) {
  const p = parts.filter(Boolean);
  if (!p.length) return '0';
  return p.map((t, i) => (i === 0 ? t.replace(/^\+ /, '') : t)).join(' ');
}

export function buildTrussSteps(sol: TrussSolution, u: Units): Step[] {
  const F = u.fuerza;
  const steps: Step[] = [];
  const { b, v, r } = sol;

  steps.push({
    id: 'rigidez',
    titulo: '1 – Condición de rigidez',
    blocks: [
      { t: 'p', text: `El reticulado tiene b = ${b} barras y v = ${v} vértices (nodos). Para que sea rígido debe cumplirse b = 2v − 3.` },
      { t: 'eq', text: `b = ${b}   ·   2v − 3 = 2·${v} − 3 = ${2 * v - 3}` },
      sol.rigido ? { t: 'ok', text: 'Se cumple la condición de rigidez: el reticulado se comporta como un cuerpo rígido.' } : { t: 'warn', text: sol.motivo },
    ],
  });
  if (!sol.rigido || sol.status === 'invalido') return steps;

  steps.push({
    id: 'vinculos',
    titulo: '2 – Vinculación externa',
    blocks: [
      { t: 'p', text: 'Como cuerpo rígido en el plano, el reticulado tiene 3 grados de libertad que deben restringir los vínculos externos.' },
      { t: 'table', head: ['Nodo', 'Vínculo', 'Restringe'], rows: sol.model.supports.map((s) => [s.node, tipoNombre[s.type], String(restr[s.type])]) },
      sol.status === 'isostatico' ? { t: 'ok', text: `Condiciones de vínculo = ${r} = grados de libertad. ${sol.motivo}` } : { t: 'warn', text: sol.motivo },
    ],
  });
  if (sol.status !== 'isostatico') return steps;

  // DCL + RVE
  const pos = sol.pos;
  const loads = sol.model.loads.flatMap((l) => (l.type === 'puntual' && l.node ? [{ name: `P_{${l.node}}`, node: l.node, F: vec(Math.cos((l.angle * Math.PI) / 180) * l.value, Math.sin((l.angle * Math.PI) / 180) * l.value) }] : []));
  const R = sol.reactions;
  const O = [...new Set(R.map((x) => x.node))].sort((p, q) => R.filter((x) => x.node === q).length - R.filter((x) => x.node === p).length)[0];
  const PO = pos[O];
  const cl = (x: number) => (Math.abs(x) < 1e-12 ? 0 : x);
  const mom = (P: Vec, Fv: Vec) => cl(cross(sub(P, PO), Fv));
  steps.push({
    id: 'dcl',
    titulo: '3 – Diagrama de Cuerpo Libre (DCL)',
    blocks: [
      { t: 'p', text: 'Ponemos en evidencia las Reacciones de Vínculo Externo (RVE), supuestas positivas según el Sistema de Referencia Global.' },
      { t: 'list', items: R.map((x) => `${x.name} en ${x.node}`) },
    ],
  });
  const eqX = join([...R.map((x, i) => term(x.dir.x, x.name, i === 0)), ...loads.map((l) => num(l.F.x, false))]);
  const eqY = join([...R.map((x, i) => term(x.dir.y, x.name, i === 0)), ...loads.map((l) => num(l.F.y, false))]);
  const eqM = join([...R.map((x, i) => term(mom(pos[x.node], x.dir), x.name, i === 0)), ...loads.map((l) => num(mom(pos[l.node], l.F), false))]);
  steps.push({
    id: 'rve',
    titulo: '4 – Cálculo de las RVE',
    blocks: [
      { t: 'eq', text: `ΣM_{${O}} = 0:   ${eqM} = 0` },
      { t: 'eq', text: `ΣF_{x} = 0:   ${eqX} = 0` },
      { t: 'eq', text: `ΣF_{y} = 0:   ${eqY} = 0` },
      { t: 'table', head: ['Reacción', 'Valor'], rows: R.map((x) => [x.name, `${fmt(x.value)} ${F}`]) },
    ],
  });
  steps.push({
    id: 'dce',
    titulo: '5 – Diagrama de Cuerpo Equilibrado (DCE)',
    blocks: [
      { t: 'p', text: 'Las reacciones negativas se dibujan con el sentido opuesto al supuesto.' },
      {
        t: 'list',
        items: R.map((x) => {
          const d = x.value >= 0 ? x.dir : vec(-x.dir.x, -x.dir.y);
          const w = Math.abs(d.y) < 1e-12 ? (d.x > 0 ? 'hacia la derecha' : 'hacia la izquierda') : Math.abs(d.x) < 1e-12 ? (d.y > 0 ? 'hacia arriba' : 'hacia abajo') : 'inclinada';
          return `${x.name} = ${fmt(Math.abs(x.value))} ${F}, ${w}${x.value < 0 ? ' (se invierte el sentido supuesto)' : ''}`;
        }),
      },
    ],
  });

  // Barras de fuerza nula
  steps.push({
    id: 'nulas',
    titulo: '6 – Barras de fuerza nula',
    blocks: sol.zero.length
      ? [
          { t: 'p', text: 'Por inspección de los nodos sin cargas ni vínculos:' },
          {
            t: 'list',
            items: sol.zero.map((z) =>
              z.regla === 'dos-barras'
                ? `F_{${z.bar}} = 0: en el nodo ${z.node} concurren solo dos barras no colineales y no hay carga.`
                : `F_{${z.bar}} = 0: en el nodo ${z.node} concurren tres barras, ${z.colineales!.map((c) => `F_{${c}}`).join(' y ')} son colineales, y no hay carga.`,
            ),
          },
        ]
      : [{ t: 'p', text: 'No hay barras de fuerza nula identificables por inspección.' }],
  });

  // Método de los nodos
  const nodos: Block[] = [
    {
      t: 'p',
      text: 'En cada nodo actúa un sistema de fuerzas concurrentes: solo hay dos ecuaciones de proyección, por lo que se elige cada vez un nodo con a lo sumo dos incógnitas. Las barras se suponen traccionadas (la fuerza sale del nodo); un resultado negativo indica compresión.',
    },
  ];
  for (const o of sol.orden) {
    const unk = o.unknown;
    nodos.push({ t: 'p', text: o.verifica ? `Nodo ${o.node} (verificación): todas sus barras ya son conocidas.` : `Nodo ${o.node}: incógnitas ${unk.map((x) => `F_{${x}}`).join(' y ')}.` });
    const eq = (k: 'x' | 'y') =>
      join([
        ...unk.map((id, i) => term(o.dirs[id][k], `F_{${id}}`, i === 0)),
        ...o.known.map((kn) => {
          const val = kn.F[k];
          if (Math.abs(val) < 1e-12) return '';
          if (kn.bar) return `${val < 0 ? '−' : '+'} ${fmt(Math.abs(o.dirs[kn.bar][k]), 4) === '1' ? '' : `${fmt(Math.abs(o.dirs[kn.bar][k]), 4)}·`}${fmt(Math.abs(sol.forces[kn.bar]))}`;
          return num(val, false);
        }),
      ]);
    const sumK = (k: 'x' | 'y') => unk.reduce((s, id) => s + o.dirs[id][k] * sol.forces[id], 0) + o.known.reduce((s, kn) => s + kn.F[k], 0);
    nodos.push({ t: 'eq', text: `ΣF_{x} = 0:   ${eq('x')} = 0${o.verifica ? `   →   ${fmt(sumK('x'))}` : ''}` });
    nodos.push({ t: 'eq', text: `ΣF_{y} = 0:   ${eq('y')} = 0${o.verifica ? `   →   ${fmt(sumK('y'))}` : ''}` });
    if (o.verifica) nodos.push({ t: 'ok', text: `El nodo ${o.node} verifica el equilibrio.` });
    else nodos.push({ t: 'list', items: unk.map((id) => `F_{${id}} = ${fmt(sol.forces[id])} ${F}: ${estado(sol.forces[id])}`) });
  }
  if (sol.atascado.length)
    nodos.push({ t: 'warn', text: `En los nodos ${sol.atascado.join(', ')} quedan más de dos incógnitas: se resuelven con el método de las secciones (o planteando todas las ecuaciones a la vez).` });
  steps.push({ id: 'nodos', titulo: '7 – Método de los nodos', blocks: nodos });

  steps.push({
    id: 'resumen',
    titulo: '8 – Resumen de fuerzas en las barras',
    blocks: [
      { t: 'table', head: ['Barra', `Fuerza [${F}]`, 'Estado'], rows: sol.bars.map((x) => [x.id, fmt(sol.forces[x.id]), estado(sol.forces[x.id])]) },
      { t: sol.residual < 1e-6 ? 'ok' : 'warn', text: 'Todos los nodos quedan en equilibrio con estas fuerzas.' },
    ],
  });
  return steps;
}

export function buildSectionSteps(sol: TrussSolution, sec: SectionResult, u: Units): Step {
  const F = u.fuerza;
  const L = u.longitud;
  if (!sec.ok) return { id: 'secciones', titulo: 'Método de las secciones', blocks: [{ t: 'warn', text: sec.motivo ?? 'Corte inválido.' }] };
  const blocks: Block[] = [
    { t: 'p', text: `Se cortan las barras ${sec.barras.map((x) => x.bar).join(', ')} y se analiza la parte formada por los nodos ${sec.lado.join(', ')}, que tiene menos fuerzas exteriores. Las barras cortadas se suponen traccionadas.` },
  ];
  for (const x of sec.barras) {
    const otras = sec.barras.filter((y) => y.bar !== x.bar).map((y) => y.bar);
    if (x.ecuacion.tipo === 'momento') {
      blocks.push({ t: 'p', text: `Barra ${x.bar}: se toman momentos respecto ${/^[A-Z]/.test(x.ecuacion.nombre) ? `del nodo ${x.ecuacion.nombre}` : `del punto ${x.ecuacion.nombre} ${L}`}, ${otras.length === 2 ? `intersección de ${otras.join(' y ')}` : `sobre la recta de ${otras[0]}`}, así esas fuerzas no dan momento.` });
      const terms = x.terminos.filter((t) => Math.abs(t.aporte) > 1e-12).map((t, i) => {
        const Fm = Math.hypot(t.F.x, t.F.y);
        const axis = Math.abs(t.F.x) < 1e-12 || Math.abs(t.F.y) < 1e-12;
        return `${t.aporte < 0 ? '− ' : i === 0 ? '' : '+ '}${axis ? `${fmt(Fm)}·${fmt(Math.abs(t.aporte) / Fm)}` : fmt(Math.abs(t.aporte))}`;
      });
      blocks.push({ t: 'eq', text: `ΣM_{${x.ecuacion.nombre}} = 0:   ${join([...terms, term(x.coef, `F_{${x.bar}}`, !terms.length)])} = 0` });
    } else {
      blocks.push({ t: 'p', text: `Barra ${x.bar}: ${otras.join(' y ')} son paralelas, así que se proyecta en la dirección perpendicular a ellas.` });
      blocks.push({ t: 'eq', text: `ΣF_{⊥} = 0:   ${join([...x.terminos.map((t, i) => num(t.aporte, i === 0)), term(x.coef, `F_{${x.bar}}`, false)])} = 0` });
    }
    const ok = Math.abs(x.value - sol.forces[x.bar]) < 1e-6 * Math.max(1, Math.abs(x.value));
    blocks.push({ t: ok ? 'ok' : 'warn', text: `F_{${x.bar}} = ${fmt(x.value)} ${F}: ${estado(x.value)}. Coincide con el método de los nodos.` });
  }
  return { id: 'secciones', titulo: '9 – Método de las secciones', blocks };
}

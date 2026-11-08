import React from 'react';
import { NudoElem, fmt } from '../engine/steps.ts';
import { Vec, vec, add, scale, norm } from '../engine/model.ts';

/** DCL de un nudo de pórtico: tramos de barra con N, Q y Mf que actúan sobre el nudo, cargas y reacciones. */
export function NudoDiagram({ node, elems }: { node: string; elems: NudoElem[] }) {
  const S = 380;
  const c = vec(S / 2, S / 2);
  const scr = (d: Vec) => vec(d.x, -d.y); // SRG → pantalla
  const stub = 140;
  const arrow = (from: Vec, d: Vec, len: number, cls: string, key: string, label: string, labelSide = 1) => {
    const u = scr(d);
    const to = add(from, scale(u, len));
    const lab = add(add(from, scale(u, len / 2)), scale(vec(-u.y, u.x), 12 * labelSide));
    return (
      <g key={key} className={cls}>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={`url(#nudo-${cls})`} />
        <text x={lab.x} y={lab.y + 4} textAnchor="middle">{label}</text>
      </g>
    );
  };
  const parts: React.ReactNode[] = [];
  let loadAngle = 0;
  elems.forEach((e, i) => {
    if (e.tipo === 'barra' && e.dir && e.esf) {
      const u = scr(e.dir);
      const end = add(c, scale(u, stub));
      parts.push(<line key={`b${i}`} x1={c.x} y1={c.y} x2={end.x} y2={end.y} className="nudo-barra" />);
      const nm = e.label.split(' ')[0];
      const lab = add(c, scale(u, stub + 16));
      parts.push(<text key={`n${i}`} x={lab.x} y={lab.y + 4} textAnchor="middle" className="nudo-nombre">{nm}</text>);
      // Esfuerzos aplicados en la mitad del tramo de barra, sobre el nudo.
      const mid = add(c, scale(u, stub * 0.72));
      if (e.axial && norm(e.axial) > 1e-9) {
        const d = scale(e.axial, 1 / norm(e.axial));
        const from = add(mid, scale(scr(d), -17));
        parts.push(arrow(from, d, 34, 'axil', `a${i}`, `N ${fmt(Math.abs(e.esf.N), 2)}`, 1));
      }
      if (e.shear && norm(e.shear) > 1e-9) {
        const d = scale(e.shear, 1 / norm(e.shear));
        const at = add(c, scale(u, stub * 0.42));
        const from = add(at, scale(scr(d), -36));
        parts.push(arrow(from, d, 30, 'corte', `s${i}`, `Q ${fmt(Math.abs(e.esf.Q), 2)}`, -1));
      }
      if (Math.abs(e.M) > 1e-9) {
        const p = add(c, scale(u, stub * 0.2));
        const r = 12;
        const ccw = e.M > 0;
        const a0 = ccw ? -0.3 * Math.PI : 1.3 * Math.PI;
        const a1 = ccw ? 1.3 * Math.PI : -0.3 * Math.PI;
        const P = (a: number) => vec(p.x + r * Math.cos(a), p.y - r * Math.sin(a));
        const s0 = P(a0), s1 = P(a1);
        const off = add(scale(vec(-u.y, u.x), -24), scale(u, 4));
        parts.push(
          <g key={`m${i}`} className="momento">
            <path d={`M${s0.x} ${s0.y} A${r} ${r} 0 1 ${ccw ? 0 : 1} ${s1.x} ${s1.y}`} fill="none" markerEnd="url(#nudo-momento)" />
            <text x={p.x + off.x} y={p.y + off.y + 4} textAnchor="middle">M {fmt(Math.abs(e.M), 2)}</text>
          </g>,
        );
      }
    } else if (norm(e.F) > 1e-9) {
      const d = scale(e.F, 1 / norm(e.F));
      const from = add(c, scale(scr(d), -70 - 8 * loadAngle));
      loadAngle++;
      parts.push(arrow(from, d, 52, e.tipo === 'reaccion' ? 'reac' : 'carga', `f${i}`, `${e.label.replace(/_\{(.*?)\}/g, '$1')} ${fmt(norm(e.F), 2)}`, 1));
    } else if (Math.abs(e.M) > 1e-9) {
      parts.push(<text key={`c${i}`} x={c.x} y={c.y + 34} textAnchor="middle" className="carga">{e.label.replace(/_\{(.*?)\}/g, '$1')} = {fmt(e.M, 2)}</text>);
    }
  });
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="nudo-dcl" role="img" aria-label={`Diagrama de cuerpo libre del nudo ${node}`}>
      <defs>
        {['axil', 'corte', 'momento', 'carga', 'reac'].map((k) => (
          <marker key={k} id={`nudo-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className={`punta-${k}`} />
          </marker>
        ))}
      </defs>
      {parts}
      <circle cx={c.x} cy={c.y} r={7} className="nudo-centro" />
      <text x={c.x + 10} y={c.y - 10} className="nudo-nombre">{node}</text>
    </svg>
  );
}

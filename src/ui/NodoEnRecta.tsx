import React, { useState } from 'react';
import { Model } from '../engine/model.ts';
import { puntoEnRecta, alinearNodos, Alineacion } from '../engine/geometria.ts';
import { NumIn, Math_ } from './App.tsx';

/**
 * Herramientas de geometría del panel de nodos:
 *  - «Nodo sobre recta»: ubica un nodo entre dos nodos dados con trigonometría.
 *  - «Alinear nodos»: lleva exactamente sobre su recta los nodos que quedaron casi alineados.
 */
export function NodoEnRecta({ model, unidad, onModel, onAviso }: {
  model: Model;
  unidad: string;
  onModel: (m: Model) => void;
  onAviso: (texto: string) => void;
}) {
  const ids = model.nodes.map((n) => n.id);
  const [p, setP] = useState(ids[0] ?? '');
  const [q, setQ] = useState(ids[1] ?? '');
  const [coord, setCoord] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [ultimo, setUltimo] = useState<string[] | null>(null);
  const P = model.nodes.find((n) => n.id === p);
  const Q = model.nodes.find((n) => n.id === q);
  const vertical = !!P && !!Q && Math.abs(Q.x - P.x) < 1e-9;

  const agregar = () => {
    if (!P || !Q || p === q) return onAviso('Elegí dos nodos distintos que definan la recta.');
    try {
      const r = puntoEnRecta(P, Q, coord, vertical);
      const used = new Set(ids);
      const id = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !used.has(l)) ?? `N${ids.length + 1}`;
      onModel({ ...model, nodes: [...model.nodes, { id, x: r.x, y: r.y }] });
      setUltimo([`Nodo ${id} sobre la recta ${p}–${q}:`, ...r.desarrollo]);
      onAviso(`Nodo ${id} creado en (${+r.x.toFixed(4)}; ${+r.y.toFixed(4)}) ${unidad}, exactamente sobre la recta ${p}–${q}.`);
    } catch (e) {
      onAviso((e as Error).message);
    }
  };

  const alinear = () => {
    const { model: m, cambios } = alinearNodos(model);
    if (!cambios.length) {
      setUltimo(null);
      return onAviso('No hay nodos para alinear: ninguno está casi (pero no exactamente) sobre la recta de dos vecinos.');
    }
    onModel(m);
    setUltimo(cambios.flatMap((c: Alineacion) => [`Nodo ${c.node} sobre la recta ${c.entre.join('–')} (antes y = ${+c.antes.y.toFixed(4)}):`, ...c.desarrollo]));
    onAviso(`Se alinearon ${cambios.length} nodo(s): ${cambios.map((c) => `${c.node} sobre ${c.entre.join('–')}`).join(', ')}.`);
  };

  return (
    <div className="nodo-recta">
      <div className="nodo-recta-botones">
        <button className="agregar" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>Nodo sobre recta</button>
        <button className="agregar" onClick={alinear} title="Ubica exactamente sobre su recta los nodos que quedaron casi alineados con dos vecinos">Alinear nodos</button>
      </div>
      {abierto && (
        <div className="nodo-recta-form">
          <span>Entre</span>
          <select aria-label="Primer nodo de la recta" value={p} onChange={(e) => setP(e.target.value)}>{ids.map((id) => <option key={id}>{id}</option>)}</select>
          <span>y</span>
          <select aria-label="Segundo nodo de la recta" value={q} onChange={(e) => setQ(e.target.value)}>{ids.map((id) => <option key={id}>{id}</option>)}</select>
          <span>{vertical ? 'en y =' : 'en x ='}</span>
          <NumIn label={vertical ? 'Ordenada del nuevo nodo' : 'Abscisa del nuevo nodo'} width={60} value={coord} onChange={setCoord} />
          <span>{unidad}</span>
          <button onClick={agregar}>Agregar</button>
        </div>
      )}
      {ultimo && (
        <div className="nodo-recta-desarrollo" aria-live="polite">
          {ultimo.map((t, i) => <p key={i} className={i === 0 || t.startsWith('Nodo') ? '' : 'ecuacion'}><Math_ text={t} /></p>)}
        </div>
      )}
    </div>
  );
}

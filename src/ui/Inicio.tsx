import React from 'react';

export type Seccion = 'esfuerzos' | 'reticulados' | 'materiales' | 'ayuda';

interface Opcion {
  id: Seccion;
  nombre: string;
  que: string;
  estado: 'lista' | 'diseno' | 'futuro';
  dibujo: React.ReactNode;
}

const OPCIONES: Opcion[] = [
  {
    id: 'esfuerzos',
    nombre: 'Esfuerzos característicos',
    que: 'Vigas y pórticos isostáticos: reacciones, diagramas de N, Q y Mf, y el desarrollo paso a paso del módulo 10.',
    estado: 'lista',
    dibujo: (
      <svg viewBox="0 0 120 70" aria-hidden>
        <line x1="10" y1="22" x2="110" y2="22" className="ic-barra" />
        <path d="M10 22 Q60 82 110 22Z" className="ic-diag" />
        {[16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104].map((x) => (
          <line key={x} x1={x} y1="23" x2={x} y2={22 + 0.012 * (x - 10) * (110 - x)} className="ic-rayado" />
        ))}
        <polygon points="10,22 4,32 16,32" className="ic-apoyo" />
        <polygon points="110,22 104,32 116,32" className="ic-apoyo" />
      </svg>
    ),
  },
  {
    id: 'reticulados',
    nombre: 'Reticulados',
    que: 'Fuerza en cada barra por el método de los nodos y el de las secciones, como en el TP N°5. Tracción y compresión.',
    estado: 'lista',
    dibujo: (
      <svg viewBox="0 0 120 70" aria-hidden>
        <polyline points="10,55 35,15 60,55 85,15 110,55 10,55" className="ic-barra fina" />
        <line x1="35" y1="15" x2="85" y2="15" className="ic-barra fina" />
        {[[10, 55], [35, 15], [60, 55], [85, 15], [110, 55]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="3" className="ic-nodo" />
        ))}
      </svg>
    ),
  },
  {
    id: 'materiales',
    nombre: 'Tecnología de los materiales',
    que: 'Análisis de tensiones y verificación de secciones a partir de los esfuerzos calculados.',
    estado: 'futuro',
    dibujo: (
      <svg viewBox="0 0 120 70" aria-hidden>
        <rect x="40" y="10" width="40" height="50" className="ic-seccion" />
        <line x1="60" y1="10" x2="60" y2="60" className="ic-rayado" />
        <path d="M86 10 L110 10 L86 60Z" className="ic-diag" />
      </svg>
    ),
  },
];

const ETIQUETA = { lista: null, diseno: 'En diseño', futuro: 'Próximamente' } as const;

export function Inicio({ onOpen }: { onOpen: (s: Seccion) => void }) {
  return (
    <div className="inicio">
      <header className="inicio-cabecera">
        <h1>Calculadoras de Estática</h1>
        <p>Cátedra Estática 67.02, ITBA. Teoría, convenciones y nomenclatura de los módulos de la cátedra.</p>
        <button className="inicio-ayuda" onClick={() => onOpen('ayuda')}>Cómo usar las calculadoras</button>
      </header>
      <ul className="inicio-lista">
        {OPCIONES.map((o) => {
          const activa = o.estado === 'lista';
          return (
            <li key={o.id}>
              <button className="inicio-opcion" disabled={!activa} onClick={() => activa && onOpen(o.id)}>
                <span className="inicio-dibujo">{o.dibujo}</span>
                <span className="inicio-texto">
                  <span className="inicio-nombre">
                    {o.nombre}
                    {ETIQUETA[o.estado] && <span className="inicio-estado">{ETIQUETA[o.estado]}</span>}
                  </span>
                  <span className="inicio-que">{o.que}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

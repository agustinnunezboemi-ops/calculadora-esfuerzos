import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { Inicio, Seccion } from './Inicio.tsx';
import './styles.css';

/** Navegación por #hash: '' = menú de inicio, '#esfuerzos' = calculadora de esfuerzos. */
function Root() {
  const leer = () => (location.hash.replace('#', '') as Seccion) || null;
  const [seccion, setSeccion] = useState<Seccion | null>(leer);
  useEffect(() => {
    const on = () => setSeccion(leer());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const ir = (s: Seccion | null) => {
    location.hash = s ?? '';
    setSeccion(s);
    window.scrollTo(0, 0);
  };
  if (seccion === 'esfuerzos') return <App onHome={() => ir(null)} />;
  return <Inicio onOpen={ir} />;
}

createRoot(document.getElementById('root')!).render(<Root />);

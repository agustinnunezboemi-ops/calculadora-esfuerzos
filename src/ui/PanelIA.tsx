import React, { useEffect, useState } from 'react';
import { Gemini, MODELO_POR_DEFECTO, Propuesta, Tipo } from '../ai/gemini.ts';

const CLAVE = 'ia:gemini';

function leerConfig() {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (raw) return JSON.parse(raw) as { clave: string; modelo: string };
  } catch {
    /* sin almacenamiento */
  }
  return { clave: '', modelo: MODELO_POR_DEFECTO };
}

/** Reduce la foto (máx. 1600 px) para enviar menos datos. */
async function prepararImagen(f: File): Promise<{ mime: string; base64: string; url: string }> {
  const url = URL.createObjectURL(f);
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('No se pudo leer la imagen.'));
    img.src = url;
  });
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', 0.88);
  return { mime: 'image/jpeg', base64: data.split(',')[1], url };
}

export function PanelIA({ tipo, onPropuesta, onCerrar }: { tipo: Tipo; onPropuesta: (p: Propuesta) => void; onCerrar: () => void }) {
  const [cfg, setCfg] = useState(leerConfig);
  const [recordar, setRecordar] = useState(() => !!leerConfig().clave);
  const [texto, setTexto] = useState('');
  const [imagen, setImagen] = useState<{ mime: string; base64: string; url: string } | null>(null);
  const [estado, setEstado] = useState<{ tipo: 'idle' | 'trabajando' | 'error'; msg?: string }>({ tipo: 'idle' });

  useEffect(() => {
    try {
      if (recordar) localStorage.setItem(CLAVE, JSON.stringify(cfg));
      else localStorage.removeItem(CLAVE);
    } catch {
      /* ignorado */
    }
  }, [cfg, recordar]);

  useEffect(() => {
    // Pegar una captura con Ctrl+V.
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) prepararImagen(f).then(setImagen).catch((err) => setEstado({ tipo: 'error', msg: err.message }));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const interpretar = async () => {
    setEstado({ tipo: 'trabajando' });
    try {
      const p = await new Gemini(cfg).interpretar({ tipo, texto, imagen: imagen ?? undefined });
      setEstado({ tipo: 'idle' });
      onPropuesta(p);
    } catch (e) {
      setEstado({ tipo: 'error', msg: (e as Error).message });
    }
  };

  return (
    <section className="panel panel-ia" aria-label="Cargar desde foto o enunciado">
      <div className="ia-cabecera">
        <h2>Cargar desde foto o enunciado (IA)</h2>
        <button className="quitar" aria-label="Cerrar" onClick={onCerrar}>×</button>
      </div>
      <p className="ayuda">
        Gemini lee la figura o el texto y propone nodos, barras, vínculos y cargas. La propuesta se carga en el editor para que la revises: los
        cálculos los hace siempre la calculadora, no la IA.
      </p>
      <div className="ia-grid">
        <div className="ia-entrada">
          <label className="ia-archivo">
            Foto del ejercicio
            <input type="file" accept="image/*" capture="environment" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) prepararImagen(f).then(setImagen).catch((err) => setEstado({ tipo: 'error', msg: err.message }));
              e.target.value = '';
            }} />
          </label>
          <span className="ayuda">o pegá una captura con Ctrl+V</span>
          {imagen && (
            <div className="ia-preview">
              <img src={imagen.url} alt="Foto cargada del ejercicio" />
              <button onClick={() => setImagen(null)}>Quitar foto</button>
            </div>
          )}
          <label>
            Enunciado (opcional si hay foto)
            <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: Viga simplemente apoyada de 6 m con una carga uniforme de 3 kN/m…" />
          </label>
        </div>
        <div className="ia-config">
          <label>
            Clave de Gemini
            <input type="password" autoComplete="off" value={cfg.clave} onChange={(e) => setCfg({ ...cfg, clave: e.target.value.trim() })} placeholder="Pegá tu clave de AI Studio" />
          </label>
          <label className="interruptor"><input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} /> Recordar la clave en este navegador</label>
          <label>
            Modelo
            <input value={cfg.modelo} onChange={(e) => setCfg({ ...cfg, modelo: e.target.value.trim() })} />
          </label>
          <p className="ayuda">
            La clave es gratuita: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">aistudio.google.com</a> → «Get API key». Se envía solo a Google y
            queda guardada únicamente en tu navegador.
          </p>
        </div>
      </div>
      <div className="ia-acciones">
        <button className="primario" disabled={estado.tipo === 'trabajando' || !cfg.clave || (!texto.trim() && !imagen)} onClick={interpretar}>
          {estado.tipo === 'trabajando' ? 'Interpretando…' : 'Interpretar y cargar'}
        </button>
        {estado.tipo === 'error' && <span className="control mal" role="alert">{estado.msg}</span>}
      </div>
    </section>
  );
}

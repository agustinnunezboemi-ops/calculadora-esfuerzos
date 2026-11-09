import React from 'react';

/** Manual de uso breve, para alumnos y docentes. */
export function Ayuda({ onHome }: { onHome: () => void }) {
  return (
    <div className="ayuda-pagina">
      <button className="volver" onClick={onHome}>← Inicio</button>
      <h1>Cómo usar las calculadoras</h1>
      <p className="ayuda-lead">
        Las calculadoras resuelven estructuras planas isostáticas con la teoría, la convención de signos y la nomenclatura de la cátedra
        Estática 67.02 (ITBA). Todo funciona en el navegador, sin cuenta y sin conexión.
      </p>

      <h2>Cargar una estructura</h2>
      <ol>
        <li><b>Con el mouse:</b> elegí una herramienta arriba del dibujo (Nodo, Barra, apoyos, cargas) y hacé clic sobre la grilla. El paso de la grilla se escribe a la derecha. Esc termina una barra; «Ver» vuelve al modo de lectura.</li>
        <li><b>Con las tablas</b> (panel «Datos»): coordenadas exactas de los nodos, barras, vínculos y cargas. Lo que cambies en un lado se ve en el otro.</li>
        <li><b>Desde un archivo:</b> «Abrir .json». También hay ejemplos de los TP en «Cargar un ejemplo».</li>
      </ol>

      <h2>Convenciones</h2>
      <ul>
        <li>Sistema de referencia global: x hacia la derecha, y hacia arriba, giro antihorario positivo. Ángulos de cargas medidos desde x (−90° = hacia abajo).</li>
        <li>Esfuerzos (módulo 10): por izquierda N = −[ΣF], Q = +[ΣF], Mf = −[ΣM]; por derecha, signos opuestos. Valores positivos dibujados hacia arriba.</li>
        <li>Barras no horizontales: sistema de referencia particular (x′ a lo largo de la barra, y′ girado 90°). Verticales de abajo hacia arriba, inclinadas desde su extremo izquierdo; «Invertir» cambia el sentido.</li>
        <li>Reticulados: barras supuestas traccionadas; positivo = tracción (T), negativo = compresión (C). Rigidez b = 2v − 3.</li>
        <li>Cargas distribuidas por unidad de longitud real de la barra.</li>
      </ul>

      <h2>Leer los resultados</h2>
      <ul>
        <li>El recuadro de estado dice si la estructura es isostática; si no lo es, explica por qué y no resuelve.</li>
        <li>Pasá el mouse sobre una barra para ver N, Q y Mf en esa sección (marcada en amarillo).</li>
        <li>El paso a paso sigue el orden del apunte: isostaticidad, invariancia, DCL, RVE, verificación, DCE, secciones (por el lado con menos términos, verificando con el otro), nudos de pórtico, tabla de valores y controles.</li>
        <li>En reticulados, la herramienta «Cortar» elige 2 o 3 barras para el método de las secciones.</li>
      </ul>

      <h2>Guardar y compartir</h2>
      <ul>
        <li>Lo que cargás queda guardado en el navegador. «Guardar .json» guarda el problema con el nombre que elijas.</li>
        <li>«PNG» descarga cada dibujo como imagen; «Informe PDF» abre la impresión con el desarrollo completo (elegí «Guardar como PDF»).</li>
      </ul>

      <h2>Alcance</h2>
      <p>
        Vigas y pórticos isostáticos (incluidas dos o más chapas con articulaciones) y reticulados simples. No resuelve estructuras
        hiperestáticas, reticulados compuestos unidos por tres bielas ni apoyos continuos sobre el suelo. Los resultados se verifican con
        pruebas automáticas contra los ejemplos del módulo 10 y las respuestas de los TP N°4 y N°5.
      </p>
    </div>
  );
}

# Calculadora de Esfuerzos Característicos

Aplicación web para resolver estructuras planas isostáticas (vigas y pórticos) y trazar
sus diagramas de **esfuerzo normal (N), esfuerzo de corte (Q) y momento flector (Mf)**,
con el desarrollo paso a paso según el método de la cátedra **Estática 67.02 (ITBA)**.

La teoría, la convención de signos y la nomenclatura siguen exclusivamente los módulos
teóricos ITBA (Prof. Mg. Ing. Neoren Germán Franco), en particular:

- Módulo 09 — Cuerpos vinculados (grados de libertad, vínculos, invariancia cinemática).
- Módulo 10 — Diagramas de Esfuerzos Característicos (convención de signos, método de las secciones).

## Estado

**Etapa 2 — Prototipado.** El motor de cálculo está implementado y verificado:

| Módulo | Archivo | Qué hace |
| --- | --- | --- |
| Modelo | `src/engine/model.ts` | Nodos, barras, vínculos, articulaciones y cargas |
| Normalización | `src/engine/normalize.ts` | Detecta nodos, divide tramos, orienta cada barra (SRP) |
| Análisis | `src/engine/analysis.ts` | Clasificación, RVE, N-Q-Mf por izquierda y por derecha, máximos, equilibrio de nudos |
| Polinomios | `src/engine/poly.ts` | Expresiones por tramo en la variable local xᵢ |
| Paso a paso | `src/engine/steps.ts` | Desarrollo con la redacción del apunte (pasos 1 a 12) |
| Interfaz | `src/ui/` | Editor por tablas, ejemplos, dibujo de la estructura, diagramas N-Q-Mf rayados, paso a paso |

## Convención de signos (módulo 10)

| Esfuerzo | Por izquierda | Por derecha |
| --- | --- | --- |
| N | −[Σ proyecciones sobre la normal] | +[Σ …] |
| Q | +[Σ proyecciones sobre la sección] | −[Σ …] |
| Mf | −[Σ momentos respecto de G] | +[Σ …] |

En barras no horizontales se usa un **sistema de referencia particular (SRP)**: x′ a lo largo
de la barra en el sentido de recorrido, y′ girado 90° antihorario. Las verticales se recorren
de abajo hacia arriba y las inclinadas desde su extremo izquierdo.

## Uso

`npm run build` genera `dist/index.html`, un único archivo que funciona abierto
directamente en el navegador (sin servidor). Al subir a `main`, GitHub Actions
corre las pruebas y lo publica en GitHub Pages.

## Pruebas

```bash
npm install
npm test
```

Las pruebas reproducen los Ejemplos 1 y 2 del módulo 10, el ejercicio 1 (a–n) del TP N°4,
la clasificación cinemática (hipostático, hiperestático, vinculación aparente), pórticos con
SRP y una viga Gerber de dos chapas.

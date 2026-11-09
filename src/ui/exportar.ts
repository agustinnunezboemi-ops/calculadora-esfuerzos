/**
 * Exportación de dibujos a PNG y del informe a PDF (con el diálogo de impresión del navegador).
 */

const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'paint-order'];

/** Copia los estilos calculados a atributos, para que el SVG se vea igual fuera de la página. */
function inlineStyles(src: SVGElement, dst: SVGElement) {
  const cs = getComputedStyle(src);
  const style = PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
  dst.setAttribute('style', style);
  const a = src.children, b = dst.children;
  for (let i = 0; i < a.length; i++) inlineStyles(a[i] as SVGElement, b[i] as SVGElement);
}

export async function svgToPng(svg: SVGSVGElement, nombre: string, escala = 2) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  const vb = svg.viewBox.baseVal;
  clone.setAttribute('width', String(vb.width));
  clone.setAttribute('height', String(vb.height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const fondo = getComputedStyle(document.body).getPropertyValue('--papel-2') || '#ffffff';
  const data = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }));
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('No se pudo generar la imagen.'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = vb.width * escala;
  canvas.height = vb.height * escala;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = fondo.trim() || '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(escala, escala);
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = nombre.endsWith('.png') ? nombre : `${nombre}.png`;
  a.click();
}

/** Abre todos los pasos, imprime (el navegador ofrece «Guardar como PDF») y vuelve a cerrar. */
export function imprimirInforme(abrirTodo: (abrir: boolean) => void) {
  abrirTodo(true);
  const fin = () => {
    abrirTodo(false);
    window.removeEventListener('afterprint', fin);
  };
  window.addEventListener('afterprint', fin);
  // Espera un cuadro para que React abra los pasos antes de imprimir.
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

/**
 * Guarda un .json dejando elegir el nombre del archivo:
 * con el diálogo "Guardar como" del navegador si existe (Chrome, Edge),
 * o pidiendo el nombre y descargando el archivo en los demás.
 */
export async function guardarJson(data: unknown, nombre: string): Promise<string | null> {
  const texto = JSON.stringify(data, null, 2);
  const w = window as unknown as {
    showSaveFilePicker?: (o: unknown) => Promise<{ name: string; createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> }>;
  };
  if (w.showSaveFilePicker) {
    try {
      const h = await w.showSaveFilePicker({ suggestedName: nombre, types: [{ description: 'Archivo JSON', accept: { 'application/json': ['.json'] } }] });
      const s = await h.createWritable();
      await s.write(texto);
      await s.close();
      return h.name;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null; // canceló el diálogo
      // Si el navegador no lo permite (por ejemplo en un archivo abierto localmente), se usa la descarga.
    }
  }
  const pedido = window.prompt('Nombre del archivo:', nombre);
  if (pedido === null) return null;
  const final = (pedido.trim() || nombre).replace(/[\\/:*?"<>|]/g, '-');
  const archivo = final.toLowerCase().endsWith('.json') ? final : `${final}.json`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  a.download = archivo;
  a.click();
  URL.revokeObjectURL(a.href);
  return archivo;
}

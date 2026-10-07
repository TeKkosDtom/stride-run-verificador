import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Versión del código de la simulación.
 *
 * Son los archivos que deciden una carrera y su reparto, a partir de la semilla y las teclas:
 * pista, física, reloj, teclas, repetición, huella y premios. Si cambia una sola letra de alguno, cambia la versión.
 *
 * Receta: SHA-256 de, para cada archivo en este orden, la línea "// <nombre>" seguida del contenido del archivo
 * (con saltos de línea \n). En una terminal, dentro de la carpeta src:
 *
 *   for f in constantes.ts rng.ts pista.ts corredor.ts carrera.ts entradas.ts repeticion.ts huella.ts premios.ts; do printf '// %s\n' "$f"; cat "$f"; done | sha256sum
 */
export const ARCHIVOS_SIMULACION = [
  'constantes.ts', 'rng.ts', 'pista.ts', 'corredor.ts', 'carrera.ts', 'entradas.ts', 'repeticion.ts', 'huella.ts', 'premios.ts',
] as const;

const SRC = new URL('../src/', import.meta.url);

/** Calcula la versión del código con los archivos que hay en `src` (los que se están usando ahora). */
export function huellaCodigo(src: URL = SRC): string {
  const h = createHash('sha256');
  for (const nombre of ARCHIVOS_SIMULACION) {
    h.update(`// ${nombre}\n`);
    h.update(readFileSync(new URL(nombre, src), 'utf8').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex');
}

/** Este archivo es el que se corrió desde la terminal (comparando rutas reales: así funciona también con enlaces simbólicos). */
export function esPrincipal(url: string): boolean {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

/** `--escribir`: vuelve a escribir src/codigo.ts después de cambiar la simulación. */
function escribir(): void {
  const codigo = huellaCodigo();
  const texto = `/**
 * Versión del código de la simulación: SHA-256 de los archivos que deciden una carrera y su reparto
 * (la lista y la receta están en verificador/codigo.ts). Cada repetición la anota, y el verificador
 * comprueba que el código con el que revisa sea exactamente ese.
 *
 * No lo edites a mano: lo escribe \`tsx verificador/codigo.ts --escribir\` (en el juego, \`npm run huella-codigo\`).
 */
export const CODIGO_SIMULACION = '${codigo}';
`;
  writeFileSync(new URL('codigo.ts', SRC), texto);
  console.log('Versión del código de la simulación: ' + codigo);
}

if (esPrincipal(import.meta.url)) {
  if (process.argv.includes('--escribir')) escribir();
  else console.log(huellaCodigo());
}

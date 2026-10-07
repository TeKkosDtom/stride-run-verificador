import { readFileSync } from 'node:fs';
import { huellaRepeticion } from '../src/huella.js';
import { MICRO, TABLA_PREMIOS, repartir } from '../src/premios.js';
import { ReproductorRepeticion, problemaRepeticion, type DatosRepeticion } from '../src/repeticion.js';
import { esPrincipal, huellaCodigo } from './codigo.js';

/**
 * Verificador de carreras de Stride Run.
 *
 * Recibe el archivo que baja "Descargar" (en el Historial) o "Descargar datos" (al final de una repetición) y
 * comprueba, sin preguntarle nada al servidor:
 *   1. que el archivo se jugó con este mismo código de la simulación (si no, hay que usar esa versión);
 *   2. que la huella sale de esas mismas teclas, y que coincide con la que anotaste al terminar la carrera;
 *   3. que volver a simular la carrera da el mismo resultado oficial: puestos, distancias, premios y comisión,
 *      con la apuesta de esa mesa.
 *
 * Uso:  npm run verificar -- archivo.json [huella que anotaste]
 * Sale con 0 si todo coincide, 1 si algo no coincide, 2 si el archivo está dañado y 3 si la carrera
 * se jugó con otra versión del código (entonces hay que usar esa versión del verificador).
 */

export type Salida = 0 | 1 | 2 | 3;

export interface Informe {
  salida: Salida;
  lineas: string[];
}

/** Un corredor del archivo, en orden de asiento (el mismo orden que las teclas). Resultado oficial del servidor. */
interface CorredorArchivo {
  nombre: string;
  posicion: number;
  empatado: boolean;
  distanciaDm: number;
  apuesta: number;
  premio: number;
  desconectado: boolean;
}

interface Archivo {
  formato: string;
  partida: { id: string; fecha?: string; mesa: number; plazas?: number; pozo: number; comision: number };
  corredores: CorredorArchivo[];
  datos: DatosRepeticion;
  huella: string;
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const esEntero = (x: unknown, min = 0): x is number => Number.isSafeInteger(x) && (x as number) >= min;
const esHex64 = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
/** El archivo lo puede haber editado cualquiera: nada de caracteres de control en la terminal. */
const limpio = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '');
const metros = (dm: number) => Math.floor(dm / 10) + ',' + (dm % 10) + ' m';
/** Micro-unidades con 2 decimales, solo con enteros ("1,80"). */
const dinero = (micro: number) => {
  const centavos = Math.floor((Math.abs(micro) + 5_000) / 10_000);
  return (micro < 0 ? '-' : '') + Math.floor(centavos / 100) + ',' + String(centavos % 100).padStart(2, '0');
};
/** Las primeras 20 letras de la huella, de a 4, como las muestra el juego al terminar la carrera. */
export const huellaParaMostrar = (h: string) => h.slice(0, 20).replace(/(.{4})(?=.)/g, '$1 ');
const corta = (hex: string) => hex.slice(0, 12);

/** Lo mínimo para leer la versión del código. Es igual en todas las versiones. */
function problemaBasico(a: unknown): string | null {
  if (!esObjeto(a)) return 'no es un archivo de repetición';
  if (typeof a.formato !== 'string' || !a.formato.startsWith('stride-run/repeticion')) return 'no es un archivo de repetición de Stride Run';
  if (!esObjeto(a.datos) || !esHex64(a.datos.codigo)) return 'falta la versión del código (datos.codigo)';
  return null;
}

/** Revisa la forma completa del archivo (con la versión del código ya confirmada). Devuelve el motivo si está mal, o null. */
function problemaArchivo(a: Record<string, unknown>): string | null {
  const p = a.partida;
  if (!esObjeto(p) || typeof p.id !== 'string' || !p.id || !esEntero(p.mesa, 1) || !esEntero(p.pozo) || !esEntero(p.comision)) return 'faltan los datos de la partida';
  if (p.fecha !== undefined && typeof p.fecha !== 'string') return 'la fecha de la partida está mal';
  if (p.plazas !== undefined && !esEntero(p.plazas, 1)) return 'la cantidad de jugadores de la partida está mal';
  if (!esHex64(a.huella)) return 'falta la huella';
  const problema = problemaRepeticion(a.datos as unknown as DatosRepeticion);
  if (problema) return 'las teclas guardadas están mal (' + problema + ')';
  const n = (a.datos as unknown as DatosRepeticion).n;
  if (!TABLA_PREMIOS[n]) return 'una partida paga necesita de 2 a 4 jugadores';
  if (!Number.isSafeInteger((p.mesa as number) * MICRO * n)) return 'el monto de la mesa es demasiado grande';
  if (!Array.isArray(a.corredores) || a.corredores.length !== n) return 'la lista de corredores no coincide con las teclas';
  for (const c of a.corredores) {
    if (!esObjeto(c) || typeof c.nombre !== 'string' || !esEntero(c.posicion, 1) || typeof c.empatado !== 'boolean' ||
      !esEntero(c.distanciaDm) || !esEntero(c.apuesta) || !esEntero(c.premio) || typeof c.desconectado !== 'boolean') return 'el resultado de algún corredor está incompleto';
  }
  return null;
}

/**
 * Comprueba un archivo ya leído (JSON).
 * `codigoLocal`: versión del código con la que se revisa (la de esta carpeta).
 * `anotada`: la huella que el jugador anotó al terminar la carrera (opcional; alcanza con el principio).
 */
export function verificarArchivo(contenido: unknown, codigoLocal: string = huellaCodigo(), anotada?: string): Informe {
  const basico = problemaBasico(contenido);
  if (basico) return { salida: 2, lineas: ['✗ El archivo está incompleto o dañado: ' + basico + '.'] };
  const bruto = contenido as Record<string, unknown>;
  const codigo = (bruto.datos as { codigo: string }).codigo;

  // 1. Versión del código: con otro código, la huella y la carrera podrían calcularse distinto.
  if (codigo !== codigoLocal) {
    return {
      salida: 3,
      lineas: [
        `! Esta carrera se jugó con otra versión del código de la simulación (${corta(codigo)}); este verificador tiene la ${corta(codigoLocal)}.`,
        `  Descarga esa versión y vuelve a probar:  git checkout codigo-${corta(codigo)}`,
      ],
    };
  }
  const problema = problemaArchivo(bruto);
  if (problema) return { salida: 2, lineas: ['✗ El archivo está incompleto o dañado: ' + problema + '.'] };
  const a = contenido as Archivo;
  const d = a.datos;
  const lineas: string[] = [];
  let todoBien = true;
  const mal = (texto: string) => {
    todoBien = false;
    lineas.push('✗ ' + texto);
  };

  lineas.push(`Partida ${limpio(a.partida.id)}${a.partida.fecha ? ' · ' + limpio(a.partida.fecha) : ''} · Pista #${d.semilla} · ${d.n} jugadores · mesa de ${a.partida.mesa}`);
  lineas.push('');
  lineas.push(`✓ Código de la simulación: es la misma versión con la que se jugó (${corta(codigoLocal)}).`);

  // 2. Huella: sale de las teclas guardadas. Lo que la ata a la carrera real es la que viste al terminar.
  const huella = huellaRepeticion(a.partida.id, a.partida.mesa, d);
  if (huella !== a.huella) mal(`Huella: el archivo dice ${huellaParaMostrar(a.huella)}… pero con estas teclas da ${huellaParaMostrar(huella)}…. Alguien cambió los datos.`);
  else lineas.push(`✓ Huella: sale de estas teclas. Empieza con ${huellaParaMostrar(huella)}.`);
  const tuya = (anotada ?? '').toLowerCase().replace(/huella:?/g, '').replace(/[^0-9a-f]/g, '');
  if (!tuya) lineas.push('! Compárala con la que anotaste al terminar la carrera: es lo único que no depende de lo que guardó el servidor.');
  else if (tuya.length < 12) mal('La huella que anotaste es muy corta para comparar: hacen falta al menos 12 letras.');
  else if (huella.startsWith(tuya)) lineas.push('✓ Huella: coincide con la que anotaste al terminar la carrera.');
  else mal(`Huella: no coincide con la que anotaste (${huellaParaMostrar(tuya)}…). Esta no es la carrera que viste terminar.`);

  // 3. Volver a simular y repartir el pozo con las reglas públicas y la apuesta de la mesa.
  const carrera = new ReproductorRepeticion(d).hastaElFinal();
  const apuesta = a.partida.mesa * MICRO;
  lineas.push('');
  lineas.push('Volviendo a simular la carrera con las teclas guardadas:');
  if (!carrera.terminada) {
    const enPie = carrera.corredores.filter((r) => !r.dead).length;
    mal(`La carrera se cortó con ${enPie} corredores en pie. Según las reglas sigue hasta que queda uno solo.`);
  }
  if (a.partida.plazas !== undefined && a.partida.plazas !== d.n) mal(`La partida dice ${a.partida.plazas} jugadores, pero las teclas son de ${d.n}.`);
  if (a.corredores.some((c) => c.apuesta !== apuesta)) mal(`La apuesta del resultado oficial no es la de la mesa de ${a.partida.mesa} (${dinero(apuesta)} cada uno).`);
  const reparto = repartir(
    carrera.corredores.map((r, i) => ({ id: String(i), asiento: i, marca: carrera.marca(i), distanciaDm: r.deathDm })),
    apuesta,
  );
  const conBaja = new Set(d.bajas.map((b) => b[1]));
  a.corredores.forEach((oficial, i) => {
    const p = reparto.puestos.find((x) => x.asiento === i)!;
    const texto = (x: { posicion: number; empatado: boolean; distanciaDm: number; premio: number }) =>
      `${x.posicion}°${x.empatado ? ' (empate)' : ''}, ${metros(x.distanciaDm)}, premio ${dinero(x.premio)}`;
    const quien = `Asiento ${i + 1} (${limpio(oficial.nombre)})`;
    if (p.posicion === oficial.posicion && p.empatado === oficial.empatado && p.distanciaDm === oficial.distanciaDm && p.premio === oficial.premio) {
      lineas.push(`✓ ${quien}: ${texto(p)}. Igual que el resultado oficial.`);
    } else mal(`${quien}: da ${texto(p)}, pero el resultado oficial dice ${texto(oficial)}.`);
    if (conBaja.has(i) && !oficial.desconectado) mal(`${quien}: las teclas guardadas dicen que quedó afuera por desconectarse, pero el resultado oficial no lo dice.`);
  });
  if (reparto.pozo === a.partida.pozo && reparto.comision === a.partida.comision) {
    lineas.push(`✓ Pozo ${dinero(reparto.pozo)} (${d.n} × ${dinero(apuesta)}) y comisión de la plataforma ${dinero(reparto.comision)}. Igual que el resultado oficial.`);
  } else mal(`Pozo y comisión: dan ${dinero(reparto.pozo)} y ${dinero(reparto.comision)}, pero el resultado oficial dice ${dinero(a.partida.pozo)} y ${dinero(a.partida.comision)}.`);
  lineas.push('');
  lineas.push('Los nombres y quién se sentó en cada asiento los informa el servidor: no forman parte de la huella.');
  return { salida: todoBien ? 0 : 1, lineas };
}

const CONCLUSION: Record<Salida, string> = {
  0: 'RESULTADO: todo coincide. El resultado oficial sale de las teclas guardadas y de las reglas públicas.',
  1: 'RESULTADO: hay diferencias (las líneas con ✗). Guarda este archivo y avísanos.',
  2: 'RESULTADO: no se pudo revisar porque el archivo está dañado.',
  3: 'RESULTADO: falta revisar la carrera con la versión del código con la que se jugó.',
};

/** Lo que hace `npm run verificar -- archivo.json [huella]`. Devuelve el código de salida. */
export function principal(args: string[], escribir: (linea: string) => void = console.log): Salida {
  const [ruta, anotada] = args;
  if (!ruta) {
    escribir('Uso: npm run verificar -- archivo.json [huella que anotaste al terminar la carrera]');
    escribir('(el archivo lo baja "Descargar" en el Historial del juego, o "Descargar datos" al final de una repetición)');
    return 2;
  }
  let texto: string;
  try {
    texto = readFileSync(ruta, 'utf8');
  } catch (e) {
    const noEsta = (e as { code?: string }).code === 'ENOENT';
    escribir(noEsta
      ? '✗ No encontré el archivo ' + ruta + '. Usa la ruta completa (o arrastra el archivo a la terminal).'
      : '✗ No se pudo abrir el archivo ' + ruta + '.');
    return 2;
  }
  let informe: Informe;
  try {
    informe = verificarArchivo(JSON.parse(texto), huellaCodigo(), anotada);
  } catch {
    escribir('✗ No se pudo revisar ' + ruta + ': no es un archivo de repetición válido.');
    escribir(CONCLUSION[2]);
    return 2;
  }
  escribir('Verificador de carreras de Stride Run');
  escribir('');
  for (const l of informe.lineas) escribir(l);
  escribir('');
  escribir(CONCLUSION[informe.salida]);
  return informe.salida;
}

if (esPrincipal(import.meta.url)) process.exitCode = principal(process.argv.slice(2));

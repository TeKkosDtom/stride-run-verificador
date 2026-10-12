/**
 * Sorteo de la pista de las mesas (paso 2e; docs/DISENO.md, seccion 6).
 *
 * La semilla de la pista de cada mesa sale de un SHA-256 que junta el numero de la plataforma y el de cada jugador:
 *   - plataforma: 32 bytes al azar que elige el servidor al llenarse la mesa (64 letras hex);
 *   - aporte: 16 bytes al azar que elige el navegador de cada jugador (32 letras hex), o '' si no puso numero;
 *   - compromiso: el sobre cerrado de ese aporte, compromisoDe(aporte) (64 letras hex), o '' si no puso numero.
 *
 *   sello      = sha256("stride-run/sorteo/v1/sello|" + plataforma)
 *   compromiso = sha256("stride-run/sorteo/v1/compromiso|" + aporte)
 *   S          = sha256("stride-run/sorteo/v1/pista|" + plataforma + "|" + compromiso_1 + "|" + aporte_1 + ... + "|" + compromiso_n + "|" + aporte_n)
 *   semilla    = las primeras 8 letras de S, leidas en hexadecimal (de 0 a 4294967295; mulberry32 la usa tal cual)
 *   nombre     = esas mismas 8 letras en mayusculas ("Pista #6A97B80A"): el nombre es la semilla
 *
 * Siempre van n pares, en orden de asiento (el de los corredores). Cada campo mide 64, 32 o 0 letras, asi que el texto se
 * lee de una sola forma. Los numeros se juntan dentro de un hash, nunca con XOR: copiar el sobre de otro no anula el suyo.
 * Quien puso su sobre y no lo abrio a tiempo queda fuera antes de largar, como si se hubiera desconectado: una baja
 * [0, i] en la repeticion (lo mira revisarSorteo) y `desconectado` en el resultado.
 *
 * El SHA-256 esta escrito aca, en JavaScript y sincronico, para que el mismo codigo sortee en el servidor, compruebe en
 * el navegador (crypto.subtle es asincronico y no existe por http en la red local) y verifique en la terminal. Por eso
 * este archivo no importa nada. Y es todo ASCII, sin tildes: ninguna letra de otro alfabeto que se vea igual puede
 * esconderse en los textos que se sortean.
 */

/** El sorteo de una carrera de mesa, como queda en la repeticion (DatosRepeticion.sorteo). Todo en hex minusculas. */
export interface SorteoPista {
  /** El numero de la plataforma: 32 bytes, 64 letras. */
  plataforma: string;
  /** El sobre cerrado de cada asiento, en orden de asiento: 64 letras, o '' si ese asiento no puso numero. */
  compromisos: string[];
  /** El numero de cada asiento, en orden de asiento: 32 letras, o '' si no puso numero o no abrio su sobre a tiempo. */
  aportes: string[];
}

/** Las constantes de SHA-256 (FIPS 180-4, secciones 4.2.2 y 5.3.3). */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/** Rota 32 bits a la derecha. */
const rotar = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/**
 * SHA-256 de un texto ASCII (cada letra es un byte), en 64 letras hex minusculas. Da lo mismo que `sha256sum` en una
 * terminal y que node:crypto. Lanza con una letra de mas de 0x7f: los textos del sorteo son siempre ASCII.
 */
export function sha256Hex(texto: string): string {
  const largo = texto.length;
  // El mensaje en palabras de 32 bits (big-endian): el texto, un bit 1 (0x80), ceros y el largo en bits (64 bits).
  const bloques = ((largo + 8) >> 6) + 1;
  const m = new Array<number>(bloques * 16).fill(0);
  for (let i = 0; i < largo; i++) {
    const c = texto.charCodeAt(i);
    if (c > 0x7f) throw new RangeError('sha256Hex: solo texto ASCII');
    m[i >> 2] |= c << (24 - (i & 3) * 8);
  }
  m[largo >> 2] |= 0x80 << (24 - (largo & 3) * 8);
  m[bloques * 16 - 2] = Math.floor(largo / 0x20000000);
  m[bloques * 16 - 1] = (largo * 8) >>> 0;
  const h = H0.slice();
  const w = new Array<number>(64);
  for (let b = 0; b < bloques; b++) {
    for (let t = 0; t < 16; t++) w[t] = m[b * 16 + t];
    for (let t = 16; t < 64; t++) {
      const s0 = rotar(w[t - 15], 7) ^ rotar(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotar(w[t - 2], 17) ^ rotar(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [x0, x1, x2, x3, x4, x5, x6, x7] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (x7 + (rotar(x4, 6) ^ rotar(x4, 11) ^ rotar(x4, 25)) + ((x4 & x5) ^ (~x4 & x6)) + K[t] + w[t]) | 0;
      const t2 = ((rotar(x0, 2) ^ rotar(x0, 13) ^ rotar(x0, 22)) + ((x0 & x1) ^ (x0 & x2) ^ (x1 & x2))) | 0;
      x7 = x6;
      x6 = x5;
      x5 = x4;
      x4 = (x3 + t1) | 0;
      x3 = x2;
      x2 = x1;
      x1 = x0;
      x0 = (t1 + t2) | 0;
    }
    [x0, x1, x2, x3, x4, x5, x6, x7].forEach((x, k) => { h[k] = (h[k] + x) | 0; });
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

const esHex = (x: unknown, letras: number): x is string => typeof x === 'string' && x.length === letras && /^[0-9a-f]+$/.test(x);

/** El numero de la plataforma: 64 letras hex minusculas. */
export const esNumeroPlataforma = (x: unknown): x is string => esHex(x, 64);
/** Un sobre cerrado: 64 letras hex minusculas. En un sorteo, '' es el asiento que no puso numero. */
export const esCompromiso = (x: unknown): x is string => esHex(x, 64);
/** El numero de un jugador: 32 letras hex minusculas. En un sorteo, '' es el asiento que no lo puso o no lo abrio. */
export const esAporte = (x: unknown): x is string => esHex(x, 32);

/** El sello del numero de la plataforma: lo ven los jugadores antes de abrir sus sobres, para que no lo pueda cambiar. */
export const selloDe = (plataforma: string): string => sha256Hex('stride-run/sorteo/v1/sello|' + plataforma);

/** El sobre cerrado de un numero: lo manda el navegador al sentarse, sin mostrar el numero. */
export const compromisoDe = (aporte: string): string => sha256Hex('stride-run/sorteo/v1/compromiso|' + aporte);

/** S: el SHA-256 de todo el sorteo, en orden de asiento. De ahi salen la semilla y el nombre de la pista. */
export function resultadoSorteo(s: SorteoPista): string {
  let texto = 'stride-run/sorteo/v1/pista|' + s.plataforma;
  for (let i = 0; i < s.compromisos.length; i++) texto += '|' + s.compromisos[i] + '|' + s.aportes[i];
  return sha256Hex(texto);
}

/** La semilla de la pista: las primeras 8 letras de S, leidas en hexadecimal (de 0 a 4294967295). */
export const semillaDe = (resultado: string): number => parseInt(resultado.slice(0, 8), 16);

/** El nombre de una pista sorteada: la semilla en hexadecimal, 8 letras en mayusculas con ceros a la izquierda. */
export const nombreSorteado = (semilla: number): string => (semilla >>> 0).toString(16).toUpperCase().padStart(8, '0');

/**
 * Que tiene mal la forma de un sorteo (problemaSorteo). Son codigos: la frase la pone quien la muestra.
 * - forma: no es un objeto con compromisos y aportes en listas;
 * - asientos: no tiene un sobre y un numero por asiento;
 * - plataforma: el numero de la plataforma no son 64 letras hex minusculas;
 * - compromiso: algun sobre no son 64 letras hex minusculas (ni '');
 * - aporte: algun numero no son 32 letras hex minusculas (ni '').
 */
export type ProblemaSorteo = 'forma' | 'asientos' | 'plataforma' | 'compromiso' | 'aporte';

/** Revisa la forma de un sorteo de `n` asientos antes de usarlo. Devuelve el problema, o null si esta bien. */
export function problemaSorteo(s: unknown, n: number): ProblemaSorteo | null {
  if (typeof s !== 'object' || s === null || Array.isArray(s)) return 'forma';
  const x = s as Record<string, unknown>;
  if (!Array.isArray(x.compromisos) || !Array.isArray(x.aportes)) return 'forma';
  if (x.compromisos.length !== n || x.aportes.length !== n) return 'asientos';
  if (!esNumeroPlataforma(x.plataforma)) return 'plataforma';
  for (const c of x.compromisos) if (c !== '' && !esCompromiso(c)) return 'compromiso';
  for (const a of x.aportes) if (a !== '' && !esAporte(a)) return 'aporte';
  return null;
}

/**
 * Lo que dice revisarSorteo. Son codigos, nunca frases. Los asientos se cuentan desde 0 (el orden de los corredores).
 * - estado: el sorteo coincide con la carrera, o no;
 * - motivo (null si coincide): 'sobre' (el numero de `asiento` no da su sobre), 'semilla' (la semilla no sale de S) o
 *   'sin_baja' (`asiento` tenia sobre, no lo abrio y siguio corriendo: no tiene la baja [0, asiento]);
 * - asiento: el del motivo 'sobre' o 'sin_baja'; null en los demas casos;
 * - conNumero: cuantos asientos pusieron su numero (0: la pista salio solo del numero de la plataforma);
 * - sinAbrir: los asientos que tenian sobre y no lo abrieron, en orden.
 */
export interface RevisionSorteo {
  estado: 'coincide' | 'no_coincide';
  motivo: 'sobre' | 'semilla' | 'sin_baja' | null;
  asiento: number | null;
  conNumero: number;
  sinAbrir: number[];
}

/**
 * Revisa el contenido de un sorteo (validado antes con problemaSorteo) contra la carrera: que cada numero de su sobre,
 * que la semilla salga de S y que cada asiento que tenia sobre y no lo abrio haya quedado fuera antes de largar, con la
 * baja [0, i] (las bajas de DatosRepeticion). Mira en ese orden y se queda con el primer motivo.
 */
export function revisarSorteo(s: SorteoPista, semilla: number, bajas: readonly (readonly number[])[]): RevisionSorteo {
  const sinAbrir: number[] = [];
  let conNumero = 0;
  let sobreMal: number | null = null;
  for (let i = 0; i < s.aportes.length; i++) {
    if (s.aportes[i] === '') {
      if (s.compromisos[i] !== '') sinAbrir.push(i);
    } else {
      conNumero++;
      if (sobreMal === null && compromisoDe(s.aportes[i]) !== s.compromisos[i]) sobreMal = i;
    }
  }
  const revision = (motivo: RevisionSorteo['motivo'], asiento: number | null): RevisionSorteo =>
    ({ estado: motivo === null ? 'coincide' : 'no_coincide', motivo, asiento, conNumero, sinAbrir });
  if (sobreMal !== null) return revision('sobre', sobreMal);
  if (semillaDe(resultadoSorteo(s)) !== semilla) return revision('semilla', null);
  const corrio = sinAbrir.find((i) => !bajas.some((b) => b[0] === 0 && b[1] === i));
  return corrio === undefined ? revision(null, null) : revision('sin_baja', corrio);
}

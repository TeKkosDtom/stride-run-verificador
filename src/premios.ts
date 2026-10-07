/**
 * Reparto de premios con la regla de empates (docs/DISENO.md, secciones 2 y 4).
 * Todo en enteros: micro-unidades (1 ficha = 1.000.000 micro-fichas, igual que micro-USDT).
 * Nunca se usan números con decimales para el dinero.
 */

/** Micro-unidades por unidad (ficha o USDT). */
export const MICRO = 1_000_000;

/** Comisión fija de la plataforma, en %. Con empates no cambia. */
export const COMISION_PCT = 10;

/** Porcentaje del pozo para cada posición, según la cantidad de jugadores. */
export const TABLA_PREMIOS: Readonly<Record<number, readonly number[]>> = Object.freeze({
  2: Object.freeze([90, 0]),
  3: Object.freeze([62, 28, 0]),
  4: Object.freeze([50, 30, 10, 0]),
});

export interface Participante {
  id: string;
  /** Asiento en la sala (0 a 3). Solo sirve para desempatar el orden en que se listan y dónde van los restos de 1 micro. */
  asiento: number;
  /**
   * Marca para el ranking: entero, más alto = mejor puesto. Iguales = empate.
   * En Stride Run es el tick de eliminación (Last Man Standing: el que cae primero, pierde primero).
   */
  marca: number;
}

/** Un puesto del reparto. Conserva los datos extra del participante (por ejemplo, la distancia para mostrar). */
export type Puesto<P extends Participante = Participante> = P & DatosPuesto;

export interface DatosPuesto {
  /** 1 = primero. Los empatados comparten la mejor posición del grupo. */
  posicion: number;
  empatado: boolean;
  /** Porcentaje del pozo que le toca (puede tener decimales si hay empate, solo para mostrar). */
  porcentaje: number;
  /** Premio en micro-unidades (entero). */
  premio: number;
}

export interface Reparto<P extends Participante = Participante> {
  /** Pozo total en micro-unidades. */
  pozo: number;
  /** Lo que cobra la plataforma en micro-unidades. */
  comision: number;
  /** Ordenado de la mejor a la peor posición. */
  puestos: Puesto<P>[];
}

function esEnteroSeguro(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n);
}

/**
 * Reparte el pozo.
 * - Se ordena por marca (mayor primero). La marca es el momento de eliminación: Last Man Standing.
 * - Empate: se suman los porcentajes de las posiciones empatadas y se dividen en partes iguales.
 * - La comisión de la plataforma es siempre el 10%. Si una división no es exacta, el resto
 *   (como mucho unas pocas micro-unidades) va a los empatados, de a 1, por orden de asiento:
 *   así la plataforma nunca cobra de más y nadie pierde dinero por redondeo.
 */
export function repartir<P extends Participante>(participantes: readonly P[], apuestaMicro: number): Reparto<P> {
  const n = participantes.length;
  const tabla = TABLA_PREMIOS[n];
  if (!tabla) throw new Error('El reparto necesita de 2 a 4 jugadores; llegaron ' + n);
  if (!esEnteroSeguro(apuestaMicro) || apuestaMicro <= 0) throw new Error('La apuesta debe ser un entero positivo de micro-unidades');
  const ids = new Set<string>();
  for (const p of participantes) {
    if (!esEnteroSeguro(p.marca) || p.marca < 0) throw new Error('Marca inválida para ' + p.id);
    if (ids.has(p.id)) throw new Error('Jugador repetido: ' + p.id);
    ids.add(p.id);
  }
  const pozo = apuestaMicro * n;
  if (!esEnteroSeguro(pozo)) throw new Error('Pozo demasiado grande');

  const orden = participantes.slice().sort((a, b) => b.marca - a.marca || a.asiento - b.asiento);
  const puestos: Puesto<P>[] = [];
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && orden[j + 1].marca === orden[i].marca) j++;
    const k = j - i + 1;
    let sumaPct = 0;
    for (let p = i; p <= j; p++) sumaPct += tabla[p];
    const montoGrupo = Math.floor((pozo * sumaPct) / 100);
    const cada = Math.floor(montoGrupo / k);
    let resto = montoGrupo - cada * k;
    for (let p = i; p <= j; p++) {
      const extra = resto > 0 ? 1 : 0;
      resto -= extra;
      puestos.push({ ...orden[p], posicion: i + 1, empatado: k > 1, porcentaje: sumaPct / k, premio: cada + extra });
    }
    i = j + 1;
  }
  const pagado = puestos.reduce((s, p) => s + p.premio, 0);
  const comision = pozo - pagado;
  return { pozo, comision, puestos };
}

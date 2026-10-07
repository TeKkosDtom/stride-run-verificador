import { Carrera } from './carrera.js';
import type { EventoSim } from './corredor.js';
import { CODIGO_SIMULACION } from './codigo.js';
import { MAX_BITS, desempacarEntrada } from './entradas.js';

/**
 * Repeticiones: la carrera se puede volver a ver (o a revisar en una disputa) porque la simulación es determinista.
 * Alcanza con guardar la semilla, las teclas que el servidor aplicó en cada tick a cada corredor
 * y en qué momento quedó eliminado alguien por desconectarse. Volver a simular eso da exactamente la misma carrera.
 */

export const VERSION_REPETICION = 1;

/** Tope de ticks de una repetición (1 hora). Solo protege contra datos rotos; una carrera real dura minutos. */
export const MAX_TICKS_REPETICION = 60 * 60 * 60;

export interface DatosRepeticion {
  v: number;
  /**
   * Huella (SHA-256) del código de la simulación con el que se jugó (CODIGO_SIMULACION).
   * Con otro código la carrera podría salir distinta: para revisarla hay que usar esa versión.
   */
  codigo: string;
  semilla: number;
  /** Cantidad de corredores (en orden de asiento). */
  n: number;
  /** Ticks simulados en total. */
  ticks: number;
  /**
   * Teclas de cada corredor, solo cuando cambian: [tick, bits, tick, bits, …].
   * Desde ese tick (incluido) se aplican esos bits, hasta el próximo cambio. Siempre empieza en el tick 0.
   */
  entradas: number[][];
  /** Eliminados entre ticks (desconexión): [tick, corredor]. Se aplican justo ANTES de simular ese tick, en este orden. */
  bajas: [number, number][];
}

/**
 * Lo que entra en cada eslabón de la huella (cadena de hashes) del tick `t`:
 * primero las bajas de ese tick (0x80 + corredor) y después las teclas de cada corredor (si se simuló ese tick).
 * El último eslabón es el tick `ticks`, que solo lleva las bajas finales.
 */
export type AlEslabon = (t: number, bytes: number[]) => void;

/** Anota la carrera mientras el servidor la simula. */
export class GrabadorRepeticion {
  private readonly entradas: number[][];
  private readonly ultimos: number[];
  private readonly bajas: [number, number][] = [];
  /** Bajas desde el último eslabón (todas son del tick que viene). */
  private bajasTick: number[] = [];

  /** Versión del código de la simulación que se está usando (la que queda anotada). */
  readonly codigo = CODIGO_SIMULACION;

  /** `alEslabon`: para ir armando la huella tick a tick, sin calcularla toda de golpe al final. */
  constructor(private readonly semilla: number, private readonly n: number, private readonly alEslabon?: AlEslabon) {
    this.entradas = Array.from({ length: n }, () => []);
    this.ultimos = Array.from({ length: n }, () => -1);
  }

  /** Las teclas que se aplican en `tick` (una por corredor, en orden de asiento). Se llama justo antes de simularlo. */
  teclas(tick: number, bits: readonly number[]): void {
    const bytes = this.bajasTick;
    this.bajasTick = [];
    for (let i = 0; i < this.n; i++) {
      const b = bits[i] ?? 0;
      bytes.push(b);
      if (b === this.ultimos[i]) continue;
      this.ultimos[i] = b;
      this.entradas[i].push(tick, b);
    }
    this.alEslabon?.(tick, bytes);
  }

  /** El corredor `i` quedó eliminado antes de simular `tick` (Carrera.eliminarAhora). */
  baja(tick: number, i: number): void {
    this.bajas.push([tick, i]);
    this.bajasTick.push(0x80 | i);
  }

  /** Cierra la grabación después del último tick simulado (`ticks` = Carrera.tick). */
  cerrar(ticks: number): DatosRepeticion {
    this.alEslabon?.(ticks, this.bajasTick);
    this.bajasTick = [];
    return { v: VERSION_REPETICION, codigo: this.codigo, semilla: this.semilla, n: this.n, ticks, entradas: this.entradas.map((e) => e.slice()), bajas: this.bajas.map((b) => [b[0], b[1]]) };
  }
}

/** Recorre los eslabones de una repetición ya guardada, igual que los fue armando el GrabadorRepeticion. Valida antes con problemaRepeticion. */
export function eslabonesRepeticion(d: DatosRepeticion, alEslabon: AlEslabon): void {
  const cursor = new Array<number>(d.n).fill(0);
  const bits = new Array<number>(d.n).fill(0);
  let baja = 0;
  for (let t = 0; t <= d.ticks; t++) {
    const bytes: number[] = [];
    while (baja < d.bajas.length && d.bajas[baja][0] === t) bytes.push(0x80 | d.bajas[baja++][1]);
    if (t < d.ticks) {
      for (let i = 0; i < d.n; i++) {
        const lista = d.entradas[i];
        while (cursor[i] < lista.length && lista[cursor[i]] <= t) {
          bits[i] = lista[cursor[i] + 1];
          cursor[i] += 2;
        }
        bytes.push(bits[i]);
      }
    }
    alEslabon(t, bytes);
  }
}

const esEnteroEntre = (x: unknown, min: number, max: number): x is number => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;

/** Revisa que los datos tengan la forma correcta antes de simularlos. Devuelve el motivo si están mal, o null. */
export function problemaRepeticion(d: DatosRepeticion): string | null {
  if (!d || d.v !== VERSION_REPETICION) return 'versión desconocida';
  if (typeof d.codigo !== 'string' || !/^[0-9a-f]{64}$/.test(d.codigo)) return 'falta la versión del código';
  if (!esEnteroEntre(d.semilla, 0, 0xffffffff)) return 'semilla inválida';
  if (!esEnteroEntre(d.n, 1, 4)) return 'cantidad de corredores inválida';
  if (!esEnteroEntre(d.ticks, 0, MAX_TICKS_REPETICION)) return 'duración inválida';
  if (!Array.isArray(d.entradas) || d.entradas.length !== d.n) return 'faltan las teclas de algún corredor';
  for (const e of d.entradas) {
    if (!Array.isArray(e) || e.length % 2 !== 0) return 'teclas mal formadas';
    if (d.ticks > 0 && e[0] !== 0) return 'las teclas no empiezan en el tick 0';
    for (let k = 0; k < e.length; k += 2) {
      if (!esEnteroEntre(e[k], 0, d.ticks) || !esEnteroEntre(e[k + 1], 0, MAX_BITS)) return 'teclas mal formadas';
      if (k > 0 && e[k] <= e[k - 2]) return 'teclas fuera de orden';
    }
  }
  if (!Array.isArray(d.bajas)) return 'bajas mal formadas';
  let anterior = 0;
  for (const b of d.bajas) {
    if (!Array.isArray(b) || !esEnteroEntre(b[0], 0, d.ticks) || !esEnteroEntre(b[1], 0, d.n - 1)) return 'bajas mal formadas';
    if (b[0] < anterior) return 'bajas fuera de orden';
    anterior = b[0];
  }
  return null;
}

/** La repetición se jugó con este mismo código de la simulación (si no, volver a simularla aquí podría dar otra carrera). */
export const mismoCodigo = (d: DatosRepeticion): boolean => d.codigo === CODIGO_SIMULACION;

/** Recorre una repetición tick a tick sobre una Carrera nueva (para dibujarla o para revisarla de golpe). */
export class ReproductorRepeticion {
  readonly carrera: Carrera;
  /** Próximo cambio de teclas de cada corredor (índice en su lista). */
  private readonly cursor: number[];
  private readonly bits: number[];
  private baja = 0;

  constructor(readonly datos: DatosRepeticion) {
    const problema = problemaRepeticion(datos);
    if (problema) throw new Error('Repetición inválida: ' + problema);
    this.carrera = new Carrera(datos.semilla, datos.n);
    this.cursor = Array.from({ length: datos.n }, () => 0);
    this.bits = Array.from({ length: datos.n }, () => 0);
    this.aplicarBajas();
  }

  /** Ya se simularon todos los ticks grabados. */
  get terminada(): boolean {
    return this.carrera.tick >= this.datos.ticks;
  }

  /** Simula un tick con las teclas grabadas. Devuelve los eventos de cada corredor, o null si ya terminó. */
  paso(): EventoSim[][] | null {
    if (this.terminada) return null;
    const t = this.carrera.tick;
    const entradas = this.datos.entradas.map((lista, i) => {
      let k = this.cursor[i];
      while (k < lista.length && lista[k] <= t) {
        this.bits[i] = lista[k + 1];
        k += 2;
      }
      this.cursor[i] = k;
      return desempacarEntrada(this.bits[i]);
    });
    const ev = this.carrera.paso(entradas);
    this.aplicarBajas();
    return ev;
  }

  /** Simula hasta el final. */
  hastaElFinal(): Carrera {
    while (this.paso());
    return this.carrera;
  }

  private aplicarBajas(): void {
    const bajas = this.datos.bajas;
    while (this.baja < bajas.length && bajas[this.baja][0] <= this.carrera.tick) {
      const i = bajas[this.baja][1];
      if (!this.carrera.corredores[i].dead) this.carrera.eliminarAhora(i);
      this.baja++;
    }
  }
}

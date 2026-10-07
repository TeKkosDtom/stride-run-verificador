import { DT, MAX_TICKS_CARRERA, SALIDAS, baseEnTick } from './constantes.js';
import { ENTRADA_VACIA, corredorNuevo, eliminar, pasoCorredor, type Entrada, type EstadoCorredor, type EventoSim } from './corredor.js';
import { Pista } from './pista.js';

/** Cuántos metros por delante del primero se mantiene generada la pista. */
export const PISTA_ADELANTE = 170;

/**
 * Last Man Standing: el que queda último en pista gana. Cuando queda uno solo (con 2 o más corredores),
 * el resultado ya no puede cambiar y la carrera termina en ese tick (deathType 'fin').
 * Devuelve true si cerró la carrera. La otra forma de terminar es el máximo de tiempo (cerrarPorTiempo).
 */
export function cerrarSiEstaDecidida(corredores: EstadoCorredor[], tick: number): boolean {
  if (corredores.length < 2) return false;
  const vivos = corredores.filter((r) => !r.dead);
  if (vivos.length !== 1) return false;
  eliminar(vivos[0], 'fin', tick);
  return true;
}

/**
 * Máximo de tiempo (MAX_TICKS_CARRERA): todos los que siguen en pie terminan en `tick` (deathType 'fin'), así empatan
 * entre ellos con la regla de empates de siempre.
 */
export function cerrarPorTiempo(corredores: EstadoCorredor[], tick: number): void {
  for (const r of corredores) if (!r.dead) eliminar(r, 'fin', tick);
}

/**
 * La carrera terminó por el máximo de tiempo: los que seguían corriendo terminaron juntos (marca = MAX_TICKS_CARRERA + 1).
 * Con 2 o más corredores hacen falta al menos 2 así (es un empate); si quedó uno solo en ese mismo paso, ganó como
 * siempre. Jugando solo, alcanza con él. `marcas`: Carrera.marca de cada corredor (o la marca del resultado oficial).
 */
export function terminoPorTiempo(marcas: readonly number[]): boolean {
  const alMaximo = marcas.filter((m) => m === MAX_TICKS_CARRERA + 1).length;
  return marcas.length === 1 ? alMaximo === 1 : alMaximo >= 2;
}

export interface OpcionesCarrera {
  /** Terminar cuando queda uno solo (por defecto sí). El prototipo no lo hacía: corría hasta que caían todos. */
  finAnticipado?: boolean;
}

/**
 * Una carrera completa: pista + corredores + reloj en ticks.
 * El servidor la usa para decidir todo; la práctica local la usa con bots.
 */
export class Carrera {
  readonly pista: Pista;
  readonly corredores: EstadoCorredor[];
  tick = 0;
  private finAnticipado: boolean;

  constructor(semilla: number, cantidad: number, opciones: OpcionesCarrera = {}) {
    this.finAnticipado = opciones.finAnticipado ?? true;
    const xs = SALIDAS[cantidad];
    if (!xs) throw new Error('Cantidad de corredores inválida: ' + cantidad);
    this.pista = new Pista(semilla);
    this.corredores = xs.map((x) => corredorNuevo(x));
    this.pista.asegurar(200);
  }

  get tiempo(): number {
    return this.tick * DT;
  }

  /**
   * Elimina a un corredor entre dos ticks (por ejemplo, porque se desconectó).
   * Cuenta como caído en el último tick ya simulado: así, si queda uno solo, ese gana (no empata).
   */
  eliminarAhora(i: number, tipo: 'hit' | 'fall' = 'hit'): void {
    eliminar(this.corredores[i], tipo, this.tick - 1);
  }

  /**
   * Puntaje para el ranking (Last Man Standing): más alto = aguantó más. Empatan los que cayeron en el mismo tick.
   * Es el tick de eliminación + 1, para que siempre sea >= 0.
   */
  marca(i: number): number {
    const r = this.corredores[i];
    return (r.dead ? r.deathTick : this.tick) + 1;
  }

  get terminada(): boolean {
    return this.corredores.every((r) => r.dead);
  }

  /**
   * Avanza un tick con una entrada por corredor (en el mismo orden).
   * Devuelve los eventos de sonido/efecto de cada corredor.
   */
  paso(entradas: (Entrada | undefined)[]): EventoSim[][] {
    const base = baseEnTick(this.tick);
    const eventos = this.corredores.map((r, i) => {
      const ev: EventoSim[] = [];
      const vivo = !r.dead;
      pasoCorredor(r, entradas[i] ?? ENTRADA_VACIA, base, this.pista, ev);
      if (vivo && r.dead) r.deathTick = this.tick; // cayó o chocó en este tick
      return ev;
    });
    // El último en pie sobrevivió a este tick: se le cuenta el siguiente, así gana solo
    // (si se le contara este mismo tick, empataría con el que acaba de chocar).
    if (this.finAnticipado) cerrarSiEstaDecidida(this.corredores, this.tick + 1);
    // Máximo de tiempo, en todos los modos: al completar el paso número MAX_TICKS_CARRERA, los que siguen en pie
    // terminan juntos. Por la misma razón, se les cuenta el tick siguiente (= MAX_TICKS_CARRERA): empatan entre ellos y
    // quedan por delante de cualquiera que cayó antes, también del que chocó en este mismo paso.
    if (this.tick + 1 >= MAX_TICKS_CARRERA) cerrarPorTiempo(this.corredores, this.tick + 1);
    this.tick++;
    let lead = 0;
    let minD = Infinity;
    for (const r of this.corredores) {
      if (!r.dead) {
        lead = Math.max(lead, r.d);
        minD = Math.min(minD, r.d);
      }
    }
    if (lead > 0) this.pista.asegurar(lead + PISTA_ADELANTE);
    if (this.tick % 60 === 0 && minD < Infinity) this.pista.recortar(minD);
    return eventos;
  }
}


import { DT, SALIDAS, baseEnTick } from './constantes.js';
import { ENTRADA_VACIA, corredorNuevo, eliminar, pasoCorredor, type Entrada, type EstadoCorredor, type EventoSim } from './corredor.js';
import { Pista } from './pista.js';

/** Cuántos metros por delante del primero se mantiene generada la pista. */
export const PISTA_ADELANTE = 170;

/**
 * Last Man Standing: el que queda último en pista gana. Cuando queda uno solo (con 2 o más corredores),
 * el resultado ya no puede cambiar y la carrera termina en ese tick (deathType 'fin').
 * Devuelve true si cerró la carrera.
 */
export function cerrarSiEstaDecidida(corredores: EstadoCorredor[], tick: number): boolean {
  if (corredores.length < 2) return false;
  const vivos = corredores.filter((r) => !r.dead);
  if (vivos.length !== 1) return false;
  eliminar(vivos[0], 'fin', tick);
  return true;
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


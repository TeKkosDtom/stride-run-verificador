import type { Entrada } from './corredor.js';

/**
 * Las teclas de un tick, empacadas en un número (así viajan por la red y se guardan en las repeticiones).
 * Está aparte del protocolo porque es parte de la simulación pública (docs/DISENO.md, sección 6).
 */

/** Bits de las teclas de un tick. */
const B = { left: 1, right: 2, sprint: 4, brake: 8, jump: 16, slide: 32 } as const;
export const MAX_BITS = 63;

export function empacarEntrada(e: Entrada): number {
  return (e.left ? B.left : 0) | (e.right ? B.right : 0) | (e.sprint ? B.sprint : 0) | (e.brake ? B.brake : 0) | (e.jump ? B.jump : 0) | (e.slide ? B.slide : 0);
}

export function desempacarEntrada(b: number): Entrada {
  return { left: !!(b & B.left), right: !!(b & B.right), sprint: !!(b & B.sprint), brake: !!(b & B.brake), jump: !!(b & B.jump), slide: !!(b & B.slide) };
}

/** Teclas sostenidas de un tick, sin los toques de saltar/deslizar (para repetir si faltan entradas). */
export const soloSostenidas = (b: number): number => b & (B.left | B.right | B.sprint | B.brake);

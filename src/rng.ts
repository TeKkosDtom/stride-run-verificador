/** Generador pseudoaleatorio mulberry32, idéntico al del prototipo. Misma semilla, misma secuencia. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla nueva de 5 cifras, como en el prototipo. Solo el servidor (o la práctica local) la elige. */
export function semillaNueva(azar: () => number = Math.random): number {
  return Math.floor(10000 + azar() * 89999);
}

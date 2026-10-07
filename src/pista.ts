import { CH, HALF, HITBOX } from './constantes.js';
import { mulberry32 } from './rng.js';

/**
 * Pista generada por semilla (mulberry32), extraída del prototipo.
 * Aquí solo hay datos: el cliente arma los modelos 3D a partir de estas cajas.
 * El orden en que se consume el generador es el mismo del prototipo: misma semilla, misma pista.
 */

export type TipoObstaculo = 'hurdle' | 'bar' | 'gap' | 'hole' | 'blocks';
export type TipoPowerUp = 'shield' | 'energy' | 'jump' | 'star';

export interface Caja {
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
  color: number;
  /** false = decoración (piso, bordes, postes): no choca. */
  choca: boolean;
}

export interface PowerUp {
  /** Identificador único: el índice del tramo (hay como máximo uno por tramo). */
  id: number;
  d: number;
  x: number;
  tipo: TipoPowerUp;
}

/** Pistas para la IA de los bots de práctica. */
export interface EventoPista {
  id: number;
  kind: 'jump' | 'slide' | 'steer';
  at: number;
  end: number;
  x?: number;
  hole?: boolean;
}

export interface Tramo {
  i: number;
  start: number;
  cajas: Caja[];
  /** Solo las cajas que chocan. */
  obs: Caja[];
  holes: [number, number][];
  pups: PowerUp[];
  /** Obstáculos de este tramo, en orden (útil para tests y depuración). */
  tipos: TipoObstaculo[];
}

function pickType(r: () => number): TipoObstaculo {
  const v = r();
  if (v < 0.22) return 'hurdle';
  if (v < 0.42) return 'bar';
  if (v < 0.62) return 'gap';
  if (v < 0.8) return 'hole';
  return 'blocks';
}

export class Pista {
  readonly semilla: number;
  readonly tramos = new Map<number, Tramo>();
  readonly eventos: EventoPista[] = [];
  private rng: () => number;
  private genIdx = 0;
  private evId = 0;

  constructor(semilla: number) {
    this.semilla = semilla;
    this.rng = mulberry32(semilla);
  }

  /** Cantidad de tramos generados hasta ahora. */
  get generados(): number {
    return this.genIdx;
  }

  /** Genera tramos hasta cubrir la distancia `hasta` (m). Devuelve los tramos nuevos. */
  asegurar(hasta: number): Tramo[] {
    const nuevos: Tramo[] = [];
    while (this.genIdx * CH < hasta) {
      const c = this.generarTramo(this.genIdx);
      this.tramos.set(this.genIdx, c);
      nuevos.push(c);
      this.genIdx++;
    }
    return nuevos;
  }

  /** Borra los tramos que quedaron muy atrás. Devuelve los índices borrados. */
  recortar(minD: number): number[] {
    const borrados: number[] = [];
    for (const [k, c] of this.tramos) {
      if (c.start + CH < minD - 35) {
        this.tramos.delete(k);
        borrados.push(k);
      }
    }
    return borrados;
  }

  enHueco(d: number): boolean {
    const c = this.tramos.get(Math.floor(d / CH));
    if (!c) return false;
    for (const h of c.holes) if (d >= h[0] && d <= h[1]) return true;
    return false;
  }

  /** Choque de la hitbox del cuerpo (0,52 × alto × 0,44) contra los obstáculos. */
  choca(d: number, x: number, y: number, deslizando: boolean): boolean {
    const h = deslizando ? HITBOX.altoDeslizando : HITBOX.alto;
    const hz = HITBOX.profundidad / 2;
    const hx = HITBOX.ancho / 2;
    const ci = Math.floor(d / CH);
    for (const idx of [ci - 1, ci]) {
      const c = this.tramos.get(idx);
      if (!c) continue;
      for (const o of c.obs) {
        if (d + hz > o.z0 && d - hz < o.z1 && x + hx > o.x0 && x - hx < o.x1 && y + h > o.y0 && y < o.y1) return true;
      }
    }
    return false;
  }

  /** Power-ups cercanos a una distancia (tramo actual y anterior). */
  powerUpsCerca(d: number): PowerUp[] {
    const ci = Math.floor(d / CH);
    const out: PowerUp[] = [];
    for (const idx of [ci - 1, ci]) {
      const c = this.tramos.get(idx);
      if (c) out.push(...c.pups);
    }
    return out;
  }

  private generarTramo(i: number): Tramo {
    const r = this.rng;
    const start = i * CH;
    const c: Tramo = { i, start, cajas: [], obs: [], holes: [], pups: [], tipos: [] };
    const caja = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number, choca = true) => {
      const b: Caja = { x0, x1, y0, y1, z0, z1, color, choca };
      c.cajas.push(b);
      if (choca) c.obs.push(b);
    };
    const place = (t: TipoObstaculo, p: number) => {
      c.tipos.push(t);
      if (t === 'hurdle') {
        caja(-HALF, HALF, 0, 0.7, p, p + 0.5, 0xff8c42);
        this.eventos.push({ id: this.evId++, kind: 'jump', at: p, end: p + 0.5 });
      } else if (t === 'bar') {
        caja(-HALF, HALF, 1.05, 1.5, p, p + 0.4, 0xff5a8a);
        caja(-HALF - 0.35, -HALF - 0.05, 0, 1.5, p, p + 0.4, 0xffffff, false);
        caja(HALF + 0.05, HALF + 0.35, 0, 1.5, p, p + 0.4, 0xffffff, false);
        this.eventos.push({ id: this.evId++, kind: 'slide', at: p, end: p + 0.4 });
      } else if (t === 'gap') {
        const gx = (r() * 2 - 1) * 2.2;
        const gw = 2.3;
        if (gx - gw / 2 > -HALF + 0.01) caja(-HALF, gx - gw / 2, 0, 2.6, p, p + 0.6, 0x8e7dff);
        if (gx + gw / 2 < HALF - 0.01) caja(gx + gw / 2, HALF, 0, 2.6, p, p + 0.6, 0x8e7dff);
        this.eventos.push({ id: this.evId++, kind: 'steer', at: p, end: p + 0.6, x: gx });
      } else if (t === 'hole') {
        c.holes.push([p, p + 3.4]);
        this.eventos.push({ id: this.evId++, kind: 'jump', hole: true, at: p, end: p + 3.4 });
      } else {
        const free = Math.floor(r() * 3);
        const cols = [-2.4, 0, 2.4];
        cols.forEach((x, k) => {
          if (k !== free) caja(x - 1, x + 1, 0, 2.2, p, p + 1.2, 0x2ec4b6);
        });
        this.eventos.push({ id: this.evId++, kind: 'steer', at: p, end: p + 1.2, x: free === 1 ? 0 : free === 0 ? -2.25 : 2.25 });
      }
    };

    const diff = Math.min(1, i / 25);
    const roll = r();
    const slots = i < 2 ? [] : i < 6 || roll > diff * 0.75 ? [12] : [5, 17];
    let lastSteer = false;
    for (const off of slots) {
      let t = pickType(r);
      const steer = t === 'gap' || t === 'blocks';
      if (lastSteer && steer) t = 'hurdle';
      place(t, start + off);
      lastSteer = t === 'gap' || t === 'blocks';
    }
    const pr = r();
    const px = (r() * 2 - 1) * 2.6;
    const pt = r();
    if (i >= 3 && pr < 0.38) {
      const d = start + (slots.length === 1 ? (pr < 0.19 ? 4 : 20) : 11);
      const tipo: TipoPowerUp = pt < 0.3 ? 'shield' : pt < 0.6 ? 'energy' : pt < 0.8 ? 'jump' : 'star';
      c.pups.push({ id: i, d, x: px, tipo });
    }

    // Piso por segmentos (los huecos quedan sin piso), bordes y marca roja antes de cada hueco. Todo decorativo.
    const holes = c.holes.slice().sort((a, b) => a[0] - b[0]);
    let z = start;
    const segs: [number, number][] = [];
    holes.forEach((h) => {
      if (h[0] > z) segs.push([z, h[0]]);
      z = h[1];
    });
    if (z < start + CH) segs.push([z, start + CH]);
    const col = i % 2 ? 0xf3eeff : 0xe6e0ff;
    segs.forEach((s) => {
      caja(-HALF, HALF, -1, 0, s[0], s[1], col, false);
      caja(-HALF - 0.3, -HALF, 0, 0.25, s[0], s[1], 0xffc93c, false);
      caja(HALF, HALF + 0.3, 0, 0.25, s[0], s[1], 0xffc93c, false);
    });
    holes.forEach((h) => caja(-HALF, HALF, -0.02, 0.02, h[0] - 0.35, h[0], 0xff5a5f, false));
    return c;
  }
}

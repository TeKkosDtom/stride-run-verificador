import {
  BRAKE, BUFFER_TECLA, CH, DT, ENERGIA_GASTO, ENERGIA_RECARGA, G, JV, LAT, LIM, SHIELD_T, SLIDE, SPRINT, STAR_T, SUPERSALTO, clamp,
} from './constantes.js';
import type { Pista, TipoPowerUp } from './pista.js';

/**
 * Física de un corredor, extraída del prototipo (stepRunner).
 * Todo el estado es un objeto plano de números y booleanos, para poder copiarlo,
 * enviarlo por la red y volver a simular desde él (predicción del cliente).
 */

/** 'hit' chocó, 'fall' cayó, 'fin' terminó la carrera sin chocar (quedó solo y ya iba primero). */
export type TipoMuerte = 'hit' | 'fall' | 'fin';

export interface EstadoCorredor {
  x: number; y: number; vy: number; d: number; v: number;
  stam: number;
  grounded: boolean;
  slideT: number;
  slideQ: boolean;
  jumpBuf: number;
  slideBuf: number;
  dead: boolean;
  deathType: TipoMuerte | null;
  /** Distancia de eliminación en decímetros (entero). Se muestra; el ranking es por tiempo (deathTick). */
  deathDm: number;
  /** Tick en que quedó eliminado (o terminó). Last Man Standing: el que cae antes queda último. */
  deathTick: number;
  deadT: number;
  shield: boolean;
  shieldT: number;
  starT: number;
  popT: number;
  inv: number;
  sj: boolean;
  usingSprint: boolean;
  usingBrake: boolean;
  /** Power-ups ya agarrados (id = índice de tramo). Solo se guardan los recientes. */
  got: number[];
}

/** Lo único que manda el jugador: qué teclas tiene apretadas en un tick. */
export interface Entrada {
  left: boolean;
  right: boolean;
  sprint: boolean;
  brake: boolean;
  /** Se apretó saltar en este tick. */
  jump: boolean;
  /** Se apretó deslizar en este tick. */
  slide: boolean;
  /** Solo bots de práctica: posición lateral objetivo (y salto/deslizar directos, sin memoria de tecla). */
  steerTo?: number;
}

export const ENTRADA_VACIA: Readonly<Entrada> = Object.freeze({ left: false, right: false, sprint: false, brake: false, jump: false, slide: false });

export type EventoSim =
  | 'jump' | 'superjump' | 'slide' | 'turbo' | 'brake'
  | 'pu_shield' | 'pu_energy' | 'pu_jump' | 'pu_star'
  | 'shieldpop' | 'shieldoff' | 'crash' | 'fall';

export function corredorNuevo(x: number): EstadoCorredor {
  return {
    x, y: 0, vy: 0, d: 0, v: 9, stam: 1, grounded: true, slideT: 0, slideQ: false, jumpBuf: 0, slideBuf: 0,
    dead: false, deathType: null, deathDm: 0, deathTick: 0, deadT: 0,
    shield: false, shieldT: 0, starT: 0, popT: 0, inv: 0, sj: false, usingSprint: false, usingBrake: false, got: [],
  };
}

export function copiarCorredor(r: EstadoCorredor): EstadoCorredor {
  return { ...r, got: r.got.slice() };
}

/**
 * Elimina al corredor. La distancia se redondea a 0,1 m (se guarda en decímetros enteros).
 * `tick` es el momento de la eliminación; si no se sabe (dentro de pasoCorredor), lo completa la Carrera.
 */
export function eliminar(r: EstadoCorredor, tipo: TipoMuerte, tick?: number): void {
  if (r.dead) return;
  r.dead = true;
  r.deathType = tipo;
  r.deathDm = Math.round(r.d * 10);
  if (tick !== undefined) r.deathTick = tick;
  r.deadT = 0;
  r.shield = false;
  r.starT = 0;
  r.popT = 0;
}

/** Fuera de carrera por un choque o una caída (no por haber terminado). */
export const eliminado = (r: EstadoCorredor): boolean => r.dead && r.deathType !== 'fin';

/** Distancia a mostrar o rankear: la de eliminación si está muerto. */
export const distanciaDe = (r: EstadoCorredor): number => (r.dead ? r.deathDm / 10 : r.d);

/** Avanza un corredor un tick (1/60 s). `base` es la velocidad base del tick. */
export function pasoCorredor(r: EstadoCorredor, ent: Entrada, base: number, pista: Pista, ev?: EventoSim[]): void {
  if (r.dead) {
    r.deadT += DT;
    if (r.deathType === 'fall') {
      r.d += r.v * DT * 0.5;
      r.vy -= G * DT;
      r.y += r.vy * DT;
    }
    return;
  }
  let jump: boolean;
  let slide: boolean;
  let sprint: boolean;
  let brake: boolean;
  if (ent.steerTo === undefined) {
    if (ent.jump) r.jumpBuf = BUFFER_TECLA;
    if (ent.slide) r.slideBuf = BUFFER_TECLA;
    const dir = (ent.right ? 1 : 0) - (ent.left ? 1 : 0);
    r.x += dir * LAT * DT;
    jump = r.jumpBuf > 0 && r.grounded;
    if (jump) r.jumpBuf = 0;
    slide = r.slideBuf > 0;
    if (slide) r.slideBuf = 0;
    r.jumpBuf = Math.max(0, r.jumpBuf - DT);
    r.slideBuf = Math.max(0, r.slideBuf - DT);
    sprint = ent.sprint;
    brake = ent.brake && !ent.sprint;
  } else {
    jump = ent.jump && r.grounded;
    slide = ent.slide;
    sprint = ent.sprint;
    brake = ent.brake;
    const dx = ent.steerTo - r.x;
    r.x += Math.sign(dx) * Math.min(Math.abs(dx), LAT * DT);
  }
  // Turbo y freno comparten la barra de energía.
  const useSprint = sprint && r.stam > 0;
  const useBrake = !useSprint && brake && r.stam > 0;
  const mult = useSprint ? SPRINT : useBrake ? BRAKE : 1;
  if (ev) {
    if (useSprint && !r.usingSprint) ev.push('turbo');
    if (useBrake && !r.usingBrake) ev.push('brake');
  }
  r.usingSprint = useSprint;
  r.usingBrake = useBrake;
  r.v += (base * mult - r.v) * Math.min(1, DT * 4);
  r.stam = clamp(r.stam + (useSprint || useBrake ? -ENERGIA_GASTO : ENERGIA_RECARGA) * DT, 0, 1);
  r.x = clamp(r.x, -LIM, LIM);
  if (jump) {
    const sj = r.sj;
    r.vy = JV * (sj ? SUPERSALTO : 1);
    r.sj = false;
    r.grounded = false;
    r.slideT = 0;
    ev?.push(sj ? 'superjump' : 'jump');
  }
  if (slide) {
    ev?.push('slide');
    if (r.grounded) r.slideT = SLIDE;
    else {
      r.vy = Math.min(r.vy, -11);
      r.slideQ = true;
    }
  }
  if (r.slideT > 0) r.slideT -= DT;
  if (r.inv > 0) r.inv -= DT;
  if (r.starT > 0) r.starT -= DT;
  if (r.popT > 0) r.popT -= DT;
  if (r.shield) {
    r.shieldT -= DT;
    if (r.shieldT <= 0) {
      r.shield = false;
      ev?.push('shieldoff');
    }
  }
  r.vy -= G * DT;
  r.y += r.vy * DT;
  r.d += r.v * DT;
  const hole = pista.enHueco(r.d);
  if (!hole && r.y <= 0) {
    if (r.y > -0.3) {
      r.y = 0;
      r.vy = 0;
      if (!r.grounded && r.slideQ) r.slideT = SLIDE;
      r.slideQ = false;
      r.grounded = true;
    } else {
      eliminar(r, 'fall');
      ev?.push('fall');
      return;
    }
  } else {
    r.grounded = false;
    if (hole && r.y < -0.35) {
      eliminar(r, 'fall');
      ev?.push('fall');
      return;
    }
  }
  agarrarPowerUps(r, pista, ev);
  if (r.starT <= 0 && r.inv <= 0 && pista.choca(r.d, r.x, r.y, r.slideT > 0)) {
    if (r.shield) {
      r.shield = false;
      r.inv = 0.7;
      r.popT = 0.35;
      ev?.push('shieldpop');
    } else {
      eliminar(r, 'hit');
      ev?.push('crash');
      return;
    }
  }
}

function agarrarPowerUps(r: EstadoCorredor, pista: Pista, ev?: EventoSim[]): void {
  // Cada jugador tiene su propia copia de cada power-up: solo importa si ESTE corredor ya lo agarró.
  for (const p of pista.powerUpsCerca(r.d)) {
    if (r.got.includes(p.id)) continue;
    if (Math.abs(r.d - p.d) < 0.6 && Math.abs(r.x - p.x) < 0.7 && r.y < 1.6) {
      r.got.push(p.id);
      aplicarPowerUp(r, p.tipo);
      ev?.push(('pu_' + p.tipo) as EventoSim);
    }
  }
  // Solo se recuerdan los power-ups de tramos que todavía pueden tocarse.
  const minimo = Math.floor(r.d / CH) - 1;
  if (r.got.length && r.got[0] < minimo) r.got = r.got.filter((id) => id >= minimo);
}

function aplicarPowerUp(r: EstadoCorredor, tipo: TipoPowerUp): void {
  if (tipo === 'shield') {
    r.shield = true;
    r.shieldT = SHIELD_T;
  } else if (tipo === 'energy') r.stam = 1;
  else if (tipo === 'jump') r.sj = true;
  else r.starT = STAR_T;
}

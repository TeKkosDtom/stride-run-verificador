/**
 * Constantes de la simulación. Son las mismas del prototipo (prototipo/stride-run.html)
 * y de docs/DISENO.md, sección 2. No las cambies sin actualizar el documento.
 */

/** Paso fijo de simulación: 1/60 s. */
export const DT = 1 / 60;
/** Ticks de simulación por segundo. */
export const TICKS_POR_SEGUNDO = 60;
/** Largo de cada tramo de pista (m). */
export const CH = 24;
/** Medio ancho de la pista (m). La pista mide 7 m. */
export const HALF = 3.5;
/** Límite lateral del corredor (m). */
export const LIM = 3.15;
/** Gravedad (m/s²). */
export const G = 26;
/** Velocidad vertical del salto (m/s). */
export const JV = 8.6;
/** Multiplicador del supersalto. */
export const SUPERSALTO = 1.35;
/** Velocidad lateral (m/s). */
export const LAT = 7.5;
/** Duración del deslizamiento (s). */
export const SLIDE = 0.65;
/** Multiplicador del turbo sobre la velocidad base. */
export const SPRINT = 1.3;
/** Multiplicador del freno sobre la velocidad base. */
export const BRAKE = 0.7;
/** Gasto de energía por segundo usando turbo o freno. */
export const ENERGIA_GASTO = 0.4;
/** Recarga de energía por segundo sin usar turbo ni freno. */
export const ENERGIA_RECARGA = 0.18;
/** Duración del escudo si no se usa (s). */
export const SHIELD_T = 8;
/** Duración de la invencibilidad (s). */
export const STAR_T = 3;
/** Ventana de memoria de las teclas de salto y deslizar (s). */
export const BUFFER_TECLA = 0.12;

/** Hitbox del stickman: solo el cuerpo. Los cosméticos no tienen hitbox. */
export const HITBOX = { ancho: 0.52, alto: 1.75, altoDeslizando: 0.8, profundidad: 0.44 } as const;

/** Velocidad base según el tiempo de carrera: 9 m/s + 0,17 m/s por segundo, máximo 22 m/s. */
export const baseAt = (t: number): number => Math.min(22, 9 + 0.17 * t);

/** Velocidad base en un tick concreto. Se usa tick*DT (no una suma acumulada) para que cliente y servidor den lo mismo. */
export const baseEnTick = (tick: number): number => baseAt(tick * DT);

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Posiciones de salida según la cantidad de corredores. */
export const SALIDAS: Record<number, number[]> = {
  1: [0],
  2: [-1, 1],
  3: [-2, 0, 2],
  4: [-2.4, -0.8, 0.8, 2.4],
};

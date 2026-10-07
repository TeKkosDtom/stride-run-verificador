import { createHash } from 'node:crypto';
import { eslabonesRepeticion, type DatosRepeticion } from './repeticion.js';

/**
 * Huella de una repetición: una cadena de hashes, un eslabón por tick (docs/DISENO.md, sección 6).
 * La cabeza nombra la partida, la pista y la versión del código de la simulación; cada eslabón es el SHA-256
 * del anterior más el número de tick y las teclas de ese tick (y las bajas por desconexión).
 * Los jugadores la ven al terminar la carrera: si después alguien cambiara una sola tecla de la
 * repetición guardada, la huella ya no coincidiría.
 * El servidor la arma tick a tick durante la carrera (unos microsegundos por tick), así no se frena al final.
 *
 * Solo para Node (servidor y verificador): el navegador no la importa.
 */
export class CadenaHuella {
  private h: Buffer;
  private readonly cabeza = Buffer.alloc(4);

  constructor(sala: string, mesa: number, d: Pick<DatosRepeticion, 'v' | 'semilla' | 'n' | 'codigo'>) {
    this.h = createHash('sha256').update(`stride-run/repeticion/v${d.v}|${sala}|${mesa}|${d.semilla}|${d.n}|${d.codigo}`).digest();
  }

  eslabon(t: number, bytes: readonly number[]): void {
    this.cabeza.writeUInt32BE(t);
    this.h = createHash('sha256').update(this.h).update(this.cabeza).update(Uint8Array.from(bytes)).digest();
  }

  get hex(): string {
    return this.h.toString('hex');
  }
}

/** Vuelve a calcular la huella de una repetición guardada (validada antes con problemaRepeticion). */
export function huellaRepeticion(sala: string, mesa: number, d: DatosRepeticion): string {
  const cadena = new CadenaHuella(sala, mesa, d);
  eslabonesRepeticion(d, (t, bytes) => cadena.eslabon(t, bytes));
  return cadena.hex;
}

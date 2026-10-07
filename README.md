# Stride Run · Verificador de carreras

Este repositorio tiene **el código que decide cada carrera de Stride Run** y un programa para **comprobar una carrera por tu cuenta**, sin confiar en el servidor del juego.

Stride Run es un juego de carreras en el navegador donde los jugadores apuestan entre ellos. El servidor del juego decide todo (posiciones, eliminaciones, puestos y premios), pero la carrera es **determinista**: con la misma pista y las mismas teclas sale siempre exactamente igual. Por eso cualquiera puede volver a simularla y comprobar el resultado.

Acá está solo lo necesario para eso: la pista, la física, las teclas, la repetición, la huella y el reparto de premios. El resto del juego (servidor, cuentas, billeteras y saldos) no se publica.

## Cómo comprobar una carrera

1. **Al terminar la carrera, anota la huella** que muestra el juego (por ejemplo `Huella: 3f9a 2c1b 0e7d 81a2 99c4`) o haz una captura de pantalla. Es lo único que no depende de lo que el servidor guarde después.
2. En el juego, abre **Historial → Partidas** y toca **Descargar** en esa partida (o **Descargar datos** al terminar de ver la repetición). Se baja un archivo `stride-run-repeticion-pista-….json`.
3. Instala [Node.js](https://nodejs.org) 20 o más nuevo y [git](https://git-scm.com).
4. En una terminal, escribe estos comandos de a uno (en Windows sirven PowerShell o cmd):

   ```
   git clone https://github.com/TeKkosDtom/stride-run-verificador
   cd stride-run-verificador
   git checkout codigo-XXXXXXXXXXXX
   npm ci
   npm run verificar -- "ruta completa del archivo.json" 3f9a2c1b0e7d81a299c4
   ```

   - `codigo-XXXXXXXXXXXX` es la versión del código con la que se jugó esa carrera: las primeras 12 letras del campo `datos.codigo` del archivo. El archivo trae los comandos exactos en `explicacion.comoVerificar`.
   - Para la ruta del archivo, también puedes arrastrarlo a la terminal.
   - Al final va la huella que anotaste en el paso 1 (con o sin espacios). Si no la pones, el verificador te recuerda compararla a ojo.

El verificador muestra cada comprobación con ✓ o ✗ y termina con un resumen. También devuelve un código de salida: **0** todo coincide, **1** algo no coincide, **2** el archivo está dañado, **3** la carrera se jugó con otra versión del código (usa la etiqueta que te indica).

"Todo coincide" quiere decir que el resultado oficial del archivo sale de sus teclas y de las reglas públicas. Lo que ata ese archivo a la carrera que de verdad jugaste es la huella del paso 1: si no la comparas, solo sabes que el archivo es coherente consigo mismo.

## Qué comprueba

1. **La versión del código.** Cada carrera anota con qué versión del código de la simulación se jugó. El verificador comprueba que el código de esta carpeta sea exactamente ese. Si no, te dice qué versión descargar y no revisa nada más.
2. **La huella.** Es una cadena de hashes SHA-256 de todas las teclas de la carrera, que el servidor arma mientras se juega y muestra al terminar. El verificador la vuelve a calcular con las teclas del archivo y la compara con la del archivo y con la que anotaste. Si alguien hubiera cambiado una sola tecla después de la carrera, la huella sería otra. El juego muestra las primeras 20 letras (80 bits): fabricar otras teclas que den esas mismas 20 letras costaría muchísimo más de lo que vale cualquier carrera.
3. **El resultado y los premios.** Vuelve a simular la carrera tick a tick (60 por segundo) con las teclas guardadas y comprueba que terminó como dicen las reglas (cuando queda un solo corredor en pista, o cuando quedan todos afuera). Ordena a los jugadores: el que queda eliminado primero pierde primero, y los que caen en el mismo tick empatan. Después reparte el pozo con las reglas de `src/premios.ts` y con la apuesta de esa mesa, y lo compara con el resultado oficial que pagó el servidor: puesto, distancia y premio de cada jugador, pozo y comisión de la plataforma. También comprueba que quien quedó afuera por desconectarse figure así en el resultado oficial.

## Qué no comprueba

- **Que las teclas anotadas sean las que apretaste.** El servidor anota las teclas que recibió y aplicó en cada tick. Si por la red una tecla no llegó a tiempo, ese tick repite las teclas que venías sosteniendo. Las desconexiones también las anota el servidor. Mira la repetición en el juego para comprobar que se parece a lo que jugaste.
- **Quién es quién.** Los nombres de los jugadores y quién se sentó en cada asiento los informa el servidor: no son parte de la huella.
- **Cómo se eligió la pista.** El servidor la elige al azar al empezar cada carrera.
- **Tu saldo.** Los movimientos de tu saldo están en el Historial del juego.

## Versiones

Cada versión publicada del código tiene una etiqueta `codigo-` seguida de las primeras 12 letras de su versión. Una carrera se comprueba siempre con la versión con la que se jugó, aunque después el juego haya cambiado. Si después se arregla algo del verificador o de este README sin tocar `src`, la etiqueta se mueve a ese arreglo: el código de `src` sigue siendo exactamente el mismo, porque su versión es su SHA-256.

La versión es el SHA-256 de los archivos de la simulación, en este orden, cada uno precedido por la línea `// <nombre>` (con saltos de línea `\n`). Puedes calcularla tú mismo dentro de la carpeta `src` (en Linux, macOS o Git Bash):

```
for f in constantes.ts rng.ts pista.ts corredor.ts carrera.ts entradas.ts repeticion.ts huella.ts premios.ts; do printf '// %s\n' "$f"; cat "$f"; done | sha256sum
```

o con `npm run version-codigo`. Tiene que dar lo mismo que `src/codigo.ts` y que el campo `datos.codigo` del archivo.

## Cómo se calcula la huella

```
h = sha256("stride-run/repeticion/v<v>|<partida.id>|<partida.mesa>|<semilla>|<n>|<codigo>")   (texto UTF-8)
para cada tick t de 0 a ticks:
  h = sha256(h + t en 4 bytes big-endian + bytes)
```

- `h` son los 32 bytes del hash anterior, no su texto hexadecimal.
- `bytes` son las desconexiones de ese tick (`0x80 + corredor`, en orden) seguidas de un byte por corredor, en orden de asiento, con las teclas vigentes en ese tick, aunque no hayan cambiado y aunque ese corredor ya esté eliminado. En el último tick (`t = ticks`) van solo las desconexiones.
- Teclas en bits: 1 izquierda, 2 derecha, 4 turbo, 8 freno, 16 saltar, 32 deslizar.
- La huella es `h` en hexadecimal. El código está en `src/huella.ts` y `src/repeticion.ts`.

## Qué hay en cada archivo

| Archivo | Qué hace |
| --- | --- |
| `src/constantes.ts` | Constantes de la física: gravedad, velocidades, tamaños |
| `src/rng.ts` | Generador de números al azar con semilla (mulberry32) |
| `src/pista.ts` | Arma la pista (obstáculos, huecos y power-ups) a partir de la semilla |
| `src/corredor.ts` | Física de un corredor en cada tick |
| `src/carrera.ts` | Una carrera completa: corredores, reloj y quién queda eliminado |
| `src/entradas.ts` | Cómo se guardan las teclas de un tick en un número |
| `src/repeticion.ts` | Graba y vuelve a reproducir una carrera |
| `src/huella.ts` | La huella (cadena de hashes) |
| `src/premios.ts` | Reparto del pozo, con la regla de empates y la comisión del 10% |
| `src/codigo.ts` | La versión de este código |
| `verificador/` | El verificador y el cálculo de la versión |
| `ejemplo/` | Una carrera de ejemplo (no se jugó de verdad) para probar el verificador |

Algunos comentarios del código nombran documentos internos del juego (`docs/DISENO.md`, el prototipo). No hacen falta para entender ni para verificar nada de lo que está acá.

## Licencia

Puedes leer, ejecutar, copiar y modificar este código para comprobar carreras de Stride Run, publicar lo que encuentres, hacer espejos sin cambios y crear tus propios verificadores, también como trabajo pago (auditorías, periodismo). No puedes usarlo en otro juego o producto. Los detalles están en [LICENCIA.md](LICENCIA.md).

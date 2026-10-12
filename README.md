# Stride Run · Verificador de carreras

Este repositorio tiene **el código que decide cada carrera de Stride Run** y un programa para **comprobar una carrera por tu cuenta**, sin confiar en el servidor del juego.

Stride Run es un juego de carreras en el navegador donde los jugadores apuestan entre ellos. El servidor del juego decide todo (posiciones, eliminaciones, puestos y premios), pero la carrera es **determinista**: con la misma pista y las mismas teclas sale siempre exactamente igual. Por eso cualquiera puede volver a simularla y comprobar el resultado.

Acá está solo lo necesario para eso: el sorteo de la pista, la pista, la física, las teclas, la repetición, la huella y el reparto de premios. El resto del juego (servidor, cuentas, billeteras y saldos) no se publica.

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

El verificador muestra cada comprobación con ✓ o ✗ (y con ! lo que conviene que sepas) y termina con un resumen. También devuelve un código de salida: **0** todo coincide, **1** algo no coincide (también si falta el sorteo de la pista), **2** el archivo está dañado, **3** la carrera se jugó con otra versión del código (usa la etiqueta que te indica).

"Todo coincide" quiere decir que el resultado oficial del archivo sale de sus teclas y de las reglas públicas. Lo que ata ese archivo a la carrera que de verdad jugaste es la huella del paso 1: si no la comparas, solo sabes que el archivo es coherente consigo mismo.

## Qué comprueba

1. **La versión del código.** Cada carrera anota con qué versión del código de la simulación se jugó. El verificador comprueba que el código de esta carpeta sea exactamente ese. Si no, te dice qué versión descargar y no revisa nada más.
2. **La huella.** Es una cadena de hashes SHA-256 de todas las teclas de la carrera, que el servidor arma mientras se juega y muestra al terminar. El verificador la vuelve a calcular con las teclas del archivo y la compara con la del archivo y con la que anotaste. Si alguien hubiera cambiado una sola tecla después de la carrera, la huella sería otra. El juego muestra las primeras 20 letras (80 bits): fabricar otras teclas que den esas mismas 20 letras costaría muchísimo más de lo que vale cualquier carrera.
3. **El sorteo de la pista.** La pista de cada mesa sale de un sorteo entre el número de la plataforma y los números de los jugadores, si los pusieron, cada uno en un sobre cerrado (mira «Cómo se sortea la pista»). El verificador comprueba que cada número coincida con su sobre, que la semilla de la pista salga del sorteo y que quien tenía sobre y no lo abrió a tiempo haya quedado fuera antes de largar (una desconexión en el tick 0). Si ningún jugador puso su número, lo avisa con un !: la pista salió solo del número de la plataforma, que pudo elegirla. Si el archivo no trae sorteo, o el sorteo no coincide, lo marca con ✗. La huella incluye el sorteo entero: cambiarlo después cambia la huella que anotaste.
4. **El resultado y los premios.** Vuelve a simular la carrera tick a tick (60 por segundo) con las teclas guardadas y comprueba que terminó como dicen las reglas (cuando queda un solo corredor en pista, cuando quedan todos afuera o al llegar al máximo de 5 minutos, `MAX_TICKS_CARRERA`). Ordena a los jugadores: el que queda eliminado primero pierde primero, y los que caen en el mismo tick empatan, igual que los que siguen corriendo al llegar al máximo. Después reparte el pozo con las reglas de `src/premios.ts` y con la apuesta de esa mesa, y lo compara con el resultado oficial de la carrera que calculó y guardó el servidor: puesto, distancia y premio de cada jugador, pozo y comisión de la plataforma. También comprueba que quien quedó afuera por desconectarse figure así en el resultado oficial. Normalmente es lo que se pagó; si la revisión anti-trampas congeló el pozo, lo que cobró de verdad cada uno puede ser distinto (mira abajo).

## Qué no comprueba

- **Que las teclas anotadas sean las que apretaste.** El servidor anota las teclas que recibió y aplicó en cada tick. Si por la red una tecla no llegó a tiempo, ese tick repite las teclas que venías sosteniendo. Las desconexiones también las anota el servidor. Mira la repetición en el juego para comprobar que se parece a lo que jugaste.
- **Quién es quién.** Los nombres de los jugadores y quién se sentó en cada asiento los informa el servidor: no son parte de la huella.
- **En qué orden llegaron los números del sorteo.** Cuando hay sobres, lo comprueba en vivo el navegador de cada jugador que puso el suyo: un archivo no lo puede probar.
- **Tu saldo.** Los movimientos de tu saldo están en el Historial del juego.
- **Lo que se cobró de verdad.** Si la revisión anti-trampas congeló el pozo, un administrador puede pagar como terminó, devolver las apuestas o pagar sin el jugador marcado. Lo que cobró cada uno está en `pagado`, y cómo se resolvió en `partida.estado` y `partida.resolucion` (`en_revision` quiere decir que nadie cobró todavía). El verificador solo compara `premio`, que es siempre el resultado de la carrera.

## Versiones

Cada versión publicada del código tiene una etiqueta `codigo-` seguida de las primeras 12 letras de su versión. Una carrera se comprueba siempre con la versión con la que se jugó, aunque después el juego haya cambiado. Si después se arregla algo del verificador o de este README sin tocar `src`, la etiqueta se mueve a ese arreglo: el código de `src` sigue siendo exactamente el mismo, porque su versión es su SHA-256.

La versión es el SHA-256 de los archivos de la simulación, en este orden, cada uno precedido por la línea `// <nombre>` (con saltos de línea `\n`). Puedes calcularla tú mismo dentro de la carpeta `src` (en Linux, macOS o Git Bash):

```
for f in constantes.ts rng.ts sorteo.ts pista.ts corredor.ts carrera.ts entradas.ts repeticion.ts huella.ts premios.ts; do printf '// %s\n' "$f"; cat "$f"; done | sha256sum
```

o con `npm run version-codigo`. Tiene que dar lo mismo que `src/codigo.ts` y que el campo `datos.codigo` del archivo.

## Cómo se sortea la pista

La pista de cada mesa sale de un sorteo. Al llenarse la mesa, la plataforma elige su número al azar (32 bytes: 64 letras hexadecimales). Cada jugador también puede poner el suyo (16 bytes: 32 letras) en un sobre cerrado, si su juego lo manda: al sentarse manda solo el sobre, y lo abre cuando ya están todos los sobres. Si hay sobres, antes de que se abran la plataforma muestra el sello de su número: así no lo puede cambiar después. Si ningún jugador puso su número (por ejemplo, en las carreras de la versión del juego que todavía no lo mandaba), la pista sale solo del número de la plataforma, y el verificador lo avisa con un !. Todo es texto ASCII, y cada hash es SHA-256 en hexadecimal, en minúsculas:

```
sello      = sha256("stride-run/sorteo/v1/sello|" + plataforma)
compromiso = sha256("stride-run/sorteo/v1/compromiso|" + aporte)
S          = sha256("stride-run/sorteo/v1/pista|" + plataforma
                    + "|" + compromiso_1 + "|" + aporte_1 + … + "|" + compromiso_n + "|" + aporte_n)
semilla    = las primeras 8 letras de S, leídas en hexadecimal (de 0 a 4294967295)
nombre     = esas mismas 8 letras en mayúsculas («Pista #6A97B80A»)
```

- En el archivo está en `datos.sorteo`: `plataforma` (el número de la plataforma), `compromisos` (los sobres) y `aportes` (los números de los jugadores, si los pusieron), en orden de asiento.
- Siempre van n pares, en orden de asiento. Si un jugador no puso número, su sobre y su número van vacíos. Si puso su sobre y no lo abrió a tiempo, su número va vacío y quedó fuera antes de largar, como si se hubiera desconectado.
- El nombre de la pista es la semilla de la pista en hexadecimal: `semilla = parseInt(nombre, 16)`. Las pistas de antes del sorteo tienen nombres de 5 cifras, y la práctica también.
- El código está en `src/sorteo.ts`, con un SHA-256 escrito ahí mismo, así el juego y este verificador usan exactamente el mismo.

Puedes calcularlo tú mismo en una terminal (Linux, macOS o Git Bash). Por ejemplo, con el sorteo de la carrera de ejemplo (`ejemplo/carrera-de-ejemplo.json`, 4 jugadores):

```
PLATAFORMA=f84278bf6a2a573fa41df47431f8a5dc016bbc3983c30556294347be70eb5242
SOBRE1=1bafbc135c3982dd7909fbbb284136918c98bc1a179537cc5f5bcca90dd04fe6
NUMERO1=77f815dceaa820dcd959d2eff1de95dd
SOBRE2=0ad393c1b55fbdf20cc46c3bdb0d479d86da3a949eed10296c9dbe50feafc426
NUMERO2=eca0afb00c92643b17d0c99b1fea4343
SOBRE3=66450c938f3bd963905d2f401597a05f5a348fb4cb1d90a407bcffe1bc3084d3
NUMERO3=38390f7c9628f6520775e7dd1942fd26
SOBRE4=256fb1ba3182b0dbc606eeb92a0e81a52333615a880fa8671dbecaf24aa3c52a
NUMERO4=a90a0822e10982743bf489aa590fad03
printf 'stride-run/sorteo/v1/compromiso|%s' "$NUMERO1" | sha256sum
printf 'stride-run/sorteo/v1/pista|%s|%s|%s|%s|%s|%s|%s|%s|%s' "$PLATAFORMA" "$SOBRE1" "$NUMERO1" "$SOBRE2" "$NUMERO2" "$SOBRE3" "$NUMERO3" "$SOBRE4" "$NUMERO4" | sha256sum | cut -c1-8
echo $((16#5557f961))
```

- La primera línea tiene que dar `SOBRE1`. Con `NUMERO2` tiene que dar `SOBRE2`, y así con cada jugador. Solo sirve para los números que no están vacíos.
- La segunda da las 8 letras de la semilla de la pista: `5557f961`. En mayúsculas son el nombre de la pista: «Pista #5557F961».
- La tercera las pasa a decimal: `1431828833`, que es la `semilla` del archivo.
- Con tu archivo, usa los valores de `datos.sorteo`, en orden de asiento: en la segunda línea va un `|%s|%s` por cada jugador, y después de `"$PLATAFORMA"` van el sobre y el número de cada uno (los vacíos, como `""`). En la tercera, cambia `5557f961` por las 8 letras que te dio la segunda.
- En macOS, si no tienes `sha256sum`, usa `shasum -a 256`.

## Cómo se calcula la huella

```
h = sha256("stride-run/repeticion/v<v>|<partida.id>|<partida.mesa>|<semilla>|<n>|<codigo>|<S>")   (texto UTF-8)
para cada tick t de 0 a ticks:
  h = sha256(h + t en 4 bytes big-endian + bytes)
```

- `|<S>` va solo si la carrera tuvo sorteo (`datos.sorteo`): es `S`, el SHA-256 del sorteo de la pista (mira «Cómo se sortea la pista»). Así, cambiar después cualquier parte del sorteo cambia la huella.
- `h` son los 32 bytes del hash anterior, no su texto hexadecimal.
- `bytes` son las desconexiones de ese tick (`0x80 + corredor`, en orden) seguidas de un byte por corredor, en orden de asiento, con las teclas vigentes en ese tick, aunque no hayan cambiado y aunque ese corredor ya esté eliminado. En el último tick (`t = ticks`) van solo las desconexiones.
- Teclas en bits: 1 izquierda, 2 derecha, 4 turbo, 8 freno, 16 saltar, 32 deslizar.
- La huella es `h` en hexadecimal. El código está en `src/huella.ts` y `src/repeticion.ts`.

## Qué hay en cada archivo

| Archivo | Qué hace |
| --- | --- |
| `src/constantes.ts` | Constantes de la física: gravedad, velocidades, tamaños |
| `src/rng.ts` | Generador de números al azar con semilla (mulberry32) |
| `src/sorteo.ts` | El sorteo de la pista de las mesas, con su SHA-256 |
| `src/pista.ts` | Arma la pista (obstáculos, huecos y power-ups) a partir de la semilla |
| `src/corredor.ts` | Física de un corredor en cada tick |
| `src/carrera.ts` | Una carrera completa: corredores, reloj y quién queda eliminado |
| `src/entradas.ts` | Cómo se guardan las teclas de un tick en un número |
| `src/repeticion.ts` | Graba y vuelve a reproducir una carrera |
| `src/huella.ts` | La huella (cadena de hashes, con el sorteo de la pista) |
| `src/premios.ts` | Reparto del pozo, con la regla de empates y la comisión del 10% |
| `src/codigo.ts` | La versión de este código |
| `verificador/` | El verificador y el cálculo de la versión |
| `ejemplo/` | Una carrera de ejemplo (no se jugó de verdad) para probar el verificador |

Algunos comentarios del código nombran documentos internos del juego (`docs/DISENO.md`, el prototipo). No hacen falta para entender ni para verificar nada de lo que está acá.

## Licencia

Puedes leer, ejecutar, copiar y modificar este código para comprobar carreras de Stride Run, publicar lo que encuentres, hacer espejos sin cambios y crear tus propios verificadores, también como trabajo pago (auditorías, periodismo). No puedes usarlo en otro juego o producto. Los detalles están en [LICENCIA.md](LICENCIA.md).

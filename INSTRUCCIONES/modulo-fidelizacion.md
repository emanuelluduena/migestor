# Módulo Fidelización (integrado)

El software de Fidelización que era una app aparte ahora vive dentro de Mi Gestor (menú → Vender → Fidelización).

## Qué tiene (pestañas)
- **Clientes**: son los MISMOS clientes de Mi Gestor (tabla `clientes`). Se dan de alta una sola vez. Acá se ven con sus puntos y se puede sumar por compra, canjear, ajustar, ver historial, editar, importar CSV y crear un cliente nuevo.
- **Premios**: catálogo + **calculadora de premios** (margen y % a devolver → cuánto cuesta cada punto y cuántos puntos poner a cada premio). Al cargar un premio con su costo en $ se sugiere solo el costo en puntos.
- **Promoción** (solo Administrador): mail masivo con `{{nombre}} {{puntos}} {{premio}} {{faltan}}`, filtrado por todos / les faltan puntos / ya pueden canjear.
- **Configuración**: regla de puntos, estado y si se avisa por mail al sumar/canjear (`fidelizacion_config.avisar_mail`).
- **Ayuda**.

## Cómo se conecta con el resto
- En **Ventas**, al elegir cliente y tildar “Sumar puntos”, se suman al cobrar; los canjes se agregan al ticket. (Ya existía.)
- Cada suma/canje manda un mail al cliente (si tiene email y los avisos están activos).
- Importar CSV acepta `,` `;` o tab, omite clientes que ya existen (mismo email, DNI o nombre) y crea el movimiento de puntos iniciales.

## Base de datos
- `clientes.fecha_cumpleanos` (date) y `fidelizacion_config.avisar_mail` (boolean, default true).
- Los movimientos de Mi Gestor usan `origen_cliente = 'pos'`; los de la app suelta (plan `solo_fidelizacion`) usan `'standalone'` y siguen leyendo `fidelizacion_clientes`.
- Edge functions `fidelizacion-mail` y `fidelizacion-campana`: reciben `origen: 'pos'` para leer `clientes`; sin ese campo se comportan como antes (app suelta).
- A los negocios que no son `solo_fidelizacion` se les copiaron sus clientes de `fidelizacion_clientes` a `clientes` (mismos ids, así el historial sigue enlazado). La tabla vieja no se borró.

## Archivos
`modulos/fidelizacion-completa.js` (se carga en `index.html`). Tests: `testsuite/tests/fidelizacion.test.js`.

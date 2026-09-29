# Módulo "Listas de proveedor"

Subís la lista del proveedor (Excel/CSV) → mapeás columnas y vinculás productos una sola vez → cada actualización posterior es: subir archivo → vista previa (sube / baja / nuevo / ya no aparece, alertas de aumentos grandes) → confirmar → se actualiza el costo y se recalculan los 4 precios con el margen de cada artículo. Con historial y deshacer. Podés elegir a qué sucursales se aplica.

## Archivos
| Archivo | Va en |
|---|---|
| `listas-proveedor-core.js` | `modulos/` |
| `listas-proveedor.js` | `modulos/` |
| `read-excel-file.min.js` | `lib/` |
| `pdf.min.js` y `pdf.worker.min.js` | `lib/` (para leer PDF; se cargan solo cuando alguien sube un PDF, no afectan al resto del sistema) |
| `migracion_funciones.sql` | ya aplicada / a aplicar en Supabase (no va en la carpeta) |

Copiar también a la carpeta de producción (Copy-Item) antes del push.

## Cambios en index.html (3, con Ctrl+H, uno por vez)
1. Buscar `<script src="lib/JsBarcode.all.min.js"></script>` y reemplazar por:
```
<script src="lib/JsBarcode.all.min.js"></script>
<script src="lib/read-excel-file.min.js"></script>
<script src="modulos/listas-proveedor-core.js"></script>
<script src="modulos/listas-proveedor.js"></script>
```
2. Buscar `fidelizacion:'Fidelización'` (dentro de MODS_NOMBRES) y reemplazar por:
`fidelizacion:'Fidelización', listasprov:'Listas de proveedor'`
3. Buscar `else if(tab==='fidelizacion') renderFidelizacion();` y reemplazar por:
```
else if(tab==='fidelizacion') renderFidelizacion();
  else if(tab==='listasprov' && typeof renderListasProv==='function') renderListasProv();
```
Si falta algún archivo del módulo, la app sigue funcionando igual (el llamado está protegido con `typeof`).

## Cómo funciona por dentro
- Tablas propias (todas con `negocio_id` y RLS): `listas_prov_config`, `listas_prov_relaciones`, `listas_prov_cargas`, `listas_prov_cambios`; columna `articulos.id_externo` reservada para Tiendanube.
- Aplicar/deshacer son funciones SQL atómicas (`listas_prov_aplicar`, `listas_prov_deshacer`): o se actualiza todo o nada.
- Deshacer solo revierte artículos cuyo costo sigue siendo el que puso la carga (no pisa cambios manuales posteriores).
- Lógica pura (parseo, matching, precios) en `listas-proveedor-core.js`; todo lo que toca Mi Gestor está en el objeto `Adaptador` de `listas-proveedor.js`. Para llevarlo a otro producto se reemplaza solo el `Adaptador`.

## Limitaciones conocidas
- No lee `.xls` viejo (guardar como `.xlsx` o CSV).
- PDF (lectura automática): el sistema prueba solo varias formas de leer el PDF (por columnas con distintas tolerancias y por renglón, con el precio al final de cada línea), elige la que más artículos con precio saca y muestra la lista de lecturas en "Cómo se leyó el PDF" para poder cambiar. Si los títulos de las columnas no se reconocen, mira el contenido (la columna de números = costo, la de texto largo = descripción). Funciona con PDF que tienen texto (los que se pueden seleccionar). Si es un escaneo o foto, avisa y hay que pedir la lista en Excel/PDF con texto. Las columnas se arman por posición del texto; si una lista tiene un formato raro, revisá el paso de mapeo de columnas antes de aplicar.
- Los proveedores son por sucursal: la configuración y vínculos quedan atados al proveedor de la sucursal donde se configuró.
- La vista previa muestra los valores de la sucursal activa.
- Los precios se guardan sin redondear (igual que el cálculo actual).

## Pruebas
`node --test "tests/**/*.test.js" --test-force-exit` (62 pruebas, incluye PDF de ejemplo). Recomendado además correr `npm test` en migestor-dev\testsuite.

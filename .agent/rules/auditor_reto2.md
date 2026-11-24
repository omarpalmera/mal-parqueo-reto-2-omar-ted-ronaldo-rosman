Rol: Auditor de Calidad y Rúbrica (Reto No. 2 - Unimagdalena)

Después de generar o modificar cualquier archivo del proyecto, audita estrictamente el código contra los criterios de aceptación de la guía oficial del Reto No. 2:

Auditoría de Ruta Relativa (GitHub Pages):

Verifica que ningún fetch() use rutas absolutas con / inicial (ej. usar 'datos/reportes.json' y nunca '/datos/reportes.json'), ya que GitHub Pages aloja el sitio en un subdirectorio (/nombre-repo/) y las rutas con / inicial rompen la carga.

Auditoría de Desacoplamiento (criticidad.js):

Confirma que criticidad.js no tiene valores quemados (hardcoded) de puntajes ni horas pico.

Verifica que la aplicación recalcula automáticamente todos los reportes de reportes.json al cargar la página, para que si el docente edita un peso en criterios.json, el tablero y el Top 5 reflejen el cambio de inmediato.

Auditoría de Leaflet.heat y Contenedor del Mapa:

Verifica que el contenedor #map tenga altura definida en CSS (min-height o height explícito).

Confirma que la librería leaflet-heat.js esté cargada después de leaflet.js en index.html.

Verifica que se llame a map.invalidateSize() cada vez que el usuario cambie a la pestaña del Tablero Operativo.

Auditoría de Compresión y Deduplicación:

Confirma que captura.js reduce cualquier imagen a maxWidth = 800 antes de llamar a localStorage.setItem().

Verifica que la importación de JSON en RF-06 compara estrictamente por reporte.id para impedir registros duplicados al unir reportes de varios celulares.

Auditoría de Coordenadas (Santa Marta):

Verifica que todos los puntos en vias.json y reportes.json estén en tierra firme dentro del Centro Histórico / Av. Campo Serrano de Santa Marta (latitud entre 11.2390 y 11.2460, longitud entre -74.2150 y -74.2070), nunca en el mar.

Auditoría de Reglas del Resumen Operativo:

Confirma que cada recomendación del Top 5 muestre explícitamente el texto de la regla que la produjo y que la vista de impresión (@media print) funcione limpiamente.
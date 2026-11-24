Rol: Desarrollador Frontend y Arquitectura Web (Reto No. 2 - Santa Marta)

Eres el desarrollador principal encargado de construir la aplicación web del Reto No. 2: Control de mal parqueo e invasión del espacio público en Santa Marta (Universidad del Magdalena, 2026-2).

1. Stack Tecnológico y Restricciones Obligatorias

Tecnologías permitidas: Exclusivamente HTML5, CSS3 y JavaScript puro (ES6+ Vanilla JS). Prohibido usar React, Vue, Angular, Node.js, bases de datos remotas o servidores backend.

Ejecución: Debe funcionar 100% en el navegador mediante VS Code Live Server y ser desplegable directamente en GitHub Pages.

Librerías externas (vía CDN): Leaflet (leaflet.css y leaflet.js) y Leaflet.heat para el mapa de calor sobre teselas de OpenStreetMap.

Almacenamiento: Los datos iniciales se leen vía fetch() desde datos/reportes.json, datos/vias.json y datos/criterios.json. Los reportes creados en el navegador se guardan en localStorage y se fusionan en memoria con los precargados sin duplicar IDs.

Límite de almacenamiento (~5 MB) y Privacidad: Toda fotografía subida en el formulario debe redimensionarse en cliente mediante <canvas> a un ancho máximo de 800 píxeles y calidad JPEG 0.7 antes de guardarse en Base64 en localStorage. No se solicita ni almacena información personal, placas ni rostros (Ley 1581 de 2012).

2. Estructura Exacta de Archivos a Generar

/
├── index.html
├── styles.css
├── README.md
├── js/
│   ├── captura.js
│   ├── criticidad.js
│   ├── filtros.js
│   ├── resumen.js
│   └── mapa.js
└── datos/
    ├── reportes.json
    ├── vias.json
    ├── criterios.json
    └── fotos/


3. Especificaciones de Módulos y Requerimientos (RF-01 a RF-06)

A. index.html y styles.css (Interfaz Mobile-First)

Diseño responsivo enfocado en celular (mobile-first) con navegación por pestañas claras entre dos vistas principales:

Vista 1: Captura Rápida (menos de 30 segundos): Formulario minimalista con botón de geolocalización GPS (navigator.geolocation), mini-mapa interactivo para ajustar pin en Santa Marta (centro inicial: 11.2421, -74.2105 - Centro Histórico / Av. Campo Serrano), selector de cuadra (cargado dinámicamente desde vias.json), selector de categoria, selector de actor, input de cámara/foto (accept="image/*" capture="environment") y botón de envío inmediato.

Vista 2: Tablero Operativo: Panel de filtros dinámicos, contenedor de mapa Leaflet con altura explícita (min-height: 420px), controles de capa (Mapa de Calor vs. Puntos Individuales), panel de Resumen Operativo (Top 5 cuadras + recomendaciones + botón "Imprimir Resumen") y botones de Exportar/Importar JSON.

Incluir hoja de estilos @media print que oculte el formulario, botones y controles de filtro al imprimir, dejando limpio el Resumen Operativo.

B. js/criticidad.js (Lógica Pura Desacoplada)

Prohibido tocar el DOM o el mapa dentro de este archivo.

Exportar o exponer la función pura calcularCriticidad(reporte, viasData, criteriosData):

Busca reporte.cuadra en viasData para obtener el tipo_via (arterial o secundaria).

Extrae la hora HH:MM de reporte.fecha_hora y determina si cae dentro de algún rango de criteriosData.horas_pico (pico o valle).

Suma los 3 pesos leyendo exclusivamente de criteriosData: categoria[reporte.categoria] + via[tipo_via] + franja[franja_calculada].

Evalúa el puntaje total contra criteriosData.niveles (Bajo, Medio, Alto) y retorna { puntaje, nivel, desglose: { ptsCategoria, ptsVia, ptsFranja, tipoVia, franja } }.

Regla crítica: Si se modifica un número en criterios.json y se recarga la página, todos los reportes precargados deben recalcular su criticidad dinámicamente al iniciar.

C. js/captura.js

Maneja la validación del formulario, captura de coordenadas (clic en mini-mapa o GPS), compresión de imagen en <canvas> a máx. 800 px, generación de ID único (ej. MP-LOCAL- + timestamp corto), cálculo de criticidad llamando a criticidad.js y persistencia en localStorage bajo la clave reto2_reportes_local.

Implementa RF-06 (Exportar e Importar):

Exportar: Descarga un archivo .json con todos los reportes actuales del navegador.

Importar: Lee uno o varios archivos .json seleccionados por el usuario, filtra por id para evitar duplicados, fusiona en localStorage y dispara la actualización global del tablero.

D. js/filtros.js

Función pura filtrarReportes(listaReportes, filtrosActivos, viasData) que filtra sin recargar la página por:

sector o cuadra

franja (todas, pico, valle)

categoria (todas, doble_fila, bloqueo_rampa_cebra_paradero, invasion_anden)

actor (todos, vehiculo_particular, motocicleta, vehiculo_carga, mobiliario_comercial)

Actualiza contadores resumen (total filtrado, distribución por nivel y porcentaje por categoría).

E. js/resumen.js

Agrupa los reportes filtrados por cuadra, suma sus puntajes de criticidad, ordena de mayor a menor y toma el Top 5 de cuadras críticas.

Evalúa reglas explícitas para generar recomendaciones mostrando textualmente la regla aplicada:

Regla R1: Si la cuadra tiene 3 o más reportes de nivel Alto en franja pico -> Recomendación: "Patrullaje prioritario en hora pico" (Regla aplicada: 3 o más reportes Alto en franja pico).

Regla R2: Si predomina (más del 50% o mayoría simple) la categoría invasion_anden -> Recomendación: "Operativo de espacio público" (Regla aplicada: Predominio de invasión de andén).

Regla R3: Si predomina el actor vehiculo_carga -> Recomendación: "Revisar horario de cargue y descargue" (Regla aplicada: Predominio de vehículo de carga descargando).

Regla R4 (Por defecto): Si no cumple R1-R3 -> Recomendación: "Control preventivo y señalización vial" (Regla aplicada: Incidencia moderada/mixta sin umbral crítico específico).

F. js/mapa.js

Inicializa mapa Leaflet centrado en Santa Marta ([11.2421, -74.2105], zoom 16) con teselas OpenStreetMap.

Renderiza dos capas intercambiables:

Leaflet.heat: Recibe arreglo [lat, lng, intensidadNormalizada] ponderado por el puntaje de criticidad. Debe ejecutarse map.invalidateSize() al cambiar de pestaña para evitar que el canvas de calor falle o quede en tamaño 0.

L.layerGroup: Marcadores individuales coloreados por nivel (Alto: rojo, Medio: naranja, Bajo: verde) con popup mostrando cuadra, categoría, actor, hora, desglose de puntaje y miniatura de foto si existe.

G. Archivos de Datos Semilla (datos/)

Generar 8 cuadras reales del Centro Histórico / Av. Campo Serrano de Santa Marta en vias.json.

Generar criterios.json siguiendo exactamente la estructura del esquema oficial:

{
  "categoria": { "doble_fila": 3, "bloqueo_rampa_cebra_paradero": 3, "invasion_anden": 2 },
  "via": { "arterial": 3, "secundaria": 1 },
  "franja": { "pico": 3, "valle": 1 },
  "horas_pico": ["06:30-08:30", "11:30-14:00", "17:00-19:30"],
  "niveles": { "Bajo": [0, 4], "Medio": [5, 6], "Alto": [7, 9] }
}


Generar 30 registros realistas de prueba en reportes.json distribuidos entre franja pico y valle en esas 8 cuadras de Santa Marta para validar inmediatamente el mapa de calor y el Top 5.
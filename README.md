# Control de Mal Parqueo e Invasión del Espacio Público en Santa Marta (Reto No. 2)

Aplicación web *mobile-first* desarrollada para el curso **Introducción a la Ingeniería de Sistemas (2026-2)** de la **Universidad del Magdalena** (Docente: Aquiles Cohen). Permite registrar incidentes de obstrucción vial y peatonal en menos de 30 segundos, calcular su índice de criticidad con reglas transparentes y visualizar el mapa de calor junto al resumen operativo de las 5 cuadras prioritarias en el Centro Histórico y la Avenida Campo Serrano.

---

## Equipo y Roles del Proyecto

Cada integrante lidera un frente técnico y de campo, manteniendo trazabilidad individual en los *commits* de GitHub y dominio completo de toda la solución:

| Rol oficial | Responsabilidad principal | Integrante asignado | Usuario GitHub |
| :--- | :--- | :--- | :--- |
| **Analista de campo y privacidad** | Clasificación de las 8 cuadras en `datos/vias.json`, recorridos en hora pico y valle, georreferenciación de los 30 registros y anonimización de fotos (Ley 1581 de 2012). | *Integrante 1 (Completar nombre)* | `@usuario1` |
| **Integrador del mapa e instrucciones para la IA** | Integración de Leaflet, mapa de calor `Leaflet.heat` sobre OpenStreetMap, capa de puntos individuales y diseño de prompts. | *Integrante 2 (Completar nombre)* | `@usuario2` |
| **Ingeniero de lógica y clasificación** | Diseño del índice de criticidad (`js/criticidad.js`, `datos/criterios.json`), motor de filtros (`js/filtros.js`) y reglas de recomendación (`js/resumen.js`). | *Integrante 3 (Completar nombre)* | `@usuario3` |
| **Diseñador de interfaz y documentador** | Formulario de captura rápida (< 30 s), tablero responsivo, estilos de impresión `@media print`, bitácora de iteración y `README.md`. | *Integrante 4 (Completar nombre)* | `@usuario4` |

> **Enlace al prototipo publicado (GitHub Pages):** `https://<usuario-o-org>.github.io/<nombre-del-repositorio>/` *(Actualizar al activar GitHub Pages)*.

---

## Estructura del Proyecto

```text
/
├── index.html               # Interfaz mobile-first con pestañas Captura Rápida y Tablero Operativo
├── styles.css               # Estilos responsivos + @media print para imprimir Resumen Operativo
├── README.md                # Documentación del equipo, ejecución local y despliegue
├── js/
│   ├── criticidad.js        # Lógica pura desacoplada para cálculo de criticidad (RF-02)
│   ├── filtros.js           # Filtrado dinámico y porcentajes por categoría (RF-04 / CU-02)
│   ├── resumen.js           # Ranking Top 5 y reglas explícitas R1-R4 (RF-05 / CU-03)
│   ├── mapa.js              # Mapa Leaflet, Leaflet.heat, puntos individuales y mini-mapa (RF-03)
│   └── captura.js           # Carga fetch(), formulario <30s, compresión canvas 800px y RF-06
└── datos/
    ├── criterios.json       # Pesos por categoría, tipo de vía, franja, horas pico y rangos
    ├── vias.json            # 8 cuadras reales del Centro Histórico y Av. Campo Serrano
    ├── reportes.json        # 30 registros de campo distribuidos en hora pico y valle
    └── fotos/               # Muestras gráficas anonimizadas sin placas ni rostros
```

---

## Requerimientos Funcionales y Casos de Uso Cubiertos

- **RF-01 / CU-01 (Captura rápida < 30 s):** Uso de GPS (`navigator.geolocation`) o toque directo en el mini-mapa de Santa Marta, selección táctil de categoría y actor, compresión de foto en el cliente con `<canvas>` (ancho máximo `800 px`, JPEG calidad `0.7`) y persistencia en `localStorage` bajo `reto2_reportes_local`.
- **RF-02 (Índice de criticidad desacoplado):** `js/criticidad.js` suma `categoria + via + franja` leyendo únicamente de `datos/criterios.json` y `datos/vias.json`. Al modificar cualquier peso en `datos/criterios.json` y recargar la página, todos los reportes recalculan su puntaje y nivel automáticamente.
- **RF-03 (Mapa de calor y puntos):** `Leaflet` + `Leaflet.heat` ponderado por puntaje de criticidad sobre teselas OpenStreetMap, con alternancia entre mapa de calor, puntos individuales y ambas capas.
- **RF-04 / CU-02 (Filtros dinámicos):** Filtrado en tiempo real sin recargar por sector, cuadra, franja (`pico`/`valle`), categoría y actor, actualizando KPIs, porcentajes por categoría y capas del mapa.
- **RF-05 / CU-03 (Resumen operativo e impresión):** Top 5 de cuadras con mayor puntaje acumulado y evaluación explícita de reglas:
  - **R1:** `>= 3` reportes de nivel Alto en franja pico → *"Patrullaje prioritario en hora pico"*.
  - **R2:** Predominio de `invasion_anden` → *"Operativo de espacio público"*.
  - **R3:** Predominio del actor `vehiculo_carga` → *"Revisar horario de cargue y descargue"*.
  - **R4:** Incidencia mixta/moderada por defecto → *"Control preventivo y señalización vial"*.
- **RF-06 / CU-04 (Exportar / Importar JSON):** Descarga de reportes en `.json` e importación múltiple desde otros celulares deduplicando estrictamente por `reporte.id`.

### Casos de Verificación Manual (RF-02)

1. **Caso `MP-014`** (`CR5-C14-C15`, `2026-11-18T11:40`, `invasion_anden`):
   - Categoría `invasion_anden`: **2**
   - Vía `arterial` (Av. Campo Serrano): **3**
   - Franja `pico` (11:40 dentro de `11:30-14:00`): **3**
   - **Total:** `2 + 3 + 3 = 8 puntos` → **Nivel Alto** (rango `[7, 9]`).
2. **Caso `MP-026`** (`CL17-CR3-CR4`, `2026-11-19T10:05`, `invasion_anden`):
   - Categoría `invasion_anden`: **2**
   - Vía `secundaria` (Calle 17 - Parque de los Novios): **1**
   - Franja `valle` (10:05 fuera de horas pico): **1**
   - **Total:** `2 + 1 + 1 = 4 puntos` → **Nivel Bajo** (rango `[0, 4]`).

---

## Cómo Ejecutar en Local con VS Code Live Server

Debido a que la aplicación carga `datos/criterios.json`, `datos/vias.json` y `datos/reportes.json` mediante `fetch()`, los navegadores bloquean dichas peticiones si se abre `index.html` directamente con doble clic (`file://`). Para correrlo localmente:

1. Abre la carpeta raíz del proyecto en **Visual Studio Code**.
2. Instala la extensión **Live Server** (*Ritwick Dey*, ID `ritwickdey.LiveServer`) si aún no la tienes.
3. Haz clic derecho sobre `index.html` en el explorador de VS Code y selecciona **"Open with Live Server"** (o presiona el botón **"Go Live"** en la barra inferior derecha).
4. Se abrirá automáticamente `http://127.0.0.1:5500/index.html` en tu navegador.
5. Para probar la vista móvil en menos de 30 segundos, abre las herramientas de desarrollador (`F12`) y activa la vista de dispositivo móvil (*Toggle device toolbar*).

---

## Cómo Desplegar en GitHub Pages

Todas las peticiones `fetch()` y recursos usan rutas relativas (`datos/...`, `js/...`, `styles.css`), por lo que el sitio funciona sin modificaciones en subdirectorios de GitHub Pages (`https://usuario.github.io/nombre-repo/`):

1. Sube todo el proyecto a un repositorio público en GitHub (cada integrante debe realizar commits desde su propia cuenta personal/institucional).
2. En GitHub, entra al repositorio y abre la pestaña **Settings** (Configuración).
3. En el menú lateral izquierdo, selecciona **Pages**.
4. En **Build and deployment → Source**, elige **Deploy from a branch**.
5. En **Branch**, selecciona la rama `main` (o `master`) y la carpeta `/ (root)`, luego haz clic en **Save**.
6. Espera entre 1 y 2 minutos; GitHub mostrará la URL pública en la parte superior de **Settings → Pages**. Copia esa URL en la sección inicial de este `README.md`.

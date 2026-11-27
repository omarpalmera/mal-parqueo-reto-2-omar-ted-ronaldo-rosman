/**
 * js/captura.js
 * Controlador principal de la aplicación:
 * - Carga de datos JSON por rutas relativas (compatibles con GitHub Pages).
 * - Recálculo dinámico de criticidad al iniciar (si cambia criterios.json, todo se actualiza).
 * - Captura rápida en < 30 segundos con compresión de foto en <canvas> a maxWidth = 800 px.
 * - Validación de fechas (bloquea fechas futuras y permite libremente fechas previas).
 * - Persistencia en localStorage ('reto2_reportes_local') y fusión sin duplicados.
 * - Exportar e Importar JSON (RF-06 / CU-04) deduplicando estrictamente por reporte.id.
 */

(function (global) {
  'use strict';

  var STORAGE_KEY = 'reto2_reportes_local';
  var MAX_WIDTH_FOTO = 800;
  var CALIDAD_JPEG = 0.7;

  var ESTADO = {
    criterios: null,
    vias: [],
    reportesSemilla: [],
    reportesLocales: [],
    reportesConsolidados: [],
    fotoBase64Actual: '',
    fotoVerificada: true,
    modoCapa: 'ambas',
    filtros: {
      sector: 'todos',
      cuadra: 'todas',
      franja: 'todas',
      categoria: 'todas',
      actor: 'todos'
    }
  };

  /**
   * Genera marca de tiempo local en formato YYYY-MM-DDTHH:MM.
   * @param {Date} fecha
   * @returns {string}
   */
  function formatearFechaHoraLocal(fecha) {
    var d = fecha || new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd + 'T' + hh + ':' + min;
  }

  /**
   * Parsea una fecha/hora local en formato YYYY-MM-DDTHH:MM (o YYYY-MM-DD HH:MM[:SS])
   * verificando que no exista desbordamiento de calendario (ej. 31 de febrero).
   * @param {string} fechaHoraStr
   * @returns {Date|null}
   */
  function parsearFechaLocal(fechaHoraStr) {
    if (typeof fechaHoraStr !== 'string') return null;
    var match = fechaHoraStr
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;

    var anio = parseInt(match[1], 10);
    var mes = parseInt(match[2], 10);
    var dia = parseInt(match[3], 10);
    var hora = parseInt(match[4], 10);
    var minuto = parseInt(match[5], 10);
    var segundo = match[6] ? parseInt(match[6], 10) : 0;

    if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59 || segundo > 59) {
      return null;
    }

    var fecha = new Date(anio, mes - 1, dia, hora, minuto, segundo, 0);
    if (
      fecha.getFullYear() !== anio ||
      fecha.getMonth() !== mes - 1 ||
      fecha.getDate() !== dia ||
      fecha.getHours() !== hora ||
      fecha.getMinutes() !== minuto
    ) {
      return null;
    }
    return fecha;
  }

  /**
   * Valida que la fecha del incidente sea válida y no sea futura.
   * Permite libremente fechas previas y la fecha/hora actual.
   * @param {string} fechaHoraStr
   * @param {Date} [ahora]
   * @returns {{ valida: boolean, motivo: string }}
   */
  function validarFechaIncidente(fechaHoraStr, ahora) {
    var fecha = parsearFechaLocal(fechaHoraStr);
    if (!fecha) {
      return {
        valida: false,
        motivo: 'La fecha y hora del incidente no tiene un formato válido.'
      };
    }
    var referencia = ahora instanceof Date ? ahora : new Date();
    if (fecha.getTime() > referencia.getTime()) {
      return {
        valida: false,
        motivo: 'No se pueden registrar incidentes en fechas u horas futuras. Selecciona la hora actual o una fecha anterior.'
      };
    }
    return { valida: true, motivo: '' };
  }

  /**
   * Genera un identificador único para reportes locales evitando colisiones al importar.
   * @returns {string}
   */
  function generarIdLocal() {
    var existentes = new Set();
    for (var i = 0; i < ESTADO.reportesConsolidados.length; i++) {
      if (ESTADO.reportesConsolidados[i] && ESTADO.reportesConsolidados[i].id) {
        existentes.add(ESTADO.reportesConsolidados[i].id);
      }
    }
    var candidato = '';
    do {
      var aleatorio = Math.random().toString(36).slice(2, 6).toUpperCase();
      candidato = 'MP-LOCAL-' + Date.now() + '-' + aleatorio;
    } while (existentes.has(candidato));
    return candidato;
  }

  /**
   * Normaliza una fecha/hora a precisión de minuto ("YYYY-MM-DDTHH:MM") para comparación.
   * @param {string} fechaHoraStr
   * @returns {string}
   */
  function normalizarMinuto(fechaHoraStr) {
    if (typeof fechaHoraStr !== 'string') return '';
    return fechaHoraStr.trim().replace(' ', 'T').slice(0, 16);
  }

  /**
   * Verifica si ya existe un reporte idéntico en contenido (misma ubicación, cuadra,
   * categoría, actor y minuto) para impedir envíos repetidos sin cambiar ningún dato.
   *
   * @param {Object} candidato
   * @param {Array} listaExistentes
   * @returns {boolean}
   */
  function esReporteDuplicado(candidato, listaExistentes) {
    if (!candidato || !Array.isArray(listaExistentes)) return false;
    var fechaCand = normalizarMinuto(candidato.fecha_hora);
    var latCand = Number(candidato.lat).toFixed(5);
    var lngCand = Number(candidato.lng).toFixed(5);

    for (var i = 0; i < listaExistentes.length; i++) {
      var rep = listaExistentes[i];
      if (!rep) continue;
      if (
        rep.cuadra === candidato.cuadra &&
        rep.categoria === candidato.categoria &&
        rep.actor === candidato.actor &&
        normalizarMinuto(rep.fecha_hora) === fechaCand &&
        Number(rep.lat).toFixed(5) === latCand &&
        Number(rep.lng).toFixed(5) === lngCand
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Lee los reportes guardados localmente en localStorage.
   * @returns {Array}
   */
  function leerLocalStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('No se pudo leer localStorage:', err);
      return [];
    }
  }

  /**
   * Persiste reportes locales en localStorage.
   * @param {Array} listaLocal
   * @param {string} [idBannerError] - ID del banner donde mostrar error si excede cuota.
   * @returns {boolean}
   */
  function guardarLocalStorage(listaLocal, idBannerError) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(listaLocal));
      return true;
    } catch (err) {
      mostrarMensaje(
        idBannerError || 'captura-estado',
        'No se pudo guardar el reporte en este dispositivo. Comprueba el espacio disponible y vuelve a intentarlo.',
        'error'
      );
      return false;
    }
  }

  /**
   * Fusiona listas de reportes evitando duplicados estrictamente por reporte.id
   * y recalcula la criticidad de cada registro usando criterios.json y vias.json.
   *
   * @param {Array} semilla
   * @param {Array} locales
   * @returns {Array}
   */
  function fusionarYRecalcular(semilla, locales) {
    var vistos = new Set();
    var resultado = [];

    function procesarLista(lista) {
      if (!Array.isArray(lista)) return;
      for (var i = 0; i < lista.length; i++) {
        var item = lista[i];
        if (!item || !item.id || vistos.has(item.id)) continue;
        vistos.add(item.id);

        var copia = Object.assign({}, item);
        copia.criticidad = global.Criticidad.calcularCriticidad(
          copia,
          ESTADO.vias,
          ESTADO.criterios
        );
        resultado.push(copia);
      }
    }

    procesarLista(semilla);
    procesarLista(locales);
    return resultado;
  }

  /**
   * Comprime una imagen seleccionada por el usuario utilizando <canvas> a un ancho máximo
   * de 800 píxeles y calidad JPEG 0.7 antes de guardarla en localStorage.
   *
   * @param {File} archivo
   * @returns {Promise<{ dataUrl: string, ancho: number, alto: number, kb: number }>}
   */
  function comprimirImagenCanvas(archivo) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (evento) {
        var img = new Image();
        img.onload = function () {
          var maxWidth = MAX_WIDTH_FOTO;
          var ancho = img.width;
          var alto = img.height;

          if (ancho > maxWidth) {
            alto = Math.round((alto * maxWidth) / ancho);
            ancho = maxWidth;
          }

          var canvas = document.createElement('canvas');
          canvas.width = ancho;
          canvas.height = alto;

          try {
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, ancho, alto);

            var dataUrl = canvas.toDataURL('image/jpeg', CALIDAD_JPEG);
            var kb = Math.round((dataUrl.length * 0.75) / 1024);
            resolve({ dataUrl: dataUrl, ancho: ancho, alto: alto, kb: kb });
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = function () {
          reject(new Error('El archivo seleccionado no es una imagen válida.'));
        };
        img.src = evento.target.result;
      };
      reader.onerror = function () {
        reject(new Error('Error leyendo el archivo de imagen.'));
      };
      reader.readAsDataURL(archivo);
    });
  }

  /**
   * Muestra un mensaje temporal o de estado en la interfaz.
   */
  function mostrarMensaje(idElemento, texto, tipo) {
    var el = document.getElementById(idElemento);
    if (!el) return;
    el.textContent = texto;
    el.className = 'status-banner ' + (tipo ? 'status-' + tipo : '');
    el.hidden = !texto;
  }

  /**
   * Actualiza las opciones del selector de cuadra del tablero según el sector elegido.
   * @param {string} sectorSeleccionado
   */
  function actualizarOpcionesCuadraFiltro(sectorSeleccionado) {
    var selectCuadraFiltro = document.getElementById('filtro-cuadra');
    if (!selectCuadraFiltro) return;

    var valorPrevio = ESTADO.filtros.cuadra;
    var cuadraSigueValida = valorPrevio === 'todas';

    selectCuadraFiltro.innerHTML = '<option value="todas">Todas las cuadras</option>';
    for (var j = 0; j < ESTADO.vias.length; j++) {
      var vf = ESTADO.vias[j];
      if (sectorSeleccionado && sectorSeleccionado !== 'todos' && vf.sector !== sectorSeleccionado) {
        continue;
      }
      var optF = document.createElement('option');
      optF.value = vf.id;
      optF.textContent = vf.nombre;
      selectCuadraFiltro.appendChild(optF);
      if (vf.id === valorPrevio) {
        cuadraSigueValida = true;
      }
    }

    if (!cuadraSigueValida) {
      ESTADO.filtros.cuadra = 'todas';
    }
    selectCuadraFiltro.value = ESTADO.filtros.cuadra;
  }

  /**
   * Pobla dinámicamente los selectores de cuadra y sector desde datos/vias.json.
   */
  function poblarSelectoresVias() {
    var selectCuadraCaptura = document.getElementById('cuadra');
    var selectSectorFiltro = document.getElementById('filtro-sector');

    if (selectCuadraCaptura) {
      selectCuadraCaptura.innerHTML = '';
      for (var i = 0; i < ESTADO.vias.length; i++) {
        var v = ESTADO.vias[i];
        var opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.nombre;
        selectCuadraCaptura.appendChild(opt);
      }
    }

    actualizarOpcionesCuadraFiltro(ESTADO.filtros.sector);

    if (selectSectorFiltro) {
      var sectores = [];
      for (var k = 0; k < ESTADO.vias.length; k++) {
        var sec = ESTADO.vias[k].sector;
        if (sec && sectores.indexOf(sec) === -1) sectores.push(sec);
      }
      selectSectorFiltro.innerHTML = '<option value="todos">Todos</option>';
      for (var s = 0; s < sectores.length; s++) {
        var optS = document.createElement('option');
        optS.value = sectores[s];
        optS.textContent = sectores[s];
        selectSectorFiltro.appendChild(optS);
      }
    }

    actualizarBadgeViaCaptura();
  }

  /**
   * Muestra el tipo de vía (arterial / secundaria) correspondiente a la cuadra elegida.
   */
  function actualizarBadgeViaCaptura() {
    var select = document.getElementById('cuadra');
    var badge = document.getElementById('badge-tipo-via');
    if (!select || !badge) return;

    var codigo = select.value;
    var encontrada = null;
    for (var i = 0; i < ESTADO.vias.length; i++) {
      if (ESTADO.vias[i].id === codigo) {
        encontrada = ESTADO.vias[i];
        break;
      }
    }
    if (encontrada) {
      badge.textContent = 'Vía ' + encontrada.tipo_via + ' · ' + encontrada.sector;
      badge.className = 'badge-via ' + (encontrada.tipo_via === 'arterial' ? 'badge-arterial' : 'badge-secundaria');
    }
    actualizarVistaPreviaCriticidad();
  }

  function puntos(valor) {
    return valor + (valor === 1 ? ' punto' : ' puntos');
  }

  /**
   * Calcula y muestra en vivo el puntaje estimado en el formulario de captura rápida.
   */
  function actualizarVistaPreviaCriticidad() {
    var elPreview = document.getElementById('preview-criticidad');
    if (!elPreview || !ESTADO.criterios) return;

    var cuadra = (document.getElementById('cuadra') || {}).value;
    var catInput = document.querySelector('input[name="categoria"]:checked');
    var categoria = catInput ? catInput.value : 'doble_fila';
    var fechaInput = document.getElementById('fecha_hora');
    var fechaHora = fechaInput && fechaInput.value ? fechaInput.value : formatearFechaHoraLocal(new Date());

    var res = global.Criticidad.calcularCriticidad(
      { cuadra: cuadra, categoria: categoria, fecha_hora: fechaHora },
      ESTADO.vias,
      ESTADO.criterios
    );

    var desglose = res.desglose;
    var nivel = elPreview.querySelector('#nivel-estimado');
    var lista = elPreview.querySelector('.score-pills');

    if (nivel && lista) {
      nivel.className = 'pill-nivel pill-' + res.nivel.toLowerCase();
      nivel.textContent = 'Nivel ' + res.nivel.toLowerCase() + ' · ' + puntos(res.puntaje);

      lista.replaceChildren();
      [
        ['Categoría', desglose.ptsCategoria],
        ['Vía ' + desglose.tipoVia, desglose.ptsVia],
        ['Hora ' + desglose.franja, desglose.ptsFranja]
      ].forEach(function (factor) {
        var item = document.createElement('li');
        item.textContent = factor[0] + ' · ' + puntos(factor[1]);
        lista.appendChild(item);
      });
    } else {
      elPreview.textContent =
        'Criticidad estimada: ' + res.nivel + ' (' + puntos(res.puntaje) + ') ' +
        '[Cat ' + desglose.ptsCategoria + ' + Vía ' + desglose.ptsVia + ' + Franja ' + desglose.ptsFranja + ' (' + desglose.franja + ')]';
    }
  }

  /**
   * Sincroniza filtros, mapa, contadores y Top 5 del Resumen Operativo.
   */
  function refrescarTableroCompleto() {
    var totalEl = document.getElementById('header-total-badge');
    if (totalEl) {
      totalEl.textContent = ESTADO.reportesConsolidados.length + ' reportes activos';
    }

    var filtrados = global.Filtros.filtrarReportes(
      ESTADO.reportesConsolidados,
      ESTADO.filtros,
      ESTADO.vias,
      ESTADO.criterios
    );

    var contadores = global.Filtros.calcularContadores(filtrados);
    global.Filtros.renderizarContadores(contadores, ESTADO.reportesConsolidados.length);

    var top5 = global.Resumen.generarResumenOperativo(filtrados, ESTADO.vias);
    global.Resumen.renderizarResumenOperativo(
      top5,
      'top5-container',
      ESTADO.criterios,
      ESTADO.reportesConsolidados
    );

    if (global.MapaMovilidad && typeof global.MapaMovilidad.actualizarCapasMapa === 'function') {
      global.MapaMovilidad.actualizarCapasMapa(
        filtrados,
        ESTADO.vias,
        ESTADO.criterios,
        ESTADO.modoCapa
      );
    }
  }

  /**
   * Cambia entre la vista de Captura Rápida y el Tablero Operativo.
   * Llama obligatoriamente a map.invalidateSize() al abrir el tablero.
   * @param {'captura'|'tablero'} vista
   */
  function cambiarVista(vista) {
    var secCaptura = document.getElementById('vista-captura');
    var secTablero = document.getElementById('vista-tablero');
    var tabCaptura = document.getElementById('tab-captura');
    var tabTablero = document.getElementById('tab-tablero');

    var esTablero = vista === 'tablero';
    if (secCaptura) secCaptura.hidden = esTablero;
    if (secTablero) secTablero.hidden = !esTablero;

    if (tabCaptura) {
      tabCaptura.classList.toggle('active', !esTablero);
      tabCaptura.setAttribute('aria-selected', String(!esTablero));
    }
    if (tabTablero) {
      tabTablero.classList.toggle('active', esTablero);
      tabTablero.setAttribute('aria-selected', String(esTablero));
    }

    if (global.MapaMovilidad && typeof global.MapaMovilidad.refrescarTamanoMapa === 'function') {
      global.MapaMovilidad.refrescarTamanoMapa(vista);
    }
  }

  /**
   * Configura el botón GPS y la selección por clic en el mini-mapa.
   */
  function configurarGeolocalizacion() {
    var inputLat = document.getElementById('lat');
    var inputLng = document.getElementById('lng');
    var selectCuadra = document.getElementById('cuadra');
    var btnGps = document.getElementById('btn-gps');
    var gpsTexto = document.getElementById('gps-coordenadas-texto');
    var gpsEtiqueta = btnGps ? (btnGps.querySelector('span') || btnGps) : null;
    var bannerGpsId = document.getElementById('gps-estado') ? 'gps-estado' : 'captura-estado';

    function aplicarCoordenadas(lat, lng, origenTexto, viaSugerida) {
      if (inputLat) inputLat.value = lat.toFixed(6);
      if (inputLng) inputLng.value = lng.toFixed(6);
      if (gpsTexto) {
        mostrarMensaje(bannerGpsId, '', '');
        gpsTexto.textContent = origenTexto;
        gpsTexto.title = lat.toFixed(5) + ', ' + lng.toFixed(5);
      }
      if (viaSugerida && selectCuadra) {
        selectCuadra.value = viaSugerida.id;
        actualizarBadgeViaCaptura();
      }
    }

    var latDefault = ESTADO.vias[0] ? ESTADO.vias[0].lat : 11.2421;
    var lngDefault = ESTADO.vias[0] ? ESTADO.vias[0].lng : -74.2105;
    aplicarCoordenadas(latDefault, lngDefault, 'Punto inicial', ESTADO.vias[0]);

    if (global.MapaMovilidad && typeof global.MapaMovilidad.inicializarMiniMapa === 'function') {
      global.MapaMovilidad.inicializarMiniMapa(
        latDefault,
        lngDefault,
        ESTADO.vias,
        function (nuevaLat, nuevaLng, viaCercana) {
          aplicarCoordenadas(nuevaLat, nuevaLng, 'Pin ajustado en mapa', viaCercana);
        }
      );
    }

    if (selectCuadra) {
      selectCuadra.addEventListener('change', function () {
        actualizarBadgeViaCaptura();
        for (var i = 0; i < ESTADO.vias.length; i++) {
          if (ESTADO.vias[i].id === selectCuadra.value) {
            var v = ESTADO.vias[i];
            aplicarCoordenadas(v.lat, v.lng, 'Cuadra seleccionada', null);
            if (global.MapaMovilidad && typeof global.MapaMovilidad.actualizarPinMiniMapa === 'function') {
              global.MapaMovilidad.actualizarPinMiniMapa(v.lat, v.lng);
            }
            break;
          }
        }
      });
    }

    if (btnGps) {
      btnGps.addEventListener('click', function () {
        if (!navigator.geolocation) {
          mostrarMensaje(bannerGpsId, 'Tu navegador no soporta geolocalización GPS. Toca el mini-mapa.', 'warning');
          return;
        }
        btnGps.disabled = true;
        if (gpsEtiqueta) gpsEtiqueta.textContent = 'Buscando ubicación…';

        navigator.geolocation.getCurrentPosition(
          function (pos) {
            btnGps.disabled = false;
            if (gpsEtiqueta) gpsEtiqueta.textContent = 'Usar mi ubicación';
            var lat = pos.coords.latitude;
            var lng = pos.coords.longitude;
            var viaCercana = global.MapaMovilidad.encontrarCuadraMasCercana(lat, lng, ESTADO.vias);
            aplicarCoordenadas(lat, lng, 'GPS detectado', viaCercana);
            global.MapaMovilidad.actualizarPinMiniMapa(lat, lng);

            var fueraZona = lat < 11.2390 || lat > 11.2460 || lng < -74.2150 || lng > -74.2070;
            if (fueraZona) {
              mostrarMensaje(
                bannerGpsId,
                'Tu ubicación está fuera de la zona de estudio. Toca el mapa para ajustar el punto.',
                'warning'
              );
            } else {
              mostrarMensaje(bannerGpsId, 'Ubicación GPS fijada dentro de la zona de estudio.', 'ok');
            }
          },
          function () {
            btnGps.disabled = false;
            if (gpsEtiqueta) gpsEtiqueta.textContent = 'Usar mi ubicación';
            mostrarMensaje(bannerGpsId, 'No se pudo obtener permiso GPS. Toca directamente el mini-mapa para ubicar el pin.', 'warning');
          },
          { enableHighAccuracy: true, timeout: 7000 }
        );
      });
    }
  }

  // El editor trabaja sobre la vista previa; entrega el resultado mediante foto:pixelada.
  function configurarEditorPixelado(preview, info) {
    const verificacion = document.getElementById('foto-verificacion');
    const editor = document.getElementById('editor-pixelado');
    const canvas = document.getElementById('lienzo-pixelado');
    if (!preview || !editor || !canvas || !verificacion) return;

    const lista = document.getElementById('foto-pixelada-lista');
    const aceptar = document.getElementById('btn-foto-anonimizada');
    const abrir = document.getElementById('btn-abrir-pixelado');
    const fino = document.getElementById('pincel-fino');
    const grueso = document.getElementById('pincel-grueso');
    const deshacer = document.getElementById('btn-deshacer-pixelado');
    const aplicar = document.getElementById('btn-aplicar-pixelado');
    const ctx = canvas.getContext('2d');
    const bloque = 10;
    const pintados = new Set();
    const historial = [];
    let mosaico, columnas, puntero, anterior, trazo;
    let radio = 0;
    let version = 0;

    function elegirGrosor(amplio) {
      radio = amplio ? 2 : 0;
      fino.classList.toggle('active', !amplio);
      grueso.classList.toggle('active', amplio);
      fino.setAttribute('aria-pressed', String(!amplio));
      grueso.setAttribute('aria-pressed', String(amplio));
    }

    function terminarTrazo() {
      if (puntero == null) return;
      if (trazo.length) historial.push(trazo);
      const id = puntero;
      puntero = null;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      deshacer.disabled = aplicar.disabled = !historial.length;
    }

    function reiniciar(hayFoto) {
      version++;
      terminarTrazo();
      pintados.clear();
      historial.length = 0;
      mosaico = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      elegirGrosor(false);
      abrir.disabled = false;
      deshacer.disabled = aplicar.disabled = true;
      editor.hidden = lista.hidden = true;
      verificacion.hidden = !hayFoto;
    }

    aceptar.addEventListener('click', () => {
      verificacion.hidden = true;
      preview.dispatchEvent(new CustomEvent('foto:anonimizada', { bubbles: true }));
    });
    fino.addEventListener('click', () => elegirGrosor(false));
    grueso.addEventListener('click', () => elegirGrosor(true));
    abrir.addEventListener('click', async () => {
      const vigente = version;
      abrir.disabled = true;
      try {
        await preview.decode();
        if (vigente !== version || verificacion.hidden) return;
        canvas.width = preview.naturalWidth;
        canvas.height = preview.naturalHeight;
        ctx.drawImage(preview, 0, 0);

        // Un píxel de la miniatura aporta el color de cada celda del mosaico.
        mosaico = document.createElement('canvas');
        columnas = mosaico.width = Math.ceil(canvas.width / bloque);
        mosaico.height = Math.ceil(canvas.height / bloque);
        mosaico.getContext('2d').drawImage(preview, 0, 0, columnas, mosaico.height);
        ctx.imageSmoothingEnabled = false;
        verificacion.hidden = true;
        editor.hidden = false;
        fino.focus();
      } catch {
        if (vigente === version && info) info.textContent = 'No se pudo abrir la foto para editarla.';
      } finally {
        if (vigente === version) abrir.disabled = false;
      }
    });

    function pintar(x, y) {
      const cx = Math.floor(x / bloque), cy = Math.floor(y / bloque);
      for (let fila = Math.max(0, cy - radio); fila <= Math.min(mosaico.height - 1, cy + radio); fila++) {
        for (let col = Math.max(0, cx - radio); col <= Math.min(columnas - 1, cx + radio); col++) {
          const celda = fila * columnas + col;
          if (pintados.has(celda)) continue;
          ctx.drawImage(mosaico, col, fila, 1, 1, col * bloque, fila * bloque, bloque, bloque);
          pintados.add(celda);
          trazo.push(celda);
        }
      }
    }

    function dibujarHasta(e) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * canvas.width / rect.width;
      const y = (e.clientY - rect.top) * canvas.height / rect.height;
      const desde = anterior || { x, y };
      const dx = x - desde.x, dy = y - desde.y;
      const pasos = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (bloque / 2)));
      for (let i = 1; i <= pasos; i++) pintar(desde.x + dx * i / pasos, desde.y + dy * i / pasos);
      anterior = { x, y };
    }

    canvas.addEventListener('pointerdown', e => {
      if (puntero != null || e.button !== 0 || !mosaico) return;
      puntero = e.pointerId;
      anterior = null;
      trazo = [];
      canvas.setPointerCapture(puntero);
      deshacer.disabled = aplicar.disabled = true;
      dibujarHasta(e);
    });
    canvas.addEventListener('pointermove', e => { if (e.pointerId === puntero) dibujarHasta(e); });
    canvas.addEventListener('pointerup', e => {
      if (e.pointerId !== puntero) return;
      dibujarHasta(e);
      terminarTrazo();
    });
    for (const evento of ['pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(evento, e => { if (e.pointerId === puntero) terminarTrazo(); });
    }
    deshacer.addEventListener('click', () => {
      for (const celda of historial.pop()) {
        const x = (celda % columnas) * bloque, y = Math.floor(celda / columnas) * bloque;
        ctx.drawImage(preview, x, y, bloque, bloque, x, y, bloque, bloque);
        pintados.delete(celda);
      }
      deshacer.disabled = aplicar.disabled = !historial.length;
    });
    aplicar.addEventListener('click', () => {
      const dataUrl = canvas.toDataURL('image/jpeg', CALIDAD_JPEG);
      preview.src = dataUrl;
      reiniciar(false);
      lista.hidden = false;
      if (info) info.textContent = 'Vista previa editada. El reporte aún usa la foto adjunta.';
      preview.dispatchEvent(new CustomEvent('foto:pixelada', { bubbles: true, detail: { dataUrl } }));
    });
    return reiniciar;
  }

  /**
   * Configura el formulario de Captura Rápida y la compresión de fotografía en canvas.
   */
  function configurarFormularioCaptura() {
    var form = document.getElementById('form-captura');
    var inputFecha = document.getElementById('fecha_hora');
    var inputFoto = document.getElementById('foto');
    var previewFoto = document.getElementById('foto-preview');
    var infoFoto = document.getElementById('foto-info');
    var btnLimpiarFoto = document.getElementById('btn-quitar-foto');
    var zonaFoto = form ? form.querySelector('.foto-dropzone') : null;
    var confirmarQuitar = document.getElementById('confirmar-quitar');
    var cancelarQuitar = document.getElementById('cancelar-quitar');
    var btnConfirmarFoto = document.getElementById('confirmar-foto');
    var btnEnviar = document.getElementById('btn-enviar-reporte');
    var revisionFoto = 0;
    const reiniciarEditor = configurarEditorPixelado(previewFoto, infoFoto);

    if (btnEnviar) btnEnviar.disabled = false;

    function sincronizarLimiteFechaActual() {
      if (!inputFecha) return;
      inputFecha.max = formatearFechaHoraLocal(new Date());
      inputFecha.removeAttribute('min');
    }

    if (inputFecha) {
      inputFecha.value = formatearFechaHoraLocal(new Date());
      sincronizarLimiteFechaActual();

      inputFecha.addEventListener('focus', sincronizarLimiteFechaActual);
      inputFecha.addEventListener('change', function () {
        sincronizarLimiteFechaActual();
        var check = validarFechaIncidente(inputFecha.value);
        if (!check.valida) {
          mostrarMensaje('captura-estado', check.motivo, 'warning');
        } else {
          mostrarMensaje('captura-estado', '', '');
        }
        actualizarVistaPreviaCriticidad();
      });
    }

    var radios = document.querySelectorAll('input[name="categoria"]');
    for (var r = 0; r < radios.length; r++) {
      radios[r].addEventListener('change', actualizarVistaPreviaCriticidad);
    }

    function mostrarFoto(dataUrl) {
      ESTADO.fotoBase64Actual = dataUrl;
      ESTADO.fotoVerificada = !dataUrl || !document.getElementById('foto-verificacion');
      if (previewFoto) {
        if (dataUrl) previewFoto.src = dataUrl;
        else previewFoto.removeAttribute('src');
        previewFoto.hidden = !dataUrl;
      }
      if (reiniciarEditor) reiniciarEditor(Boolean(dataUrl));
      if (btnLimpiarFoto) btnLimpiarFoto.hidden = !dataUrl;
      if (confirmarQuitar) confirmarQuitar.hidden = true;
      if (inputFoto) inputFoto.value = '';
    }

    if (previewFoto) {
      previewFoto.addEventListener('foto:anonimizada', function () {
        if (!ESTADO.fotoBase64Actual) return;
        ESTADO.fotoVerificada = true;
        var kb = Math.round((ESTADO.fotoBase64Actual.length * 0.75) / 1024);
        if (infoFoto) {
          infoFoto.textContent = 'Foto confirmada como anonimizada (~' + kb + ' KB). Lista para guardar.';
        }
        mostrarMensaje('captura-estado', '', '');
      });

      previewFoto.addEventListener('foto:pixelada', function (e) {
        var dataUrl = e && e.detail && typeof e.detail.dataUrl === 'string' ? e.detail.dataUrl : '';
        if (!dataUrl) return;
        ESTADO.fotoBase64Actual = dataUrl;
        ESTADO.fotoVerificada = true;
        var kb = Math.round((dataUrl.length * 0.75) / 1024);
        if (infoFoto) {
          infoFoto.textContent = 'Foto pixelada lista para guardar (~' + kb + ' KB). Sin placas ni rostros visibles.';
        }
        mostrarMensaje('captura-estado', '', '');
      });
    }

    async function cargarFoto(archivo) {
      if (!archivo) return;
      var revision = ++revisionFoto;
      if (btnEnviar) btnEnviar.disabled = true;
      if (confirmarQuitar) confirmarQuitar.hidden = true;
      if (btnLimpiarFoto) btnLimpiarFoto.hidden = !ESTADO.fotoBase64Actual;
      if (infoFoto) infoFoto.textContent = 'Preparando la foto…';
      try {
        var foto = await comprimirImagenCanvas(archivo);
        if (revision !== revisionFoto) return;
        mostrarFoto(foto.dataUrl);
        if (infoFoto) {
          infoFoto.textContent =
            'Foto lista (' + foto.ancho + 'x' + foto.alto + ' px, ~' + foto.kb + ' KB). Recuerda evitar o difuminar placas y rostros.';
        }
      } catch (err) {
        if (revision !== revisionFoto) return;
        if (inputFoto) inputFoto.value = '';
        if (infoFoto) {
          infoFoto.textContent = ESTADO.fotoBase64Actual
            ? 'No se pudo abrir esa imagen. Se conserva la foto anterior.'
            : 'No se pudo abrir esa imagen. Prueba con otra foto.';
        }
      } finally {
        if (revision === revisionFoto && btnEnviar) btnEnviar.disabled = false;
      }
    }

    if (inputFoto) {
      inputFoto.addEventListener('change', function () {
        if (inputFoto.files && inputFoto.files[0]) {
          cargarFoto(inputFoto.files[0]);
        }
      });
    }

    if (zonaFoto) {
      zonaFoto.addEventListener('dragover', function (e) {
        e.preventDefault();
        zonaFoto.classList.add('dragging');
      });
      zonaFoto.addEventListener('dragleave', function (e) {
        if (!zonaFoto.contains(e.relatedTarget)) zonaFoto.classList.remove('dragging');
      });
      zonaFoto.addEventListener('drop', function (e) {
        e.preventDefault();
        zonaFoto.classList.remove('dragging');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          cargarFoto(e.dataTransfer.files[0]);
        }
      });
    }

    if (btnLimpiarFoto) {
      btnLimpiarFoto.addEventListener('click', function () {
        if (confirmarQuitar && cancelarQuitar && btnConfirmarFoto) {
          btnLimpiarFoto.hidden = true;
          confirmarQuitar.hidden = false;
          cancelarQuitar.focus();
        } else {
          ++revisionFoto;
          mostrarFoto('');
          if (infoFoto) infoFoto.textContent = 'Foto retirada.';
          if (btnEnviar) btnEnviar.disabled = false;
        }
      });
    }

    if (cancelarQuitar) {
      cancelarQuitar.addEventListener('click', function () {
        if (confirmarQuitar) confirmarQuitar.hidden = true;
        if (btnLimpiarFoto) {
          btnLimpiarFoto.hidden = false;
          btnLimpiarFoto.focus();
        }
      });
    }

    if (btnConfirmarFoto) {
      btnConfirmarFoto.addEventListener('click', function () {
        ++revisionFoto;
        mostrarFoto('');
        if (infoFoto) infoFoto.textContent = 'Foto retirada.';
        var revisionRetirada = revisionFoto;
        setTimeout(function () {
          if (revisionFoto === revisionRetirada && infoFoto) infoFoto.textContent = '';
        }, 3000);
        if (btnEnviar) btnEnviar.disabled = false;
        if (inputFoto) inputFoto.focus();
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (btnEnviar && btnEnviar.disabled) return;

        var lat = parseFloat((document.getElementById('lat') || {}).value);
        var lng = parseFloat((document.getElementById('lng') || {}).value);
        var cuadra = (document.getElementById('cuadra') || {}).value;
        var categoriaEl = document.querySelector('input[name="categoria"]:checked');
        var actorEl = document.querySelector('input[name="actor"]:checked');
        var fechaHora = inputFecha && inputFecha.value ? inputFecha.value : formatearFechaHoraLocal(new Date());

        if (isNaN(lat) || isNaN(lng) || !cuadra || !categoriaEl || !actorEl) {
          mostrarMensaje('captura-estado', 'Completa ubicación, cuadra, categoría y actor para registrar.', 'error');
          return;
        }

        sincronizarLimiteFechaActual();
        var validacionFecha = validarFechaIncidente(fechaHora);
        if (!validacionFecha.valida) {
          mostrarMensaje('captura-estado', validacionFecha.motivo, 'error');
          if (inputFecha) inputFecha.focus();
          return;
        }

        if (ESTADO.fotoBase64Actual && !ESTADO.fotoVerificada) {
          var editorEl = document.getElementById('editor-pixelado');
          var btnAceptarFoto = document.getElementById('btn-foto-anonimizada');
          var btnAplicarPix = document.getElementById('btn-aplicar-pixelado');
          if (editorEl && !editorEl.hidden) {
            mostrarMensaje(
              'captura-estado',
              'Termina de pixelar la foto y pulsa "Listo" antes de registrar el reporte.',
              'warning'
            );
            if (btnAplicarPix && !btnAplicarPix.disabled) btnAplicarPix.focus();
          } else {
            mostrarMensaje(
              'captura-estado',
              'Confirma si la foto ya está anonimizada o pixélala antes de registrar el reporte (Ley 1581 de 2012).',
              'warning'
            );
            if (btnAceptarFoto) btnAceptarFoto.focus();
          }
          return;
        }

        var nuevoReporte = {
          id: generarIdLocal(),
          origen: 'ciudadano',
          fecha_hora: fechaHora,
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
          cuadra: cuadra,
          categoria: categoriaEl.value,
          actor: actorEl.value,
          foto: ESTADO.fotoBase64Actual || ''
        };

        if (esReporteDuplicado(nuevoReporte, ESTADO.reportesConsolidados)) {
          mostrarMensaje(
            'captura-estado',
            'Ya existe un reporte idéntico con estos mismos datos y hora. Cambia algún campo (ubicación, cuadra, categoría, actor o fecha/hora) si es un incidente distinto.',
            'warning'
          );
          return;
        }

        nuevoReporte.criticidad = global.Criticidad.calcularCriticidad(
          nuevoReporte,
          ESTADO.vias,
          ESTADO.criterios
        );

        ESTADO.reportesLocales.push(nuevoReporte);
        if (!guardarLocalStorage(ESTADO.reportesLocales, 'captura-estado')) {
          ESTADO.reportesLocales.pop();
          return;
        }

        ESTADO.reportesConsolidados = fusionarYRecalcular(ESTADO.reportesSemilla, ESTADO.reportesLocales);
        refrescarTableroCompleto();

        mostrarFoto('');
        if (infoFoto) infoFoto.textContent = '';
        if (inputFecha) {
          inputFecha.value = formatearFechaHoraLocal(new Date());
          sincronizarLimiteFechaActual();
        }
        actualizarVistaPreviaCriticidad();

        mostrarMensaje(
          'captura-estado',
          'Reporte ' + nuevoReporte.id + ' guardado. Nivel ' + nuevoReporte.criticidad.nivel.toLowerCase() + ' · ' + puntos(nuevoReporte.criticidad.puntaje) + '.',
          'ok'
        );
      });
    }
  }

  /**
   * Configura filtros del tablero, controles de capa del mapa e impresión.
   */
  function configurarTablero() {
    var mapaIds = {
      'filtro-sector': 'sector',
      'filtro-cuadra': 'cuadra',
      'filtro-franja': 'franja',
      'filtro-categoria': 'categoria',
      'filtro-actor': 'actor'
    };

    Object.keys(mapaIds).forEach(function (idDom) {
      var el = document.getElementById(idDom);
      if (!el) return;
      el.addEventListener('change', function () {
        var claveFiltro = mapaIds[idDom];
        ESTADO.filtros[claveFiltro] = el.value;
        if (claveFiltro === 'sector') {
          actualizarOpcionesCuadraFiltro(el.value);
        }
        refrescarTableroCompleto();
      });
    });

    var btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros');
    if (btnLimpiarFiltros) {
      btnLimpiarFiltros.addEventListener('click', function () {
        ESTADO.filtros = {
          sector: 'todos',
          cuadra: 'todas',
          franja: 'todas',
          categoria: 'todas',
          actor: 'todos'
        };
        var elSector = document.getElementById('filtro-sector');
        var elCuadra = document.getElementById('filtro-cuadra');
        var elFranja = document.getElementById('filtro-franja');
        var elCategoria = document.getElementById('filtro-categoria');
        var elActor = document.getElementById('filtro-actor');
        if (elSector) elSector.value = 'todos';
        actualizarOpcionesCuadraFiltro('todos');
        if (elCuadra) elCuadra.value = 'todas';
        if (elFranja) elFranja.value = 'todas';
        if (elCategoria) elCategoria.value = 'todas';
        if (elActor) elActor.value = 'todos';
        refrescarTableroCompleto();
      });
    }

    var botonesCapa = document.querySelectorAll('[data-modo-capa]');
    for (var i = 0; i < botonesCapa.length; i++) {
      botonesCapa[i].addEventListener('click', function (ev) {
        var modo = ev.currentTarget.getAttribute('data-modo-capa');
        ESTADO.modoCapa = modo;
        for (var j = 0; j < botonesCapa.length; j++) {
          var activo = botonesCapa[j] === ev.currentTarget;
          botonesCapa[j].classList.toggle('active', activo);
          botonesCapa[j].setAttribute('aria-pressed', String(activo));
        }
        var filtrados = global.Filtros.filtrarReportes(
          ESTADO.reportesConsolidados,
          ESTADO.filtros,
          ESTADO.vias,
          ESTADO.criterios
        );
        if (global.MapaMovilidad && typeof global.MapaMovilidad.actualizarCapasMapa === 'function') {
          global.MapaMovilidad.actualizarCapasMapa(filtrados, ESTADO.vias, ESTADO.criterios, modo);
        }
      });
    }

    if (typeof global.addEventListener === 'function') {
      global.addEventListener('beforeprint', function () {
        var printFiltros = document.getElementById('print-filtros');
        if (!printFiltros) return;
        var seleccion = Object.keys(mapaIds).map(function (id) {
          var campo = document.getElementById(id);
          if (!campo || campo.selectedIndex <= 0 || !campo.selectedOptions || !campo.selectedOptions[0]) {
            return '';
          }
          return campo.selectedOptions[0].textContent;
        }).filter(Boolean);
        printFiltros.textContent = seleccion.length
          ? 'Filtros aplicados · ' + seleccion.join(' · ')
          : 'Todos los reportes';
      });
    }

    var btnImprimir = document.getElementById('btn-imprimir');
    if (btnImprimir) {
      btnImprimir.addEventListener('click', function () {
        global.print();
      });
    }
  }

  /**
   * Configura RF-06: Exportar reportes a JSON e Importar múltiples archivos JSON
   * comparando estrictamente por reporte.id para evitar duplicados (CU-04).
   */
  function configurarExportarImportar() {
    var btnExportar = document.getElementById('btn-exportar-json');
    var inputImportar = document.getElementById('input-importar-json');

    if (btnExportar) {
      btnExportar.addEventListener('click', function () {
        var datosExportar = ESTADO.reportesConsolidados;
        var jsonStr = JSON.stringify(datosExportar, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);

        var a = document.createElement('a');
        a.href = url;
        a.download = 'reportes-santa-marta-' + formatearFechaHoraLocal(new Date()).replace(':', '') + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        mostrarMensaje(
          'io-estado',
          'Exportados ' + datosExportar.length + ' reportes en formato JSON.',
          'ok'
        );
      });
    }

    if (inputImportar) {
      inputImportar.addEventListener('change', function () {
        var archivos = inputImportar.files;
        if (!archivos || archivos.length === 0) return;

        var promesas = [];
        for (var i = 0; i < archivos.length; i++) {
          promesas.push(archivos[i].text());
        }

        Promise.all(promesas)
          .then(function (contenidos) {
            var idsExistentes = new Set(ESTADO.reportesConsolidados.map(function (rep) { return rep.id; }));
            var nuevos = [];
            var duplicadosOmitidos = 0;
            var invalidosOmitidos = 0;
            var ahoraImportacion = new Date();

            for (var c = 0; c < contenidos.length; c++) {
              var parsed;
              try {
                parsed = JSON.parse(contenidos[c]);
              } catch (err) {
                invalidosOmitidos += 1;
                continue;
              }

              var lista = Array.isArray(parsed)
                ? parsed
                : parsed && Array.isArray(parsed.reportes)
                  ? parsed.reportes
                  : [];

              for (var r = 0; r < lista.length; r++) {
                var rep = lista[r];
                if (!rep || !rep.id || !rep.cuadra || !rep.categoria || !rep.actor || !rep.fecha_hora) {
                  invalidosOmitidos += 1;
                  continue;
                }

                if (!validarFechaIncidente(rep.fecha_hora, ahoraImportacion).valida) {
                  invalidosOmitidos += 1;
                  continue;
                }

                // Comparación estricta por reporte.id para impedir duplicados
                if (idsExistentes.has(rep.id)) {
                  duplicadosOmitidos += 1;
                  continue;
                }

                idsExistentes.add(rep.id);
                var copia = Object.assign({}, rep);
                copia.criticidad = global.Criticidad.calcularCriticidad(
                  copia,
                  ESTADO.vias,
                  ESTADO.criterios
                );
                nuevos.push(copia);
              }
            }

            if (nuevos.length) {
              var locales = ESTADO.reportesLocales.concat(nuevos);
              inputImportar.value = '';
              if (!guardarLocalStorage(locales, 'io-estado')) return;
              ESTADO.reportesLocales = locales;
              ESTADO.reportesConsolidados = fusionarYRecalcular(
                ESTADO.reportesSemilla,
                ESTADO.reportesLocales
              );
              refrescarTableroCompleto();
            }

            mostrarMensaje(
              'io-estado',
              'Importación completada: ' +
                nuevos.length +
                ' registros nuevos agregados, ' +
                duplicadosOmitidos +
                ' duplicados omitidos' +
                (invalidosOmitidos > 0 ? ', ' + invalidosOmitidos + ' inválidos.' : '.'),
              nuevos.length > 0 ? 'ok' : 'warning'
            );
            inputImportar.value = '';
          })
          .catch(function (err) {
            mostrarMensaje('io-estado', 'Error al leer los archivos JSON: ' + err.message, 'error');
            inputImportar.value = '';
          });
      });
    }
  }

  /**
   * Inicialización general al cargar el documento.
   */
  function iniciarAplicacion() {
    var tabCaptura = document.getElementById('tab-captura');
    var tabTablero = document.getElementById('tab-tablero');
    var btnIrTablero = document.getElementById('btn-ir-tablero');

    if (tabCaptura) {
      tabCaptura.addEventListener('click', function () {
        cambiarVista('captura');
      });
    }
    if (tabTablero) {
      tabTablero.addEventListener('click', function () {
        cambiarVista('tablero');
      });
    }
    if (btnIrTablero) {
      btnIrTablero.addEventListener('click', function () {
        cambiarVista('tablero');
      });
    }

    // Rutas estrictamente relativas sin '/' inicial para compatibilidad total con GitHub Pages
    Promise.all([
      fetch('datos/criterios.json', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('Error cargando datos/criterios.json');
        return r.json();
      }),
      fetch('datos/vias.json', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('Error cargando datos/vias.json');
        return r.json();
      }),
      fetch('datos/reportes.json', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('Error cargando datos/reportes.json');
        return r.json();
      })
    ])
      .then(function (datos) {
        ESTADO.criterios = datos[0];
        ESTADO.vias = datos[1];
        ESTADO.reportesSemilla = datos[2];
        ESTADO.reportesLocales = leerLocalStorage();

        // Recalcula todos los reportes precargados y locales al iniciar
        ESTADO.reportesConsolidados = fusionarYRecalcular(
          ESTADO.reportesSemilla,
          ESTADO.reportesLocales
        );

        poblarSelectoresVias();
        configurarGeolocalizacion();
        configurarFormularioCaptura();
        configurarTablero();
        configurarExportarImportar();
        refrescarTableroCompleto();
      })
      .catch(function (err) {
        console.error(err);
        mostrarMensaje(
          'captura-estado',
          'No se pudieron cargar los datos de la zona. Comprueba la conexión y vuelve a cargar la página.',
          'error'
        );
      });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', iniciarAplicacion);
  }

  global.AppMovilidad = {
    ESTADO: ESTADO,
    comprimirImagenCanvas: comprimirImagenCanvas,
    fusionarYRecalcular: fusionarYRecalcular,
    cambiarVista: cambiarVista,
    parsearFechaLocal: parsearFechaLocal,
    validarFechaIncidente: validarFechaIncidente,
    generarIdLocal: generarIdLocal,
    esReporteDuplicado: esReporteDuplicado
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.AppMovilidad;
  }
})(typeof window !== 'undefined' ? window : globalThis);

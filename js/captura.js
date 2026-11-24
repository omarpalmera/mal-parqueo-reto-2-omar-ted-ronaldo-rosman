/**
 * js/captura.js
 * Controlador principal de la aplicación:
 * - Carga de datos JSON por rutas relativas (compatibles con GitHub Pages).
 * - Recálculo dinámico de criticidad al iniciar (si cambia criterios.json, todo se actualiza).
 * - Captura rápida en < 30 segundos con compresión de foto en <canvas> a maxWidth = 800 px.
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
        'Error al guardar en el navegador (límite ~5 MB alcanzado): ' + err.message,
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
    var vistos = {};
    var resultado = [];

    function procesarLista(lista) {
      if (!Array.isArray(lista)) return;
      for (var i = 0; i < lista.length; i++) {
        var item = lista[i];
        if (!item || !item.id || vistos[item.id]) continue;
        vistos[item.id] = true;

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

          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, ancho, alto);

          var dataUrl = canvas.toDataURL('image/jpeg', CALIDAD_JPEG);
          var kb = Math.round((dataUrl.length * 0.75) / 1024);
          resolve({ dataUrl: dataUrl, ancho: ancho, alto: alto, kb: kb });
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
   * Pobla dinámicamente los selectores de cuadra y sector desde datos/vias.json.
   */
  function poblarSelectoresVias() {
    var selectCuadraCaptura = document.getElementById('cuadra');
    var selectCuadraFiltro = document.getElementById('filtro-cuadra');
    var selectSectorFiltro = document.getElementById('filtro-sector');

    if (selectCuadraCaptura) {
      selectCuadraCaptura.innerHTML = '';
      for (var i = 0; i < ESTADO.vias.length; i++) {
        var v = ESTADO.vias[i];
        var opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.nombre + ' (' + v.tipo_via.toUpperCase() + ')';
        selectCuadraCaptura.appendChild(opt);
      }
    }

    if (selectCuadraFiltro) {
      selectCuadraFiltro.innerHTML = '<option value="todas">Todas las cuadras</option>';
      for (var j = 0; j < ESTADO.vias.length; j++) {
        var vf = ESTADO.vias[j];
        var optF = document.createElement('option');
        optF.value = vf.id;
        optF.textContent = vf.id + ' · ' + vf.nombre;
        selectCuadraFiltro.appendChild(optF);
      }
    }

    if (selectSectorFiltro) {
      var sectores = [];
      for (var k = 0; k < ESTADO.vias.length; k++) {
        var sec = ESTADO.vias[k].sector;
        if (sec && sectores.indexOf(sec) === -1) sectores.push(sec);
      }
      selectSectorFiltro.innerHTML = '<option value="todos">Todos los sectores</option>';
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

    elPreview.innerHTML =
      'Criticidad estimada: <span class="pill-nivel pill-' + res.nivel.toLowerCase() + '">' +
      res.nivel + ' (' + res.puntaje + ' pts)</span> ' +
      '<small>[Cat ' + res.desglose.ptsCategoria + ' + Vía ' + res.desglose.ptsVia + ' + Franja ' + res.desglose.ptsFranja + ' (' + res.desglose.franja + ')]</small>';
  }

  /**
   * Sincroniza filtros, mapa, contadores y Top 5 del Resumen Operativo.
   */
  function refrescarTableroCompleto() {
    var totalEl = document.getElementById('header-total-badge');
    if (totalEl) {
      totalEl.textContent = ESTADO.reportesConsolidados.length + ' reportes';
    }

    var filtrados = global.Filtros.filtrarReportes(
      ESTADO.reportesConsolidados,
      ESTADO.filtros,
      ESTADO.vias
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

    global.MapaMovilidad.actualizarCapasMapa(
      filtrados,
      ESTADO.vias,
      ESTADO.criterios,
      ESTADO.modoCapa
    );
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

    global.MapaMovilidad.refrescarTamanoMapa(vista);
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

    function aplicarCoordenadas(lat, lng, origenTexto, viaSugerida) {
      if (inputLat) inputLat.value = lat.toFixed(6);
      if (inputLng) inputLng.value = lng.toFixed(6);
      if (gpsTexto) {
        gpsTexto.textContent = origenTexto + ': ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
      }
      if (viaSugerida && selectCuadra) {
        selectCuadra.value = viaSugerida.id;
        actualizarBadgeViaCaptura();
      }
    }

    var latDefault = ESTADO.vias[0] ? ESTADO.vias[0].lat : 11.2421;
    var lngDefault = ESTADO.vias[0] ? ESTADO.vias[0].lng : -74.2105;
    aplicarCoordenadas(latDefault, lngDefault, 'Punto inicial (Centro / Cra 5)', ESTADO.vias[0]);

    global.MapaMovilidad.inicializarMiniMapa(
      latDefault,
      lngDefault,
      ESTADO.vias,
      function (nuevaLat, nuevaLng, viaCercana) {
        aplicarCoordenadas(nuevaLat, nuevaLng, 'Pin ajustado en mapa', viaCercana);
      }
    );

    if (selectCuadra) {
      selectCuadra.addEventListener('change', function () {
        actualizarBadgeViaCaptura();
        for (var i = 0; i < ESTADO.vias.length; i++) {
          if (ESTADO.vias[i].id === selectCuadra.value) {
            var v = ESTADO.vias[i];
            aplicarCoordenadas(v.lat, v.lng, 'Cuadra seleccionada', null);
            global.MapaMovilidad.actualizarPinMiniMapa(v.lat, v.lng);
            break;
          }
        }
      });
    }

    if (btnGps) {
      btnGps.addEventListener('click', function () {
        if (!navigator.geolocation) {
          mostrarMensaje('captura-estado', 'Tu navegador no soporta geolocalización GPS. Toca el mini-mapa.', 'warning');
          return;
        }
        btnGps.disabled = true;
        btnGps.textContent = 'Obteniendo GPS...';

        navigator.geolocation.getCurrentPosition(
          function (pos) {
            btnGps.disabled = false;
            btnGps.textContent = 'Usar mi ubicación GPS';
            var lat = pos.coords.latitude;
            var lng = pos.coords.longitude;
            var viaCercana = global.MapaMovilidad.encontrarCuadraMasCercana(lat, lng, ESTADO.vias);
            aplicarCoordenadas(lat, lng, 'GPS detectado', viaCercana);
            global.MapaMovilidad.actualizarPinMiniMapa(lat, lng);

            var fueraZona = lat < 11.2390 || lat > 11.2460 || lng < -74.2150 || lng > -74.2070;
            if (fueraZona) {
              mostrarMensaje(
                'captura-estado',
                'Tu GPS está fuera del polígono Centro Histórico / Campo Serrano. Puedes ajustar el pin tocando el mini-mapa.',
                'warning'
              );
            } else {
              mostrarMensaje('captura-estado', 'Ubicación GPS fijada dentro de la zona de estudio.', 'ok');
            }
          },
          function () {
            btnGps.disabled = false;
            btnGps.textContent = 'Usar mi ubicación GPS';
            mostrarMensaje('captura-estado', 'No se pudo obtener permiso GPS. Toca directamente el mini-mapa para ubicar el pin.', 'warning');
          },
          { enableHighAccuracy: true, timeout: 7000 }
        );
      });
    }
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

    if (inputFecha) {
      inputFecha.value = formatearFechaHoraLocal(new Date());
      inputFecha.addEventListener('change', actualizarVistaPreviaCriticidad);
    }

    var radios = document.querySelectorAll('input[name="categoria"]');
    for (var r = 0; r < radios.length; r++) {
      radios[r].addEventListener('change', actualizarVistaPreviaCriticidad);
    }

    if (inputFoto) {
      inputFoto.addEventListener('change', function () {
        var archivo = inputFoto.files && inputFoto.files[0];
        if (!archivo) return;

        if (infoFoto) infoFoto.textContent = 'Comprimiendo foto a máximo 800 px...';
        comprimirImagenCanvas(archivo)
          .then(function (res) {
            ESTADO.fotoBase64Actual = res.dataUrl;
            if (previewFoto) {
              previewFoto.src = res.dataUrl;
              previewFoto.hidden = false;
            }
            if (btnLimpiarFoto) btnLimpiarFoto.hidden = false;
            if (infoFoto) {
              infoFoto.textContent =
                'Foto lista y comprimida (' + res.ancho + 'x' + res.alto + ' px, ~' + res.kb + ' KB). Sin placas ni rostros.';
            }
          })
          .catch(function (err) {
            ESTADO.fotoBase64Actual = '';
            mostrarMensaje('captura-estado', err.message, 'error');
          });
      });
    }

    if (btnLimpiarFoto) {
      btnLimpiarFoto.addEventListener('click', function () {
        ESTADO.fotoBase64Actual = '';
        if (inputFoto) inputFoto.value = '';
        if (previewFoto) {
          previewFoto.src = '';
          previewFoto.hidden = true;
        }
        if (infoFoto) infoFoto.textContent = 'Opcional. Se redimensiona automáticamente a máx. 800 px.';
        btnLimpiarFoto.hidden = true;
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();

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

        var nuevoReporte = {
          id: 'MP-LOCAL-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 10),
          origen: 'ciudadano',
          fecha_hora: fechaHora,
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
          cuadra: cuadra,
          categoria: categoriaEl.value,
          actor: actorEl.value,
          foto: ESTADO.fotoBase64Actual || ''
        };

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

        // Reiniciar foto y actualizar hora para el siguiente reporte rápido
        ESTADO.fotoBase64Actual = '';
        if (inputFoto) inputFoto.value = '';
        if (previewFoto) {
          previewFoto.src = '';
          previewFoto.hidden = true;
        }
        if (btnLimpiarFoto) btnLimpiarFoto.hidden = true;
        if (infoFoto) infoFoto.textContent = 'Opcional. Se redimensiona automáticamente a máx. 800 px.';
        if (inputFecha) inputFecha.value = formatearFechaHoraLocal(new Date());
        actualizarVistaPreviaCriticidad();

        mostrarMensaje(
          'captura-estado',
          'Reporte ' + nuevoReporte.id + ' guardado (' + nuevoReporte.criticidad.nivel + ', ' + nuevoReporte.criticidad.puntaje + ' pts). Ya aparece en el mapa.',
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
        ESTADO.filtros[mapaIds[idDom]] = el.value;
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
        document.getElementById('filtro-sector').value = 'todos';
        document.getElementById('filtro-cuadra').value = 'todas';
        document.getElementById('filtro-franja').value = 'todas';
        document.getElementById('filtro-categoria').value = 'todas';
        document.getElementById('filtro-actor').value = 'todos';
        refrescarTableroCompleto();
      });
    }

    var botonesCapa = document.querySelectorAll('[data-modo-capa]');
    for (var i = 0; i < botonesCapa.length; i++) {
      botonesCapa[i].addEventListener('click', function (ev) {
        var modo = ev.currentTarget.getAttribute('data-modo-capa');
        ESTADO.modoCapa = modo;
        for (var j = 0; j < botonesCapa.length; j++) {
          botonesCapa[j].classList.toggle('active', botonesCapa[j] === ev.currentTarget);
        }
        refrescarTableroCompleto();
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
            var idsExistentes = {};
            for (var e = 0; e < ESTADO.reportesConsolidados.length; e++) {
              idsExistentes[ESTADO.reportesConsolidados[e].id] = true;
            }

            var nuevosAgregados = 0;
            var duplicadosOmitidos = 0;
            var invalidosOmitidos = 0;

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

                // Comparación estricta por reporte.id para impedir duplicados
                if (idsExistentes[rep.id]) {
                  duplicadosOmitidos += 1;
                  continue;
                }

                idsExistentes[rep.id] = true;
                var copia = Object.assign({}, rep);
                copia.criticidad = global.Criticidad.calcularCriticidad(
                  copia,
                  ESTADO.vias,
                  ESTADO.criterios
                );
                ESTADO.reportesLocales.push(copia);
                nuevosAgregados += 1;
              }
            }

            if (nuevosAgregados > 0) {
              if (!guardarLocalStorage(ESTADO.reportesLocales, 'io-estado')) return;
              ESTADO.reportesConsolidados = fusionarYRecalcular(
                ESTADO.reportesSemilla,
                ESTADO.reportesLocales
              );
              refrescarTableroCompleto();
            }

            mostrarMensaje(
              'io-estado',
              'Importación completada: ' +
                nuevosAgregados +
                ' registros nuevos agregados, ' +
                duplicadosOmitidos +
                ' duplicados omitidos' +
                (invalidosOmitidos > 0 ? ', ' + invalidosOmitidos + ' inválidos.' : '.'),
              nuevosAgregados > 0 ? 'ok' : 'warning'
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
        global.MapaMovilidad.inicializarMapaOperativo();
        refrescarTableroCompleto();
      })
      .catch(function (err) {
        console.error(err);
        mostrarMensaje(
          'captura-estado',
          'No se pudieron cargar los datos JSON iniciales. Ejecuta la app mediante Live Server o GitHub Pages.',
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
    cambiarVista: cambiarVista
  };
})(typeof window !== 'undefined' ? window : globalThis);

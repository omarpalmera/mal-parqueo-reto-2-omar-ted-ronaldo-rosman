/**
 * js/mapa.js
 * Gestión del mapa operativo con Leaflet + Leaflet.heat (RF-03) y del mini-mapa
 * de ubicación rápida en Santa Marta (RF-01).
 */

(function (global) {
  'use strict';

  var CENTRO_SANTA_MARTA = [11.2421, -74.2105];
  var ZOOM_INICIAL = 16;

  var mapOperativo = null;
  var capaPuntos = null;
  var capaCalor = null;
  var ultimoEstadoCapas = {
    reportes: [],
    viasData: [],
    criteriosData: null,
    modo: 'ambas'
  };

  var miniMap = null;
  var miniMarker = null;

  var COLORES_NIVEL = {
    Alto: '#dc2626',
    Medio: '#f59e0b',
    Bajo: '#16a34a'
  };

  var ETIQUETAS_CAT = {
    doble_fila: 'Doble fila / vía prohibida',
    bloqueo_rampa_cebra_paradero: 'Bloqueo rampa, cebra o paradero',
    invasion_anden: 'Invasión de andén'
  };

  var ETIQUETAS_ACT = {
    vehiculo_particular: 'Vehículo particular',
    motocicleta: 'Motocicleta',
    vehiculo_carga: 'Vehículo de carga descargando',
    mobiliario_comercial: 'Mobiliario comercial'
  };

  /**
   * Calcula el puntaje máximo teórico posible desde criteriosData para normalizar
   * correctamente la intensidad de Leaflet.heat aunque se modifiquen los pesos.
   * @param {Object} criteriosData
   * @returns {number}
   */
  function calcularMaximoTeorico(criteriosData) {
    if (!criteriosData) return 9;
    var maxCat = Math.max.apply(null, Object.values(criteriosData.categoria || { x: 3 }));
    var maxVia = Math.max.apply(null, Object.values(criteriosData.via || { x: 3 }));
    var maxFranja = Math.max.apply(null, Object.values(criteriosData.franja || { x: 3 }));
    var suma = maxCat + maxVia + maxFranja;
    return suma > 0 ? suma : 9;
  }

  /**
   * Resuelve una ruta de foto para evitar enlaces rotos si viene como "fotos/...".
   * Nunca antepone "/" para mantener compatibilidad con GitHub Pages.
   * @param {string} rutaFoto
   * @returns {string}
   */
  function resolverRutaFoto(rutaFoto) {
    if (!rutaFoto || typeof rutaFoto !== 'string') return '';
    if (rutaFoto.indexOf('data:image/') === 0) return rutaFoto;
    if (rutaFoto.indexOf('datos/') === 0) return rutaFoto;
    if (rutaFoto.indexOf('fotos/') === 0) return 'datos/' + rutaFoto;
    return rutaFoto.replace(/^\/+/, '');
  }

  /**
   * Encuentra la cuadra de viasData más cercana a unas coordenadas dadas.
   * @param {number} lat
   * @param {number} lng
   * @param {Array} viasData
   * @returns {Object|null}
   */
  function encontrarCuadraMasCercana(lat, lng, viasData) {
    if (!Array.isArray(viasData) || viasData.length === 0) return null;
    var mejor = viasData[0];
    var menorDist = Infinity;
    for (var i = 0; i < viasData.length; i++) {
      var v = viasData[i];
      var dLat = lat - Number(v.lat);
      var dLng = lng - Number(v.lng);
      var dist2 = dLat * dLat + dLng * dLng;
      if (dist2 < menorDist) {
        menorDist = dist2;
        mejor = v;
      }
    }
    return mejor;
  }

  /**
   * Inicializa el mini-mapa interactivo en la pestaña de Captura Rápida.
   * @param {number} latInicial
   * @param {number} lngInicial
   * @param {Array} viasData
   * @param {Function} onUbicacionCambiada - Callback (lat, lng, viaSugerida)
   */
  function inicializarMiniMapa(latInicial, lngInicial, viasData, onUbicacionCambiada) {
    if (typeof L === 'undefined' || !document.getElementById('mini-map')) return;
    if (miniMap) return;

    var lat = typeof latInicial === 'number' ? latInicial : CENTRO_SANTA_MARTA[0];
    var lng = typeof lngInicial === 'number' ? lngInicial : CENTRO_SANTA_MARTA[1];

    miniMap = L.map('mini-map', {
      center: [lat, lng],
      zoom: 17,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(miniMap);

    miniMarker = L.marker([lat, lng], { draggable: true }).addTo(miniMap);

    function notificar(nuevaLat, nuevaLng) {
      var viaSugerida = encontrarCuadraMasCercana(nuevaLat, nuevaLng, viasData);
      if (typeof onUbicacionCambiada === 'function') {
        onUbicacionCambiada(nuevaLat, nuevaLng, viaSugerida);
      }
    }

    miniMap.on('click', function (e) {
      miniMarker.setLatLng(e.latlng);
      notificar(e.latlng.lat, e.latlng.lng);
    });

    miniMarker.on('dragend', function () {
      var pos = miniMarker.getLatLng();
      notificar(pos.lat, pos.lng);
    });
  }

  /**
   * Mueve el pin del mini-mapa programáticamente (p. ej. al obtener GPS o cambiar de cuadra).
   * @param {number} lat
   * @param {number} lng
   */
  function actualizarPinMiniMapa(lat, lng) {
    if (!miniMap || !miniMarker) return;
    var ll = L.latLng(lat, lng);
    miniMarker.setLatLng(ll);
    miniMap.panTo(ll);
  }

  /**
   * Inicializa el mapa principal del Tablero Operativo (#map).
   */
  function inicializarMapaOperativo() {
    if (typeof L === 'undefined' || !document.getElementById('map')) return null;
    if (mapOperativo) return mapOperativo;

    mapOperativo = L.map('map', {
      center: [11.2413, -74.2112],
      zoom: ZOOM_INICIAL
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapOperativo);

    capaPuntos = L.layerGroup().addTo(mapOperativo);
    return mapOperativo;
  }

  /**
   * Construye el HTML del popup de cada reporte individual.
   */
  function construirPopupHTML(rep, viaInfo) {
    var d = rep.criticidad && rep.criticidad.desglose ? rep.criticidad.desglose : {};
    var puntaje = rep.criticidad ? rep.criticidad.puntaje : 0;
    var nivel = rep.criticidad ? rep.criticidad.nivel : 'Bajo';
    var nombreVia = viaInfo ? viaInfo.nombre : rep.cuadra;
    var fotoSrc = resolverRutaFoto(rep.foto);

    var html =
      '<div class="map-popup">' +
      '<div class="popup-top">' +
      '<strong>' + rep.id + '</strong> ' +
      '<span class="pill-nivel pill-' + nivel.toLowerCase() + '">' + nivel + ' (' + puntaje + ' pts)</span>' +
      '</div>' +
      '<p><strong>Cuadra:</strong> ' + nombreVia + ' (<code>' + rep.cuadra + '</code>)</p>' +
      '<p><strong>Categoría:</strong> ' + (ETIQUETAS_CAT[rep.categoria] || rep.categoria) + '</p>' +
      '<p><strong>Actor:</strong> ' + (ETIQUETAS_ACT[rep.actor] || rep.actor) + '</p>' +
      '<p><strong>Fecha/Hora:</strong> ' + (rep.fecha_hora || '').replace('T', ' ') + ' (' + (d.franja || '-') + ')</p>' +
      '<p class="popup-desglose"><strong>Desglose:</strong> Cat ' + (d.ptsCategoria || 0) +
      ' + Vía ' + (d.ptsVia || 0) +
      ' + Franja ' + (d.ptsFranja || 0) +
      ' = <strong>' + puntaje + '</strong></p>';

    if (fotoSrc) {
      html +=
        '<div class="popup-foto">' +
        '<img src="' + fotoSrc + '" alt="Evidencia anonimizada ' + rep.id + '" loading="lazy">' +
        '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Actualiza las capas de Mapa de Calor (Leaflet.heat) y Puntos Individuales (L.layerGroup).
   * @param {Array} reportesFiltrados
   * @param {Array} viasData
   * @param {Object} criteriosData
   * @param {'ambas'|'calor'|'puntos'} modoCapa
   */
  function actualizarCapasMapa(reportesFiltrados, viasData, criteriosData, modoCapa) {
    ultimoEstadoCapas = {
      reportes: Array.isArray(reportesFiltrados) ? reportesFiltrados : [],
      viasData: Array.isArray(viasData) ? viasData : [],
      criteriosData: criteriosData || null,
      modo: modoCapa || 'ambas'
    };

    if (!mapOperativo) {
      inicializarMapaOperativo();
    }
    if (!mapOperativo) return;

    var viasPorId = {};
    for (var v = 0; v < ultimoEstadoCapas.viasData.length; v++) {
      var via = ultimoEstadoCapas.viasData[v];
      viasPorId[via.id || via.codigo] = via;
    }

    // 1. Actualizar capa de puntos individuales
    if (capaPuntos) {
      capaPuntos.clearLayers();
    }

    var mostrarPuntos = ultimoEstadoCapas.modo === 'puntos' || ultimoEstadoCapas.modo === 'ambas';
    var mostrarCalor = ultimoEstadoCapas.modo === 'calor' || ultimoEstadoCapas.modo === 'ambas';

    var maxTeorico = calcularMaximoTeorico(ultimoEstadoCapas.criteriosData);
    var puntosCalor = [];

    for (var i = 0; i < ultimoEstadoCapas.reportes.length; i++) {
      var rep = ultimoEstadoCapas.reportes[i];
      var lat = Number(rep.lat);
      var lng = Number(rep.lng);
      if (isNaN(lat) || isNaN(lng)) continue;

      var puntaje = rep.criticidad && typeof rep.criticidad.puntaje === 'number' ? rep.criticidad.puntaje : 3;
      var nivel = rep.criticidad && rep.criticidad.nivel ? rep.criticidad.nivel : 'Bajo';
      var intensidad = Math.min(1, Math.max(0.25, puntaje / maxTeorico));

      puntosCalor.push([lat, lng, intensidad]);

      if (mostrarPuntos && capaPuntos) {
        var color = COLORES_NIVEL[nivel] || '#2563eb';
        var marcador = L.circleMarker([lat, lng], {
          radius: nivel === 'Alto' ? 8 : 7,
          color: '#ffffff',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.92
        });
        marcador.bindPopup(construirPopupHTML(rep, viasPorId[rep.cuadra]));
        capaPuntos.addLayer(marcador);
      }
    }

    if (capaPuntos) {
      if (mostrarPuntos && !mapOperativo.hasLayer(capaPuntos)) {
        capaPuntos.addTo(mapOperativo);
      } else if (!mostrarPuntos && mapOperativo.hasLayer(capaPuntos)) {
        mapOperativo.removeLayer(capaPuntos);
      }
    }

    // 2. Actualizar capa de calor (Leaflet.heat) solo si el contenedor tiene dimensiones válidas (>0)
    if (capaCalor && mapOperativo.hasLayer(capaCalor)) {
      mapOperativo.removeLayer(capaCalor);
      capaCalor = null;
    }

    var tamanoMapa = mapOperativo.getSize();
    if (
      mostrarCalor &&
      puntosCalor.length > 0 &&
      typeof L.heatLayer === 'function' &&
      tamanoMapa.x > 0 &&
      tamanoMapa.y > 0
    ) {
      capaCalor = L.heatLayer(puntosCalor, {
        radius: 28,
        blur: 18,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.35,
        gradient: {
          0.25: '#22c55e',
          0.55: '#f59e0b',
          0.85: '#ef4444',
          1.0: '#991b1b'
        }
      }).addTo(mapOperativo);
    }
  }

  /**
   * Obligatorio al cambiar de pestaña para que Leaflet recalcule dimensiones y
   * el canvas de Leaflet.heat no quede en 0x0.
   * @param {'captura'|'tablero'} vistaActiva
   */
  function refrescarTamanoMapa(vistaActiva) {
    if (vistaActiva === 'captura') {
      if (miniMap) {
        miniMap.invalidateSize(true);
        setTimeout(function () {
          miniMap.invalidateSize(true);
        }, 120);
      }
      return;
    }

    if (!mapOperativo) {
      inicializarMapaOperativo();
    }
    if (mapOperativo) {
      mapOperativo.invalidateSize(true);
      actualizarCapasMapa(
        ultimoEstadoCapas.reportes,
        ultimoEstadoCapas.viasData,
        ultimoEstadoCapas.criteriosData,
        ultimoEstadoCapas.modo
      );
      setTimeout(function () {
        if (mapOperativo) {
          mapOperativo.invalidateSize(true);
          actualizarCapasMapa(
            ultimoEstadoCapas.reportes,
            ultimoEstadoCapas.viasData,
            ultimoEstadoCapas.criteriosData,
            ultimoEstadoCapas.modo
          );
        }
      }, 140);
    }
  }

  var api = {
    inicializarMiniMapa: inicializarMiniMapa,
    actualizarPinMiniMapa: actualizarPinMiniMapa,
    encontrarCuadraMasCercana: encontrarCuadraMasCercana,
    inicializarMapaOperativo: inicializarMapaOperativo,
    actualizarCapasMapa: actualizarCapasMapa,
    refrescarTamanoMapa: refrescarTamanoMapa
  };

  global.MapaMovilidad = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

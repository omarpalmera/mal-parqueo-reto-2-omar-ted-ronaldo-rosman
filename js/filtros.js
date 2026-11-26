/**
 * js/filtros.js
 * Filtrado dinámico sin recargar la página (RF-04, CU-02) y cálculo de contadores.
 */

(function (global) {
  'use strict';

  var ETIQUETAS_CATEGORIA = {
    doble_fila: 'Doble fila / vía prohibida',
    bloqueo_rampa_cebra_paradero: 'Bloqueo de rampa, cebra o paradero',
    invasion_anden: 'Invasión de andén por comercio o mercancía'
  };

  var ETIQUETAS_ACTOR = {
    vehiculo_particular: 'Vehículo particular',
    motocicleta: 'Motocicleta',
    vehiculo_carga: 'Vehículo de carga descargando',
    mobiliario_comercial: 'Mobiliario comercial'
  };

  /**
   * Escapa caracteres especiales HTML para inserción segura en plantillas DOM.
   * @param {*} texto
   * @returns {string}
   */
  function escaparHtml(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function porcentaje(conteo, total) {
    return total > 0 ? Math.round((conteo / total) * 1000) / 10 : 0;
  }

  function distribuir(conteos, etiquetas, total) {
    var resultado = {};
    Object.keys(conteos).forEach(function (clave) {
      resultado[clave] = {
        etiqueta: (etiquetas && etiquetas[clave]) || clave,
        conteo: conteos[clave],
        porcentaje: porcentaje(conteos[clave], total)
      };
    });
    return resultado;
  }

  /**
   * Construye un mapa rápido de vías por código para consultas O(1).
   * @param {Array} viasData
   * @returns {Object}
   */
  function indexarVias(viasData) {
    var indice = {};
    if (!Array.isArray(viasData)) return indice;
    for (var i = 0; i < viasData.length; i++) {
      var via = viasData[i];
      if (!via) continue;
      if (via.id) indice[via.id] = via;
      if (via.codigo) indice[via.codigo] = via;
    }
    return indice;
  }

  /**
   * Filtra una lista de reportes según los filtros activos sin mutar el arreglo original.
   * Implementa el patrón de repetición con condición: para cada reporte, si cumple las
   * opciones elegidas, se incluye en la lista filtrada.
   *
   * @param {Array} listaReportes
   * @param {Object} filtrosActivos - { sector, cuadra, franja, categoria, actor }
   * @param {Array} viasData
   * @param {Object} [criteriosData] - Opcional; respaldo si el reporte no trae desglose.franja.
   * @returns {Array} Reportes que cumplen todos los filtros activos.
   */
  function filtrarReportes(listaReportes, filtrosActivos, viasData, criteriosData) {
    if (!Array.isArray(listaReportes)) return [];
    var filtros = filtrosActivos || {};
    var viasPorId = indexarVias(viasData);
    var resultado = [];

    for (var i = 0; i < listaReportes.length; i++) {
      var reporte = listaReportes[i];
      if (!reporte) continue;
      var via = viasPorId[reporte.cuadra] || null;

      if (filtros.sector && filtros.sector !== 'todos') {
        if (!via || via.sector !== filtros.sector) continue;
      }

      if (filtros.cuadra && filtros.cuadra !== 'todas') {
        if (reporte.cuadra !== filtros.cuadra) continue;
      }

      if (filtros.franja && filtros.franja !== 'todas') {
        var franjaReporte;
        if (
          reporte.criticidad &&
          reporte.criticidad.desglose &&
          reporte.criticidad.desglose.franja
        ) {
          franjaReporte = reporte.criticidad.desglose.franja;
        } else if (
          criteriosData &&
          Array.isArray(criteriosData.horas_pico) &&
          global.Criticidad &&
          typeof global.Criticidad.determinarFranja === 'function'
        ) {
          franjaReporte = global.Criticidad.determinarFranja(
            reporte.fecha_hora,
            criteriosData.horas_pico
          );
        } else {
          franjaReporte = 'valle';
        }
        if (franjaReporte !== filtros.franja) continue;
      }

      if (filtros.categoria && filtros.categoria !== 'todas') {
        if (reporte.categoria !== filtros.categoria) continue;
      }

      if (filtros.actor && filtros.actor !== 'todos') {
        if (reporte.actor !== filtros.actor) continue;
      }

      resultado.push(reporte);
    }

    return resultado;
  }

  /**
   * Calcula totales, distribución por nivel de criticidad, franja, categoría y actor.
   * @param {Array} listaFiltrada
   * @returns {Object}
   */
  function calcularContadores(listaFiltrada) {
    var lista = Array.isArray(listaFiltrada) ? listaFiltrada : [];
    var total = lista.length;

    var niveles = { Alto: 0, Medio: 0, Bajo: 0 };
    var franjas = { pico: 0, valle: 0 };
    var puntajesPorFranja = { pico: 0, valle: 0 };
    var conteoCategorias = {};
    var conteoActores = {};

    Object.keys(ETIQUETAS_CATEGORIA).forEach(function (clave) {
      conteoCategorias[clave] = 0;
    });
    Object.keys(ETIQUETAS_ACTOR).forEach(function (clave) {
      conteoActores[clave] = 0;
    });

    var puntajeTotal = 0;

    for (var i = 0; i < lista.length; i++) {
      var rep = lista[i];
      if (!rep) continue;
      var nivel = rep.criticidad && rep.criticidad.nivel ? rep.criticidad.nivel : 'Bajo';
      var puntaje = rep.criticidad && typeof rep.criticidad.puntaje === 'number' ? rep.criticidad.puntaje : 0;
      var franja =
        rep.criticidad && rep.criticidad.desglose && rep.criticidad.desglose.franja
          ? rep.criticidad.desglose.franja
          : 'valle';

      puntajeTotal += puntaje;
      if (Object.prototype.hasOwnProperty.call(niveles, nivel)) {
        niveles[nivel] += 1;
      } else {
        niveles[nivel] = 1;
      }

      var periodo = franja === 'pico' ? 'pico' : 'valle';
      franjas[periodo] += 1;
      puntajesPorFranja[periodo] += puntaje;

      if (rep.actor) {
        if (Object.prototype.hasOwnProperty.call(conteoActores, rep.actor)) {
          conteoActores[rep.actor] += 1;
        } else {
          conteoActores[rep.actor] = 1;
        }
      }

      if (rep.categoria) {
        if (Object.prototype.hasOwnProperty.call(conteoCategorias, rep.categoria)) {
          conteoCategorias[rep.categoria] += 1;
        } else {
          conteoCategorias[rep.categoria] = 1;
        }
      }
    }

    return {
      total: total,
      puntajeTotal: puntajeTotal,
      niveles: niveles,
      franjas: franjas,
      puntajesPorFranja: puntajesPorFranja,
      categorias: distribuir(conteoCategorias, ETIQUETAS_CATEGORIA, total),
      actores: distribuir(conteoActores, ETIQUETAS_ACTOR, total)
    };
  }

  function textoConteo(valor) {
    return valor + (valor === 1 ? ' reporte' : ' reportes');
  }

  function renderizarBarras(id, distribucion, total) {
    var panel = document.getElementById(id);
    if (!panel) return;
    if (!total) {
      panel.innerHTML = '<p class="empty-state">Sin reportes para distribuir con estos filtros.</p>';
      return;
    }
    var filas = Object.values(distribucion || {});
    panel.innerHTML = filas.map(function (fila) {
      var etiquetaSegura = escaparHtml(fila.etiqueta);
      var pctNum = Number(fila.porcentaje) || 0;
      return (
        '<div class="cat-bar-item">' +
        '<div class="cat-bar-header"><span>' + etiquetaSegura + '</span>' +
        '<strong>' + textoConteo(fila.conteo) + ' · ' + pctNum.toLocaleString('es-CO') + '%</strong>' +
        '</div>' +
        '<progress class="cat-bar-track" aria-label="' + etiquetaSegura + '" max="100" value="' + pctNum + '"></progress>' +
        '</div>'
      );
    }).join('');
  }

  function renderizarFranjas(contadores) {
    var panel = document.getElementById('comparacion-franjas');
    if (!panel) return;
    var puntajes = contadores.puntajesPorFranja || { pico: 0, valle: 0 };
    panel.innerHTML = ['pico', 'valle'].map(function (franja) {
      var conteo = (contadores.franjas && contadores.franjas[franja]) || 0;
      var parte = porcentaje(conteo, contadores.total);
      var puntos = puntajes[franja] || 0;
      return (
        '<div class="franja-item">' +
        '<h4>Hora ' + franja + '</h4>' +
        '<div class="franja-conteo"><strong>' + textoConteo(conteo) + '</strong><span>' + parte.toLocaleString('es-CO') + '%</span></div>' +
        '<progress class="cat-bar-track" aria-label="Hora ' + franja + '" max="100" value="' + parte + '"></progress>' +
        '<p>' + puntos + (puntos === 1 ? ' punto acumulado' : ' puntos acumulados') + '</p>' +
        '</div>'
      );
    }).join('');
  }

  /**
   * Actualiza en el DOM los KPIs del tablero operativo y los porcentajes por categoría, actor y franja.
   * @param {Object} contadores
   * @param {number} totalGlobal
   */
  function renderizarContadores(contadores, totalGlobal) {
    if (typeof document === 'undefined' || !contadores) return;

    var elTotal = document.getElementById('kpi-total');
    var elAlto = document.getElementById('kpi-alto');
    var elMedio = document.getElementById('kpi-medio');
    var elBajo = document.getElementById('kpi-bajo');
    var elPuntaje = document.getElementById('kpi-puntaje');
    var elEstado = document.getElementById('kpi-filtro-estado');

    if (elTotal) elTotal.textContent = String(contadores.total);
    if (elAlto) elAlto.textContent = String(contadores.niveles.Alto || 0);
    if (elMedio) elMedio.textContent = String(contadores.niveles.Medio || 0);
    if (elBajo) elBajo.textContent = String(contadores.niveles.Bajo || 0);
    if (elPuntaje) elPuntaje.textContent = String(contadores.puntajeTotal);
    if (elEstado) {
      elEstado.textContent =
        'Mostrando ' +
        contadores.total +
        ' de ' +
        totalGlobal +
        ' registros (' +
        contadores.franjas.pico +
        ' pico · ' +
        contadores.franjas.valle +
        ' valle)';
    }

    renderizarBarras('barras-categorias', contadores.categorias, contadores.total);
    renderizarBarras('barras-actores', contadores.actores, contadores.total);
    renderizarFranjas(contadores);
  }

  var api = {
    ETIQUETAS_CATEGORIA: ETIQUETAS_CATEGORIA,
    ETIQUETAS_ACTOR: ETIQUETAS_ACTOR,
    filtrarReportes: filtrarReportes,
    calcularContadores: calcularContadores,
    renderizarContadores: renderizarContadores
  };

  global.Filtros = api;
  global.filtrarReportes = filtrarReportes;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

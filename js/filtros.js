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
   * @returns {Array} Reportes que cumplen todos los filtros activos.
   */
  function filtrarReportes(listaReportes, filtrosActivos, viasData) {
    if (!Array.isArray(listaReportes)) return [];
    var filtros = filtrosActivos || {};
    var viasPorId = indexarVias(viasData);
    var resultado = [];

    for (var i = 0; i < listaReportes.length; i++) {
      var reporte = listaReportes[i];
      var via = viasPorId[reporte.cuadra] || null;

      if (filtros.sector && filtros.sector !== 'todos') {
        if (!via || via.sector !== filtros.sector) continue;
      }

      if (filtros.cuadra && filtros.cuadra !== 'todas') {
        if (reporte.cuadra !== filtros.cuadra) continue;
      }

      if (filtros.franja && filtros.franja !== 'todas') {
        var franjaReporte =
          reporte.criticidad &&
          reporte.criticidad.desglose &&
          reporte.criticidad.desglose.franja
            ? reporte.criticidad.desglose.franja
            : 'valle';
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
   * Calcula totales, distribución por nivel de criticidad, franja y porcentaje por categoría.
   * @param {Array} listaFiltrada
   * @returns {Object}
   */
  function calcularContadores(listaFiltrada) {
    var lista = Array.isArray(listaFiltrada) ? listaFiltrada : [];
    var total = lista.length;

    var niveles = { Alto: 0, Medio: 0, Bajo: 0 };
    var franjas = { pico: 0, valle: 0 };
    var conteoCategorias = {
      doble_fila: 0,
      bloqueo_rampa_cebra_paradero: 0,
      invasion_anden: 0
    };
    var puntajeTotal = 0;

    for (var i = 0; i < lista.length; i++) {
      var rep = lista[i];
      var nivel = rep.criticidad && rep.criticidad.nivel ? rep.criticidad.nivel : 'Bajo';
      var puntaje = rep.criticidad && typeof rep.criticidad.puntaje === 'number' ? rep.criticidad.puntaje : 0;
      var franja =
        rep.criticidad && rep.criticidad.desglose && rep.criticidad.desglose.franja
          ? rep.criticidad.desglose.franja
          : 'valle';

      puntajeTotal += puntaje;
      if (niveles[nivel] !== undefined) {
        niveles[nivel] += 1;
      } else {
        niveles[nivel] = 1;
      }

      if (franja === 'pico') franjas.pico += 1;
      else franjas.valle += 1;

      if (conteoCategorias[rep.categoria] !== undefined) {
        conteoCategorias[rep.categoria] += 1;
      }
    }

    var categorias = {};
    var claves = Object.keys(conteoCategorias);
    for (var j = 0; j < claves.length; j++) {
      var cat = claves[j];
      var cnt = conteoCategorias[cat];
      var pct = total > 0 ? Math.round((cnt / total) * 1000) / 10 : 0;
      categorias[cat] = {
        etiqueta: ETIQUETAS_CATEGORIA[cat] || cat,
        conteo: cnt,
        porcentaje: pct
      };
    }

    return {
      total: total,
      puntajeTotal: puntajeTotal,
      niveles: niveles,
      franjas: franjas,
      categorias: categorias
    };
  }

  /**
   * Actualiza en el DOM los KPIs del tablero operativo y los porcentajes por categoría.
   * @param {Object} contadores
   * @param {number} totalGlobal
   */
  function renderizarContadores(contadores, totalGlobal) {
    if (typeof document === 'undefined') return;

    var elTotal = document.getElementById('kpi-total');
    var elAlto = document.getElementById('kpi-alto');
    var elMedio = document.getElementById('kpi-medio');
    var elBajo = document.getElementById('kpi-bajo');
    var elPuntaje = document.getElementById('kpi-puntaje');
    var elEstado = document.getElementById('kpi-filtro-estado');
    var elBarras = document.getElementById('barras-categorias');

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

    if (elBarras) {
      var html = '';
      var claves = ['doble_fila', 'bloqueo_rampa_cebra_paradero', 'invasion_anden'];
      for (var i = 0; i < claves.length; i++) {
        var clave = claves[i];
        var info = contadores.categorias[clave];
        html +=
          '<div class="cat-bar-item">' +
          '<div class="cat-bar-header">' +
          '<span>' + info.etiqueta + '</span>' +
          '<strong>' + info.conteo + ' (' + info.porcentaje + '%)</strong>' +
          '</div>' +
          '<div class="cat-bar-track">' +
          '<div class="cat-bar-fill cat-' + clave + '" style="width:' + info.porcentaje + '%"></div>' +
          '</div>' +
          '</div>';
      }
      elBarras.innerHTML = html;
    }
  }

  var api = {
    ETIQUETAS_CATEGORIA: ETIQUETAS_CATEGORIA,
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

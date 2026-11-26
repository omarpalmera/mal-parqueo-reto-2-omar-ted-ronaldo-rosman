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

  function porcentaje(conteo, total) {
    return total ? Math.round(conteo / total * 1000) / 10 : 0;
  }

  function distribuir(conteos, etiquetas, total) {
    var resultado = {};
    Object.keys(conteos).forEach(function (clave) {
      resultado[clave] = {
        etiqueta: etiquetas[clave],
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
    var puntajesPorFranja = { pico: 0, valle: 0 };
    var conteoCategorias = Object.fromEntries(Object.keys(ETIQUETAS_CATEGORIA).map(clave => [clave, 0]));
    var conteoActores = Object.fromEntries(Object.keys(ETIQUETAS_ACTOR).map(clave => [clave, 0]));
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

      var periodo = franja === 'pico' ? 'pico' : 'valle';
      franjas[periodo] += 1;
      puntajesPorFranja[periodo] += puntaje;

      if (Object.hasOwn(conteoActores, rep.actor)) {
        conteoActores[rep.actor] += 1;
      }

      if (conteoCategorias[rep.categoria] !== undefined) {
        conteoCategorias[rep.categoria] += 1;
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
    // Las etiquetas proceden de los catálogos del tablero.
    panel.innerHTML = Object.values(distribucion).map(function (fila) {
      return `<div class="cat-bar-item">
        <div class="cat-bar-header"><span>${fila.etiqueta}</span>
          <strong>${textoConteo(fila.conteo)} · ${fila.porcentaje.toLocaleString('es-CO')}%</strong>
        </div>
        <progress class="cat-bar-track" aria-label="${fila.etiqueta}" max="100" value="${fila.porcentaje}"></progress>
      </div>`;
    }).join('');
  }

  function renderizarFranjas(contadores) {
    var panel = document.getElementById('comparacion-franjas');
    if (!panel) return;
    panel.innerHTML = ['pico', 'valle'].map(function (franja) {
      var conteo = contadores.franjas[franja];
      var parte = porcentaje(conteo, contadores.total);
      var puntos = contadores.puntajesPorFranja[franja];
      return `<div class="franja-item">
        <h4>Hora ${franja}</h4>
        <div class="franja-conteo"><strong>${textoConteo(conteo)}</strong><span>${parte.toLocaleString('es-CO')}%</span></div>
        <progress class="cat-bar-track" aria-label="Hora ${franja}" max="100" value="${parte}"></progress>
        <p>${puntos} ${puntos === 1 ? 'punto acumulado' : 'puntos acumulados'}</p>
      </div>`;
    }).join('');
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

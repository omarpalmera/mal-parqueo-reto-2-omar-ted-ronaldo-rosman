/**
 * js/resumen.js
 * Agrupación por cuadra, ranking Top 5 y motor de reglas de recomendación (RF-05, CU-03).
 */

(function (global) {
  'use strict';

  var ETIQUETAS_CATEGORIA_CORTA = {
    doble_fila: 'Doble fila',
    bloqueo_rampa_cebra_paradero: 'Bloqueo rampa/cebra/paradero',
    invasion_anden: 'Invasión de andén'
  };

  var ETIQUETAS_ACTOR_CORTA = {
    vehiculo_particular: 'Vehículo particular',
    motocicleta: 'Motocicleta',
    vehiculo_carga: 'Vehículo de carga descargando',
    mobiliario_comercial: 'Mobiliario comercial'
  };

  /**
   * Determina si una clave predomina en un diccionario de conteos (> 50% o mayoría simple única).
   * @param {Object} conteos - Diccionario { clave: cantidad }
   * @param {string} claveObjetivo
   * @param {number} total
   * @returns {boolean}
   */
  function predominaClave(conteos, claveObjetivo, total) {
    if (!total || total <= 0) return false;
    var valorObjetivo = conteos[claveObjetivo] || 0;
    if (valorObjetivo === 0) return false;

    if (valorObjetivo > total / 2) {
      return true;
    }

    var maxValor = 0;
    var cantidadMaximos = 0;
    var claves = Object.keys(conteos);
    for (var i = 0; i < claves.length; i++) {
      var val = conteos[claves[i]] || 0;
      if (val > maxValor) {
        maxValor = val;
        cantidadMaximos = 1;
      } else if (val === maxValor) {
        cantidadMaximos += 1;
      }
    }

    return valorObjetivo === maxValor && cantidadMaximos === 1;
  }

  /**
   * Evalúa las reglas R1 a R4 en estricto orden de prioridad y devuelve la recomendación
   * junto con el texto explícito de la regla aplicada.
   *
   * @param {Object} grupoCuadra
   * @returns {{ recomendacion: string, reglaAplicada: string, codigoRegla: string }}
   */
  function evaluarReglaRecomendacion(grupoCuadra) {
    if (grupoCuadra.altosEnPico >= 3) {
      return {
        codigoRegla: 'R1',
        recomendacion: 'Patrullaje prioritario en hora pico',
        reglaAplicada: 'Regla R1: 3 o más reportes Alto en franja pico (' + grupoCuadra.altosEnPico + ' registrados)'
      };
    }

    if (predominaClave(grupoCuadra.categorias, 'invasion_anden', grupoCuadra.totalReportes)) {
      var pctAnden = Math.round(((grupoCuadra.categorias.invasion_anden || 0) / grupoCuadra.totalReportes) * 100);
      return {
        codigoRegla: 'R2',
        recomendacion: 'Operativo de espacio público',
        reglaAplicada: 'Regla R2: Predominio de invasión de andén (' + pctAnden + '% de los reportes)'
      };
    }

    if (predominaClave(grupoCuadra.actores, 'vehiculo_carga', grupoCuadra.totalReportes)) {
      var pctCarga = Math.round(((grupoCuadra.actores.vehiculo_carga || 0) / grupoCuadra.totalReportes) * 100);
      return {
        codigoRegla: 'R3',
        recomendacion: 'Revisar horario de cargue y descargue',
        reglaAplicada: 'Regla R3: Predominio de vehículo de carga descargando (' + pctCarga + '% de los reportes)'
      };
    }

    return {
      codigoRegla: 'R4',
      recomendacion: 'Control preventivo y señalización vial',
      reglaAplicada: 'Regla R4: Incidencia moderada/mixta sin umbral crítico específico'
    };
  }

  /**
   * Agrupa los reportes filtrados por cuadra, suma puntajes de criticidad, ordena
   * de mayor a menor y retorna el Top 5 con sus recomendaciones y reglas explícitas.
   *
   * @param {Array} reportesFiltrados
   * @param {Array} viasData
   * @returns {Array} Top 5 de cuadras ordenadas por criticidad acumulada.
   */
  function generarResumenOperativo(reportesFiltrados, viasData) {
    if (!Array.isArray(reportesFiltrados) || reportesFiltrados.length === 0) {
      return [];
    }

    var mapaVias = {};
    if (Array.isArray(viasData)) {
      for (var v = 0; v < viasData.length; v++) {
        var via = viasData[v];
        mapaVias[via.id || via.codigo] = via;
      }
    }

    var agrupado = {};
    for (var i = 0; i < reportesFiltrados.length; i++) {
      var rep = reportesFiltrados[i];
      var cuadraId = rep.cuadra;
      if (!agrupado[cuadraId]) {
        var infoVia = mapaVias[cuadraId] || {};
        agrupado[cuadraId] = {
          cuadra: cuadraId,
          nombre: infoVia.nombre || cuadraId,
          sector: infoVia.sector || 'Zona centro',
          tipo_via: infoVia.tipo_via || 'secundaria',
          puntajeTotal: 0,
          totalReportes: 0,
          altosTotal: 0,
          altosEnPico: 0,
          categorias: {
            doble_fila: 0,
            bloqueo_rampa_cebra_paradero: 0,
            invasion_anden: 0
          },
          actores: {
            vehiculo_particular: 0,
            motocicleta: 0,
            vehiculo_carga: 0,
            mobiliario_comercial: 0
          }
        };
      }

      var grupo = agrupado[cuadraId];
      var pts = rep.criticidad && typeof rep.criticidad.puntaje === 'number' ? rep.criticidad.puntaje : 0;
      var nivel = rep.criticidad && rep.criticidad.nivel ? rep.criticidad.nivel : 'Bajo';
      var franja =
        rep.criticidad && rep.criticidad.desglose && rep.criticidad.desglose.franja
          ? rep.criticidad.desglose.franja
          : 'valle';

      grupo.puntajeTotal += pts;
      grupo.totalReportes += 1;

      if (nivel === 'Alto') {
        grupo.altosTotal += 1;
        if (franja === 'pico') {
          grupo.altosEnPico += 1;
        }
      }

      if (grupo.categorias[rep.categoria] !== undefined) {
        grupo.categorias[rep.categoria] += 1;
      } else if (rep.categoria) {
        grupo.categorias[rep.categoria] = 1;
      }

      if (grupo.actores[rep.actor] !== undefined) {
        grupo.actores[rep.actor] += 1;
      } else if (rep.actor) {
        grupo.actores[rep.actor] = 1;
      }
    }

    var listaCuadras = Object.values(agrupado);
    listaCuadras.sort(function (a, b) {
      if (b.puntajeTotal !== a.puntajeTotal) return b.puntajeTotal - a.puntajeTotal;
      if (b.altosEnPico !== a.altosEnPico) return b.altosEnPico - a.altosEnPico;
      return b.totalReportes - a.totalReportes;
    });

    var top5 = listaCuadras.slice(0, 5).map(function (item, idx) {
      var evalRegla = evaluarReglaRecomendacion(item);
      item.posicion = idx + 1;
      item.codigoRegla = evalRegla.codigoRegla;
      item.recomendacion = evalRegla.recomendacion;
      item.reglaAplicada = evalRegla.reglaAplicada;
      return item;
    });

    return top5;
  }

  /**
   * Formatea el detalle de categorías más frecuentes en una cuadra.
   * @param {Object} conteos
   * @param {Object} diccionarioEtiquetas
   * @returns {string}
   */
  function resumirDistribucion(conteos, diccionarioEtiquetas) {
    var partes = [];
    var claves = Object.keys(conteos);
    for (var i = 0; i < claves.length; i++) {
      var k = claves[i];
      if (conteos[k] > 0) {
        partes.push((diccionarioEtiquetas[k] || k) + ': ' + conteos[k]);
      }
    }
    return partes.join(' · ');
  }

  /**
   * Renderiza el Top 5 y la verificación de dos casos de cálculo manual (RF-02 / RF-05).
   * @param {Array} top5
   * @param {string} containerId
   * @param {Object} criteriosData
   * @param {Array} reportesActuales
   */
  function renderizarResumenOperativo(top5, containerId, criteriosData, reportesActuales) {
    if (typeof document === 'undefined') return;
    var contenedor = document.getElementById(containerId);
    if (!contenedor) return;

    var fechaEl = document.getElementById('print-fecha');
    if (fechaEl) {
      fechaEl.textContent = 'Generado: ' + new Date().toLocaleString('es-CO');
    }

    contenedor.replaceChildren();
    if (!top5 || !top5.length) {
      var vacio = document.createElement('p');
      vacio.className = 'empty-state';
      vacio.textContent = 'Ninguna cuadra coincide. Prueba otra combinación de filtros.';
      contenedor.appendChild(vacio);
    } else {
      var lista = document.createElement('ol');
      lista.className = 'top5-lista';
      var plantilla = document.getElementById('tarjeta-prioridad');
      top5.forEach(function (item) {
        var fila = document.createElement('li');
        var tarjeta = plantilla.content.firstElementChild.cloneNode(true);
        tarjeta.classList.add('rule-' + item.codigoRegla.toLowerCase());
        tarjeta.querySelector('.top5-rank').textContent = '#' + item.posicion;
        tarjeta.querySelector('h4').textContent = item.nombre;
        tarjeta.querySelector('.score-num').textContent = item.puntajeTotal;
        tarjeta.querySelector('.top5-meta').textContent = item.sector + ' · Vía ' + item.tipo_via + ' · ' +
          item.totalReportes + (item.totalReportes === 1 ? ' reporte' : ' reportes');
        tarjeta.querySelector('.rec-accion').textContent = item.recomendacion;
        tarjeta.querySelector('.rec-regla').textContent = item.reglaAplicada;
        var detalles = tarjeta.querySelectorAll('.top5-metrics p');
        detalles[0].textContent = 'Categorías · ' + resumirDistribucion(item.categorias, ETIQUETAS_CATEGORIA_CORTA);
        detalles[1].textContent = 'Actores · ' + resumirDistribucion(item.actores, ETIQUETAS_ACTOR_CORTA);
        fila.appendChild(tarjeta);
        lista.appendChild(fila);
      });
      contenedor.appendChild(lista);
    }

    renderizarCasosValidacion(criteriosData, reportesActuales);
  }

  /**
   * Muestra en el resumen operativo 2 casos reales con su desglose aritmético en vivo
   * para facilitar la sustentación del RF-02 frente al jurado.
   */
  function renderizarCasosValidacion(criteriosData, reportesActuales) {
    var contenedor = document.getElementById('validacion-manual-casos');
    if (!contenedor || !Array.isArray(reportesActuales) || !criteriosData) return;

    var casoA = null;
    var casoB = null;
    for (var i = 0; i < reportesActuales.length; i++) {
      if (reportesActuales[i].id === 'MP-014') casoA = reportesActuales[i];
      if (reportesActuales[i].id === 'MP-026') casoB = reportesActuales[i];
    }
    if (!casoA && reportesActuales.length > 0) casoA = reportesActuales[0];
    if (!casoB && reportesActuales.length > 1) casoB = reportesActuales[reportesActuales.length - 1];

    var casos = [casoA, casoB].filter(Boolean);
    if (casos.length === 0) {
      contenedor.innerHTML = '';
      return;
    }

    var grid = document.createElement('div');
    grid.className = 'casos-grid';
    casos.forEach(function (rep) {
      var caso = document.createElement('article');
      caso.className = 'caso-card';
      var titulo = document.createElement('strong');
      titulo.textContent = rep.id + ' · Nivel ' + rep.criticidad.nivel.toLowerCase() +
        ' · ' + rep.criticidad.puntaje + ' puntos';
      var fecha = document.createElement('p');
      fecha.textContent = rep.fecha_hora.replace('T', ' ');
      var d = rep.criticidad.desglose;
      var factores = document.createElement('ul');
      factores.className = 'score-pills';
      [
        [ETIQUETAS_CATEGORIA_CORTA[rep.categoria] || 'Categoría', d.ptsCategoria],
        ['Vía ' + d.tipoVia, d.ptsVia],
        ['Hora ' + d.franja, d.ptsFranja]
      ].forEach(function (factor) {
        var chip = document.createElement('li');
        chip.textContent = factor[0] + ' · ' + factor[1];
        factores.appendChild(chip);
      });
      caso.append(titulo, fecha, factores);
      grid.appendChild(caso);
    });
    contenedor.replaceChildren(grid);
  }

  var api = {
    evaluarReglaRecomendacion: evaluarReglaRecomendacion,
    generarResumenOperativo: generarResumenOperativo,
    renderizarResumenOperativo: renderizarResumenOperativo
  };

  global.Resumen = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

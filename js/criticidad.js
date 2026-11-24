/**
 * js/criticidad.js
 * Módulo de lógica pura y desacoplada para el cálculo del índice de criticidad (RF-02).
 *
 * RESTRICCIÓN ARQUITECTÓNICA:
 * - Prohibido acceder al DOM, mapas, alertas o localStorage dentro de este archivo.
 * - Prohibido quemar (hardcodear) pesos, franjas horarias o umbrales de nivel.
 *   Todos los parámetros numéricos se leen exclusivamente desde criteriosData y viasData.
 */

(function (global) {
  'use strict';

  /**
   * Convierte una cadena "HH:MM" a minutos transcurridos desde la medianoche.
   * @param {string} horaStr - Hora en formato "HH:MM".
   * @returns {number} Minutos desde 00:00 o NaN si el formato es inválido.
   */
  function horaAMinutos(horaStr) {
    if (typeof horaStr !== 'string') return NaN;
    var partes = horaStr.trim().split(':');
    if (partes.length < 2) return NaN;
    var horas = parseInt(partes[0], 10);
    var minutos = parseInt(partes[1], 10);
    if (isNaN(horas) || isNaN(minutos)) return NaN;
    return horas * 60 + minutos;
  }

  /**
   * Extrae la porción "HH:MM" desde una cadena de fecha/hora ISO o texto horario.
   * @param {string} fechaHoraStr - Ej. "2026-11-18T11:40" o "11:40".
   * @returns {string} Cadena "HH:MM".
   */
  function extraerHoraHHMM(fechaHoraStr) {
    if (typeof fechaHoraStr !== 'string') return '00:00';
    var limpio = fechaHoraStr.trim();
    if (limpio.indexOf('T') !== -1) {
      limpio = limpio.split('T')[1];
    } else if (limpio.indexOf(' ') !== -1) {
      limpio = limpio.split(' ')[1];
    }
    var match = limpio.match(/^(\d{1,2}:\d{2})/);
    return match ? match[1] : '00:00';
  }

  /**
   * Determina si una fecha/hora cae dentro de alguno de los rangos de horas pico
   * definidos en criteriosData.horas_pico.
   * @param {string} fechaHoraStr - Fecha y hora del reporte.
   * @param {string[]} horasPicoArr - Arreglo de rangos "HH:MM-HH:MM".
   * @returns {'pico'|'valle'} Franja horaria calculada.
   */
  function determinarFranja(fechaHoraStr, horasPicoArr) {
    var horaHHMM = extraerHoraHHMM(fechaHoraStr);
    var minutosReporte = horaAMinutos(horaHHMM);
    if (isNaN(minutosReporte) || !Array.isArray(horasPicoArr)) {
      return 'valle';
    }

    for (var i = 0; i < horasPicoArr.length; i++) {
      var rango = horasPicoArr[i];
      if (typeof rango !== 'string' || rango.indexOf('-') === -1) continue;
      var extremos = rango.split('-');
      var inicio = horaAMinutos(extremos[0]);
      var fin = horaAMinutos(extremos[1]);
      if (!isNaN(inicio) && !isNaN(fin) && minutosReporte >= inicio && minutosReporte <= fin) {
        return 'pico';
      }
    }
    return 'valle';
  }

  /**
   * Busca la cuadra del reporte en viasData para obtener su tipo de vía.
   * @param {string} cuadraCodigo - Código identificador de la cuadra.
   * @param {Array} viasData - Catálogo de cuadras cargadas desde datos/vias.json.
   * @returns {string} Tipo de vía ("arterial" o "secundaria").
   */
  function obtenerTipoVia(cuadraCodigo, viasData) {
    if (!Array.isArray(viasData) || !cuadraCodigo) {
      return 'secundaria';
    }
    for (var i = 0; i < viasData.length; i++) {
      var via = viasData[i];
      if (via.id === cuadraCodigo || via.codigo === cuadraCodigo) {
        return via.tipo_via || 'secundaria';
      }
    }
    return 'secundaria';
  }

  /**
   * Evalúa el puntaje total contra los rangos configurados en criteriosData.niveles.
   * Si un puntaje supera el máximo configurado (p. ej. al subir pesos en criterios.json),
   * asigna el nivel con el límite superior más alto.
   * @param {number} puntaje - Suma total de los tres componentes.
   * @param {Object} nivelesConfig - Objeto { Nivel: [min, max] } desde criterios.json.
   * @returns {string} Nombre del nivel de criticidad ("Bajo", "Medio", "Alto", etc.).
   */
  function clasificarNivel(puntaje, nivelesConfig) {
    if (!nivelesConfig || typeof nivelesConfig !== 'object') {
      return 'Sin clasificar';
    }

    var entradas = Object.entries(nivelesConfig);
    var nivelMinimo = null;
    var limiteMinimo = Infinity;
    var nivelMaximo = null;
    var limiteMaximo = -Infinity;

    for (var i = 0; i < entradas.length; i++) {
      var nombreNivel = entradas[i][0];
      var rango = entradas[i][1];
      if (!Array.isArray(rango) || rango.length < 2) continue;

      var min = Number(rango[0]);
      var max = Number(rango[1]);

      if (puntaje >= min && puntaje <= max) {
        return nombreNivel;
      }

      if (min < limiteMinimo) {
        limiteMinimo = min;
        nivelMinimo = nombreNivel;
      }
      if (max > limiteMaximo) {
        limiteMaximo = max;
        nivelMaximo = nombreNivel;
      }
    }

    if (puntaje > limiteMaximo && nivelMaximo !== null) {
      return nivelMaximo;
    }
    if (puntaje < limiteMinimo && nivelMinimo !== null) {
      return nivelMinimo;
    }
    return nivelMinimo || 'Sin clasificar';
  }

  /**
   * Calcula el puntaje y nivel de criticidad de un reporte leyendo exclusivamente
   * la configuración de viasData y criteriosData.
   *
   * @param {Object} reporte - Objeto de reporte con cuadra, categoria y fecha_hora.
   * @param {Array} viasData - Arreglo de cuadras desde datos/vias.json.
   * @param {Object} criteriosData - Reglas de ponderación desde datos/criterios.json.
   * @returns {{
   *   puntaje: number,
   *   nivel: string,
   *   desglose: {
   *     ptsCategoria: number,
   *     ptsVia: number,
   *     ptsFranja: number,
   *     tipoVia: string,
   *     franja: string
   *   }
   * }}
   */
  function calcularCriticidad(reporte, viasData, criteriosData) {
    if (!reporte || !criteriosData) {
      throw new Error('Se requieren reporte y criteriosData para calcular la criticidad.');
    }

    var tipoVia = obtenerTipoVia(reporte.cuadra, viasData);
    var franja = determinarFranja(reporte.fecha_hora, criteriosData.horas_pico);

    var tablaCategoria = criteriosData.categoria || {};
    var tablaVia = criteriosData.via || {};
    var tablaFranja = criteriosData.franja || {};

    var ptsCategoria = Number(tablaCategoria[reporte.categoria] || 0);
    var ptsVia = Number(tablaVia[tipoVia] || 0);
    var ptsFranja = Number(tablaFranja[franja] || 0);

    var puntaje = ptsCategoria + ptsVia + ptsFranja;
    var nivel = clasificarNivel(puntaje, criteriosData.niveles);

    return {
      puntaje: puntaje,
      nivel: nivel,
      desglose: {
        ptsCategoria: ptsCategoria,
        ptsVia: ptsVia,
        ptsFranja: ptsFranja,
        tipoVia: tipoVia,
        franja: franja
      }
    };
  }

  var api = {
    horaAMinutos: horaAMinutos,
    extraerHoraHHMM: extraerHoraHHMM,
    determinarFranja: determinarFranja,
    obtenerTipoVia: obtenerTipoVia,
    clasificarNivel: clasificarNivel,
    calcularCriticidad: calcularCriticidad
  };

  global.Criticidad = api;
  global.calcularCriticidad = calcularCriticidad;
  global.determinarFranja = determinarFranja;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

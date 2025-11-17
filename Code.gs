/**
 * Attach GMAIL v1.1.0
 * ===============================================================
 *
 * Punto de entrada principal y gestión de configuración
 *
 * @proyecto: Attach GMAIL
 * @versión: 1.1.0
 * @autor: https://github.com/686f6c61
 * @fecha: 2025-11-17
 * @licencia: MIT
 */

// ============================================================================
// CONFIGURACIÓN POR DEFECTO
// ============================================================================

const DEFAULT_CONFIG = {
  MAIN_FOLDER_NAME: "Adjuntos Mail",
  PROCESSED_LABEL_NAME: "AdjuntosSincronizados",
  MAX_EMAILS_TO_PROCESS: 50,
  DAYS_TO_LOOK_BACK: 0,
  DOMINIOS_INCLUIDOS: [],
  DOMINIOS_EXCLUIDOS: [],
  EXTENSIONES_PERMITIDAS: [],
  EXTENSIONES_EXCLUIDAS: ["ics"],
  ENVIAR_NOTIFICACIONES: true,
  EMAIL_NOTIFICACION: "",  // Email personalizado para notificaciones (vacío = usar email actual)
  MENSAJE_PERSONALIZADO: "",  // Mensaje personalizado al inicio de notificaciones
  FRECUENCIA_NOTIFICACIONES: 'diaria',
  DETALLE_NOTIFICACIONES: 'basico',
  USAR_PATRONES_ASUNTO: false,
  PATRONES_ASUNTO: [],
  USAR_NOMBRE_USUARIO: false,
  USAR_NOMBRE_PARA_DOMINIOS_GENERICOS: false,
  DOMINIOS_GENERICOS: ["gmail.com", "outlook.com", "yahoo.com", "protonmail.com", "hotmail.com"]
};

// Variable global de configuración (se carga al inicio)
let CONFIG = Object.assign({}, DEFAULT_CONFIG);

// ============================================================================
// GESTIÓN DE CONFIGURACIÓN
// ============================================================================

/**
 * Carga la configuración guardada desde PropertiesService
 * @return {Object} Configuración cargada
 */
function cargarConfiguracion() {
  try {
    const props = PropertiesService.getUserProperties();
    const stored = props.getProperty('CONFIG');

    if (stored) {
      const parsed = JSON.parse(stored);
      CONFIG = Object.assign({}, DEFAULT_CONFIG, parsed);
      log('INFO', 'Configuración cargada exitosamente');
    } else {
      log('INFO', 'No hay configuración guardada, usando valores por defecto');
    }
  } catch (error) {
    log('ERROR', 'Error cargando configuración', error);
    CONFIG = Object.assign({}, DEFAULT_CONFIG);
  }

  return CONFIG;
}

/**
 * Guarda la configuración actual en PropertiesService
 * @return {boolean} true si se guardó correctamente
 */
function guardarConfiguracion() {
  try {
    const props = PropertiesService.getUserProperties();
    props.setProperty('CONFIG', JSON.stringify(CONFIG));
    log('INFO', 'Configuración guardada exitosamente');
    return true;
  } catch (error) {
    log('ERROR', 'Error guardando configuración', error);
    return false;
  }
}

/**
 * Actualiza la configuración con nuevos valores
 * @param {Object} newConfig - Nuevos valores de configuración
 * @return {Object} Configuración actualizada
 */
function cambiarConfiguracion(newConfig) {
  if (!newConfig || typeof newConfig !== 'object') {
    throw new Error('La configuración debe ser un objeto válido');
  }

  // Validar antes de aplicar
  validateConfig(newConfig);

  // Merge con configuración actual
  CONFIG = Object.assign({}, CONFIG, newConfig);

  // Guardar
  guardarConfiguracion();

  log('INFO', 'Configuración actualizada', { keys: Object.keys(newConfig) });

  return CONFIG;
}

/**
 * Restablece la configuración a valores por defecto
 * @return {Object} Configuración restablecida
 */
function restablecerConfiguracion() {
  CONFIG = Object.assign({}, DEFAULT_CONFIG);
  guardarConfiguracion();
  log('INFO', 'Configuración restablecida a valores por defecto');
  return CONFIG;
}

// ============================================================================
// PUNTOS DE ENTRADA PRINCIPALES
// ============================================================================

/**
 * Punto de entrada para la aplicación web (UI)
 * Se ejecuta cuando se accede a la URL de la app
 * @return {HtmlOutput} Interfaz de usuario
 */
function doGet() {
  cargarConfiguracion();

  return HtmlService.createHtmlOutputFromFile('UI')
    .setTitle('Attach GMAIL - Configuración')
    .setWidth(900)
    .setHeight(700)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Función principal de sincronización
 * Se ejecuta manualmente o mediante triggers
 * @return {Object} Estadísticas de la sincronización
 */
function syncAttachments() {
  cargarConfiguracion();
  return processSyncAttachments();
}

/**
 * Ejecuta una sincronización de prueba con límite reducido
 * @return {string} Mensaje con el resultado
 */
function testSync() {
  cargarConfiguracion();

  const originalMax = CONFIG.MAX_EMAILS_TO_PROCESS;
  CONFIG.MAX_EMAILS_TO_PROCESS = 5;

  try {
    log('INFO', 'Iniciando sincronización de prueba (5 correos)');
    const result = processSyncAttachments();

    // Devolver objeto completo con todas las estadísticas
    return {
      exito: true,
      correosProcesados: result.correosProcesados,
      adjuntosGuardados: result.adjuntosGuardados,
      errores: result.errores,
      tiempoTotal: Math.round(result.tiempoTotal),
      correosPendientes: result.correosPendientes,
      dominiosProcesados: result.dominiosProcesados || {},
      extensionesProcesadas: result.extensionesProcesadas || {}
    };
  } catch (error) {
    log('ERROR', 'Error en prueba de sincronización', error);
    throw error;
  } finally {
    CONFIG.MAX_EMAILS_TO_PROCESS = originalMax;
  }
}

// ============================================================================
// FUNCIONES EXPUESTAS PARA LA UI
// ============================================================================

/**
 * Obtiene el estado de correos pendientes por procesar
 * @return {string} Mensaje con información de pendientes
 */
function obtenerEstadoPendientes() {
  try {
    cargarConfiguracion();
    const pendientes = countPendingEmails();
    const ejecuciones = Math.ceil(pendientes / CONFIG.MAX_EMAILS_TO_PROCESS);

    return `Hay ${pendientes} correos pendientes por procesar.\n` +
           `Con el límite actual de ${CONFIG.MAX_EMAILS_TO_PROCESS} correos por ejecución, ` +
           `se requerirán aproximadamente ${ejecuciones} ejecución(es) para completar.`;
  } catch (error) {
    log('ERROR', 'Error obteniendo estado de pendientes', error);
    return 'Error al obtener estado de correos pendientes: ' + error.message;
  }
}

/**
 * Configura un trigger automático
 * @param {Object} automationConfig - Configuración de automatización
 * @return {Object} Resultado de la operación
 */
function configureTrigger(automationConfig) {
  try {
    return setupTrigger(automationConfig);
  } catch (error) {
    log('ERROR', 'Error configurando trigger', error);
    return { exito: false, mensaje: error.toString() };
  }
}

/**
 * Elimina la carpeta principal de adjuntos
 * @return {Object} Resultado de la operación
 */
function eliminarCarpetaPrincipal() {
  try {
    return deleteMainFolder();
  } catch (error) {
    log('ERROR', 'Error eliminando carpeta principal', error);
    return { exito: false, mensaje: error.toString() };
  }
}

/**
 * Resetea las etiquetas de correos procesados
 * @return {Object} Resultado de la operación
 */
function resetearEtiquetasProcesados() {
  try {
    return resetProcessedLabels();
  } catch (error) {
    log('ERROR', 'Error reseteando etiquetas', error);
    return { exito: false, mensaje: error.toString() };
  }
}

/**
 * Obtiene los logs de errores guardados
 * @return {Array} Array de logs de error
 */
function obtenerLogsErrores() {
  try {
    const props = PropertiesService.getUserProperties();
    const logs = props.getProperty('ERROR_LOGS');
    return logs ? JSON.parse(logs) : [];
  } catch (error) {
    log('ERROR', 'Error obteniendo logs', error);
    return [];
  }
}

/**
 * Limpia los logs de errores
 * @return {Object} Resultado de la operación
 */
function limpiarLogsErrores() {
  try {
    PropertiesService.getUserProperties().deleteProperty('ERROR_LOGS');
    return { exito: true, mensaje: 'Logs eliminados' };
  } catch (error) {
    log('ERROR', 'Error limpiando logs', error);
    return { exito: false, mensaje: error.toString() };
  }
}

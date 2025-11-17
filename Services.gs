/**
 * Attach GMAIL - Servicios
 * ===============================================================
 *
 * Interacciones con Gmail, Drive y otros servicios de Google
 *
 * @proyecto: Attach GMAIL
 * @versión: 1.1.0
 * @autor: https://github.com/686f6c61
 * @fecha: 2025-11-17
 * @licencia: MIT
 */

// ============================================================================
// OPERACIONES DE GMAIL
// ============================================================================

/**
 * Obtiene correos no procesados según la configuración
 * @param {GmailLabel} processedLabel - Etiqueta de procesados
 * @return {Array<GmailMessage>} Array de mensajes no procesados
 */
function fetchUnprocessedEmails(processedLabel) {
  try {
    const labelName = sanitizeLabelName(processedLabel.getName());
    let query = `has:attachment -label:"${labelName}"`;

    // Añadir filtro de fecha si está configurado
    if (CONFIG.DAYS_TO_LOOK_BACK > 0) {
      const date = new Date();
      date.setDate(date.getDate() - CONFIG.DAYS_TO_LOOK_BACK);
      const formatted = Utilities.formatDate(
        date,
        Session.getScriptTimeZone(),
        "yyyy/MM/dd"
      );
      query += ` after:${formatted}`;
    }

    log('INFO', 'Buscando correos no procesados', { query });

    // Buscar hilos que coincidan
    const threads = GmailApp.search(query, 0, 500);
    const emails = [];

    // Extraer mensajes individuales de los hilos
    for (const thread of threads) {
      const messages = thread.getMessages();
      for (const message of messages) {
        if (message.getAttachments().length > 0) {
          emails.push(message);
        }
      }

      // Detener si alcanzamos el límite
      if (emails.length >= CONFIG.MAX_EMAILS_TO_PROCESS) {
        break;
      }
    }

    log('INFO', `Encontrados ${emails.length} correos no procesados`);
    return emails;

  } catch (error) {
    log('ERROR', 'Error buscando correos no procesados', error);
    throw error;
  }
}

/**
 * Obtiene o crea la etiqueta de correos procesados
 * @return {GmailLabel} Etiqueta de procesados
 */
function getOrCreateProcessedLabel() {
  try {
    let label = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL_NAME);

    if (!label) {
      log('INFO', 'Creando etiqueta de procesados', { name: CONFIG.PROCESSED_LABEL_NAME });
      label = GmailApp.createLabel(CONFIG.PROCESSED_LABEL_NAME);
    }

    return label;
  } catch (error) {
    log('ERROR', 'Error obteniendo/creando etiqueta', error);
    throw error;
  }
}

/**
 * Cuenta cuántos correos quedan pendientes por procesar
 * @return {number} Número de correos pendientes
 */
function countPendingEmails() {
  try {
    const labelName = sanitizeLabelName(CONFIG.PROCESSED_LABEL_NAME);
    let query = `has:attachment -label:"${labelName}"`;

    if (CONFIG.DAYS_TO_LOOK_BACK > 0) {
      const date = new Date();
      date.setDate(date.getDate() - CONFIG.DAYS_TO_LOOK_BACK);
      const formatted = Utilities.formatDate(
        date,
        Session.getScriptTimeZone(),
        'yyyy/MM/dd'
      );
      query += ` after:${formatted}`;
    }

    const threads = GmailApp.search(query, 0, 500);
    return threads.length;

  } catch (error) {
    log('ERROR', 'Error contando correos pendientes', error);
    return -1;
  }
}

/**
 * Resetea las etiquetas de correos procesados
 * @return {Object} Resultado de la operación
 */
function resetProcessedLabels() {
  try {
    const label = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL_NAME);

    if (!label) {
      return {
        exito: false,
        mensaje: `No se encontró la etiqueta "${CONFIG.PROCESSED_LABEL_NAME}"`
      };
    }

    const threads = GmailApp.search(`label:${CONFIG.PROCESSED_LABEL_NAME}`, 0, 500);
    let totalMessages = 0;

    threads.forEach(thread => {
      totalMessages += thread.getMessages().length;
      thread.removeLabel(label);
    });

    log('INFO', 'Etiquetas reseteadas', { threads: threads.length, messages: totalMessages });

    // Enviar notificación
    sendResetNotification(threads.length, totalMessages);

    return {
      exito: true,
      mensaje: `Se resetearon ${threads.length} hilos (${totalMessages} mensajes)`
    };

  } catch (error) {
    log('ERROR', 'Error reseteando etiquetas', error);
    return {
      exito: false,
      mensaje: error.toString()
    };
  }
}

// ============================================================================
// OPERACIONES DE DRIVE
// ============================================================================

// Caché de carpetas para optimizar búsquedas
const FOLDER_CACHE = {};

/**
 * Obtiene o crea una carpeta en Drive
 * @param {string} folderName - Nombre de la carpeta
 * @param {DriveFolder} parentFolder - Carpeta padre (opcional)
 * @return {DriveFolder} Carpeta obtenida o creada
 */
function getOrCreateFolder(folderName, parentFolder = null) {
  try {
    const normalized = normalizeText(folderName);
    const parent = parentFolder || DriveApp.getRootFolder();
    const cacheKey = `${parent.getId()}:${normalized}`;

    // Buscar en caché primero
    if (FOLDER_CACHE[cacheKey]) {
      return FOLDER_CACHE[cacheKey];
    }

    let folder;
    const iterator = parent.getFoldersByName(normalized);

    if (iterator.hasNext()) {
      folder = iterator.next();
      log('INFO', 'Carpeta encontrada', { name: normalized });
    } else {
      folder = parent.createFolder(normalized);
      log('INFO', 'Carpeta creada', { name: normalized });
    }

    // Guardar en caché
    FOLDER_CACHE[cacheKey] = folder;
    return folder;

  } catch (error) {
    log('ERROR', 'Error obteniendo/creando carpeta', { folderName, error });
    throw error;
  }
}

/**
 * Obtiene o crea la carpeta principal de adjuntos
 * @return {DriveFolder} Carpeta principal
 */
function getOrCreateMainFolder() {
  const name = CONFIG.USAR_NOMBRE_USUARIO ?
    normalizeText(getUsername()) :
    CONFIG.MAIN_FOLDER_NAME;

  return getOrCreateFolder(name);
}

/**
 * Verifica si un archivo existe en una carpeta
 * @param {DriveFolder} folder - Carpeta donde buscar
 * @param {string} fileName - Nombre del archivo
 * @return {boolean} true si existe
 */
function fileExistsInFolder(folder, fileName) {
  try {
    const iterator = folder.getFilesByName(fileName);
    return iterator.hasNext();
  } catch (error) {
    log('ERROR', 'Error verificando existencia de archivo', { fileName, error });
    return false;
  }
}

/**
 * Guarda un archivo en Drive con reintentos en caso de fallo
 * @param {DriveFolder} folder - Carpeta destino
 * @param {Blob} blob - Contenido del archivo
 * @param {string} fileName - Nombre del archivo
 * @param {number} maxRetries - Número máximo de reintentos
 * @return {DriveFile} Archivo creado
 */
function saveFileWithRetry(folder, blob, fileName, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const file = folder.createFile(blob).setName(fileName);
      log('INFO', 'Archivo guardado', { fileName });
      return file;

    } catch (error) {
      // Si es el último intento, lanzar el error
      if (i === maxRetries - 1) {
        log('ERROR', 'Error guardando archivo (max reintentos alcanzado)', { fileName, error });
        throw error;
      }

      // Si es error de cuota o rate limit, esperar con backoff exponencial
      if (error.message.includes('quota') ||
          error.message.includes('rate') ||
          error.message.includes('limit')) {
        const waitTime = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        log('WARN', 'Error de cuota/rate limit, reintentando', { fileName, attempt: i + 1, waitMs: waitTime });
        Utilities.sleep(waitTime);
      } else {
        // Si es otro tipo de error, lanzarlo inmediatamente
        log('ERROR', 'Error guardando archivo', { fileName, error });
        throw error;
      }
    }
  }
}

/**
 * Elimina la carpeta principal de adjuntos
 * @return {Object} Resultado de la operación
 */
function deleteMainFolder() {
  try {
    const name = CONFIG.USAR_NOMBRE_USUARIO ?
      normalizeText(getUsername()) :
      CONFIG.MAIN_FOLDER_NAME;

    const folders = DriveApp.getFoldersByName(name);

    if (!folders.hasNext()) {
      return {
        exito: false,
        mensaje: `No se encontró la carpeta "${name}"`
      };
    }

    const folder = folders.next();
    folder.setTrashed(true);

    log('INFO', 'Carpeta principal eliminada', { name });

    return {
      exito: true,
      mensaje: `Carpeta "${name}" eliminada. Puede recuperarla desde la papelera.`
    };

  } catch (error) {
    log('ERROR', 'Error eliminando carpeta principal', error);
    return {
      exito: false,
      mensaje: error.toString()
    };
  }
}

// ============================================================================
// NOTIFICACIONES
// ============================================================================

/**
 * Envía una notificación por email con el resumen de sincronización
 * @param {Object} stats - Estadísticas de la sincronización
 */
function sendSyncNotification(stats) {
  if (!shouldSendNotification()) {
    return;
  }

  try {
    // Usar email personalizado o el del usuario actual
    const email = CONFIG.EMAIL_NOTIFICACION || Session.getActiveUser().getEmail();
    const date = formatDate(new Date(), 'dd/MM/yyyy HH:mm:ss');
    const subject = `✓ Resumen de sincronización - ${date}`;

    let body = '';

    // Añadir mensaje personalizado al inicio si existe
    if (CONFIG.MENSAJE_PERSONALIZADO) {
      body += `${CONFIG.MENSAJE_PERSONALIZADO}\n\n`;
      body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    body += `Sincronización completada el ${date}\n\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `RESUMEN\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    body += `• Correos procesados: ${stats.correosProcesados}\n`;
    body += `• Adjuntos guardados: ${stats.adjuntosGuardados}\n`;
    body += `• Correos pendientes: ${stats.correosPendientes}\n`;
    body += `• Tiempo total: ${Math.round(stats.tiempoTotal)} segundos\n\n`;

    if (stats.correosPendientes > 0) {
      const ejecuciones = Math.ceil(stats.correosPendientes / CONFIG.MAX_EMAILS_TO_PROCESS);
      body += `Se requieren aproximadamente ${ejecuciones} ejecuciones más.\n\n`;
    }

    // Añadir detalles si está configurado
    if (CONFIG.DETALLE_NOTIFICACIONES === 'detallado') {
      if (Object.keys(stats.dominiosProcesados).length > 0) {
        body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        body += `DOMINIOS PROCESADOS\n`;
        body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        for (const [domain, count] of Object.entries(stats.dominiosProcesados)) {
          body += `• ${domain}: ${count} correos\n`;
        }
        body += '\n';
      }

      if (Object.keys(stats.extensionesProcesadas).length > 0) {
        body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        body += `TIPOS DE ARCHIVO\n`;
        body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        for (const [ext, count] of Object.entries(stats.extensionesProcesadas)) {
          body += `• .${ext}: ${count} archivos\n`;
        }
      }
    }

    body += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `Generado por Attach GMAIL v1.1.0\n`;
    body += `https://github.com/686f6c61/attach-gmail-google-script\n`;

    GmailApp.sendEmail(email, subject, body);
    updateLastNotification();

    log('INFO', 'Notificación de sincronización enviada', { email });

  } catch (error) {
    log('ERROR', 'Error enviando notificación de sincronización', error);
  }
}

/**
 * Envía una notificación de error por email
 * @param {Error} error - Error ocurrido
 */
function sendErrorNotification(error) {
  try {
    // Usar email personalizado o el del usuario actual
    const email = CONFIG.EMAIL_NOTIFICACION || Session.getActiveUser().getEmail();
    const date = formatDate(new Date(), 'dd/MM/yyyy HH:mm:ss');
    const subject = `✗ Error en sincronización - ${date}`;

    let body = `Ha ocurrido un error durante la sincronización el ${date}\n\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `ERROR\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    body += `${error.toString()}\n\n`;

    if (error.stack) {
      body += `Stack trace:\n${error.stack}\n\n`;
    }

    body += `Por favor, revise la configuración y los registros del script.\n\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `Generado por Attach GMAIL v1.1.0\n`;

    GmailApp.sendEmail(email, subject, body);

    log('INFO', 'Notificación de error enviada', { email });

  } catch (e) {
    log('ERROR', 'Error enviando notificación de error', e);
  }
}

/**
 * Envía notificación de reseteo de etiquetas
 * @param {number} threads - Número de hilos reseteados
 * @param {number} messages - Número de mensajes reseteados
 */
function sendResetNotification(threads, messages) {
  try {
    const email = Session.getActiveUser().getEmail();
    const date = formatDate(new Date(), 'dd/MM/yyyy HH:mm:ss');
    const subject = `↻ Correos reseteados - ${date}`;

    let body = `Se han reseteado etiquetas de correos procesados el ${date}\n\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `RESUMEN\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    body += `• Hilos de correo reseteados: ${threads}\n`;
    body += `• Mensajes individuales: ${messages}\n\n`;
    body += `Estos correos serán procesados nuevamente en la próxima sincronización.\n\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `Generado por Attach GMAIL v1.1.0\n`;

    GmailApp.sendEmail(email, subject, body);

    log('INFO', 'Notificación de reseteo enviada', { email });

  } catch (error) {
    log('ERROR', 'Error enviando notificación de reseteo', error);
  }
}

/**
 * Determina si se debe enviar una notificación según la frecuencia
 * @return {boolean} true si se debe enviar
 */
function shouldSendNotification() {
  if (!CONFIG.ENVIAR_NOTIFICACIONES || CONFIG.FRECUENCIA_NOTIFICACIONES === 'nunca') {
    return false;
  }

  const props = PropertiesService.getUserProperties();
  const lastNotification = props.getProperty('ULTIMA_NOTIFICACION');

  if (!lastNotification) {
    return true;
  }

  const last = new Date(lastNotification);
  const now = new Date();
  const daysPassed = Math.floor((now - last) / (1000 * 60 * 60 * 24));

  const thresholds = {
    'diaria': 1,
    'semanal': 7,
    'quincenal': 15,
    'mensual': 30
  };

  return daysPassed >= (thresholds[CONFIG.FRECUENCIA_NOTIFICACIONES] || 1);
}

/**
 * Actualiza la marca de tiempo de la última notificación
 */
function updateLastNotification() {
  PropertiesService.getUserProperties()
    .setProperty('ULTIMA_NOTIFICACION', new Date().toISOString());
}

// ============================================================================
// GESTIÓN DE TRIGGERS
// ============================================================================

/**
 * Configura triggers automáticos según la configuración
 * @param {Object} config - Configuración de automatización
 * @return {Object} Resultado de la operación
 */
function setupTrigger(config) {
  try {
    if (!config || !config.ACTIVADO) {
      deleteAllTriggers();
      log('INFO', 'Triggers desactivados');
      return {
        exito: true,
        mensaje: 'Automatización desactivada. Triggers eliminados.'
      };
    }

    // Eliminar triggers existentes
    deleteAllTriggers();

    const trigger = ScriptApp.newTrigger('syncAttachments').timeBased();

    switch (config.FRECUENCIA) {
      case 'horaria':
        trigger.everyHours(config.INTERVALO_HORAS || 1);
        log('INFO', 'Trigger horario configurado', { interval: config.INTERVALO_HORAS || 1 });
        break;

      case 'diaria':
        trigger
          .atHour(config.HORA_EJECUCION || 8)
          .nearMinute(config.MINUTO_EJECUCION || 0)
          .everyDays(1);
        log('INFO', 'Trigger diario configurado', { hour: config.HORA_EJECUCION || 8 });
        break;

      case 'semanal':
        trigger
          .onWeekDay(config.DIA_SEMANA || ScriptApp.WeekDay.MONDAY)
          .atHour(config.HORA_EJECUCION || 8)
          .nearMinute(config.MINUTO_EJECUCION || 0);
        log('INFO', 'Trigger semanal configurado', { day: config.DIA_SEMANA });
        break;

      default:
        trigger.everyHours(1);
        log('INFO', 'Trigger por defecto configurado (cada hora)');
    }

    trigger.create();

    return {
      exito: true,
      mensaje: `Trigger configurado con frecuencia: ${config.FRECUENCIA}`
    };

  } catch (error) {
    log('ERROR', 'Error configurando trigger', error);
    return {
      exito: false,
      mensaje: error.toString()
    };
  }
}

/**
 * Elimina todos los triggers de syncAttachments
 */
function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncAttachments') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  log('INFO', 'Todos los triggers eliminados');
}

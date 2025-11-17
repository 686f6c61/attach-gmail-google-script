/**
 * Attach GMAIL - Utilidades
 * ===============================================================
 *
 * Funciones utilitarias, validadores y sistema de logging
 *
 * @proyecto: Attach GMAIL
 * @versión: 1.1.0
 * @autor: https://github.com/686f6c61
 * @fecha: 2025-11-17
 * @licencia: MIT
 */

// ============================================================================
// UTILIDADES DE TEXTO
// ============================================================================

/**
 * Normaliza texto eliminando acentos y caracteres especiales
 * @param {string} text - Texto a normalizar
 * @return {string} Texto normalizado
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';

  // Mapa de caracteres especiales
  const charMap = {
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
    'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
    'ñ': 'n', 'Ñ': 'N',
    'ü': 'u', 'Ü': 'U',
    'ç': 'c', 'Ç': 'C',
    'à': 'a', 'è': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u',
    'À': 'A', 'È': 'E', 'Ì': 'I', 'Ò': 'O', 'Ù': 'U'
  };

  let normalized = text;

  // Reemplazar caracteres especiales
  for (const [special, normal] of Object.entries(charMap)) {
    normalized = normalized.replace(new RegExp(special, 'g'), normal);
  }

  // Reemplazar caracteres no seguros para nombres de archivos/carpetas
  normalized = normalized.replace(/[\/*?"<>|:]/g, '_');

  // Limitar longitud para evitar errores
  if (normalized.length > 255) {
    normalized = normalized.substring(0, 255);
  }

  return normalized;
}

/**
 * Extrae el dominio y nombre de usuario de una dirección de correo
 * @param {string} emailString - String que contiene el email
 * @return {Object} Objeto con domain y username
 */
function extractDomain(emailString) {
  if (!emailString) {
    return { domain: null, username: null };
  }

  try {
    // Extraer email del formato "Nombre <email@domain.com>"
    const emailMatch = emailString.match(/<([^>]+)>/);
    const fullEmail = emailMatch ? emailMatch[1] : emailString.trim();

    // Validar formato básico de email
    if (!fullEmail.includes('@')) {
      return { domain: null, username: null };
    }

    const parts = fullEmail.split('@');

    if (parts.length === 2) {
      return {
        domain: parts[1].toLowerCase().trim(),
        username: parts[0].toLowerCase().trim()
      };
    }

    return { domain: null, username: null };
  } catch (error) {
    log('ERROR', 'Error extrayendo dominio', { emailString, error });
    return { domain: null, username: null };
  }
}

/**
 * Obtiene la extensión de un archivo
 * @param {string} fileName - Nombre del archivo
 * @return {string} Extensión sin el punto
 */
function getFileExtension(fileName) {
  if (!fileName || typeof fileName !== 'string') return '';

  const parts = fileName.split('.');

  if (parts.length <= 1) {
    return '';
  }

  return parts[parts.length - 1];
}

/**
 * Formatea una fecha según el patrón especificado
 * @param {Date} date - Fecha a formatear
 * @param {string} format - Patrón de formato
 * @return {string} Fecha formateada
 */
function formatDate(date, format) {
  try {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), format);
  } catch (error) {
    log('ERROR', 'Error formateando fecha', error);
    return date.toString();
  }
}

/**
 * Trunca un string a una longitud máxima
 * @param {string} str - String a truncar
 * @param {number} maxLength - Longitud máxima
 * @return {string} String truncado
 */
function truncateString(str, maxLength) {
  if (!str) return '';
  return str.length > maxLength ? str.substring(0, maxLength) : str;
}

// ============================================================================
// FILTROS
// ============================================================================

/**
 * Verifica si un dominio debe ser procesado según la configuración
 * @param {string} domain - Dominio a verificar
 * @return {boolean} true si debe procesarse
 */
function shouldProcessDomain(domain) {
  if (!domain) return false;

  // Verificar exclusiones primero (tienen prioridad)
  if (CONFIG.DOMINIOS_EXCLUIDOS && CONFIG.DOMINIOS_EXCLUIDOS.length > 0) {
    if (matchesPattern(domain, CONFIG.DOMINIOS_EXCLUIDOS)) {
      log('INFO', 'Dominio excluido', { domain });
      return false;
    }
  }

  // Si no hay lista de incluidos, aceptar todos los no excluidos
  if (!CONFIG.DOMINIOS_INCLUIDOS || CONFIG.DOMINIOS_INCLUIDOS.length === 0) {
    return true;
  }

  // Verificar si está en la lista de incluidos
  const included = matchesPattern(domain, CONFIG.DOMINIOS_INCLUIDOS);
  if (!included) {
    log('INFO', 'Dominio no incluido', { domain });
  }
  return included;
}

/**
 * Verifica si un tipo de archivo debe ser procesado
 * @param {string} fileName - Nombre del archivo
 * @return {boolean} true si debe procesarse
 */
function shouldProcessFileType(fileName) {
  const ext = getFileExtension(fileName).toLowerCase();

  if (!ext) return true;

  // Verificar exclusiones primero
  if (CONFIG.EXTENSIONES_EXCLUIDAS && CONFIG.EXTENSIONES_EXCLUIDAS.length > 0) {
    if (includesExtension(CONFIG.EXTENSIONES_EXCLUIDAS, ext)) {
      log('INFO', 'Extensión excluida', { fileName, ext });
      return false;
    }
  }

  // Si no hay lista de permitidas, aceptar todas las no excluidas
  if (!CONFIG.EXTENSIONES_PERMITIDAS || CONFIG.EXTENSIONES_PERMITIDAS.length === 0) {
    return true;
  }

  // Verificar si está en la lista de permitidas
  const allowed = includesExtension(CONFIG.EXTENSIONES_PERMITIDAS, ext);
  if (!allowed) {
    log('INFO', 'Extensión no permitida', { fileName, ext });
  }
  return allowed;
}

/**
 * Verifica si un valor coincide con algún patrón (soporta wildcards)
 * @param {string} value - Valor a verificar
 * @param {Array} patterns - Array de patrones
 * @return {boolean} true si coincide con algún patrón
 */
function matchesPattern(value, patterns) {
  if (!value || !patterns || !Array.isArray(patterns)) return false;

  return patterns.some(pattern => {
    // Coincidencia exacta
    if (value === pattern) return true;

    // Wildcard: *.example.com
    if (pattern.startsWith('*.')) {
      const suffix = pattern.substring(1);
      return value.endsWith(suffix);
    }

    return false;
  });
}

/**
 * Verifica si una extensión está en una lista
 * @param {Array} extensionList - Lista de extensiones
 * @param {string} extension - Extensión a buscar
 * @return {boolean} true si está en la lista
 */
function includesExtension(extensionList, extension) {
  if (!extensionList || !Array.isArray(extensionList)) return false;

  return extensionList.some(ext => {
    const normalized = ext.startsWith('.') ?
      ext.substring(1).toLowerCase() :
      ext.toLowerCase();
    return extension === normalized;
  });
}

// ============================================================================
// VALIDADORES
// ============================================================================

/**
 * Valida un objeto de configuración
 * @param {Object} config - Configuración a validar
 * @return {boolean} true si es válida
 * @throws {Error} Si la validación falla
 */
function validateConfig(config) {
  const rules = {
    MAIN_FOLDER_NAME: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      validate: v => typeof v === 'string' && v.length > 0 && v.length <= 100
    },
    PROCESSED_LABEL_NAME: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      validate: v => typeof v === 'string' && v.length > 0 && v.length <= 100
    },
    MAX_EMAILS_TO_PROCESS: {
      type: 'number',
      min: 1,
      max: 500,
      validate: v => Number.isInteger(v) && v > 0 && v <= 500
    },
    DAYS_TO_LOOK_BACK: {
      type: 'number',
      min: 0,
      validate: v => Number.isInteger(v) && v >= 0
    },
    DOMINIOS_INCLUIDOS: {
      type: 'array',
      validate: v => Array.isArray(v)
    },
    DOMINIOS_EXCLUIDOS: {
      type: 'array',
      validate: v => Array.isArray(v)
    },
    EXTENSIONES_PERMITIDAS: {
      type: 'array',
      validate: v => Array.isArray(v)
    },
    EXTENSIONES_EXCLUIDAS: {
      type: 'array',
      validate: v => Array.isArray(v)
    },
    ENVIAR_NOTIFICACIONES: {
      type: 'boolean',
      validate: v => typeof v === 'boolean'
    }
  };

  const errors = [];

  for (const [key, rule] of Object.entries(rules)) {
    if (config.hasOwnProperty(key)) {
      const value = config[key];

      if (!rule.validate(value)) {
        errors.push(`${key}: valor inválido (${JSON.stringify(value)})`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error('Errores de validación:\n' + errors.join('\n'));
  }

  return true;
}

/**
 * Sanitiza un nombre de archivo
 * @param {string} fileName - Nombre del archivo
 * @return {string} Nombre sanitizado
 * @throws {Error} Si el nombre es inválido
 */
function sanitizeFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('Nombre de archivo inválido');
  }

  if (fileName.length > 255) {
    throw new Error('Nombre de archivo demasiado largo (máx 255 caracteres)');
  }

  return normalizeText(fileName);
}

/**
 * Sanitiza un nombre de etiqueta para usar en queries
 * @param {string} labelName - Nombre de la etiqueta
 * @return {string} Nombre sanitizado
 */
function sanitizeLabelName(labelName) {
  if (!labelName) return '';
  // Escapar comillas dobles y backslashes para queries de Gmail
  return labelName.replace(/["\\]/g, '\\$&');
}

// ============================================================================
// LOGGER
// ============================================================================

/**
 * Registra un mensaje en el log
 * @param {string} level - Nivel del log (INFO, WARN, ERROR)
 * @param {string} message - Mensaje a registrar
 * @param {*} data - Datos adicionales (opcional)
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp: timestamp,
    level: level,
    message: message
  };

  // Construir mensaje de log
  let logMessage = `[${timestamp}] [${level}] ${message}`;

  if (data) {
    if (data instanceof Error) {
      logMessage += `\nError: ${data.toString()}`;
      if (data.stack) {
        logMessage += `\nStack: ${data.stack}`;
      }
      logEntry.error = {
        message: data.toString(),
        stack: data.stack
      };
    } else if (typeof data === 'object') {
      logMessage += `\nData: ${JSON.stringify(data)}`;
      logEntry.data = data;
    } else {
      logMessage += `\nData: ${data}`;
      logEntry.data = data;
    }
  }

  // Log a consola
  console.log(logMessage);

  // Guardar logs de ERROR para auditoría
  if (level === 'ERROR') {
    saveErrorLog(logEntry);
  }
}

/**
 * Guarda un log de error en PropertiesService para auditoría
 * @param {Object} logEntry - Entrada de log a guardar
 */
function saveErrorLog(logEntry) {
  try {
    const props = PropertiesService.getUserProperties();
    const logsJson = props.getProperty('ERROR_LOGS');
    const logs = logsJson ? JSON.parse(logsJson) : [];

    logs.push(logEntry);

    // Mantener solo los últimos 50 errores
    if (logs.length > 50) {
      logs.shift();
    }

    props.setProperty('ERROR_LOGS', JSON.stringify(logs));
  } catch (error) {
    // Si falla el guardado de logs, solo lo registramos en consola
    console.error('Error guardando log de error:', error);
  }
}

/**
 * Obtiene el nombre de usuario del email actual
 * @return {string} Nombre de usuario
 */
function getUsername() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (email && email.includes('@')) {
      return email.split('@')[0];
    }
    return 'Usuario';
  } catch (error) {
    log('ERROR', 'Error obteniendo nombre de usuario', error);
    return 'Usuario';
  }
}

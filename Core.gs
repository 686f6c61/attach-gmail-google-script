/**
 * Attach GMAIL - Core
 * ===============================================================
 *
 * Lógica principal de procesamiento de emails y adjuntos.
 * Orquesta el flujo de sincronización: busca correos no procesados,
 * filtra por dominio y extensión, guarda los adjuntos en Drive
 * y recopila estadísticas.
 *
 * @proyecto Attach GMAIL
 * @autor https://github.com/686f6c61
 * @licencia MIT
 */

// ============================================================================
// SINCRONIZACIÓN PRINCIPAL
// ============================================================================

/**
 * Procesa la sincronización de adjuntos de Gmail a Drive
 * @return {Object} Estadísticas de la sincronización
 */
function processSyncAttachments() {
  const stats = {
    iniciado: new Date(),
    correosProcesados: 0,
    adjuntosGuardados: 0,
    errores: 0,
    correosPendientes: 0,
    dominiosProcesados: {},
    extensionesProcesadas: {}
  };

  try {
    log('INFO', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('INFO', 'INICIANDO SINCRONIZACIÓN DE ADJUNTOS');
    log('INFO', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Contar correos pendientes antes de empezar
    stats.correosPendientes = countPendingEmails();
    log('INFO', `Correos pendientes totales: ${stats.correosPendientes}`);

    // Obtener carpeta principal y etiqueta
    const mainFolder = getOrCreateMainFolder();
    const processedLabel = getOrCreateProcessedLabel();

    // Obtener correos no procesados
    const emails = fetchUnprocessedEmails(processedLabel);

    if (emails.length === 0) {
      log('INFO', 'No hay correos para procesar');
      stats.finalizado = new Date();
      stats.tiempoTotal = (stats.finalizado - stats.iniciado) / 1000;
      return stats;
    }

    log('INFO', `Se procesarán ${emails.length} correos`);

    // Procesar cada email
    let count = 0;
    for (const email of emails) {
      if (count >= CONFIG.MAX_EMAILS_TO_PROCESS) {
        log('INFO', `Límite alcanzado: ${CONFIG.MAX_EMAILS_TO_PROCESS} correos`);
        break;
      }

      const result = processEmail(email, mainFolder, processedLabel);

      // Actualizar estadísticas
      stats.correosProcesados++;

      if (result.adjuntosGuardados) {
        stats.adjuntosGuardados += result.adjuntosGuardados;
      }

      if (result.error) {
        stats.errores++;
      }

      if (result.dominio) {
        stats.dominiosProcesados[result.dominio] =
          (stats.dominiosProcesados[result.dominio] || 0) + 1;
      }

      if (result.extensiones && result.extensiones.length > 0) {
        result.extensiones.forEach(ext => {
          stats.extensionesProcesadas[ext] =
            (stats.extensionesProcesadas[ext] || 0) + 1;
        });
      }

      count++;
    }

    // Finalizar estadísticas
    stats.finalizado = new Date();
    stats.tiempoTotal = (stats.finalizado - stats.iniciado) / 1000;
    stats.correosPendientes = countPendingEmails();

    log('INFO', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('INFO', 'SINCRONIZACIÓN COMPLETADA');
    log('INFO', `Correos procesados: ${stats.correosProcesados}`);
    log('INFO', `Adjuntos guardados: ${stats.adjuntosGuardados}`);
    log('INFO', `Errores: ${stats.errores}`);
    log('INFO', `Tiempo: ${Math.round(stats.tiempoTotal)}s`);
    log('INFO', `Pendientes: ${stats.correosPendientes}`);
    log('INFO', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Enviar notificación si está configurado
    if (CONFIG.ENVIAR_NOTIFICACIONES) {
      sendSyncNotification(stats);
    }

    return stats;

  } catch (error) {
    log('ERROR', 'Error fatal en sincronización', error);

    stats.finalizado = new Date();
    stats.tiempoTotal = (stats.finalizado - stats.iniciado) / 1000;

    // Enviar notificación de error
    if (CONFIG.ENVIAR_NOTIFICACIONES) {
      sendErrorNotification(error);
    }

    throw error;
  }
}

// ============================================================================
// PROCESAMIENTO DE EMAILS
// ============================================================================

/**
 * Procesa un email individual y guarda sus adjuntos
 * @param {GmailMessage} email - Email a procesar
 * @param {DriveFolder} mainFolder - Carpeta principal
 * @param {GmailLabel} processedLabel - Etiqueta de procesados
 * @return {Object} Resultado del procesamiento
 */
function processEmail(email, mainFolder, processedLabel) {
  const result = {
    adjuntosGuardados: 0,
    dominio: null,
    extensiones: [],
    error: null
  };

  try {
    // Obtener información del remitente
    const from = email.getFrom();
    const domainInfo = extractDomain(from);

    if (!domainInfo.domain) {
      log('WARN', 'No se pudo extraer dominio', { from });
      markEmailAsProcessed(email, processedLabel);
      return result;
    }

    result.dominio = domainInfo.domain;

    // Verificar si el dominio debe procesarse
    if (!shouldProcessDomain(domainInfo.domain)) {
      log('INFO', 'Dominio ignorado por filtros', { domain: domainInfo.domain });
      markEmailAsProcessed(email, processedLabel);
      return result;
    }

    // Determinar carpeta de destino
    const targetFolder = determineTargetFolder(mainFolder, email, domainInfo);

    // Obtener adjuntos
    const attachments = email.getAttachments();

    if (attachments.length === 0) {
      log('INFO', 'Email sin adjuntos', { from });
      markEmailAsProcessed(email, processedLabel);
      return result;
    }

    // Procesar cada adjunto
    for (const attachment of attachments) {
      const fileName = attachment.getName();

      // Validar nombre de archivo
      if (!fileName || fileName.toLowerCase().startsWith('untitled.')) {
        log('INFO', 'Adjunto ignorado (sin nombre válido)', { fileName });
        continue;
      }

      // Verificar tipo de archivo
      if (!shouldProcessFileType(fileName)) {
        log('INFO', 'Tipo de archivo no permitido', { fileName });
        continue;
      }

      // Normalizar nombre
      const normalizedName = sanitizeFileName(fileName);

      // Verificar si ya existe
      if (fileExistsInFolder(targetFolder, normalizedName)) {
        log('INFO', 'Archivo ya existe', { fileName: normalizedName });
        continue;
      }

      // Guardar archivo
      try {
        saveFileWithRetry(targetFolder, attachment.copyBlob(), normalizedName);
        result.adjuntosGuardados++;

        // Registrar extensión
        const ext = getFileExtension(fileName).toLowerCase();
        if (ext && !result.extensiones.includes(ext)) {
          result.extensiones.push(ext);
        }

      } catch (saveError) {
        log('ERROR', 'Error guardando adjunto específico', { fileName, error: saveError });
        result.error = saveError.toString();
      }
    }

    // Marcar email como procesado
    markEmailAsProcessed(email, processedLabel);

    log('INFO', 'Email procesado', {
      from,
      adjuntos: result.adjuntosGuardados,
      total: attachments.length
    });

  } catch (error) {
    log('ERROR', 'Error procesando email', error);
    result.error = error.toString();
  }

  return result;
}

/**
 * Marca un email como procesado añadiendo la etiqueta
 * @param {GmailMessage} email - Email a marcar
 * @param {GmailLabel} label - Etiqueta a aplicar
 */
function markEmailAsProcessed(email, label) {
  try {
    email.getThread().addLabel(label);
  } catch (error) {
    log('ERROR', 'Error marcando email como procesado', error);
  }
}

// ============================================================================
// DETERMINACIÓN DE CARPETA DESTINO
// ============================================================================

/**
 * Determina la carpeta de destino para los adjuntos de un email
 * @param {DriveFolder} mainFolder - Carpeta principal
 * @param {GmailMessage} email - Email siendo procesado
 * @param {Object} domainInfo - Información del dominio (domain, username)
 * @return {DriveFolder} Carpeta de destino
 */
function determineTargetFolder(mainFolder, email, domainInfo) {
  let baseFolder;

  // Estrategia 1: Intentar usar patrón de asunto si está activado
  if (CONFIG.USAR_PATRONES_ASUNTO) {
    const pattern = extractSubjectPattern(email.getSubject());
    if (pattern) {
      baseFolder = getOrCreateFolder(pattern, mainFolder);
      log('INFO', 'Usando carpeta basada en patrón de asunto', { pattern });
      return createEmailSubfolder(baseFolder, email);
    }
  }

  // Estrategia 2: Usar dominio o usuario@dominio
  let folderName = domainInfo.domain;

  if (CONFIG.USAR_NOMBRE_PARA_DOMINIOS_GENERICOS &&
      CONFIG.DOMINIOS_GENERICOS.includes(domainInfo.domain) &&
      domainInfo.username) {
    folderName = `${domainInfo.username}@${domainInfo.domain}`;
    log('INFO', 'Usando carpeta con nombre de usuario', { folderName });
  }

  baseFolder = getOrCreateFolder(folderName, mainFolder);

  // Crear subcarpeta específica para este email
  return createEmailSubfolder(baseFolder, email);
}

/**
 * Crea una subcarpeta para un email específico con fecha y asunto
 * @param {DriveFolder} baseFolder - Carpeta base
 * @param {GmailMessage} email - Email
 * @return {DriveFolder} Subcarpeta creada
 */
function createEmailSubfolder(baseFolder, email) {
  const date = formatDate(email.getDate(), 'yyyy-MM-dd');
  const subject = email.getSubject() || 'Sin asunto';
  const shortSubject = truncateString(subject, 30);
  const emailFolderName = `${date} - ${shortSubject}`;

  return getOrCreateFolder(emailFolderName, baseFolder);
}

/**
 * Extrae un patrón del asunto del email si coincide con los configurados
 * @param {string} subject - Asunto del email
 * @return {string|null} Patrón encontrado o null
 */
function extractSubjectPattern(subject) {
  if (!CONFIG.USAR_PATRONES_ASUNTO ||
      !CONFIG.PATRONES_ASUNTO ||
      CONFIG.PATRONES_ASUNTO.length === 0) {
    return null;
  }

  if (!subject) {
    return null;
  }

  // Normalizar asunto para búsqueda
  const normalizedSubject = normalizeText(subject).toLowerCase();

  for (const pattern of CONFIG.PATRONES_ASUNTO) {
    const normalizedPattern = normalizeText(pattern).toLowerCase();

    if (normalizedSubject.includes(normalizedPattern)) {
      // Encontrar la posición en el asunto original
      const index = normalizedSubject.indexOf(normalizedPattern);

      if (index === -1) continue;

      // Extraer desde el asunto original para preservar mayúsculas
      const remaining = subject.substring(index);

      // Intentar capturar un ID completo (letras, números, guiones)
      const idMatch = remaining.match(/^([A-Za-z0-9\-_]+)/);

      if (idMatch && idMatch[1]) {
        log('INFO', 'Patrón de asunto encontrado', { pattern: idMatch[1] });
        return idMatch[1];
      }

      // Si no hay ID, devolver el patrón original
      return pattern;
    }
  }

  return null;
}

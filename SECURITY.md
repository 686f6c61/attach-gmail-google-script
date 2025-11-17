# Política de Seguridad

## Filosofía de Seguridad

La seguridad y la privacidad de los datos son fundamentales para el diseño de **Attach GMAIL**. Este script ha sido desarrollado con un enfoque de "privacidad por diseño", asegurando que el control de los datos permanezca en todo momento en manos del usuario. Nuestra política se basa en la transparencia total y la minimización de la exposición de datos.

## Modelo de Ejecución y Flujo de Datos

-   **Ejecución Exclusiva en el Entorno de Google**: El código de `Attach GMAIL` se ejecuta íntegramente en la infraestructura de Google Apps Script, dentro del entorno de la cuenta de Google del propio usuario. No hay componentes de servidor de terceros involucrados.
-   **Sin Recopilación de Datos Externos**: El script no recopila, almacena, transmite ni procesa ninguna información personal o de contenido fuera de los servicios de Google (Gmail y Google Drive) del usuario. La configuración y los metadatos de estado (como la fecha de la última notificación) se almacenan en `PropertiesService`, un servicio de Google Apps Script que guarda los datos dentro de la cuenta del usuario.
-   **Acceso Cero por Parte del Desarrollador**: El desarrollador (`686f6c61`) no tiene acceso a las cuentas de los usuarios, a sus datos, a los adjuntos procesados ni a la configuración del script en ningún momento.

## Permisos Requeridos

Durante la autorización inicial, el script solicita los siguientes permisos de OAuth 2.0. A continuación se detalla el propósito de cada uno:

-   `https://www.googleapis.com/auth/gmail.readonly`: Para leer los correos electrónicos y sus adjuntos.
-   `https://www.googleapis.com/auth/gmail.modify`: Para aplicar etiquetas a los correos que ya han sido procesados, evitando así la duplicación de datos.
-   `https://www.googleapis.com/auth/drive`: Para crear carpetas y guardar los archivos adjuntos en el Google Drive del usuario.
-   `https://www.googleapis.com/auth/script.container.ui`: Para mostrar la interfaz de usuario de configuración.
-   `https://www.googleapis.com/auth/script.send_mail`: Para enviar correos electrónicos de notificación al propio usuario.
-   `https://www.googleapis.com/auth/script.storage`: Para guardar la configuración del script.

Estos permisos se utilizan exclusivamente para las funcionalidades descritas y no para otros fines.

## Reporte de Vulnerabilidades

La seguridad es un esfuerzo colaborativo. Si descubre una vulnerabilidad de seguridad, le agradecemos que nos la comunique de forma responsable. Valoramos la contribución de la comunidad para mantener la seguridad de este proyecto.

### Cómo Reportar una Vulnerabilidad

1.  **Cree un "Issue" en GitHub**: Por favor, abra un nuevo issue en el [repositorio del proyecto](https://github.com/686f6c61/attach-gmail-google-script/issues).
2.  **Proporcione Detalles Claros**: En su reporte, incluya la siguiente información:
    -   Una descripción clara y concisa de la vulnerabilidad.
    -   Pasos detallados para reproducir el problema.
    -   El impacto potencial de la vulnerabilidad.
    -   Cualquier otra información técnica relevante.

### Nuestro Compromiso

-   Nos comprometemos a investigar todos los reportes de vulnerabilidades de manera oportuna.
-   Trabajaremos diligentemente para verificar y solucionar cualquier problema confirmado.
-   Mantendremos una comunicación abierta con el reportante durante todo el proceso.

## Cumplimiento Normativo

Aunque `Attach GMAIL` es una herramienta de código abierto y no un servicio comercial, su diseño respeta los principios de normativas de protección de datos como el GDPR:

-   **Minimización de Datos**: El script solo accede a los datos estrictamente necesarios para su funcionamiento.
-   **Limitación de la Finalidad**: Los datos se utilizan únicamente para el propósito explícito de sincronizar adjuntos de correo electrónico.
-   **Control del Usuario**: El usuario tiene control total sobre la ejecución del script, la configuración y los datos procesados.

## Contacto

Para cualquier pregunta o aclaración sobre la seguridad de este proyecto, no dude en abrir un issue en el repositorio de GitHub.

---

*Última actualización: 2025-07-19*
# Fase 2 · Disponibilidad y solicitudes de reserva
Cómo funciona:
1. El calendario del inicio marca las noches ocupadas de la cabaña elegida (se leen de Firestore).
2. Al pulsar **Ver disponibilidad** se abre un formulario de solicitud (nombre, teléfono, correo). No se cobra nada: la solicitud queda **pendiente**.
3. Llegan dos correos: al huésped ("recibimos tu solicitud") y al dueño, con botones **Confirmar / No disponible**.
4. Al confirmar, las fechas quedan ocupadas en el sitio y el huésped recibe el correo de confirmación. La seña se cobra por transferencia o WhatsApp.

**Modo demo:** sin claves (o con `npm run dev`) todo funciona con datos de ejemplo guardados en el navegador, con un botón "Simular que el dueño confirma". Sirve para presentar el flujo.

**Modo real (Vercel):** las funciones están en `api/`. Pasos:
1. Crea un proyecto en Firebase → Firestore Database (modo producción, reglas por defecto: nadie accede desde el navegador).
2. Firebase → Configuración del proyecto → Cuentas de servicio → *Generar nueva clave privada*. Pega el JSON completo en `FIREBASE_SERVICE_ACCOUNT`.
3. Crea una cuenta en resend.com, una API key (`RESEND_API_KEY`) y verifica el dominio del remitente (`MAIL_FROM`). Pon el correo del dueño en `OWNER_EMAIL`.
4. Define `RESERVAS_SECRET` y el resto según `.env.example`, y vuelve a desplegar.

Las reservas se guardan en la colección `reservas` (campo `estado`: pendiente, confirmada o rechazada). Solo las **confirmadas** bloquean fechas.

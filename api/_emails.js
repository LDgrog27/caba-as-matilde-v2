/* Plantillas de correo (HTML sencillo, con estilos en línea). */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mxn = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX') + ' MXN';
const fecha = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const WA = () => process.env.WHATSAPP || '528125800115';

const marco = (titulo, cuerpo) => `<!doctype html><html lang="es"><body style="margin:0;background:#f6efe9;font-family:Arial,Helvetica,sans-serif;color:#2b1a1d">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #ead9cf">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#a3243a">Cabañas Matilde · Sierra de Arteaga</p>
<h1 style="margin:0 0 16px;font-size:24px;font-weight:600">${titulo}</h1>${cuerpo}</div>
<p style="font-size:12px;color:#8a7468;text-align:center;margin:14px 0 0">Este correo se envió desde el sitio de Cabañas Matilde.</p></div></body></html>`;

const filas = (r) => `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">${[
  ['Código', r.codigo], ['Cabaña', r.cabanaNombre], ['Llegada', fecha(r.entrada)], ['Salida', fecha(r.salida)],
  ['Noches', r.noches], ['Huéspedes', `${r.adultos} adulto(s)` + (r.ninos ? `, ${r.ninos} niño(s)` : '') + (r.mascotas ? ' · con mascota' : '')],
  ['Total estimado', mxn(r.total)], ['Seña', mxn(r.adelanto)],
].map(([k, v]) => `<tr><td style="padding:6px 0;color:#8a7468;width:38%">${k}</td><td style="padding:6px 0"><strong>${esc(v)}</strong></td></tr>`).join('')}</table>`;

const boton = (href, txt, color = '#a3243a') => `<a href="${esc(href)}" style="display:inline-block;margin:6px 8px 6px 0;padding:12px 20px;border-radius:999px;background:${color};color:#fff;text-decoration:none;font-size:14px">${txt}</a>`;

/** Al huésped: recibimos tu solicitud. */
export const correoHuesped = (r) => ({
  subject: `Recibimos tu solicitud ${r.codigo} · Cabañas Matilde`,
  html: marco(`Hola ${esc(r.nombre.split(' ')[0])}, recibimos tu solicitud`,
    `<p style="line-height:1.6">Gracias por elegirnos. Revisaremos la disponibilidad y te confirmaremos muy pronto por correo o WhatsApp, junto con los datos para pagar la seña.</p>${filas(r)}
<p style="font-size:13px;color:#8a7468;line-height:1.5">Todavía no se ha cobrado nada ni la fecha está apartada hasta que confirmemos.</p>
${boton('https://wa.me/' + WA() + '?text=' + encodeURIComponent('Hola, tengo una duda sobre mi solicitud ' + r.codigo), 'Escribirnos por WhatsApp', '#25D366')}`),
});

/** Al dueño: nueva solicitud, con enlaces para confirmar o rechazar. */
export const correoDueno = (r, links) => ({
  subject: `Nueva solicitud ${r.codigo}: ${r.cabanaNombre}, ${r.entrada} → ${r.salida}`,
  html: marco('Nueva solicitud de reserva',
    `${filas(r)}<p style="font-size:14px;line-height:1.6;margin:0 0 6px"><strong>${esc(r.nombre)}</strong><br>
Tel/WhatsApp: ${esc(r.telefono)}<br>Correo: ${esc(r.email)}${r.notas ? `<br>Comentarios: ${esc(r.notas)}` : ''}</p>
${links ? `<p style="margin:16px 0 4px;font-size:13px;color:#8a7468">Al confirmar, las fechas quedan ocupadas en el sitio y el huésped recibe un correo.</p>${boton(links.confirmar, 'Confirmar reserva', '#2e7d4f')}${boton(links.rechazar, 'No disponible', '#a3243a')}` : '<p style="font-size:13px;color:#8a7468">Configura RESERVAS_SECRET para recibir aquí los botones de confirmar o rechazar.</p>'}
${boton('https://wa.me/' + String(r.telefono).replace(/\D/g, ''), 'Responder por WhatsApp', '#25D366')}`),
});

/** Al huésped: la solicitud fue confirmada o rechazada. */
export const correoEstado = (r, estado) => estado === 'confirmada'
  ? { subject: `¡Reserva confirmada! ${r.codigo} · Cabañas Matilde`,
      html: marco('¡Tu reserva está confirmada!', `<p style="line-height:1.6">Hola ${esc(r.nombre.split(' ')[0])}, tenemos disponible ${esc(r.cabanaNombre)} para tus fechas. Para dejarla apartada, envía la seña de <strong>${mxn(r.adelanto)}</strong>; te compartimos los datos por WhatsApp.</p>${filas(r)}
<p style="font-size:13px;color:#8a7468;line-height:1.5">Check-in desde las 10:00 AM · Check-out a la 1:00 PM (máximo 2:00 PM).</p>${boton('https://wa.me/' + WA() + '?text=' + encodeURIComponent('Hola, mi reserva ' + r.codigo + ' fue confirmada. ¿Me pasas los datos para la seña?'), 'Pedir datos de la seña', '#25D366')}`) }
  : { subject: `Sobre tu solicitud ${r.codigo} · Cabañas Matilde`,
      html: marco('No tenemos disponibilidad', `<p style="line-height:1.6">Hola ${esc(r.nombre.split(' ')[0])}, lamentablemente ${esc(r.cabanaNombre)} no está disponible para esas fechas. Escríbenos y buscamos otra cabaña o fecha que te funcione.</p>${filas(r)}${boton('https://wa.me/' + WA(), 'Escribirnos por WhatsApp', '#25D366')}`) };

export { esc };

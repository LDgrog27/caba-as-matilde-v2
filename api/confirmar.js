/* GET  /api/confirmar?id=&accion=confirmar|rechazar&t=  → página con un botón (así los
                                                          escáneres de correo no confirman solos)
   POST /api/confirmar  (mismos datos)                    → aplica el cambio y avisa al huésped. */
import { getDb, hayConflicto, tokenValido, correo } from './_lib.js';
import { correoEstado, esc } from './_emails.js';

const pagina = (res, status, titulo, cuerpo) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title></head>
<body style="margin:0;background:#140c0e;color:#fff8f8;font-family:Arial,Helvetica,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px">
<main style="max-width:460px;background:#1c1013;border:1px solid #3a2328;border-radius:20px;padding:28px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#e8a08a">Cabañas Matilde</p><h1 style="margin:0 0 14px;font-size:24px">${esc(titulo)}</h1>${cuerpo}</main></body></html>`);
};
const boton = (txt, color) => `<button style="margin-top:16px;padding:13px 22px;border:0;border-radius:999px;background:${color};color:#fff;font-size:15px;cursor:pointer">${txt}</button>`;

export default async (req, res) => {
  const db = await getDb();
  if (!db) return pagina(res, 503, 'Sin configurar', '<p>La base de datos aún no está configurada.</p>');
  const src = req.method === 'POST' ? (typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body || {}) : req.query || {};
  const { id, accion, t } = src;
  if (!id || !['confirmar', 'rechazar'].includes(accion) || !tokenValido(id, accion, t)) {
    return pagina(res, 403, 'Enlace no válido', '<p>Este enlace no es válido o ya venció.</p>');
  }
  try {
    const ref = db.collection('reservas').doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) return pagina(res, 404, 'No encontrada', '<p>No existe esa solicitud.</p>');
    const r = snap.data();
    const resumen = `<p style="line-height:1.6"><strong>${esc(r.cabanaNombre)}</strong><br>${esc(r.entrada)} → ${esc(r.salida)} (${r.noches} noche/s)<br>${esc(r.nombre)} · ${esc(r.telefono)}</p>`;

    if (r.estado !== 'pendiente') return pagina(res, 200, 'Ya estaba resuelta', `${resumen}<p>Estado actual: <strong>${esc(r.estado)}</strong>.</p>`);

    if (req.method !== 'POST') {
      const ok = accion === 'confirmar';
      return pagina(res, 200, ok ? 'Confirmar reserva' : 'Marcar como no disponible',
        `${resumen}<form method="POST" action="/api/confirmar"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="accion" value="${esc(accion)}"><input type="hidden" name="t" value="${esc(t)}">${boton(ok ? 'Sí, confirmar' : 'Sí, rechazar', ok ? '#2e7d4f' : '#a3243a')}</form>`);
    }

    if (accion === 'confirmar' && await hayConflicto(db, r.cabana, r.entrada, r.salida, snap.id)) {
      return pagina(res, 409, 'Fechas ocupadas', `${resumen}<p>Otra reserva ya confirmada ocupa esas fechas. No se confirmó.</p>`);
    }
    const estado = accion === 'confirmar' ? 'confirmada' : 'rechazada';
    await ref.update({ estado, actualizada: new Date().toISOString() });
    const enviado = await correo({ to: r.email, ...correoEstado(r, estado) });
    return pagina(res, 200, estado === 'confirmada' ? '¡Reserva confirmada!' : 'Solicitud rechazada',
      `${resumen}<p>${enviado ? 'Le avisamos al huésped por correo.' : 'Recuerda avisar al huésped por WhatsApp.'}</p>`);
  } catch (e) {
    console.error('confirmar', e);
    return pagina(res, 500, 'Error', '<p>No se pudo completar la acción. Inténtalo de nuevo.</p>');
  }
};

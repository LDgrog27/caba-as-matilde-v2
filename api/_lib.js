/* Utilidades compartidas de las funciones de Vercel (Fase 2). */
import crypto from 'node:crypto';

let _db = null;
/** Firestore (firebase-admin). Devuelve null si no hay credenciales: la web entra en modo demo. */
async function getDb() {
  if (_db) return _db;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(raw)) });
  _db = getFirestore();
  return _db;
}
const __setDb = (db) => { _db = db; }; // solo para pruebas

/** Fecha de hoy en AAAA-MM-DD según la zona de las cabañas. */
const hoyMx = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey' }).format(new Date());
const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** ¿Alguna reserva confirmada de la cabaña se cruza con [entrada, salida)? */
async function hayConflicto(db, cabana, entrada, salida, exceptoId) {
  const snap = await db.collection('reservas').where('cabana', '==', cabana).where('estado', '==', 'confirmada').get();
  return snap.docs.some((d) => d.id !== exceptoId && entrada < d.data().salida && d.data().entrada < salida);
}

/* Enlaces firmados para que el dueño confirme o rechace desde su correo */
const secreto = () => process.env.RESERVAS_SECRET || '';
function token(id, accion) {
  if (!secreto()) return '';
  return crypto.createHmac('sha256', secreto()).update(id + ':' + accion).digest('hex').slice(0, 32);
}
function tokenValido(id, accion, t) {
  const esperado = token(id, accion);
  if (!esperado || typeof t !== 'string' || t.length !== esperado.length) return false;
  return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(t));
}
const baseUrl = (req) => process.env.SITE_URL || 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);

/** Envía un correo con Resend. Devuelve true/false (nunca lanza: el correo no debe romper la reserva). */
async function correo({ to, subject, html, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to || (Array.isArray(to) && !to.length)) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Cabañas Matilde <onboarding@resend.dev>',
        to: Array.isArray(to) ? to : [to], subject, html, reply_to: replyTo || undefined,
      }),
    });
    return r.ok;
  } catch (e) { return false; }
}

const json = (res, status, obj) => { res.setHeader('Cache-Control', 'no-store'); res.status(status).json(obj); };
const lista = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

export { getDb, __setDb, hoyMx, esFecha, diasEntre, hayConflicto, token, tokenValido, baseUrl, correo, json, lista };

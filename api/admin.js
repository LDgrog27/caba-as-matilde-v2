/* POST /api/admin  { accion, ... }  → panel del dueño.
   accion: login | listar | estado | crear | eliminar
   Se entra con ADMIN_PASSWORD; la sesión es un token firmado que dura 12 h. */
import crypto from 'node:crypto';
import { getDb, hoyMx, esFecha, diasEntre, hayConflicto, correo, json } from './_lib.js';
import { correoEstado } from './_emails.js';

const clave = () => (process.env.ADMIN_PASSWORD || '') + '|' + (process.env.RESERVAS_SECRET || '');
const firma = (exp) => crypto.createHmac('sha256', clave()).update('admin:' + exp).digest('hex').slice(0, 40);
const crearToken = () => { const exp = Date.now() + 12 * 36e5; return exp + '.' + firma(exp); };
function tokenOk(t) {
  if (!process.env.ADMIN_PASSWORD || typeof t !== 'string') return false;
  const [exp, f] = t.split('.');
  if (!(Number(exp) > Date.now()) || !f) return false;
  const e = firma(exp);
  return f.length === e.length && crypto.timingSafeEqual(Buffer.from(f), Buffer.from(e));
}
const igual = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
const txt = (v, n) => String(v ?? '').trim().slice(0, n);

export default async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido.' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  if (!process.env.ADMIN_PASSWORD) return json(res, 503, { error: 'Falta configurar ADMIN_PASSWORD en Vercel.' });

  if (b.accion === 'login') {
    if (!igual(b.clave ?? '', process.env.ADMIN_PASSWORD)) {
      await new Promise((r) => setTimeout(r, 900)); // frena la fuerza bruta
      return json(res, 401, { error: 'Contraseña incorrecta.' });
    }
    return json(res, 200, { ok: true, token: crearToken() });
  }

  if (!tokenOk(req.headers.authorization?.replace(/^Bearer /, ''))) return json(res, 401, { error: 'Sesión vencida.', sesion: false });
  const db = await getDb();
  if (!db) return json(res, 503, { error: 'La base de datos no está configurada.' });

  try {
    if (b.accion === 'listar') {
      const snap = await db.collection('reservas').get();
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, c) => (c.creada || '').localeCompare(a.creada || ''));
      return json(res, 200, { ok: true, hoy: hoyMx(), items });
    }

    if (b.accion === 'estado') {
      const ref = db.collection('reservas').doc(String(b.id));
      const snap = await ref.get();
      if (!snap.exists) return json(res, 404, { error: 'No existe esa reserva.' });
      const r = snap.data();
      const estado = b.estado;
      if (!['confirmada', 'rechazada', 'cancelada'].includes(estado)) return json(res, 400, { error: 'Estado no válido.' });
      if (estado === 'confirmada' && await hayConflicto(db, r.cabana, r.entrada, r.salida, snap.id)) {
        return json(res, 409, { error: 'Otra reserva confirmada ocupa esas fechas.' });
      }
      await ref.update({ estado, actualizada: new Date().toISOString() });
      let avisado = false;
      if (r.email && r.tipo !== 'bloqueo' && ['confirmada', 'rechazada'].includes(estado) && b.avisar !== false) {
        avisado = await correo({ to: r.email, ...correoEstado(r, estado) });
      }
      return json(res, 200, { ok: true, avisado });
    }

    if (b.accion === 'crear') {
      const bloqueo = b.tipo === 'bloqueo';
      const r = {
        cabana: txt(b.cabana, 60), cabanaNombre: txt(b.cabanaNombre, 80),
        entrada: txt(b.entrada, 10), salida: txt(b.salida, 10),
        tipo: bloqueo ? 'bloqueo' : 'manual',
        nombre: txt(b.nombre, 120) || (bloqueo ? 'Bloqueo' : ''),
        telefono: txt(b.telefono, 40), email: txt(b.email, 120), notas: txt(b.notas, 500),
        adultos: 0, ninos: 0, mascotas: 0, total: 0, adelanto: 0,
      };
      if (!/^[a-z0-9-]{1,60}$/.test(r.cabana)) return json(res, 400, { error: 'Cabaña no válida.' });
      if (!esFecha(r.entrada) || !esFecha(r.salida)) return json(res, 400, { error: 'Fechas no válidas.' });
      r.noches = diasEntre(r.entrada, r.salida);
      if (r.noches < 1 || r.noches > 365) return json(res, 400, { error: 'La salida debe ser posterior a la llegada.' });
      if (!bloqueo && r.nombre.length < 2) return json(res, 400, { error: 'Falta el nombre del huésped.' });
      if (await hayConflicto(db, r.cabana, r.entrada, r.salida)) return json(res, 409, { error: 'Esas noches ya están ocupadas.' });
      r.codigo = (bloqueo ? 'BLQ-' : 'MAT-') + crypto.randomBytes(3).toString('hex').toUpperCase();
      r.estado = 'confirmada';
      r.creada = new Date().toISOString();
      await db.collection('reservas').add(r);
      return json(res, 200, { ok: true });
    }

    if (b.accion === 'eliminar') {
      await db.collection('reservas').doc(String(b.id)).delete();
      return json(res, 200, { ok: true });
    }
    return json(res, 400, { error: 'Acción no válida.' });
  } catch (e) {
    console.error('admin', e);
    return json(res, 500, { error: 'Error del servidor.' });
  }
};

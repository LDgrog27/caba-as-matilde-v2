/* POST /api/solicitud → guarda la solicitud (pendiente) y envía los correos. */
import crypto from 'node:crypto';
import { getDb, hoyMx, esFecha, diasEntre, hayConflicto, token, baseUrl, correo, json, lista } from './_lib.js';
import { correoHuesped, correoDueno } from './_emails.js';

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const entero = (v, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };

export default async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido.' });
  const db = await getDb();
  if (!db) return json(res, 503, { modo: 'demo' });

  let b = req.body;
  try { if (typeof b === 'string') b = JSON.parse(b); } catch (e) { b = null; }
  if (!b || typeof b !== 'object') return json(res, 400, { error: 'Datos no válidos.' });
  if (b.web) return json(res, 200, { ok: true, codigo: 'MAT-00000' }); // campo trampa: un robot lo llenó

  const r = {
    cabana: texto(b.cabana, 60), cabanaNombre: texto(b.cabanaNombre, 60),
    entrada: b.entrada, salida: b.salida,
    adultos: entero(b.adultos, 1, 30), ninos: entero(b.ninos, 0, 30), mascotas: !!b.mascotas,
    total: Math.round(Number(b.total)), adelanto: Math.round(Number(b.adelanto)),
    nombre: texto(b.nombre, 80), telefono: texto(b.telefono, 25), email: texto(b.email, 120), notas: texto(b.notas, 400),
  };
  if (!/^[a-z0-9-]+$/.test(r.cabana) || !r.cabanaNombre) return json(res, 400, { error: 'Cabaña no válida.' });
  if (!esFecha(r.entrada) || !esFecha(r.salida)) return json(res, 400, { error: 'Fechas no válidas.' });
  r.noches = diasEntre(r.entrada, r.salida);
  if (r.noches < 1 || r.noches > 60) return json(res, 400, { error: 'Elige entre 1 y 60 noches.' });
  if (r.entrada < hoyMx()) return json(res, 400, { error: 'La fecha de llegada ya pasó.' });
  if (r.adultos === null || r.ninos === null) return json(res, 400, { error: 'Número de huéspedes no válido.' });
  if (!(r.total >= 0 && r.total < 1e7) || !(r.adelanto >= 0 && r.adelanto <= r.total)) return json(res, 400, { error: 'Montos no válidos.' });
  if (r.nombre.length < 3) return json(res, 400, { error: 'Escribe tu nombre completo.' });
  if (r.telefono.replace(/\D/g, '').length < 8) return json(res, 400, { error: 'Teléfono no válido.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email)) return json(res, 400, { error: 'Correo no válido.' });

  try {
    if (await hayConflicto(db, r.cabana, r.entrada, r.salida)) {
      return json(res, 409, { error: 'Esas fechas ya no están disponibles. Elige otras.' });
    }
    r.codigo = 'MAT-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    r.estado = 'pendiente';
    r.creada = new Date().toISOString();
    const ref = await db.collection('reservas').add(r);

    const base = baseUrl(req);
    const enlace = (accion) => `${base}/api/confirmar?id=${ref.id}&accion=${accion}&t=${token(ref.id, accion)}`;
    const links = token(ref.id, 'confirmar') ? { confirmar: enlace('confirmar'), rechazar: enlace('rechazar') } : null;
    const h = correoHuesped(r), d = correoDueno(r, links);
    const [okHuesped] = await Promise.all([
      correo({ to: r.email, ...h }),
      correo({ to: lista(process.env.OWNER_EMAIL), replyTo: r.email, ...d }),
    ]);
    json(res, 200, { ok: true, codigo: r.codigo, correo: okHuesped });
  } catch (e) {
    console.error('solicitud', e);
    json(res, 500, { error: 'No se pudo guardar la solicitud. Inténtalo de nuevo o escríbenos por WhatsApp.' });
  }
};

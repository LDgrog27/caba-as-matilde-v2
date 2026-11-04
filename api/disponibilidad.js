/* GET /api/disponibilidad?cabana=casa-oso → noches ocupadas (reservas confirmadas). */
import { getDb, hoyMx, json } from './_lib.js';

export default async (req, res) => {
  const db = await getDb();
  if (!db) return json(res, 503, { modo: 'demo' });
  const cabana = String((req.query && req.query.cabana) || '');
  if (!/^[a-z0-9-]{1,60}$/.test(cabana)) return json(res, 400, { error: 'Cabaña no válida.' });
  try {
    const snap = await db.collection('reservas').where('cabana', '==', cabana).where('estado', '==', 'confirmada').get();
    const hoy = hoyMx();
    const ocupadas = snap.docs.map((d) => d.data()).filter((r) => r.salida > hoy).map((r) => ({ entrada: r.entrada, salida: r.salida }));
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
    res.status(200).json({ modo: 'real', ocupadas });
  } catch (e) {
    console.error('disponibilidad', e);
    json(res, 500, { error: 'No se pudo consultar la disponibilidad.' });
  }
};

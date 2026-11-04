/**
 * Disponibilidad y solicitudes de reserva (Fase 2).
 *
 * Dos modos, elegidos solos:
 *  - REAL: si existen las funciones de Vercel (/api/*) y tienen Firestore configurado.
 *  - DEMO: si no (por ejemplo en `npm run dev` o sin claves). Los datos se guardan solo
 *    en el navegador y se siembran reservas de ejemplo para poder presentar el flujo.
 *
 * Las fechas viajan siempre como texto "AAAA-MM-DD". Una reserva ocupa las noches
 * desde `entrada` (incluida) hasta `salida` (excluida): el día de salida queda libre.
 */
const KEY = 'matilde-demo-reservas';

export const iso = (d) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/** ¿La noche del día `d` (Date) está ocupada? */
export const nocheOcupada = (ocup, d) => {
  const s = iso(d);
  return ocup.some((r) => r.entrada <= s && s < r.salida);
};
/** ¿Algún tramo ocupado se cruza con [entrada, salida)? (textos AAAA-MM-DD) */
export const hayConflicto = (ocup, entrada, salida) => ocup.some((r) => entrada < r.salida && r.entrada < salida);
/** ¿Están libres todas las noches entre dos fechas (Date)? */
export const rangoLibre = (ocup, a, b) => !hayConflicto(ocup, iso(a), iso(b));

/* ---------- Modo demo (localStorage) ---------- */
function leerDemo() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}
function guardarDemo(lista) {
  try { localStorage.setItem(KEY, JSON.stringify(lista)); } catch (e) { /* sin almacenamiento: no pasa nada */ }
}
/** Reservas de ejemplo (confirmadas), distintas para cada cabaña y relativas a hoy. */
function semilla(cabana) {
  let h = 0;
  for (const c of cabana) h = (h * 31 + c.charCodeAt(0)) % 97;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const r = (desde, noches) => {
    const a = new Date(hoy); a.setDate(a.getDate() + desde);
    const b = new Date(a); b.setDate(b.getDate() + noches);
    return { entrada: iso(a), salida: iso(b) };
  };
  const o = h % 5;
  return [r(4 + o, 2), r(16 + o, 3), r(31 + o, 2), r(48 + o, 4)];
}
const codigo = () => 'MAT-' + Math.random().toString(36).slice(2, 7).toUpperCase();

/* ---------- API pública ---------- */

/** Rangos ocupados (confirmados) de una cabaña. Siempre devuelve una lista. */
export async function cargarOcupadas(cabana) {
  try {
    const r = await fetch('/api/disponibilidad?cabana=' + encodeURIComponent(cabana), { headers: { accept: 'application/json' } });
    if (r.status === 500) return []; // la API existe pero falló: nunca mostrar datos de ejemplo
    const j = r.ok ? await r.json() : null;
    if (j && j.modo === 'real' && Array.isArray(j.ocupadas)) return j.ocupadas;
  } catch (e) { /* sin API: modo demo */ }
  const propias = leerDemo().filter((x) => x.cabana === cabana && x.estado === 'confirmada');
  return semilla(cabana).concat(propias.map(({ entrada, salida }) => ({ entrada, salida })));
}

/**
 * Envía una solicitud. Devuelve { ok, codigo, demo?, id? } o { ok:false, error, conflicto? }.
 * `datos`: cabana, cabanaNombre, entrada, salida, noches, adultos, ninos, mascotas,
 *          total, adelanto, nombre, telefono, email, notas, web (trampa anti-spam)
 */
export async function enviarSolicitud(datos) {
  try {
    const r = await fetch('/api/solicitud', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos),
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j && j.ok) return { ok: true, codigo: j.codigo, correo: j.correo };
    // Error devuelto por nuestra API (validación, fechas ocupadas…); 503 = sin configurar → demo
    if (j && j.error && r.status !== 503) return { ok: false, error: j.error, conflicto: r.status === 409 };
  } catch (e) { /* sin API: modo demo */ }

  const ocup = await cargarOcupadas(datos.cabana);
  if (hayConflicto(ocup, datos.entrada, datos.salida)) {
    return { ok: false, conflicto: true, error: 'Esas fechas ya no están disponibles.' };
  }
  const lista = leerDemo();
  const reg = { id: Date.now().toString(36), codigo: codigo(), cabana: datos.cabana, entrada: datos.entrada, salida: datos.salida, estado: 'pendiente' };
  lista.push(reg); guardarDemo(lista);
  return { ok: true, demo: true, id: reg.id, codigo: reg.codigo };
}

/** Solo demo: el "dueño" confirma la solicitud y las fechas quedan ocupadas. */
export function confirmarDemo(id) {
  const lista = leerDemo();
  const x = lista.find((r) => r.id === id);
  if (x) { x.estado = 'confirmada'; guardarDemo(lista); }
}
/** Solo demo: borra lo guardado en este navegador. */
export function reiniciarDemo() {
  try { localStorage.removeItem(KEY); } catch (e) { /* nada */ }
}

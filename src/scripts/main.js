import { cotizar, mxn } from '../lib/cotizar.js';
import { cargarOcupadas, nocheOcupada, rangoLibre, hayConflicto, iso } from '../lib/reservas.js';

(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- Theme ---------- */
  var root = document.documentElement;
  var themeMeta = $('meta[name="theme-color"]');
  function applyThemeColor() {
    if (themeMeta) themeMeta.setAttribute('content', root.getAttribute('data-theme') === 'light' ? '#fff8f8' : '#140c0e');
  }
  applyThemeColor();
  var themeToggle = $('#themeToggle');
  if(themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('solenne-theme', next); } catch (e) {}
      applyThemeColor();
    });
  }

  /* ---------- Local clock ---------- */
  var loc = document.body.dataset;
  var tz = { timeZone: loc.tz || undefined };
  function tick() {
    var now = new Date();
    if ($('#clockTime')) $('#clockTime').textContent = now.toLocaleTimeString(loc.locale || undefined, Object.assign({ hour: '2-digit', minute: '2-digit' }, tz));
    if ($('#clockDate')) $('#clockDate').textContent = now.toLocaleDateString(loc.locale || undefined, Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, tz));
  }
  tick();
  setInterval(tick, 15000);

  /* ---------- Weather ---------- */
  if(loc.lat && loc.lon) {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon + '&current=temperature_2m,apparent_temperature,wind_speed_10m')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        var c = d.current;
        if($('#temp')) $('#temp').textContent = Math.round(c.temperature_2m) + '°C';
        if($('#weatherLine')) $('#weatherLine').textContent = 'Sensación ' + Math.round(c.apparent_temperature) + '°C · Viento ' + Math.round(c.wind_speed_10m) + ' km/h';
      })
      .catch(function () { if($('#weatherLine')) $('#weatherLine').textContent = 'Clima no disponible'; });
  }

  /* ---------- Booking state ---------- */
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var S = {
    open: null, calY: today.getFullYear(), calM: today.getMonth(),
    checkIn: null, checkOut: null, adults: 2, children: 0, pets: false, cabin: 'Casa Águila'
  };
  var LIMITS = { adults: [1, 14], children: [0, 10] };
  var OCUP = []; // noches ocupadas de la cabaña elegida (Fase 2)

  /* ---------- Aparición al hacer scroll y año (corre en todas las páginas) ---------- */
  (function initPage() {
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var sibs = $$('.reveal', el.parentElement);
        el.style.transitionDelay = Math.min(sibs.indexOf(el), 4) * 70 + 'ms';
        el.classList.add('is-in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  if($('#year')) $('#year').textContent = new Date().getFullYear();
  })();

  var form = $('#book');
  if(!form) return; 

  var backdrop = $('#bookingBackdrop');
  var calPop = $('#calPop');
  var guestPop = $('#guestPop');
  var cabinPop = $('#cabinPop');
  var cells = $$('.cell[data-open]', form);

  var fmt = function (d) { return d ? d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Elegir fecha'; };
  var same = function (a, b) { return a && b && a.getTime() === b.getTime(); };
  var nights = function () { return S.checkIn && S.checkOut ? Math.round((S.checkOut - S.checkIn) / 864e5) : 0; };

  var DEPOSIT = parseInt(document.body.dataset.deposit, 10) || 30;

  // Datos de la cabaña elegida (vienen de src/content/cabanas vía el <select> oculto)
  function selectedCabin() {
    var select = document.getElementById('cabinSelect');
    var o = select && select.options[select.selectedIndex];
    if (!o) return null;
    return {
      name: o.getAttribute('data-name'),
      cap: parseInt(o.getAttribute('data-cap'), 10) || Infinity,
      pets: o.getAttribute('data-pets') !== '0',
      precios: {
        precio1: parseInt(o.getAttribute('data-price1'), 10),
        precio2: parseInt(o.getAttribute('data-price2'), 10),
        precioExtra: parseInt(o.getAttribute('data-pricex'), 10)
      }
    };
  }

  // Devuelve un aviso si el grupo no cabe o la cabaña no admite mascotas; '' si todo bien
  function problema(c) {
    var g = S.adults + S.children;
    if (g > c.cap) return 'Esta cabaña admite hasta ' + c.cap + ' personas (elegiste ' + g + '). Elige otra cabaña o reduce el grupo.';
    if (S.pets && !c.pets) return 'Esta cabaña no admite mascotas.';
    return '';
  }

  function updatePrice() {
    var priceDisplay = $('#livePriceDisplay');
    var cabin = selectedCabin();
    if (!priceDisplay || !cabin) return;

    var q = cotizar(cabin.precios, nights(), DEPOSIT);
    if (!q) { priceDisplay.style.display = 'none'; return; }

    $('#totalPrice').textContent = mxn(q.total);
    $('#depositPrice').textContent = mxn(q.adelanto);
    var pct = $('#depositPct'); if (pct) pct.textContent = DEPOSIT;
    var warn = $('#capWarn'), msg = problema(cabin);
    if (warn) { warn.textContent = msg; warn.hidden = !msg; }
    priceDisplay.style.display = 'flex';
  }

  var cabinSelect = document.getElementById('cabinSelect');
  if (cabinSelect) {
    cabinSelect.addEventListener('change', updatePrice);
    cabinSelect.addEventListener('change', cargarDisp);
  }

  /* ---------- Disponibilidad (Fase 2) ---------- */
  function cargarDisp() {
    var sel = document.getElementById('cabinSelect');
    if (!sel) return Promise.resolve();
    return cargarOcupadas(sel.value).then(function (o) {
      OCUP = o;
      if (S.checkIn && S.checkOut && hayConflicto(OCUP, iso(S.checkIn), iso(S.checkOut))) {
        S.checkIn = null; S.checkOut = null;
        showToast('Esas fechas no están disponibles en esta cabaña. Elige otras.');
      }
      render();
    });
  }
  document.addEventListener('matilde:reservas', cargarDisp);

  function setOpen(which) {
    var wasOpen = S.open;
    S.open = which;
    render();
    if (which && !wasOpen) {
      var targetPop = which === 'guests' ? guestPop : (which === 'cabin' ? cabinPop : calPop);
      revealPopover(targetPop);
    }
    if (which === 'in' || which === 'out') {
      var target = $('.day.is-end', calPop) || $('.day:not(:disabled)', calPop);
      if (target && document.activeElement && document.activeElement.classList.contains('cell')) target.focus({ preventScroll: true });
    } else if (which === 'guests') {
      var step = $('[data-step]', guestPop);
      if(step) step.focus({ preventScroll: true });
    } else if (which === 'cabin') {
      var selectedOpt = $('.cabin-option.is-selected', cabinPop) || $('.cabin-option', cabinPop);
      if(selectedOpt) selectedOpt.focus({ preventScroll: true });
    }
  }

  function pickDay(d) {
    if (S.open === 'out' && S.checkIn && d > S.checkIn) {
      S.checkOut = d; S.open = null; render();
      var outCell = $('.cell[data-open="out"]', form);
      if(outCell) outCell.focus({ preventScroll: true });
      return;
    }
    S.checkOut = S.checkOut && d < S.checkOut ? S.checkOut : null;
    S.checkIn = d; S.open = 'out'; render();
    var next = $('.day:not(:disabled)[data-t="' + (d.getTime() + 864e5) + '"]', calPop);
    if (next) next.focus({ preventScroll: true });
  }

  function renderCalendar() {
    var first = new Date(S.calY, S.calM, 1);
    var lead = (first.getDay() + 6) % 7;
    var dim = new Date(S.calY, S.calM + 1, 0).getDate();
    $('#monthLabel').textContent = first.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    $('#prevMonth').disabled = S.calY === today.getFullYear() && S.calM === today.getMonth();

    var grid = $('#calGrid');
    var frag = document.createDocumentFragment();
    for (var i = 0; i < lead; i++) {
      var blank = document.createElement('span'); blank.className = 'day day--blank'; frag.appendChild(blank);
    }
    for (var n = 1; n <= dim; n++) {
      var d = new Date(S.calY, S.calM, n);
      var b = document.createElement('button');
      var isEnd = same(d, S.checkIn) || same(d, S.checkOut);
      b.type = 'button'; b.className = 'day'; b.textContent = n; b.dataset.t = d.getTime();
      b.setAttribute('aria-label', d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
      var ocupado = nocheOcupada(OCUP, d);
      if (d < today) b.disabled = true;
      else if (S.open === 'out' && S.checkIn && d > S.checkIn) { if (!rangoLibre(OCUP, S.checkIn, d)) b.disabled = true; }
      else if (ocupado) b.disabled = true;
      if (ocupado && d >= today) { b.classList.add('is-busy'); b.title = 'No disponible'; }
      if (same(d, today)) { b.classList.add('is-today'); b.setAttribute('aria-current', 'date'); }
      if (isEnd) { b.classList.add('is-end'); b.setAttribute('aria-pressed', 'true'); }
      if (S.checkIn && S.checkOut && d > S.checkIn && d < S.checkOut) b.classList.add('in-range');
      frag.appendChild(b);
    }
    grid.replaceChildren(frag);

    var nt = nights();
    $('#calHint').textContent = nt ? nt + ' noche' + (nt > 1 ? 's' : '') : S.open === 'out' && S.checkIn ? 'Elegí salida' : 'Elegí llegada';
  }

  function placePopover(pop, which) {
    var cell = $('.cell[data-open="' + which + '"]', form);
    if(!cell) return;
    var fr = form.getBoundingClientRect(), cr = cell.getBoundingClientRect();
    var w = pop.offsetWidth, gutter = 16;
    var minLeft = gutter - fr.left;
    var maxLeft = Math.min(fr.width - w, document.documentElement.clientWidth - gutter - w - fr.left);
    var left = Math.max(minLeft, Math.min(cr.left - fr.left, Math.max(minLeft, maxLeft)));
    pop.style.left = left + 'px';
    pop.style.top = ($('.booking__bar', form).offsetHeight + 10) + 'px';
  }

  function revealPopover(pop) {
    var r = pop.getBoundingClientRect(), overflow = r.bottom + 16 - window.innerHeight;
    if (overflow > 0) window.scrollBy({ top: overflow, behavior: 'smooth' });
  }

  function render() {
    var calOpen = S.open === 'in' || S.open === 'out';
    calPop.hidden = !calOpen;
    guestPop.hidden = S.open !== 'guests';
    cabinPop.hidden = S.open !== 'cabin';
    
    backdrop.hidden = !S.open;
    if (calOpen) { renderCalendar(); placePopover(calPop, S.open); }
    if (S.open === 'guests') placePopover(guestPop, 'guests');
    if (S.open === 'cabin') placePopover(cabinPop, 'cabin');

    cells.forEach(function (c) { c.setAttribute('aria-expanded', String(c.dataset.open === S.open)); });

    $('#inLabel').textContent = fmt(S.checkIn);
    $('#outLabel').textContent = fmt(S.checkOut);
    $('#cabinLabel').textContent = S.cabin;
    $('#adultsOut').textContent = S.adults;
    $('#childrenOut').textContent = S.children;
    $$('[data-step]', guestPop).forEach(function (btn) {
      var key = btn.dataset.step, by = +btn.dataset.by, lim = LIMITS[key];
      btn.disabled = by < 0 ? S[key] <= lim[0] : S[key] >= lim[1];
    });
    $('#guestLabel').textContent = S.adults + ' adulto' + (S.adults > 1 ? 's' : '') +
      (S.children ? ' · ' + S.children + ' niño' + (S.children > 1 ? 's' : '') : '');
    $('#petsToggle').setAttribute('aria-checked', String(S.pets));
    $('#petIcon').hidden = !S.pets;
    
    updatePrice();
  }

  /* ---------- Booking events ---------- */
  cells.forEach(function (c) {
    c.addEventListener('click', function () {
      var which = c.dataset.open;
      if (which !== 'guests' && which !== 'cabin' && (S.checkIn || S.checkOut)) {
        var ref = which === 'out' && S.checkOut ? S.checkOut : S.checkIn;
        if (ref) { S.calY = ref.getFullYear(); S.calM = ref.getMonth(); }
      }
      setOpen(S.open === which ? null : which);
    });
  });

  backdrop.addEventListener('click', function () { setOpen(null); });

  if(cabinPop) {
    cabinPop.addEventListener('click', function(e) {
      var btn = e.target.closest('.cabin-option');
      if (!btn) return;
      
      $$('.cabin-option', cabinPop).forEach(o => o.classList.remove('is-selected'));
      btn.classList.add('is-selected');

      S.cabin = btn.getAttribute('data-name');
      var val = btn.getAttribute('data-value');
      var nativeSelect = document.getElementById('cabinSelect');
      
      if(nativeSelect) {
        nativeSelect.value = val;
        nativeSelect.dispatchEvent(new Event('change'));
      }
      
      setOpen(null);
      var cabinCell = $('.cell[data-open="cabin"]', form);
      if(cabinCell) cabinCell.focus({ preventScroll: true });
    });
  }

  $('#calGrid').addEventListener('click', function (e) {
    var b = e.target.closest('.day');
    if (!b || b.disabled || !b.dataset.t) return;
    pickDay(new Date(+b.dataset.t));
  });

  $('#calGrid').addEventListener('keydown', function (e) {
    var map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in map) || !e.target.dataset.t) return;
    e.preventDefault();
    var d = new Date(+e.target.dataset.t);
    d.setDate(d.getDate() + map[e.key]);
    if (d < today) return;
    if (d.getMonth() !== S.calM || d.getFullYear() !== S.calY) {
      S.calY = d.getFullYear(); S.calM = d.getMonth(); renderCalendar();
    }
    var t = $('.day[data-t="' + d.getTime() + '"]', calPop);
    if (t) t.focus();
  });

  function shift(k) {
    var d = new Date(S.calY, S.calM + k, 1);
    S.calY = d.getFullYear(); S.calM = d.getMonth(); renderCalendar();
  }
  $('#prevMonth').addEventListener('click', function () { shift(-1); });
  $('#nextMonth').addEventListener('click', function () { shift(1); });

  $('#clearDates').addEventListener('click', function () {
    S.checkIn = null; S.checkOut = null; S.open = 'in'; render();
  });

  guestPop.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-step]');
    if (!btn) return;
    var key = btn.dataset.step, lim = LIMITS[key];
    S[key] = Math.max(lim[0], Math.min(lim[1], S[key] + +btn.dataset.by));
    render();
  });
  $('#petsToggle').addEventListener('click', function () { S.pets = !S.pets; render(); });
  $('#guestsDone').addEventListener('click', function () {
    setOpen(null);
    var guestCell = $('.cell[data-open="guests"]', form);
    if(guestCell) guestCell.focus({ preventScroll: true });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.open) {
      var cell = $('.cell[data-open="' + S.open + '"]', form);
      setOpen(null);
      if (cell) cell.focus({ preventScroll: true });
    }
  });

  /* ---------- CHECKOUT / WHATSAPP ---------- */
  var toast = $('#toast'), toastTimer;
  function showToast(msg) {
    if(!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-visible'); }, 4200);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!S.checkIn) { setOpen('in'); return; }
    if (!S.checkOut) { setOpen('out'); return; }
    setOpen(null);

    var nt = nights();
    var cabin = selectedCabin();
    var aviso = problema(cabin);
    if (aviso) { showToast(aviso); return; }

    var q = cotizar(cabin.precios, nt, DEPOSIT);
    var d = document.body.dataset;
    var sel = document.getElementById('cabinSelect');
    var mensaje = `¡Hola! Quiero reservar en Cabañas Matilde 🏡\n\n` +
      `• Cabaña: ${cabin.name}\n` +
      `• Llegada: ${fmt(S.checkIn)} (Check-in ${d.checkin})\n` +
      `• Salida: ${fmt(S.checkOut)} (Check-out ${d.checkout})\n` +
      `• Noches: ${nt}\n` +
      `• Huéspedes: ${S.adults} adultos` + (S.children ? `, ${S.children} niños` : '') + `\n` +
      `• Mascotas: ${S.pets ? 'Sí' : 'No'}\n\n` +
      `• Total Estimado: ${mxn(q.total)}\n` +
      `• Adelanto requerido (${DEPOSIT}%): ${mxn(q.adelanto)}\n\n` +
      `Mi nombre: [Escribe tu nombre aquí]\n\n` +
      `Quedo atento a la confirmación y a los datos para enviar el adelanto. ¡Gracias!`;

    // Se vuelve a consultar la disponibilidad justo antes de pedir los datos
    cargarDisp().then(function () {
      if (!S.checkIn || !S.checkOut) { setOpen('in'); return; }
      document.dispatchEvent(new CustomEvent('matilde:solicitar', { detail: {
        cabana: sel.value, cabanaNombre: cabin.name,
        entrada: iso(S.checkIn), salida: iso(S.checkOut), entradaTxt: fmt(S.checkIn), salidaTxt: fmt(S.checkOut),
        noches: nt, adultos: S.adults, ninos: S.children, mascotas: S.pets,
        total: q.total, adelanto: q.adelanto, adelantoPct: DEPOSIT,
        waUrl: 'https://wa.me/' + d.wa + '?text=' + encodeURIComponent(mensaje)
      } }));
    });
  });


  /* ---------- Cabaña preseleccionada desde otra página (/?cabana=casa-oso#book) ---------- */
  function setCabin(value) {
    var select = document.getElementById('cabinSelect');
    if (!select) return;
    var opt = Array.prototype.find.call(select.options, function (o) { return o.value === value; });
    if (!opt) return;
    select.value = value;
    S.cabin = opt.getAttribute('data-name');
    $$('.cabin-option', cabinPop).forEach(function (o) { o.classList.toggle('is-selected', o.getAttribute('data-value') === value); });
  }
  var wanted = new URLSearchParams(location.search).get('cabana');
  if (wanted) setCabin(wanted);
  else { var first = selectedCabin(); if (first) S.cabin = first.name; }
  render();
  cargarDisp();
})();
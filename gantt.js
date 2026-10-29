/* ДомСтрой — график строительства дома (диаграмма Ганта).
   Ползунок двигает начало стройки, полосы этапов перетаскиваются пальцем
   или мышью, правый край меняет срок. Этапы связаны: следующий не начнётся,
   пока не закончен тот, от которого он зависит, — поэтому сдвиг одного
   этапа сам переносит все последующие. */
(function (global) {
'use strict';

var DAY = 86400000;

// Технология «ДомСтроя». Длительности — для дома 100 м², дальше масштабируются по площади.
// after — от каких этапов зависит, lag — сдвиг относительно их окончания (минус — внахлёст).
var STAGES = [
  { id: 'site',    name: 'Организация площадки',          d: 7,  after: [],                 tier: 0, phase: 'box' },
  { id: 'found',   name: 'Фундамент и плита пола',        d: 28, after: ['site'],           tier: 0, phase: 'box' },
  { id: 'walls',   name: 'Наружные стены',                d: 28, after: ['found'],          tier: 0, phase: 'box' },
  { id: 'inner',   name: 'Внутренние стены и перегородки', d: 14, after: ['walls'], lag: -14, tier: 0, phase: 'box' },
  { id: 'slab',    name: 'Армопояс и перекрытие',         d: 14, after: ['walls', 'inner'], tier: 0, phase: 'box' },
  { id: 'roof',    name: 'Кровля',                        d: 21, after: ['slab'],           tier: 0, phase: 'box' },
  { id: 'brick',   name: 'Облицовка кирпичом',            d: 28, after: ['slab'],           tier: 0, phase: 'box' },
  { id: 'windows', name: 'Окна и входная дверь',          d: 5,  after: ['roof'],           tier: 0, phase: 'box' },
  { id: 'elec',    name: 'Электрика',                     d: 10, after: ['windows'],        tier: 1, phase: 'eng' },
  { id: 'heat',    name: 'Отопление и сантехника',        d: 14, after: ['windows'],        tier: 1, phase: 'eng' },
  { id: 'plaster', name: 'Механизированная штукатурка',   d: 12, after: ['elec'],           tier: 1, phase: 'finish' },
  { id: 'screed',  name: 'Стяжка пола',                   d: 7,  after: ['plaster', 'heat'], tier: 1, phase: 'finish' },
  { id: 'dry',     name: 'Высыхание стен и пола',         d: 14, after: ['screed'],         tier: 1, phase: 'pause', fixed: true },
  { id: 'ceil',    name: 'Потолки и гипсокартон',         d: 10, after: ['dry'],            tier: 2, phase: 'finish' },
  { id: 'floor',   name: 'Ламинат и плитка',              d: 14, after: ['ceil'],           tier: 2, phase: 'finish' },
  { id: 'doors',   name: 'Двери, розетки, выключатели',   d: 6,  after: ['floor'],          tier: 2, phase: 'finish' },
  { id: 'hand',    name: 'Сдача дома',                    d: 3,  after: [],                 tier: 0, phase: 'done' }
];
var TIERS = { base: 0, fine: 1, turnkey: 2 };
var TIER_NAMES = { base: 'Стройвариант', fine: 'Чистовая отделка', turnkey: 'Под ключ' };
var ZOOM = { day: 28, week: 10, month: 3.4 };     // «весь срок» считается по ширине экрана
var PHASE_NAMES = { box: 'Коробка', eng: 'Инженерия', finish: 'Отделка', pause: 'Технологический перерыв' };

// ── даты ─────────────────────────────────────────────────────────
function midnight(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { return new Date(midnight(d).getTime() + n * DAY); }
function diffDays(a, b) { return Math.round((midnight(a) - midnight(b)) / DAY); }
var fmtLong = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
var fmtShort = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });
var fmtMonth = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
var fmtMonthShort = new Intl.DateTimeFormat('ru-RU', { month: 'short' });
function long(d) { return fmtLong.format(d).replace(/\s*г\.$/, ''); }
function short(d) { return fmtShort.format(d); }
function iso(d) { var x = midnight(d); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function plural(n, one, few, many) {
  var a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
function days(n) { return n + ' ' + plural(n, 'день', 'дня', 'дней'); }
function months(nDays) { return (Math.round(nDays / 30.4 * 10) / 10).toString().replace('.', ','); }

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// ── расчёт графика ───────────────────────────────────────────────
function stagesFor(tier) {
  var rank = TIERS[tier] === undefined ? 1 : TIERS[tier];
  var list = STAGES.filter(function (s) { return s.tier <= rank; });
  var ids = list.map(function (s) { return s.id; });
  // сдача дома — после всех этапов, от которых ничего не зависит
  var leaves = ids.filter(function (id) {
    return id !== 'hand' && !list.some(function (s) { return s.after.indexOf(id) >= 0; });
  });
  return list.map(function (s) {
    var after = s.id === 'hand' ? leaves : s.after.filter(function (a) { return ids.indexOf(a) >= 0; });
    return { id: s.id, name: s.name, d: s.d, after: after, lag: s.lag || 0, phase: s.phase, fixed: s.fixed };
  });
}

function scale(area) { return Math.min(2.2, Math.max(0.6, Math.pow((+area || 100) / 100, 0.7))); }

function plan(state) {
  var k = scale(state.area);
  var list = stagesFor(state.tier);
  var byId = {};
  list.forEach(function (s) {
    var earliest = 0;
    s.after.forEach(function (a) { earliest = Math.max(earliest, byId[a].end + s.lag); });
    earliest = Math.max(0, earliest);
    var base = s.fixed ? s.d : Math.max(1, Math.round(s.d * k));
    var dur = state.dur[s.id] || base;
    var start = earliest + (state.delay[s.id] || 0);
    byId[s.id] = { stage: s, earliest: earliest, start: start, end: start + dur, dur: dur, base: base };
  });
  var rows = list.map(function (s) { return byId[s.id]; });
  var total = rows.reduce(function (m, r) { return Math.max(m, r.end); }, 0);
  return { rows: rows, total: total, byId: byId };
}

// ── компонент ────────────────────────────────────────────────────
function mount(host, options) {
  options = options || {};
  var today = midnight(new Date());
  var state = {
    area: options.area || 110,
    tier: options.tier || 'fine',
    start: options.start ? midnight(options.start) : addDays(today, 14),
    zoom: 'fit',
    delay: {}, dur: {}
  };
  var current = null;          // последний расчёт
  var editorFor = null;

  host.classList.add('gantt');
  host.innerHTML = '';

  // управление: ползунок начала, масштаб, сброс
  var controls = el('div', 'g-controls');
  var startWrap = el('label', 'g-start');
  var startText = el('span', 'g-start-text');
  var slider = el('input', 'g-slider');
  slider.type = 'range'; slider.min = 0; slider.max = 540; slider.step = 1;
  slider.setAttribute('aria-label', 'Дата начала стройки');
  startWrap.appendChild(el('span', 'lbl', 'Начало стройки'));
  startWrap.appendChild(startText);
  startWrap.appendChild(slider);
  controls.appendChild(startWrap);

  var tools = el('div', 'g-tools');
  var zoomBox = el('div', 'g-zoom');
  zoomBox.setAttribute('role', 'group');
  zoomBox.setAttribute('aria-label', 'Масштаб');
  [['fit', 'Весь срок'], ['month', 'Месяц'], ['week', 'Неделя'], ['day', 'День']].forEach(function (z) {
    var b = el('button', 'g-zbtn', z[1]);
    b.type = 'button'; b.dataset.zoom = z[0];
    b.addEventListener('click', function () { state.zoom = z[0]; render(); });
    zoomBox.appendChild(b);
  });
  var toStart = el('button', 'g-tool', 'К началу');
  toStart.type = 'button';
  toStart.addEventListener('click', function () { scrollTo(0); });
  var reset = el('button', 'g-tool', 'Сбросить');
  reset.type = 'button';
  reset.addEventListener('click', function () { state.delay = {}; state.dur = {}; closeEditor(); render(); });
  tools.appendChild(zoomBox); tools.appendChild(toStart); tools.appendChild(reset);
  controls.appendChild(tools);
  host.appendChild(controls);

  var summary = el('div', 'g-summary');
  host.appendChild(summary);

  var board = el('div', 'g-board');
  var names = el('div', 'g-names');
  var scroller = el('div', 'g-scroll');
  var canvas = el('div', 'g-canvas');
  scroller.appendChild(canvas);
  board.appendChild(names); board.appendChild(scroller);
  host.appendChild(board);

  var hint = el('p', 'g-hint');
  hint.textContent = 'Перетащите полосу, чтобы сдвинуть этап, или потяните за правый край, чтобы изменить срок. ' +
                     'Нажмите на полосу — откроются даты.';
  host.appendChild(hint);

  var legend = el('div', 'g-legend');
  ['box', 'eng', 'finish', 'pause'].forEach(function (p) {
    var item = el('span', 'g-leg');
    item.appendChild(el('i', 'g-sw p-' + p));
    item.appendChild(document.createTextNode(PHASE_NAMES[p]));
    legend.appendChild(item);
  });
  host.appendChild(legend);

  var toast = el('div', 'g-toast');
  toast.setAttribute('role', 'status');
  host.appendChild(toast);
  var toastTimer = null;
  function say(text) {
    toast.textContent = text;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('on'); }, 2200);
  }

  slider.addEventListener('input', function () {
    state.start = addDays(today, +slider.value);
    render();
  });

  // ── отрисовка ───────────────────────────────────────────────────
  var PAD = 4;                 // дни запаса слева и справа
  var unitsWeekly = false;
  function dayPx() {
    if (state.zoom !== 'fit') return ZOOM[state.zoom];
    var span = (current ? current.total : 180) + PAD * 2 + 6;
    var room = scroller.clientWidth || 600;
    return Math.max(1, room / span);
  }

  function render() {
    current = plan(state);
    var px = dayPx();
    unitsWeekly = state.zoom === 'week' || (state.zoom === 'fit' && px >= 7);
    var span = current.total + PAD * 2 + 6;
    var origin = addDays(state.start, -PAD);          // первый день шкалы
    var width = Math.ceil(span * px);

    slider.value = Math.max(0, Math.min(540, diffDays(state.start, today)));
    startText.textContent = long(state.start);
    Array.prototype.forEach.call(zoomBox.children, function (b) {
      b.setAttribute('aria-pressed', b.dataset.zoom === state.zoom ? 'true' : 'false');
    });

    var finish = addDays(state.start, current.total);
    summary.innerHTML = '';
    var big = el('div', 'g-sum-main');
    big.appendChild(el('span', 'lbl', 'Дом готов'));
    big.appendChild(el('b', 'g-sum-date', long(finish)));
    summary.appendChild(big);
    var facts = el('div', 'g-sum-facts');
    [['Срок', months(current.total) + ' мес.'], ['Этапов', String(current.rows.length)],
     ['Дом', (+state.area).toString().replace('.', ',') + ' м² · ' + TIER_NAMES[state.tier]]]
      .forEach(function (f) {
        var item = el('span', 'g-fact');
        item.appendChild(el('span', '', f[0]));
        item.appendChild(el('b', '', f[1]));
        facts.appendChild(item);
      });
    summary.appendChild(facts);

    // левая колонка
    names.innerHTML = '';
    names.appendChild(el('div', 'g-names-head', 'Этап'));
    current.rows.forEach(function (r) {
      var row = el('div', 'g-name' + (r.stage.phase === 'pause' ? ' is-pause' : ''));
      row.appendChild(el('b', '', r.stage.name));
      row.appendChild(el('span', '', short(addDays(state.start, r.start)) + ' – ' +
                                      short(addDays(state.start, r.end - 1)) + ' · ' + days(r.dur)));
      row.dataset.id = r.stage.id;
      names.appendChild(row);
    });

    // шкала
    canvas.innerHTML = '';
    canvas.style.width = width + 'px';
    var head = el('div', 'g-head');
    var monthsRow = el('div', 'g-months');
    var unitsRow = el('div', 'g-units');
    head.appendChild(monthsRow); head.appendChild(unitsRow);
    canvas.appendChild(head);

    var cursor = new Date(origin);
    var last = addDays(origin, span);
    while (cursor < last) {
      var monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      if (monthEnd > last) monthEnd = last;
      var w = diffDays(monthEnd, cursor) * px;
      var label = w > 100 ? fmtMonth.format(cursor).replace(/\s*г\.$/, '')
        : w > 26 ? fmtMonthShort.format(cursor).replace('.', '') : '';
      label = label.charAt(0).toUpperCase() + label.slice(1);   // «Декабрь 2026», «Янв»
      var m = el('div', 'g-month', label);
      m.style.left = diffDays(cursor, origin) * px + 'px';
      m.style.width = w + 'px';
      monthsRow.appendChild(m);
      cursor = monthEnd;
    }
    for (var i = 0; i < span; i++) {
      var day = addDays(origin, i);
      var dow = day.getDay();
      var cell = null;
      if (state.zoom === 'day') {
        cell = el('div', 'g-unit' + (dow === 0 || dow === 6 ? ' wknd' : ''), String(day.getDate()));
        cell.style.left = i * px + 'px'; cell.style.width = px + 'px';
      } else if (unitsWeekly && dow === 1) {
        cell = el('div', 'g-unit wk', short(day));
        cell.style.left = i * px + 'px'; cell.style.width = 7 * px + 'px';
      }
      if (cell) unitsRow.appendChild(cell);
    }

    var rows = el('div', 'g-rows');
    rows.style.height = current.rows.length * 46 + 'px';
    canvas.appendChild(rows);
    // фон: выходные в дневном масштабе, строки
    if (state.zoom === 'day') {
      for (var j = 0; j < span; j++) {
        var dd = addDays(origin, j).getDay();
        if (dd === 0 || dd === 6) {
          var shade = el('div', 'g-wknd');
          shade.style.left = j * px + 'px'; shade.style.width = px + 'px';
          rows.appendChild(shade);
        }
      }
    }
    current.rows.forEach(function (r, idx) {
      var line = el('div', 'g-line');
      line.style.top = idx * 46 + 'px';
      rows.appendChild(line);
      var bar = el('div', 'g-bar p-' + r.stage.phase);
      bar.dataset.id = r.stage.id;
      bar.tabIndex = 0;
      bar.setAttribute('role', 'button');
      bar.setAttribute('aria-label', r.stage.name + ', ' + long(addDays(state.start, r.start)) +
                       ' — ' + long(addDays(state.start, r.end - 1)) + ', ' + days(r.dur));
      bar.style.top = idx * 46 + 8 + 'px';
      bar.style.left = (r.start + PAD) * px + 'px';
      var barWidth = Math.max(6, r.dur * px);
      bar.style.width = barWidth + 'px';
      var label = el('span', 'g-bar-label', barWidth > 90 ? r.stage.name : '');
      bar.appendChild(label);
      if (r.stage.phase !== 'done' && barWidth >= 40) {     // на узкой полосе ручка закрыла бы её целиком
        var grip = el('span', 'g-grip');
        grip.setAttribute('aria-hidden', 'true');
        bar.appendChild(grip);
      }
      rows.appendChild(bar);
    });
    // линия «сегодня» и финиш
    var todayAt = diffDays(today, origin);
    if (todayAt >= 0 && todayAt <= span) {
      var t = el('div', 'g-today');
      t.style.left = todayAt * px + 'px';
      t.appendChild(el('span', '', 'сегодня'));
      canvas.appendChild(t);
    }
    var flag = el('div', 'g-finish');
    flag.style.left = (current.total + PAD) * px + 'px';
    flag.appendChild(el('span', '', '🏠 ' + short(finish)));
    canvas.appendChild(flag);

    if (editorFor) openEditor(editorFor);
    if (options.onChange) options.onChange(api.summary());
  }

  function scrollTo(dayIndex) {
    scroller.scrollTo({ left: Math.max(0, (dayIndex + PAD) * dayPx() - 24), behavior: 'smooth' });
  }

  // ── перетаскивание ──────────────────────────────────────────────
  var drag = null;
  canvas.addEventListener('pointerdown', function (e) {
    var bar = e.target.closest('.g-bar');
    if (!bar || e.button > 0) return;
    var row = current.byId[bar.dataset.id];
    if (!row || row.stage.phase === 'done') {
      if (row) { closeEditor(); openEditor(row.stage.id); }
      return;
    }
    drag = {
      id: row.stage.id, x: e.clientX, moved: false,
      mode: e.target.classList.contains('g-grip') ? 'resize' : 'move',
      delay: state.delay[row.stage.id] || 0, dur: row.dur, pointer: e.pointerId, bar: bar
    };
    try { bar.setPointerCapture(e.pointerId); } catch (err) { /* указатель уже отпущен */ }
    bar.classList.add('is-drag');
    // полоса перерисовывается на каждом шаге, поэтому движение слушаем на всём окне:
    // так перетаскивание не «залипнет», даже если палец уйдёт за пределы графика
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    e.preventDefault();
  });
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointer) return;
    var dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 5) return;
    drag.moved = true;
    var shift = Math.round(dx / dayPx());
    if (drag.mode === 'move') {
      var next = drag.delay + shift;
      if (next < 0) {
        next = 0;
        var row = current.byId[drag.id];
        var blocker = row.stage.after.length
          ? current.byId[row.stage.after[0]].stage.name : 'начала стройки';
        say('Раньше нельзя: этап ждёт «' + blocker + '»');
      }
      state.delay[drag.id] = next;
    } else {
      state.dur[drag.id] = Math.max(1, drag.dur + shift);
    }
    var keepScroll = scroller.scrollLeft;
    render();
    scroller.scrollLeft = keepScroll;
    var fresh = canvas.querySelector('.g-bar[data-id="' + drag.id + '"]');
    if (fresh) { fresh.classList.add('is-drag'); drag.bar = fresh; }
  }
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.pointer)) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    var id = drag.id, moved = drag.moved;
    drag = null;
    canvas.querySelectorAll('.g-bar.is-drag').forEach(function (b) { b.classList.remove('is-drag'); });
    if (!moved) openEditor(id);
    else if (options.onChange) options.onChange(api.summary());
  }
  canvas.addEventListener('keydown', function (e) {
    var bar = e.target.closest('.g-bar');
    if (!bar) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditor(bar.dataset.id); }
  });

  // ── окно этапа: даты и длительность ─────────────────────────────
  var editor = el('div', 'g-editor');
  editor.hidden = true;
  editor.setAttribute('role', 'dialog');
  host.appendChild(editor);

  function closeEditor() { editor.hidden = true; editorFor = null; }

  function openEditor(id) {
    var row = current.byId[id];
    if (!row) return;
    editorFor = id;
    editor.innerHTML = '';
    editor.hidden = false;
    var top = el('div', 'g-ed-top');
    top.appendChild(el('b', '', row.stage.name));
    var x = el('button', 'g-ed-x', '×');
    x.type = 'button'; x.setAttribute('aria-label', 'Закрыть');
    x.addEventListener('click', closeEditor);
    top.appendChild(x);
    editor.appendChild(top);

    var startDate = addDays(state.start, row.start);
    var endDate = addDays(state.start, row.end - 1);
    editor.appendChild(el('p', 'g-ed-range', long(startDate) + ' — ' + long(endDate)));

    if (row.stage.phase === 'done') {
      editor.appendChild(el('p', 'g-ed-note', 'Финальный этап: начинается, когда закончены все работы.'));
      return;
    }

    var startField = el('label', 'g-ed-field');
    startField.appendChild(el('span', '', 'Начало этапа'));
    var input = el('input', 'inp');
    input.type = 'date';
    input.value = iso(startDate);
    input.min = iso(addDays(state.start, row.earliest));
    input.addEventListener('change', function () {
      if (!input.value) return;
      var picked = diffDays(new Date(input.value + 'T00:00:00'), state.start);
      if (picked < row.earliest) {
        say('Раньше ' + long(addDays(state.start, row.earliest)) + ' нельзя: не закончен предыдущий этап');
        picked = row.earliest;
      }
      state.delay[id] = picked - row.earliest;
      render();
    });
    startField.appendChild(input);
    editor.appendChild(startField);

    var durField = el('div', 'g-ed-field');
    durField.appendChild(el('span', '', 'Длительность'));
    var stepper = el('div', 'g-step');
    var minus = el('button', 'g-step-btn', '−'); minus.type = 'button';
    var value = el('b', 'g-step-val', days(row.dur));
    var plus = el('button', 'g-step-btn', '+'); plus.type = 'button';
    minus.setAttribute('aria-label', 'Короче на день');
    plus.setAttribute('aria-label', 'Длиннее на день');
    minus.addEventListener('click', function () { state.dur[id] = Math.max(1, row.dur - 1); render(); });
    plus.addEventListener('click', function () { state.dur[id] = row.dur + 1; render(); });
    stepper.appendChild(minus); stepper.appendChild(value); stepper.appendChild(plus);
    durField.appendChild(stepper);
    editor.appendChild(durField);

    var acts = el('div', 'g-ed-acts');
    var week = el('button', 'g-tool', 'Сдвинуть на неделю');
    week.type = 'button';
    week.addEventListener('click', function () { state.delay[id] = (state.delay[id] || 0) + 7; render(); });
    var back = el('button', 'g-tool', 'Вернуть как было');
    back.type = 'button';
    back.addEventListener('click', function () { delete state.delay[id]; delete state.dur[id]; render(); });
    acts.appendChild(week); acts.appendChild(back);
    editor.appendChild(acts);
    if (row.base !== row.dur || row.start !== row.earliest) {
      editor.appendChild(el('p', 'g-ed-note',
        'По плану: ' + days(row.base) + (row.start !== row.earliest ? ', сразу после предыдущего этапа' : '') + '.'));
    }
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeEditor(); });

  var api = {
    set: function (area, tier) {
      if (area) state.area = area;
      if (tier && TIERS[tier] !== undefined) state.tier = tier;
      render();
    },
    summary: function () {
      var finish = addDays(state.start, current.total);
      return {
        area: state.area, tier: state.tier, tierName: TIER_NAMES[state.tier],
        start: state.start, finish: finish, days: current.total, months: months(current.total),
        startText: long(state.start), finishText: long(finish),
        rows: [['Площадь', String(state.area).replace('.', ',') + ' м²'], ['Вариант', TIER_NAMES[state.tier]],
               ['Начало стройки', long(state.start)], ['Дом готов', long(finish)],
               ['Срок', months(current.total) + ' мес.']]
      };
    }
  };

  render();
  var lastWidth = scroller.clientWidth;
  window.addEventListener('resize', function () {
    if (state.zoom === 'fit' && Math.abs(scroller.clientWidth - lastWidth) > 20) {
      lastWidth = scroller.clientWidth;
      render();
    }
  });
  return api;
}

global.DSGantt = { mount: mount, plan: plan, stagesFor: stagesFor };
})(window);

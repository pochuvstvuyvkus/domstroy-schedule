/* ДомСтрой — прототип графика производства работ.
   Данные демо: хранятся только в этом браузере (localStorage), сервер не нужен. */
(function () {
  'use strict';

  var DAY = 864e5;
  var STORE_KEY = 'ds-gpr-demo-2';
  var PREFS_KEY = 'ds-gpr-prefs-1';
  var MOBILE = window.matchMedia('(max-width: 760px)');

  // ── мелочи ─────────────────────────────────────────────────────────
  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function midnight(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = midnight(d); x.setDate(x.getDate() + n); return x; }
  function diffDays(a, b) { return Math.round((midnight(a) - midnight(b)) / DAY); }
  function iso(d) {
    var x = midnight(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dm(d) { return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'); }
  function dmy(d) { return dm(d) + '.' + d.getFullYear(); }
  var fmtLong = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  var fmtMonth = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
  function long(d) { return fmtLong.format(d).replace(/\s*г\.$/, ''); }
  function days(n) {
    var m10 = n % 10, m100 = n % 100;
    var w = m10 === 1 && m100 !== 11 ? 'день' : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 'дня' : 'дней';
    return n + ' ' + w;
  }
  function pct(p) { return Math.round((p || 0) * 100) + '%'; }
  function today() { return midnight(new Date()); }
  function isWeekend(d) { var w = d.getDay(); return w === 0 || w === 6; }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ── хранилище демо-данных ──────────────────────────────────────────
  var store, prefs;
  function loadStore() {
    try { store = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { store = null; }
    if (!store || store.v !== 2) store = window.GPR_DEMO.demo();
    try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null') || {}; } catch (e) { prefs = {}; }
    prefs.zoom = prefs.zoom || 'day';
    if (prefs.mats === undefined) prefs.mats = true;
  }
  function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* приватный режим */ } }
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }
  function crewById(id) { return store.crews.filter(function (c) { return c.id === id; })[0] || null; }
  function objById(id) { return store.objects.filter(function (o) { return o.id === id; })[0] || null; }

  // ── сводка по объекту ──────────────────────────────────────────────
  function isWork(t) { return t.kind === 'work' || t.kind === 'pause' || t.kind === 'milestone'; }
  function endOf(t) { return addDays(parse(t.start), t.duration || 0); }
  function objStats(obj) {
    var works = obj.tasks.filter(isWork);
    var now = today();
    if (!works.length) return { empty: true, progress: 0, late: [], current: [], soon: [] };
    var start = new Date(Math.min.apply(null, works.map(function (t) { return parse(t.start); })));
    var end = new Date(Math.max.apply(null, works.map(endOf)));
    var planned = works.filter(function (t) { return t.plan_end; });
    var planEnd = planned.length ? new Date(Math.max.apply(null, planned.map(function (t) { return parse(t.plan_end); }))) : null;
    var weight = 0, done = 0;
    works.forEach(function (t) { var w = Math.max(1, t.duration || 0); weight += w; done += w * (t.progress || 0); });
    var late = works.filter(function (t) { return t.kind !== 'pause' && endOf(t) <= now && (t.progress || 0) < 1; });
    var current = works.filter(function (t) { return t.kind === 'work' && parse(t.start) <= now && endOf(t) > now; });
    var soon = obj.tasks.filter(function (t) {
      if (t.kind !== 'material' || t.status === 'done') return false;
      var d = diffDays(parse(t.start), now);
      return d >= 0 && d <= 7;
    });
    return { start: start, end: end, planEnd: planEnd, lag: planEnd ? diffDays(end, planEnd) : null,
      progress: weight ? done / weight : 0, late: late, current: current, soon: soon };
  }
  var STATUS = { work: ['work', 'В работе'], plan: ['plan', 'Планируется'], done: ['done', 'Сдан'] };

  // ── вид: объекты ───────────────────────────────────────────────────
  var currentObj = null;
  var view = 'objects';

  function paintObjects() {
    var grid = $('#objGrid'); grid.innerHTML = '';
    var counts = { work: 0, plan: 0, done: 0 };
    store.objects.forEach(function (obj) {
      counts[obj.status] = (counts[obj.status] || 0) + 1;
      var s = objStats(obj);
      var card = el('button', 'ocard'); card.type = 'button';
      var st = STATUS[obj.status] || STATUS.plan;
      var lagHtml = s.lag == null ? '<span class="muted">план не зафиксирован</span>'
        : s.lag > 0 ? '<span class="chip bad">отстаём на ' + days(s.lag) + '</span>'
        : s.lag < 0 ? '<span class="chip ok">опережаем на ' + days(-s.lag) + '</span>'
        : '<span class="chip ok">идём по плану</span>';
      var now = s.current && s.current.length
        ? '<div class="now"><span>Сейчас:</span> ' + esc(s.current[0].text) +
          (s.current[0].crew && crewById(s.current[0].crew) ? ' · ' + esc(crewById(s.current[0].crew).name) : '') + '</div>'
        : obj.status === 'plan' && !s.empty ? '<div class="now"><span>Начало:</span> ' + long(s.start) + '</div>' : '';
      card.innerHTML =
        '<div class="ocard-top"><div><h3>' + esc(obj.title) + '</h3><div class="addr">' + esc(obj.address) + '</div></div>' +
        '<span class="chip ' + st[0] + '">' + st[1] + '</span></div>' +
        (s.empty ? '<p class="muted">Работ пока нет</p>' :
        '<div><div class="row" style="margin-bottom:6px"><span>Готово</span><b>' + pct(s.progress) + '</b></div>' +
        '<div class="bar"><i style="width:' + Math.round(s.progress * 100) + '%"></i></div></div>' +
        '<div class="row"><span class="muted">Сдача по графику</span><b>' + dmy(addDays(s.end, -1)) + '</b></div>' +
        '<div class="chips">' + lagHtml + (s.late.length ? '<span class="chip bad">просрочено работ: ' + s.late.length + '</span>' : '') +
        (s.soon.length ? '<span class="chip work">поставок на неделе: ' + s.soon.length + '</span>' : '') + '</div>' + now);
      card.addEventListener('click', function () { openObject(obj.id); });
      grid.appendChild(card);
    });
    $('#objSummary').textContent = 'в работе: ' + counts.work + ', планируется: ' + counts.plan + ', сдано: ' + counts.done;
    paintTodayBar();
  }

  // что происходит сегодня на всех объектах
  function paintTodayBar() {
    var now = today(), going = [], late = [], soon = 0;
    store.objects.forEach(function (o) {
      var st = objStats(o);
      st.current.forEach(function (t) { going.push({ o: o, t: t }); });
      st.late.forEach(function (t) { late.push({ o: o, t: t }); });
      soon += st.soon.length;
    });
    var load = crewLoad(), clash = 0, clashCrew = null;
    Object.keys(load).forEach(function (k) { if (load[k].conflicts.length) { clash += load[k].conflicts.length; clashCrew = clashCrew || k; } });
    var bar = $('#todayBar'); bar.innerHTML = '';
    function tile(cls, num, label, sub, onClick) {
      var d = el(onClick ? 'button' : 'div', 'tile ' + cls);
      if (onClick) { d.type = 'button'; d.addEventListener('click', onClick); }
      d.innerHTML = '<b>' + num + '</b><span>' + label + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '');
      bar.appendChild(d);
    }
    tile('', going.length, 'работ идёт сегодня, ' + dm(now), going[0] ? going[0].t.text + ' · ' + going[0].o.address : '');
    tile(late.length ? 'bad' : 'ok', late.length, 'просрочено работ', late[0] ? late[0].t.text + ' · ' + late[0].o.address : 'всё в срок',
      late[0] ? function () { openObject(late[0].o.id, late[0].t.id); } : null);
    tile('', soon, 'поставок на этой неделе', '');
    tile(clash ? 'bad' : 'ok', clash, 'пересечений бригад', clash ? 'бригада нужна в двух местах' : 'нет',
      clash ? function () { crewSel = clashCrew; go('crews'); } : null);
  }

  function go(to) {
    if (view === 'object') syncStore();
    view = to;
    $('#vObjects').hidden = to !== 'objects';
    $('#vObject').hidden = to !== 'object';
    $('#vCrews').hidden = to !== 'crews';
    document.querySelectorAll('.tabs-top button').forEach(function (b) {
      b.setAttribute('aria-pressed', (b.dataset.go === to || (to === 'object' && b.dataset.go === 'objects')) ? 'true' : 'false');
    });
    closePop(); closeModal();
    if (to === 'objects') { currentObj = null; paintObjects(); }
    if (to === 'crews') openCrews();
    window.scrollTo(0, 0);
  }

  // ── график (DHTMLX Gantt) ──────────────────────────────────────────
  var ganttReady = false;
  var mode = 'object';                 // object | crew
  var todayMarker = null;
  var undoStack = [];
  var busy = false;                    // защита от повторного входа при каскаде

  var ZOOMS = {
    day: { min: 30, scales: [{ unit: 'month', step: 1, format: function (d) { return fmtMonth.format(d).replace(/\s*г\.$/, ''); } },
                             { unit: 'day', step: 1, format: '%j', css: function (d) { return (isWeekend(d) ? 'wk' : '') + (diffDays(d, today()) === 0 ? ' is-today' : ''); } }] },
    week: { min: 54, scales: [{ unit: 'month', step: 1, format: function (d) { return fmtMonth.format(d).replace(/\s*г\.$/, ''); } },
                              { unit: 'week', step: 1, format: function (d) { return dm(d); } }] },
    month: { min: 74, scales: [{ unit: 'year', step: 1, format: '%Y' },
                               { unit: 'month', step: 1, format: function (d) { return fmtMonth.format(d).replace(/\s*\d+\s*г\.$/, ''); } }] }
  };

  function crewCell(t) {
    if (t.kind === 'group' || t.kind === 'material') return '';
    var c = crewById(t.crew);
    return '<button class="cell-btn" data-act="crew" type="button">' +
      (c ? '<span class="dot" style="background:' + c.color + '"></span>' + esc(c.name) : '<span class="muted">назначить</span>') + '</button>';
  }
  function datesCell(t) {
    if (t.type === 'project') return '<span class="cell-dates muted">' + dm(t.start_date) + '–' + dm(addDays(t.end_date, -1)) + '</span>';
    if (t.kind === 'material') return '<button class="cell-btn cell-dates" data-act="matdate" type="button">' + dm(t.start_date) + '</button>';
    if (t.type === 'milestone') return '<button class="cell-btn cell-dates" data-act="dates" type="button">' + dm(t.start_date) + '</button>';
    return '<button class="cell-btn cell-dates" data-act="dates" type="button">' + dm(t.start_date) + '–' + dm(addDays(t.end_date, -1)) + '</button>';
  }
  function devOf(t) {
    if (!t.plan_end || t.type === 'project' || t.kind === 'material') return null;
    return diffDays(t.end_date, parse(t.plan_end));
  }
  function devCell(t) {
    var d = devOf(t);
    if (d == null) return '';
    if (d === 0) return '<span class="cell-dev ok">0</span>';
    return '<span class="cell-dev ' + (d > 0 ? 'bad' : 'ok') + '">' + (d > 0 ? '+' : '−') + Math.abs(d) + '</span>';
  }
  function nameCell(t) {
    if (t.kind === 'material') {
      return '<span class="mat-ico">🚚</span> ' + esc(t.text) + (t.qty ? ' · ' + esc(t.qty) + ' ' + esc(t.unit || '') : '');
    }
    return esc(t.text);
  }

  // номер работы «2.3»: своя нумерация, без поставок (в бесплатном DHTMLX её нет)
  function wbsOf(t) {
    var parts = [], cur = t;
    while (cur) {
      var parent = cur.parent || 0;
      var sib = gantt.getChildren(parent).filter(function (x) { return gantt.getTask(x).kind !== 'material'; });
      parts.unshift(sib.indexOf(cur.id) + 1);
      cur = parent && gantt.isTaskExists(parent) ? gantt.getTask(parent) : null;
    }
    return parts.join('.');
  }
  function objectColumns() {
    if (MOBILE.matches) {
      return [
        { name: 'text', label: 'Работа', tree: true, width: 170, template: nameCell }
      ];
    }
    return [
      { name: 'wbs', label: '№', width: 42, align: 'center', template: function (t) {
        return t.kind === 'material' ? '' : '<span class="muted">' + wbsOf(t) + '</span>'; } },
      { name: 'text', label: 'Работа', tree: true, width: 230, template: nameCell, editor: { type: 'text', map_to: 'text' } },
      { name: 'dates', label: 'Сроки', width: 104, template: datesCell },
      { name: 'duration', label: 'Дн.', width: 46, align: 'center', template: function (t) {
        return t.type === 'project' ? '<span class="muted">' + t.duration + '</span>' : t.kind === 'material' || t.type === 'milestone' ? '' : t.duration; },
        editor: { type: 'number', map_to: 'duration', min: 1, max: 400 } },
      { name: 'crew', label: 'Бригада', width: 158, template: crewCell },
      { name: 'progress', label: '%', width: 50, align: 'center', template: function (t) {
        return t.kind === 'material' ? (t.status === 'done' ? '✓' : '') : '<span class="cell-pct">' + pct(t.progress) + '</span>'; } },
      { name: 'dev', label: 'Откл.', width: 54, align: 'center', template: devCell },
      { name: 'plus', label: '', width: 38, align: 'center', template: function (t) {
        return t.kind === 'material' ? '' : '<button class="cell-add" data-act="add" type="button" aria-label="Добавить работу">+</button>'; } }
    ];
  }
  function crewColumns() {
    if (MOBILE.matches) return [{ name: 'text', label: 'Работа', tree: true, width: 170, template: nameCell }];
    return [
      { name: 'text', label: 'Объект / работа', tree: true, width: 300, template: nameCell },
      { name: 'dates', label: 'Сроки', width: 110, template: function (t) {
        return '<span class="cell-dates">' + dm(t.start_date) + '–' + dm(addDays(t.end_date, -1)) + '</span>'; } },
      { name: 'duration', label: 'Дн.', width: 50, align: 'center' },
      { name: 'progress', label: '%', width: 54, align: 'center', template: function (t) {
        return t.type === 'project' ? '' : '<span class="cell-pct">' + pct(t.progress) + '</span>'; } }
    ];
  }

  var GRID_W = { object: 722, crew: 514 };
  function layout(gridWidth) {
    return {
      css: 'gantt_container',
      cols: [
        { width: gridWidth, min_width: 160, rows: [
          { view: 'grid', scrollX: 'gridScroll', scrollable: true, scrollY: 'scrollVer' },
          { view: 'scrollbar', id: 'gridScroll', group: 'horizontal' }] },
        { resizer: true, width: 1 },
        { rows: [
          { view: 'timeline', scrollX: 'scrollHor', scrollY: 'scrollVer' },
          { view: 'scrollbar', id: 'scrollHor', group: 'horizontal' }] },
        { view: 'scrollbar', id: 'scrollVer' }
      ]
    };
  }
  function gridWidthFor(m) {
    if (MOBILE.matches) return 170;
    var full = GRID_W[m];
    return Math.min(full, Math.round(window.innerWidth * (m === 'crew' ? 0.42 : 0.5)));
  }
  function applyLayout(m) {
    gantt.config.layout = layout(gridWidthFor(m));
    if (ganttReady) gantt.resetLayout();
  }

  function setupGantt() {
    gantt.i18n.setLocale('ru');
    gantt.plugins({ tooltip: true });
    var c = gantt.config;
    c.date_format = '%Y-%m-%d';
    c.duration_unit = 'day';
    c.time_step = 24 * 60;
    c.round_dnd_dates = true;
    c.work_time = false;
    c.row_height = 38;
    c.bar_height = 20;
    c.scale_height = 52;
    c.open_tree_initially = true;
    c.drag_move = true;
    c.drag_resize = true;
    c.drag_progress = true;
    c.drag_links = true;
    c.drag_project = false;
    c.order_branch = true;
    c.order_branch_free = true;
    c.details_on_dblclick = false;
    c.details_on_create = false;
    c.show_errors = false;
    c.fit_tasks = true;
    c.touch = 'force';
    c.touch_drag = 350;                     // задержать палец — и тянуть; обычный свайп прокручивает
    c.touch_feedback = true;
    c.tooltip_timeout = 350;
    c.tooltip_hide_timeout = 0;
    c.show_tasks_outside_timescale = true;
    c.link_line_width = 2;
    c.link_arrow_size = 7;

    var t = gantt.templates;
    t.grid_folder = function () { return ''; };
    t.grid_file = function () { return ''; };
    t.grid_row_class = function (s, e, task) {
      return task.type === 'project' ? 'r-group' : task.kind === 'material' ? 'r-material' : '';
    };
    t.task_class = function (s, e, task) {
      var cls = [];
      if (task.kind === 'pause') cls.push('t-pause');
      if (task.kind === 'material') cls.push('t-mat', task.status || 'planned');
      if (task.kind === 'milestone') cls.push('t-handover');
      if (task.conflict) cls.push('t-conflict');
      if (task.kind === 'work' && (task.progress || 0) >= 1) cls.push('t-done');
      if (task.kind === 'work' && task.end_date <= today() && (task.progress || 0) < 1) cls.push('t-late');
      return cls.join(' ');
    };
    t.task_text = function (s, e, task) {
      if (task.type === 'milestone') return '';
      if (task.type === 'project') return esc(task.text);
      return esc(task.text);
    };
    t.rightside_text = function (s, e, task) {
      if (task.kind === 'material') return esc(task.text) + (task.qty ? ' · ' + esc(task.qty) + ' ' + esc(task.unit || '') : '');
      if (task.kind === 'milestone') return '🏠 ' + esc(task.text);
      return '';
    };
    t.progress_text = function () { return ''; };
    t.timeline_cell_class = function (task, date) {
      return prefs.zoom === 'day' && isWeekend(date) ? 'wk' : '';
    };
    t.task_row_class = function (s, e, task) { return task.type === 'project' ? 'r-group' : ''; };
    t.tooltip_text = function (start, end, task) {
      if (MOBILE.matches) return '';
      var c = crewById(task.crew);
      var rows = ['<div class="tip"><b>' + esc(task.text) + '</b>'];
      if (task.kind === 'material') {
        rows.push('<span class="k">Поставка:</span> ' + dmy(start));
        if (task.qty) rows.push('<br><span class="k">Объём:</span> ' + esc(task.qty) + ' ' + esc(task.unit || ''));
        if (task.supplier) rows.push('<br><span class="k">Поставщик:</span> ' + esc(task.supplier));
        rows.push('<br><span class="k">Статус:</span> ' + MAT_STATUS_TITLE[task.status || 'planned']);
      } else {
        rows.push('<span class="k">Сроки:</span> ' + dmy(start) + ' — ' + dmy(addDays(end, -1)) + ' (' + days(task.duration) + ')');
        if (c) rows.push('<br><span class="k">Бригада:</span> ' + esc(c.name));
        if (task.type !== 'project') rows.push('<br><span class="k">Готово:</span> ' + pct(task.progress));
        if (task.plan_end) {
          var d = devOf(task);
          rows.push('<br><span class="k">По плану:</span> ' + dmy(parse(task.plan_start)) + ' — ' + dmy(addDays(parse(task.plan_end), -1)) +
            (d ? ' <b style="display:inline;color:var(' + (d > 0 ? '--bad' : '--ok') + ')">' + (d > 0 ? '+' : '−') + days(Math.abs(d)) + '</b>' : ''));
        }
        if (task.objTitle) rows.push('<br><span class="k">Объект:</span> ' + esc(task.objTitle));
      }
      rows.push('</div>');
      return rows.join('');
    };

    gantt.attachEvent('onBeforeLightbox', function (id) { openTaskEditor(id); return false; });
    gantt.attachEvent('onTaskDblClick', function (id) {
      if (mode === 'crew') { openCrewWork(id); return false; }
      if (id) openTaskEditor(id);
      return false;
    });
    gantt.attachEvent('onTaskClick', function (id, e) {
      var act = e.target.closest && e.target.closest('[data-act]');
      if (mode === 'crew') {
        if (e.target.closest('.gantt_task_line') || e.target.closest('.gantt_row')) openCrewWork(id);
        return false;
      }
      if (act) { cellAction(id, act.dataset.act, act); return false; }
      // нажали на полоску — открываем подробности
      if (e.target.closest('.gantt_task_line') && !e.target.closest('.gantt_link_control')) {
        setTimeout(function () { openTaskEditor(id); }, 0);
        return true;
      }
      // на телефоне нажатие на строку тоже открывает подробности
      if (MOBILE.matches && e.target.closest('.gantt_row')) { setTimeout(function () { openTaskEditor(id); }, 0); }
      return true;
    });
    gantt.attachEvent('onLinkDblClick', function (id) {
      if (mode === 'crew') return false;
      var l = gantt.getLink(id), a = gantt.getTask(l.source), b = gantt.getTask(l.target);
      confirmBox('Убрать связь «' + a.text + '» → «' + b.text + '»?', 'Убрать').then(function (ok) {
        if (!ok) return;
        pushUndo(); gantt.deleteLink(id); syncStore(); toast('Связь убрана', 'Отменить', undo);
      });
      return false;
    });
    gantt.attachEvent('onBeforeTaskDrag', function (id, dragMode) {
      if (mode === 'crew') return false;
      var task = gantt.getTask(id);
      if (task.type === 'project') return false;
      if (task.kind === 'material' && dragMode !== 'move') return false;
      pushUndo();
      dragOrig = { id: id, start: new Date(task.start_date), end: new Date(task.end_date) };
      return true;
    });
    gantt.attachEvent('onAfterTaskDrag', function (id, dragMode) {
      var task = gantt.getTask(id);
      if (dragMode === 'progress') { syncStore(); return; }
      var shiftedStart = dragOrig ? diffDays(task.start_date, dragOrig.start) : 0;
      if (task.kind === 'material') { markMoved(task); syncStore(); return; }
      if (shiftedStart) shiftMaterials(id, shiftedStart);
      var n = cascade(id);
      syncStore();
      var what = dragMode === 'resize' ? 'Срок: ' + days(task.duration) : 'Работа: ' + dm(task.start_date) + '–' + dm(addDays(task.end_date, -1));
      toast(what + (n ? ' · сдвинуто следующих работ: ' + n : ''), 'Отменить', undo);
    });
    gantt.attachEvent('onBeforeLinkAdd', function (id, link) {
      if (mode === 'crew') return false;
      var a = gantt.getTask(link.source), b = gantt.getTask(link.target);
      if (a.type === 'project' || b.type === 'project' || a.kind === 'material' || b.kind === 'material') {
        toast('Связывать можно только работы между собой');
        return false;
      }
      link.type = gantt.config.links.finish_to_start;
      pushUndo();
      return true;
    });
    gantt.attachEvent('onAfterLinkAdd', function (id, link) {
      if (silentLink || busy) return;
      var n = cascade(link.source);
      syncStore();
      toast('«' + gantt.getTask(link.target).text + '» теперь после «' + gantt.getTask(link.source).text + '»' +
        (n ? ' · сдвинуто: ' + n : ''), 'Отменить', undo);
    });
    gantt.attachEvent('onBeforeRowDragEnd', function () { pushUndo(); return true; });
    gantt.attachEvent('onRowDragEnd', function () { syncStore(); });
    gantt.attachEvent('onBeforeTaskDisplay', function (id, task) {
      return mode === 'crew' || prefs.mats || task.kind !== 'material';
    });
    gantt.attachEvent('onGanttRender', drawPlan);
    gantt.attachEvent('onDataRender', drawPlan);
    gantt.attachEvent('onAfterTaskUpdate', function () { if (!busy) setTimeout(drawPlan, 0); });

    var ie = gantt.ext.inlineEditors;
    ie.attachEvent('onBeforeSave', function () { pushUndo(); return true; });
    ie.attachEvent('onSave', function (state) {
      if (state.columnName === 'duration') {
        var n = cascade(state.id);
        if (n) toast('Сдвинуто следующих работ: ' + n, 'Отменить', undo);
      }
      syncStore();
    });

    applyZoom(prefs.zoom, true);
    gantt.config.columns = objectColumns();
    gantt.config.layout = layout(gridWidthFor('object'));
    gantt.init('gantt');
    ganttReady = true;

    MOBILE.addEventListener('change', function () {
      gantt.config.columns = mode === 'crew' ? crewColumns() : objectColumns();
      applyLayout(mode);
      paintTips();
      gantt.render();
    });
    window.addEventListener('resize', function () { if (ganttReady) gantt.setSizes(); });
  }
  var dragOrig = null;

  function applyZoom(z, silent) {
    prefs.zoom = z; savePrefs();
    var cfg = ZOOMS[z];
    gantt.config.scales = cfg.scales;
    gantt.config.min_column_width = cfg.min;
    document.querySelectorAll('#zoomSeg button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.zoom === z ? 'true' : 'false');
    });
    if (!silent && ganttReady) { gantt.render(); gantt.showDate(today()); }
  }

  function addTodayMarker() { /* линию «сегодня» рисуем сами в drawPlan: маркеры в бесплатной версии отключены */ }

  // данные объекта ⇄ график
  function toGantt(t) {
    var g = {};
    Object.keys(t).forEach(function (k) { g[k] = t[k]; });
    g.start_date = t.start;
    delete g.start;
    g.open = true;
    g.parent = t.parent || 0;
    if (t.kind === 'group') { g.type = 'project'; }
    return g;
  }
  function fromGantt(g) {
    var t = {};
    ['id', 'text', 'type', 'kind', 'crew', 'progress', 'duration', 'plan_start', 'plan_end', 'note', 'qty', 'unit',
      'supplier', 'status', 'work'].forEach(function (k) { if (g[k] !== undefined && g[k] !== null && g[k] !== '') t[k] = g[k]; });
    t.parent = g.parent || 0;
    t.start = iso(g.start_date);
    if (t.kind === 'group') t.type = 'project';
    return t;
  }
  function loadObject(obj, keepScroll) {
    var scroll = keepScroll ? gantt.getScrollState() : null;
    mode = 'object';
    gantt.config.readonly = false;
    gantt.config.columns = objectColumns();
    applyLayout('object');
    gantt.clearAll();
    gantt.parse({ data: obj.tasks.map(toGantt), links: obj.links.map(function (l) { return { id: l.id, source: l.source, target: l.target, type: l.type || '0' }; }) });
    recalcGroups();
    addTodayMarker();
    gantt.render();
    if (scroll) gantt.scrollTo(scroll.x, scroll.y);
  }
  // сохраняем то, что на графике, обратно в данные объекта
  function syncStore() {
    if (!currentObj || mode !== 'object' || !ganttReady) return;
    recalcGroups();
    var tasks = [];
    gantt.eachTask(function (g) { tasks.push(fromGantt(g)); });
    currentObj.tasks = tasks;
    currentObj.links = gantt.getLinks().map(function (l) { return { id: String(l.id), source: l.source, target: l.target, type: '0' }; });
    saveStore();
    paintObjectHead();
    drawPlan();
    $('#undoBtn').disabled = !undoStack.length;
  }
  // готовность этапа — средняя по его работам с учётом длительности
  function recalcGroups() {
    gantt.eachTask(function (g) {
      if (g.type !== 'project') return;
      var w = 0, d = 0;
      gantt.eachTask(function (c) {
        if (c.kind === 'material' || c.type === 'project') return;
        var k = Math.max(1, c.duration || 0); w += k; d += k * (c.progress || 0);
      }, g.id);
      g.progress = w ? d / w : 0;
    });
  }

  // следующие работы не могут начаться раньше, чем закончится предыдущая
  function cascade(id) {
    busy = true;
    var moved = {};
    (function walk(src) {
      var s = gantt.getTask(src);
      gantt.getLinks().forEach(function (l) {
        if (String(l.source) !== String(src) || !gantt.isTaskExists(l.target)) return;
        var t = gantt.getTask(l.target);
        if (t.start_date < s.end_date) {
          var delta = diffDays(s.end_date, t.start_date);
          t.start_date = new Date(s.end_date);
          t.end_date = gantt.calculateEndDate({ start_date: t.start_date, duration: t.duration, task: t });
          gantt.updateTask(t.id);
          shiftMaterials(t.id, delta);
          moved[t.id] = true;
          walk(t.id);
        }
      });
    })(id);
    busy = false;
    return Object.keys(moved).length;
  }
  function shiftMaterials(workId, delta) {
    if (!delta) return;
    gantt.eachTask(function (m) {
      if (m.kind !== 'material' || String(m.work) !== String(workId)) return;
      m.start_date = addDays(m.start_date, delta);
      m.end_date = new Date(m.start_date);
      gantt.updateTask(m.id);
    });
  }
  function markMoved(m) { if (m.status === 'done' && m.start_date > today()) { m.status = 'ordered'; gantt.updateTask(m.id); } }

  // линия плана под каждой работой и красный хвост, если работа заканчивается позже плана
  function drawPlan() {
    if (!ganttReady || !gantt.$task_data) return;
    var layer = gantt.$task_data.querySelector('.plan-layer');
    if (!layer) { layer = el('div', 'plan-layer'); gantt.$task_data.appendChild(layer); }
    var html = [];
    var x = gantt.posFromDate(today());
    if (x != null && x >= 0) {
      html.push('<i class="today-line" style="left:' + x + 'px"></i><span class="today-tag" style="left:' + x + 'px">Сегодня</span>');
    }
    if (mode !== 'object') { layer.innerHTML = html.join(''); return; }
    gantt.eachTask(function (t) {
      if (!t.plan_start || !t.plan_end || t.type === 'project' || t.kind === 'material' || !gantt.isTaskVisible(t.id)) return;
      var ps = parse(t.plan_start), pe = parse(t.plan_end);
      var p = gantt.getTaskPosition(t, ps, pe > ps ? pe : addDays(ps, 1));
      var bar = gantt.getTaskPosition(t, t.start_date, t.end_date);
      var top = bar.top + bar.height + 2;
      if (t.type !== 'milestone') {
        html.push('<i class="plan-line" style="left:' + p.left + 'px;width:' + Math.max(4, p.width) + 'px;top:' + top + 'px"></i>');
      }
      if (t.end_date > pe && t.type !== 'milestone') {
        var from = Math.max(gantt.posFromDate(pe), bar.left);
        html.push('<i class="lag-tail" style="left:' + from + 'px;width:' + Math.max(0, bar.left + bar.width - from) +
          'px;top:' + (bar.top - 5) + 'px"></i>');
      }
    });
    layer.innerHTML = html.join('');
  }

  // ── отмена ─────────────────────────────────────────────────────────
  function pushUndo() {
    if (!currentObj) return;
    var snap = JSON.stringify({ tasks: [], links: [] });
    if (ganttReady && mode === 'object') {
      var tasks = [];
      gantt.eachTask(function (g) { tasks.push(fromGantt(g)); });
      snap = JSON.stringify({ tasks: tasks, baselineAt: currentObj.baselineAt || null, links: gantt.getLinks().map(function (l) {
        return { id: String(l.id), source: l.source, target: l.target, type: '0' }; }) });
    }
    undoStack.push(snap);
    if (undoStack.length > 60) undoStack.shift();
    $('#undoBtn').disabled = false;
  }
  function undo() {
    if (!undoStack.length || !currentObj) return;
    var snap = JSON.parse(undoStack.pop());
    currentObj.tasks = snap.tasks; currentObj.links = snap.links;
    if ('baselineAt' in snap) currentObj.baselineAt = snap.baselineAt;
    saveStore();
    loadObject(currentObj, true);
    paintObjectHead();
    $('#undoBtn').disabled = !undoStack.length;
    hideToast();
  }

  // ── открыть объект ─────────────────────────────────────────────────
  function openObject(id, focusTask) {
    currentObj = objById(id);
    if (!currentObj) return;
    undoStack = [];
    view = 'object';
    $('#vObjects').hidden = true; $('#vCrews').hidden = true; $('#vObject').hidden = false;
    document.querySelectorAll('.tabs-top button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.go === 'objects' ? 'true' : 'false');
    });
    var host = $('#vObject .gantt-wrap');
    if ($('#gantt').parentNode !== host) host.appendChild($('#gantt'));
    $('#showMats').checked = !!prefs.mats;
    paintTips();
    paintLegend();
    window.scrollTo(0, 0);
    if (!ganttReady) setupGantt();
    loadObject(currentObj);
    gantt.setSizes();
    paintObjectHead();
    $('#undoBtn').disabled = true;
    if (focusTask && gantt.isTaskExists(focusTask)) {
      gantt.selectTask(focusTask);
      gantt.showTask(focusTask);
      setTimeout(function () { openTaskEditor(focusTask); }, 50);
    } else {
      // сразу к тому, что делается сейчас: первая незаконченная работа
      var current = null;
      gantt.eachTask(function (t) {
        if (!current && t.kind === 'work' && (t.progress || 0) < 1) current = t.id;
      });
      if (current) {
        gantt.scrollTo(null, Math.max(0, gantt.getTaskTop(current) - 3 * gantt.config.row_height));
        gantt.showDate(addDays(today(), -7));
      } else {
        gantt.showDate(today());
      }
    }
  }

  function paintObjectHead() {
    if (!currentObj) return;
    $('#oTitle').textContent = currentObj.title;
    var st = STATUS[currentObj.status] || STATUS.plan;
    $('#oAddress').innerHTML = esc(currentObj.address) + ' · <span class="chip ' + st[0] + '">' + st[1] + '</span>' +
      (currentObj.baselineAt ? ' · <span>план зафиксирован ' + dmy(parse(currentObj.baselineAt)) + '</span>' : ' · <span>план не зафиксирован</span>');
    var s = objStats(currentObj);
    $('#oBar').style.width = Math.round((s.progress || 0) * 100) + '%';
    var box = $('#oStats'); box.innerHTML = '';
    if (s.empty) { box.innerHTML = '<div class="stat"><span>Работ</span><b>0</b></div>'; return; }
    var items = [
      ['Начало', dmy(s.start)],
      ['Сдача по плану', s.planEnd ? dmy(addDays(s.planEnd, -1)) : '—'],
      ['Сдача по графику', dmy(addDays(s.end, -1)), s.lag > 0 ? 'bad' : s.lag != null ? 'ok' : ''],
      ['Отклонение', s.lag == null ? '—' : s.lag === 0 ? 'по плану' : (s.lag > 0 ? '+' : '−') + days(Math.abs(s.lag)), s.lag > 0 ? 'bad' : s.lag != null ? 'ok' : ''],
      ['Готово', pct(s.progress)],
      ['Просрочено работ', String(s.late.length), s.late.length ? 'bad' : ''],
      ['Поставок на неделе', String(s.soon.length)]
    ];
    items.forEach(function (it) {
      var d = el('div', 'stat');
      d.innerHTML = '<span>' + it[0] + '</span><b class="' + (it[2] || '') + '">' + it[1] + '</b>';
      box.appendChild(d);
    });
  }

  var ICON = {
    move: '<svg viewBox="0 0 24 24"><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>',
    edge: '<svg viewBox="0 0 24 24"><path d="M5 5v14M19 12H9M15 8l4 4-4 4"/></svg>',
    link: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="2.5"/><circle cx="18.5" cy="12" r="2.5"/><path d="M8 12h8"/></svg>',
    tap: '<svg viewBox="0 0 24 24"><path d="M9 11V5.5a2 2 0 1 1 4 0V11m0-1.5a2 2 0 1 1 4 0V13a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4.3-2.5L4.3 13a1.6 1.6 0 0 1 2.8-1.6L9 14"/></svg>',
    hold: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/></svg>'
  };
  function paintTips() {
    var tips = MOBILE.matches
      ? [[ICON.tap, 'Нажмите на работу', ' — сроки, бригада, готовность'], [ICON.hold, 'Задержите палец', ' на полоске — перетащить']]
      : [[ICON.move, 'Тяните полоску', ' — сдвинуть работу'], [ICON.edge, 'Тяните край', ' — изменить срок'],
         [ICON.link, 'Кружок на краю', ' → на другую работу — связать'], [ICON.tap, 'Нажмите на полоску', ' — подробности']];
    $('#tips').innerHTML = tips.map(function (t) { return '<span>' + t[0] + '<span><b>' + t[1] + '</b>' + t[2] + '</span></span>'; }).join('') +
      '<button class="link" type="button" data-help>Как пользоваться</button>';
  }
  function paintLegend() {
    $('#legend').innerHTML =
      '<span><i style="background:var(--accent)"></i>работа (цвет — бригада)</span>' +
      '<span><i style="background:repeating-linear-gradient(-45deg,var(--pause) 0 4px,transparent 4px 7px);border:1px solid var(--pause)"></i>технологический перерыв</span>' +
      '<span><i style="height:4px;background:var(--plan)"></i>как было по плану</span>' +
      '<span><i style="height:3px;background:var(--bad)"></i>позже плана</span>' +
      '<span><i style="width:10px;height:10px;transform:rotate(45deg);background:var(--ok)"></i>поставка материалов</span>';
  }

  // цвет полоски — цвет бригады
  function paintCrewColors() {
    var css = store.crews.map(function (c) {
      return '#gantt .gantt_task_line.crew-' + c.id + '{background:' + c.color + '}';
    }).join('\n');
    var tag = $('#crewColors');
    if (!tag) { tag = el('style'); tag.id = 'crewColors'; document.head.appendChild(tag); }
    tag.textContent = css;
    var base = gantt.templates.task_class;
    if (!base.$wrapped) {
      gantt.templates.task_class = function (s, e, task) {
        var c = base(s, e, task);
        return task.crew && task.kind === 'work' ? c + ' crew-' + task.crew : c;
      };
      gantt.templates.task_class.$wrapped = true;
    }
  }

  // ── действия в ячейках таблицы ─────────────────────────────────────
  function cellAction(id, act, anchor) {
    var t = gantt.getTask(id);
    if (act === 'crew') {
      openList(anchor, crewOptions(true), t.crew || '', function (v) {
        pushUndo(); t.crew = v; gantt.updateTask(id); syncStore();
      });
    } else if (act === 'dates') {
      openRange(anchor, t.start_date, t.type === 'milestone' ? t.start_date : addDays(t.end_date, -1), function (s, e) {
        applyDates(id, s, e);
      }, t.type === 'milestone');
    } else if (act === 'matdate') {
      openRange(anchor, t.start_date, t.start_date, function (s) {
        pushUndo(); t.start_date = s; t.end_date = new Date(s); markMoved(t); gantt.updateTask(id); syncStore();
      }, true);
    } else if (act === 'add') {
      openNewTask(id);
    }
  }
  function applyDates(id, s, e) {
    var t = gantt.getTask(id);
    pushUndo();
    var shift = diffDays(s, t.start_date);
    t.start_date = s;
    t.duration = t.type === 'milestone' ? 0 : Math.max(1, diffDays(e, s) + 1);
    t.end_date = gantt.calculateEndDate({ start_date: s, duration: t.duration, task: t });
    gantt.updateTask(id);
    shiftMaterials(id, shift);
    var n = cascade(id);
    syncStore();
    toast('Сроки: ' + dm(s) + (t.type === 'milestone' ? '' : '–' + dm(e)) + (n ? ' · сдвинуто следующих работ: ' + n : ''), 'Отменить', undo);
  }
  function crewOptions(withNone) {
    var list = store.crews.map(function (c) { return { v: c.id, l: c.name, color: c.color }; });
    if (withNone) list.unshift({ v: '', l: 'Без бригады' });
    return list;
  }

  // ── своё окно работы ───────────────────────────────────────────────
  function openTaskEditor(id) {
    if (!gantt.isTaskExists(id) || mode !== 'object') return;
    var t = gantt.getTask(id);
    if (t.type === 'project') return openGroupEditor(id);
    if (t.kind === 'material') return openMaterialEditor(id);
    closePop();
    var draft = { text: t.text, start: new Date(t.start_date), end: addDays(t.end_date, t.type === 'milestone' ? 0 : -1),
      crew: t.crew || '', progress: t.progress || 0, note: t.note || '', parent: t.parent };
    var milestone = t.type === 'milestone';
    var body = el('div');
    body.style.display = 'contents';

    var fName = field('Название работы');
    var name = el('input', 'inp'); name.value = draft.text; name.maxLength = 120;
    fName.appendChild(name); body.appendChild(fName);

    var row = el('div', 'two');
    var fDates = field(milestone ? 'Дата' : 'Сроки');
    var datesBtn = pickBtn('', calIcon());
    function paintDates() {
      datesBtn.querySelector('.v').textContent = milestone ? dmy(draft.start)
        : dmy(draft.start) + ' – ' + dmy(draft.end) + ' · ' + days(diffDays(draft.end, draft.start) + 1);
    }
    paintDates();
    datesBtn.addEventListener('click', function () {
      openRange(datesBtn, draft.start, draft.end, function (s, e) { draft.start = s; draft.end = e; paintDates(); paintDur(); }, milestone);
    });
    fDates.appendChild(datesBtn); row.appendChild(fDates);

    var fCrew = field('Бригада');
    var crewBtn = pickBtn('', chevron());
    function paintCrew() {
      var c = crewById(draft.crew);
      crewBtn.querySelector('.v').innerHTML = c ? '<span class="dot" style="background:' + c.color + '"></span> ' + esc(c.name) : '<span class="muted">Без бригады</span>';
    }
    paintCrew();
    crewBtn.addEventListener('click', function () { openList(crewBtn, crewOptions(true), draft.crew, function (v) { draft.crew = v; paintCrew(); }); });
    fCrew.appendChild(crewBtn); row.appendChild(fCrew);
    body.appendChild(row);

    var durVal;
    if (!milestone) {
      var row2 = el('div', 'two');
      var fDur = field('Длительность');
      var stepper = el('div', 'stepper');
      var minus = el('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'На день короче');
      durVal = el('b');
      var plus = el('button', '', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'На день дольше');
      minus.addEventListener('click', function () { if (diffDays(draft.end, draft.start) > 0) { draft.end = addDays(draft.end, -1); paintDates(); paintDur(); } });
      plus.addEventListener('click', function () { draft.end = addDays(draft.end, 1); paintDates(); paintDur(); });
      stepper.appendChild(minus); stepper.appendChild(durVal); stepper.appendChild(plus);
      fDur.appendChild(stepper); row2.appendChild(fDur);

      var fShift = field('Сдвинуть работу');
      var q = el('div', 'quick');
      [[-7, '−7 дн.'], [-1, '−1'], [1, '+1'], [7, '+7 дн.']].forEach(function (s) {
        var b = el('button', '', s[1]); b.type = 'button';
        b.addEventListener('click', function () { draft.start = addDays(draft.start, s[0]); draft.end = addDays(draft.end, s[0]); paintDates(); });
        q.appendChild(b);
      });
      fShift.appendChild(q); row2.appendChild(fShift);
      body.appendChild(row2);

      var fPct = field('Готовность');
      var pr = el('div', 'pct-row');
      var range = el('input', 'range'); range.type = 'range'; range.min = 0; range.max = 100; range.step = 5;
      range.value = Math.round(draft.progress * 100);
      var pv = el('b', '', pct(draft.progress));
      range.addEventListener('input', function () { draft.progress = range.value / 100; pv.textContent = range.value + '%'; paintQuick(); });
      pr.appendChild(range); pr.appendChild(pv); fPct.appendChild(pr);
      var qp = el('div', 'quick');
      var quickBtns = [0, 25, 50, 75, 100].map(function (v) {
        var b = el('button', '', v === 100 ? 'Готово' : v + '%'); b.type = 'button';
        b.addEventListener('click', function () { draft.progress = v / 100; range.value = v; pv.textContent = v + '%'; paintQuick(); });
        qp.appendChild(b); return [v, b];
      });
      function paintQuick() { quickBtns.forEach(function (x) { x[1].setAttribute('aria-pressed', Math.round(draft.progress * 100) === x[0] ? 'true' : 'false'); }); }
      paintQuick();
      fPct.appendChild(qp); body.appendChild(fPct);
    }
    function paintDur() { if (durVal) durVal.textContent = days(diffDays(draft.end, draft.start) + 1); }
    paintDur();

    // после каких работ
    var preds = gantt.getLinks().filter(function (l) { return String(l.target) === String(id); });
    var fDeps = field('Начинается после');
    var depBox = el('div', 'quick');
    function paintDeps() {
      depBox.innerHTML = '';
      preds.forEach(function (l, i) {
        if (!gantt.isTaskExists(l.source)) return;
        var b = el('button', '', gantt.getTask(l.source).text + ' ×'); b.type = 'button';
        b.setAttribute('aria-label', 'Убрать связь с работой ' + gantt.getTask(l.source).text);
        b.addEventListener('click', function () { preds.splice(i, 1); paintDeps(); });
        depBox.appendChild(b);
      });
      var add = el('button', '', '+ добавить'); add.type = 'button';
      add.addEventListener('click', function () {
        var opts = [];
        gantt.eachTask(function (o) {
          if (o.id === id || o.type === 'project' || o.kind === 'material') return;
          if (preds.some(function (l) { return String(l.source) === String(o.id); })) return;
          opts.push({ v: o.id, l: o.text });
        });
        openList(add, opts, null, function (v) { preds.push({ source: v, target: id, $new: true }); paintDeps(); });
      });
      depBox.appendChild(add);
    }
    paintDeps();
    fDeps.appendChild(depBox); body.appendChild(fDeps);

    if (t.plan_start && t.plan_end) {
      var d = devOf(t);
      var pn = el('div', 'plan-note');
      pn.innerHTML = 'По плану: <b>' + dmy(parse(t.plan_start)) + ' – ' + dmy(addDays(parse(t.plan_end), -1)) + '</b>' +
        (d ? ' · <b style="color:var(' + (d > 0 ? '--bad' : '--ok') + ')">' + (d > 0 ? 'позже на ' : 'раньше на ') + days(Math.abs(d)) + '</b>' : ' · <b style="color:var(--ok)">в срок</b>');
      body.appendChild(pn);
    }

    var mats = [];
    gantt.eachTask(function (m) { if (m.kind === 'material' && String(m.work) === String(id)) mats.push(m); });
    var fMat = field('Поставки материалов для этой работы');
    var list = el('div', 'mat-list');
    mats.forEach(function (m) {
      var r = el('div', 'mat-row');
      r.innerHTML = '<span class="mat-ico">🚚</span><span class="t">' + esc(m.text) + (m.qty ? ' · ' + esc(m.qty) + ' ' + esc(m.unit || '') : '') +
        '</span><span class="d">' + dm(m.start_date) + '</span><span class="chip ' + MAT_STATUS_CHIP[m.status || 'planned'] + '">' +
        MAT_STATUS_TITLE[m.status || 'planned'] + '</span>';
      r.addEventListener('click', function () { closeModal(); openMaterialEditor(m.id); });
      list.appendChild(r);
    });
    var addM = el('button', 'link', '+ Добавить поставку'); addM.type = 'button';
    addM.addEventListener('click', function () { closeModal(); openMaterialEditor(null, id); });
    list.appendChild(addM);
    fMat.appendChild(list); body.appendChild(fMat);

    var fNote = field('Комментарий');
    var note = el('textarea', 'inp'); note.value = draft.note; note.placeholder = 'Например: ждём арматуру, бригада выходит с понедельника';
    fNote.appendChild(note); body.appendChild(fNote);

    var del = el('button', 'btn danger left', 'Удалить'); del.type = 'button';
    del.addEventListener('click', function () {
      confirmBox('Удалить работу «' + t.text + '»? Её поставки тоже удалятся.', 'Удалить').then(function (ok) {
        if (!ok) return;
        pushUndo();
        var ids = [];
        gantt.eachTask(function (m) { if (m.kind === 'material' && String(m.work) === String(id)) ids.push(m.id); });
        ids.forEach(function (x) { gantt.deleteTask(x); });
        gantt.deleteTask(id);
        syncStore();
        toast('Работа удалена', 'Отменить', undo);
      });
    });
    var cancel = el('button', 'btn ghost', 'Отмена'); cancel.type = 'button'; cancel.addEventListener('click', closeModal);
    var save = el('button', 'btn', 'Сохранить'); save.type = 'button';
    save.addEventListener('click', function () {
      pushUndo();
      var shift = diffDays(draft.start, t.start_date);
      t.text = name.value.trim() || t.text;
      t.crew = draft.crew;
      t.note = note.value.trim();
      t.start_date = draft.start;
      if (!milestone) {
        t.duration = diffDays(draft.end, draft.start) + 1;
        t.progress = draft.progress;
      }
      t.end_date = gantt.calculateEndDate({ start_date: t.start_date, duration: t.duration, task: t });
      gantt.updateTask(id);
      shiftMaterials(id, shift);
      // связи: убранные удаляем, новые добавляем
      gantt.getLinks().filter(function (l) { return String(l.target) === String(id); }).forEach(function (l) {
        if (!preds.some(function (p) { return p.id === l.id; })) gantt.deleteLink(l.id);
      });
      busy = true;
      preds.filter(function (p) { return p.$new; }).forEach(function (p) {
        gantt.addLink({ id: uid('l'), source: p.source, target: id, type: '0' });
      });
      busy = false;
      // если работу поставили раньше, чем закончится предыдущая, — подвинем её саму
      var n = 0;
      gantt.getLinks().forEach(function (l) {
        if (String(l.target) === String(id) && gantt.isTaskExists(l.source)) n += cascade(l.source);
      });
      n += cascade(id);
      closeModal();
      syncStore();
      toast('Сохранено' + (n ? ' · сдвинуто работ: ' + n : ''), 'Отменить', undo);
    });
    openModal(milestone ? 'Веха' : 'Работа', body, [del, cancel, save]);
    setTimeout(function () { if (!MOBILE.matches) name.focus(); }, 30);
  }

  function openGroupEditor(id) {
    var t = gantt.getTask(id);
    var body = el('div'); body.style.display = 'contents';
    var f = field('Название этапа');
    var name = el('input', 'inp'); name.value = t.text; name.maxLength = 80;
    f.appendChild(name); body.appendChild(f);
    var info = el('p', 'muted', 'Сроки этапа считаются сами — от первой до последней работы внутри него (' +
      dmy(t.start_date) + ' – ' + dmy(addDays(t.end_date, -1)) + ').');
    body.appendChild(info);
    var del = el('button', 'btn danger left', 'Удалить этап'); del.type = 'button';
    del.addEventListener('click', function () {
      var kids = gantt.getChildren(id).length;
      confirmBox('Удалить этап «' + t.text + '»' + (kids ? ' вместе с работами внутри (' + kids + ')' : '') + '?', 'Удалить').then(function (ok) {
        if (!ok) return;
        pushUndo(); gantt.deleteTask(id); syncStore(); toast('Этап удалён', 'Отменить', undo);
      });
    });
    var cancel = el('button', 'btn ghost', 'Отмена'); cancel.type = 'button'; cancel.addEventListener('click', closeModal);
    var save = el('button', 'btn', 'Сохранить'); save.type = 'button';
    save.addEventListener('click', function () {
      pushUndo(); t.text = name.value.trim() || t.text; gantt.updateTask(id); closeModal(); syncStore();
    });
    openModal('Этап', body, [del, cancel, save]);
    setTimeout(function () { name.focus(); name.select(); }, 30);
  }

  var MAT_STATUS_TITLE = { planned: 'Не заказано', ordered: 'Заказано', done: 'Доставлено' };
  var MAT_STATUS_CHIP = { planned: 'plan', ordered: 'work', done: 'done' };
  function openMaterialEditor(id, workId) {
    var isNew = !id;
    var works = [];
    gantt.eachTask(function (o) { if (o.kind === 'work') works.push({ v: o.id, l: o.text }); });
    if (!works.length) { toast('Сначала добавьте работу'); return; }
    var m = isNew ? null : gantt.getTask(id);
    var w = workId || (m && m.work) || (gantt.getSelectedId() && gantt.isTaskExists(gantt.getSelectedId()) &&
      gantt.getTask(gantt.getSelectedId()).kind === 'work' ? gantt.getSelectedId() : works[0].v);
    var draft = {
      text: m ? m.text : '', qty: m ? m.qty || '' : '', unit: m ? m.unit || '' : '', supplier: m ? m.supplier || '' : '',
      status: m ? m.status || 'planned' : 'planned', work: w,
      date: m ? new Date(m.start_date) : addDays(gantt.getTask(w).start_date, -1)
    };
    var body = el('div'); body.style.display = 'contents';
    var f1 = field('Материал'); var name = el('input', 'inp'); name.value = draft.text; name.placeholder = 'Например: Бетон М300';
    f1.appendChild(name); body.appendChild(f1);
    var r1 = el('div', 'two');
    var f2 = field('Количество'); var qty = el('input', 'inp'); qty.value = draft.qty; qty.inputMode = 'decimal'; f2.appendChild(qty); r1.appendChild(f2);
    var f3 = field('Единица'); var unitBtn = pickBtn(draft.unit || 'выбрать', chevron());
    unitBtn.addEventListener('click', function () {
      openList(unitBtn, ['м³', 'т', 'шт', 'м²', 'п.м.', 'меш.', 'компл.'].map(function (u) { return { v: u, l: u }; }), draft.unit,
        function (v) { draft.unit = v; unitBtn.querySelector('.v').textContent = v; });
    });
    f3.appendChild(unitBtn); r1.appendChild(f3); body.appendChild(r1);
    var r2 = el('div', 'two');
    var f4 = field('Дата поставки'); var dateBtn = pickBtn(dmy(draft.date), calIcon());
    dateBtn.addEventListener('click', function () {
      openRange(dateBtn, draft.date, draft.date, function (s) { draft.date = s; dateBtn.querySelector('.v').textContent = dmy(s); }, true);
    });
    f4.appendChild(dateBtn); r2.appendChild(f4);
    var f5 = field('Для работы'); var workBtn = pickBtn(gantt.getTask(draft.work).text, chevron());
    workBtn.addEventListener('click', function () {
      openList(workBtn, works, draft.work, function (v) { draft.work = v; workBtn.querySelector('.v').textContent = gantt.getTask(v).text; });
    });
    f5.appendChild(workBtn); r2.appendChild(f5); body.appendChild(r2);
    var f6 = field('Поставщик'); var sup = el('input', 'inp'); sup.value = draft.supplier; f6.appendChild(sup); body.appendChild(f6);
    var f7 = field('Статус'); var seg = el('div', 'quick');
    var segBtns = Object.keys(MAT_STATUS_TITLE).map(function (k) {
      var b = el('button', '', MAT_STATUS_TITLE[k]); b.type = 'button';
      b.addEventListener('click', function () { draft.status = k; paintSeg(); });
      seg.appendChild(b); return [k, b];
    });
    function paintSeg() { segBtns.forEach(function (x) { x[1].setAttribute('aria-pressed', x[0] === draft.status ? 'true' : 'false'); }); }
    paintSeg(); f7.appendChild(seg); body.appendChild(f7);

    var foot = [];
    if (!isNew) {
      var del = el('button', 'btn danger left', 'Удалить'); del.type = 'button';
      del.addEventListener('click', function () {
        confirmBox('Удалить поставку «' + m.text + '»?', 'Удалить').then(function (ok) {
          if (!ok) return; pushUndo(); gantt.deleteTask(id); syncStore(); toast('Поставка удалена', 'Отменить', undo);
        });
      });
      foot.push(del);
    }
    var cancel = el('button', 'btn ghost', 'Отмена'); cancel.type = 'button'; cancel.addEventListener('click', closeModal);
    var save = el('button', 'btn', isNew ? 'Добавить' : 'Сохранить'); save.type = 'button';
    save.addEventListener('click', function () {
      var title = name.value.trim();
      if (!title) { name.focus(); toast('Напишите, какой материал'); return; }
      pushUndo();
      var work = gantt.getTask(draft.work);
      var data = { text: title, qty: qty.value.trim(), unit: draft.unit, supplier: sup.value.trim(), status: draft.status,
        work: draft.work, kind: 'material', type: 'milestone', progress: draft.status === 'done' ? 1 : 0 };
      if (isNew) {
        data.id = uid('m'); data.start_date = draft.date; data.duration = 0;
        var idx = gantt.getTaskIndex(work.id) + 1;
        gantt.addTask(data, work.parent, idx);
      } else {
        Object.keys(data).forEach(function (k) { m[k] = data[k]; });
        m.start_date = draft.date; m.end_date = new Date(draft.date);
        if (String(m.parent) !== String(work.parent)) gantt.moveTask(m.id, gantt.getTaskIndex(work.id) + 1, work.parent);
        gantt.updateTask(m.id);
      }
      if (!prefs.mats) { prefs.mats = true; savePrefs(); $('#showMats').checked = true; gantt.refreshData(); }
      closeModal(); syncStore(); toast(isNew ? 'Поставка добавлена' : 'Сохранено', 'Отменить', undo);
    });
    foot.push(cancel, save);
    openModal(isNew ? 'Новая поставка' : 'Поставка материалов', body, foot);
    setTimeout(function () { if (isNew) name.focus(); }, 30);
  }

  function stageList() {
    var list = [];
    gantt.eachTask(function (t) { if (t.type === 'project') list.push({ v: t.id, l: t.text }); });
    return list;
  }
  function worksOf(stageId) {
    var list = [];
    gantt.eachTask(function (t) { if (t.kind !== 'material' && t.type !== 'project') list.push(t); }, stageId || 0);
    return list;
  }
  // новая работа: этап, после какой работы, сроки, бригада
  function openNewTask(refId) {
    var ref = refId && gantt.isTaskExists(refId) ? gantt.getTask(refId) : null;
    if (ref && ref.kind === 'material') ref = gantt.getTask(ref.work);
    var stages = stageList();
    if (!stages.length) { openNewStage(); return; }
    var draft = { text: '', crew: '', stage: null, pred: '' };
    draft.stage = ref ? (ref.type === 'project' ? ref.id : ref.parent) : stages[stages.length - 1].v;
    var inStage = worksOf(draft.stage);
    var predTask = ref && ref.type !== 'project' ? ref : inStage[inStage.length - 1] || null;
    draft.pred = predTask ? predTask.id : '';
    draft.start = predTask ? new Date(predTask.end_date) : today();
    draft.end = addDays(draft.start, 2);

    var body = el('div'); body.style.display = 'contents';
    var f1 = field('Название работы'); var name = el('input', 'inp'); name.placeholder = 'Например: Монтаж забора'; name.maxLength = 120;
    f1.appendChild(name); body.appendChild(f1);
    var r1 = el('div', 'two');
    var f2 = field('Этап'); var stageBtn = pickBtn('', chevron()); f2.appendChild(stageBtn); r1.appendChild(f2);
    var f3 = field('Начинается после'); var predBtn = pickBtn('', chevron()); f3.appendChild(predBtn); r1.appendChild(f3);
    body.appendChild(r1);
    var r2 = el('div', 'two');
    var f4 = field('Сроки'); var datesBtn = pickBtn('', calIcon()); f4.appendChild(datesBtn); r2.appendChild(f4);
    var f5 = field('Бригада'); var crewBtn = pickBtn('', chevron()); f5.appendChild(crewBtn); r2.appendChild(f5);
    body.appendChild(r2);
    body.appendChild(el('p', 'muted', 'Если выбрать «Начинается после», работа встанет сразу за ней и будет сдвигаться вместе с ней.'));
    function paint() {
      stageBtn.querySelector('.v').textContent = gantt.getTask(draft.stage).text;
      predBtn.querySelector('.v').textContent = draft.pred ? gantt.getTask(draft.pred).text : 'Ни после чего — по дате';
      datesBtn.querySelector('.v').textContent = dmy(draft.start) + ' – ' + dmy(draft.end) + ' · ' + days(diffDays(draft.end, draft.start) + 1);
      var c = crewById(draft.crew);
      crewBtn.querySelector('.v').innerHTML = c ? '<span class="dot" style="background:' + c.color + '"></span> ' + esc(c.name) : '<span class="muted">Без бригады</span>';
    }
    paint();
    stageBtn.addEventListener('click', function () {
      openList(stageBtn, stageList(), draft.stage, function (v) {
        draft.stage = v;
        var ws = worksOf(v);
        if (draft.pred && String(gantt.getTask(draft.pred).parent) !== String(v)) {
          draft.pred = ws.length ? ws[ws.length - 1].id : '';
          if (draft.pred) { var len = diffDays(draft.end, draft.start); draft.start = new Date(gantt.getTask(draft.pred).end_date); draft.end = addDays(draft.start, len); }
        }
        paint();
      });
    });
    predBtn.addEventListener('click', function () {
      var opts = [{ v: '', l: 'Ни после чего — по дате' }];
      stages.forEach(function (st) {
        worksOf(st.v).forEach(function (w) { opts.push({ v: w.id, l: st.l + ' → ' + w.text }); });
      });
      openList(predBtn, opts, draft.pred, function (v) {
        draft.pred = v;
        if (v) { var len = diffDays(draft.end, draft.start); draft.start = new Date(gantt.getTask(v).end_date); draft.end = addDays(draft.start, len); }
        paint();
      });
    });
    datesBtn.addEventListener('click', function () {
      openRange(datesBtn, draft.start, draft.end, function (s2, e2) { draft.start = s2; draft.end = e2; paint(); });
    });
    crewBtn.addEventListener('click', function () { openList(crewBtn, crewOptions(true), draft.crew, function (v) { draft.crew = v; paint(); }); });

    var cancel = el('button', 'btn ghost', 'Отмена'); cancel.type = 'button'; cancel.addEventListener('click', closeModal);
    var save = el('button', 'btn', 'Добавить работу'); save.type = 'button';
    save.addEventListener('click', function () {
      var title = name.value.trim();
      if (!title) { name.focus(); toast('Напишите, какая работа'); return; }
      pushUndo();
      var index = gantt.getChildren(draft.stage).length;
      if (draft.pred && String(gantt.getTask(draft.pred).parent) === String(draft.stage)) {
        var sib = gantt.getChildren(draft.stage);
        index = sib.indexOf(draft.pred) + 1;
        while (index < sib.length && gantt.getTask(sib[index]).kind === 'material' && String(gantt.getTask(sib[index]).work) === String(draft.pred)) index++;
      }
      var id = gantt.addTask({ id: uid('t'), text: title, start_date: draft.start, duration: diffDays(draft.end, draft.start) + 1,
        progress: 0, kind: 'work', crew: draft.crew }, draft.stage, index);
      if (draft.pred) {
        silentLink = true;
        gantt.addLink({ id: uid('l'), source: draft.pred, target: id, type: '0' });
        silentLink = false;
        cascade(draft.pred);
      }
      closeModal(); syncStore();
      gantt.selectTask(id); gantt.showTask(id);
      toast('Работа «' + title + '» добавлена', 'Отменить', undo);
    });
    openModal('Новая работа', body, [cancel, save]);
    setTimeout(function () { name.focus(); }, 30);
  }
  var silentLink = false;

  // новый этап: где стоит и первая работа в нём
  function openNewStage() {
    var stages = stageList();
    var draft = { after: stages.length ? stages[stages.length - 1].v : '', crew: '' };
    draft.start = draft.after ? new Date(gantt.getTask(draft.after).end_date) : today();
    draft.end = addDays(draft.start, 2);
    var body = el('div'); body.style.display = 'contents';
    var f1 = field('Название этапа'); var name = el('input', 'inp'); name.placeholder = 'Например: Благоустройство'; name.maxLength = 80;
    f1.appendChild(name); body.appendChild(f1);
    var f2 = field('Поставить после этапа'); var afterBtn = pickBtn('', chevron()); f2.appendChild(afterBtn); body.appendChild(f2);
    var f3 = field('Первая работа этапа'); var work = el('input', 'inp'); work.placeholder = 'Например: Монтаж забора'; work.maxLength = 120;
    f3.appendChild(work); body.appendChild(f3);
    var r = el('div', 'two');
    var f4 = field('Сроки первой работы'); var datesBtn = pickBtn('', calIcon()); f4.appendChild(datesBtn); r.appendChild(f4);
    var f5 = field('Бригада'); var crewBtn = pickBtn('', chevron()); f5.appendChild(crewBtn); r.appendChild(f5);
    body.appendChild(r);
    function paint() {
      afterBtn.querySelector('.v').textContent = draft.after ? gantt.getTask(draft.after).text : 'В самое начало';
      datesBtn.querySelector('.v').textContent = dmy(draft.start) + ' – ' + dmy(draft.end) + ' · ' + days(diffDays(draft.end, draft.start) + 1);
      var c = crewById(draft.crew);
      crewBtn.querySelector('.v').innerHTML = c ? '<span class="dot" style="background:' + c.color + '"></span> ' + esc(c.name) : '<span class="muted">Без бригады</span>';
    }
    paint();
    afterBtn.addEventListener('click', function () {
      openList(afterBtn, [{ v: '', l: 'В самое начало' }].concat(stageList()), draft.after, function (v) {
        draft.after = v;
        var len = diffDays(draft.end, draft.start);
        draft.start = v ? new Date(gantt.getTask(v).end_date) : today(); draft.end = addDays(draft.start, len);
        paint();
      });
    });
    datesBtn.addEventListener('click', function () { openRange(datesBtn, draft.start, draft.end, function (s2, e2) { draft.start = s2; draft.end = e2; paint(); }); });
    crewBtn.addEventListener('click', function () { openList(crewBtn, crewOptions(true), draft.crew, function (v) { draft.crew = v; paint(); }); });
    var cancel = el('button', 'btn ghost', 'Отмена'); cancel.type = 'button'; cancel.addEventListener('click', closeModal);
    var save = el('button', 'btn', 'Добавить этап'); save.type = 'button';
    save.addEventListener('click', function () {
      var title = name.value.trim(), first = work.value.trim();
      if (!title) { name.focus(); toast('Напишите название этапа'); return; }
      if (!first) { work.focus(); toast('Напишите первую работу этапа'); return; }
      pushUndo();
      var roots = gantt.getChildren(0);
      var index = draft.after ? roots.indexOf(draft.after) + 1 : 0;
      var gid = gantt.addTask({ id: uid('g'), text: title, type: 'project', kind: 'group', start_date: draft.start, duration: 1, progress: 0 }, 0, index);
      var tid = gantt.addTask({ id: uid('t'), text: first, start_date: draft.start, duration: diffDays(draft.end, draft.start) + 1,
        progress: 0, kind: 'work', crew: draft.crew }, gid);
      closeModal(); syncStore();
      gantt.selectTask(tid); gantt.showTask(tid);
      toast('Этап «' + title + '» добавлен', 'Отменить', undo);
    });
    openModal('Новый этап', body, [cancel, save]);
    setTimeout(function () { name.focus(); }, 30);
  }

  // ── объект: создать, изменить, удалить ─────────────────────────────
  function openObjectEditor(obj) {
    var isNew = !obj;
    var draft = { title: obj ? obj.title : '', address: obj ? obj.address : '', status: obj ? obj.status : 'plan',
      start: addDays(today(), 7), template: 'full' };
    var body = el('div'); body.style.display = 'contents';
    var f1 = field('Объект'); var title = el('input', 'inp'); title.value = draft.title; title.placeholder = 'Например: Дом 110 м²';
    f1.appendChild(title); body.appendChild(f1);
    var f2 = field('Адрес'); var addr = el('input', 'inp'); addr.value = draft.address; addr.placeholder = 'Населённый пункт, улица, дом';
    f2.appendChild(addr); body.appendChild(f2);
    if (isNew) {
      var r = el('div', 'two');
      var f3 = field('Начало работ'); var sb = pickBtn(dmy(draft.start), calIcon());
      sb.addEventListener('click', function () { openRange(sb, draft.start, draft.start, function (s) { draft.start = s; sb.querySelector('.v').textContent = dmy(s); }, true); });
      f3.appendChild(sb); r.appendChild(f3);
      var TPL = [{ v: 'full', l: 'Дом под ключ — все этапы' }, { v: 'box', l: 'Коробка — до кровли и окон' }, { v: 'empty', l: 'Пустой график' }];
      var f4 = field('Заполнить работами'); var tb = pickBtn(TPL[0].l, chevron());
      tb.addEventListener('click', function () { openList(tb, TPL, draft.template, function (v) { draft.template = v; tb.querySelector('.v').textContent = TPL.filter(function (x) { return x.v === v; })[0].l; }); });
      f4.appendChild(tb); r.appendChild(f4); body.appendChild(r);
      body.appendChild(el('p', 'muted', 'Работы из шаблона потом можно переименовать, удалить, добавить свои и подвинуть.'));
    } else {
      var f5 = field('Статус'); var seg = el('div', 'quick');
      var btns = Object.keys(STATUS).map(function (k) {
        var b = el('button', '', STATUS[k][1]); b.type = 'button';
        b.addEventListener('click', function () { draft.status = k; paint(); });
        seg.appendChild(b); return [k, b];
      });
      function paint() { btns.forEach(function (x) { x[1].setAttribute('aria-pressed', x[0] === draft.status ? 'true' : 'false'); }); }
      paint(); f5.appendChild(seg); body.appendChild(f5);
    }
    var foot = [];
    if (!isNew) {
      var del = el('button', 'btn danger left', 'Удалить объект'); del.type = 'button';
      del.addEventListener('click', function () {
        confirmBox('Удалить объект «' + obj.title + '» со всем графиком?', 'Удалить').then(function (ok) {
          if (!ok) return;
          store.objects = store.objects.filter(function (o) { return o.id !== obj.id; });
          saveStore(); currentObj = null; go('objects'); toast('Объект удалён');
        });
      });
      foot.push(del);
    }
    var cancel = el('button', 'btn ghost', 'Отмена'); cancel.type = 'button'; cancel.addEventListener('click', closeModal);
    var save = el('button', 'btn', isNew ? 'Создать график' : 'Сохранить'); save.type = 'button';
    save.addEventListener('click', function () {
      var t = title.value.trim();
      if (!t) { title.focus(); toast('Напишите название объекта'); return; }
      if (isNew) {
        var id = uid('o');
        var o;
        if (draft.template === 'empty') {
          o = { id: id, title: t, address: addr.value.trim(), status: 'plan', baselineAt: null, links: [],
            tasks: [{ id: id + '-g1', parent: 0, text: 'Работы', type: 'project', kind: 'group', start: iso(draft.start), duration: 1, progress: 0 },
                    { id: id + '-1', parent: id + '-g1', text: 'Первая работа', type: 'task', kind: 'work', crew: '', start: iso(draft.start), duration: 3, progress: 0 }] };
        } else {
          o = window.GPR_DEMO.buildObject({ id: id, title: t, address: addr.value.trim(), status: 'plan',
            startOffset: diffDays(draft.start, today()), baseline: false,
            only: draft.template === 'box' ? window.GPR_DEMO.BOX_ONLY : null });
          o.tasks.forEach(function (x) { if (x.kind !== 'group') x.progress = 0; if (x.kind === 'material') x.status = 'planned'; });
        }
        if (draft.start <= today()) o.status = 'work';
        store.objects.unshift(o);
        saveStore(); closeModal(); openObject(id); toast('График создан — расставьте сроки');
      } else {
        obj.title = t; obj.address = addr.value.trim(); obj.status = draft.status;
        saveStore(); closeModal(); paintObjectHead();
      }
    });
    foot.push(cancel, save);
    openModal(isNew ? 'Новый объект' : 'Объект', body, foot);
    setTimeout(function () { title.focus(); }, 30);
  }

  function fixPlan() {
    confirmBox('Текущие сроки всех работ станут планом. Отклонения дальше будут считаться от них.', 'Зафиксировать', false).then(function (ok) {
      if (!ok) return;
      pushUndo();
      gantt.eachTask(function (t) {
        if (t.type === 'project' || t.kind === 'material') return;
        t.plan_start = iso(t.start_date); t.plan_end = iso(t.end_date);
      });
      currentObj.baselineAt = iso(today());
      syncStore(); gantt.render();
      toast('План зафиксирован на ' + dmy(today()), 'Отменить', undo);
    });
  }

  // ── бригады по всем объектам ───────────────────────────────────────
  var crewSel = null;
  function crewLoad() {
    var res = {};
    store.crews.forEach(function (c) { res[c.id] = { works: [], conflicts: [] }; });
    store.objects.forEach(function (o) {
      o.tasks.forEach(function (t) {
        if (t.kind !== 'work' || !t.crew || !res[t.crew]) return;
        res[t.crew].works.push({ obj: o, t: t, s: parse(t.start), e: endOf(t) });
      });
    });
    Object.keys(res).forEach(function (k) {
      var w = res[k].works.filter(function (x) { return (x.t.progress || 0) < 1; });
      for (var i = 0; i < w.length; i++) {
        for (var j = i + 1; j < w.length; j++) {
          if (w[i].obj.id === w[j].obj.id) continue;
          if (w[i].s < w[j].e && w[j].s < w[i].e) res[k].conflicts.push([w[i], w[j]]);
        }
      }
    });
    return res;
  }
  function openCrews(scrollToPlan) {
    if (currentObj && view === 'object') syncStore();
    var load = crewLoad();
    var now = today();
    if (!crewSel || !crewById(crewSel)) {
      crewSel = store.crews.filter(function (c) { return load[c.id].conflicts.length; })[0];
      crewSel = crewSel ? crewSel.id : (store.crews[0] && store.crews[0].id);
    }
    var grid = $('#crewGrid'); grid.innerHTML = '';
    store.crews.forEach(function (c) {
      var L = load[c.id] || { works: [], conflicts: [] };
      var open = L.works.filter(function (x) { return (x.t.progress || 0) < 1; }).sort(function (a, b) { return a.s - b.s; });
      var cur = open.filter(function (x) { return x.s <= now && x.e > now; })[0];
      var next = open.filter(function (x) { return x.s > now; })[0];
      var card = el('div', 'ccard');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-pressed', c.id === crewSel ? 'true' : 'false');
      card.innerHTML =
        '<div class="name"><span class="dot" style="background:' + c.color + '"></span>' + esc(c.name) + '</div>' +
        '<div class="who">' + (c.lead ? 'Бригадир: ' + esc(c.lead) : 'Бригадир не указан') + (c.phone ? ' · <span class="nw">' + esc(c.phone) + '</span>' : '') + '</div>' +
        '<div class="now">' + (cur ? '<span>Сейчас:</span> ' + esc(cur.t.text) + ' · ' + esc(cur.obj.address) : '<span>Сейчас свободна</span>') +
        (next ? '<br><span>Дальше:</span> ' + esc(next.t.text) + ' с ' + dm(next.s) : '') + '</div>' +
        '<div class="chips"><span class="chip plan">работ впереди: ' + open.length + '</span>' +
        (L.conflicts.length ? '<span class="chip bad">⚠ нужна в двух местах: ' + L.conflicts.length + '</span>' : '') + '</div>';
      var edit = el('button', 'icon-btn sm edit'); edit.type = 'button'; edit.setAttribute('aria-label', 'Изменить бригаду ' + c.name);
      edit.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>';
      edit.addEventListener('click', function (e) { e.stopPropagation(); openCrewEditor(c); });
      card.appendChild(edit);
      function pick() { crewSel = c.id; openCrews(true); }
      card.addEventListener('click', pick);
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      grid.appendChild(card);
    });
    var crew = crewById(crewSel);
    $('#crewPlanTitle').textContent = crew ? 'Работы: ' + crew.name : 'Бригад пока нет';
    var cf = $('#conflicts'); cf.innerHTML = '';
    var mine = crew ? load[crewSel].conflicts : [];
    if (crew && !mine.length) cf.innerHTML = '<div class="ok-line">Пересечений нет: бригада не нужна в двух местах одновременно.</div>';
    mine.forEach(function (p) {
      var a = p[0], b = p[1];
      var s0 = new Date(Math.max(a.s, b.s)), e0 = addDays(new Date(Math.min(a.e, b.e)), -1);
      var d = el('div', 'conflict');
      d.innerHTML = '<span>⚠ ' + dm(s0) + '–' + dm(e0) + ' нужна в двух местах:</span><span><b>' + esc(a.t.text) + '</b> · ' + esc(a.obj.address) +
        '</span><span>и</span><span><b>' + esc(b.t.text) + '</b> · ' + esc(b.obj.address) + '</span>';
      cf.appendChild(d);
    });

    var conflictIds = {};
    mine.forEach(function (p) { conflictIds[p[0].obj.id + '|' + p[0].t.id] = 1; conflictIds[p[1].obj.id + '|' + p[1].t.id] = 1; });
    var data = [];
    store.objects.forEach(function (o) {
      var ws = crew ? load[crewSel].works.filter(function (x) { return x.obj.id === o.id; }) : [];
      if (!ws.length) return;
      data.push({ id: 'X' + o.id, text: MOBILE.matches ? o.address : o.title + ' · ' + o.address, type: 'project', kind: 'group', open: true, start_date: iso(ws[0].s), duration: 1, progress: 0 });
      ws.forEach(function (x) {
        data.push({ id: 'X' + o.id + '|' + x.t.id, parent: 'X' + o.id, text: x.t.text, start_date: x.t.start, duration: x.t.duration,
          progress: x.t.progress || 0, kind: 'work', crew: crewSel, objTitle: o.title, objId: o.id, taskId: x.t.id,
          conflict: !!conflictIds[o.id + '|' + x.t.id] });
      });
    });
    var host = $('#crewWrap');
    var empty = $('#crewEmpty');
    if (!empty) { empty = el('p', 'muted'); empty.id = 'crewEmpty'; host.parentNode.insertBefore(empty, host); }
    empty.textContent = 'У бригады пока нет работ. Назначить её можно в окне работы на графике объекта.';
    empty.hidden = !!data.length;
    host.hidden = !data.length;
    if (!ganttReady) setupGantt();
    if ($('#gantt').parentNode !== host) host.appendChild($('#gantt'));
    mode = 'crew';
    gantt.config.readonly = true;
    gantt.config.columns = crewColumns();
    applyLayout('crew');
    gantt.clearAll();
    gantt.parse({ data: data, links: [] });
    gantt.render();
    gantt.setSizes();
    gantt.showDate(today());
    if (scrollToPlan) $('.crew-plan').scrollIntoView({ behavior: 'smooth', block: 'start' });
    var sel = $('.ccard[aria-pressed="true"]');
    if (sel && MOBILE.matches) $('#crewGrid').scrollLeft = sel.offsetLeft - 12;
  }

  // окно работы бригады — правим прямо здесь, без перехода в объект
  function openCrewWork(id) {
    if (!gantt.isTaskExists(id)) return;
    var g = gantt.getTask(id);
    if (!g.objId) return;
    var obj = objById(g.objId);
    var t = obj && obj.tasks.filter(function (x) { return x.id === g.taskId; })[0];
    if (!t) return;
    var draft = { text: t.text, start: parse(t.start), end: addDays(parse(t.start), Math.max(1, t.duration) - 1),
      crew: t.crew || '', progress: t.progress || 0, note: t.note || '' };
    var body = el('div'); body.style.display = 'contents';
    var info = el('div', 'plan-note');
    info.innerHTML = 'Объект: <b style="font-family:var(--body)">' + esc(obj.title) + '</b> · ' + esc(obj.address);
    body.appendChild(info);
    var f1 = field('Название работы'); var name = el('input', 'inp'); name.value = draft.text; f1.appendChild(name); body.appendChild(f1);
    var r = el('div', 'two');
    var f2 = field('Сроки'); var datesBtn = pickBtn('', calIcon()); f2.appendChild(datesBtn); r.appendChild(f2);
    var f3 = field('Бригада'); var crewBtn = pickBtn('', chevron()); f3.appendChild(crewBtn); r.appendChild(f3);
    body.appendChild(r);
    function paint() {
      datesBtn.querySelector('.v').textContent = dmy(draft.start) + ' – ' + dmy(draft.end) + ' · ' + days(diffDays(draft.end, draft.start) + 1);
      var c = crewById(draft.crew);
      crewBtn.querySelector('.v').innerHTML = c ? '<span class="dot" style="background:' + c.color + '"></span> ' + esc(c.name) : '<span class="muted">Без бригады</span>';
    }
    paint();
    datesBtn.addEventListener('click', function () { openRange(datesBtn, draft.start, draft.end, function (s2, e2) { draft.start = s2; draft.end = e2; paint(); }); });
    crewBtn.addEventListener('click', function () { openList(crewBtn, crewOptions(true), draft.crew, function (v) { draft.crew = v; paint(); }); });
    var f4 = field('Готовность');
    var pr = el('div', 'pct-row');
    var range = el('input', 'range'); range.type = 'range'; range.min = 0; range.max = 100; range.step = 5; range.value = Math.round(draft.progress * 100);
    var pv = el('b', '', pct(draft.progress));
    range.addEventListener('input', function () { draft.progress = range.value / 100; pv.textContent = range.value + '%'; });
    pr.appendChild(range); pr.appendChild(pv); f4.appendChild(pr); body.appendChild(f4);
    var f5 = field('Комментарий'); var note = el('textarea', 'inp'); note.value = draft.note; f5.appendChild(note); body.appendChild(f5);
    body.appendChild(el('p', 'muted', 'Если работа сдвинется, следующие за ней работы на этом объекте сдвинутся сами.'));

    var toObj = el('button', 'btn ghost left', 'График объекта →'); toObj.type = 'button';
    toObj.addEventListener('click', function () { closeModal(); openObject(obj.id, t.id); });
    var cancel = el('button', 'btn ghost', 'Отмена'); cancel.type = 'button'; cancel.addEventListener('click', closeModal);
    var save = el('button', 'btn', 'Сохранить'); save.type = 'button';
    save.addEventListener('click', function () {
      var shift = diffDays(draft.start, parse(t.start));
      var moved = draft.crew !== (t.crew || '');
      t.text = name.value.trim() || t.text;
      t.start = iso(draft.start);
      t.duration = diffDays(draft.end, draft.start) + 1;
      t.progress = draft.progress;
      t.crew = draft.crew;
      t.note = note.value.trim();
      storeShiftMaterials(obj, t.id, shift);
      var n = storeCascade(obj, t.id);
      saveStore(); closeModal(); openCrews();
      toast(moved ? 'Работа передана: ' + (crewById(draft.crew) ? crewById(draft.crew).name : 'без бригады')
        : 'Сохранено' + (n ? ' · на объекте сдвинуто работ: ' + n : ''));
    });
    openModal('Работа бригады', body, [toObj, cancel, save]);
  }
  // то же правило «следующая — не раньше конца предыдущей», но прямо в данных объекта
  function storeCascade(obj, id) {
    var byId = {}; obj.tasks.forEach(function (x) { byId[x.id] = x; });
    var moved = {};
    (function walk(src) {
      var a = byId[src]; if (!a) return;
      var aEnd = endOf(a);
      obj.links.forEach(function (l) {
        if (l.source !== src || !byId[l.target]) return;
        var b = byId[l.target];
        if (parse(b.start) < aEnd) {
          var delta = diffDays(aEnd, parse(b.start));
          b.start = iso(aEnd);
          storeShiftMaterials(obj, b.id, delta);
          moved[b.id] = 1;
          walk(b.id);
        }
      });
    })(id);
    return Object.keys(moved).length;
  }
  function storeShiftMaterials(obj, workId, delta) {
    if (!delta) return;
    obj.tasks.forEach(function (m) { if (m.kind === 'material' && m.work === workId) m.start = iso(addDays(parse(m.start), delta)); });
  }

  // справочник бригад: название, бригадир, телефон, цвет
  var PALETTE = ['#C8891A', '#B86B2E', '#9C4F43', '#8C6E54', '#6E7F3E', '#4E8A5E', '#2F8F8A', '#3A7CA5', '#4F7D99', '#6A5FA8', '#A0527A', '#7C8A96'];
  function openCrewEditor(crew) {
    var isNew = !crew;
    var draft = { name: crew ? crew.name : '', lead: crew ? crew.lead || '' : '', phone: crew ? crew.phone || '' : '',
      color: crew ? crew.color : PALETTE[store.crews.length % PALETTE.length] };
    var body = el('div'); body.style.display = 'contents';
    var f1 = field('Название'); var name = el('input', 'inp'); name.value = draft.name; name.placeholder = 'Например: Бригада №3 · фасад';
    f1.appendChild(name); body.appendChild(f1);
    var r = el('div', 'two');
    var f2 = field('Бригадир'); var lead = el('input', 'inp'); lead.value = draft.lead; lead.placeholder = 'Имя и фамилия'; f2.appendChild(lead); r.appendChild(f2);
    var f3 = field('Телефон'); var phone = el('input', 'inp'); phone.value = draft.phone; phone.inputMode = 'tel'; phone.placeholder = '+7 ...'; f3.appendChild(phone); r.appendChild(f3);
    body.appendChild(r);
    var f4 = field('Цвет на графике'); var pal = el('div', 'palette');
    var sw = PALETTE.map(function (c) {
      var b = el('button'); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', 'Цвет ' + c);
      b.addEventListener('click', function () { draft.color = c; paintPal(); });
      pal.appendChild(b); return [c, b];
    });
    function paintPal() { sw.forEach(function (x) { x[1].setAttribute('aria-pressed', x[0] === draft.color ? 'true' : 'false'); }); }
    paintPal(); f4.appendChild(pal); body.appendChild(f4);
    var foot = [];
    if (!isNew) {
      var del = el('button', 'btn danger left', 'Удалить'); del.type = 'button';
      del.addEventListener('click', function () {
        confirmBox('Удалить бригаду «' + crew.name + '»? Её работы останутся на графиках, но без бригады.', 'Удалить').then(function (ok) {
          if (!ok) return;
          store.crews = store.crews.filter(function (c) { return c.id !== crew.id; });
          store.objects.forEach(function (o) { o.tasks.forEach(function (t) { if (t.crew === crew.id) t.crew = ''; }); });
          if (crewSel === crew.id) crewSel = null;
          saveStore(); paintCrewColors(); openCrews(); toast('Бригада удалена');
        });
      });
      foot.push(del);
    }
    var cancel = el('button', 'btn ghost', 'Отмена'); cancel.type = 'button'; cancel.addEventListener('click', closeModal);
    var save = el('button', 'btn', isNew ? 'Добавить бригаду' : 'Сохранить'); save.type = 'button';
    save.addEventListener('click', function () {
      var n = name.value.trim();
      if (!n) { name.focus(); toast('Напишите название бригады'); return; }
      if (isNew) {
        crew = { id: uid('c'), name: n, lead: lead.value.trim(), phone: phone.value.trim(), color: draft.color };
        store.crews.push(crew); crewSel = crew.id;
      } else {
        crew.name = n; crew.lead = lead.value.trim(); crew.phone = phone.value.trim(); crew.color = draft.color;
      }
      saveStore(); paintCrewColors(); closeModal(); openCrews();
      toast(isNew ? 'Бригада добавлена — назначьте её работам на графике объекта' : 'Сохранено');
    });
    foot.push(cancel, save);
    openModal(isNew ? 'Новая бригада' : 'Бригада', body, foot);
    setTimeout(function () { name.focus(); }, 30);
  }

  // ── «Как пользоваться» ─────────────────────────────────────────────
  function openHelp() {
    var body = el('div', 'help');
    body.innerHTML = [
      ['Объекты', ['Это список домов. <b>Нажмите на карточку</b> — откроется график работ этого дома.',
        '<b>«+ Новый объект»</b> — создать график: выберите шаблон «Дом под ключ», «Коробка» или пустой. Работы из шаблона появятся сами, дальше их можно менять.',
        'Значок карандаша рядом с названием объекта — изменить название, адрес, статус или удалить объект.']],
      ['График объекта', ['Слева — работы по этапам, справа — те же работы полосками по дням. Красная линия — сегодня.',
        '<b>Сдвинуть работу</b> — потяните полоску мышью. <b>Изменить срок</b> — потяните за левый или правый край. Работы, которые идут после неё, сдвинутся сами.',
        '<b>Связать работы</b> — наведите на полоску и потяните кружок с её конца на начало другой работы. Или откройте работу → «Начинается после» → «+ добавить».',
        '<b>Подробности</b> — нажмите на полоску: сроки через календарь, бригада, готовность, комментарий, поставки, удаление.',
        '<b>Переименовать</b> — нажмите на название в таблице и напишите новое.',
        '<b>Добавить</b> — «+ Работа» и «+ Этап» на панели или «+» в конце строки (новая работа встанет сразу после этой).',
        '<b>Отменить</b> последнее действие — кнопка «↶ Отменить» или <span class="kbd">Ctrl+Z</span>.',
        'Масштаб — «День», «Неделя», «Месяц». «Сегодня» — вернуться к текущей дате.']],
      ['План и факт', ['Когда график согласован, нажмите <b>«Зафиксировать план»</b>.',
        'Дальше под каждой полоской серая линия — как было по плану, красная над полоской — насколько работа опаздывает. В колонке «Откл.» и в шапке объекта — отставание в днях.']],
      ['Бригады', ['Справочник бригад: бригадир, телефон, чем занята сейчас и что дальше. «+ Бригада» — добавить, карандаш — изменить.',
        '<b>Нажмите на бригаду</b> — внизу появятся все её работы на всех объектах. Красным — если в одни дни она нужна в двух местах.',
        '<b>Нажмите на работу</b> — можно поменять сроки, готовность или передать другой бригаде прямо там.']],
      ['Поставки материалов', ['Ромбики на графике: <span class="swatch" style="background:var(--plan)"></span> не заказано, <span class="swatch" style="background:var(--accent)"></span> заказано, <span class="swatch" style="background:var(--ok)"></span> доставлено.',
        '«+ Поставка» — добавить. Поставка привязана к работе и сдвигается вместе с ней. Переключатель «Материалы» прячет поставки.']],
      ['Excel и печать', ['«Excel» — скачать график таблицей по неделям и список поставок. «Печать» — график на листе А4 для планёрки.']],
      ['На телефоне', ['Нажмите на работу — снизу откроется панель со сроками, бригадой и готовностью. Чтобы перетащить полоску, задержите на ней палец.']]
    ].map(function (s, i) {
      return '<section><h3><span class="n">' + (i + 1) + '</span>' + s[0] + '</h3><ul>' + s[1].map(function (li) { return '<li>' + li + '</li>'; }).join('') + '</ul></section>';
    }).join('');
    var reset = el('button', 'btn ghost left', 'Сбросить демо-данные'); reset.type = 'button';
    reset.addEventListener('click', function () {
      confirmBox('Вернуть исходные демо-данные? Все изменения пропадут.', 'Вернуть').then(function (ok) {
        if (!ok) return;
        store = window.GPR_DEMO.demo(); saveStore(); crewSel = null; paintCrewColors();
        go(view === 'crews' ? 'crews' : 'objects'); toast('Демо-данные восстановлены');
      });
    });
    var ok = el('button', 'btn', 'Понятно'); ok.type = 'button'; ok.addEventListener('click', closeModal);
    openModal('Как пользоваться', body, [reset, ok], true);
    try { localStorage.setItem('ds-gpr-help-seen', '1'); } catch (e) { /* ignore */ }
  }

  // ── Excel ──────────────────────────────────────────────────────────
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  function exportExcel() {
    syncStore();
    var obj = currentObj;
    toast('Готовлю Excel…');
    (window.ExcelJS ? Promise.resolve() : loadScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js')).then(function () {
      var wb = new window.ExcelJS.Workbook();
      wb.creator = 'ДомСтрой';
      var ws = wb.addWorksheet('ГПР', { views: [{ state: 'frozen', xSplit: 3, ySplit: 5 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });
      var works = obj.tasks.filter(function (t) { return t.kind !== 'material'; });
      var dated = obj.tasks.filter(isWork);
      var s0 = new Date(Math.min.apply(null, dated.map(function (t) { return parse(t.start); })));
      var e0 = new Date(Math.max.apply(null, dated.map(endOf)));
      var w0 = addDays(s0, -((s0.getDay() + 6) % 7));            // понедельник
      var weeks = [];
      for (var d = w0; d < e0; d = addDays(d, 7)) weeks.push(d);
      ws.addRow(['ГРАФИК ПРОИЗВОДСТВА РАБОТ']).font = { bold: true, size: 14 };
      ws.addRow(['Объект: ' + obj.title + ', ' + obj.address]);
      ws.addRow(['Сформирован ' + dmy(today()) + (obj.baselineAt ? ' · план зафиксирован ' + dmy(parse(obj.baselineAt)) : '') + ' · ДомСтрой']);
      ws.addRow([]);
      var head = ['№', 'Наименование работ', 'Бригада', 'Начало', 'Окончание', 'Дней', 'Готово', 'План: начало', 'План: окончание', 'Откл., дн.']
        .concat(weeks.map(function (w) { return dm(w); }));
      var hr = ws.addRow(head);
      hr.font = { bold: true }; hr.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; hr.height = 30;
      hr.eachCell(function (c) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEEE9' } }; });
      var num = 0, sub = 0;
      works.forEach(function (t) {
        var isG = t.kind === 'group';
        var kids = isG ? obj.tasks.filter(function (x) { return x.parent === t.id && isWork(x); }) : [];
        var s = isG ? (kids.length ? new Date(Math.min.apply(null, kids.map(function (k) { return parse(k.start); }))) : parse(t.start)) : parse(t.start);
        var e = isG ? (kids.length ? new Date(Math.max.apply(null, kids.map(endOf))) : endOf(t)) : endOf(t);
        if (isG) { num++; sub = 0; } else sub++;
        var c = crewById(t.crew);
        var dev = t.plan_end ? diffDays(e, parse(t.plan_end)) : '';
        var row = ws.addRow([isG ? String(num) : num + '.' + sub, t.text, c ? c.name : '', dmy(s),
          dmy(t.kind === 'milestone' ? s : addDays(e, -1)), isG ? diffDays(e, s) : t.duration, isG ? '' : Math.round((t.progress || 0) * 100) + '%',
          t.plan_start ? dmy(parse(t.plan_start)) : '', t.plan_end ? dmy(addDays(parse(t.plan_end), -1)) : '', dev === '' ? '' : dev]);
        if (isG) row.font = { bold: true };
        var color = t.kind === 'pause' ? 'FFC8C5BC' : isG ? 'FF15181A' : (c ? 'FF' + c.color.slice(1).toUpperCase() : 'FFC8891A');
        weeks.forEach(function (w, i) {
          var we = addDays(w, 7);
          var hit = t.kind === 'milestone' ? (s >= w && s < we) : (s < we && e > w);
          var cell = row.getCell(11 + i);
          if (hit) cell.fill = { type: 'pattern', pattern: t.kind === 'pause' ? 'lightUp' : 'solid', fgColor: { argb: color }, bgColor: { argb: 'FFFFFFFF' } };
          if (t.kind === 'milestone' && hit) cell.value = '★';
        });
        if (typeof dev === 'number' && dev > 0) row.getCell(10).font = { color: { argb: 'FFB8432A' }, bold: true };
        if (isG) row.eachCell(function (cl, n) { if (n <= 10) cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F5F2' } }; });
      });
      for (var ci = 1; ci <= 10 + weeks.length; ci++) ws.getColumn(ci).width = [6, 38, 22, 11, 11, 7, 8, 12, 12, 9][ci - 1] || 6.5;
      ws.eachRow(function (r, n) {
        if (n < 5) return;
        r.eachCell({ includeEmpty: true }, function (c) { c.border = { top: { style: 'thin', color: { argb: 'FFDDDDDD' } }, bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } }, left: { style: 'thin', color: { argb: 'FFDDDDDD' } }, right: { style: 'thin', color: { argb: 'FFDDDDDD' } } }; });
      });

      var ms = wb.addWorksheet('Поставки');
      var mh = ms.addRow(['Дата', 'Материал', 'Кол-во', 'Ед.', 'Поставщик', 'Статус', 'Для работы']);
      mh.font = { bold: true };
      obj.tasks.filter(function (t) { return t.kind === 'material'; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; }).forEach(function (m) {
        var w = obj.tasks.filter(function (x) { return x.id === m.work; })[0];
        ms.addRow([dmy(parse(m.start)), m.text, m.qty || '', m.unit || '', m.supplier || '', MAT_STATUS_TITLE[m.status || 'planned'], w ? w.text : '']);
      });
      [12, 32, 10, 8, 24, 14, 34].forEach(function (w, i) { ms.getColumn(i + 1).width = w; });

      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ГПР — ' + obj.title.replace(/[\\/:*?"<>|]/g, '') + '.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('Excel скачан');
    }).catch(function () { toast('Не получилось подготовить Excel — проверьте интернет'); });
  }

  // ── печать ─────────────────────────────────────────────────────────
  function printPlan() {
    syncStore();
    var obj = currentObj;
    var dated = obj.tasks.filter(isWork);
    if (!dated.length) { toast('Нет работ для печати'); return; }
    var s0 = new Date(Math.min.apply(null, dated.map(function (t) { return parse(t.start); })));
    var e0 = new Date(Math.max.apply(null, dated.map(endOf)));
    var w0 = addDays(s0, -((s0.getDay() + 6) % 7));
    var weeks = [];
    for (var d = w0; d < e0; d = addDays(d, 7)) weeks.push(d);
    var st = objStats(obj);
    var h = ['<h1>График производства работ</h1><div class="meta">' + esc(obj.title) + ', ' + esc(obj.address) +
      ' · начало ' + dmy(st.start) + ' · сдача по графику ' + dmy(addDays(st.end, -1)) +
      (st.planEnd ? ' · по плану ' + dmy(addDays(st.planEnd, -1)) : '') + ' · сформирован ' + dmy(today()) + '</div>'];
    h.push('<table><colgroup><col style="width:9mm"><col style="width:58mm"><col style="width:30mm"><col style="width:24mm"><col style="width:9mm"><col style="width:10mm">' +
      weeks.map(function () { return '<col>'; }).join('') + '</colgroup>');
    h.push('<tr><th>№</th><th>Работа</th><th>Бригада</th><th>Сроки</th><th>Дн.</th><th>%</th>' +
      weeks.map(function (w) { return '<th class="wk">' + dm(w) + '</th>'; }).join('') + '</tr>');
    var num = 0, sub = 0;
    obj.tasks.filter(function (t) { return t.kind !== 'material'; }).forEach(function (t) {
      var isG = t.kind === 'group';
      var kids = isG ? obj.tasks.filter(function (x) { return x.parent === t.id && isWork(x); }) : [];
      if (isG && !kids.length) return;
      var s = isG ? new Date(Math.min.apply(null, kids.map(function (k) { return parse(k.start); }))) : parse(t.start);
      var e = isG ? new Date(Math.max.apply(null, kids.map(endOf))) : endOf(t);
      if (isG) { num++; sub = 0; } else sub++;
      var c = crewById(t.crew);
      var color = t.kind === 'pause' ? '#c8c5bc' : isG ? '#15181a' : (c ? c.color : '#c8891a');
      h.push('<tr class="' + (isG ? 'g' : '') + '"><td>' + (isG ? num : num + '.' + sub) + '</td><td>' + esc(t.text) + '</td><td>' +
        (c ? esc(c.name) : '') + '</td><td>' + dm(s) + (t.kind === 'milestone' ? '' : '–' + dm(addDays(e, -1))) + '</td><td>' +
        (t.kind === 'milestone' ? '' : diffDays(e, s)) + '</td><td>' + (isG ? '' : pct(t.progress)) + '</td>' +
        weeks.map(function (w) {
          var we = addDays(w, 7);
          var hit = t.kind === 'milestone' ? (s >= w && s < we) : (s < we && e > w);
          return '<td class="w">' + (hit ? '<i style="background:' + color + '"></i>' : '') + '</td>';
        }).join('') + '</tr>');
    });
    h.push('</table><div class="sign"><span>Составил: ____________________</span><span>Согласовано: ____________________</span></div>');
    $('#print').innerHTML = h.join('');
    window.print();
  }

  // ── свои всплывающие окна ──────────────────────────────────────────
  function field(label) { var f = el('div', 'f'); f.appendChild(el('span', '', label)); return f; }
  function chevron() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'; }
  function calIcon() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>'; }
  function pickBtn(text, icon) {
    var b = el('button', 'pick'); b.type = 'button';
    b.innerHTML = '<span class="v"></span>' + icon;
    b.querySelector('.v').textContent = text;
    b.setAttribute('aria-haspopup', 'dialog');
    return b;
  }

  var lastFocus = null;
  function openModal(title, body, foot, wide) {
    closePop();
    lastFocus = document.activeElement;
    $('#mTitle').textContent = title;
    var mb = $('#mBody'); mb.innerHTML = ''; mb.appendChild(body);
    var mf = $('#mFoot'); mf.innerHTML = ''; (foot || []).forEach(function (b) { mf.appendChild(b); });
    $('.modal-box').classList.toggle('wide', !!wide);
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    if ($('#modal').hidden) return;
    $('#modal').hidden = true;
    document.body.style.overflow = '';
    closePop();
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function confirmBox(text, okLabel, danger) {
    return new Promise(function (res) {
      var body = el('p', 'confirm-text', text);
      var no = el('button', 'btn ghost', 'Отмена'); no.type = 'button';
      var yes = el('button', danger === false ? 'btn' : 'btn danger', okLabel || 'Да'); yes.type = 'button';
      var prevBody = $('#modal').hidden ? null : { title: $('#mTitle').textContent, nodes: Array.prototype.slice.call($('#mBody').childNodes), foot: Array.prototype.slice.call($('#mFoot').childNodes) };
      no.addEventListener('click', function () { finish(false); });
      yes.addEventListener('click', function () { finish(true); });
      function finish(v) {
        closeModal();
        if (!v && prevBody) {           // отменили — возвращаем окно, из которого пришли
          var b = el('div'); b.style.display = 'contents'; prevBody.nodes.forEach(function (n) { b.appendChild(n); });
          openModal(prevBody.title, b, prevBody.foot);
        }
        res(v);
      }
      openModal('Подтвердите', body, [no, yes]);
      setTimeout(function () { yes.focus(); }, 30);
    });
  }

  var popOwner = null;
  function placePop(anchor) {
    var pop = $('#pop');
    var r = anchor.getBoundingClientRect();
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }
  function openPop(anchor, content) {
    var pop = $('#pop');
    pop.innerHTML = ''; pop.appendChild(content);
    pop.hidden = false;
    popOwner = anchor;
    if (anchor.setAttribute) anchor.setAttribute('aria-expanded', 'true');
    placePop(anchor);
  }
  function closePop() {
    var pop = $('#pop');
    if (pop.hidden) return;
    pop.hidden = true;
    if (popOwner && popOwner.setAttribute) popOwner.setAttribute('aria-expanded', 'false');
    popOwner = null;
  }
  function openList(anchor, options, value, onPick) {
    var box = el('div');
    box.setAttribute('role', 'listbox');
    box.style.minWidth = Math.max(220, anchor.getBoundingClientRect().width) + 'px';
    var items = options.map(function (o) {
      var b = el('button', 'opt'); b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(o.v) === String(value) ? 'true' : 'false');
      b.innerHTML = (o.color ? '<span class="dot" style="background:' + o.color + '"></span>' : '') + esc(o.l);
      b.addEventListener('click', function () { closePop(); onPick(o.v); });
      box.appendChild(b);
      return b;
    });
    box.addEventListener('keydown', function (e) {
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, i - 1)].focus(); }
    });
    openPop(anchor, box);
    var sel = items.filter(function (b) { return b.getAttribute('aria-selected') === 'true'; })[0] || items[0];
    if (sel) sel.focus({ preventScroll: true });
  }

  // календарь как в «Сметтере»: два месяца, выбираем начало и конец, «Отменить» / «Сохранить»
  function openRange(anchor, start, end, onSave, single) {
    var s = midnight(start), e = single ? null : midnight(end);
    var view = new Date(s.getFullYear(), s.getMonth(), 1);
    var months = single || MOBILE.matches ? 1 : 2;
    var box = el('div', 'cal');
    function paint() {
      box.innerHTML = '';
      box.appendChild(el('p', 'cal-tip', single ? 'Выберите дату' : (e ? 'Нажмите на день начала, затем на день окончания' : 'Теперь нажмите на день окончания')));
      var wrap = el('div', 'cal-months'); wrap.style.setProperty('--m', months);
      for (var m = 0; m < months; m++) {
        var first = new Date(view.getFullYear(), view.getMonth() + m, 1);
        var col = el('div');
        var head = el('div', 'cal-head');
        var prev = el('button', 'cal-nav' + (m === 0 ? '' : ' ghost'), '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Предыдущий месяц');
        var next = el('button', 'cal-nav' + (m === months - 1 ? '' : ' ghost'), '›'); next.type = 'button'; next.setAttribute('aria-label', 'Следующий месяц');
        prev.addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); paint(); });
        next.addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); paint(); });
        head.appendChild(prev); head.appendChild(el('b', '', fmtMonth.format(first).replace(/\s*г\.$/, ''))); head.appendChild(next);
        col.appendChild(head);
        var grid = el('div', 'cal-grid');
        ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(function (d, i) { grid.appendChild(el('span', 'cal-dow' + (i > 4 ? ' we' : ''), d)); });
        for (var k = 0; k < (first.getDay() + 6) % 7; k++) grid.appendChild(el('span'));
        var total = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        for (var dd = 1; dd <= total; dd++) {
          (function (day) {
            var b = el('button', 'cal-day', String(day.getDate())); b.type = 'button';
            if (isWeekend(day)) b.classList.add('we');
            if (!diffDays(day, today())) b.classList.add('today');
            var end2 = e || s;
            if (!diffDays(day, s)) b.classList.add('s');
            if (!diffDays(day, end2)) b.classList.add('e');
            if (day > s && day < end2) b.classList.add('in');
            b.addEventListener('click', function () {
              if (single) { closePop(); onSave(day, day); return; }
              if (!e) { if (day < s) { s = day; } else { e = day; } }
              else { s = day; e = null; }
              paint();
            });
            grid.appendChild(b);
          })(new Date(first.getFullYear(), first.getMonth(), dd));
        }
        col.appendChild(grid);
        wrap.appendChild(col);
      }
      box.appendChild(wrap);
      if (!single) {
        var foot = el('div', 'cal-foot');
        var sel = el('span', 'sel', dmy(s) + ' – ' + (e ? dmy(e) + ' · ' + days(diffDays(e, s) + 1) : 'выберите конец'));
        var acts = el('div', 'acts');
        var cancel = el('button', 'btn ghost', 'Отменить'); cancel.type = 'button'; cancel.addEventListener('click', closePop);
        var ok = el('button', 'btn', 'Сохранить'); ok.type = 'button';
        ok.addEventListener('click', function () { closePop(); onSave(s, e || s); });
        acts.appendChild(cancel); acts.appendChild(ok);
        foot.appendChild(sel); foot.appendChild(acts);
        box.appendChild(foot);
      }
      if (!$('#pop').hidden) placePop(anchor);
    }
    paint();
    openPop(anchor, box);
  }

  var toastTimer = null;
  function toast(text, actionLabel, action) {
    var t = $('#toast');
    t.innerHTML = '';
    t.appendChild(el('span', '', text));
    if (actionLabel && action) {
      var b = el('button', '', actionLabel); b.type = 'button';
      b.addEventListener('click', function () { hideToast(); action(); });
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 6000 : 3000);
  }
  function hideToast() { $('#toast').hidden = true; }

  // ── кнопки и обработчики ───────────────────────────────────────────
  function wire() {
    document.addEventListener('click', function (e) {
      var g = e.target.closest('[data-go]');
      if (g) { e.preventDefault(); go(g.dataset.go); return; }
      if (e.target.closest('[data-close]')) { closeModal(); return; }
      if (e.target.id === 'modal') closeModal();
    });
    document.addEventListener('pointerdown', function (e) {
      var pop = $('#pop');
      if (pop.hidden) return;
      if (pop.contains(e.target) || (popOwner && popOwner.contains && popOwner.contains(e.target))) return;
      closePop();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('#pop').hidden) { closePop(); return; }
        if (!$('#modal').hidden) { closeModal(); return; }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && view === 'object' && $('#modal').hidden &&
          !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
        e.preventDefault(); undo();
      }
    });
    window.addEventListener('scroll', function () { if (popOwner && !$('#pop').hidden) placePop(popOwner); }, { passive: true });
    $('#newObject').addEventListener('click', function () { openObjectEditor(null); });
    $('#editObject').addEventListener('click', function () { openObjectEditor(currentObj); });
    $('#helpBtn').addEventListener('click', openHelp);
    $('#newCrew').addEventListener('click', function () { openCrewEditor(null); });
    document.addEventListener('click', function (e) { if (e.target.closest('[data-help]')) openHelp(); });
    document.querySelectorAll('#zoomSeg button').forEach(function (b) {
      b.addEventListener('click', function () { applyZoom(b.dataset.zoom); });
    });
    $('#toToday').addEventListener('click', function () { gantt.showDate(today()); });
    $('#showMats').addEventListener('change', function (e) { prefs.mats = e.target.checked; savePrefs(); gantt.refreshData(); });
    $('#addTask').addEventListener('click', function () { openNewTask(gantt.getSelectedId()); });
    $('#addGroup').addEventListener('click', openNewStage);
    $('#addMat').addEventListener('click', function () { openMaterialEditor(null); });
    $('#fixPlan').addEventListener('click', fixPlan);
    $('#undoBtn').addEventListener('click', undo);
    $('#xlsBtn').addEventListener('click', exportExcel);
    $('#printBtn').addEventListener('click', printPlan);
    (function theme() {
      var btn = $('#themeBtn'), meta = document.querySelector('meta[name="theme-color"]');
      function paint() {
        var dark = document.documentElement.getAttribute('data-theme') === 'dark';
        btn.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
        if (meta) meta.setAttribute('content', dark ? '#0E1011' : '#F6F5F2');
      }
      btn.addEventListener('click', function () {
        var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        try { localStorage.setItem('ds-theme', dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
        paint();
        if (ganttReady) gantt.render();
      });
      paint();
    })();
  }

  loadStore();
  wire();
  paintObjects();
  try { if (!localStorage.getItem('ds-gpr-help-seen')) setTimeout(openHelp, 400); } catch (e) { /* ignore */ }
  if (window.gantt) { setupGantt(); paintCrewColors(); }
})();

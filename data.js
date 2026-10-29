/* Демо-данные прототипа графика производства работ. Всё выдуманное: объекты, адреса,
   бригады и поставщики. Даты считаются от сегодняшнего дня, чтобы прототип всегда выглядел «живым». */
(function () {
  'use strict';
  var DAY = 864e5;

  var CREWS = [
    { id: 'geo', name: 'Геодезист', color: '#7C8A96', lead: 'Олег Смирнов', phone: '+7 900 111-20-01' },
    { id: 'tech', name: 'Техника (экскаватор)', color: '#8C6E54', lead: 'Аренда, диспетчер Ирина', phone: '+7 900 111-20-02' },
    { id: 'b1', name: 'Бригада №1 · бетон', color: '#B86B2E', lead: 'Андрей Козлов', phone: '+7 900 111-20-03' },
    { id: 'b2', name: 'Бригада №2 · кладка', color: '#C8891A', lead: 'Сергей Волков', phone: '+7 900 111-20-04' },
    { id: 'roof', name: 'Кровельщики', color: '#9C4F43', lead: 'Дмитрий Орлов', phone: '+7 900 111-20-05' },
    { id: 'win', name: 'Монтажники окон', color: '#4F7D99', lead: 'Павел Егоров', phone: '+7 900 111-20-06' },
    { id: 'elec', name: 'Электрик', color: '#3A7CA5', lead: 'Игорь Белов', phone: '+7 900 111-20-07' },
    { id: 'plumb', name: 'Сантехники', color: '#2F8F8A', lead: 'Николай Фёдоров', phone: '+7 900 111-20-08' },
    { id: 'plast', name: 'Штукатуры', color: '#6E7F3E', lead: 'Руслан Ахметов', phone: '+7 900 111-20-09' },
    { id: 'fin', name: 'Отделочники', color: '#4E8A5E', lead: 'Елена Морозова', phone: '+7 900 111-20-10' }
  ];

  // этапы и работы типового дома: k — ключ, d — дней, after — после каких работ
  var TEMPLATE = [
    { k: 'g-prep', name: 'Подготовка', group: true },
    { k: 'axes', g: 'g-prep', name: 'Разбивка осей, вынос в натуру', d: 1, crew: 'geo', after: [] },
    { k: 'site', g: 'g-prep', name: 'Бытовка, временный свет и вода', d: 2, crew: 'b1', after: ['axes'] },
    { k: 'g-zero', name: 'Нулевой цикл', group: true },
    { k: 'dig', g: 'g-zero', name: 'Земляные работы под фундамент', d: 2, crew: 'tech', after: ['site'] },
    { k: 'sand', g: 'g-zero', name: 'Песчаная подушка, опалубка', d: 3, crew: 'b1', after: ['dig'] },
    { k: 'rebar', g: 'g-zero', name: 'Армирование ленты и плиты', d: 3, crew: 'b1', after: ['sand'] },
    { k: 'pour', g: 'g-zero', name: 'Бетонирование ленты и плиты', d: 1, crew: 'b1', after: ['rebar'] },
    { k: 'cure', g: 'g-zero', name: 'Набор прочности бетона', d: 14, kind: 'pause', after: ['pour'] },
    { k: 'water', g: 'g-zero', name: 'Гидроизоляция, обратная засыпка', d: 3, crew: 'b1', after: ['cure'] },
    { k: 'g-box', name: 'Коробка', group: true },
    { k: 'walls', g: 'g-box', name: 'Кладка стен из газоблока', d: 18, crew: 'b2', after: ['water'] },
    { k: 'belt', g: 'g-box', name: 'Перемычки и армопояс', d: 4, crew: 'b2', after: ['walls'] },
    { k: 'slab', g: 'g-box', name: 'Перекрытие, мауэрлат', d: 5, crew: 'b2', after: ['belt'] },
    { k: 'g-roof', name: 'Кровля', group: true },
    { k: 'rafters', g: 'g-roof', name: 'Стропильная система', d: 6, crew: 'roof', after: ['slab'] },
    { k: 'membrane', g: 'g-roof', name: 'Мембрана, утеплитель, обрешётка', d: 4, crew: 'roof', after: ['rafters'] },
    { k: 'tiles', g: 'g-roof', name: 'Металлочерепица', d: 5, crew: 'roof', after: ['membrane'] },
    { k: 'gutter', g: 'g-roof', name: 'Водосток', d: 2, crew: 'roof', after: ['tiles'] },
    { k: 'g-shell', name: 'Контур и фасад', group: true },
    { k: 'windows', g: 'g-shell', name: 'Окна и входная дверь', d: 3, crew: 'win', after: ['tiles'] },
    { k: 'brick', g: 'g-shell', name: 'Облицовка кирпичом', d: 20, crew: 'b2', after: ['slab'] },
    { k: 'g-eng', name: 'Инженерные сети', group: true },
    { k: 'elec', g: 'g-eng', name: 'Электрика черновая', d: 8, crew: 'elec', after: ['windows'] },
    { k: 'plumb', g: 'g-eng', name: 'Водопровод и канализация', d: 6, crew: 'plumb', after: ['windows'] },
    { k: 'heat', g: 'g-eng', name: 'Отопление, тёплый пол', d: 8, crew: 'plumb', after: ['plumb'] },
    { k: 'g-rough', name: 'Черновая отделка', group: true },
    { k: 'plaster', g: 'g-rough', name: 'Механизированная штукатурка', d: 10, crew: 'plast', after: ['elec', 'heat'] },
    { k: 'screed', g: 'g-rough', name: 'Стяжка пола', d: 4, crew: 'plast', after: ['plaster'] },
    { k: 'dry', g: 'g-rough', name: 'Высыхание стяжки', d: 14, kind: 'pause', after: ['screed'] },
    { k: 'g-fin', name: 'Чистовая отделка', group: true },
    { k: 'tile', g: 'g-fin', name: 'Плитка в санузле', d: 6, crew: 'fin', after: ['dry'] },
    { k: 'paint', g: 'g-fin', name: 'Шпаклёвка и покраска стен', d: 12, crew: 'fin', after: ['tile'] },
    { k: 'floor', g: 'g-fin', name: 'Ламинат, межкомнатные двери', d: 6, crew: 'fin', after: ['paint'] },
    { k: 'g-end', name: 'Сдача', group: true },
    { k: 'blind', g: 'g-end', name: 'Отмостка, уборка участка', d: 3, crew: 'b1', after: ['floor', 'brick', 'gutter'] },
    { k: 'handover', g: 'g-end', name: 'Сдача дома заказчику', d: 0, kind: 'milestone', after: ['blind'] }
  ];
  // «коробка»: только до кровли и окон
  var BOX_ONLY = ['g-prep', 'axes', 'site', 'g-zero', 'dig', 'sand', 'rebar', 'pour', 'cure', 'water', 'g-box', 'walls',
    'belt', 'slab', 'g-roof', 'rafters', 'membrane', 'tiles', 'gutter', 'g-shell', 'windows'];

  // поставки: к какой работе, за сколько дней до её начала
  var MATERIALS = [
    { work: 'sand', name: 'Песок карьерный', qty: 30, unit: 'т', supplier: 'Карьер «Песчаный»', off: -1 },
    { work: 'rebar', name: 'Арматура А500 Ø12', qty: 2.4, unit: 'т', supplier: 'МеталлБаза', off: -1 },
    { work: 'pour', name: 'Бетон М300', qty: 28, unit: 'м³', supplier: 'Бетонный завод №2', off: 0 },
    { work: 'walls', name: 'Газоблок D500, 1-я партия', qty: 40, unit: 'м³', supplier: 'СтройБлок', off: -2 },
    { work: 'walls', name: 'Газоблок D500, 2-я партия', qty: 38, unit: 'м³', supplier: 'СтройБлок', off: 8 },
    { work: 'slab', name: 'Плиты перекрытия ПК', qty: 14, unit: 'шт', supplier: 'ЖБИ-Дон', off: -1 },
    { work: 'rafters', name: 'Брус и доска для стропил', qty: 6, unit: 'м³', supplier: 'ЛесТорг', off: -2 },
    { work: 'tiles', name: 'Металлочерепица', qty: 210, unit: 'м²', supplier: 'Кровля-Юг', off: -2 },
    { work: 'windows', name: 'Окна ПВХ и входная дверь', qty: 10, unit: 'шт', supplier: 'Окна-Дон', off: 0 },
    { work: 'brick', name: 'Кирпич облицовочный', qty: 9000, unit: 'шт', supplier: 'КирпичСклад', off: -3 },
    { work: 'plaster', name: 'Штукатурка гипсовая', qty: 180, unit: 'меш.', supplier: 'СухСмеси', off: -1 }
  ];

  function midnight(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = midnight(d); x.setDate(x.getDate() + n); return x; }
  function iso(d) {
    var x = midnight(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }

  // расписание по шаблону: каждая работа — сразу после всех своих предшественников
  function buildObject(opts) {
    var today = midnight(new Date());
    var start = addDays(today, opts.startOffset);
    var keys = opts.only || null;
    var rows = TEMPLATE.filter(function (t) { return !keys || keys.indexOf(t.k) >= 0; });
    var idOf = {}, n = 0;
    rows.forEach(function (t) { idOf[t.k] = opts.id + '-' + (++n); });
    var endOf = {}, startOf = {};
    var extra = opts.delays || {};
    var tasks = [], links = [], linkN = 0;
    rows.forEach(function (t) {
      if (t.group) {
        tasks.push({ id: idOf[t.k], parent: 0, text: t.name, type: 'project', kind: 'group', start: iso(start), duration: 1, progress: 0 });
        return;
      }
      var deps = (t.after || []).filter(function (a) { return idOf[a]; });
      var s = deps.length ? new Date(Math.max.apply(null, deps.map(function (a) { return endOf[a]; }))) : start;
      var planStart = s;
      var planDur = t.d;
      // фактические задержки: начали позже (late) и/или делали дольше (longer)
      var late = (extra[t.k] && extra[t.k].late) || 0;
      var longer = (extra[t.k] && extra[t.k].longer) || 0;
      var actualStart = addDays(s, late);
      var dur = t.d + longer;
      startOf[t.k] = actualStart;
      endOf[t.k] = addDays(actualStart, dur);
      var task = {
        id: idOf[t.k], parent: idOf[t.g], text: t.name,
        type: t.kind === 'milestone' ? 'milestone' : 'task',
        kind: t.kind || 'work', crew: t.crew || '',
        start: iso(actualStart), duration: dur, progress: 0, note: ''
      };
      if (opts.baseline) {
        // план — как было задумано до задержек (без учёта сдвигов этой работы)
        var shiftBefore = opts.planShift ? opts.planShift(t.k) : 0;
        task.plan_start = iso(addDays(planStart, -shiftBefore));
        task.plan_end = iso(addDays(planStart, planDur - shiftBefore));
      }
      tasks.push(task);
      deps.forEach(function (a) {
        links.push({ id: opts.id + '-l' + (++linkN), source: idOf[a], target: idOf[t.k], type: '0' });
      });
    });
    // готовность по сегодняшней дате
    tasks.forEach(function (task) {
      if (task.kind === 'group') return;
      var s = new Date(task.start), e = addDays(s, task.duration);
      if (opts.allDone || e <= today) task.progress = 1;
      else if (s < today) task.progress = Math.round((today - s) / (e - s) * 20) / 20;
    });
    // поставки материалов
    var mats = [];
    MATERIALS.forEach(function (m, i) {
      if (!idOf[m.work] || !startOf[m.work]) return;
      var d = addDays(startOf[m.work], m.off);
      var status = opts.allDone || d < today ? 'done' : (d - today < 10 * DAY ? 'ordered' : 'planned');
      mats.push({
        id: opts.id + '-m' + (i + 1), parent: tasks.filter(function (t) { return t.id === idOf[m.work]; })[0].parent,
        text: m.name, type: 'milestone', kind: 'material', work: idOf[m.work],
        start: iso(d), duration: 0, progress: status === 'done' ? 1 : 0,
        qty: m.qty, unit: m.unit, supplier: m.supplier, status: status
      });
    });
    // поставку ставим сразу после её работы
    var ordered = [];
    tasks.forEach(function (t) {
      ordered.push(t);
      mats.filter(function (m) { return m.work === t.id; }).forEach(function (m) { ordered.push(m); });
    });
    return {
      id: opts.id, title: opts.title, address: opts.address, status: opts.status,
      baselineAt: opts.baseline ? iso(addDays(start, -3)) : null,
      tasks: ordered, links: links
    };
  }

  function demo() {
    var keysBefore = {};
    var full = TEMPLATE.map(function (t) { return t.k; });
    // для объекта с задержками план считаем без задержек: сдвиг = сумма задержек предшественников
    function shifted(delays) {
      return function (k) {
        // сколько дней накопилось к началу работы k из-за чужих задержек
        var idx = full.indexOf(k), sum = 0;
        Object.keys(delays).forEach(function (dk) {
          var di = full.indexOf(dk);
          if (di >= 0 && di < idx && isAncestor(dk, k)) sum += (delays[dk].late || 0) + (delays[dk].longer || 0);
        });
        return sum;
      };
    }
    function isAncestor(a, k) {
      if (keysBefore[a + '>' + k] !== undefined) return keysBefore[a + '>' + k];
      var t = TEMPLATE.filter(function (x) { return x.k === k; })[0];
      var res = !!t && (t.after || []).some(function (p) { return p === a || isAncestor(a, p); });
      keysBefore[a + '>' + k] = res;
      return res;
    }
    var d1 = { walls: { longer: 3 }, rafters: { late: 2 } };
    var d4 = { brick: { longer: 4 } };
    return {
      v: 2,
      crews: CREWS.map(function (c) { return Object.assign({}, c); }),
      objects: [
        buildObject({ id: 'o1', title: 'Дом 120 м², газоблок и кирпич', address: 'х. Большой Лог, ул. Садовая, 14',
          status: 'work', startOffset: -62, baseline: true, delays: d1, planShift: shifted(d1) }),
        buildObject({ id: 'o2', title: 'Дом 92 м²', address: 'г. Аксай, ул. Луговая, 3',
          status: 'work', startOffset: -9, baseline: true }),
        buildObject({ id: 'o3', title: 'Дом 145 м², два этажа', address: 'п. Рассвет, ул. Лесная, 8',
          status: 'plan', startOffset: 33, baseline: false }),
        buildObject({ id: 'o4', title: 'Дом 104 м²', address: 'ст. Грушевская, ул. Мира, 21',
          status: 'done', startOffset: -215, baseline: true, allDone: true, delays: d4, planShift: shifted(d4) })
      ]
    };
  }

  window.GPR_DEMO = { demo: demo, buildObject: buildObject, TEMPLATE: TEMPLATE, BOX_ONLY: BOX_ONLY, CREWS: CREWS };
})();

// Модуль: views/slots.js — экран выбора времени
// Обновлено: безопасное построение DOM (без шаблонных innerHTML вставок для динамики),
// улучшенная доступность, делегирование/обработчики клавиатуры, аккуратное управление состоянием UI.

import { api } from '../api.js';
import { mountTgsFromUrl } from '../ui.js';
import { markRoute, goBackOrHero, Route, ScrollMem, $content, navigate } from '../navigation.js';
import { state } from './state.js';
import { confirmBooking } from './confirm.js';

export async function showSlots(){
  markRoute('slots', { masterId: state.masterId, serviceId: state.serviceId });

  // восстановление прокрутки
  (() => {
    const st = Route.load();
    const k  = `${st?.name}:${st?.params?.masterId || ''}:${st?.params?.serviceId || ''}:${st?.params?.slotId || ''}`;
    const y  = ScrollMem.load(k);
    if (y) requestAnimationFrame(()=> { $content.scrollTop = y; });
  })();

  $content.innerHTML = `
    <div class="tg-header">
      <button class="tg-back" id="cbBack" aria-label="Назад">←</button>
      <div class="tg-title">Выбор времени</div>
    </div>
    <div class="tg-sep"></div>

    <div class="tg-wrap">
      <p class="cb-sub">Выберите удобное время для записи</p>

      <div class="sl-weekbar" aria-label="Навигация по неделям">
        <button class="wk-btn" id="wkPrev" aria-label="Предыдущая неделя">‹</button>
        <div class="wk-label" id="wkLabel">Текущая неделя</div>
        <button class="wk-btn" id="wkNext" aria-label="Следующая неделя">›</button>
      </div>

      <div class="sl-toolbar">
        <div class="sl-seg" role="tablist" aria-label="Фильтр дат">
          <button class="seg-btn" data-mode="today"    role="tab" aria-selected="false">Сегодня</button>
          <button class="seg-btn" data-mode="tomorrow" role="tab" aria-selected="false">Завтра</button>
          <button class="seg-btn is-active" data-mode="all" role="tab" aria-selected="true">Все</button>
        </div>
      </div>

      <div id="slotLoading" class="cb-loading" role="status" aria-live="polite">
        <div class="cb-spin" aria-hidden="true"></div>
        <div>Загружаем доступное время…</div>
      </div>

      <div id="slList" class="sl-list is-hidden" role="list"></div>

      <div id="slEmpty" class="tg-empty sl-empty is-hidden" role="status" aria-live="polite">
        <div id="emptyAnim" class="empty-anim" aria-hidden="true"></div>
        <div class="tg-empty-title">Нет свободных слотов</div>
        <div class="tg-empty-sub">Попробуйте выбрать другую услугу или день</div>
      </div>
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  const hide = el => el && el.classList.add('is-hidden');
  const show = el => el && el.classList.remove('is-hidden');

  const $loading = document.getElementById('slotLoading');
  const $list    = document.getElementById('slList');
  const $empty   = document.getElementById('slEmpty');
  const $wkPrev  = document.getElementById('wkPrev');
  const $wkNext  = document.getElementById('wkNext');
  const $wkLabel = document.getElementById('wkLabel');
  const segRoot  = document.querySelector('.sl-seg');
  const segBtns  = segRoot ? Array.from(segRoot.querySelectorAll('.seg-btn')) : [];

  const monthsShort = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  const dayNames = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const startOfDay = (d)=>{ const x=new Date(d); x.setHours(0,0,0,0); return x; };
  const startOfWeekMon = (d)=>{
    const x = startOfDay(d);
    const day = x.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    x.setDate(x.getDate() + diff);
    return x;
  };
  const addDays = (d, n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  const labelWeek = (ws)=>{
    const we = addDays(ws, 6);
    const sameMonth = ws.getMonth() === we.getMonth();
    const l = `${ws.getDate()}${sameMonth?'':' '+monthsShort[ws.getMonth()]}–${we.getDate()} ${monthsShort[we.getMonth()]}`;
    return l;
  };
  const fmtKey = (ts)=>{ const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  // загрузка слотов
  let slots = [];
  try { slots = await api(`/api/slots/?service=${state.serviceId}`, undefined, {allow404:true, fallback:[]}); }
  catch { slots = []; }

  const now = Date.now();
  const prepared = Array.isArray(slots) ? slots
    .map(s=>{
      const ts = new Date(s.time).getTime();
      return {
        id: s.id,
        time: s.time,
        ts,
        is_booked: !!s.is_booked,
        label: new Date(s.time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})
      };
    })
    .filter(s => Number.isFinite(s.ts) && s.ts >= now - 60*1000)
    : [];

  hide($loading);

  if (!prepared.length){
    show($empty);
    mountTgsFromUrl("/static/stickers/duck_sad.tgs", "emptyAnim");
    return;
  }

  const slotById = Object.fromEntries(prepared.map(s => [s.id, s]));
  const groups = {};
  prepared.forEach(s => { (groups[fmtKey(s.ts)] ||= []).push(s); });
  const keysSorted = Object.keys(groups).sort();

  // Очистка списка
  $list.innerHTML = '';
  const todayKey = fmtKey(Date.now());
  const tomorrowKey = fmtKey(Date.now() + 86400000);

  // Построение DOM безопасно (createElement), без шаблонного innerHTML для динамики кнопок
  keysSorted.forEach((key)=>{
    const dt = new Date(key + 'T00:00:00');
    const dd = dt.getDate();
    const dayLabel = (key === todayKey) ? 'Сегодня' : (key === tomorrowKey ? 'Завтра' : dayNames[dt.getDay()]);

    const section = document.createElement('section');
    section.className = 'sl-section';
    section.dataset.key = key;
    section.dataset.day =
      key === todayKey    ? 'today'    :
      key === tomorrowKey ? 'tomorrow' : 'other';

    // header
    const header = document.createElement('div');
    header.className = 'sl-header';
    header.innerHTML = `
      <div class="sl-num">${dd}</div>
    `;
    const info = document.createElement('div');
    info.className = 'sl-info';
    const dayEl = document.createElement('div'); dayEl.className='sl-day'; dayEl.textContent = dayLabel;
    const monEl = document.createElement('div'); monEl.className='sl-month'; monEl.textContent = monthsShort[dt.getMonth()];
    info.appendChild(dayEl); info.appendChild(monEl);
    header.appendChild(info);

    // times container
    const times = document.createElement('div');
    times.className = 'sl-times';

    groups[key]
      .sort((a,b)=> a.ts - b.ts)
      .forEach(s=>{
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sl-time' + (s.is_booked ? ' occupied' : '');
        btn.dataset.id = s.id;
        btn.textContent = s.label;
        if (s.is_booked) {
          btn.disabled = true;
          btn.setAttribute('aria-disabled','true');
        } else {
          btn.setAttribute('aria-disabled','false');
        }

        // click handler
        btn.addEventListener('click', () => {
          // micro-interaction
          btn.style.transform = 'scale(0.98)';
          setTimeout(()=> btn.style.transform = '', 120);

          state.slotId  = Number(btn.dataset.id);
          state.slotObj = slotById[state.slotId];

          // navigate to confirmation screen
          navigate(confirmBooking);
        });

        // keyboard support
        btn.addEventListener('keydown', (e)=>{
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
        });

        times.appendChild(btn);
      });

    section.appendChild(header);
    section.appendChild(times);
    $list.appendChild(section);
  });

  // state for week/filters
  let currentWeekStart = startOfWeekMon(new Date());
  let selectedMode = 'all';

  function setWeek(ws){
    currentWeekStart = startOfWeekMon(ws);
    const text = labelWeek(currentWeekStart);
    if ($wkLabel) $wkLabel.textContent = text;
  }
  function setSeg(mode){
    selectedMode = mode;
    segBtns.forEach(b=>{
      const active = b.dataset.mode === mode;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
  }
  function inCurrentWeek(key){
    const d = new Date(key + 'T00:00:00');
    const ws = startOfWeekMon(currentWeekStart);
    const we = addDays(ws, 6);
    // compare midnight-to-midnight
    return d >= ws && d <= we;
  }
  function applyFilters(){
    let visible = 0;
    const sections = Array.from($list.children);
    sections.forEach(sec=>{
      const key = sec.dataset.key;
      const weekOK = inCurrentWeek(key);
      const segOK  = (selectedMode === 'all') || (sec.dataset.day === selectedMode);
      const showIt = weekOK && segOK;
      sec.style.display = showIt ? '' : 'none';
      if (showIt) visible++;
    });

    if (visible === 0){
      show($empty);
      hide($list);
      if (!document.getElementById('emptyAnim')?.classList.contains('is-filled')){
        mountTgsFromUrl("/static/stickers/duck_crying.tgs", "emptyAnim");
      }
    } else {
      hide($empty);
      show($list);
      // scroll first visible into view for better UX
      const firstVis = sections.find(s => s.style.display !== 'none');
      if (firstVis) firstVis.scrollIntoView({block:'start'});
    }
  }

  // week navigation
  if ($wkPrev) $wkPrev.addEventListener('click', ()=>{
    setWeek(addDays(currentWeekStart, -7));
    applyFilters();
  });
  if ($wkNext) $wkNext.addEventListener('click', ()=>{
    setWeek(addDays(currentWeekStart, +7));
    applyFilters();
  });

  // segment buttons
  segBtns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      setSeg(btn.dataset.mode);
      applyFilters();
    });
  });

  // initial state
  setWeek(new Date());
  setSeg('all');
  applyFilters();
}
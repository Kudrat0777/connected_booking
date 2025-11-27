// Модуль: views/services.js — экран выбора услуги
// Обновлённая версия: безопасный DOM (без прямых innerHTML-подстановок данных),
// улучшена доступность (aria, tabindex), markRoute для NavStack, аккуратные обработчики.

import { api } from '../api.js';
import { mountTgsFromUrl } from '../ui.js';
import { toArray } from '../utils.js';
import { navigate, markRoute, goBackOrHero, $content } from '../navigation.js';
import { state } from './state.js';

export async function showServices(){
  // обязательно помечаем маршрут для восстановления
  markRoute('services', { masterId: state.masterId });

  $content.innerHTML = `
    <div class="tg-header">
      <button class="tg-back" id="cbBack" aria-label="Назад">←</button>
      <div class="tg-title">Выбор услуги</div>
    </div>
    <div class="tg-sep"></div>

    <div class="tg-wrap">
      <p class="cb-sub">Выберите услугу для записи</p>

      <div id="svcLoading" class="cb-loading" role="status" aria-live="polite">
        <div class="cb-spin" aria-hidden="true"></div>
        <div>Загружаем список услуг…</div>
      </div>

      <div id="svcList" class="sv-list is-hidden" role="list"></div>

      <div id="svcEmpty" class="tg-empty is-hidden" role="status" aria-live="polite">
        <div id="emptyAnim" class="empty-anim" aria-hidden="true"></div>
        <div class="tg-empty-title">Услуг пока нет</div>
        <div class="tg-empty-sub">Зайдите позже или выберите другого мастера</div>
      </div>
    </div>
  `;
  const backBtn = document.getElementById('cbBack');
  if (backBtn) backBtn.addEventListener('click', goBackOrHero);

  const hide = el => el && el.classList.add('is-hidden');
  const show = el => el && el.classList.remove('is-hidden');

  const $loading = document.getElementById('svcLoading');
  const $list    = document.getElementById('svcList');
  const $empty   = document.getElementById('svcEmpty');

  let raw = [];
  try { raw = await api(`/api/services/?master=${state.masterId}`, undefined, {allow404:true, fallback:[]}); }
  catch { raw = []; }
  const services = toArray(raw);

  hide($loading);

  if (!Array.isArray(services) || services.length === 0){
    show($empty);
    // показываем анимацию, если есть
    mountTgsFromUrl("/static/stickers/duck_sad.tgs", "emptyAnim");

    // Добавляем кнопку «← К мастерам» (если ещё не добавлена)
    let backToMasters = document.getElementById('backToMasters');
    if (!backToMasters){
      backToMasters = document.createElement('button');
      backToMasters.id = 'backToMasters';
      backToMasters.className = 'tg-btn';
      backToMasters.type = 'button';
      backToMasters.textContent = '← К мастерам';
      // добавляем в конец пустого состояния
      $empty.appendChild(backToMasters);
    }
    backToMasters.addEventListener('click', () => {
      state.masterId  = null;
      state.masterObj = null;
      goBackOrHero();
    }, { once: true });

    return;
  }

  const fmtPrice = (v)=>{
    const n = Number(v || 0);
    if (!n) return '— ₽';
    try{ return new Intl.NumberFormat('ru-RU').format(n) + ' ₽'; }
    catch{ return `${n} ₽`; }
  };
  const fmtDur = (m)=>{
    const n = Number(m || 0);
    return n ? `${n} мин` : '0 мин';
  };

  // очистка и рендер списка безопасно через DOM API
  $list.innerHTML = '';
  services.forEach((s)=>{
    const name = s.name || 'Услуга';
    const desc = s.description || '';
    const price= fmtPrice(s.price);
    const dur  = fmtDur(s.duration);

    const cell = document.createElement('div');
    cell.className = 'tg-cell sv-card';
    cell.setAttribute('role','button');
    cell.setAttribute('tabindex','0');
    cell.setAttribute('aria-label', `${name}, длительность ${dur}, стоимость ${price}`);

    // left (main) column
    const left = document.createElement('div');
    left.className = 'sv-main';

    const title = document.createElement('div');
    title.className = 'sv-title';
    title.textContent = name;
    left.appendChild(title);

    if (desc) {
      const d = document.createElement('div');
      d.className = 'sv-desc';
      d.textContent = desc;
      left.appendChild(d);
    }

    const meta = document.createElement('div');
    meta.className = 'sv-meta';
    const chipDur = document.createElement('span');
    chipDur.className = 'sv-chip';
    chipDur.setAttribute('aria-hidden','true');
    chipDur.textContent = `⏱ ${dur}`;
    const chipPrice = document.createElement('span');
    chipPrice.className = 'sv-chip';
    chipPrice.setAttribute('aria-hidden','true');
    chipPrice.textContent = `💵 ${price}`;
    meta.appendChild(chipDur);
    meta.appendChild(chipPrice);
    left.appendChild(meta);

    // right column
    const right = document.createElement('div');
    right.className = 'sv-right';
    const p = document.createElement('div');
    p.className = 'sv-price';
    p.textContent = price;
    const arr = document.createElement('div');
    arr.className = 'sv-arrow';
    arr.setAttribute('aria-hidden','true');
    arr.textContent = '→';
    right.appendChild(p);
    right.appendChild(arr);

    cell.appendChild(left);
    cell.appendChild(right);

    const go = ()=>{
      state.serviceId  = s.id;
      state.serviceObj = s;
      // отметим маршрут slots с параметрами для корректного NavStack/restore
      markRoute('slots', { masterId: state.masterId, serviceId: s.id });
      navigate(()=> import('./slots.js').then(mod => mod.showSlots()));
    };

    cell.addEventListener('click', go);
    cell.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });

    $list.appendChild(cell);
  });

  show($list);
}
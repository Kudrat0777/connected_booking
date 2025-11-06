// Модуль: views/services.js — экран выбора услуги

import { api } from '../api.js';
import { mountTgsFromUrl } from '../ui.js';
import { toArray } from '../utils.js';
import { navigate, markRoute, goBackOrHero, $content } from '../navigation.js';
import { state } from './state.js';

export async function showServices(){
  markRoute('services', { masterId: state.masterId });

  $content.innerHTML = `
    <div class="tg-header">
      <button class="tg-back" id="cbBack" aria-label="Назад">←</button>
      <div class="tg-title">Выбор услуги</div>
    </div>
    <div class="tg-sep"></div>

    <div class="tg-wrap">
      <p class="cb-sub">Выберите услугу для записи</p>

      <div id="svcLoading" class="cb-loading">
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
  document.getElementById('cbBack').onclick = goBackOrHero;

  const hide = el => el.classList.add('is-hidden');
  const show = el => el.classList.remove('is-hidden');

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
    mountTgsFromUrl("/static/stickers/duck_sad.tgs", "emptyAnim");

    // Добавляем кнопку «← К мастерам»
    let backBtn = document.getElementById('backToMasters');
    if (!backBtn){
      backBtn = document.createElement('button');
      backBtn.id = 'backToMasters';
      backBtn.className = 'tg-btn';
      backBtn.type = 'button';
      backBtn.textContent = '← К мастерам';
      $empty.appendChild(backBtn);
    }
    backBtn.addEventListener('click', () => {
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

    cell.innerHTML = `
      <div class="sv-main">
        <div class="sv-title">${name}</div>
        ${desc ? `<div class="sv-desc">${desc}</div>` : ``}
        <div class="sv-meta">
          <span class="sv-chip" aria-hidden="true">⏱ ${dur}</span>
          <span class="sv-chip" aria-hidden="true">💵 ${price}</span>
        </div>
      </div>
      <div class="sv-right">
        <div class="sv-price">${price}</div>
        <div class="sv-arrow" aria-hidden="true">→</div>
      </div>
    `;

    const go = ()=>{
      state.serviceId  = s.id;
      state.serviceObj = s;
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
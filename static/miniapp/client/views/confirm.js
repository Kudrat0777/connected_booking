// Модуль: views/confirm.js — экран подтверждения и создание брони
// Обновлён: безопасная работа с DOM, исправлены опечатки, явная работа с MainButton,
// улучшена локализация строки подтверждения и обработка ошибок.

import { TG, tgUser } from '../telegram.js';
import { api } from '../api.js';
import { toast, mountTgsFromUrl } from '../ui.js';
import { markRoute, goBackOrHero, $content } from '../navigation.js';
import { state } from './state.js';
import { showSuccessModal } from './modal_success.js';

export function confirmBooking(){
  markRoute('confirm', { masterId: state.masterId, serviceId: state.serviceId, slotId: state.slotId });

  const svcName    = state.serviceObj?.name || 'Услуга';
  const masterName = state.masterObj?.name  || 'Мастер';
  const price      = (state.serviceObj?.price ?? null);
  const duration   = (state.serviceObj?.duration ?? null);
  const ava        = state.masterObj?.avatar_url || state.masterObj?.avatar || state.masterObj?.photo_url || '';
  const initialsTxt= (masterName||'M').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2);

  const when = state.slotObj?.time ? new Date(state.slotObj.time) : null;
  const dateStr = when ? when.toLocaleDateString('ru-RU',{weekday:'long',day:'2-digit',month:'long'}) : `Слот #${state.slotId}`;
  const timeStr = when ? when.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}) : '—:—';

  // Рисуем структуру страницы — минимально динамична, содержимое вставляем безопасно ниже
  $content.innerHTML = `
    <div class="tg-header">
      <button class="tg-back" id="cbBack" aria-label="Назад">←</button>
      <div class="tg-title">Подтверждение</div>
    </div>
    <div class="tg-sep"></div>

    <div class="tg-wrap cnf-wrap" id="cnfRoot">
      <div id="cnfSticker" class="cnf-sticker" aria-hidden="true"></div>

      <section class="cnf-card" aria-labelledby="cnfTitle" id="cnfCard"></section>

      <div class="cnf-actions" id="cnfActions">
        <button id="confirmBtn" class="cnf-btn primary">✓ Подтвердить бронь</button>
        <button id="cancelBtn"  class="cnf-btn ghost">✕ Отменить</button>
      </div>
    </div>
  `;

  // Собираем содержимое карточки безопасно
  const cnfCard = document.getElementById('cnfCard');

  // Head
  const head = document.createElement('div');
  head.className = 'cnf-head';

  const avaEl = document.createElement('div');
  avaEl.className = 'cnf-ava';
  avaEl.id = 'cnfAva';
  if (ava) {
    // установим фон изображения; защищаем от некорректного URL
    try { avaEl.style.backgroundImage = `url('${ava}')`; } catch(_) { avaEl.textContent = initialsTxt; }
  } else {
    avaEl.textContent = initialsTxt;
  }

  const headInfo = document.createElement('div');
  headInfo.style.minWidth = '0';
  const titleEl = document.createElement('div');
  titleEl.className = 'cnf-title';
  titleEl.id = 'cnfTitle';
  titleEl.textContent = svcName;
  const subEl = document.createElement('div');
  subEl.className = 'cnf-sub';
  subEl.textContent = `Мастер: ${masterName}`;

  headInfo.appendChild(titleEl);
  headInfo.appendChild(subEl);

  head.appendChild(avaEl);
  head.appendChild(headInfo);

  // Rows list
  const rows = document.createElement('div');
  rows.className = 'cnf-rows';
  rows.setAttribute('role','list');

  function makeRow(icon, label, value, metaLabel, metaValue) {
    const row = document.createElement('div');
    row.className = 'cnf-row';
    row.setAttribute('role','listitem');

    const ic = document.createElement('div');
    ic.className = 'cnf-ic';
    ic.setAttribute('aria-hidden','true');
    ic.textContent = icon;

    const left = document.createElement('div');
    const lab = document.createElement('div'); lab.className='cnf-lab'; lab.textContent = label;
    const val = document.createElement('div'); val.className='cnf-val'; val.textContent = value;
    left.appendChild(lab); left.appendChild(val);

    row.appendChild(ic);
    row.appendChild(left);

    if (metaLabel || metaValue){
      const meta = document.createElement('div');
      meta.className = 'cnf-meta';
      const mLab = document.createElement('div'); mLab.className='cnf-lab'; mLab.textContent = metaLabel || '';
      const mVal = document.createElement('div'); mVal.className='cnf-price'; mVal.textContent = metaValue || '';
      meta.appendChild(mLab); meta.appendChild(mVal);
      row.appendChild(meta);
    }

    return row;
  }

  rows.appendChild(makeRow('🗓️', 'Дата', dateStr, 'Время', timeStr));
  rows.appendChild(makeRow('⏱️', 'Длительность', duration ? `${duration} мин` : '—', 'Стоимость', price != null ? `${price} ₽` : '—'));
  rows.appendChild(makeRow('👤', 'Мастер', masterName, '', ''));

  // Note / disclaimer (fixed class name cnf-note)
  const note = document.createElement('div');
  note.className = 'cnf-note';
  note.textContent = 'Нажимая «Подтвердить бронь», вы создаёте запись в выбранное время.';

  cnfCard.appendChild(head);
  cnfCard.appendChild(rows);
  cnfCard.appendChild(note);

  // sticker
  try {
    mountTgsFromUrl('/static/stickers/duck_ok.tgs', 'cnfSticker');
    setTimeout(()=> {
      const filled = document.getElementById('cnfSticker')?.classList.contains('is-filled');
      if (!filled) mountTgsFromUrl('/static/stickers/duck_ok.tgs', 'cnfSticker');
    }, 300);
  } catch(_) {}

  // Elements & handlers
  const backBtn = document.getElementById('cbBack');
  if (backBtn) backBtn.addEventListener('click', ()=> { cleanupMainButton(); goBackOrHero(); });

  const $confirm = document.getElementById('confirmBtn');
  const $cancel  = document.getElementById('cancelBtn');
  const $actions = document.getElementById('cnfActions');

  // cleanup helper for TG MainButton
  const cleanupMainButton = ()=>{
    const tg = TG();
    if (!tg) return;
    try {
      tg.MainButton?.hide();
      // использовать стандартный offEvent, если доступен
      if (typeof tg.offEvent === 'function') tg.offEvent('mainButtonClicked', onConfirm);
    } catch(_) {}
  };

  document.getElementById('cbBack').onclick = ()=>{ cleanupMainButton(); goBackOrHero(); };
  $cancel.addEventListener('click', ()=>{ cleanupMainButton(); goBackOrHero(); });

  async function onConfirm(){
    $confirm.disabled = true; $cancel.disabled = true;
    const prevText = $confirm.textContent;
    $confirm.textContent = '⏳ Создаём…';
    try {
      await api('/api/bookings/', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          slot_id: state.slotId,
          name: tgUser ? `${tgUser.first_name||''} ${tgUser.last_name||''}`.trim() : 'Anonymous',
          telegram_id: tgUser?.id ?? null,
          username: tgUser?.username ?? null,
          photo_url: tgUser?.photo_url ?? null
        })
      });

      cleanupMainButton();

      // build subtitle for success modal
      const when = state.slotObj?.time ? new Date(state.slotObj.time) : null;
      const sub = when
        ? `${svcName} • ${when.toLocaleDateString('ru-RU', {weekday:'long', day:'numeric', month:'long'})}, ${when.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}`
        : `${svcName}`;

      showSuccessModal({
        title: 'Бронь создана',
        sub,
        stickerList: ['/static/stickers/duck_classic.tgs']
      });

    } catch(e) {
      const code = e?.status || e?.statusCode || 0;
      if (code === 409) toast('Слот уже занят. Выберите другое время.');
      else toast('Не удалось создать бронь');
      // восстанавливаем кнопки
      $confirm.disabled = false; $confirm.textContent = prevText;
      $cancel.disabled = false;
    }
  }

  // Integrate with Telegram MainButton if available
  const tg = TG();
  if (tg?.MainButton){
    // hide in-page confirm, and use main button instead
    $confirm.style.display = 'none';
    $actions.classList.add('is-mainbutton');

    try{
      tg.MainButton.setParams({
        text: 'Подтвердить бронь',
        color: tg.themeParams?.button_color || '#2ea6ff',
        text_color: tg.themeParams?.button_text_color || '#ffffff',
        is_active: true,
        is_visible: true
      });
      tg.MainButton.show();
      if (typeof tg.onEvent === 'function') tg.onEvent('mainButtonClicked', onConfirm);
    }catch(_){
      // fallback: show local confirm
      $confirm.style.display = '';
      $actions.classList.remove('is-mainbutton');
      $confirm.addEventListener('click', onConfirm);
    }
  } else {
    $confirm.addEventListener('click', onConfirm);
  }
}
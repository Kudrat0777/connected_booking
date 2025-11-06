// Модуль: views/confirm.js — экран подтверждения и создание брони

import { TG, tgUser } from '../telegram.js';
import { api } from '../api.js';
import { toast, mountTgsFromUrl } from '../ui.js';
import { markRoute, goBackOrHero, $content } from '../navigation.js';
import { state } from './state.js';
import { showSuccessModal } from './modal_success.js'; // см. ниже (микро-компонент)

export function confirmBooking(){
  markRoute('confirm', { masterId: state.masterId, serviceId: state.serviceId, slotId: state.slotId });

  // восстановление скролла не критично, опущено для краткости

  const svcName    = state.serviceObj?.name || 'Услуга';
  const masterName = state.masterObj?.name  || 'Мастер';
  const price      = (state.serviceObj?.price ?? null);
  const duration   = (state.serviceObj?.duration ?? null);
  const ava        = state.masterObj?.avatar_url || state.masterObj?.avatar || state.masterObj?.photo_url || '';
  const initialsTxt= (masterName||'M').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2);

  const when = state.slotObj?.time ? new Date(state.slotObj.time) : null;
  const dateStr = when ? when.toLocaleDateString('ru-RU',{weekday:'long',day:'2-digit',month:'long'}) : `Слот #${state.slotId}`;
  const timeStr = when ? when.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}) : '—:—';

  $content.innerHTML = `
    <div class="tg-header">
      <button class="tg-back" id="cbBack" aria-label="Назад">←</button>
      <div class="tg-title">Подтверждение</div>
    </div>
    <div class="tg-sep"></div>

    <div class="tg-wrap cnf-wrap">
      <div id="cnfSticker" class="cnf-sticker" aria-hidden="true"></div>

      <section class="cnf-card" aria-labelledby="cnfTitle">
        <div class="cnf-head">
          <div class="cnf-ava" id="cnfAva">${ava ? '' : initialsTxt}</div>
          <div style="min-width:0">
            <div class="cnf-title" id="cnfTitle">${svcName}</div>
            <div class="cnf-sub">Мастер: ${masterName}</div>
          </div>
        </div>

        <div class="cnf-rows" role="list">
          <div class="cnf-row" role="listitem">
            <div class="cnf-ic" aria-hidden="true">🗓️</div>
            <div>
              <div class="cnf-lab">Дата</div>
              <div class="cnf-val">${dateStr}</div>
            </div>
            <div class="cnf-meta">
              <div class="cnf-lab">Время</div>
              <div class="cnf-val">${timeStr}</div>
            </div>
          </div>

          <div class="cnf-row" role="listitem">
            <div class="cnf-ic" aria-hidden="true">⏱️</div>
            <div>
              <div class="cnf-lab">Длительность</div>
              <div class="cnf-val">${duration ? `${duration} мин` : '—'}</div>
            </div>
            <div class="cnf-meta">
              <div class="cnf-lab">Стоимость</div>
              <div class="cnf-price">${price != null ? `${price} ₽` : '—'}</div>
            </div>
          </div>

          <div class="cnf-row" role="listitem">
            <div class="cnf-ic" aria-hidden="true">👤</div>
            <div>
              <div class="cnf-lab">Мастер</div>
              <div class="cnf-val">${masterName}</div>
            </div>
          </div>
        </div>

        <div class="cnф-note">Нажимая «Подтвердить бронь», вы создаёте запись в выбранное время.</div>
      </section>

      <div class="cnf-actions" id="cnfActions">
        <button id="confirmBtn" class="cnf-btn primary">✓ Подтвердить бронь</button>
        <button id="cancelBtn"  class="cnf-btn ghost">✕ Отменить</button>
      </div>
    </div>
  `;

  const $ava = document.getElementById('cnfAva');
  if (ava) { $ava.style.backgroundImage = `url('${ava}')`; }

  try {
    mountTgsFromUrl('/static/stickers/duck_ok.tgs', 'cnfSticker');
    setTimeout(()=> {
      const filled = document.getElementById('cnfSticker')?.classList.contains('is-filled');
      if (!filled) mountTgsFromUrl('/static/stickers/duck_ok.tgs', 'cnfSticker');
    }, 300);
  } catch(_) {}

  const tg = TG();
  const $confirm = document.getElementById('confirmBtn');
  const $cancel  = document.getElementById('cancelBtn');
  const $actions = document.getElementById('cnfActions');

  const cleanupMainButton = ()=>{
    if (!tg) return;
    try {
      tg.MainButton?.hide();
      tg.offEvent?.('mainButtonClicked', onConfirm);
    } catch(_) {}
  };

  document.getElementById('cbBack').onclick = ()=>{ cleanupMainButton(); goBackOrHero(); };
  $cancel.onclick = ()=>{ cleanupMainButton(); goBackOrHero(); };

  async function onConfirm(){
    $confirm.disabled = true; $cancel.disabled = true;
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
      cleanupMainButton?.();

      const when = state.slotObj?.time ? new Date(state.slotObj.time) : null;
      const sub = when
        ? `${state.serviceObj?.name || 'Услуга'} • ${when.toLocaleDateString('ru-RU', {weekday:'long', day:'numeric', month:'long'})}, ${when.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`
        : `${state.serviceObj?.name || 'Услуга'}`;

      showSuccessModal({
        title: 'Бронь создана',
        sub,
        stickerList: ['/static/stickers/duck_classic.tgs']
      });

    } catch(e) {
      const code = e?.status || 0;
      if (code === 409) toast('Сlot уже занят. Выберите другое время.');
      else toast('Не удалось создать бронь');
      if ($confirm) { $confirm.disabled = false; $confirm.textContent = '✓ Подтвердить бронь'; }
      if ($cancel)  { $cancel.disabled = false; }
    }
  }

  if (tg?.MainButton) {
    $confirm.style.display = 'none';
    $actions.classList.add('is-mainbutton');

    try{
      tg.MainButton.setParams({
        text: 'Подтвердить бронь',
        color: tg.themeParams?.button_color || '#2ea6ff',
        text_color: tg.themeParams?.button_text_color || '#ffffff',
        is_active: true, is_visible: true
      });
      tg.MainButton.show();
      tg.onEvent('mainButtonClicked', onConfirm);
    }catch(_){}
  } else {
    $confirm.addEventListener('click', onConfirm);
  }
}
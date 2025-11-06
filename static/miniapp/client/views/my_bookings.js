// Модуль: views/my_bookings.js — экран "Мои брони"

import { tgUser } from '../telegram.js';
import { api } from '../api.js';
import { toast, mountTgsFromUrl } from '../ui.js';
import { startFlow, markRoute, goBackOrHero, $content } from '../navigation.js';

export async function showMyBookings(){
  markRoute('my_bookings');
  if (!tgUser?.id){ toast('Откройте через Telegram'); startFlow(()=> import('./masters.js').then(m => m.showMasters())); return; }

  $content.innerHTML = `
    <div class="tg-header">
      <button class="tg-back" id="cbBack" aria-label="Назад">←</button>
      <div class="tg-title">Мои брони</div>
    </div>
    <div class="tg-seп"></div>

    <div class="tg-wrap">
      <div id="loadingState" class="tg-loading">
        <div class="tg-spinner" aria-hidden="true"></div>
        <div>Загружаем ваши брони…</div>
      </div>

      <div id="bookingsList" class="tg-list no-frame" style="display:none"></div>

      <div id="emptyState" class="tg-empty" style="display:none">
        <div id="emptyAnim" class="empty-anim" aria-hidden="true"></div>
        <div class="tg-empty-title">Пока нет броней</div>
        <div class="tg-empty-sub">Создайте первую запись, и она появится здесь</div>
        <button id="emptyCta" class="tg-btn primary">Записаться</button>
      </div>
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  let bookings = [];
  try { bookings = await api(`/api/bookings/?telegram_id=${tgUser.id}`); } catch(_){}

  const $load  = document.getElementById('loadingState');
  const $list  = document.getElementById('bookingsList');
  const $empty = document.getElementById('emptyState');
  $load.style.display = 'none';

  if (!Array.isArray(bookings) || bookings.length === 0){
    $empty.style.display = 'grid';
    mountTgsFromUrl("/static/stickers/duck_sad.tgs", "emptyAnim");
    document.getElementById('emptyCta')?.addEventListener('click', () =>
      startFlow(()=> import('./masters.js').then(m => m.showMasters()))
    );
    return;
  }

  const fmtTime  = (d)=> d ? new Date(d).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}) : '';
  const fmtDate  = (d)=> d ? new Date(d).toLocaleDateString('ru-RU',{day:'2-digit', month:'long'}) : '';

  const classify = (b)=>{
    const raw = (b.status || 'pending').toLowerCase();
    const ts = b.slot?.time ? new Date(b.slot.time).getTime() : 0;
    const inPast = ts && ts < Date.now();

    if (raw === 'rejected') return {key:'rejected', text:'Отклонена'};
    if (raw === 'confirmed') return inPast ? {key:'completed', text:'Выполнена'} : {key:'active', text:'Активна'};
    if (raw === 'pending') return {key:'pending', text:'Ожидает подтверждения'};
    return inPast ? {key:'completed', text:'Выполнена'} : {key:'pending', text:'Ожидает подтверждения'};
  };

  $list.style.display = 'grid';
  $list.innerHTML = '';
  bookings
    .slice()
    .sort((a,b)=> new Date(b.slot?.time||0) - new Date(a.slot?.time||0))
    .forEach((b, idx)=>{
      const svc    = b.slot?.service?.name || 'Услуга';
      const master = b.slot?.service?.master?.name || b.slot?.service?.master_name || b.master_name || b.master || '—';
      const when   = b.slot?.time || null;
      const {key, text} = classify(b);
      const isFuture = when && new Date(when).getTime() > Date.now();

      const cell = document.createElement('div');
      cell.className = 'tg-cell';
      cell.style.animationDelay = `${idx * 60}ms`;

      cell.innerHTML = `
        <div class="tg-main">
          <div class="tg-name">${svc}</div>
          <div class="tg-sub">${fmtTime(when)}${when ? ' • ' + fmtDate(when) : ''} • Мастер: ${master}</div>
          <div class="tg-status ${key}" style="margin-top:10px">
            <span class="dot"></span><span>${text}</span>
          </div>
        </div>
        <div class="tg-right">
          ${isFuture && key !== 'rejected' ? `<button class="tg-action" data-id="${b.id}">Отменить</button>` : ``}
        </div>
      `;
      $list.appendChild(cell);
    });

  $list.querySelectorAll('.tg-action').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const ok = confirm('Отменить эту бронь?');
      if (!ok) return;
      try{
        const resp = await fetch(`/api/bookings/${id}/`, {method:'DELETE'});
        if (resp.status === 204){
          toast('Бронь отменена');
          showMyBookings();
        } else {
          toast('Ошибка отмены');
        }
      }catch(_){ toast('Ошибка сети'); }
    });
  });
}
// ===== Telegram theme & user =====
let tgUser = null;
try {
  if (window.Telegram?.WebApp) {
    const TG = window.Telegram.WebApp;
    TG.ready?.(); TG.expand?.();
    tgUser = TG.initDataUnsafe?.user || null;
    document.body.style.background = TG.backgroundColor || getComputedStyle(document.documentElement).getPropertyValue('--bg');
    document.body.style.color      = TG.textColor || getComputedStyle(document.documentElement).getPropertyValue('--text');
  }
} catch (_) {}

// ===== DOM =====
const $hero   = document.getElementById('hero');
const $app    = document.getElementById('app-shell');
const $content= document.getElementById('content');
const $loader = document.getElementById('loader');
const $toast  = document.getElementById('toast');

// ===== helpers =====
function showLoading(on=true){ if($loader) $loader.style.display = on ? 'flex' : 'none'; }
function toast(text, ms=1800){ if(!$toast) return; $toast.textContent=text; $toast.style.display='block'; setTimeout(()=>{$toast.style.display='none'}, ms); }
async function api(url, init){
  try{
    showLoading(true);
    const r = await fetch(url, init);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json().catch(()=> ({}));
  }catch(e){ console.error(e); toast('Ошибка сети'); throw e; }
  finally{ showLoading(false); }
}
const initials = (name='') => name.trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2);

// ===== bootstrap hero =====
(function initHero(){
  const tg = window.Telegram?.WebApp;
  const u = tg?.initDataUnsafe?.user;
  if (u){
    const first = u.first_name || 'Гость';
    const title = document.getElementById('welcomeTitle');
    const avatar= document.getElementById('userAvatar');
    title && (title.textContent = `Привет, ${first}!`);
    if (avatar){
      if (u.photo_url){
        avatar.style.backgroundImage = `url(${u.photo_url})`;
        avatar.style.backgroundSize = 'cover';
        avatar.style.backgroundPosition = 'center';
        avatar.textContent = '';
      } else {
        avatar.textContent = (first[0]||'🙂').toUpperCase();
      }
    }
  }
  // hero buttons
  document.getElementById('goBook')?.addEventListener('click', ()=> startFlow(showMasters));
  document.getElementById('goMy')  ?.addEventListener('click', ()=> startFlow(showMyBookings));
})();

function startFlow(fn){
  $hero.style.display = 'none';
  $app.style.display  = 'block';
  ViewStack.length = 0;
  navigate(fn);
}
window.returnToHero = function(){
  $app.style.display  = 'none';
  $hero.style.display = 'flex';
};

// ===== tiny router (без глобальной кнопки назад) =====
const ViewStack = [];
function navigate(viewFn){ ViewStack.push(viewFn); viewFn(); }
function goBackOrHero(){
  if (ViewStack.length > 1){
    ViewStack.pop();
    const top = ViewStack[ViewStack.length-1];
    top && top();
  } else {
    window.returnToHero?.();
  }
}

// ===== state =====
let masterId = null, serviceId = null, slotId = null;
let masterObj = null, serviceObj = null, slotObj = null;
// ===== screens =====
async function showMasters(){
  $content.innerHTML = `
    <div class="cb-header">
      <div class="cb-header__row">
        <button class="cb-back" id="cbBack">←</button>
        <h2 class="cb-title">Выбор мастера</h2>
      </div>
      <div class="cb-sep"></div>
    </div>
    <div class="cb-wrap">
      <p class="cb-sub">Выберите мастера для записи</p>
      <div id="cbLoading" class="cb-loading">
        <div class="cb-spin"></div>
        <div>Загружаем список мастеров…</div>
      </div>
      <div id="cbList" class="cb-list" style="display:none"></div>
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  let masters = [];
  try { masters = await api('/api/masters/'); } catch(_){}

  const loading = document.getElementById('cbLoading');
  const list    = document.getElementById('cbList');
  loading.style.display = 'none';
  list.style.display    = 'flex';

  if (!masters.length){
    list.innerHTML = `<div class="cb-card"><div class="cb-info"><div class="cb-name">Пока нет мастеров</div></div></div>`;
    return;
  }

  masters.forEach(m=>{
    const card = document.createElement('div');
    card.className = 'cb-card';
    card.innerHTML = `
      <div class="cb-ava" ${m.avatar_url ? `style="background-image:url('${m.avatar_url}');background-size:cover;background-position:center"`:''}>
        ${m.avatar_url ? '' : (initials(m.name)||'M')}
      </div>
      <div class="cb-info">
        <div class="cb-name">${m.name||'Мастер'}</div>
        <div class="cb-status">${m.bio || 'Доступно сегодня'}</div>
      </div>
      <div class="cb-dot ${m.online===false?'off':''}"></div>
      <div class="cb-arrow">→</div>
    `;
    card.onclick = ()=>{ masterId = m.id; masterObj = m; navigate(showServices); };
    list.appendChild(card);
  });
}

async function showServices(){
  $content.innerHTML = `
    <div class="cb-header">
      <div class="cb-header__row">
        <button class="cb-back" id="cbBack">←</button>
        <h2 class="cb-title">Выбор услуги</h2>
      </div>
      <div class="cb-sep"></div>
    </div>

    <div class="cb-wrap">
      <p class="cb-sub">Выберите услугу для записи</p>

      <div id="svcLoading" class="cb-loading">
        <div class="cb-spin"></div>
        <div>Загружаем список услуг…</div>
      </div>

      <div id="svcList" class="cb-list" style="display:none"></div>
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  let services = [];
  try { services = await api(`/api/services/?master=${masterId}`); } catch(_){}

  const loading = document.getElementById('svcLoading');
  const list    = document.getElementById('svcList');
  loading.style.display = 'none';
  list.style.display    = 'flex';

  if (!services.length){
    list.innerHTML = `<div class="cb-card"><div class="cb-name">Услуг нет</div></div>`;
    return;
  }

  services.forEach((s, i)=>{
    const card = document.createElement('div');
    card.className = 'cb-card slide-in';
    card.style.animationDelay = `${i*0.05}s`;
    card.innerHTML = `
      <div class="cb-info">
        <div class="cb-name">${s.name}</div>
      </div>
      <div class="cb-arrow">→</div>
    `;
    card.onclick = ()=>{ serviceId = s.id; serviceObj = s; navigate(showSlots); };
    list.appendChild(card);
  });
}


async function showSlots(){
  // каркас
  $content.innerHTML = `
    <div class="cb-header">
      <div class="cb-header__row">
        <button class="cb-back" id="cbBack">←</button>
        <h2 class="cb-title">Выбор времени</h2>
      </div>
      <div class="cb-sep"></div>
    </div>

    <div class="cb-wrap">
      <p class="cb-sub">Выберите удобное время для записи</p>

      <div id="slotLoading" class="cb-loading">
        <div class="cb-spin"></div>
        <div>Загружаем доступное время…</div>
      </div>

      <div id="datesList" class="dates-list" style="display:none"></div>
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  let slots = [];
  try { slots = await api(`/api/slots/?service=${serviceId}`); } catch(_) {}

  const loading = document.getElementById('slotLoading');
  const root    = document.getElementById('datesList');
  loading.style.display = 'none';
  root.style.display    = 'flex';

  const now = Date.now();
  const freeOrBusy = (s) => ({
    id: s.id,
    time: s.time, // ISO строка для подтверждения
    ts: new Date(s.time).getTime(),
    is_booked: !!s.is_booked,
    label: new Date(s.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
  });
  const prepared = Array.isArray(slots)
    ? slots.map(freeOrBusy).filter(s => s.ts >= now - 60*1000) // отсекаем прошлое
    : [];

  if (!prepared.length){
    root.innerHTML = `
      <div class="date-section slide-in">
        <div class="date-header">
          <div class="date-info">
            <div class="date-day">Нет свободных слотов</div>
            <div class="date-month">Попробуйте выбрать другую услугу или день</div>
          </div>
        </div>
      </div>`;
    return;
  }

  const fmtKey = (d) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  };
  const groups = {};
  prepared.forEach(s => {
    const key = fmtKey(s.ts);
    (groups[key] ||= []).push(s);
  });

  // словари дат
  const dayNames   = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const monthNames = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const today      = new Date();     const todayKey    = fmtKey(today);
  const tomorrow   = new Date(Date.now() + 86400000); const tomorrowKey = fmtKey(tomorrow);

  // индекс по id для confirm
  const slotById = Object.fromEntries(prepared.map(s => [s.id, s]));

  // рендер секций
  Object.keys(groups).sort().forEach((key, idx) => {
    const dt = new Date(key + 'T00:00:00');
    const dayLabel = (key === todayKey) ? 'Сегодня' : (key === tomorrowKey ? 'Завтра' : dayNames[dt.getDay()]);
    const dd = String(dt.getDate());
    const mm = monthNames[dt.getMonth()];

    const section = document.createElement('div');
    section.className = 'date-section slide-in';
    section.style.animationDelay = `${idx*0.08}s`;

    const times = groups[key]
      .sort((a,b) => a.ts - b.ts)
      .map(s => {
        const cls = `time-slot${s.is_booked ? ' occupied' : ''}`;
        return `<div class="${cls}" data-id="${s.id}">${s.label}</div>`;
      }).join('');

    section.innerHTML = `
      <div class="date-header">
        <div class="date-number">${dd}</div>
        <div class="date-info">
          <div class="date-day">${dayLabel}</div>
          <div class="date-month">${mm}</div>
        </div>
      </div>
      <div class="time-slots">${times}</div>
    `;
    root.appendChild(section);
  });

  // клики по свободным
  root.querySelectorAll('.time-slot').forEach(el => {
    if (el.classList.contains('occupied')) return;
    el.addEventListener('click', () => {
      el.style.transform = 'scale(0.96)';
      setTimeout(() => { el.style.transform = ''; }, 120);
      slotId  = Number(el.getAttribute('data-id'));
      slotObj = slotById[slotId];        // сохраняем выбранный слот целиком
      navigate(confirmBooking);
    });
  });
}


function confirmBooking(){
  // форматируем данные
  const svcName   = serviceObj?.name || 'Услуга';
  const masterName= masterObj?.name  || 'Мастер';
  const whenStr   = slotObj?.time ? new Date(slotObj.time).toLocaleString() : `Слот #${slotId}`;

  $content.innerHTML = `
    <div class="cb-header">
      <div class="cb-header__row">
        <button class="cb-back" id="cbBack">←</button>
        <h2 class="cb-title">Подтверждение</h2>
      </div>
      <div class="cb-sep"></div>
    </div>

    <div class="cb-wrap confirm-wrap">
      <div class="confirmation-question fade-in">
        <h1 class="question-title">Создать бронь?</h1>
        <p class="question-subtitle">Проверьте детали вашей записи</p>
      </div>

      <div class="booking-details">
        <div class="detail-card slide-in" style="animation-delay:.1s">
          <div class="detail-icon service-icon">✂️</div>
          <div class="detail-info">
            <div class="detail-label">Услуга</div>
            <div class="detail-value" id="serviceName">${svcName}</div>
          </div>
        </div>

        <div class="detail-card slide-in" style="animation-delay:.2s">
          <div class="detail-icon time-icon">🕐</div>
          <div class="detail-info">
            <div class="detail-label">Время</div>
            <div class="detail-value" id="bookingTime">${whenStr}</div>
          </div>
        </div>

        <div class="detail-card slide-in" style="animation-delay:.3s">
          <div class="detail-icon master-icon">👤</div>
          <div class="detail-info">
            <div class="detail-label">Мастер</div>
            <div class="detail-value" id="masterName">${masterName}</div>
          </div>
        </div>
      </div>

      <div class="actions scale-in" style="animation-delay:.4s">
        <button id="confirmBtn" class="action-button confirm-button">✓ Подтвердить бронь</button>
        <button id="cancelBtn"  class="action-button cancel-button">✕ Отменить</button>
      </div>
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  document.getElementById('cancelBtn').onclick = ()=> {
    // просто шаг назад (к выбору времени) или на витрину, если стек пуст
    goBackOrHero();
  };

  document.getElementById('confirmBtn').onclick = async (e)=>{
    e.currentTarget.style.transform = 'scale(0.96)';
    setTimeout(()=>{ e.currentTarget.style.transform=''; }, 120);

    try{
      await api('/api/bookings/', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          slot_id: slotId,
          name: tgUser ? `${tgUser.first_name||''} ${tgUser.last_name||''}`.trim() : 'Anonymous',
          telegram_id: tgUser?.id ?? null,
          username: tgUser?.username ?? null,
          photo_url: tgUser?.photo_url ?? null
        })
      });
      toast('Бронь создана');
      navigate(showMyBookings);
    }catch(_){}
  };
}

async function showMyBookings(){
  if (!tgUser?.id){ toast('Откройте через Telegram'); returnToHero?.(); return; }

  $content.innerHTML = `
    <div class="cb-header">
      <div class="cb-header__row">
        <button class="cb-back" id="cbBack">←</button>
        <h2 class="cb-title">Мои брони</h2>
      </div>
      <div class="cb-sep"></div>
    </div>

    <div class="cb-wrap">
      <p class="subtitle fade-in">История ваших бронирований</p>

      <div id="loadingState" class="loading">
        <div class="loading-spinner"></div>
        <p>Загружаем ваши брони...</p>
      </div>

      <div id="bookingsList" class="bookings-list" style="display:none"></div>
      <div id="emptyState" class="empty-state" style="display:none">
        <div class="empty-icon">📅</div>
        <div class="empty-title">Пока нет броней</div>
        <div class="empty-subtitle">Создайте первую бронь, чтобы увидеть её здесь</div>
      </div>
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  let bookings = [];
  try { bookings = await api(`/api/bookings/?telegram_id=${tgUser.id}`); } catch(_){}

  const $load = document.getElementById('loadingState');
  const $list = document.getElementById('bookingsList');
  const $empty= document.getElementById('emptyState');
  $load.style.display = 'none';

  if (!Array.isArray(bookings) || bookings.length === 0){
    $empty.style.display = 'block';
    return;
  }
  $list.style.display = 'block';

  const statusText = s => s==='pending' ? 'Активна' : s==='confirmed' ? 'Активна' : s==='rejected' ? 'Отменена' : '';
  const serviceIcon = name => {
    const n = name||'';
    if (n.includes('Стриж')) return '✂️';
    if (n.includes('Окраш')) return '🎨';
    if (n.includes('Маник')) return '💅';
    if (n.includes('Педик')) return '🦶';
    if (n.includes('Массаж')) return '💆';
    return '✨';
  };
  const cssStatus = (b) => {
    if (b.status === 'rejected') return 'cancelled';
    // считаем «завершённой», если время прошло
    const ts = b.slot?.time ? new Date(b.slot.time).getTime() : 0;
    return ts && ts < Date.now() ? 'completed' : 'active';
  };

  $list.innerHTML = '';
  bookings
    .sort((a,b)=> new Date(b.slot?.time||0) - new Date(a.slot?.time||0))
    .forEach((b,idx)=>{
      const svc   = b.slot?.service?.name || 'Услуга';
      const when  = b.slot?.time ? new Date(b.slot.time) : null;
      const timeS = when ? when.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
      const dateS = when ? when.toLocaleDateString('ru-RU', {day:'2-digit', month:'long'}) : '';
      const master= b.slot?.service?.master?.name || '—';
      const stCls = cssStatus(b);
      const stTxt = statusText(b.status);

      const card = document.createElement('div');
      card.className = `booking-card ${stCls} slide-in`;
      card.style.animationDelay = `${idx*0.06}s`;

      const actionsHTML = (stCls==='active')
        ? `<div class="booking-actions">
             <button class="cancel-button" data-id="${b.id}">Отменить бронь</button>
           </div>` : '';

      card.innerHTML = `
        <div class="booking-status status-${stCls}">${stTxt}</div>
        <div class="booking-header">
          <div class="booking-icon ${stCls}">${serviceIcon(svc)}</div>
          <div class="booking-main-info">
            <div class="booking-service">${svc}</div>
            <div class="booking-time">${timeS}${dateS ? ' • '+dateS : ''}</div>
            <div class="booking-master">Мастер: ${master}</div>
          </div>
        </div>
        ${actionsHTML}
      `;
      $list.appendChild(card);
    });

  $list.querySelectorAll('.cancel-button').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const id = btn.dataset.id;
      const ok = confirm('Отменить эту бронь?');
      if (!ok) return;
      try{
        const resp = await fetch(`/api/bookings/${id}/`, {method:'DELETE'});
        if (resp.status === 204){
          toast('Бронь отменена');
          showMyBookings(); // перерисовать
        } else {
          toast('Ошибка отмены');
        }
      }catch(_){ toast('Ошибка сети'); }
    });
  });
}

window.ViewStack      = ViewStack;
window.navigate       = navigate;
window.showMasters    = showMasters;
window.showMyBookings = showMyBookings;

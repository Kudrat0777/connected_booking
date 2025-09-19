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
    card.onclick = ()=>{ masterId = m.id; navigate(showServices); };
    list.appendChild(card);
  });
}

async function showServices(){
  const services = await api(`/api/services/?master=${masterId}`);
  $content.innerHTML = `
    <div class="cb-header">
      <div class="cb-header__row">
        <button class="cb-back" id="cbBack">←</button>
        <h2 class="cb-title">Выбор услуги</h2>
      </div>
      <div class="cb-sep"></div>
    </div>
    <div class="cb-wrap"><div id="svcList" class="cb-list"></div></div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  const list = document.getElementById('svcList');
  if (!services.length){ list.innerHTML = `<div class="cb-card"><div class="cb-name">Услуг нет</div></div>`; return; }

  services.forEach(s=>{
    const card = document.createElement('div');
    card.className = 'cb-card';
    card.innerHTML = `
      <div class="cb-ava">S</div>
      <div class="cb-info"><div class="cb-name">${s.name}</div></div>
      <div class="cb-arrow">→</div>
    `;
    card.onclick = ()=>{ serviceId = s.id; navigate(showSlots); };
    list.appendChild(card);
  });
}

async function showSlots(){
  const slots = await api(`/api/slots/?service=${serviceId}`);
  $content.innerHTML = `
    <div class="cb-header">
      <div class="cb-header__row">
        <button class="cb-back" id="cbBack">←</button>
        <h2 class="cb-title">Выбор времени</h2>
      </div>
      <div class="cb-sep"></div>
    </div>
    <div class="cb-wrap"><div id="slotList" class="cb-list"></div></div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  const list = document.getElementById('slotList');
  const free = Array.isArray(slots) ? slots.filter(s=> !s.is_booked) : [];
  if (!free.length){ list.innerHTML = `<div class="cb-card"><div class="cb-name">Свободных слотов нет</div></div>`; return; }

  free.forEach(x=>{
    const card = document.createElement('div');
    card.className = 'cb-card';
    card.innerHTML = `
      <div class="cb-ava">⏰</div>
      <div class="cb-info"><div class="cb-name">${new Date(x.time).toLocaleString()}</div></div>
      <div class="cb-arrow">→</div>
    `;
    card.onclick = ()=>{ slotId = x.id; navigate(confirmBooking); };
    list.appendChild(card);
  });
}

function confirmBooking(){
  $content.innerHTML = `
    <div class="cb-header">
      <div class="cb-header__row">
        <button class="cb-back" id="cbBack">←</button>
        <h2 class="cb-title">Подтверждение</h2>
      </div>
      <div class="cb-sep"></div>
    </div>
    <div class="cb-wrap">
      <div class="cb-card"><div class="cb-info">
        <div class="cb-name">Создать бронь?</div>
        <div class="cb-status">Слот #${slotId}</div>
      </div></div>
      <button id="confirmBtn" class="backbtn" style="margin-top:12px">Забронировать</button>
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  document.getElementById('confirmBtn').onclick = async ()=>{
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
  const bookings = await api(`/api/bookings/?telegram_id=${tgUser.id}`);

  $content.innerHTML = `
    <div class="cb-header">
      <div class="cb-header__row">
        <button class="cb-back" id="cbBack">←</button>
        <h2 class="cb-title">Мои брони</h2>
      </div>
      <div class="cb-sep"></div>
    </div>
    <div class="cb-wrap"><div id="bkList" class="cb-list"></div></div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  const list = document.getElementById('bkList');
  if (!bookings.length){ list.innerHTML = `<div class="cb-card"><div class="cb-name">У вас нет броней</div></div>`; return; }

  const map = {pending:'Ожидание', confirmed:'Подтверждено ✅', rejected:'Отклонено ❌'};
  bookings.forEach(b=>{
    const card = document.createElement('div');
    card.className = 'cb-card';
    card.innerHTML = `
      <div class="cb-ava">📋</div>
      <div class="cb-info">
        <div class="cb-name">${b.slot?.service?.name || 'Услуга'} — ${b.slot?.time ? new Date(b.slot.time).toLocaleString() : '—'}</div>
        <div class="cb-status">${map[b.status] || ''}</div>
      </div>
      <button class="backbtn" data-id="${b.id}">Отменить</button>
    `;
    card.querySelector('button').onclick = async (e)=>{
      e.stopPropagation();
      if (!confirm('Отменить бронь?')) return;
      try{
        const resp = await fetch(`/api/bookings/${b.id}/`, {method:'DELETE'});
        if (resp.status === 204){ toast('Отменено'); showMyBookings(); }
        else toast('Ошибка отмены');
      }catch(_){ toast('Ошибка сети'); }
    };
    list.appendChild(card);
  });
}

window.ViewStack      = ViewStack;
window.navigate       = navigate;
window.showMasters    = showMasters;
window.showMyBookings = showMyBookings;

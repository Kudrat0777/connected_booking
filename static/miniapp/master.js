/* MASTER_JS_VERSION = 10 */

/* ========== DOM helpers ========== */
const $ = (id) => document.getElementById(id);
const $content = $('content');
const $loader  = $('loader');
const $toast   = $('toast');
const $back    = $('backBtn');

function showLoading(on=true){ if($loader) $loader.style.display = on ? 'flex' : 'none'; }
function toast(text, ms=1800){ if(!$toast) return; $toast.textContent = text; $toast.style.display='block'; setTimeout(()=>{$toast.style.display='none'}, ms); }
async function api(url, init){
  try{ showLoading(true); const r = await fetch(url, init); if(!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json().catch(()=>({})); }
  catch(e){ console.error(e); toast('Ошибка сети'); throw e; }
  finally{ showLoading(false); }
}
function esc(s=''){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m])); }

/* ========== Telegram ID (3 источника) ========== */
let tgUser = null;
try {
  if (window.Telegram && window.Telegram.WebApp) {
    Telegram.WebApp.expand(); Telegram.WebApp.ready();
    tgUser = Telegram.WebApp.initDataUnsafe?.user || null;
    document.body.style.background = Telegram.WebApp.backgroundColor || '#17212b';
    document.body.style.color = Telegram.WebApp.textColor || '#e7eef7';
  }
} catch(_) {}

function rawIdFromInitData(){
  try{
    const raw = window.Telegram?.WebApp?.initData || '';
    const m = raw.match(/user=([^&]+)/);
    if (!m) return null;
    return JSON.parse(decodeURIComponent(m[1]))?.id || null;
  }catch{ return null; }
}
const urlTid = new URLSearchParams(location.search).get('tid'); // резерв для отладки
const CURRENT_TG_ID =
  (tgUser && tgUser.id) ||
  rawIdFromInitData() ||
  (urlTid ? Number(urlTid) : null);

// профиль (визуал)
if (tgUser && $('profile')) {
  $('profile').innerHTML =
    `<img src="${tgUser.photo_url}" style="width:48px;height:48px;border-radius:50%;box-shadow:0 2px 8px #0004;"><br>
     <b>${esc(tgUser.first_name||'')} ${esc(tgUser.last_name||'')}</b>`;
} else if (!tgUser && urlTid && $('profile')) {
  $('profile').innerHTML = `<b>Мастер #${esc(urlTid)}</b>`;
}

/* ========== mini-router ========== */
const ViewStack = [];
function navigate(viewFn){
  ViewStack.push(viewFn);
  if ($back) $back.style.display = ViewStack.length>1 ? 'inline-block' : 'none';
  viewFn();
}
$back?.addEventListener('click', ()=>{
  if (ViewStack.length > 1) ViewStack.pop();
  const top = ViewStack.length ? ViewStack[ViewStack.length - 1] : null;
  (top || autoEntry)();
});

/* ========== авто-вход / регистрация ========== */
async function ensureMaster(){
  const tid = CURRENT_TG_ID;
  if (!tid) return { ok:false, reason:'no_tg_id' };

  const r = await api(`/api/masters/by_telegram/?telegram_id=${tid}`);
  if (r?.exists) return { ok:true, master:r.master };

  // форма регистрации
  $content.innerHTML = `
    <h2>Регистрация мастера</h2>
    <div class="booking-item">
      <label>Имя</label>
      <input id="regName" type="text" class="input"
             value="${tgUser ? esc((tgUser.first_name||'') + (tgUser.last_name ? (' ' + tgUser.last_name) : '')) : ''}">
      <button id="regBtn" class="tg-btn" style="margin-top:10px">Зарегистрироваться</button>
    </div>`;
  $('regBtn').onclick = async ()=>{
    const name = $('regName').value.trim();
    if (!name) { toast('Укажите имя'); return; }
    await api('/api/masters/register/', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, telegram_id: tid })
    });
    toast('Готово'); autoEntry(); // повторим вход
  };
  return { ok:false, reason:'need_register' };
}

/* ========== экраны ========== */
async function autoEntry(){
  const res = await ensureMaster();
  if (res.ok) navigate(showHome);
  else if (res.reason === 'no_tg_id') {
    $content.innerHTML = `
      <div class="booking-item">
        <b>Не удалось получить ваш Telegram ID.</b><br>
        Откройте панель через кнопку в боте.<br>
        Для отладки можно добавить ?tid=ВАШ_ID к URL.
      </div>`;
  }
}

function showHome(){
  $content.innerHTML = `
    <div style="display:flex; gap:10px; flex-wrap:wrap">
      <button id="showBookingsBtn" class="tg-btn">Показать записи</button>
      <button id="profileBtn" class="backbtn">Мой профиль</button>
      <button id="servicesBtn" class="backbtn">Услуги и слоты</button>
      <button id="calendarBtn" class="backbtn">Календарь</button>
    </div>`;
  $('showBookingsBtn').onclick = async ()=>{ const m=await ensureMaster(); if(m?.ok) navigate(()=>showBookings('today','')); };
  $('profileBtn').onclick      = async ()=>{ const m=await ensureMaster(); if(m?.ok) navigate(showProfile); };
  $('servicesBtn').onclick     = async ()=>{ const m=await ensureMaster(); if(m?.ok) navigate(showServicesManager); };
  $('calendarBtn').onclick     = async ()=>{ const m=await ensureMaster(); if(m?.ok) navigate(showCalendar); };
}

async function showCalendar(year, month){
  const tid = CURRENT_TG_ID; if(!tid){ toast('Открой через Telegram'); return; }
  const now = new Date();
  year  = year  || now.getFullYear();
  month = month || (now.getMonth()+1);

  const data = await api(`/api/slots/calendar/?telegram_id=${tid}&year=${year}&month=${month}`);
  const days = data.days || [];

  // заголовок и сетка
  $content.innerHTML = `
    <h2>Календарь</h2>
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px">
      <button id="calPrev" class="backbtn">←</button>
      <div><b>${year}</b> • <b>${month.toString().padStart(2,'0')}</b></div>
      <button id="calNext" class="backbtn">→</button>
    </div>
    <div id="grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px"></div>
    <div id="dayBox" class="booking-item" style="margin-top:12px; display:none"></div>
  `;

  $('calPrev').onclick = ()=> {
    let y = year, m = month-1; if (m<1){ m=12; y--; }
    showCalendar(y,m);
  };
  $('calNext').onclick = ()=> {
    let y = year, m = month+1; if (m>12){ m=1; y++; }
    showCalendar(y,m);
  };

  const grid = $('grid');
  grid.innerHTML = '';
  days.forEach(d=>{
    const el = document.createElement('div');
    el.className = 'booking-item';
    const dateStr = d.date.slice(-2); // DD
    el.innerHTML = `
      <div style="font-weight:bold">${dateStr}</div>
      <div style="font-size:12px;margin-top:4px">🟢 ${d.free} &nbsp; 🔴 ${d.busy}</div>
    `;
    el.style.cursor = 'pointer';
    el.onclick = ()=> showDay(d);
    grid.appendChild(el);
  });

  async function showDay(d){
    const box = $('dayBox');
    box.style.display = 'block';
    const iso = d.date; // YYYY-MM-DD
    const pretty = iso.split('-').reverse().join('.');

    // список слотов + быстрая форма
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>День: ${pretty}</h3>
        <button id="dayHide" class="backbtn">Скрыть</button>
      </div>
      <div class="booking-item">
        <label>Добавить слот</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <select id="svcSel" class="input" style="min-width:160px"></select>
          <input id="timeInp" class="input" type="time" value="10:00">
          <button id="addSlot" class="tg-btn">Добавить</button>
        </div>
      </div>
      <div id="slotsList"></div>
    `;
    $('dayHide').onclick = ()=> { box.style.display='none'; };

    // услуги мастера для селекта
    const services = await api(`/api/services/my/?telegram_id=${tid}`);
    const sel = $('svcSel');
    sel.innerHTML = services.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');

    // отрисовать список
    renderSlots(d.slots);

    // добавление слота
    $('addSlot').onclick = async ()=>{
      const svc = Number(sel.value);
      const timeHHMM = $('timeInp').value; // "HH:MM"
      if (!svc || !timeHHMM) return toast('Заполни услугу и время');

      // соберём ISO в локали пользователя
      const isoLocal = new Date(`${iso}T${timeHHMM}:00`);
      await api('/api/slots/', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ service: svc, time: isoLocal.toISOString() })
      });
      toast('Слот добавлен');
      // обновим день и календарь
      showCalendar(year, month);
      // и снова раскроем день
      setTimeout(async ()=> {
        const fresh = await api(`/api/slots/calendar/?telegram_id=${tid}&year=${year}&month=${month}`);
        const nd = (fresh.days || []).find(x=>x.date===iso) || {slots:[]};
        showDay(nd);
      }, 50);
    };
  }

  function renderSlots(slots){
    const list = $('slotsList');
    if (!list) return;
    if (!slots || !slots.length){
      list.innerHTML = '<div class="booking-item">Слоты отсутствуют</div>';
      return;
    }
    list.innerHTML = '';
    slots.sort((a,b)=> new Date(a.time) - new Date(b.time));
    slots.forEach(s=>{
      const el = document.createElement('div'); el.className='booking-item';
      el.innerHTML = `
        ${new Date(s.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
        • ${esc(s.service)} • ${s.is_booked ? 'занят' : 'свободен'}
        ${s.is_booked ? '' : `<button class="backbtn" data-id="${s.id}" style="float:right">Удалить</button>`}
      `;
      list.appendChild(el);
    });
    list.querySelectorAll('button[data-id]').forEach(b=>{
      b.onclick = async ()=>{
        await api(`/api/slots/${b.dataset.id}/`, {method:'DELETE'});
        toast('Удалено');
        // мягкое обновление: выкинем элемент
        b.closest('.booking-item').remove();
      };
    });
  }
}


async function showSlotsManager(serviceId){
  const slots = await api(`/api/slots/for_service/?service=${serviceId}`);

  $content.innerHTML = `
    <h2>Слоты услуги</h2>
    <div class="booking-item">
      <label>Добавить одиночный слот</label>
      <input id="oneDT" class="input" type="datetime-local">
      <button id="oneAdd" class="tg-btn" style="margin-top:8px">Добавить</button>
    </div>

    <div class="booking-item">
      <label><b>Массовая генерация</b></label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
        <input id="gStart" type="date" class="input">
        <input id="gEnd"   type="date" class="input">
        <input id="gTimes" type="text" class="input" placeholder="например: 10:00, 11:30, 15:00">
      </div>
      <div style="margin-top:6px">
        <label>Дни недели:</label>
        <label><input type="checkbox" class="gDay" value="0" checked> Пн</label>
        <label><input type="checkbox" class="gDay" value="1" checked> Вт</label>
        <label><input type="checkbox" class="gDay" value="2" checked> Ср</label>
        <label><input type="checkbox" class="gDay" value="3" checked> Чт</label>
        <label><input type="checkbox" class="gDay" value="4" checked> Пт</label>
        <label><input type="checkbox" class="gDay" value="5" checked> Сб</label>
        <label><input type="checkbox" class="gDay" value="6" checked> Вс</label>
      </div>
      <button id="gRun" class="tg-btn" style="margin-top:8px">Сгенерировать</button>
    </div>

    <h3>Слоты</h3>
    <div id="slotList"></div>
  `;

  // одиночный слот
  $('oneAdd').onclick = async ()=>{
    const v = $('oneDT').value; if(!v) return toast('Укажи дату/время');
    // локальное -> ISO
    const iso = new Date(v).toISOString();
    await api('/api/slots/', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ service: serviceId, time: iso })
    });
    toast('Слот добавлен'); showSlotsManager(serviceId);
  };

  // массовая генерация
  $('gRun').onclick = async ()=>{
    const start = $('gStart').value, end = $('gEnd').value, timesStr = $('gTimes').value;
    if (!start || !end || !timesStr) return toast('Заполни все поля генерации');
    const times = timesStr.split(',').map(s=>s.trim()).filter(Boolean);
    const weekdays = Array.from(document.querySelectorAll('.gDay:checked')).map(i=>Number(i.value));
    await api('/api/slots/bulk_generate/', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ service: serviceId, start_date:start, end_date:end, times, weekdays })
    });
    toast('Слоты созданы'); showSlotsManager(serviceId);
  };

  // список
  const list = $('slotList');
  if (!slots.length){ list.innerHTML = '<div class="booking-item">Слоты не найдены</div>'; return; }
  list.innerHTML = '';
  slots.forEach(s=>{
    const el = document.createElement('div'); el.className = 'booking-item';
    el.innerHTML = `
      ${new Date(s.time).toLocaleString()} • ${s.is_booked ? 'занят' : 'свободен'}
      ${s.is_booked ? '' : `<button class="backbtn" data-id="${s.id}" style="float:right">Удалить</button>`}
    `;
    list.appendChild(el);
  });
  list.querySelectorAll('button[data-id]').forEach(b=>{
    b.onclick = async ()=>{
      await api(`/api/slots/${b.dataset.id}/`, { method:'DELETE' });
      toast('Удалено'); showSlotsManager(serviceId);
    };
  });
}


async function showServicesManager(){
  const tid = CURRENT_TG_ID; if(!tid){ toast('Открой через Telegram'); return; }
  const services = await api(`/api/services/my/?telegram_id=${tid}`);

  $content.innerHTML = `
    <h2>Мои услуги</h2>
    <div class="booking-item">
      <label>Новая услуга</label>
      <input id="svcName" class="input" placeholder="Напр. Стрижка">
      <button id="svcCreate" class="tg-btn" style="margin-top:8px">Создать</button>
    </div>
    <div id="svcList"></div>
  `;

  $('svcCreate').onclick = async ()=>{
    const name = $('svcName').value.trim();
    if (!name) return toast('Название обязательно');
    await api('/api/services/create_by_master/', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ telegram_id: tid, name })
    });
    toast('Услуга добавлена'); showServicesManager();
  };

  const list = $('svcList');
  if (!services.length){ list.innerHTML = '<h3>Пока нет услуг</h3>'; return; }
  services.forEach(s=>{
    const el = document.createElement('div'); el.className = 'booking-item';
    el.innerHTML = `<b>${s.name}</b><br><button class="backbtn" data-id="${s.id}">Слоты</button>`;
    list.appendChild(el);
  });
  list.querySelectorAll('button[data-id]').forEach(b=>{
    b.onclick = ()=> navigate(()=>showSlotsManager(Number(b.dataset.id)));
  });
}

async function showBookings(period='today', status=''){
  if (!CURRENT_TG_ID) { toast('Открой через Telegram'); return; }

  // фильтры + контейнеры
  $content.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <button class="backbtn" data-p="today">Сегодня</button>
      <button class="backbtn" data-p="tomorrow">Завтра</button>
      <button class="backbtn" data-p="week">Неделя</button>
      <select id="statusSel" class="backbtn">
        <option value="">Все</option>
        <option value="pending">Ожидание</option>
        <option value="confirmed">Подтверждено</option>
        <option value="rejected">Отклонено</option>
      </select>
    </div>
    <div id="summary" style="margin:6px 0 12px;"></div>
    <div id="list"></div>`;
  document.querySelectorAll('[data-p]').forEach(b=> b.onclick = ()=> showBookings(b.dataset.p, $('statusSel').value));
  $('statusSel').value = status; $('statusSel').onchange = (e)=> showBookings(period, e.target.value);

  // данные
  const q = new URLSearchParams({ telegram_id: CURRENT_TG_ID, period });
  if (status) q.append('status', status);
  const resp = await api(`/api/bookings/for_master/?${q.toString()}`);

  const s = resp.summary || {total:0,pending:0,confirmed:0,rejected:0};
  $('summary').innerHTML = `Всего: <b>${s.total}</b> • ⏳ ${s.pending} • ✅ ${s.confirmed} • ❌ ${s.rejected}`;

  const items = resp.items || resp || [];
  const list = $('list');
  if (!items.length){ list.innerHTML = '<h2>Нет броней</h2>'; return; }

  const map = {pending:'Ожидание', confirmed:'Подтверждено ✅', rejected:'Отклонено ❌'};
  list.innerHTML = '';
  items.forEach(b=>{
    const d = document.createElement('div'); d.className='booking-item';
    d.innerHTML = `
      <b>Клиент:</b> ${esc(b.name)}<br>
      <b>Услуга:</b> ${esc(b.slot?.service?.name ?? '—')}<br>
      <b>Время:</b> ${b.slot ? new Date(b.slot.time).toLocaleString() : '—'}<br>
      <div style="margin-top:6px">${map[b.status] ?? ''}</div>
      ${b.status === 'pending' ? `
        <div style="margin-top:10px">
          <button class="confirm-btn" data-id="${b.id}">Подтвердить</button>
          <button class="reject-btn" data-id="${b.id}">Отклонить</button>
        </div>` : ''}
      <hr>`;
    list.appendChild(d);
  });

  // действия
  document.querySelectorAll('.confirm-btn').forEach(btn=> btn.onclick = async ()=>{
    await api(`/api/bookings/${btn.dataset.id}/confirm/`, {method:'POST'});
    toast('Подтверждено'); showBookings(period, status);
  });
  document.querySelectorAll('.reject-btn').forEach(btn=> btn.onclick = async ()=>{
    await api(`/api/bookings/${btn.dataset.id}/reject/`, {method:'POST'});
    toast('Отклонено'); showBookings(period, status);
  });
}

async function showProfile(){
  const tid = CURRENT_TG_ID;
  if (!tid) { toast('Открой через Telegram'); return; }

  let v = {};
  try { v = await api(`/api/masters/me/?telegram_id=${tid}`); } catch(_){ v = {}; }

  $content.innerHTML = `
    <h2>Мой профиль</h2>
    <div class="booking-item">
      <label>Имя</label>
      <input id="pName" class="input" type="text" value="${esc(v.name||'')}">
      <label style="margin-top:8px">Описание</label>
      <textarea id="pBio" class="input" rows="4">${esc(v.bio||'')}</textarea>
      <label style="margin-top:8px">Телефон</label>
      <input id="pPhone" class="input" type="tel" placeholder="+998 xx xxx xx xx" value="${esc(v.phone||'')}">
      <label style="margin-top:8px">Аватар URL</label>
      <input id="pAvatar" class="input" type="url" placeholder="https://..." value="${esc(v.avatar_url||'')}">
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button id="pSave" class="tg-btn">Сохранить</button>
        <button id="pBack" class="backbtn">Назад</button>
      </div>
    </div>
  `;

  $('pBack').onclick = ()=>{
    if (ViewStack.length > 1) {
      ViewStack.pop();
      const top = ViewStack.length ? ViewStack[ViewStack.length - 1] : null;
      (top || showHome)();
    } else { showHome(); }
  };

  $('pSave').onclick = async ()=>{
    const payload = {
      telegram_id: tid,
      name: $('pName').value.trim(),
      bio: $('pBio').value.trim(),
      phone: $('pPhone').value.trim(),
      avatar_url: $('pAvatar').value.trim()
    };
    if (!payload.name) { toast('Имя обязательно'); return; }
    try{
      await api('/api/masters/me_update/', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      toast('Сохранено'); showProfile();
    }catch(_){}
  };
}

/* ========== старт ========== */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoEntry);
else autoEntry();

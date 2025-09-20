const $id = (s)=>document.getElementById(s);
const $content = $id('content');
const $loader  = $id('loader');
const $toast   = $id('toast');
const $home    = $id('homePanel');
const $appArea = $id('appArea');

function showLoading(on=true){ if($loader) $loader.style.display = on ? 'flex' : 'none'; }
function toast(text, ms=1800){ if(!$toast) return; $toast.textContent = text; $toast.style.display='block'; setTimeout(()=>{$toast.style.display='none'}, ms); }
async function api(url, init){
  try {
    showLoading(true);
    const r = await fetch(url, init);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json().catch(()=> ({}));
  } catch(e) { console.error(e); toast('Ошибка сети'); throw e; }
  finally { showLoading(false); }
}
function esc(s=''){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m])); }

let tgUser = null;
try{
  const TG = window.Telegram?.WebApp;
  if (TG){ TG.ready?.(); TG.expand?.(); tgUser = TG.initDataUnsafe?.user || null; }
} catch(_) {}

function rawIdFromInitData(){
  try{
    const raw = window.Telegram?.WebApp?.initData || '';
    const m = raw.match(/user=([^&]+)/);
    if (!m) return null;
    return JSON.parse(decodeURIComponent(m[1]))?.id || null;
  }catch{ return null; }
}
const urlTid = new URLSearchParams(location.search).get('tid');
const CURRENT_TG_ID = (tgUser?.id) || rawIdFromInitData() || (urlTid ? Number(urlTid) : null);

const ViewStack = [];
function navigate(viewFn){
  if ($home.style.display !== 'none') {
    $home.style.display = 'none';
    $appArea.style.display = 'block';
  }
  ViewStack.push(viewFn);
  viewFn();
}
function goBackOrHome(){
  if (ViewStack.length > 1){
    ViewStack.pop();
    const top = ViewStack[ViewStack.length-1];
    top && top();
  } else {
    $appArea.style.display = 'none';
    $home.style.display = 'flex';
  }
}

async function initHome(){
  const logo = $id('masterLogo');
  const nameEl = $id('masterName');
  if (tgUser?.first_name){ nameEl.textContent = `${tgUser.first_name} ${tgUser.last_name||''}`.trim(); logo.textContent = (tgUser.first_name[0]||'M').toUpperCase(); }

  if (!CURRENT_TG_ID){
    $id('noTid').style.display = 'block';
    bindHomeButtons();
    return;
  }

  try{
    const r = await api(`/api/masters/by_telegram/?telegram_id=${CURRENT_TG_ID}`);
    if (r?.exists && r.master){
      nameEl.textContent = r.master.name || nameEl.textContent;
      logo.textContent = (r.master.name||'M').trim().charAt(0).toUpperCase();
    } else {
      // быстрый авто-рег по имени из TG (если не хотим формы)
      const probableName = (tgUser ? `${tgUser.first_name||''} ${tgUser.last_name||''}`.trim() : '').trim();
      if (probableName){
        await api('/api/masters/register/', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ name: probableName, telegram_id: CURRENT_TG_ID })
        });
      }
    }
  }catch(_){ /* no-op */ }

  try{
    const q = new URLSearchParams({ telegram_id: CURRENT_TG_ID, period: 'today' });
    const resp = await api(`/api/bookings/for_master/?${q.toString()}`);
    const s = resp?.summary || {total:0,pending:0};
    $id('statTotal').textContent   = s.total ?? 0;
    $id('statPending').textContent = s.pending ?? 0;
  }catch(_){}

  bindHomeButtons();
}

function bindHomeButtons(){
  const bind = (sel, fn) => {
    document.querySelectorAll(sel).forEach(b=> b.addEventListener('click', ()=>{
      b.style.transform = 'scale(0.97)'; setTimeout(()=> b.style.transform='', 120);
      fn();
    }));
  };
  bind('[data-act="appointments"]', ()=> navigate(()=>showBookings('today','')));
  bind('[data-act="profile"]',      ()=> navigate(showProfile));
  bind('[data-act="services"]',     ()=> navigate(showServicesManager));
  bind('[data-act="calendar"]',     ()=> navigate(showCalendar));
}

function headerHTML(title){
  return `
    <div class="cb-header">
      <div class="cb-header__row">
        <button class="cb-back" id="cbBack">←</button>
        <h2 class="cb-title">${esc(title)}</h2>
      </div>
      <div class="cb-sep"></div>
    </div>
  `;
}
function mountHeaderBack(){ const b = $id('cbBack'); if (b) b.onclick = goBackOrHome; }

async function showBookings(period='today', status=''){
  if (!CURRENT_TG_ID){ toast('Открой через Telegram'); return; }

  $content.innerHTML = `
    ${headerHTML('Записи')}
    <div class="cb-wrap">
      <div class="booking-item" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="backbtn" data-p="today">Сегодня</button>
        <button class="backbtn" data-p="tomorrow">Завтра</button>
        <button class="backbtn" data-p="week">Неделя</button>
        <select id="statusSel" class="input" style="min-width:140px">
          <option value="">Все</option>
          <option value="pending">Ожидание</option>
          <option value="confirmed">Подтверждено</option>
          <option value="rejected">Отклонено</option>
        </select>
      </div>
      <div id="summary" class="booking-item" style="margin-top:8px"></div>
      <div id="list" style="margin-top:10px"></div>
    </div>
  `;
  mountHeaderBack();
  document.querySelectorAll('[data-p]').forEach(b=> b.onclick = ()=> showBookings(b.dataset.p, $id('statusSel').value));
  $id('statusSel').value = status;
  $id('statusSel').onchange = (e)=> showBookings(period, e.target.value);

  const q = new URLSearchParams({ telegram_id: CURRENT_TG_ID, period });
  if (status) q.append('status', status);
  const resp = await api(`/api/bookings/for_master/?${q.toString()}`);
  const s = resp.summary || {total:0,pending:0,confirmed:0,rejected:0};
  $id('summary').innerHTML = `Всего: <b>${s.total}</b> • ⏳ ${s.pending} • ✅ ${s.confirmed} • ❌ ${s.rejected}`;

  const items = resp.items || resp || [];
  const list = $id('list');
  if (!items.length){ list.innerHTML = '<div class="booking-item">Нет броней</div>'; return; }

  const map = {pending:'Ожидание', confirmed:'Подтверждено ✅', rejected:'Отклонено ❌'};
  list.innerHTML = '';
  items.forEach(b=>{
    const div = document.createElement('div'); div.className='booking-item';
    div.innerHTML = `
      <b>Клиент:</b> ${esc(b.name)}<br>
      <b>Услуга:</b> ${esc(b.slot?.service?.name ?? '—')}<br>
      <b>Время:</b> ${b.slot ? new Date(b.slot.time).toLocaleString() : '—'}<br>
      <div style="margin-top:6px">${map[b.status] ?? ''}</div>
      ${b.status === 'pending' ? `
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="tg-btn" data-confirm="${b.id}">Подтвердить</button>
          <button class="backbtn" data-reject="${b.id}">Отклонить</button>
        </div>` : ''}
    `;
    list.appendChild(div);
  });
  list.querySelectorAll('[data-confirm]').forEach(btn=> btn.onclick = async ()=>{
    await api(`/api/bookings/${btn.dataset.confirm}/confirm/`, {method:'POST'});
    toast('Подтверждено'); showBookings(period, status);
  });
  list.querySelectorAll('[data-reject]').forEach(btn=> btn.onclick = async ()=>{
    await api(`/api/bookings/${btn.dataset.reject}/reject/`, {method:'POST'});
    toast('Отклонено'); showBookings(period, status);
  });
}

async function showProfile(){
  if (!CURRENT_TG_ID){ toast('Открой через Telegram'); return; }
  let v = {};
  try{ v = await api(`/api/masters/me/?telegram_id=${CURRENT_TG_ID}`); } catch(_){ v={}; }

  $content.innerHTML = `
    ${headerHTML('Мой профиль')}
    <div class="cb-wrap">
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
          <button id="pCancel" class="backbtn">Отмена</button>
        </div>
      </div>
    </div>
  `;
  mountHeaderBack();
  $id('pCancel').onclick = goBackOrHome;

  $id('pSave').onclick = async ()=>{
    const payload = {
      telegram_id: CURRENT_TG_ID,
      name: $id('pName').value.trim(),
      bio: $id('pBio').value.trim(),
      phone: $id('pPhone').value.trim(),
      avatar_url: $id('pAvatar').value.trim()
    };
    if (!payload.name) return toast('Имя обязательно');
    await api('/api/masters/me_update/', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    toast('Сохранено');
    goBackOrHome();
    // обновим имя на главном экране
    $id('masterName').textContent = payload.name;
    $id('masterLogo').textContent = (payload.name[0] || 'M').toUpperCase();
  };
}

async function showServicesManager(){
  if (!CURRENT_TG_ID){ toast('Открой через Telegram'); return; }
  const services = await api(`/api/services/my/?telegram_id=${CURRENT_TG_ID}`);

  $content.innerHTML = `
    ${headerHTML('Услуги и слоты')}
    <div class="cb-wrap">
      <div class="booking-item">
        <label>Новая услуга</label>
        <input id="svcName" class="input" placeholder="Например: Стрижка">
        <button id="svcCreate" class="tg-btn" style="margin-top:8px">Создать</button>
      </div>
      <div id="svcList" style="margin-top:10px"></div>
    </div>
  `;
  mountHeaderBack();

  $id('svcCreate').onclick = async ()=>{
    const name = $id('svcName').value.trim();
    if (!name) return toast('Название обязательно');
    await api('/api/services/create_by_master/', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ telegram_id: CURRENT_TG_ID, name })
    });
    toast('Услуга добавлена'); showServicesManager();
  };

  const list = $id('svcList');
  if (!services.length){ list.innerHTML = '<div class="booking-item">Пока нет услуг</div>'; return; }
  list.innerHTML = '';
  services.forEach(s=>{
    const el = document.createElement('div'); el.className = 'booking-item';
    el.innerHTML = `<b>${esc(s.name)}</b><br><button class="backbtn" data-id="${s.id}" style="margin-top:6px">Слоты</button>`;
    list.appendChild(el);
  });
  list.querySelectorAll('[data-id]').forEach(b=> b.onclick = ()=> navigate(()=>showSlotsManager(Number(b.dataset.id))));
}

async function showSlotsManager(serviceId){
  const slots = await api(`/api/slots/for_service/?service=${serviceId}`);

  $content.innerHTML = `
    ${headerHTML('Слоты услуги')}
    <div class="cb-wrap">
      <div class="booking-item">
        <label>Добавить одиночный слот</label>
        <input id="oneDT" class="input" type="datetime-local">
        <button id="oneAdd" class="tg-btn" style="margin-top:8px">Добавить</button>
      </div>

      <div class="booking-item" style="margin-top:10px">
        <label><b>Массовая генерация</b></label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <input id="gStart" type="date" class="input">
          <input id="gEnd"   type="date" class="input">
          <input id="gTimes" type="text" class="input" placeholder="напр. 10:00, 11:30, 15:00">
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

      <h3 style="color:#fff;margin:12px 0 6px">Слоты</h3>
      <div id="slotList"></div>
    </div>
  `;
  mountHeaderBack();

  $id('oneAdd').onclick = async ()=>{
    const v = $id('oneDT').value; if(!v) return toast('Укажи дату/время');
    await api('/api/slots/', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ service: serviceId, time: new Date(v).toISOString() })
    });
    toast('Слот добавлен'); showSlotsManager(serviceId);
  };

  $id('gRun').onclick = async ()=>{
    const start = $id('gStart').value, end = $id('gEnd').value, timesStr = $id('gTimes').value;
    if (!start || !end || !timesStr) return toast('Заполни все поля генерации');
    const times = timesStr.split(',').map(s=>s.trim()).filter(Boolean);
    const weekdays = Array.from(document.querySelectorAll('.gDay:checked')).map(i=>Number(i.value));
    await api('/api/slots/bulk_generate/', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ service: serviceId, start_date:start, end_date:end, times, weekdays })
    });
    toast('Слоты созданы'); showSlotsManager(serviceId);
  };

  const list = $id('slotList');
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
  list.querySelectorAll('[data-id]').forEach(b=>{
    b.onclick = async ()=>{
      await api(`/api/slots/${b.dataset.id}/`, { method:'DELETE' });
      toast('Удалено'); showSlotsManager(serviceId);
    };
  });
}

async function showCalendar(year, month){
  if (!CURRENT_TG_ID){ toast('Открой через Telegram'); return; }
  const now = new Date();
  year  = year  || now.getFullYear();
  month = month || (now.getMonth()+1);

  const data = await api(`/api/slots/calendar/?telegram_id=${CURRENT_TG_ID}&year=${year}&month=${month}`);
  const days = data.days || [];

  $content.innerHTML = `
    ${headerHTML('Календарь')}
    <div class="cb-wrap">
      <div class="booking-item" style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <button id="calPrev" class="backbtn">←</button>
        <div><b>${year}</b> • <b>${String(month).padStart(2,'0')}</b></div>
        <button id="calNext" class="backbtn">→</button>
      </div>
      <div id="grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:10px"></div>
      <div id="dayBox" class="booking-item" style="margin-top:12px; display:none"></div>
    </div>
  `;
  mountHeaderBack();
  $id('calPrev').onclick = ()=>{ let y=year, m=month-1; if(m<1){m=12;y--;} showCalendar(y,m); };
  $id('calNext').onclick = ()=>{ let y=year, m=month+1; if(m>12){m=1;y++;} showCalendar(y,m); };

  const grid = $id('grid');
  days.forEach(d=>{
    const el = document.createElement('div');
    el.className = 'booking-item';
    el.innerHTML = `<div style="font-weight:700">${d.date.slice(-2)}</div>
                    <div style="font-size:12px;margin-top:4px">🟢 ${d.free} &nbsp; 🔴 ${d.busy}</div>`;
    el.style.cursor='pointer';
    el.onclick = ()=> showDay(d);
    grid.appendChild(el);
  });

  async function showDay(d){
    const box = $id('dayBox'); box.style.display='block';
    const iso = d.date; const pretty = iso.split('-').reverse().join('.');

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;color:#fff">День: ${pretty}</h3>
        <button id="dayHide" class="backbtn">Скрыть</button>
      </div>
      <div class="booking-item" style="margin-top:8px">
        <label>Добавить слот</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <select id="svcSel" class="input" style="min-width:160px"></select>
          <input id="timeInp" class="input" type="time" value="10:00">
          <button id="addSlot" class="tg-btn">Добавить</button>
        </div>
      </div>
      <div id="slotsList" style="margin-top:8px"></div>
    `;
    $id('dayHide').onclick = ()=>{ box.style.display='none'; };

    const services = await api(`/api/services/my/?telegram_id=${CURRENT_TG_ID}`);
    const sel = $id('svcSel');
    sel.innerHTML = services.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');

    renderSlots(d.slots);

    $id('addSlot').onclick = async ()=>{
      const svc = Number(sel.value);
      const timeHHMM = $id('timeInp').value;
      if (!svc || !timeHHMM) return toast('Заполни услугу и время');
      await api('/api/slots/', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ service: svc, time: new Date(`${iso}T${timeHHMM}:00`).toISOString() })
      });
      toast('Слот добавлен'); showCalendar(year, month);
      setTimeout(async ()=>{
        const fresh = await api(`/api/slots/calendar/?telegram_id=${CURRENT_TG_ID}&year=${year}&month=${month}`);
        const nd = (fresh.days||[]).find(x=>x.date===iso) || {slots:[]};
        showDay(nd);
      }, 50);
    };
  }

  function renderSlots(slots){
    const list = $id('slotsList');
    if (!slots?.length){ list.innerHTML='<div class="booking-item">Слоты отсутствуют</div>'; return; }
    list.innerHTML='';
    slots.sort((a,b)=> new Date(a.time)-new Date(b.time));
    slots.forEach(s=>{
      const el = document.createElement('div'); el.className='booking-item';
      el.innerHTML = `
        ${new Date(s.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
        • ${esc(s.service)} • ${s.is_booked ? 'занят' : 'свободен'}
        ${s.is_booked ? '' : `<button class="backbtn" data-id="${s.id}" style="float:right">Удалить</button>`}
      `;
      list.appendChild(el);
    });
    list.querySelectorAll('[data-id]').forEach(b=>{
      b.onclick = async ()=>{
        await api(`/api/slots/${b.dataset.id}/`, {method:'DELETE'});
        toast('Удалено'); b.closest('.booking-item')?.remove();
      };
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHome);
} else {
  initHome();
}

window.navigate = navigate;
window.showBookings = showBookings;
window.showProfile = showProfile;
window.showServicesManager = showServicesManager;
window.showCalendar = showCalendar;

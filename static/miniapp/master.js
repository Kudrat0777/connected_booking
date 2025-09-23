const $id = (s)=>document.getElementById(s);
const $content = $id('content');
const $loader  = $id('loader');
const $toast   = $id('toast');
const $home    = $id('homePanel');
const $appArea = $id('appArea');

function showLoading(on=true){ if($loader) $loader.style.display = on ? 'flex' : 'none'; }
function toast(text, ms=1800){ if(!$toast) return; $toast.textContent = text; $toast.style.display='block'; setTimeout(()=>{$toast.style.display='none'}, ms); }
async function api(url, init){
  try{
    showLoading(true);
    const r = await fetch(url, init);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json().catch(()=> ({}));
  }catch(e){ console.error(e); toast('Ошибка сети'); throw e; }
  finally{ showLoading(false); }
}
function esc(s=''){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&gt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m]) ); }

let tgUser = null;
try{
  const TG = window.Telegram?.WebApp;
  if (TG){ TG.ready?.(); TG.expand?.(); tgUser = TG.initDataUnsafe?.user || null; }
}catch{}

function rawIdFromInitData(){
  try{
    const raw = window.Telegram?.WebApp?.initData || '';
    const m = raw.match(/user=([^&]+)/);
    return m ? (JSON.parse(decodeURIComponent(m[1]))?.id || null) : null;
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
    const top = ViewStack[ViewStack.length - 1];
    top && top();
  } else {
    $appArea.style.display = 'none';
    $home.style.display = 'flex';
  }
}

function headerHTML(title){
  return `
    <div class="cb-header">
      <div class="cb-header__row">
        <button class="cb-back" id="cbBack">←</button>
        <h2 class="cb-title">${esc(title)}</h2>
      </div>
      <div class="cb-sep"></div>
    </div>`;
}
function mountHeaderBack(){ const b = $id('cbBack'); if (b) b.onclick = goBackOrHome; }

async function initHome(){
  const logo = $id('masterLogo');
  const nameEl = $id('masterName');
  if (tgUser?.first_name){
    nameEl.textContent = `${tgUser.first_name} ${tgUser.last_name||''}`.trim();
    logo.textContent = (tgUser.first_name[0] || 'M').toUpperCase();
  }

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
      const probableName = tgUser ? `${tgUser.first_name||''} ${tgUser.last_name||''}`.trim() : '';
      if (probableName){
        await api('/api/masters/register/', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ name: probableName, telegram_id: CURRENT_TG_ID })
        });
      }
    }
  }catch(_){}

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
  const tap = (btn, fn)=>{
    btn.addEventListener('click', ()=>{
      btn.style.transform='scale(0.97)';
      setTimeout(()=>btn.style.transform='', 120);
      fn();
    });
  };
  document.querySelectorAll('[data-act="appointments"]').forEach(b=> tap(b, ()=>navigate(()=>showBookings('today',''))));
  document.querySelectorAll('[data-act="profile"]').forEach(b=> tap(b, ()=>navigate(showProfile)));
  document.querySelectorAll('[data-act="services"]').forEach(b=> tap(b, ()=>navigate(showServicesManager)));
  document.querySelectorAll('[data-act="calendar"]').forEach(b=> tap(b, ()=>navigate(showCalendar)));
}

async function showBookings(period='today', status=''){
  if (!CURRENT_TG_ID){ toast('Открой через Telegram'); return; }

  $content.innerHTML = `
    ${headerHTML('Записи')}
    <div class="cb-wrap">
      <div class="booking-item">
        <div class="filters-tabs">
          <button class="filter-tab" data-filter="today">Сегодня</button>
          <button class="filter-tab" data-filter="tomorrow">Завтра</button>
          <button class="filter-tab" data-filter="week">Неделя</button>
          <button class="filter-tab" data-filter="month">Месяц</button>
          <button class="filter-tab" data-filter="all">Все</button>
        </div>

        <div class="stats-grid-3">
          <div class="stat-card">
            <div class="stat-number confirmed" id="confirmedCount">0</div>
            <div class="stat-label">Подтверждено</div>
          </div>
          <div class="stat-card">
            <div class="stat-number pending" id="pendingCount">0</div>
            <div class="stat-label">Ожидает</div>
          </div>
          <div class="stat-card">
            <div class="stat-number rejected" id="rejectedCount">0</div>
            <div class="stat-label">Отклонено</div>
          </div>
        </div>

        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px">
          <span style="opacity:.8;font-size:13px">Статус:</span>
          <button class="backbtn" data-status="">Все</button>
          <button class="backbtn" data-status="pending">Ожидание</button>
          <button class="backbtn" data-status="confirmed">Подтверждено</button>
          <button class="backbtn" data-status="rejected">Отклонено</button>

          <button id="addBookingBtn" class="tg-btn" style="margin-left:auto">+ Новая запись</button>
        </div>
      </div>

      <div id="appointmentsList" class="appointments-list" style="margin-top:10px"></div>

      <div id="emptyState" class="empty-state" style="display:none">
        <div class="empty-icon">📅</div>
        <div class="empty-title">Нет записей</div>
        <div class="empty-subtitle">На выбранный период записей не найдено</div>
      </div>
    </div>`;
  mountHeaderBack();
  $id('addBookingBtn').onclick = ()=> navigate(showManualBooking);

  const statusText = (st)=> st==='pending'?'Ожидает':(st==='confirmed'?'Подтверждено':'Отклонено');
  const initials = (name)=> String(name||'').split(' ').map(n=>n[0]||'').join('').toUpperCase().slice(0,2) || 'CL';

  const tabs = [...document.querySelectorAll('.filter-tab')];
  const setActiveTab = (key)=>{
    tabs.forEach(t=> t.classList.toggle('active', t.dataset.filter===key));
  };
  setActiveTab(period);

  const buildQuery = ()=>{
    const q = new URLSearchParams({ telegram_id: CURRENT_TG_ID });
    if (['today','tomorrow','week'].includes(period)) q.set('period', period);
    if (status) q.set('status', status);
    return q;
  };
  const resp = await api(`/api/bookings/for_master/?${buildQuery().toString()}`);
  const itemsRaw = resp.items || resp || [];
  let items = itemsRaw;

  const summary = resp.summary || (()=>{
    const s = {confirmed:0,pending:0,rejected:0};
    items.forEach(i=> s[i.status] = (s[i.status]||0)+1);
    s.total = items.length; return s;
  })();
  $id('confirmedCount').textContent = summary.confirmed ?? 0;
  $id('pendingCount').textContent   = summary.pending ?? 0;
  $id('rejectedCount').textContent  = summary.rejected ?? 0;

  const listEl = $id('appointmentsList');
  const emptyEl = $id('emptyState');
  const render = ()=>{
    const filtered = status ? items.filter(a=>a.status===status) : items;

    listEl.innerHTML = '';
    if (!filtered.length){
      listEl.style.display='none';
      emptyEl.style.display='block';
      return;
    }
    listEl.style.display='flex';
    emptyEl.style.display='none';

    filtered.forEach((a, idx)=>{
      const card = document.createElement('div');
      card.className = `appointment-card ${a.status}`;
      card.style.animationDelay = `${idx*0.05}s`;
      card.innerHTML = `
        <div class="appointment-status status-${a.status}">${statusText(a.status)}</div>

        <div class="appointment-header">
          <div class="client-avatar">${initials(a.name || a.clientName)}</div>
          <div class="appointment-info">
            <div class="client-name">${esc(a.name || a.clientName || 'Клиент')}</div>
            <div class="appointment-service">${esc(a.slot?.service?.name || a.service || '—')}</div>
            <div class="appointment-time">${a.slot ? new Date(a.slot.time).toLocaleString() : (esc(a.time||'—'))}</div>
          </div>
        </div>

        ${a.status==='pending' ? `
        <div class="appointment-actions">
          <button class="action-button accept-button" data-accept="${a.id}">Принять</button>
          <button class="action-button reject-button" data-reject="${a.id}">Отклонить</button>
        </div>` : ``}
      `;
      listEl.appendChild(card);
    });

    listEl.querySelectorAll('[data-accept]').forEach(btn=>{
      btn.onclick = async ()=>{
        await api(`/api/bookings/${btn.dataset.accept}/confirm/`, {method:'POST'});
        toast('Подтверждено');
        showBookings(period, status);
      };
    });
    listEl.querySelectorAll('[data-reject]').forEach(btn=>{
      btn.onclick = async ()=>{
        await api(`/api/bookings/${btn.dataset.reject}/reject/`, {method:'POST'});
        toast('Отклонено');
        showBookings(period, status);
      };
    });
  };
  render();

  tabs.forEach(t=>{
    t.addEventListener('click', ()=>{
      period = t.dataset.filter;
      setActiveTab(period);
      showBookings(period, status);
    });
  });

  document.querySelectorAll('[data-status]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      status = btn.dataset.status;
      showBookings(period, status);
    });
  });
}

async function showManualBooking(){
  if (!CURRENT_TG_ID){ toast('Открой через Telegram'); return; }

  let services = [];
  try { services = await api(`/api/services/my/?telegram_id=${CURRENT_TG_ID}`); } catch(_){ services = []; }

  $content.innerHTML = `
    ${headerHTML('Новая запись')}
    <div class="cb-wrap">
      <div class="booking-item">
        <div style="display:grid;gap:10px">
          <div>
            <label>Имя клиента</label>
            <input id="nbFirst" class="input" type="text" placeholder="Иван">
          </div>
          <div>
            <label>Фамилия клиента</label>
            <input id="nbLast" class="input" type="text" placeholder="Иванов">
          </div>
          <div>
            <label>Категория (услуга)</label>
            <select id="nbService" class="input">
              ${services.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
            </select>
          </div>

          <div id="nbSlotWrap">
            <label>Свободный слот</label>
            <select id="nbSlot" class="input"><option value="">Загрузка…</option></select>
            <div id="nbNoSlots" style="display:none;opacity:.8;margin-top:6px">
              Нет свободных слотов. Можно <button id="nbAddOneBtn" class="backbtn">добавить слот</button>.
            </div>
          </div>

          <div id="nbAddOnePanel" class="booking-item" style="display:none">
            <b>Добавить одиночный слот</b>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
              <input id="nbOneDT" class="input" type="datetime-local">
              <button id="nbOneAdd" class="tg-btn">Добавить слот</button>
              <button id="nbOneCancel" class="backbtn">Отмена</button>
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
            <button id="nbCreate" class="tg-btn">Создать запись</button>
            <button id="nbCancel" class="backbtn">Отмена</button>
          </div>
        </div>
      </div>
    </div>
  `;
  mountHeaderBack();

  const $svc = $id('nbService');
  const $slot = $id('nbSlot');
  const $no  = $id('nbNoSlots');
  const $addPanel = $id('nbAddOnePanel');

  // Загрузка свободных слотов по услуге
  async function loadFreeSlots(serviceId){
    $slot.innerHTML = `<option value="">Загрузка…</option>`;
    $no.style.display = 'none';

    let slots = [];
    try { slots = await api(`/api/slots/?service=${serviceId}`); } catch(_){ slots = []; }
    const free = (slots||[]).filter(s=>!s.is_booked);

    if (!free.length){
      $slot.innerHTML = `<option value="">Нет свободных слотов</option>`;
      $no.style.display = 'block';
    } else {
      $slot.innerHTML = free
        .sort((a,b)=> new Date(a.time)-new Date(b.time))
        .map(s=>`<option value="${s.id}">${new Date(s.time).toLocaleString()}</option>`)
        .join('');
    }
  }

  // первичная загрузка
  if (services.length){
    loadFreeSlots(services[0].id);
  }

  $svc.onchange = ()=> loadFreeSlots(Number($svc.value));

  $id('nbAddOneBtn')?.addEventListener('click', ()=> { $addPanel.style.display='block'; });
  $id('nbOneCancel')?.addEventListener('click', ()=> { $addPanel.style.display='none'; });

  // добавить один слот
  $id('nbOneAdd').onclick = async ()=>{
    const dt = $id('nbOneDT').value;
    const sid = Number($svc.value);
    if (!sid){ toast('Выберите услугу'); return; }
    if (!dt){ toast('Укажите дату и время'); return; }

    try{
      await api('/api/slots/', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ service: sid, time: new Date(dt).toISOString() })
      });
      toast('Слот добавлен');
      $addPanel.style.display='none';
      await loadFreeSlots(sid);
    }catch(_){ toast('Ошибка добавления слота'); }
  };

  // создать запись
  $id('nbCreate').onclick = async ()=>{
    const first = $id('nbFirst').value.trim();
    const last  = $id('nbLast').value.trim();
    const name  = (first || last) ? `${first} ${last}`.trim() : '';
    const slotId= Number($slot.value);

    if (!name){ toast('Введите имя клиента'); return; }
    if (!slotId){ toast('Выберите слот'); return; }

    try{
      await api('/api/bookings/', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          slot_id: slotId,
          name: name,
          // telegram_id и прочее не передаём — это «ручная» запись
        })
      });
      toast('Запись создана');
      navigate(()=> showBookings('today','')); // вернёмся к списку
    }catch(e){
      toast('Не удалось создать запись');
    }
  };

  $id('nbCancel').onclick = goBackOrHome;
}

async function showProfile(){
  if (!CURRENT_TG_ID){ toast('Открой через Telegram'); return; }

  let v = {};
  try{ v = await api(`/api/masters/me/?telegram_id=${CURRENT_TG_ID}`); }catch{}
  let st = { total_bookings: 0, experience_years: v.experience_years||0 };
  try{ st = await api(`/api/masters/stats/?telegram_id=${CURRENT_TG_ID}`);}catch{}

  const displayName = v.name || 'Мастер';
  const initials = (displayName||'M').trim().split(/\s+/).map(x=>x[0]||'').join('').toUpperCase().slice(0,2) || 'M';
  const avatarBg = v.avatar_url ? `background-image:url('${v.avatar_url}');background-size:cover;background-position:center;` : '';

  $content.innerHTML = `
    ${headerHTML('Мой профиль')}
    <div class="cb-wrap">

      <div class="booking-item" style="text-align:center;padding:24px 16px">
        <div style="width:100px;height:100px;border-radius:50%;margin:0 auto 12px;
            background:linear-gradient(135deg,#2f7de7,#5BA3F5);position:relative;box-shadow:0 8px 32px rgba(51,144,236,.3);${avatarBg}">
          ${v.avatar_url ? '' : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:36px;color:#fff">${initials}</div>`}
          <label for="pAvatarFile" title="Изменить фото"
            style="position:absolute;right:0;bottom:0;width:32px;height:32px;border-radius:50%;
                   background:#4CAF50;border:3px solid #121a24;display:flex;align-items:center;justify-content:center;
                   font-size:14px;color:#fff;cursor:pointer">📷</label>
          <input id="pAvatarFile" type="file" accept="image/*" style="display:none">
        </div>
        <div style="font-size:22px;font-weight:800;margin-top:6px" id="displayName">${esc(displayName)}</div>
        <div style="opacity:.85;font-size:14px;margin-top:4px">${esc(v.bio ? v.bio.split('\n')[0] : 'Мастер сервиса')}</div>

        <!-- мини-рейтинги из макета (пока статично) -->
        <div style="display:flex;justify-content:center;gap:8px;color:#FF9800;margin-top:8px">
          <span>⭐</span><span>4.9</span><span style="opacity:.9">(127 отзывов)</span>
        </div>
      </div>

      <div class="booking-item" style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-color:transparent">
        <div style="text-align:center;font-weight:800;margin-bottom:10px">Статистика</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center">
          <div><div style="font-size:22px;font-weight:800">${st.total_bookings||0}</div><div style="opacity:.9;font-size:12px">Записей</div></div>
          <div><div style="font-size:22px;font-weight:800">98%</div><div style="opacity:.9;font-size:12px">Рейтинг</div></div>
          <div><div style="font-size:22px;font-weight:800" id="statYears">${st.experience_years||0}</div><div style="opacity:.9;font-size:12px">Года</div></div>
        </div>
      </div>

      <div class="booking-item">
        <div style="display:grid;gap:10px">
          <div>
            <label>Имя и фамилия</label>
            <input id="pName" class="input" type="text" value="${esc(v.name||'')}" disabled>
          </div>

          <div>
            <label>Описание</label>
            <textarea id="pBio" class="input" rows="4" disabled>${esc(v.bio||'')}</textarea>
          </div>

          <div style="display:grid;gap:10px;grid-template-columns:1fr">
            <div>
              <label>Номер телефона</label>
              <input id="pPhone" class="input" type="tel" value="${esc(v.phone||'')}" disabled>
            </div>
            <div>
              <label>Email</label>
              <input id="pEmail" class="input" type="email" value="${esc(v.email||'')}" placeholder="name@example.com" disabled>
            </div>
            <div>
              <label>Опыт (годы)</label>
              <input id="pExp" class="input" type="number" min="0" value="${Number(v.experience_years||0)}" disabled>
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
            <button id="pEdit" class="tg-btn">Редактировать</button>
            <button id="pSave" class="tg-btn" style="display:none">Сохранить</button>
            <button id="pCancel" class="backbtn" style="display:none">Отмена</button>
          </div>
        </div>
      </div>

    </div>
  `;
  mountHeaderBack();

  const inputs = ['pName','pBio','pPhone','pEmail','pExp'].map($id);
  const enable = (on)=> inputs.forEach(el=> el && (el.disabled = !on));
  let snapshot = null;

  $id('pEdit').onclick = ()=>{
    snapshot = {
      name:$id('pName').value, bio:$id('pBio').value,
      phone:$id('pPhone').value, email:$id('pEmail').value,
      exp:$id('pExp').value
    };
    enable(true);
    $id('pEdit').style.display='none';
    $id('pSave').style.display='';
    $id('pCancel').style.display='';
    $id('pName').focus();
  };

  $id('pCancel').onclick = ()=>{
    if (snapshot){
      $id('pName').value  = snapshot.name;
      $id('pBio').value   = snapshot.bio;
      $id('pPhone').value = snapshot.phone;
      $id('pEmail').value = snapshot.email;
      $id('pExp').value   = snapshot.exp;
    }
    enable(false);
    $id('pEdit').style.display='';
    $id('pSave').style.display='none';
    $id('pCancel').style.display='none';
    $id('displayName').textContent = $id('pName').value || 'Мастер';
  };

  $id('pSave').onclick = async ()=>{
    const payload = {
      telegram_id: CURRENT_TG_ID,
      name:  $id('pName').value.trim(),
      bio:   $id('pBio').value.trim(),
      phone: $id('pPhone').value.trim(),
      email: $id('pEmail').value.trim(),
      experience_years: Number($id('pExp').value||0)
    };
    if (!payload.name){ toast('Имя обязательно'); return; }
    try{
      const res = await api('/api/masters/me_update/', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      toast('Сохранено');
      enable(false);
      $id('pEdit').style.display='';
      $id('pSave').style.display='none';
      $id('pCancel').style.display='none';
      $id('displayName').textContent = res.name || payload.name;
      $id('statYears').textContent = res.experience_years ?? payload.experience_years;
    }catch(_){ toast('Ошибка сохранения'); }
  };

  $id('pAvatarFile').addEventListener('change', async (ev)=>{
    const file = ev.target.files?.[0];
    if (!file) return;
    try{
      const fd = new FormData();
      fd.append('telegram_id', CURRENT_TG_ID);
      fd.append('avatar', file);
      const r = await fetch('/api/masters/upload_avatar/', { method:'POST', body: fd });
      if (!r.ok) throw new Error('upload fail');
      const data = await r.json();
      toast('Аватар обновлён');
      // перерисуем профиль, чтобы подтянулся новый avatar_url
      showProfile();
    }catch(_){ toast('Не удалось загрузить фото'); }
  });
}

// ==== Мои услуги (с модалками создания услуги и добавления слотов) ====
async function showServicesManager(){
  if (!CURRENT_TG_ID){ toast('Открой через Telegram'); return; }

  // тянем услуги мастера
  let services = [];
  try{ services = await api(`/api/services/my/?telegram_id=${CURRENT_TG_ID}`); }
  catch(_){ services = []; }

  // UI
  $content.innerHTML = `
    ${headerHTML('Мои услуги')}
    <div class="cb-wrap">

      <div class="add-service-card">
        <h3 class="add-service-title">Добавить новую услугу</h3>
        <button class="add-service-button" id="btnOpenAddService">+ Создать услугу</button>
      </div>

      <div id="svcList" class="services-list"></div>
      <div id="svcEmpty" class="booking-item" style="display:none;text-align:center;opacity:.8">
        <div style="font-size:36px">✨</div>
        <div style="font-weight:800;margin-top:4px">Пока нет услуг</div>
        <div style="font-size:13px;opacity:.85">Добавьте первую услугу, чтобы начать принимать записи</div>
      </div>
    </div>

    <!-- Модалка: новая услуга -->
    <div id="addServiceModal" class="modal">
      <div class="modal-content">
        <div class="modal-title">Новая услуга</div>
        <div class="form-group">
          <label class="form-label">Название услуги</label>
          <input id="mSvcName" class="form-input" placeholder="Например: Стрижка мужская">
        </div>
        <div class="form-group">
          <label class="form-label">Цена (₽)</label>
          <input id="mSvcPrice" class="form-input" type="number" placeholder="1500">
        </div>
        <div class="form-group">
          <label class="form-label">Длительность (мин)</label>
          <input id="mSvcDuration" class="form-input" type="number" placeholder="60">
        </div>
        <div class="modal-actions">
          <button class="modal-button secondary-button" id="mSvcCancel">Отмена</button>
          <button class="modal-button primary-button" id="mSvcCreate">Добавить</button>
        </div>
      </div>
    </div>

    <!-- Модалка: добавить слот -->
    <div id="addSlotModal" class="modal">
      <div class="modal-content">
        <div class="modal-title">Добавить слот</div>
        <div class="form-group">
          <label class="form-label">Время начала</label>
          <input id="mSlotTime" class="form-input" type="time" value="10:00">
        </div>
        <div class="form-group">
          <label class="form-label">Дни недели</label>
          <select id="mSlotDays" class="form-input">
            <option value="">Выберите дни</option>
            <option value="weekdays">Будни (Пн–Пт)</option>
            <option value="weekends">Выходные (Сб–Вс)</option>
            <option value="all">Все дни</option>
            <option value="monday">Понедельник</option>
            <option value="tuesday">Вторник</option>
            <option value="wednesday">Среда</option>
            <option value="thursday">Четверг</option>
            <option value="friday">Пятница</option>
            <option value="saturday">Суббота</option>
            <option value="sunday">Воскресенье</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="modal-button secondary-button" id="mSlotCancel">Отмена</button>
          <button class="modal-button primary-button" id="mSlotAdd">Добавить</button>
        </div>
      </div>
    </div>
  `;
  mountHeaderBack();

  const svcList  = document.getElementById('svcList');
  const svcEmpty = document.getElementById('svcEmpty');
  const addServiceModal = document.getElementById('addServiceModal');
  const addSlotModal    = document.getElementById('addSlotModal');

  let currentServiceId = null;

  const getServiceIcon = (name='')=>{
    if (name.includes('Стрижка')) return '✂️';
    if (name.includes('Окраш'))  return '🎨';
    if (name.includes('Маник'))  return '💅';
    if (name.includes('Педик'))  return '🦶';
    if (name.includes('Массаж')) return '💆';
    return '✨';
  };

  const render = ()=>{
    svcList.innerHTML = '';
    if (!services?.length){
      svcEmpty.style.display = 'block';
      return;
    }
    svcEmpty.style.display = 'none';

    services.forEach((s, idx)=>{
      const slotsHTML = Array.isArray(s.slots) && s.slots.length
        ? s.slots.map(sl=>`<span class="slot-tag">${esc(sl)}</span>`).join('')
        : `<div class="no-slots">Слоты не добавлены</div>`;

      const card = document.createElement('div');
      card.className = 'service-card';
      card.style.animationDelay = `${idx*0.05}s`;
      card.innerHTML = `
        <div class="service-menu">
          <button class="menu-button" data-del="${s.id}" title="Удалить">⋮</button>
        </div>

        <div class="service-header">
          <div class="service-icon">${getServiceIcon(s.name)}</div>
          <div class="service-info">
            <div class="service-name">${esc(s.name)}</div>
            <div class="service-details">
              <span>${s.price ? esc(s.price)+' ₽' : '— ₽'}</span>
              <span>${s.duration ? esc(s.duration)+' мин' : '— мин'}</span>
            </div>
          </div>
        </div>

        <div class="service-actions">
          <div class="slots-title">Доступные слоты:</div>
          <div class="slots-list">${slotsHTML}</div>
          <button class="add-slot-button" data-addslot="${s.id}">+ Добавить слот</button>
        </div>
      `;
      svcList.appendChild(card);
    });

    // удаление услуги (если у тебя есть эндпоинт DELETE /api/services/{id}/)
    svcList.querySelectorAll('[data-del]').forEach(btn=>{
      btn.onclick = async ()=>{
        const id = Number(btn.dataset.del);
        const svc = services.find(x=>x.id===id);
        if (!svc) return;
        if (!confirm(`Удалить услугу "${svc.name}"?`)) return;
        try{
          await api(`/api/services/${id}/`, { method:'DELETE' });
        }catch(_){ /* если не поддерживается — молчим */ }
        // локально уберём
        services = services.filter(x=>x.id!==id);
        render();
        toast('Услуга удалена');
      };
    });

    // открыть модалку добавления слота
    svcList.querySelectorAll('[data-addslot]').forEach(btn=>{
      btn.onclick = ()=>{
        currentServiceId = Number(btn.dataset.addslot);
        openModal(addSlotModal);
      };
    });
  };

  render();

  // ====== модалки ======
  function openModal(m){ m?.classList.add('active'); }
  function closeModal(m){ m?.classList.remove('active'); }

  document.getElementById('btnOpenAddService').onclick = ()=> openModal(addServiceModal);
  document.getElementById('mSvcCancel').onclick = ()=> closeModal(addServiceModal);
  document.getElementById('mSlotCancel').onclick = ()=> closeModal(addSlotModal);

  // клик вне контента — закрыть
  [addServiceModal, addSlotModal].forEach(m=>{
    m.addEventListener('click', (e)=>{ if(e.target===m) closeModal(m); });
  });

  // создать услугу
  document.getElementById('mSvcCreate').onclick = async ()=>{
    const name = document.getElementById('mSvcName').value.trim();
    const price = Number(document.getElementById('mSvcPrice').value || 0);
    const duration = Number(document.getElementById('mSvcDuration').value || 0);
    if (!name) return toast('Название обязательно');

    // твой бек точно принимает name + telegram_id; price/duration можно передать — если лишнее, он проигнорирует
    await api('/api/services/create_by_master/', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ telegram_id: CURRENT_TG_ID, name, price, duration })
    });
    toast('Услуга добавлена');
    closeModal(addServiceModal);

    // перезагрузим список
    try{ services = await api(`/api/services/my/?telegram_id=${CURRENT_TG_ID}`); } catch(_){}
    render();
  };

  // добавить слоты
  document.getElementById('mSlotAdd').onclick = async ()=>{
    if (!currentServiceId) return;
    const time = document.getElementById('mSlotTime').value;
    const days = document.getElementById('mSlotDays').value;
    if (!time || !days) return toast('Заполните время и дни');

    // сопоставим выбранные дни к массиву weekday (0=Пн ... 6=Вс) для bulk_generate
    const mapDays = {
      weekdays:[0,1,2,3,4],
      weekends:[5,6],
      all:[0,1,2,3,4,5,6],
      monday:[0], tuesday:[1], wednesday:[2], thursday:[3],
      friday:[4], saturday:[5], sunday:[6],
    };
    const weekdays = mapDays[days] || [];

    // Сгенерируем слоты на ближайшие 30 дней (можно поменять на другой период)
    const start = new Date();                             // сегодня
    const end   = new Date(Date.now() + 30*86400000);     // +30 дней
    const startISO = start.toISOString().slice(0,10);
    const endISO   = end.toISOString().slice(0,10);

    try{
      await api('/api/slots/bulk_generate/', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          service: currentServiceId,
          start_date: startISO,
          end_date: endISO,
          times: [time],          // один тайм из модалки
          weekdays                // массив дней недели
        })
      });
      toast('Слоты созданы');
    }catch(_){ toast('Ошибка создания слотов'); }

    closeModal(addSlotModal);

    // подтянем обновлённые услуги (чтобы перечень «слотов» в карточке тоже обновился)
    try{ services = await api(`/api/services/my/?telegram_id=${CURRENT_TG_ID}`); } catch(_){}
    render();
  };
}

async function showCalendar(year, month){
  if (!CURRENT_TG_ID){ toast('Открой через Telegram'); return; }
  const now = new Date();
  year  = year  || now.getFullYear();
  month = month || (now.getMonth()+1);

  const data = await api(`/api/slots/calendar/?telegram_id=${CURRENT_TG_ID}&year=${year}&month=${month}`);
  const days = data.days || [];

  const dayByIso = Object.fromEntries(days.map(d => [d.date, d]));

  $content.innerHTML = `
    ${headerHTML('Календарь')}
    <div class="cb-wrap">
      <div class="cal-nav">
        <div class="cal-nav__row">
          <button id="calPrev" class="cal-nav__btn">←</button>
          <div class="cal-nav__title" id="calTitle"></div>
          <button id="calNext" class="cal-nav__btn">→</button>
        </div>
      </div>

      <div class="cal-card">
        <div class="cal-week">
          <div class="cal-week__cell">Пн</div>
          <div class="cal-week__cell">Вт</div>
          <div class="cal-week__cell">Ср</div>
          <div class="cal-week__cell">Чт</div>
          <div class="cal-week__cell">Пт</div>
          <div class="cal-week__cell">Сб</div>
          <div class="cal-week__cell">Вс</div>
        </div>
        <div id="calGrid" class="cal-grid"></div>
        <div class="cal-legend">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="cal-dot" style="background:#2f7de7"></span><span>Сегодня</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="cal-dot" style="background:#49d27a"></span><span>Есть слоты</span>
          </div>
        </div>
      </div>
    </div>

    <div id="dayModal" class="m-modal">
      <div class="m-card">
        <div class="m-head">
          <div class="m-title">Управление слотами</div>
          <button class="m-close" id="mClose">×</button>
        </div>

        <div class="m-body">
          <div class="m-datebox">
            <div id="mDateNum" class="m-date-num">15</div>
            <div id="mDateTxt" class="m-date-txt">15 декабря 2024, понедельник</div>
          </div>
        </div>

        <div class="m-body">
          <label class="m-label">⏰ <b>Добавить слот</b></label>
          <div class="m-form">
            <div class="row">
              <input id="mTime" type="time" class="m-input">
              <select id="mService" class="m-select">
                <option value="">Загрузка услуг…</option>
              </select>
            </div>
            <button id="mAdd" class="m-btn">Добавить слот</button>
          </div>
        </div>

        <div class="m-body">
          <label class="m-label">📅 <b>Слоты на этот день</b></label>
          <div id="mList" class="m-list"></div>
        </div>
      </div>
    </div>
  `;
  mountHeaderBack();

  const RU_MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  const title = `${RU_MONTHS[month-1][0].toUpperCase()+RU_MONTHS[month-1].slice(1)} ${year}`;
  document.getElementById('calTitle').textContent = title;

  document.getElementById('calPrev').onclick = ()=>{ let y=year, m=month-1; if(m<1){m=12;y--;} showCalendar(y,m); };
  document.getElementById('calNext').onclick = ()=>{ let y=year, m=month+1; if(m>12){m=1;y++;} showCalendar(y,m); };

  const grid = document.getElementById('calGrid');
  renderGrid(grid, year, month, dayByIso);

  const modal     = document.getElementById('dayModal');
  const mCloseBtn = document.getElementById('mClose');
  const mTime     = document.getElementById('mTime');
  const mService  = document.getElementById('mService');
  const mAdd      = document.getElementById('mAdd');
  const mList     = document.getElementById('mList');
  const mDateNum  = document.getElementById('mDateNum');
  const mDateTxt  = document.getElementById('mDateTxt');
  let selectedISO = null;
  let services    = [];

  try{ services = await api(`/api/services/my/?telegram_id=${CURRENT_TG_ID}`) || []; }
  catch(_){ services = []; }
  mService.innerHTML = `<option value="">Выберите услугу</option>` +
    services.map(s=> `<option value="${s.id}">${esc(s.name||'Без названия')}</option>`).join('');

  function openModalForDate(iso){
    selectedISO = iso;
    const d = new Date(iso+'T00:00:00');
    const dow = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'][d.getDay()];
    mDateNum.textContent = String(d.getDate());
    mDateTxt.textContent = `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${dow}`;

    renderDaySlots(iso);
    modal.classList.add('show');
  }
  function closeModal(){
    modal.classList.remove('show');
    selectedISO = null;
    mTime.value = '';
    mService.value = '';
  }
  mCloseBtn.onclick = closeModal;
  modal.addEventListener('click', (e)=>{ if(e.target===modal) closeModal(); });

  async function renderDaySlots(iso){
    const day = dayByIso[iso] || {slots:[]};
    const list = (day.slots||[]).slice().sort((a,b)=> new Date(a.time) - new Date(b.time));
    if (!list.length){
      mList.innerHTML = `<div class="m-item"><div class="m-item__info" style="opacity:.75">Слотов нет</div></div>`;
      return;
    }
    mList.innerHTML = '';
    list.forEach(s=>{
      const timeStr = new Date(s.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      const el = document.createElement('div');
      el.className = 'm-item';
      el.innerHTML = `
        <div class="m-item__info">${timeStr} • ${esc(s.service||'Услуга')} • ${s.is_booked?'занят':'свободен'}</div>
        ${s.is_booked ? '' : `<button class="m-del" data-id="${s.id}">Удалить</button>`}
      `;
      mList.appendChild(el);
    });
    mList.querySelectorAll('.m-del').forEach(btn=>{
      btn.onclick = async ()=>{
        try{
          await api(`/api/slots/${btn.dataset.id}/`, {method:'DELETE'});
          toast('Удалено');
          // обновим месяц и модалку
          const fresh = await api(`/api/slots/calendar/?telegram_id=${CURRENT_TG_ID}&year=${year}&month=${month}`);
          fresh.days?.forEach(d=> dayByIso[d.date]=d);
          renderGrid(grid, year, month, dayByIso);
          renderDaySlots(iso);
        }catch(_){ toast('Ошибка удаления'); }
      };
    });
  }

  mAdd.onclick = async ()=>{
    if (!selectedISO) return;
    const svc  = Number(mService.value||0);
    const hhmm = (mTime.value||'').trim();
    if (!svc || !hhmm){ toast('Укажите время и услугу'); return; }
    try{
      await api('/api/slots/', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          service_id: svc,
          time: new Date(`${selectedISO}T${hhmm}:00`).toISOString()
        })
      });
      toast('Слот добавлен');
      const fresh = await api(`/api/slots/calendar/?telegram_id=${CURRENT_TG_ID}&year=${year}&month=${month}`);
      fresh.days?.forEach(d=> dayByIso[d.date]=d);
      renderGrid(grid, year, month, dayByIso);
      renderDaySlots(selectedISO);
      mTime.value=''; mService.value='';
    }catch(_){ toast('Ошибка создания'); }
  };

  function renderGrid(container, y, m, byIso){
    container.innerHTML = '';
    const first = new Date(y, m-1, 1);
    const last  = new Date(y, m, 0);
    const daysInMonth = last.getDate();
    // monday-first offset
    let start = first.getDay() - 1; if (start < 0) start = 6;

    const prevLast = new Date(y, m-1, 0).getDate();
    for (let i = start-1; i >= 0; i--){
      const d = document.createElement('div');
      d.className = 'day-cell day--other';
      d.textContent = String(prevLast - i);
      container.appendChild(d);
    }

    const todayKey = new Date().toISOString().slice(0,10);
    for (let day=1; day<=daysInMonth; day++){
      const iso = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const d = document.createElement('div');
      const has = (byIso[iso]?.free || 0) + (byIso[iso]?.busy || 0) > 0;
      const isToday = (iso===todayKey);
      d.className = `day-cell${isToday?' day--today':''}${has?' day--has':''}`;
      d.textContent = String(day);
      d.onclick = ()=> openModalForDate(iso);
      container.appendChild(d);
    }

    const rem = 42 - container.children.length;
    for (let i=1; i<=rem; i++){
      const d = document.createElement('div');
      d.className = 'day-cell day--other';
      d.textContent = String(i);
      container.appendChild(d);
    }
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

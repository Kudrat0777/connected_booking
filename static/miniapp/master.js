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

  // 1) Подтянем услуги мастера
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

  // при смене услуги — заново подтягиваем слоты
  $svc.onchange = ()=> loadFreeSlots(Number($svc.value));

  // показать/скрыть панель быстрого добавления одиночного слота
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
      await loadFreeSlots(sid); // обновим список слотов
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
    </div>`;
  mountHeaderBack();
  $id('pCancel').onclick = goBackOrHome;

  $id('pSave').onclick = async ()=>{
    const payload = {
      telegram_id: CURRENT_TG_ID,
      name:  $id('pName').value.trim(),
      bio:   $id('pBio').value.trim(),
      phone: $id('pPhone').value.trim(),
      avatar_url: $id('pAvatar').value.trim()
    };
    if (!payload.name){ toast('Имя обязательно'); return; }
    try{
      await api('/api/masters/me_update/', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      toast('Сохранено'); showProfile();
    }catch{}
  };
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

      <h3 style="color:#fff;margin:12px 0 8px">Слоты</h3>
      <div id="slotList"></div>
    </div>`;
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
    </div>`;
  mountHeaderBack();
  $id('calPrev').onclick = ()=>{ let y=year, m=month-1; if(m<1){m=12;y--;} showCalendar(y,m); };
  $id('calNext').onclick = ()=>{ let y=year, m=month+1; if(m>12){m=1;y++;} showCalendar(y,m); };

  const grid = $id('grid'); grid.innerHTML='';
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
      <div id="slotsList" style="margin-top:8px"></div>`;
    $id('dayHide').onclick = ()=>{ box.style.display='none'; };

    const services = await api(`/api/services/my/?telegram_id=${CURRENT_TG_ID}`);
    $id('svcSel').innerHTML = services.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');

    renderSlots(d.slots);

    $id('addSlot').onclick = async ()=>{
      const svc = Number($id('svcSel').value);
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
      }, 60);
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

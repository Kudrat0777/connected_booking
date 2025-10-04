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

async function api(url, init, {allow404=false, fallback=null} = {}) {
  try {
    showLoading(true);
    const r = await fetch(url, init);
    const text = await r.text(); // пробуем распарсить, даже если не ok
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!r.ok) {
      // мягкая обработка 404, когда это не критично
      if (allow404 && r.status === 404) return fallback ?? (Array.isArray(fallback) ? [] : (fallback ?? {}));
      // пробрасываем понятную ошибку
      const err = new Error(`HTTP ${r.status} for ${url}`);
      err.status = r.status;
      err.body = data;
      throw err;
    }
    return data;
  } catch (e) {
    console.error('[API ERROR]', e);
    // показываем осмысленный тост (коротко), но не заспамим
    const code = e?.status ? ` (${e.status})` : '';
    toast(`Ошибка сети${code}`);
    throw e;
  } finally {
    showLoading(false);
  }
}

async function safeGet(url, fallback) {
  try { return await api(url, undefined, {allow404:true, fallback}); }
  catch { return fallback; }
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

let masterId = null, serviceId = null, slotId = null;
let masterObj = null, serviceObj = null, slotObj = null;

async function showMasterPublicProfile(id){
  const mid = id ?? masterId;

  $content.innerHTML = `
    <div class="cb-header">
      <div class="cb-header__row">
        <button class="cb-back" id="cbBack">←</button>
        <h2 class="cb-title">Профиль мастера</h2>
      </div>
      <div class="cb-sep"></div>
    </div>

    <div class="mp-wrap">
      <section class="mp-card mp-head">
        <div class="mp-ava" id="mpAva"></div>
        <div class="mp-head-info">
          <div class="mp-name" id="mpName">Мастер</div>
          <div class="mp-sub"  id="mpSub">Специалист</div>
          <div class="mp-rating" id="mpRating">
            <span class="stars">★★★★★</span>
            <span class="mp-rating-num" id="mpRatingNum">—</span>
            <span class="mp-rev-count" id="mpRevCount"></span>
          </div>
          <div class="mp-online" id="mpOnline"><span class="dot"></span> Онлайн</div>
        </div>
      </section>

      <section class="mp-card" id="mpBioBox" style="display:none">
        <p class="mp-bio" id="mpBio"></p>
      </section>

      <section class="mp-card mp-stats" id="mpStats" style="display:none">
        <div class="mp-stat"><div class="mp-stat-value" id="mpYears">—</div><div class="mp-stat-label">лет опыта</div></div>
        <div class="mp-stat"><div class="mp-stat-value" id="mpClients">—</div><div class="mp-stat-label">клиентов</div></div>
        <div class="mp-stat"><div class="mp-stat-value" id="mpSatisfy">—</div><div class="mp-stat-label">довольных</div></div>
      </section>

      <section class="mp-card" id="mpPortfolio" style="display:none">
        <div class="mp-sec-title">📸 Портфолио работ</div>
        <div class="mp-grid" id="mpGrid"></div>
      </section>

      <section class="mp-card" id="mpServices" style="display:none">
        <div class="mp-sec-title">💅 Услуги и цены</div>
        <div id="mpSvcList" class="mp-svcs"></div>
      </section>

      <section class="mp-card" id="mpFastSlots" style="display:none">
        <div class="mp-sec-title">🗓 Ближайшие слоты</div>
        <div id="mpSlotsWrap" class="mp-slots"></div>
      </section>

      <section class="mp-card" id="mpAbout" style="display:none">
        <div class="mp-sec-title">ℹ️ О мастере</div>
        <div class="mp-about">
          <div id="mpEduBox" style="display:none">
            <div class="mp-subtitle">Образование и сертификаты</div>
            <ul id="mpEdu" class="mp-ul"></ul>
          </div>
          <div id="mpSpecBox" style="display:none">
            <div class="mp-subtitle">Специализация</div>
            <div id="mpSpecs" class="mp-chips"></div>
          </div>
          <div id="mpHoursBox" style="display:none">
            <div class="mp-subtitle">Рабочие часы</div>
            <div id="mpHours" class="mp-hours"></div>
          </div>
        </div>
      </section>

      <section class="mp-card" id="mpReviews" style="display:none">
        <div class="mp-sec-title">💬 Отзывы клиентов</div>
        <div id="mpRevList" class="mp-reviews"></div>
        <button id="mpMoreReviews" class="mp-more-btn" style="display:none">Показать ещё отзывы</button>
      </section>

      <div class="mp-fab">
        <button class="mp-call" id="mpCall" title="Позвонить">📞</button>
        <button class="mp-book" id="mpBook">Записаться</button>
      </div>
    </div>

    <div id="lb" class="lb" style="display:none">
      <div class="lb-backdrop" id="lbClose"></div>
      <img class="lb-img" id="lbImg" alt="">
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  if (!document.getElementById('mp-css')) {
    const css = `
    .mp-wrap{padding:12px;display:grid;gap:10px}
    .mp-card{background:#0f1720;border:1px solid #1e2a36;border-radius:16px;padding:14px;color:#d8e1ea}
    .mp-head{display:flex;gap:12px;align-items:flex-start;background:linear-gradient(180deg,#0f1720,#0b131b)}
    .mp-ava{width:72px;height:72px;border-radius:50%;background:#2b4f88;display:flex;align-items:center;justify-content:center;
      font-weight:800;color:#fff;background-size:cover;background-position:center}
    .mp-name{font-size:20px;font-weight:800;color:#f2f7ff}
    .mp-sub{opacity:.8;margin-top:2px}
    .mp-rating{display:flex;align-items:center;gap:8px;margin-top:6px}
    .mp-rating .stars{color:#f5c84b}
    .mp-online{margin-top:4px;display:flex;align-items:center;gap:6px;color:#7ce38b}
    .mp-online .dot{width:8px;height:8px;border-radius:50%;background:#2ecc71}
    .mp-bio{line-height:1.45;color:#c8d3df}
    .mp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center}
    .mp-stat-value{font-size:22px;font-weight:800;color:#fff}
    .mp-stat-label{font-size:12px;opacity:.8}
    .mp-sec-title{font-weight:800;color:#eaf2ff;margin-bottom:10px}
    .mp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
    .mp-ph{width:100%;aspect-ratio:1/1;border-radius:12px;background:#1a2531;background-size:cover;background-position:center;border:1px solid #223142;cursor:zoom-in}
    .mp-svcs{display:grid;gap:8px}
    .mp-svc{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;padding:12px;border:1px solid #223142;border-radius:12px;background:#0c141d;cursor:pointer}
    .mp-svc-name{font-weight:700;color:#f6fbff}
    .mp-svc-desc{font-size:12px;opacity:.8;margin-top:2px;max-width:220px}
    .mp-svc-right{text-align:right}
    .mp-svc-price{font-weight:800}
    .mp-svc-dur{font-size:12px;opacity:.8}
    .mp-about .mp-subtitle{font-weight:700;margin:10px 0 6px 0;color:#f0f6ff}
    .mp-ul{padding-left:0;list-style:none}
    .mp-ul li{opacity:.9;margin:4px 0}
    .mp-chips{display:flex;flex-wrap:wrap;gap:6px}
    .chip{font-size:12px;padding:6px 10px;border-radius:999px;background:#13202c;border:1px solid #223142}
    .mp-hours{display:grid;gap:4px}
    .mp-hours-row{display:flex;justify-content:space-between;opacity:.9}
    .mp-reviews{display:grid;gap:8px}
    .mp-review{background:#0c141d;border:1px solid #223142;border-radius:12px;padding:10px}
    .mp-rev-head{display:flex;align-items:center;gap:10px}
    .mp-rev-ava{width:32px;height:32px;border-radius:50%;background:#2b4f88;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
    .mp-rev-meta{flex:1}
    .mp-rev-name{font-weight:700}
    .mp-rev-stars{color:#f5c84b;font-size:12px}
    .mp-rev-date{font-size:12px;opacity:.7}
    .mp-rev-text{margin-top:6px;line-height:1.4}
    .mp-more-btn{margin-top:10px;width:100%;border-radius:10px;padding:10px 12px;background:#13202c;border:1px solid #223142;color:#eaf2ff;font-weight:600}
    .mp-more-btn:hover{background:#162633}
    .mp-fab{position:sticky;bottom:12px;display:flex;justify-content:center;gap:10px}
    .mp-call{width:44px;height:44px;border-radius:999px;background:#16a34a;color:#fff;border:0}
    .mp-book{border-radius:999px;padding:12px 18px;background:#2563eb;border:0;color:#fff;font-weight:700}
    @media(min-width:480px){ .mp-grid{grid-template-columns:repeat(3,1fr)} }

    .lb{position:fixed;inset:0;z-index:1000}
    .lb-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.8)}
    .lb-img{position:absolute;max-width:92vw;max-height:92vh;top:50%;left:50%;transform:translate(-50%,-50%);border-radius:12px}
    `;
    const style = document.createElement('style'); style.id = 'mp-css'; style.textContent = css;
    document.head.appendChild(style);
  }

  const absUrl = (u)=> !u ? "" : /^https?:\/\//i.test(u) ? u : new URL(u, location.origin).href;

  let master={}, services=[], portfolio=[], schedule=[];
  let reviewsState = { items: [], next: 0, total: 0, loading: false };

  try{ master    = await api(`/api/masters/${mid}/`); }catch(_){}
  try{ services  = await api(`/api/services/?master=${mid}`) || []; }catch(_){}
  try{ portfolio = await api(`/api/portfolio/?master=${mid}`) || []; }catch(_){}
  try{ schedule  = await api(`/api/masters/${mid}/work_hours/`) || []; }catch(_){}

let fast = { items: [] };
try { fast = await api(`/api/masters/${mid}/next_slots/?days=7&limit=24`) || {items:[]}; } catch(_){}

if (Array.isArray(fast.items) && fast.items.length){
  const mapServiceById = new Map((services||[]).map(s => [s.id, s]));
  const $wrap = document.getElementById('mpSlotsWrap');

  fast.items.forEach(s => {
    const when = new Date(s.time);
    const hhmm = when.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const ddmm = when.toLocaleDateString('ru-RU', {day:'2-digit', month:'short'});
    const chip = document.createElement('div');
    chip.className = 'slot-chip';
    chip.innerHTML = `${hhmm}<small>${ddmm}</small>`;
    chip.addEventListener('click', () => {
      slotId  = s.id;
      slotObj = {
        id: s.id,
        time: s.time,
        is_booked: s.is_booked,
        service: s.service,
      };
      serviceId  = s.service?.id;
      serviceObj = mapServiceById.get(serviceId) || s.service || { id: serviceId, name: 'Услуга' };
      masterObj  = master;

      navigate(confirmBooking);
    });
    $wrap.appendChild(chip);
  });

  document.getElementById('mpFastSlots').style.display = 'block';
}
  const $ava = document.getElementById('mpAva');
  if (master?.avatar_url){ $ava.style.backgroundImage = `url('${master.avatar_url}')`; }
  else { $ava.textContent = (master?.name||'M').trim().slice(0,2).toUpperCase(); }

  document.getElementById('mpName').textContent = master?.name || 'Мастер';
  document.getElementById('mpSub').textContent =
    master?.title
    || master?.profession
    || (Array.isArray(master?.specializations) && master.specializations.length
          ? master.specializations.map(s => (typeof s === "string" ? s : s.name)).join(", ")
          : "Специалист");

  const rating   = Number(master?.rating || 0) || 0;
  const revCount = Number(master?.reviews_count || 0) || 0;
  document.getElementById('mpRatingNum').textContent = rating ? rating.toFixed(1) : '—';
  document.getElementById('mpRevCount').textContent  = `(${revCount} отзывов)`;
  document.getElementById('mpOnline').style.display  = (master?.online===false) ? 'none' : 'flex';

  if (master?.bio){ document.getElementById('mpBio').textContent = master.bio; document.getElementById('mpBioBox').style.display='block'; }
  const exp = Number(master?.experience_years||0);
  const clients = Number(master?.clients_count||0);
  if (exp || clients || rating){
    document.getElementById('mpYears').textContent   = exp ? `${exp}+` : '—';
    document.getElementById('mpClients').textContent = clients ? `${clients}` : '—';
    document.getElementById('mpSatisfy').textContent = rating ? `${Math.round((rating/5)*100)}%` : '98%';
    document.getElementById('mpStats').style.display = 'grid';
  }

  if (Array.isArray(portfolio) && portfolio.length){
    const grid = document.getElementById('mpGrid');
    portfolio.slice(0, 8).forEach(p=>{
      const url = p.image_url || p.image || p.url || p.photo_url || "";
      const item = document.createElement('div');
      item.className = 'mp-ph';
      if (url) {
        const full = absUrl(url);
        item.style.backgroundImage = `url('${full}')`;
        item.addEventListener('click', ()=> openLB(full));
      }
      grid.appendChild(item);
    });
    document.getElementById('mpPortfolio').style.display='block';
  }

  if (Array.isArray(services) && services.length){
    const box = document.getElementById('mpSvcList');
    services.forEach(s=>{
      const price = (s.price ?? 0);
      const dur   = (s.duration ?? 0);
      const el = document.createElement('div');
      el.className = 'mp-svc';
      el.innerHTML = `
        <div class="mp-svc-left">
          <div class="mp-svc-name">${s.name||'Услуга'}</div>
          <div class="mp-svc-desc">${s.description||''}</div>
        </div>
        <div class="mp-svc-right">
          <div class="mp-svc-price">${price?`${price} ₽`:'— ₽'}</div>
          <div class="mp-svc-dur">${dur?`${dur} мин`:'0 мин'}</div>
        </div>`;
      el.onclick = ()=>{ serviceId = s.id; serviceObj=s; navigate(showSlots); };
      box.appendChild(el);
    });
    document.getElementById('mpServices').style.display='block';
  }

  const edu = master?.education || master?.certificates || [];
  const specs = master?.specializations || [];
  if ((edu && edu.length) || (specs && specs.length) || (schedule && schedule.length)){
    if (edu && edu.length){
      const ul = document.getElementById('mpEdu');
      (Array.isArray(edu)?edu:[edu]).forEach(e=>{
        const li=document.createElement('li'); li.textContent = `• ${typeof e==='string'?e:(e.title||e.name||e.caption||'Сертификат')}`;
        ul.appendChild(li);
      });
      document.getElementById('mpEduBox').style.display='block';
    }
    if (specs && specs.length){
      const cont = document.getElementById('mpSpecs');
      specs.forEach(s=>{
        const chip=document.createElement('span'); chip.className='chip';
        chip.textContent = (typeof s==='string'?s:(s.name||'Специализация'));
        cont.appendChild(chip);
      });
      document.getElementById('mpSpecBox').style.display='block';
    }
    if (schedule && schedule.length){
      const box = document.getElementById('mpHours');
      schedule.forEach(row=>{
        const line=document.createElement('div'); line.className='mp-hours-row';
        const closed = row.is_closed ? 'Выходной' : `${row.open||'—'} - ${row.close||'—'}`;
        line.innerHTML = `<span>${row.day_ru||row.day||''}</span><span>${closed}</span>`;
        box.appendChild(line);
      });
      document.getElementById('mpHoursBox').style.display='block';
    }
    document.getElementById('mpAbout').style.display='block';
  }

  const $revBox  = document.getElementById('mpReviews');
  const $revList = document.getElementById('mpRevList');
  const $moreBtn = document.getElementById('mpMoreReviews');

  async function loadReviews(offset=0){
    if (reviewsState.loading) return;
    reviewsState.loading = true;
    try{
      const r = await api(`/api/reviews/paged/?master=${mid}&limit=3&offset=${offset}`);
      const items = r.items || [];
      reviewsState.items.push(...items);
      reviewsState.total = r.total ?? reviewsState.total;
      reviewsState.next  = (r.next_offset ?? null);

      items.forEach(addReviewCard);
      $revBox.style.display = 'block';
      $moreBtn.style.display = reviewsState.next != null ? 'block' : 'none';
    }catch(_){}
    finally{ reviewsState.loading = false; }
  }

  function addReviewCard(r){
    const el = document.createElement('div');
    el.className='mp-review';
    const name = r.author_name || r.user || 'Клиент';
    const starsN = Math.max(1,Math.min(5,Number(r.rating||r.stars||5)));
    const stars  = '★★★★★'.slice(0,starsN) + '☆☆☆☆☆'.slice(starsN);
    el.innerHTML = `
      <div class="mp-rev-head">
        <div class="mp-rev-ava">${(name||'')[0]?.toUpperCase()||'К'}</div>
        <div class="mp-rev-meta">
          <div class="mp-rev-name">${name}</div>
          <div class="mp-rev-stars">${stars}</div>
        </div>
        <div class="mp-rev-date">${r.created_at? new Date(r.created_at).toLocaleDateString('ru-RU'):''}</div>
      </div>
      <div class="mp-rev-text">${r.text||r.comment||''}</div>`;
    $revList.appendChild(el);
  }

  $moreBtn.addEventListener('click', ()=> {
    if (reviewsState.next != null) loadReviews(reviewsState.next);
  });

  await loadReviews(0);

  document.getElementById('mpBook').onclick = ()=> navigate(showServices);
  document.getElementById('mpCall').onclick = ()=>{
    const tel = master?.phone || '+7 (999) 123-45-67';
    try{ window.location.href = `tel:${tel.replace(/[^\d+]/g,'')}`; }catch(_){ toast(`Телефон: ${tel}`); }
  };

  function openLB(src){ const lb=document.getElementById('lb'); document.getElementById('lbImg').src=src; lb.style.display='block'; }
  document.getElementById('lbClose').addEventListener('click', ()=>{ document.getElementById('lb').style.display='none'; });
  document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') document.getElementById('lb').style.display='none'; });
}

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
    card.onclick = ()=>{
        masterId = m.id;
        masterObj = m;
        navigate(()=> showMasterPublicProfile(m.id));
    };
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

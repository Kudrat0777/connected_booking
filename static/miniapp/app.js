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

function TG() {
  return (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
}

function applyThemeVars() {
  const tg = TG();
  const tp = tg?.themeParams || {};
  const root = document.documentElement;

  root.setAttribute('data-theme', tg?.colorScheme || 'dark');

  root.style.setProperty('--tg-bg-color', tp.bg_color || '#0e1621');
  root.style.setProperty('--tg-secondary-bg-color', tp.secondary_bg_color || '#0b131b');
  root.style.setProperty('--tg-text-color', tp.text_color || '#e0e9f2');
  root.style.setProperty('--tg-hint-color', tp.hint_color || 'rgba(224,233,242,.65)');
  root.style.setProperty('--tg-link-color', tp.link_color || '#6ab3f3');
  root.style.setProperty('--tg-button-color', tp.button_color || '#2ea6ff');
  root.style.setProperty('--tg-button-text-color', tp.button_text_color || '#ffffff');
  try {
    tg?.setHeaderColor(tg.colorScheme === 'dark' ? '#0e1621' : '#ffffff');
    tg?.setBackgroundColor('secondary_bg_color');
  } catch(_) {}
}
try {
  applyThemeVars();
  TG()?.onEvent('themeChanged', applyThemeVars);
} catch(_) {}

// ===== Базовые DOM-элементы и хелперы =====
const $hero   = document.getElementById('hero');
const $app    = document.getElementById('app-shell');
const $content= document.getElementById('content');
const $loader = document.getElementById('loader');
const $toast  = document.getElementById('toast');

// ===== helpers =====
function showLoading(on=true){ if($loader) $loader.style.display = on ? 'flex' : 'none'; }
function toast(text, ms=1800){ if(!$toast) return; $toast.textContent=text; $toast.style.display='block'; setTimeout(()=>{$toast.style.display='none'}, ms); }

// Нормализует любой «типичный» ответ API к массиву
function toArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  // если пришёл объект — ищем массивы
  if (typeof payload === 'object') {
    // самый частый случай: обёртка во вложенном data
    const data = payload.data && typeof payload.data === 'object' ? payload.data : null;

    // популярные ключи
    const keys = [
      'results', 'items', 'data', 'objects', 'list',
      'masters', 'rows', 'records'
    ];

    for (const obj of [payload, data]) {
      if (!obj) continue;
      for (const k of keys) {
        if (Array.isArray(obj[k])) return obj[k];
      }
      // если не угадали ключ — берём первый массив среди значений
      for (const v of Object.values(obj)) {
        if (Array.isArray(v)) return v;
      }
    }
  }
  return [];
}


// --- HTTP helper (СТАРЫЙ РАБОЧИЙ) ---
async function api(url, init, {allow404=false, fallback=null} = {}) {
  try {
    showLoading(true);
    const r = await fetch(url, init);
    const text = await r.text(); // пробуем распарсить, даже если не ok
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!r.ok) {
      // мягкая обработка 404, когда это не критично
      if (allow404 && r.status === 404) {
        return fallback ?? (Array.isArray(fallback) ? [] : (fallback ?? {}));
      }
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

function mountLottieFromData(data, slotId = 'welcomeSticker') {
  const el = document.getElementById(slotId);
  if (!el || !data) return;
  el.innerHTML = '';
  el.classList.add('is-filled');
  lottie.loadAnimation({
    container: el,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: data
  });
}

function mountWebmToSlot(url, slotId='welcomeSticker'){
  const el = document.getElementById(slotId);
  if (!el || !url) return;
  el.innerHTML = '';
  el.classList.add('is-filled');

  const v = document.createElement('video');
  v.src = url;
  v.autoplay = true;
  v.loop = true;
  v.muted = true;           // обязательно, чтобы автоплей прошёл
  v.playsInline = true;     // iOS
  v.style.width = '100%';
  v.style.height = '100%';
  v.style.objectFit = 'cover';
  el.appendChild(v);
}

async function mountTgsFromUrl(url, slotId='welcomeSticker'){
  try{
    const res = await fetch(url, {cache:'no-store'});
    const buf = await res.arrayBuffer();
    const jsonStr = pako.ungzip(new Uint8Array(buf), {to:'string'});
    const data = JSON.parse(jsonStr);
    mountLottieFromData(data, slotId);
  }catch(e){ console.warn('local .tgs failed', e); }
}

(function initHero(){
  const tg = window.Telegram?.WebApp;
  tg?.ready?.(); tg?.expand?.();

  const u = tg?.initDataUnsafe?.user;
  const t = document.getElementById('welcomeTitle');
  if (t) t.textContent = `Привет, ${u?.first_name || 'Гость'}!`;

  // Прямо грузим локальную утку
  mountTgsFromUrl("/static/miniapp/stickers/hello.tgs", 'welcomeSticker');

  document.getElementById('goBook')?.addEventListener('click', () => startFlow(showMasters));
  document.getElementById('goMy')  ?.addEventListener('click', () => startFlow(showMyBookings));
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
    <div class="tg-header">
      <button class="tg-back" id="cbBack" aria-label="Назад">←</button>
      <div class="tg-title">Профиль мастера</div>
    </div>
    <div class="tg-sep"></div>

    <div class="mp-wrap">
      <section class="mp-card mp-head" role="region" aria-labelledby="mpName">
        <div class="mp-ava" id="mpAva" aria-hidden="true"></div>
        <div class="mp-head-info">
          <div class="mp-name" id="mpName">Мастер</div>
          <div class="mp-sub"  id="mpSub">Специалист</div>
          <div class="mp-rating" id="mpRating" aria-label="Рейтинг">
            <span class="stars" aria-hidden="true">★★★★★</span>
            <span class="mp-rating-num" id="mpRatingNum">—</span>
            <span class="mp-rev-count" id="mpRevCount"></span>
          </div>
          <div class="mp-online" id="mpOnline"><span class="dot" aria-hidden="true"></span><span>Онлайн</span></div>
        </div>
      </section>

      <section class="mp-card" id="mpBioBox" style="display:none">
        <p class="mp-bio" id="mpBio"></p>
      </section>

      <section class="mp-card mp-stats" id="mpStats" style="display:none" aria-label="Статистика">
        <div class="mp-stat"><div class="mp-stat-value" id="mpYears">—</div><div class="mp-stat-label">лет опыта</div></div>
        <div class="mp-stat"><div class="mp-stat-value" id="mpClients">—</div><div class="mp-stat-label">клиентов</div></div>
        <div class="mp-stat"><div class="mp-stat-value" id="mpSatisfy">—</div><div class="mp-stat-label">довольных</div></div>
      </section>

      <section class="mp-card" id="mpPortfolio" style="display:none">
        <div class="mp-sec-title">📸 Портфолио работ</div>
        <div class="mp-grid" id="mpGrid" role="list"></div>
        <button id="mpMorePortfolio" class="mp-more-btn" style="display:none">Показать ещё</button>
      </section>

      <section class="mp-card" id="mpServices" style="display:none">
        <div class="mp-sec-title">💅 Услуги и цены</div>
        <div id="mpSvcList" class="mp-svcs"></div>
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

        <div id="mpRevForm" class="mp-rev-form">
          <label class="sr-only" for="revText">Текст отзыва</label>
          <div class="mp-rev-stars-input" id="revStars" aria-label="Оценка" role="radiogroup">
            <button type="button" data-v="1" role="radio" aria-label="1 звезда">★</button>
            <button type="button" data-v="2" role="radio" aria-label="2 звезды">★</button>
            <button type="button" data-v="3" role="radio" aria-label="3 звезды">★</button>
            <button type="button" data-v="4" role="radio" aria-label="4 звезды">★</button>
            <button type="button" data-v="5" role="radio" aria-label="5 звёзд">★</button>
          </div>
          <textarea id="revText" class="mp-rev-textarea" rows="3" placeholder="Расскажите, как прошёл визит (необязательно)"></textarea>
          <button id="revSubmit" class="mp-more-btn">Оставить отзыв</button>
          <div id="revHint" class="mp-rev-hint" style="display:none"></div>
        </div>
      </section>

      <div class="mp-fab" role="group" aria-label="Действия">
        <button class="mp-call" id="mpCall" title="Позвонить" aria-label="Позвонить мастеру">📞</button>
        <button class="mp-book" id="mpBook" aria-label="Записаться">Записаться</button>
      </div>
    </div>

    <div id="lb" class="lb" hidden>
      <div class="lb-backdrop" id="lbClose" aria-label="Закрыть"></div>
      <img class="lb-img" id="lbImg" alt="Фото из портфолио">
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  const absUrl = (u)=> !u ? "" : /^https?:\/\//i.test(u) ? u : new URL(u, location.origin).href;

  let master={}, services=[], schedule=[];
  try{ master    = await api(`/api/masters/${mid}/`); }catch(_){}
  try{ services  = await api(`/api/services/?master=${mid}`) || []; }catch(_){}
  try{ schedule  = await api(`/api/masters/${mid}/work_hours/`) || []; }catch(_){}

  const $ava = document.getElementById('mpAva');
  if (master?.avatar_url){ $ava.style.backgroundImage = `url('${master.avatar_url}')`; }
  else {
    const initial = (master?.name||'M').trim().split(/\s+/).map(s=>s[0]).join('').toUpperCase().slice(0,2);
    $ava.textContent = initial || 'M';
  }

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
  document.getElementById('mpOnline').style.display  = (master?.online===false) ? 'none' : 'inline-flex';

  if (master?.bio){
    document.getElementById('mpBio').textContent = master.bio;
    document.getElementById('mpBioBox').style.display='block';
  }

  const exp = Number(master?.experience_years||0);
  const clients = Number(master?.clients_count||0);
  if (exp || clients || rating){
    document.getElementById('mpYears').textContent   = exp ? `${exp}+` : '—';
    document.getElementById('mpClients').textContent = clients ? `${clients}` : '—';
    document.getElementById('mpSatisfy').textContent = rating ? `${Math.round((rating/5)*100)}%` : '—';
    document.getElementById('mpStats').style.display = 'grid';
  }

  if (Array.isArray(services) && services.length){
    const box = document.getElementById('mpSvcList');
    services.forEach(s=>{
      const el = document.createElement('div');
      el.className = 'mp-svc';
      el.setAttribute('role','button');
      el.setAttribute('aria-label', `${s.name||'Услуга'}`);
      el.innerHTML = `
        <div class="mp-svc-left">
          <div class="mp-svc-name">${s.name||'Услуга'}</div>
          <div class="mp-svc-desc">${s.description||''}</div>
        </div>
        <div class="mp-svc-right">
          <div class="mp-svc-price">${(s.price ?? 0) ? `${s.price} ₽`:'— ₽'}</div>
          <div class="mp-svc-dur">${(s.duration ?? 0) ? `${s.duration} мин`:'0 мин'}</div>
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
        const li=document.createElement('li');
        li.textContent = `• ${typeof e==='string'?e:(e.title||e.name||e.caption||'Сертификат')}`;
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

  const $grid = document.getElementById('mpGrid');
  const $morePF = document.getElementById('mpMorePortfolio');
  let pfOffset = 0, pfLimit = 8, pfTotal = 0, pfLoading = false;

  async function loadPortfolio(){
    if (pfLoading) return;
    pfLoading = true;
    try{
      const r = await api(`/api/portfolio/?master=${mid}&limit=${pfLimit}&offset=${pfOffset}`);
      const items = r.items || [];
      pfTotal = r.total ?? pfTotal;
      items.forEach(p=>{
        const url = p.image_url || p.image || p.url || p.photo_url || "";
        const item = document.createElement('div');
        item.className = 'mp-ph';
        item.setAttribute('role','img');
        item.setAttribute('aria-label','Фото работы');
        if (url){
          const full = absUrl(url);
          item.style.backgroundImage = `url('${full}')`;
          item.addEventListener('click', ()=> openLB(full));
        }
        $grid.appendChild(item);
      });
      document.getElementById('mpPortfolio').style.display='block';
      pfOffset += items.length;
      $morePF.style.display = (pfOffset < (pfTotal||0)) ? 'block' : 'none';
    }catch(_){}
    finally{ pfLoading = false; }
  }
  $morePF.addEventListener('click', loadPortfolio);
  await loadPortfolio();

  const $revBox  = document.getElementById('mpReviews');
  const $revList = document.getElementById('mpRevList');

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
          <div class="mp-rev-stars" aria-label="Оценка: ${starsN} из 5">${stars}</div>
        </div>
        <div class="mp-rev-date">${r.created_at? new Date(r.created_at).toLocaleDateString('ru-RU'):''}</div>
      </div>
      <div class="mp-rev-text">${r.text||r.comment||''}</div>`;
    $revList.appendChild(el);
  }

  try{
    const initial = await api(`/api/reviews/?master=${mid}&limit=3`);
    if (Array.isArray(initial) && initial.length){
      initial.forEach(addReviewCard);
      $revBox.style.display = 'block';
    } else {
      $revBox.style.display = 'block';
    }
  }catch(_){}

  const $revStarsBox = document.getElementById('revStars');
  const $revText     = document.getElementById('revText');
  const $revSubmit   = document.getElementById('revSubmit');
  const $revHint     = document.getElementById('revHint');

  let revRating = 5;
  function updateStarsUI(val){
    Array.from($revStarsBox.querySelectorAll('button')).forEach(btn=>{
      const v = Number(btn.dataset.v||0);
      btn.classList.toggle('active', v <= val);
      btn.setAttribute('aria-checked', String(v === val));
    });
  }
  updateStarsUI(revRating);

  $revStarsBox.addEventListener('click', (e)=>{
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    revRating = Number(b.dataset.v||5);
    updateStarsUI(revRating);
  });

  $revSubmit.addEventListener('click', async ()=>{
    if (!tgUser?.id){
      toast('Откройте через Telegram, чтобы оставить отзыв');
      return;
    }
    const payload = {
      master: mid,
      rating: revRating,
      text: ($revText.value||'').trim(),
      author_name: (window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name || 'Клиент'),
      telegram_id: tgUser.id
    };
    $revSubmit.disabled = true; $revHint.style.display = 'none';
    try{
      const r = await api('/api/reviews/add/', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const first = document.createElement('div');
      const name = r.author_name || 'Клиент';
      const sn = Math.max(1,Math.min(5,Number(r.rating||5)));
      const st = '★★★★★'.slice(0,sn) + '☆☆☆☆☆'.slice(sn);
      first.className='mp-review';
      first.innerHTML = `
        <div class="mp-rev-head">
          <div class="mp-rev-ava">${(name||'')[0]?.toUpperCase()||'К'}</div>
          <div class="mp-rev-meta">
            <div class="mp-rev-name">${name}</div>
            <div class="mp-rev-stars" aria-label="Оценка: ${sn} из 5">${st}</div>
          </div>
          <div class="mp-rev-date">${r.created_at? new Date(r.created_at).toLocaleDateString('ru-RU'): new Date().toLocaleDateString('ru-RU')}</div>
        </div>
        <div class="mp-rev-text">${r.text||''}</div>`;
      $revList.prepend(first);

      const numEl = document.getElementById('mpRevCount');
      if (numEl){
        const m = (numEl.textContent||'').match(/\d+/);
        const cur = m ? Number(m[0]) : 0;
        numEl.textContent = `(${cur+1} отзывов)`;
      }

      $revText.value = '';
      revRating = 5; updateStarsUI(revRating);
      $revHint.textContent = 'Спасибо! Ваш отзыв добавлен.'; $revHint.style.display='block';
    }catch(_){
      $revHint.textContent = 'Не удалось отправить отзыв. Возможна причина: не было прошедшей записи.';
      $revHint.style.display = 'block';
    }finally{
      $revSubmit.disabled = false;
    }
  });

  document.getElementById('mpBook').onclick = ()=> navigate(showServices);
  document.getElementById('mpCall').onclick = ()=>{
    const tel = master?.phone || '+7 (999) 123-45-67';
    try{ window.location.href = `tel:${tel.replace(/[^\d+]/g,'')}`; }catch(_){ toast(`Телефон: ${tel}`); }
  };

  function openLB(src){
    const lb=document.getElementById('lb'); const img=document.getElementById('lbImg');
    img.src=src; lb.removeAttribute('hidden');
  }
  document.getElementById('lbClose').addEventListener('click', ()=>{
    document.getElementById('lb').setAttribute('hidden','');
  });
  document.addEventListener('keydown', (e)=>{
    if (e.key==='Escape') document.getElementById('lb').setAttribute('hidden','');
  });
}

async function showMasters(){
  $content.innerHTML = `
    <div class="tg-header">
      <button class="tg-back" id="cbBack" aria-label="Назад">←</button>
      <div class="tg-title">Выбор мастера</div>
    </div>
    <div class="tg-sep"></div>

    <div class="tg-wrap">
      <p class="cb-sub" style="color:var(--tg-theme-hint-color,#6b7280);margin-top:6px">
        Выберите мастера для записи
      </p>

      <div class="ms-search-card">
        <div class="ms-search">
          <span class="ms-i-left" aria-hidden="true">🔍</span>
          <input id="msInput" type="search" autocomplete="off"
                 placeholder="Поиск по имени, услуге или описанию…">
          <span id="msClear" class="ms-i-right" title="Очистить" style="display:none">✕</span>
        </div>
        <div class="ms-meta"><span id="msFound">Найдено: 0</span></div>
      </div>

      <div id="cbLoading" class="cb-loading">
        <div class="cb-spin"></div>
        <div>Загружаем список мастеров…</div>
      </div>

      <div id="cbList" class="tg-list no-frame" style="display:none"></div>

      <div id="emptyState" class="tg-empty" style="display:none">
        <div id="emptyAnim" class="empty-anim" aria-hidden="true"></div>
        <div class="tg-empty-title">Мастеров не найдено</div>
        <div class="tg-empty-sub">Попробуйте изменить запрос</div>
      </div>
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  const starSVG = (type)=> {
    const fill = (type==='full') ? '#f6c453' : (type==='half' ? 'url(#g)' : 'none');
    const stroke = '#e2b13a';
    return `
    <svg viewBox="0 0 24 24" width="16" height="16" style="display:inline-block;vertical-align:-3px">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
          <stop offset="50%" stop-color="#f6c453"/><stop offset="50%" stop-color="transparent"/>
        </linearGradient>
      </defs>
      <path d="M12 2.5l2.9 6 6.6.6-5 4.3 1.5 6.4L12 16.9 5.9 19.8 7.4 13.4 2.4 9.1l6.7-.6L12 2.5z"
            fill="${fill}" stroke="${stroke}" stroke-width="1"/>
    </svg>`;
  };
  const renderStars = (val=0)=>{
    const r = Math.max(0, Math.min(5, Number(val)||0));
    const full = Math.floor(r);
    const half = r - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return `${'x'.repeat(full).split('').map(()=>starSVG('full')).join('')}${
            half?starSVG('half'):''}${
            'x'.repeat(empty).split('').map(()=>starSVG('empty')).join('')}`;
  };
  const specText = (m)=>{
    const arr = Array.isArray(m?.specializations)
      ? m.specializations.map(s=> typeof s==='string'? s : (s.name||'')).filter(Boolean)
      : [];
    const base = arr.length ? arr.join(' • ') : (m.title || m.profession || 'Специалист');
    const exp  = Number(m?.experience_years||0);
    return `${base}${exp?` • ${exp}+ лет`:''}`;
  };
  const norm = s => (s||'').toString().toLowerCase().trim();

  // --- load masters ---
  let raw = [];
  try { raw = await api('/api/masters/?limit=100', undefined, {allow404:true, fallback:[]}); }
  catch { raw = []; }

  const allMasters = toArray(raw);
  const $load  = document.getElementById('cbLoading');
  const $list  = document.getElementById('cbList');
  const $empty = document.getElementById('emptyState');
  const $found = document.getElementById('msFound');
  const $input = document.getElementById('msInput');
  const $clear = document.getElementById('msClear');

  $load.style.display = 'none';

  const renderList = (arr)=>{
    $list.innerHTML = '';
    $found.textContent = `Найдено: ${arr.length}`;
    if (!arr.length){
      $list.style.display = 'none';
      $empty.style.display = 'grid';
      mountTgsFromUrl("/static/miniapp/stickers/duck_crying.tgs", "emptyAnim");
      return;
    }
    $empty.style.display = 'none';
    $list.style.display = 'grid';

    arr.forEach((m, i)=>{
      const name   = m.name || 'Мастер';
      const ava    = m.avatar_url || m.avatar || m.photo_url || '';
      const rating = Number(m.rating ?? m.rating_value ?? 0);
      const revs   = Number(m.reviews_count || 0);

      const cell = document.createElement('div');
      cell.className = 'tg-cell ms-card';
      cell.innerHTML = `
        <div style="display:grid;grid-template-columns:64px 1fr;gap:12px;width:100%">
          <div class="cb-ava" style="
            width:56px;height:56px;border-radius:14px;
            ${ava?`background-image:url('${ava}');background-size:cover;background-position:center;`:
              `display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;
               background:color-mix(in srgb, var(--tg-theme-text-color,#111) 10%, transparent);`}
          ">
            ${ava?'':(initials(name)||'M')}
          </div>

          <div style="min-width:0">
            <div class="tg-name" style="margin-right:110px">${name}</div>
            <div class="tg-sub" style="margin-top:4px">${specText(m)}</div>

            <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
              <span>${renderStars(rating)}</span>
              <span class="tg-sub">(${revs})</span>
            </div>
          </div>
        </div>

        <div class="ms-online">
          <span class="tg-status active" style="padding:6px 10px">
            <span class="dot"></span><span>Онлайн</span>
          </span>
        </div>
      `;

      cell.addEventListener('click', ()=>{
        masterId  = m.id; masterObj = m;
        navigate(()=> showMasterPublicProfile(m.id));
      });

      cell.style.animationDelay = `${i*0.03}s`;
      $list.appendChild(cell);
    });
  };

  renderList(allMasters);

  let timer = null;
  const doFilter = ()=>{
    const q = norm($input.value);
    $clear.style.display = q ? 'grid' : 'none';
    if (!q) { renderList(allMasters); return; }

    const filtered = allMasters.filter(m=>{
      const name = norm(m.name);
      const bio  = norm(m.bio||'');
      const title= norm(m.title||m.profession||'');
      const specs = Array.isArray(m.specializations)
        ? m.specializations.map(s=> typeof s==='string'? s : (s.name||'')).join(' ') : '';
      return [name,bio,title,norm(specs)].some(s => s.includes(q));
    });
    renderList(filtered);
  };

  $input.addEventListener('input', ()=>{
    clearTimeout(timer);
    timer = setTimeout(doFilter, 140);
  });
  $clear.addEventListener('click', ()=>{
    $input.value=''; doFilter(); $input.focus();
  });
}

async function showServices(){
  $content.innerHTML = `
    <div class="tg-header">
      <button class="tg-back" id="cbBack" aria-label="Назад">←</button>
      <div class="tg-title">Выбор услуги</div>
    </div>
    <div class="tg-sep"></div>

    <div class="tg-wrap">
      <p class="cb-sub">Выберите услугу для записи</p>

      <div id="svcLoading" class="cb-loading">
        <div class="cb-spin" aria-hidden="true"></div>
        <div>Загружаем список услуг…</div>
      </div>

      <div id="svcList" class="sv-list is-hidden" role="list"></div>

      <div id="svcEmpty" class="tg-empty is-hidden" role="status" aria-live="polite">
        <div id="emptyAnim" class="empty-anim" aria-hidden="true"></div>
        <div class="tg-empty-title">Услуг пока нет</div>
        <div class="tg-empty-sub">Зайдите позже или выберите другого мастера</div>
      </div>
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  const hide = el => el.classList.add('is-hidden');
  const show = el => el.classList.remove('is-hidden');

  const $loading = document.getElementById('svcLoading');
  const $list    = document.getElementById('svcList');
  const $empty   = document.getElementById('svcEmpty');

  // грузим услуги
  let raw = [];
  try { raw = await api(`/api/services/?master=${masterId}`, undefined, {allow404:true, fallback:[]}); }
  catch { raw = []; }
  const services = toArray(raw);

  hide($loading);

  if (!Array.isArray(services) || services.length === 0){
    show($empty);
    // милый стикер
    mountTgsFromUrl("/static/miniapp/stickers/duck_sad.tgs", "emptyAnim");
    return;
  }

  // хелперы форматирования
  const fmtPrice = (v)=>{
    const n = Number(v || 0);
    if (!n) return '— ₽';
    try{ return new Intl.NumberFormat('ru-RU').format(n) + ' ₽'; }
    catch{ return `${n} ₽`; }
  };
  const fmtDur = (m)=>{
    const n = Number(m || 0);
    return n ? `${n} мин` : '0 мин';
  };

  // рендер списка
  $list.innerHTML = '';
  services.forEach((s)=>{
    const name = s.name || 'Услуга';
    const desc = s.description || '';
    const price= fmtPrice(s.price);
    const dur  = fmtDur(s.duration);

    const cell = document.createElement('div');
    cell.className = 'tg-cell sv-card';
    cell.setAttribute('role','button');
    cell.setAttribute('tabindex','0');
    cell.setAttribute('aria-label', `${name}, ${dur}, ${price}`);

    cell.innerHTML = `
      <div class="sv-main">
        <div class="sv-title">${name}</div>
        ${desc ? `<div class="sv-desc">${desc}</div>` : ``}
        <div class="sv-meta">
          <span class="sv-chip" aria-hidden="true">⏱ ${dur}</span>
          <span class="sv-chip" aria-hidden="true">💵 ${price}</span>
        </div>
      </div>
      <div class="sv-right">
        <div class="sv-price">${price}</div>
        <div class="sv-arrow" aria-hidden="true">→</div>
      </div>
    `;

    const go = ()=>{
      serviceId  = s.id;
      serviceObj = s;
      navigate(showSlots);
    };
    cell.addEventListener('click', go);
    cell.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });

    $list.appendChild(cell);
  });

  show($list);
}


async function showSlots(){
  $content.innerHTML = `
    <div class="tg-header">
      <button class="tg-back" id="cbBack" aria-label="Назад">←</button>
      <div class="tg-title">Выбор времени</div>
    </div>
    <div class="tg-sep"></div>

    <div class="tg-wrap">
      <p class="cb-sub">Выберите удобное время для записи</p>

      <div class="sl-weekbar" aria-label="Навигация по неделям">
        <button class="wk-btn" id="wkPrev" aria-label="Предыдущая неделя">‹</button>
        <div class="wk-label" id="wkLabel">Текущая неделя</div>
        <button class="wk-btn" id="wkNext" aria-label="Следующая неделя">›</button>
      </div>

      <div class="sl-toolbar">
        <div class="sl-seg" role="tablist" aria-label="Фильтр дат">
          <button class="seg-btn" data-mode="today"    role="tab" aria-selected="false">Сегодня</button>
          <button class="seg-btn" data-mode="tomorrow" role="tab" aria-selected="false">Завтра</button>
          <button class="seg-btn is-active" data-mode="all" role="tab" aria-selected="true">Все</button>
        </div>
      </div>

      <div id="slotLoading" class="cb-loading" role="status" aria-live="polite">
        <div class="cb-spin" aria-hidden="true"></div>
        <div>Загружаем доступное время…</div>
      </div>

      <div id="slList" class="sl-list is-hidden"></div>

      <div id="slEmpty" class="tg-empty sl-empty is-hidden" role="status" aria-live="polite">
        <div id="emptyAnim" class="empty-anim" aria-hidden="true"></div>
        <div class="tg-empty-title">Нет свободных слотов</div>
        <div class="tg-empty-sub">Попробуйте выбрать другую услугу или день</div>
      </div>
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  const hide = el => el.classList.add('is-hidden');
  const show = el => el.classList.remove('is-hidden');

  const $loading = document.getElementById('slotLoading');
  const $list    = document.getElementById('slList');
  const $empty   = document.getElementById('slEmpty');
  const $wkPrev  = document.getElementById('wkPrev');
  const $wkNext  = document.getElementById('wkNext');
  const $wkLabel = document.getElementById('wkLabel');
  const segRoot  = document.querySelector('.sl-seg');
  const segBtns  = Array.from(segRoot.querySelectorAll('.seg-btn'));

  const monthsShort = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  const dayNames = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const startOfDay = (d)=>{ const x=new Date(d); x.setHours(0,0,0,0); return x; };
  const startOfWeekMon = (d)=>{
    const x = startOfDay(d);
    const day = x.getDay(); // 0..6 (вс..сб)
    const diff = (day === 0 ? -6 : 1 - day); // сделать понедельник
    x.setDate(x.getDate() + diff);
    return x;
  };
  const addDays = (d, n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  const labelWeek = (ws)=>{
    const we = addDays(ws, 6);
    const sameMonth = ws.getMonth() === we.getMonth();
    const l = `${ws.getDate()}${sameMonth?'':' '+monthsShort[ws.getMonth()]}–${we.getDate()} ${monthsShort[we.getMonth()]}`;
    return l;
  };
  const fmtKey = (ts)=>{ const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  let slots = [];
  try { slots = await api(`/api/slots/?service=${serviceId}`, undefined, {allow404:true, fallback:[]}); }
  catch { slots = []; }

  const now = Date.now();
  const prepared = Array.isArray(slots) ? slots
    .map(s=>{
      const ts = new Date(s.time).getTime();
      return {
        id: s.id,
        time: s.time,
        ts,
        is_booked: !!s.is_booked,
        label: new Date(s.time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})
      };
    })
    .filter(s => Number.isFinite(s.ts) && s.ts >= now - 60*1000)
    : [];

  hide($loading);

  if (!prepared.length){
    show($empty);
    mountTgsFromUrl("/static/miniapp/stickers/duck_sad.tgs", "emptyAnim");
    return;
  }

  const slotById = Object.fromEntries(prepared.map(s => [s.id, s]));
  const groups = {};
  prepared.forEach(s => {
    (groups[fmtKey(s.ts)] ||= []).push(s);
  });
  const keysSorted = Object.keys(groups).sort(); // YYYY-MM-DD

  $list.innerHTML = '';
  const todayKey = fmtKey(Date.now());
  const tomorrowKey = fmtKey(Date.now() + 86400000);

  keysSorted.forEach((key)=>{
    const dt = new Date(key + 'T00:00:00');
    const dd = dt.getDate();
    const dayLabel = (key === todayKey) ? 'Сегодня' : (key === tomorrowKey ? 'Завтра' : dayNames[dt.getDay()]);

    const section = document.createElement('section');
    section.className = 'sl-section';
    section.dataset.key = key;                 // дата секции
    section.dataset.day =
      key === todayKey    ? 'today'    :
      key === tomorrowKey ? 'tomorrow' : 'other';

    const timesHTML = groups[key]
      .sort((a,b)=> a.ts - b.ts)
      .map(s=>{
        const disabled = s.is_booked ? 'disabled' : '';
        const cls = `sl-time${s.is_booked ? ' occupied' : ''}`;
        return `<button type="button" class="${cls}" data-id="${s.id}" ${disabled}
                  aria-label="Время ${s.label}${s.is_booked?' занято':''}">${s.label}</button>`;
      }).join('');

    section.innerHTML = `
      <div class="sl-header">
        <div class="sl-num">${dd}</div>
        <div class="sl-info">
          <div class="sl-day">${dayLabel}</div>
          <div class="sl-month">${monthsShort[dt.getMonth()]}</div>
        </div>
      </div>
      <div class="sl-times">${timesHTML}</div>
    `;

    section.querySelectorAll('.sl-time').forEach(btn=>{
      if (btn.disabled) return;
      btn.addEventListener('click', ()=>{
        btn.style.transform = 'scale(0.98)'; setTimeout(()=> btn.style.transform='', 120);
        slotId  = Number(btn.getAttribute('data-id'));
        slotObj = slotById[slotId];
        navigate(confirmBooking);
      });
    });

    $list.appendChild(section);
  });

  let currentWeekStart = startOfWeekMon(new Date()); // текущее значение
  let selectedMode = 'all'; // today|tomorrow|all

  function setWeek(ws){
    currentWeekStart = startOfWeekMon(ws);
    const text = labelWeek(currentWeekStart);
    $wkLabel.textContent = text;
  }

  function setSeg(mode){
    selectedMode = mode;
    segBtns.forEach(b=>{
      const active = b.dataset.mode === mode;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
  }

  function inCurrentWeek(key){
    const d = new Date(key + 'T00:00:00');
    const ws = startOfWeekMon(currentWeekStart);
    const we = addDays(ws, 6);
    return d >= ws && d <= we;
  }

  function applyFilters(){
    let visible = 0;
    const sections = Array.from($list.children);

    sections.forEach(sec=>{
      const key = sec.dataset.key;
      const weekOK = inCurrentWeek(key);
      const segOK  = (selectedMode === 'all') || (sec.dataset.day === selectedMode);
      const showIt = weekOK && segOK;
      sec.style.display = showIt ? '' : 'none';
      if (showIt) visible++;
    });

    if (visible === 0){
      show($empty);
      if (!document.getElementById('emptyAnim')?.classList.contains('is-filled')){
        mountTgsFromUrl("/static/miniapp/stickers/duck_crying.tgs", "emptyAnim");
      }
    } else {
      hide($empty);
      const firstVis = sections.find(s => s.style.display !== 'none');
      if (firstVis) firstVis.scrollIntoView({block:'start'});
    }
  }

  $wkPrev.addEventListener('click', ()=>{
    setWeek(addDays(currentWeekStart, -7));
    applyFilters();
    if ($empty.classList.contains('is-hidden')) return;
    setSeg('all'); applyFilters();
  });
  $wkNext.addEventListener('click', ()=>{
    setWeek(addDays(currentWeekStart, +7));
    applyFilters();
    if ($empty.classList.contains('is-hidden')) return;
    setSeg('all'); applyFilters();
  });

  segBtns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      setSeg(btn.dataset.mode);
      applyFilters();
      if (!$empty.classList.contains('is-hidden')){ setSeg('all'); applyFilters(); }
    });
  });

  show($list);
  setWeek(new Date());
  setSeg('all');
  applyFilters();
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
    <div class="tg-header">
      <button class="tg-back" id="cbBack" aria-label="Назад">←</button>
      <div class="tg-title">Мои брони</div>
    </div>
    <div class="tg-sep"></div>

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
    mountTgsFromUrl("/static/miniapp/stickers/duck_sad.tgs", "emptyAnim");
    document.getElementById('emptyCta')?.addEventListener('click', () => startFlow(showMasters));
    return;
  }

  const fmtTime  = (d)=> d ? new Date(d).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}) : '';
  const fmtDate  = (d)=> d ? new Date(d).toLocaleDateString('ru-RU',{day:'2-digit', month:'long'}) : '';

  // нормализация статуса
  const classify = (b)=>{
    const raw = (b.status || 'pending').toLowerCase();
    const ts = b.slot?.time ? new Date(b.slot.time).getTime() : 0;
    const inPast = ts && ts < Date.now();

    if (raw === 'rejected') return {key:'rejected', text:'Отклонена'};
    if (raw === 'confirmed') return inPast ? {key:'completed', text:'Выполнена'} : {key:'active', text:'Активна'};
    if (raw === 'pending') return {key:'pending', text:'Ожидает подтверждения'};
    // fallback
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
      cell.style.animationDelay = `${idx * 60}ms`;   // лёгкий «стаггер»

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

window.ViewStack      = ViewStack;
window.navigate       = navigate;
window.showMasters    = showMasters;
window.showMyBookings = showMyBookings;

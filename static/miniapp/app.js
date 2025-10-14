// ===== Работа с Telegram WebApp и темой =====
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
        <button id="mpMorePortfolio" class="mp-more-btn" style="display:none;margin-top:10px">Показать ещё</button>
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

        <!-- форма нового отзыва -->
        <div id="mpRevForm" class="mp-rev-form" style="margin-top:12px">
          <div class="mp-rev-stars-input" id="revStars">
            <button type="button" data-v="1">★</button>
            <button type="button" data-v="2">★</button>
            <button type="button" data-v="3">★</button>
            <button type="button" data-v="4">★</button>
            <button type="button" data-v="5">★</button>
          </div>
          <textarea id="revText" class="mp-rev-textarea" rows="3" placeholder="Расскажите, как прошёл визит (необязательно)"></textarea>
          <button id="revSubmit" class="mp-more-btn" style="margin-top:8px">Оставить отзыв</button>
          <div id="revHint" class="mp-rev-hint" style="display:none;margin-top:6px;opacity:.8"></div>
        </div>
      </section>

      <div class="mp-fab">
        <button class="mp-call" id="mpCall" title="Позвонить">📞</button>
        <button class="mp-book" id="mpBook">Записаться</button>
      </div>
    </div>

    <!-- лайтбокс -->
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

    /* лайтбокс */
    .lb{position:fixed;inset:0;z-index:1000}
    .lb-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.8)}
    .lb-img{position:absolute;max-width:92vw;max-height:92vh;top:50%;left:50%;transform:translate(-50%,-50%);border-radius:12px}

    /* форма отзыва */
    .mp-rev-form{display:grid;gap:8px}
    .mp-rev-stars-input{display:flex;gap:6px}
    .mp-rev-stars-input button{font-size:20px;border:1px solid #223142;background:#13202c;color:#f5c84b;border-radius:8px;padding:6px 10px;cursor:pointer}
    .mp-rev-stars-input button.active{background:#1b2a3a}
    .mp-rev-textarea{width:100%;border-radius:10px;border:1px solid #223142;background:#0c141d;color:#eaf2ff;padding:8px}
    .mp-rev-hint{font-size:12px}
    `;
    const style = document.createElement('style'); style.id = 'mp-css'; style.textContent = css;
    document.head.appendChild(style);
  }

  const absUrl = (u)=> !u ? "" : /^https?:\/\//i.test(u) ? u : new URL(u, location.origin).href;

  // ---- загрузка данных
  let master={}, services=[], schedule=[];
  try{ master    = await api(`/api/masters/${mid}/`); }catch(_){}
  try{ services  = await api(`/api/services/?master=${mid}`) || []; }catch(_){}
  try{ schedule  = await api(`/api/masters/${mid}/work_hours/`) || []; }catch(_){}

  // header
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

  // услуги
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

  // о мастере (образование, спецы, часы)
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

  // -------- Портфолио с пагинацией (через твой /api/portfolio list) --------
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
        if (url){
          const full = absUrl(url);
          item.style.backgroundImage = `url('${full}')`;
          item.addEventListener('click', ()=> openLB(full));
        }
        $grid.appendChild(item);
      });
      document.getElementById('mpPortfolio').style.display='block';
      pfOffset += items.length;
      // показать кнопку, если ещё есть
      $morePF.style.display = (pfOffset < (pfTotal||0)) ? 'block' : 'none';
    }catch(_){}
    finally{ pfLoading = false; }
  }
  $morePF.addEventListener('click', loadPortfolio);
  await loadPortfolio();

  // -------- Отзывы (берём N штук) + форма добавления --------
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
          <div class="mp-rev-stars">${stars}</div>
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
      // если нет отзывов — всё равно показываем форму
      $revBox.style.display = 'block';
    }
  }catch(_){}

  // форма нового отзыва
  const $revStarsBox = document.getElementById('revStars');
  const $revText     = document.getElementById('revText');
  const $revSubmit   = document.getElementById('revSubmit');
  const $revHint     = document.getElementById('revHint');

  let revRating = 5;
  function updateStarsUI(val){
    Array.from($revStarsBox.querySelectorAll('button')).forEach(btn=>{
      const v = Number(btn.dataset.v||0);
      btn.classList.toggle('active', v <= val);
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
      // prepend: новый отзыв в начало списка
      const first = document.createElement('div');
      first.className='mp-review';
      const name = r.author_name || 'Клиент';
      const sn = Math.max(1,Math.min(5,Number(r.rating||5)));
      const st = '★★★★★'.slice(0,sn) + '☆☆☆☆☆'.slice(sn);
      first.innerHTML = `
        <div class="mp-rev-head">
          <div class="mp-rev-ava">${(name||'')[0]?.toUpperCase()||'К'}</div>
          <div class="mp-rev-meta">
            <div class="mp-rev-name">${name}</div>
            <div class="mp-rev-stars">${st}</div>
          </div>
          <div class="mp-rev-date">${r.created_at? new Date(r.created_at).toLocaleDateString('ru-RU'): new Date().toLocaleDateString('ru-RU')}</div>
        </div>
        <div class="mp-rev-text">${r.text||''}</div>`;
      $revList.prepend(first);

      // поправим счётчик
      const numEl = document.getElementById('mpRevCount');
      if (numEl){
        const m = (numEl.textContent||'').match(/\d+/);
        const cur = m ? Number(m[0]) : 0;
        numEl.textContent = `(${cur+1} отзывов)`;
      }

      // очистим форму
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

  // действия
  document.getElementById('mpBook').onclick = ()=> navigate(showServices);
  document.getElementById('mpCall').onclick = ()=>{
    const tel = master?.phone || '+7 (999) 123-45-67';
    try{ window.location.href = `tel:${tel.replace(/[^\d+]/g,'')}`; }catch(_){ toast(`Телефон: ${tel}`); }
  };

  // лайтбокс
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

  let raw = [];
  try {
    // allow404 + fallback, чтобы не падало молча, и лог
    raw = await api('/api/masters/?limit=100', undefined, { allow404:true, fallback:[] });
  } catch (e) {
    console.error('GET /api/masters/ failed:', e);
    raw = [];
  }

  console.log('masters payload →', raw);
  const masters = toArray(raw);

  const loading = document.getElementById('cbLoading');
  const list    = document.getElementById('cbList');
  loading.style.display = 'none';
  list.style.display    = 'flex';

  if (!Array.isArray(masters) || masters.length === 0){
    console.warn('masters parsed empty; raw payload shown above');
    list.innerHTML = `
      <div class="cb-card">
        <div class="cb-info">
          <div class="cb-name">Пока нет мастеров</div>
          <div class="cb-status">Проверь API /api/masters/ (см. консоль)</div>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = '';
  masters.forEach(m=>{
    const name  = m.name || 'Мастер';
    const bio   = m.bio || m.title || m.profession || 'Доступно сегодня';
    const online= (m.online === false) ? 'off' : '';
    const ava   = m.avatar_url || m.avatar || m.photo_url || '';

    const card = document.createElement('div');
    card.className = 'cb-card';
    card.innerHTML = `
      <div class="cb-ava" ${ava ? `style="background-image:url('${ava}');background-size:cover;background-position:center"`:''}>
        ${ava ? '' : (initials(name)||'M')}
      </div>
      <div class="cb-info">
        <div class="cb-name">${name}</div>
        <div class="cb-status">${bio}</div>
      </div>
      <div class="cb-dot ${online}"></div>
      <div class="cb-arrow">→</div>
    `;
    card.onclick = ()=>{
      masterId  = m.id;
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

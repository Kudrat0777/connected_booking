// Модуль: views/master_profile.js — экран профиля мастера
// Обновлённая версия: безопасная работа с DOM, отказ от innerHTML при вставке данных,
// явное использование textContent, обработчики через addEventListener, markRoute оставлен,
// улучшена обработка backgroundImage и создание элементов списка.

import { TG, tgUser } from '../telegram.js';
import { api, csrfToken, setCsrfToken } from '../api.js';
import { toast, mountTgsFromUrl } from '../ui.js';
import { toArray } from '../utils.js';
import { navigate, markRoute, goBackOrHero, Route, ScrollMem, $content } from '../navigation.js';
import { state } from './state.js';

export async function showMasterPublicProfile(id){
  const mid = id ?? state.masterId;
  markRoute('master_profile', { masterId: mid });

  // восстановление прокрутки (ScrollMem)
  (() => {
    const st = Route.load();
    const k  = `${st?.name}:${st?.params?.masterId || ''}:${st?.params?.serviceId || ''}:${st?.params?.slotId || ''}`;
    const y  = ScrollMem.load(k);
    if (y) requestAnimationFrame(()=> { $content.scrollTop = y; });
  })();

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
        <div id="mpSvcList" class="mp-svcs" role="list"></div>
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
        <div id="mpRevList" class="mp-reviews" role="list"></div>

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

  // back button
  const backBtn = document.getElementById('cbBack');
  if (backBtn) backBtn.addEventListener('click', goBackOrHero);

  const absUrl = (u)=> !u ? "" : /^https?:\/\//i.test(u) ? u : new URL(u, location.origin).href;

  // загрузка данных
  let master={}, services=[], schedule=[];
  try{ master    = await api(`/api/masters/${mid}/`); }catch(_){}
  try{ services  = await api(`/api/services/?master=${mid}`) || []; }catch(_){}
  try{ schedule  = await api(`/api/masters/${mid}/work_hours/`) || []; }catch(_){}

  // AVATAR
  const $ava = document.getElementById('mpAva');
  if ($ava) {
    if (master?.avatar_url){
      try { $ava.style.backgroundImage = `url('${absUrl(master.avatar_url)}')`; }
      catch { $ava.style.background = 'color-mix(in srgb, var(--tg-text-color, #111) 10%, transparent)'; }
    } else {
      const initial = (master?.name||'M').trim().split(/\s+/).map(s=>s[0]).join('').toUpperCase().slice(0,2);
      $ava.textContent = initial || 'M';
      $ava.style.background = 'color-mix(in srgb, var(--tg-text-color, #111) 10%, transparent)';
    }
  }

  const nameEl = document.getElementById('mpName');
  const subEl  = document.getElementById('mpSub');
  if (nameEl) nameEl.textContent = master?.name || 'Мастер';
  if (subEl) subEl.textContent =
    master?.title
    || master?.profession
    || (Array.isArray(master?.specializations) && master.specializations.length
          ? master.specializations.map(s => (typeof s === "string" ? s : s.name)).join(", ")
          : "Специалист");

  const rating   = Number(master?.rating || 0) || 0;
  const revCount = Number(master?.reviews_count || 0) || 0;
  const mpRatingNum = document.getElementById('mpRatingNum');
  const mpRevCount  = document.getElementById('mpRevCount');
  const mpOnline    = document.getElementById('mpOnline');
  if (mpRatingNum) mpRatingNum.textContent = rating ? rating.toFixed(1) : '—';
  if (mpRevCount) mpRevCount.textContent  = `(${revCount} отзывов)`;
  if (mpOnline) mpOnline.style.display  = (master?.online===false) ? 'none' : 'inline-flex';

  // BIO
  if (master?.bio){
    const bioEl = document.getElementById('mpBio');
    if (bioEl) bioEl.textContent = master.bio;
    const bioBox = document.getElementById('mpBioBox');
    if (bioBox) bioBox.style.display='block';
  }

  // Stats
  const exp = Number(master?.experience_years||0);
  const clients = Number(master?.clients_count||0);
  if (exp || clients || rating){
    const yearsEl = document.getElementById('mpYears');
    const clientsEl = document.getElementById('mpClients');
    const satisfyEl = document.getElementById('mpSatisfy');
    if (yearsEl) yearsEl.textContent = exp ? `${exp}+` : '—';
    if (clientsEl) clientsEl.textContent = clients ? `${clients}` : '—';
    if (satisfyEl) satisfyEl.textContent = rating ? `${Math.round((rating/5)*100)}%` : '—';
    const stats = document.getElementById('mpStats');
    if (stats) stats.style.display = 'grid';
  }

  // SERVICES — безопасно создаём элементы
  if (Array.isArray(services) && services.length){
    const box = document.getElementById('mpSvcList');
    services.forEach(s=>{
      const el = document.createElement('div');
      el.className = 'mp-svc';
      el.setAttribute('role','button');
      el.setAttribute('aria-label', `${s.name||'Услуга'}`);

      const left = document.createElement('div'); left.className = 'mp-svc-left';
      const svcName = document.createElement('div'); svcName.className = 'mp-svc-name'; svcName.textContent = s.name||'Услуга';
      const svcDesc = document.createElement('div'); svcDesc.className = 'mp-svc-desc'; svcDesc.textContent = s.description||'';
      left.appendChild(svcName);
      left.appendChild(svcDesc);

      const right = document.createElement('div'); right.className = 'mp-svc-right';
      const price = document.createElement('div'); price.className = 'mp-svc-price'; price.textContent = (s.price ?? 0) ? `${s.price} ₽`:'— ₽';
      const dur = document.createElement('div'); dur.className = 'mp-svc-dur'; dur.textContent = (s.duration ?? 0) ? `${s.duration} мин`:'0 мин';
      right.appendChild(price);
      right.appendChild(dur);

      el.appendChild(left);
      el.appendChild(right);

      el.addEventListener('click', ()=>{
        state.serviceId = s.id;
        state.serviceObj = s;
        // mark route to preserve NavStack context
        markRoute('slots', { masterId: mid, serviceId: s.id });
        navigate(()=> import('./slots.js').then(mod => mod.showSlots()));
      });
      box.appendChild(el);
    });
    const svcBox = document.getElementById('mpServices');
    if (svcBox) svcBox.style.display='block';
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
      const box = document.getElementById('mpEduBox'); if (box) box.style.display='block';
    }
    if (specs && specs.length){
      const cont = document.getElementById('mpSpecs');
      specs.forEach(s=>{
        const chip=document.createElement('span'); chip.className='chip';
        chip.textContent = (typeof s==='string'?s:(s.name||'Специализация'));
        cont.appendChild(chip);
      });
      const box = document.getElementById('mpSpecBox'); if (box) box.style.display='block';
    }
    if (schedule && schedule.length){
      const box = document.getElementById('mpHours');
      schedule.forEach(row=>{
        const line=document.createElement('div'); line.className='mp-hours-row';
        const closed = row.is_closed ? 'Выходной' : `${row.open||'—'} - ${row.close||'—'}`;
        const left = document.createElement('span'); left.textContent = row.day_ru||row.day||'';
        const right = document.createElement('span'); right.textContent = closed;
        line.appendChild(left); line.appendChild(right);
        box.appendChild(line);
      });
      const boxEl = document.getElementById('mpHoursBox'); if (boxEl) boxEl.style.display='block';
    }
    const aboutBox = document.getElementById('mpAbout'); if (aboutBox) aboutBox.style.display='block';
  }

  // PORTFOLIO
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
          try { item.style.backgroundImage = `url('${full}')`; } catch(e){}
          item.addEventListener('click', ()=> openLB(full));
        }
        $grid.appendChild(item);
      });
      const portBox = document.getElementById('mpPortfolio'); if (portBox) portBox.style.display='block';
      pfOffset += items.length;
      if ($morePF) $morePF.style.display = (pfOffset < (pfTotal||0)) ? 'block' : 'none';
    }catch(_){}
    finally{ pfLoading = false; }
  }
  if ($morePF) $morePF.addEventListener('click', loadPortfolio);
  await loadPortfolio();

  const $revBox  = document.getElementById('mpReviews');
  const $revList = document.getElementById('mpRevList');

  function addReviewCard(r, prepend = false){
    const el = document.createElement('div');
    el.className='mp-review';

    const head = document.createElement('div'); head.className = 'mp-rev-head';
    const ava = document.createElement('div'); ava.className = 'mp-rev-ava';
    ava.textContent = ((r.author_name || r.user || 'Клиент')[0] || 'К').toUpperCase();
    const meta = document.createElement('div'); meta.className = 'mp-rev-meta';
    const nm = document.createElement('div'); nm.className='mp-rev-name'; nm.textContent = r.author_name || r.user || 'Клиент';
    const stars = document.createElement('div'); stars.className='mp-rev-stars'; stars.setAttribute('aria-label', `Оценка: ${r.rating || r.stars || 5} из 5`);
    const starsN = Math.max(1,Math.min(5,Number(r.rating||r.stars||5)));
    stars.textContent = '★★★★★'.slice(0,starsN) + '☆☆☆☆☆'.slice(starsN);
    meta.appendChild(nm); meta.appendChild(stars);

    const date = document.createElement('div'); date.className = 'mp-rev-date';
    date.textContent = r.created_at? new Date(r.created_at).toLocaleDateString('ru-RU'): '';

    head.appendChild(ava); head.appendChild(meta); head.appendChild(date);

    const text = document.createElement('div'); text.className='mp-rev-text'; text.textContent = r.text||r.comment||'';

    el.appendChild(head); el.appendChild(text);

    if (prepend && $revList.firstChild) $revList.insertBefore(el, $revList.firstChild);
    else $revList.appendChild(el);
  }

  try{
    const initial = await api(`/api/reviews/?master=${mid}&limit=3`);
    if (Array.isArray(initial)){
      initial.forEach(r => addReviewCard(r));
      if ($revBox) $revBox.style.display = 'block';
    } else {
      if ($revBox) $revBox.style.display = 'block';
    }
  }catch(_){ if ($revBox) $revBox.style.display = 'block'; }

  const $revStarsBox = document.getElementById('revStars');
  const $revText     = document.getElementById('revText');
  const $revSubmit   = document.getElementById('revSubmit');
  const $revHint     = document.getElementById('revHint');

  let revRating = 5;
  function updateStarsUI(val){
    if (!$revStarsBox) return;
    Array.from($revStarsBox.querySelectorAll('button')).forEach(btn=>{
      const v = Number(btn.dataset.v||0);
      btn.classList.toggle('active', v <= val);
      btn.setAttribute('aria-checked', String(v === val));
    });
  }
  updateStarsUI(revRating);

  if ($revStarsBox) {
    $revStarsBox.addEventListener('click', (e)=>{
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      revRating = Number(b.dataset.v||5);
      updateStarsUI(revRating);
    });
  }

  if ($revSubmit) {
    $revSubmit.addEventListener('click', async ()=>{
      if (!tgUser?.id){
        toast('Откройте через Telegram, чтобы оставить отзыв');
        return;
      }
      const payload = {
        master: mid,
        rating: revRating,
        text: ($revText.value||'').trim(),
        author_name: (TG()?.initDataUnsafe?.user?.first_name || 'Клиент'),
        telegram_id: tgUser.id
      };
      $revSubmit.disabled = true; if ($revHint) $revHint.style.display = 'none';
      try{
        if (!csrfToken) {
          try {
            const stored = sessionStorage.getItem('csrfToken');
            if (stored) setCsrfToken(stored);
          } catch (_) {}
        }
        const r = await api('/api/reviews/add/', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        });
        addReviewCard(r, true);

        const numEl = document.getElementById('mpRevCount');
        if (numEl){
          const m = (numEl.textContent||'').match(/\d+/);
          const cur = m ? Number(m[0]) : 0;
          numEl.textContent = `(${cur+1} отзывов)`;
        }

        $revText.value = '';
        revRating = 5; updateStarsUI(revRating);
        if ($revHint){ $revHint.textContent = 'Спасибо! Ваш отзыв добавлен.'; $revHint.style.display='block'; }
      }catch(_){
        if ($revHint){ $revHint.textContent = 'Не удалось отправить отзыв.'; $revHint.style.display = 'block'; }
      }finally{
        $revSubmit.disabled = false;
      }
    });
  }

  // NAV actions
  const mpBookBtn = document.getElementById('mpBook');
  if (mpBookBtn) mpBookBtn.addEventListener('click', ()=> {
    markRoute('services', { masterId: mid });
    navigate(()=> import('./services.js').then(m => m.showServices()));
  });

  const mpCallBtn = document.getElementById('mpCall');
  if (mpCallBtn) mpCallBtn.addEventListener('click', ()=>{
    const tel = master?.phone || '+7 (999) 123-45-67';
    try{ window.location.href = `tel:${tel.replace(/[^\d+]/g,'')}`; }catch(_){ toast(`Телефон: ${tel}`); }
  });

  // Lightbox
  function openLB(src){
    const lb=document.getElementById('lb'); const img=document.getElementById('lbImg');
    if (!lb || !img) return;
    img.src=src; lb.removeAttribute('hidden');
  }
  const lbClose = document.getElementById('lbClose');
  if (lbClose) lbClose.addEventListener('click', ()=> document.getElementById('lb')?.setAttribute('hidden',''));
  document.addEventListener('keydown', (e)=>{
    if (e.key==='Escape') document.getElementById('lb')?.setAttribute('hidden','');
  });
}
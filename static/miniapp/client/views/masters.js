// Модуль: views/masters.js — экран списка мастеров
// Обновлённая версия: привёл рендер карточек к безопасной DOM-строительству,
// добавил markRoute при переходе на профиль мастера (для корректного NavStack/restore),
// убрал инъекцию данных в innerHTML там, где это было небезопасно,
// обеспечил ARIA / keyboard accessibility и согласованность с TMA (использование CSS переменных, safe-area не сломаны).

import { api } from '../api.js';
import { mountTgsFromUrl } from '../ui.js';
import { toArray, initials } from '../utils.js';
import { navigate, markRoute, goBackOrHero, $content } from '../navigation.js';
import { state } from './state.js';

function starSVG(type, gid){
  const fill = (type==='full') ? '#f6c453' : (type==='half' ? `url(#${gid})` : 'none');
  const stroke = '#e2b13a';
  return `
    <svg viewBox="0 0 24 24" width="16" height="16" style="display:inline-block;vertical-align:-3px">
      ${type==='half' ? `
        <defs>
          <linearGradient id="${gid}" x1="0" x2="1" y1="0" y2="0">
            <stop offset="50%" stop-color="#f6c453"/><stop offset="50%" stop-color="transparent"/>
          </linearGradient>
        </defs>` : ``}
      <path d="M12 2.5l2.9 6 6.6.6-5 4.3 1.5 6.4L12 16.9 5.9 19.8 7.4 13.4 2.4 9.1l6.7-.6L12 2.5z"
            fill="${fill}" stroke="${stroke}" stroke-width="1"/>
    </svg>`;
}

function renderStars(val=0){
  const gid = `g-${Math.random().toString(36).slice(2)}`;
  const r = Math.max(0, Math.min(5, Number(val)||0));
  const full = Math.floor(r);
  const half = r - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return `${'x'.repeat(full).split('').map(()=>starSVG('full', gid)).join('')}${
          half?starSVG('half', gid):''}${
          'x'.repeat(empty).split('').map(()=>starSVG('empty', gid)).join('')}`;
}

function specText(master){
  const arr = Array.isArray(master?.specializations)
    ? master.specializations.map(s => typeof s === 'string' ? s : (s?.name || '')).filter(Boolean)
    : [];
  const base = arr.length ? arr.join(' • ') : (master?.title || master?.profession || 'Специалист');
  const exp  = Number(master?.experience_years || 0);
  return `${base}${exp ? ` • ${exp}+ лет` : ''}`;
}

function renderMasterCard(master, onClick){
  const name   = master?.name || 'Мастер';
  const ava    = master?.avatar_url || master?.avatar || master?.photo_url || '';
  const rating = Number(master?.rating ?? master?.rating_value ?? 0);
  const revs   = Number(master?.reviews_count || 0);
  const rateTxt= Number.isFinite(rating) ? rating.toFixed(1) : '0';

  // root cell
  const cell = document.createElement('div');
  cell.className = 'tg-cell ms-card';
  cell.setAttribute('tabindex', '0');
  cell.setAttribute('role', 'button');
  cell.setAttribute('aria-label', `Мастер ${name}, рейтинг ${rateTxt}, ${revs} отзывов`);
  cell.style.cursor = 'pointer';

  // left / main container
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '64px 1fr';
  grid.style.gap = '12px';
  grid.style.width = '100%';

  // avatar container
  const avaWrap = document.createElement('div');
  avaWrap.className = 'cb-ava';
  avaWrap.style.width = '56px';
  avaWrap.style.height = '56px';
  avaWrap.style.borderRadius = '14px';
  avaWrap.style.overflow = 'hidden';
  avaWrap.style.display = 'grid';
  avaWrap.style.placeItems = 'center';
  avaWrap.style.fontWeight = '800';
  avaWrap.style.color = '#fff';
  avaWrap.style.backgroundSize = 'cover';
  avaWrap.style.backgroundPosition = 'center';

  if (ava) {
    // set backgroundImage safely
    try {
      avaWrap.style.backgroundImage = `url("${ava}")`;
    } catch (e){
      avaWrap.style.background = 'color-mix(in srgb, var(--tg-theme-text-color,#111) 10%, transparent)';
      avaWrap.textContent = initials(name) || 'M';
    }
  } else {
    avaWrap.style.background = 'color-mix(in srgb, var(--tg-theme-text-color,#111) 10%, transparent)';
    avaWrap.textContent = initials(name) || 'M';
  }

  // info column
  const info = document.createElement('div');
  info.style.minWidth = '0';

  const title = document.createElement('div');
  title.className = 'tg-name';
  title.style.marginRight = '110px';
  title.textContent = name;

  const sub = document.createElement('div');
  sub.className = 'tg-sub';
  sub.style.marginTop = '4px';
  sub.textContent = specText(master);

  const meta = document.createElement('div');
  meta.style.marginTop = '8px';
  meta.style.display = 'flex';
  meta.style.alignItems = 'center';
  meta.style.gap = '8px';

  const stars = document.createElement('span');
  stars.innerHTML = renderStars(rating); // svg string is safe here (generated locally)
  const revCount = document.createElement('span');
  revCount.className = 'tg-sub';
  revCount.textContent = `(${revs})`;

  meta.appendChild(stars);
  meta.appendChild(revCount);

  info.appendChild(title);
  info.appendChild(sub);
  info.appendChild(meta);

  grid.appendChild(avaWrap);
  grid.appendChild(info);

  // right status column
  const right = document.createElement('div');
  right.className = 'ms-online';
  const statusWrap = document.createElement('span');
  statusWrap.className = 'tg-status active';
  statusWrap.style.padding = '6px 10px';
  const dot = document.createElement('span');
  dot.className = 'dot';
  const statusText = document.createElement('span');
  statusText.textContent = 'Онлайн';
  statusWrap.appendChild(dot);
  statusWrap.appendChild(statusText);
  right.appendChild(statusWrap);

  // assemble
  cell.appendChild(grid);
  cell.appendChild(right);

  // interaction handlers
  const go = ()=> { if (typeof onClick === 'function') onClick(); };
  cell.addEventListener('click', go);
  cell.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
  });

  return cell;
}

export async function showMasters(){
  // mark route for TMA/NavStack immediately
  markRoute('masters');

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
        <div class="ms-search" id="msSearch">
          <span class="ms-i-left" aria-hidden="true">🔍</span>
          <input id="msInput" type="search" autocomplete="off"
                 placeholder="Поиск по имени, услуге или описанию…" aria-label="Поиск мастера">
          <button id="msClear" class="ms-i-right" title="Очистить" style="display:none" aria-hidden="false">✕</button>
          <div id="msSpin" class="cb-spin" style="display:none" aria-hidden="true"></div>
        </div>
        <div class="ms-meta"><span id="msFound">Найдено: 0</span></div>
      </div>

      <div id="cbLoading" class="cb-loading" role="status" aria-live="polite">
        <div class="cb-spin"></div>
        <div>Загружаем список мастеров…</div>
      </div>

      <div id="cbList" class="tg-list no-frame" style="display:none" aria-live="polite"></div>

      <div id="emptyState" class="tg-empty" style="display:none">
        <div id="emptyAnim" class="empty-anim" aria-hidden="true"></div>
        <div class="tg-empty-title">Мастеров не найдено</div>
        <div class="tg-empty-sub">Попробуйте изменить запрос</div>
      </div>
    </div>
  `;
  document.getElementById('cbBack').onclick = goBackOrHero;

  // загрузка данных
  let raw = [];
  try { raw = await api('/api/masters/?limit=100', undefined, {allow404:true, fallback:[]}); }
  catch { raw = []; }
  const allMasters = toArray(raw);

  const $load   = document.getElementById('cbLoading');
  const $list   = document.getElementById('cbList');
  const $empty  = document.getElementById('emptyState');
  const $found  = document.getElementById('msFound');
  const $input  = document.getElementById('msInput');
  const $clear  = document.getElementById('msClear');
  const $spin   = document.getElementById('msSpin');

  $load.style.display = 'none';

  const renderList = (arr)=>{
    const toShow = arr.length > 30 ? arr.slice(0, 30) : arr;
    $list.innerHTML = '';
    $found.textContent = `Найдено: ${arr.length}`;
    if (!toShow.length){
      $list.style.display = 'none';
      $empty.style.display = 'grid';
      mountTgsFromUrl("/static/stickers/duck_crying.tgs", "emptyAnim");
      if ($spin) $spin.style.display = 'none';
      return;
    }
    $empty.style.display = 'none';
    $list.style.display = 'grid';

    toShow.forEach((m, i)=>{
      const onClick = ()=>{
        // сохраняем маршрут и state для корректного восстановления (TMA/NavStack)
        markRoute('master_profile', { masterId: m.id });
        state.masterId  = m.id;
        state.masterObj = m;
        // viewFn: dynamic import; navigate will call the function synchronously (it may return a promise)
        navigate(()=> import('./master_profile.js').then(mod => mod.showMasterPublicProfile(m.id)));
      };
      const card = renderMasterCard(m, onClick);
      card.style.animationDelay = `${i * 0.03}s`;
      $list.appendChild(card);
    });

    if ($spin) $spin.style.display = 'none';
  };

  renderList(allMasters);

  let timer = null;
  const norm = s => (s||'').toString().toLowerCase().trim();

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
    if ($spin) $spin.style.display = 'inline-block';
    timer = setTimeout(doFilter, 140);
  });
  $clear.addEventListener('click', ()=>{
    $input.value=''; doFilter(); $input.focus();
  });
}
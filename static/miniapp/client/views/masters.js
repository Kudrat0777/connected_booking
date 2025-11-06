// Модуль: views/masters.js — экран списка мастеров

import { api } from '../api.js';
import { mountTgsFromUrl } from '../ui.js';
import { toArray, initials } from '../utils.js';
import { navigate, markRoute, goBackOrHero, $content } from '../navigation.js';
import { state } from './state.js';

function renderMasterCard(master, onClick){
  const name   = master?.name || 'Мастер';
  const ava    = master?.avatar_url || master?.avatar || master?.photo_url || '';
  const rating = Number(master?.rating ?? master?.rating_value ?? 0);
  const revs   = Number(master?.reviews_count || 0);
  const rateTxt= Number.isFinite(rating) ? rating.toFixed(1) : '0';

  const specText = (m)=>{
    const arr = Array.isArray(m?.specializations)
      ? m.specializations.map(s => typeof s === 'string' ? s : (s?.name || '')).filter(Boolean)
      : [];
    const base = arr.length ? arr.join(' • ') : (m?.title || m?.profession || 'Специалист');
    const exp  = Number(m?.experience_years || 0);
    return `${base}${exp ? ` • ${exp}+ лет` : ''}`;
  };

  const starSVG = (type, gid)=>{
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
  };

  const renderStars = (val=0)=>{
    const gid = `g-${Math.random().toString(36).slice(2)}`;
    const r = Math.max(0, Math.min(5, Number(val)||0));
    const full = Math.floor(r);
    const half = r - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return `${'x'.repeat(full).split('').map(()=>starSVG('full', gid)).join('')}${
            half?starSVG('half', gid):''}${
            'x'.repeat(empty).split('').map(()=>starSVG('empty', gid)).join('')}`;
  };

  const cell = document.createElement('div');
  cell.className = 'tg-cell ms-card';
  cell.setAttribute('tabindex', '0');
  cell.setAttribute('role', 'button');
  cell.setAttribute('aria-label', `Мастер ${name}, рейтинг ${rateTxt}, ${revs} отзывов`);

  cell.innerHTML = `
    <div style="display:grid;grid-template-columns:64px 1fr;gap:12px;width:100%">
      <div class="cb-ava" style="
        width:56px;height:56px;border-radius:14px;
        ${ava?`background-image:url('${ava}');background-size:cover;background-position:center;`:
          `display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;
           background:color-mix(in srgb, var(--tg-theme-text-color,#111) 10%, transparent);`}
      ">
        ${ava ? '' : (initials(name)||'M')}
      </div>

      <div style="min-width:0">
        <div class="tg-name" style="margin-right:110px">${name}</div>
        <div class="tg-sub" style="margin-top:4px">${specText(master)}</div>

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

  const go = ()=> { if (typeof onClick === 'function') onClick(); };
  cell.addEventListener('click', go);
  cell.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
  });

  return cell;
}

export async function showMasters(){
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
                 placeholder="Поиск по имени, услуге или описанию…">
          <span id="msClear" class="ms-i-right" title="Очистить" style="display:none">✕</span>
          <div id="msSpin" class="cb-spin" style="display:none"></div>
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
        state.masterId  = m.id;
        state.masterObj = m;
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
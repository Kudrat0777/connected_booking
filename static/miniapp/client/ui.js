// Модуль: ui.js — отвечает за Toast, showLoading(), toast(), и монтирование стикеров/анимаций

const $loader = document.getElementById('loader');
const $toast  = document.getElementById('toast');

export const Toast = (() => {
  let el = null;
  let timer = null;
  let token = 0;

  const getEl = () => {
    if (el) return el;
    el = $toast || document.getElementById('toast');
    if (!el) {
      console.warn('[Toast] #toast element not found');
      return null;
    }
    return el;
  };

  const show = (text, duration = 1800) => {
    const t = getEl(); if (!t) return;
    token += 1;
    const my = token;

    if (timer) { clearTimeout(timer); timer = null; }

    t.textContent = text ?? '';
    t.style.display = 'block';

    const ms = Number.isFinite(+duration) ? +duration : 1800;
    timer = setTimeout(() => {
      if (my !== token) return;
      t.style.display = 'none';
      timer = null;
    }, ms);
  };

  const hide = () => {
    const t = getEl(); if (!t) return;
    token += 1;
    if (timer) { clearTimeout(timer); timer = null; }
    t.style.display = 'none';
  };

  const updateText = (text) => {
    const t = getEl(); if (!t) return;
    t.textContent = text ?? '';
  };

  return { show, hide, updateText };
})();

export function showLoading(on = true) {
  if ($loader) $loader.style.display = on ? 'flex' : 'none';
}
export function toast(text, ms = 1800) { Toast.show(text, ms); }

export function mountLottieFromData(data, slotId = 'welcomeSticker') {
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

export function mountWebmToSlot(url, slotId = 'welcomeSticker') {
  const el = document.getElementById(slotId);
  if (!el || !url) return;
  el.innerHTML = '';
  el.classList.add('is-filled');

  const v = document.createElement('video');
  v.src = url;
  v.autoplay = true;
  v.loop = true;
  v.muted = true;
  v.playsInline = true;
  v.style.width = '100%';
  v.style.height = '100%';
  v.style.objectFit = 'cover';
  el.appendChild(v);
}

export async function mountTgsFromUrl(url, slotId = 'welcomeSticker') {
  try{
    const res = await fetch(url, {cache:'no-store'});
    const buf = await res.arrayBuffer();
    const jsonStr = pako.ungzip(new Uint8Array(buf), {to:'string'});
    const data = JSON.parse(jsonStr);
    mountLottieFromData(data, slotId);
  }catch(e){ console.warn('local .tgs failed', e); }
}
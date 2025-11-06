// Модуль: telegram.js — отвечает за инициализацию Telegram WebApp, TG(), applyThemeVars()

export let tgUser = null;

export function TG() {
  return (window.Telegram && window.Telegram.WebApp)
    ? window.Telegram.WebApp
    : null;
}

export function applyThemeVars() {
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

export function initTelegram() {
  try {
    const tgw = TG();
    tgw?.ready?.();
    tgw?.expand?.();

    // захватываем tgUser и базовые цвета на старте
    tgUser = tgw?.initDataUnsafe?.user || null;
    document.body.style.background =
      tgw?.backgroundColor || getComputedStyle(document.documentElement).getPropertyValue('--bg');
    document.body.style.color =
      tgw?.textColor || getComputedStyle(document.documentElement).getPropertyValue('--text');

    applyThemeVars();
    TG()?.onEvent('themeChanged', applyThemeVars);
  } catch (_) {}
}
// Модуль: telegram.js — отвечает за инициализацию Telegram WebApp, TG(), applyThemeVars()

export let tgUser = null;

export function TG() {
  return (window.Telegram && window.Telegram.WebApp)
    ? window.Telegram.WebApp
    : null;
}

export function applyThemeVars() {
  const tg = TG();
  if (!tg) return;
  const tp = tg?.themeParams || {};
  const root = document.documentElement;

  // colorScheme (dark/light) — useful for CSS if needed
  root.setAttribute('data-theme', tg?.colorScheme || 'dark');

  // Apply theme params to CSS custom properties (use host-provided colors when available)
  root.style.setProperty('--tg-bg-color', tp.bg_color || '#0e1621');
  root.style.setProperty('--tg-secondary-bg-color', tp.secondary_bg_color || tp.bg_color || '#0b131b');
  root.style.setProperty('--tg-text-color', tp.text_color || '#e0e9f2');
  root.style.setProperty('--tg-hint-color', tp.hint_color || 'rgba(224,233,242,.65)');
  root.style.setProperty('--tg-link-color', tp.link_color || '#6ab3f3');
  root.style.setProperty('--tg-button-color', tp.button_color || '#2ea6ff');
  root.style.setProperty('--tg-button-text-color', tp.button_text_color || '#ffffff');

  // Best-effort: ask WebApp to adjust header/background colors using actual colors (not variable names)
  try {
    // Prefer theme params when available
    const headerColor = tp.bg_color || (tg.colorScheme === 'dark' ? '#0e1621' : '#ffffff');
    tg?.setHeaderColor?.(headerColor);

    // For background we'll pass a concrete color: prefer secondary_bg_color then bg_color
    const backgroundColor = tp.secondary_bg_color || tp.bg_color || undefined;
    if (backgroundColor) tg?.setBackgroundColor?.(backgroundColor);
  } catch (e) {
    // silent fallback if host doesn't support these methods
    console.warn('applyThemeVars: setHeader/BackgroundColor failed', e);
  }
}

export function initTelegram() {
  try {
    const tgw = TG();
    if (!tgw) return;

    // Ensure WebApp is ready/expanded if available
    tgw?.ready?.();
    tgw?.expand?.();

    // захватываем tgUser и базовые цвета на старте
    tgUser = tgw?.initDataUnsafe?.user || null;

    const tp = tgw?.themeParams || {};
    // Use themeParams (if present) to set document body styles — fallback to CSS vars
    document.body.style.background = tp.bg_color || getComputedStyle(document.documentElement).getPropertyValue('--tg-bg-color') || '';
    document.body.style.color = tp.text_color || getComputedStyle(document.documentElement).getPropertyValue('--tg-text-color') || '';

    applyThemeVars();

    // subscribe to theme changes if supported
    if (typeof tgw?.onEvent === 'function') {
      tgw.onEvent('themeChanged', applyThemeVars);
    }
  } catch (err) {
    console.warn('initTelegram: failed', err);
  }
}
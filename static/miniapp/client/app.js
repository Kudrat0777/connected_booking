// Модуль: app.js — точка входа и инициализация приложения

import { initTelegram, TG } from './telegram.js';
import { mountTgsFromUrl } from './ui.js';
import { setRouteResolver, restoreFromStack, openByRoute, Route, startFlow } from './navigation.js';
import { showMasters } from './views/masters.js';
import { showMyBookings } from './views/my_bookings.js';
import { showServices } from './views/services.js';
import { showSlots } from './views/slots.js';
import { showMasterPublicProfile } from './views/master_profile.js';
import { confirmBooking } from './views/confirm.js';
import { state } from './views/state.js';

// 1) Telegram boot + тема
initTelegram();

// 2) hero-приветствие и кнопки
(function initHero(){
  const tg = TG();
  tg?.ready?.(); tg?.expand?.();

  const u = tg?.initDataUnsafe?.user;
  const t = document.getElementById('welcomeTitle');
  if (t) t.textContent = `Привет, ${u?.first_name || 'Гость'}!`;

  mountTgsFromUrl("/static/stickers/hello.tgs", 'welcomeSticker');

  document.getElementById('goBook')?.addEventListener('click', () => startFlow(showMasters));
  document.getElementById('goMy')  ?.addEventListener('click', () => startFlow(showMyBookings));
})();

// 3) Разрешение маршрутов для восстановления/открытия
setRouteResolver((name) => {
  switch (name) {
    case 'masters':         return showMasters;
    case 'master_profile':  return () => showMasterPublicProfile(state.masterId);
    case 'services':        return showServices;
    case 'slots':           return showSlots;
    case 'confirm':         return confirmBooking;
    case 'my_bookings':     return showMyBookings;
    default:                return showMasters;
  }
});

// 4) Восстановление стека/маршрута на загрузке
window.addEventListener('load', () => {
  if (!restoreFromStack()) {
    const st = Route.load();
    if (st && st.name && st.name !== 'home') openByRoute(st, true);
  }
});
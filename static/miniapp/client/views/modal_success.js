// Модуль: views/modal_success.js — небольшой UI-компонент модалки "успех"

import { mountTgsFromUrl } from '../ui.js';
import { navigate } from '../navigation.js';

export function showSuccessModal({ title = 'Бронь создана', sub = '', stickerList } = {}) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  modal.innerHTML = `
    <div class="modal__sheet" role="document">
      <div class="modal__head">
        <div id="modalAnim" class="modal__icon" aria-hidden="true"></div>
        <div class="modal__title">${title}</div>
        ${sub ? `<div class="modal__sub">${sub}</div>` : ``}
      </div>
      <div class="modal__actions">
        <button id="modalGoBookings" class="modal__btn">Перейти к бронированиям</button>
        <button id="modalClose" class="modal__btn secondary">Закрыть</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const tries = stickerList && stickerList.length
    ? stickerList
    : [
        '/static/stickers/duck_ok.tgs',
        '/static/stickers/duck_party.tgs',
        '/static/stickers/hello.tgs'
      ];

  (async () => {
    let ok = false;
    for (const u of tries) {
      try { await mountTgsFromUrl(u, 'modalAnim'); ok = true; break; } catch(_) {}
    }
    const box = document.getElementById('modalAnim');
    if (ok) box.classList.add('is-filled');
    else { box.textContent = '🎉'; box.style.fontSize = '64px'; }
  })();

  const go = () => { modal.remove(); navigate(()=> import('./my_bookings.js').then(m => m.showMyBookings())); };
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.getElementById('modalGoBookings').addEventListener('click', go);
  document.getElementById('modalClose').addEventListener('click', () => modal.remove());

  document.getElementById('modalGoBookings').focus();
}
// Модуль: views/modal_success.js — небольшой UI-компонент модалки "успех"
// Обновлено:
// - отказался от innerHTML для динамики (безопасность)
// - добавлен focus-trap, обработка Esc, восстановление фокуса
// - отключение скролла фона пока открыта модалка
// - аккуратный перезапуск анимации TGS с fallback'ами
// - очистка слушателей и элементов при закрытии
import { mountTgsFromUrl } from '../ui.js';
import { navigate } from '../navigation.js';

export function showSuccessModal({ title = 'Бронь создана', sub = '', stickerList } = {}) {
  // remember previously focused element to restore after modal closed
  const prevFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  // create backdrop / modal root
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.tabIndex = -1; // allow focusing container if needed

  // sheet
  const sheet = document.createElement('div');
  sheet.className = 'modal__sheet';
  sheet.setAttribute('role', 'document');

  // head
  const head = document.createElement('div');
  head.className = 'modal__head';

  const animBox = document.createElement('div');
  animBox.id = 'modalAnim';
  animBox.className = 'modal__icon';
  animBox.setAttribute('aria-hidden', 'true');

  const titleEl = document.createElement('div');
  titleEl.className = 'modal__title';
  titleEl.textContent = title;

  head.appendChild(animBox);
  head.appendChild(titleEl);

  if (sub) {
    const subEl = document.createElement('div');
    subEl.className = 'modal__sub';
    subEl.textContent = sub;
    head.appendChild(subEl);
  }

  // actions
  const actions = document.createElement('div');
  actions.className = 'modal__actions';

  const goBtn = document.createElement('button');
  goBtn.id = 'modalGoBookings';
  goBtn.className = 'modal__btn';
  goBtn.type = 'button';
  goBtn.textContent = 'Перейти к бронированиям';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'modalClose';
  closeBtn.className = 'modal__btn secondary';
  closeBtn.type = 'button';
  closeBtn.textContent = 'Закрыть';

  actions.appendChild(goBtn);
  actions.appendChild(closeBtn);

  sheet.appendChild(head);
  sheet.appendChild(actions);
  modal.appendChild(sheet);
  document.body.appendChild(modal);

  // prevent background scroll while modal is open
  const prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // Prepare sticker list tries
  const tries = Array.isArray(stickerList) && stickerList.length
    ? stickerList
    : [
        '/static/stickers/duck_ok.tgs',
        '/static/stickers/duck_party.tgs',
        '/static/stickers/hello.tgs'
      ];

  // mount TGS with retries; fallback to emoji if none worked
  (async () => {
    let ok = false;
    for (const u of tries) {
      try {
        await mountTgsFromUrl(u, 'modalAnim');
        ok = true;
        break;
      } catch (_) {
        // try next
      }
    }
    const box = document.getElementById('modalAnim');
    if (ok && box) box.classList.add('is-filled');
    else if (box) {
      box.textContent = '🎉';
      box.style.fontSize = '64px';
      box.style.lineHeight = '1';
    }
  })();

  // Focus management & focus trap
  const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  function getFocusable(container) {
    return Array.from(container.querySelectorAll(focusableSelector)).filter(el => !el.hasAttribute('disabled'));
  }

  const focusables = () => getFocusable(sheet);
  function trapTabKey(e) {
    if (e.key !== 'Tab') return;
    const nodes = focusables();
    if (nodes.length === 0) { e.preventDefault(); return; }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      closeModal();
      return;
    }
    trapTabKey(e);
  }

  // navigation helpers
  const goToBookings = () => {
    closeModal();
    // navigate to bookings screen
    navigate(()=> import('./my_bookings.js').then(m => m.showMyBookings()));
  };

  function removeListeners() {
    modal.removeEventListener('click', onBackdropClick);
    document.removeEventListener('keydown', onKeyDown);
    goBtn.removeEventListener('click', goToBookings);
    closeBtn.removeEventListener('click', closeModal);
  }

  function onBackdropClick(e) {
    if (e.target === modal) closeModal();
  }

  function closeModal() {
    // cleanup
    removeListeners();
    // restore overflow
    document.body.style.overflow = prevBodyOverflow || '';
    if (modal.parentNode) modal.parentNode.removeChild(modal);
    // restore focus
    try { prevFocused?.focus(); } catch(_) {}
  }

  // event wiring
  modal.addEventListener('click', onBackdropClick);
  document.addEventListener('keydown', onKeyDown);
  goBtn.addEventListener('click', goToBookings);
  closeBtn.addEventListener('click', closeModal);

  // auto-focus primary action
  setTimeout(()=> {
    const nodes = focusables();
    if (nodes.length) nodes[0].focus();
    else sheet.focus();
  }, 30);
}
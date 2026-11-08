const TOKEN_KEY = 'wishlist-admin-token';
const NAME_KEY = 'wishlist-guest-name';
const ROLE_KEY = 'wishlist-role';
const ICONS = ['i-bow', 'i-star', 'i-heart', 'i-pop', 'i-gem', 'i-spark'];

const state = {
  data: null,
  token: sessionStorage.getItem(TOKEN_KEY) || '',
  admin: false,
  role: '',
};

let lastSnap = '';
let pending = false;

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  });
  [].concat(children).forEach((child) => {
    if (child == null || child === false) return;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  });
  return node;
}

function svgUse(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

function myName() {
  return localStorage.getItem(NAME_KEY) || '';
}

function sameName(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function isHttp(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function safeImg(src) {
  if (!src) return '';
  if (src.startsWith('/uploads/')) return src.slice(1);
  return isHttp(src) ? src : '';
}

function formatKaspi(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length !== 11) return String(raw || '');
  return `${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
}

function formatDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${months[month - 1]} ${year}`;
}

function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function birthdayTarget(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function paintCountdown(node, target) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today.getTime() === target.getTime()) {
    node.hidden = false;
    node.className = 'countdown is-today';
    node.replaceChildren(h('p', { class: 'countdown-today' }, 'Сегодня день рождения'));
    return;
  }
  if (today > target) {
    node.hidden = true;
    node.replaceChildren();
    return;
  }
  const total = Math.max(0, Math.floor((target - now) / 1000));
  const parts = [
    [Math.floor(total / 86400), 'день', 'дня', 'дней'],
    [Math.floor((total % 86400) / 3600), 'час', 'часа', 'часов'],
    [Math.floor((total % 3600) / 60), 'минута', 'минуты', 'минут'],
    [total % 60, 'секунда', 'секунды', 'секунд'],
  ];
  node.hidden = false;
  node.className = 'countdown';
  node.replaceChildren(
    h('p', { class: 'countdown-label' }, 'осталось'),
    ...parts.map(([value, one, few, many]) => h('div', { class: 'count-cell' }, [
      h('b', {}, String(value).padStart(2, '0')),
      h('span', {}, plural(value, one, few, many)),
    ]))
  );
}

function tickCountdown() {
  const iso = state.data && state.data.profile && state.data.profile.date;
  const target = birthdayTarget(iso);
  ['gate-count', 'hero-count'].forEach((id) => {
    const node = document.getElementById(id);
    if (!node) return;
    if (!target) {
      node.hidden = true;
      node.replaceChildren();
      return;
    }
    paintCountdown(node, target);
  });
}

function toast(message) {
  const node = h('div', { class: 'toast' }, message);
  document.getElementById('toasts').append(node);
  setTimeout(() => node.remove(), 3400);
}

function openModal(id) {
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.hidden = modal.id !== id;
  });
  document.body.classList.add('modal-open');
  const focus = document.querySelector(`#${id} input, #${id} textarea`);
  if (focus) focus.focus();
}

function closeModals() {
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.hidden = true;
  });
  document.body.classList.remove('modal-open');
}

function showGate() {
  document.getElementById('gate').hidden = false;
  document.getElementById('app').hidden = true;
  const input = document.querySelector('#form-guest [name="name"]');
  if (input) input.value = myName();
}

function showApp() {
  document.getElementById('gate').hidden = true;
  document.getElementById('app').hidden = false;
}

function enterGuest(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2) {
    toast('Напиши, как тебя зовут');
    return;
  }
  localStorage.setItem(NAME_KEY, name);
  state.role = 'guest';
  sessionStorage.setItem(ROLE_KEY, 'guest');
  lastSnap = '';
  showApp();
  if (state.data) render();
  else reload();
}

function enterOwner() {
  openModal('modal-login');
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
  let body;
  if (options.json) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  } else if (options.body) {
    body = options.body;
  }
  let response;
  try {
    response = await fetch(url, { method: options.method || 'GET', headers, body });
  } catch {
    throw new Error('Нет связи с сервером. Запусти сайт командой npm start');
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && options.authRedirect !== false && !url.endsWith('/login')) {
    state.admin = false;
    state.token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    lastSnap = '';
    openModal('modal-login');
  }
  if (!response.ok) {
    throw new Error(data.error || (response.status === 404
      ? 'На этой ссылке бронь и вход не сохраняются'
      : 'Не получилось'));
  }
  return data;
}

function render() {
  if (!state.data) return;
  const snap = JSON.stringify({ data: state.data, admin: state.admin, name: myName() });
  if (snap === lastSnap) return;
  lastSnap = snap;
  renderHero();
  renderKaspi();
  renderGifts();
  renderAdminBar();
  tickCountdown();
}

function renderHero() {
  const profile = state.data.profile;
  document.title = `Вишлист · ${profile.name || 'Куроми'}`;
  const photo = h('div', {
    class: `polaroid${state.admin ? ' clickable' : ''}`,
    'data-action': state.admin ? 'open-profile' : null,
    role: state.admin ? 'button' : null,
    tabindex: state.admin ? '0' : null,
    'aria-label': state.admin ? 'Изменить фото и имя' : null,
  });
  const src = safeImg(profile.photo);
  if (src) {
    const img = h('img', { src, alt: profile.name || 'Именинник' });
    img.addEventListener('error', () => {
      img.replaceWith(emptyPhoto());
    });
    photo.append(img);
  } else {
    photo.append(emptyPhoto());
  }
  photo.append(h('span', { class: 'polaroid-caption' }, profile.name || 'Именинник'));

  const copy = h('div', { class: 'hero-copy' });
  copy.append(h('p', { class: 'eyebrow' }, 'день рождения'));
  copy.append(h('h1', { class: 'hero-name' }, profile.name || 'Именинник'));
  const date = formatDate(profile.date);
  if (date) copy.append(h('p', { class: 'hero-date' }, date));
  copy.append(h('div', { id: 'hero-count', class: 'countdown', role: 'timer', 'aria-live': 'off' }));
  if (profile.message) copy.append(h('p', { class: 'hero-message' }, profile.message));
  document.getElementById('hero').replaceChildren(h('div', { class: 'hero' }, [photo, copy]));
}

function emptyPhoto() {
  return h('div', { class: 'polaroid-empty' }, [
    svgUse('i-bow'),
    h('span', {}, state.admin ? 'Нажми и добавь фото' : 'Фото скоро появится'),
  ]);
}

function renderKaspi() {
  const digits = String(state.data.kaspi || '').replace(/\D/g, '');
  const block = h('div', { class: 'kaspi' }, [
    h('div', {}, [
      h('p', { class: 'kaspi-kicker' }, 'Перевод Kaspi'),
      h('button', { class: 'kaspi-number', type: 'button', 'data-action': 'copy-kaspi' }, formatKaspi(digits)),
      h('p', { class: 'kaspi-note' }, 'На телефоне откроется приложение. Номер вставь в перевод по телефону.'),
    ]),
    h('div', { class: 'kaspi-actions' }, [
      h('button', { class: 'btn yellow', type: 'button', 'data-action': 'copy-kaspi' }, 'Скопировать номер'),
      h('a', {
        class: 'btn primary',
        href: 'https://kaspi.kz/',
        'data-action': 'open-kaspi',
      }, 'Открыть приложение'),
    ]),
  ]);
  document.getElementById('kaspi').replaceChildren(block);
}

function renderGifts() {
  const gifts = state.data.gifts || [];
  const free = gifts.filter((gift) => !gift.reservedBy).length;
  const mineCount = gifts.filter((gift) => sameName(gift.reservedBy, myName())).length;
  const counts = document.getElementById('counts');
  const pills = [];
  if (gifts.length) {
    pills.push(h('span', { class: 'pill' }, `Свободно ${free}`));
    pills.push(h('span', { class: 'pill dark' }, `Занято ${gifts.length - free}`));
    if (!state.admin && mineCount) pills.push(h('span', { class: 'pill' }, `Твои ${mineCount}`));
  }
  counts.replaceChildren(...pills);

  const sorted = gifts
    .map((gift, index) => ({ gift, index }))
    .sort((a, b) => Number(Boolean(a.gift.reservedBy)) - Number(Boolean(b.gift.reservedBy)) || a.index - b.index);

  const nodes = sorted.map(({ gift }) => giftCard(gift));
  if (!nodes.length) {
    nodes.push(h('div', { class: 'empty' }, [
      svgUse('i-heart'),
      h('p', { class: 'empty-title' }, 'Подарков пока нет'),
      h('p', {}, 'Здесь будут желания с фото и ссылкой на магазин.'),
    ]));
  }
  if (state.admin) {
    nodes.push(h('button', { class: 'add-card', type: 'button', 'data-action': 'open-add' }, [
      svgUse('i-spark'),
      h('span', {}, 'Добавить подарок'),
    ]));
  }
  document.getElementById('gifts').replaceChildren(...nodes);
}

function giftCard(gift) {
  const taken = Boolean(gift.reservedBy);
  const mine = taken && sameName(gift.reservedBy, myName());
  const card = h('article', { class: `gift${taken ? ' taken' : ''}${mine ? ' mine' : ''}` });
  const photo = h('div', { class: 'gift-photo' });
  const src = safeImg(gift.image);
  if (src) {
    const img = h('img', { src, alt: gift.title, loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(photoFallback(gift.id)));
    photo.append(img);
  } else {
    photo.append(photoFallback(gift.id));
  }
  if (gift.price) photo.append(h('span', { class: 'price-tag' }, gift.price));
  if (taken) photo.append(h('span', { class: 'stamp' }, mine ? 'Твой' : 'Занято'));
  card.append(photo);

  const body = h('div', { class: 'gift-body' });
  body.append(h('h3', { class: 'gift-title' }, gift.title));
  if (gift.description) body.append(h('p', { class: 'gift-desc' }, gift.description));
  if (mine) body.append(h('p', { class: 'reserved' }, `${myName()} подарит это`));
  else if (taken) body.append(h('p', { class: 'reserved' }, `Подарит ${gift.reservedBy}`));

  const actions = h('div', { class: 'gift-actions' });
  if (isHttp(gift.link)) {
    actions.append(h('a', {
      class: 'btn tiny',
      href: gift.link,
      target: '_blank',
      rel: 'noopener noreferrer',
    }, 'Где купить'));
  }
  if (!taken && !state.admin) {
    actions.append(h('button', {
      class: 'btn tiny primary',
      type: 'button',
      'data-action': 'reserve',
      'data-id': gift.id,
    }, 'Хочу подарить'));
  } else if (mine) {
    actions.append(h('button', {
      class: 'btn tiny',
      type: 'button',
      'data-action': 'unreserve',
      'data-id': gift.id,
    }, 'Снять бронь'));
  } else if (taken) {
    actions.append(h('button', { class: 'btn tiny', type: 'button', disabled: 'disabled' }, 'Уже занято'));
  }
  if (state.admin) {
    actions.append(h('button', {
      class: 'btn tiny',
      type: 'button',
      'data-action': 'edit-gift',
      'data-id': gift.id,
    }, 'Изменить'));
  }
  body.append(actions);
  card.append(body);
  return card;
}

function photoFallback(id) {
  const icon = ICONS[(id || 'a').charCodeAt(0) % ICONS.length];
  return h('div', { class: 'gift-fallback' }, svgUse(icon));
}

function renderAdminBar() {
  const bar = document.getElementById('adminbar');
  const edit = document.getElementById('edit-btn');
  if (!state.admin) {
    const gifts = (state.data && state.data.gifts) || [];
    const mine = gifts.filter((gift) => sameName(gift.reservedBy, myName()));
    const note = mine.length
      ? `${myName()} подарит: ${mine.map((gift) => gift.title).join(', ')}`
      : `${myName()}, можно выбрать несколько подарков. Один подарок — только один человек.`;
    bar.replaceChildren(h('div', { class: 'adminbar guestbar' }, [h('span', {}, note)]));
    edit.textContent = 'Другой вход';
    edit.dataset.action = 'back-to-gate';
    return;
  }
  edit.textContent = 'Профиль';
  edit.dataset.action = 'open-profile';
  bar.replaceChildren(h('div', { class: 'adminbar' }, [
    h('span', {}, 'Можно менять фото, подарки и брони'),
    h('button', { class: 'btn tiny', type: 'button', 'data-action': 'open-add' }, 'Добавить подарок'),
    h('button', { class: 'btn tiny', type: 'button', 'data-action': 'open-profile' }, 'Фото и имя'),
    h('button', { class: 'btn tiny', type: 'button', 'data-action': 'back-to-gate' }, 'Другой вход'),
  ]));
}

function showError(message) {
  document.getElementById('hero').replaceChildren(h('p', { class: 'load-error' }, message));
}

async function reload(options = {}) {
  try {
    state.data = await api('api/wishlist');
    render();
  } catch (error) {
    try {
      const response = await fetch('wishlist.json');
      if (!response.ok) throw error;
      state.data = await response.json();
      render();
      return;
    } catch {
      if (!state.data) showError(error.message);
      if (!options.quiet) toast(error.message);
    }
  }
}

function previewFile(input, img) {
  const file = input.files && input.files[0];
  if (!file) return;
  img.src = URL.createObjectURL(file);
  img.hidden = false;
}

function field(form, name) {
  return form.elements.namedItem(name);
}

function openProfile() {
  const profile = state.data.profile;
  const form = document.getElementById('form-profile');
  field(form, 'name').value = profile.name || '';
  field(form, 'date').value = profile.date || '';
  field(form, 'message').value = profile.message || '';
  field(form, 'kaspi').value = state.data.kaspi || '';
  field(form, 'password').value = '';
  field(form, 'image').value = '';
  field(form, 'removeImage').checked = false;
  const preview = document.getElementById('profile-preview');
  const src = safeImg(profile.photo);
  preview.hidden = !src;
  preview.src = src || '';
  openModal('modal-profile');
}

function openGift(gift) {
  const form = document.getElementById('form-gift');
  form.reset();
  field(form, 'id').value = gift ? gift.id : '';
  document.getElementById('gift-title').textContent = gift ? 'Изменить подарок' : 'Новый подарок';
  const status = document.getElementById('gift-status');
  status.hidden = !(gift && gift.reservedBy);
  status.textContent = gift && gift.reservedBy ? `Забронировал: ${gift.reservedBy}` : '';
  document.getElementById('gift-delete').hidden = !gift;
  document.getElementById('gift-release').hidden = !(gift && gift.reservedBy);
  document.getElementById('gift-remove-wrap').hidden = !gift;
  const preview = document.getElementById('gift-preview');
  if (gift) {
    field(form, 'title').value = gift.title || '';
    field(form, 'price').value = gift.price || '';
    field(form, 'link').value = gift.link || '';
    field(form, 'description').value = gift.description || '';
    field(form, 'imageUrl').value = isHttp(gift.image) ? gift.image : '';
    const src = safeImg(gift.image);
    preview.hidden = !src;
    preview.src = src || '';
  } else {
    preview.hidden = true;
    preview.removeAttribute('src');
  }
  openModal('modal-gift');
}

function openReserve(id) {
  const gift = (state.data.gifts || []).find((item) => item.id === id);
  if (!gift || gift.reservedBy) {
    toast('Этот подарок уже занят');
    reload({ quiet: true });
    return;
  }
  const form = document.getElementById('form-reserve');
  field(form, 'id').value = id;
  field(form, 'name').value = myName();
  document.getElementById('reserve-text').textContent = `«${gift.title}» можно закрепить за одним человеком.`;
  openModal('modal-reserve');
}

async function submitLogin(form) {
  const data = await api('api/admin/login', {
    method: 'POST',
    json: { password: new FormData(form).get('password') },
    authRedirect: false,
  });
  state.token = data.token;
  state.admin = true;
  state.role = 'owner';
  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(ROLE_KEY, 'owner');
  lastSnap = '';
  closeModals();
  showApp();
  render();
  toast('Можно добавлять фото и подарки');
}

function payload(form) {
  const data = new FormData(form);
  const file = data.get('image');
  if (file instanceof File && !file.size) data.delete('image');
  if (!String(data.get('password') || '').trim()) data.delete('password');
  return data;
}

async function submitProfile(form) {
  const data = await api('api/admin/profile', { method: 'POST', body: payload(form) });
  state.data = data;
  lastSnap = '';
  closeModals();
  render();
  toast('Сохранено');
}

async function submitGift(form) {
  const body = payload(form);
  const id = body.get('id');
  const data = await api(id ? `api/admin/gifts/${id}` : 'api/admin/gifts', {
    method: 'POST',
    body,
  });
  state.data = data;
  lastSnap = '';
  closeModals();
  render();
  toast(id ? 'Подарок обновлён' : 'Подарок добавлен');
}

async function submitReserve(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  const data = await api('api/reserve', { method: 'POST', json: payload });
  localStorage.setItem(NAME_KEY, payload.name.trim());
  state.data = data;
  lastSnap = '';
  closeModals();
  render();
  toast('Подарок за тобой. Другие его уже не выберут.');
}

function openKaspiApp() {
  const web = 'https://kaspi.kz/';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) {
    const fallback = encodeURIComponent(web);
    window.location.href = `intent://kaspi.kz/#Intent;scheme=https;package=kz.kaspi.mobile;S.browser_fallback_url=${fallback};end`;
    return;
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    window.location.href = web;
    return;
  }
  const opened = window.open(web, '_blank', 'noopener');
  if (!opened) window.location.href = web;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = h('textarea', {}, text);
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast('Скопировано');
}

document.addEventListener('click', async (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger || pending) return;
  const { action, id } = trigger.dataset;
  try {
    if (action === 'close-modal') closeModals();
    if (action === 'enter-owner') enterOwner();
    if (action === 'open-login') openModal('modal-login');
    if (action === 'open-profile') openProfile();
    if (action === 'open-add') openGift(null);
    if (action === 'edit-gift') openGift((state.data.gifts || []).find((gift) => gift.id === id));
    if (action === 'reserve') {
      const gift = (state.data.gifts || []).find((item) => item.id === id);
      const name = myName();
      if (name.length < 2) {
        showGate();
        toast('Сначала напиши имя');
        return;
      }
      if (!gift || gift.reservedBy) {
        toast('Этот подарок уже занят');
        reload({ quiet: true });
        return;
      }
      pending = true;
      state.data = await api('api/reserve', { method: 'POST', json: { id, name } });
      lastSnap = '';
      render();
      toast(`${name}, подарок за тобой. Можно выбрать ещё.`);
    }
    if (action === 'open-kaspi') {
      event.preventDefault();
      openKaspiApp();
    }
    if (action === 'copy-kaspi') await copyText(String(state.data.kaspi || '').replace(/\D/g, ''));
    if (action === 'copy-link') await copyText(window.location.href);
    if (action === 'back-to-gate') {
      pending = true;
      if (state.token) {
        await api('api/admin/logout', { method: 'POST', authRedirect: false }).catch(() => {});
      }
      state.admin = false;
      state.role = '';
      state.token = '';
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(ROLE_KEY);
      lastSnap = '';
      closeModals();
      showGate();
    }
    if (action === 'unreserve') {
      if (!window.confirm('Снять бронь с этого подарка?')) return;
      pending = true;
      state.data = await api('api/unreserve', { method: 'POST', json: { id, name: myName() } });
      lastSnap = '';
      render();
      toast('Бронь снята, подарок снова можно выбрать');
    }
    if (action === 'release-gift') {
      const giftId = document.getElementById('gift-id').value;
      pending = true;
      state.data = await api(`api/admin/gifts/${giftId}/release`, { method: 'POST' });
      lastSnap = '';
      closeModals();
      render();
      toast('Бронь снята');
    }
    if (action === 'delete-gift') {
      const giftId = document.getElementById('gift-id').value;
      if (!window.confirm('Удалить этот подарок?')) return;
      pending = true;
      state.data = await api(`api/admin/gifts/${giftId}`, { method: 'DELETE' });
      lastSnap = '';
      closeModals();
      render();
      toast('Подарок удалён');
    }
  } catch (error) {
    toast(error.message);
  } finally {
    pending = false;
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const formId = form.getAttribute('id');
  if (!['form-login', 'form-profile', 'form-gift', 'form-reserve', 'form-guest'].includes(formId)) return;
  event.preventDefault();
  if (pending) return;
  pending = true;
  try {
    if (formId === 'form-guest') enterGuest(new FormData(form).get('name'));
    if (formId === 'form-login') await submitLogin(form);
    if (formId === 'form-profile') await submitProfile(form);
    if (formId === 'form-gift') await submitGift(form);
    if (formId === 'form-reserve') await submitReserve(form);
  } catch (error) {
    toast(error.message);
    if (String(error.message).includes('уже занят')) reload({ quiet: true });
  } finally {
    pending = false;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModals();
  const target = event.target;
  if ((event.key === 'Enter' || event.key === ' ') && target instanceof HTMLElement && target.dataset.action && !['BUTTON', 'A', 'INPUT', 'TEXTAREA'].includes(target.tagName)) {
    event.preventDefault();
    target.click();
  }
});

field(document.getElementById('form-profile'), 'image').addEventListener('change', (event) => {
  previewFile(event.target, document.getElementById('profile-preview'));
});

field(document.getElementById('form-gift'), 'image').addEventListener('change', (event) => {
  previewFile(event.target, document.getElementById('gift-preview'));
});

async function boot() {
  const remembered = sessionStorage.getItem(ROLE_KEY);
  if (state.token) {
    try {
      await api('api/admin/me', { authRedirect: false });
      state.admin = true;
      state.role = 'owner';
    } catch {
      state.admin = false;
      state.token = '';
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }
  if (!state.admin && remembered === 'guest' && myName().length >= 2) state.role = 'guest';
  if (state.role) showApp();
  else showGate();
  await reload({ quiet: !state.role });
  tickCountdown();
  setInterval(tickCountdown, 1000);
  setInterval(() => {
    if (document.hidden) return;
    if (document.querySelector('.modal:not([hidden])')) return;
    reload({ quiet: true });
  }, 15000);
}

boot();

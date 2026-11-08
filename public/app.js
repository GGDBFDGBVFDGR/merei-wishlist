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
  if (src.startsWith('data:image/')) return src;
  if (src.startsWith('/uploads/')) return src.slice(1);
  if (src.startsWith('uploads/')) return src;
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

function birthdayTarget(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function paintCountdown(node, target) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today.getTime() === target.getTime()) {
    if (node.dataset.mode !== 'today') {
      node.dataset.mode = 'today';
      node.hidden = false;
      node.className = 'countdown is-today';
      node.replaceChildren(h('p', { class: 'countdown-today' }, 'Сегодня день рождения'));
    }
    return;
  }
  if (today > target) {
    node.dataset.mode = 'past';
    node.hidden = true;
    node.replaceChildren();
    return;
  }
  const total = Math.max(0, Math.floor((target - now) / 1000));
  const values = [
    Math.floor(total / 86400),
    Math.floor((total % 86400) / 3600),
    Math.floor((total % 3600) / 60),
    total % 60,
  ];
  if (node.dataset.mode !== 'left' || node.querySelectorAll('.count-cell b').length !== 4) {
    node.dataset.mode = 'left';
    node.hidden = false;
    node.className = 'countdown';
    node.replaceChildren(
      h('p', { class: 'countdown-label' }, 'осталось'),
      ...['дн', 'ч', 'мин', 'сек'].map((label) => h('div', { class: 'count-cell' }, [
        h('b', {}, '00'),
        h('span', {}, label),
      ]))
    );
  }
  node.querySelectorAll('.count-cell b').forEach((cell, index) => {
    const text = String(values[index]).padStart(2, '0');
    if (cell.textContent !== text) cell.textContent = text;
  });
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

const CLOUD_NS = 'merei-wishlist-7k3';
const CLOUD_KEY = '440687c43f42e339a0f642bf31d09528639d1f650248464e94ad80369f866c44';
const CLOUD_ROOT = 'https://mantledb.sh/v2';

let loginFails = [];

function cleanText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function newId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function httpUrl(value) {
  const link = cleanText(value, 500);
  if (link && !isHttp(link)) throw new Error('Ссылка должна начинаться с http:// или https://');
  return link;
}

async function cloudRequest(urlPath, method, body) {
  let response;
  try {
    response = await fetch(`${CLOUD_ROOT}/${urlPath}`, {
      method,
      headers: {
        'X-Mantle-Key': CLOUD_KEY,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Нет связи. Проверь интернет и открой страницу ещё раз.');
  }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(payload.message || payload.error || 'Не получилось сохранить');
  return payload;
}

function orderGifts(gifts, order) {
  const byId = new Map(gifts.map((gift) => [gift.id, gift]));
  const ordered = [];
  (order || []).forEach((id) => {
    if (!byId.has(id)) return;
    ordered.push(byId.get(id));
    byId.delete(id);
  });
  byId.forEach((gift) => ordered.push(gift));
  return ordered;
}

function toPublic(data) {
  return {
    profile: {
      name: data.profile.name || '',
      date: data.profile.date || '',
      message: data.profile.message || '',
      photo: data.profile.photo || '',
    },
    kaspi: data.kaspi || '',
    gifts: (data.gifts || []).map((gift) => ({
      id: gift.id,
      title: gift.title || '',
      description: gift.description || '',
      price: gift.price || '',
      link: gift.link || '',
      image: gift.image || '',
      reservedBy: gift.reservedBy || '',
    })),
  };
}

async function loadRecord() {
  const listed = await cloudRequest(`list/${CLOUD_NS}`, 'GET');
  const paths = ((listed && listed.entries) || []).map((entry) => entry.path);
  if (!paths.includes('meta')) throw new Error('Список ещё открывается. Обнови страницу через минуту.');
  const meta = await cloudRequest(`${CLOUD_NS}/meta`, 'GET');
  if (!meta) throw new Error('Список ещё открывается. Обнови страницу через минуту.');
  const gifts = [];
  for (const giftPath of paths.filter((item) => item.startsWith('gift/'))) {
    const gift = await cloudRequest(`${CLOUD_NS}/${giftPath}`, 'GET');
    if (gift && gift.id) gifts.push(gift);
  }
  return {
    profile: {
      name: meta.name || '',
      date: meta.date || '',
      message: meta.message || '',
      photo: meta.photo || '',
    },
    kaspi: meta.kaspi || '',
    adminPassword: meta.adminPassword || '',
    gifts: orderGifts(gifts, meta.order),
  };
}

async function saveMeta(data) {
  await cloudRequest(`${CLOUD_NS}/meta`, 'POST', {
    name: data.profile.name || '',
    date: data.profile.date || '',
    message: data.profile.message || '',
    photo: data.profile.photo || '',
    kaspi: data.kaspi || '',
    adminPassword: data.adminPassword || '',
    order: data.gifts.map((gift) => gift.id),
  });
}

async function saveGift(gift) {
  await cloudRequest(`${CLOUD_NS}/gift/${gift.id}`, 'POST', {
    id: gift.id,
    title: gift.title || '',
    description: gift.description || '',
    price: gift.price || '',
    link: gift.link || '',
    image: gift.image || '',
    reservedBy: gift.reservedBy || '',
  });
}

async function compressImage(file) {
  if (!file || !file.size) return '';
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type || '')) {
    throw new Error('Можно загрузить только картинку JPG, PNG, WEBP или GIF');
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('Картинка больше 8 МБ');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
  if (!blob) throw new Error('Не получилось сжать фото');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не получилось прочитать фото'));
    reader.readAsDataURL(blob);
  });
  if (dataUrl.length > 180000) throw new Error('Фото слишком большое. Выбери другое или вставь ссылку.');
  return dataUrl;
}

function assertAdmin(url, options) {
  if (state.token.startsWith('cloud-')) return;
  if (options.authRedirect !== false) {
    state.admin = false;
    state.token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    lastSnap = '';
    openModal('modal-login');
  }
  throw new Error('Нужно войти заново');
}

async function api(url, options = {}) {
  const method = options.method || 'GET';
  if (url === 'api/wishlist' && method === 'GET') return toPublic(await loadRecord());

  if (url === 'api/reserve' && method === 'POST') {
    const name = cleanText(options.json.name, 40);
    const id = cleanText(options.json.id, 40);
    if (name.length < 2) throw new Error('Напиши, как тебя зовут');
    const data = await loadRecord();
    const gift = data.gifts.find((item) => item.id === id);
    if (!gift) throw new Error('Подарок не найден');
    if (gift.reservedBy) throw new Error('Этот подарок уже занят');
    gift.reservedBy = name;
    await saveGift(gift);
    const saved = await cloudRequest(`${CLOUD_NS}/gift/${id}`, 'GET');
    if (!saved || !sameName(saved.reservedBy, name)) throw new Error('Этот подарок уже занят');
    return toPublic(await loadRecord());
  }

  if (url === 'api/unreserve' && method === 'POST') {
    const name = cleanText(options.json.name, 40);
    const id = cleanText(options.json.id, 40);
    if (name.length < 2) throw new Error('Напиши то же имя, которым бронировала');
    const data = await loadRecord();
    const gift = data.gifts.find((item) => item.id === id);
    if (!gift) throw new Error('Подарок не найден');
    if (gift.reservedBy && !sameName(gift.reservedBy, name)) {
      throw new Error('Снять бронь может только тот, кто её поставил');
    }
    gift.reservedBy = '';
    await saveGift(gift);
    return toPublic(await loadRecord());
  }

  if (url === 'api/admin/login' && method === 'POST') {
    const now = Date.now();
    loginFails = loginFails.filter((time) => now - time < 10 * 60 * 1000);
    if (loginFails.length >= 12) throw new Error('Слишком много попыток. Подожди немного.');
    const data = await loadRecord();
    const password = String((options.json && options.json.password) || '');
    if (password !== String(data.adminPassword || '')) {
      loginFails.push(Date.now());
      throw new Error('Неверный пароль');
    }
    return { token: `cloud-${newId()}` };
  }

  if (url === 'api/admin/logout') return { ok: true };
  if (url === 'api/admin/me') {
    assertAdmin(url, options);
    return { ok: true };
  }

  if (url === 'api/admin/profile' && method === 'POST') {
    assertAdmin(url, options);
    const form = options.body;
    const data = await loadRecord();
    const name = cleanText(form.get('name'), 40);
    if (name.length < 2) throw new Error('Добавь имя именинника');
    const date = String(form.get('date') || '').trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Некорректная дата');
    const kaspi = String(form.get('kaspi') || '').replace(/\D/g, '');
    if (!/^8\d{10}$/.test(kaspi)) throw new Error('Номер Kaspi: 11 цифр, начинается с 8');
    const nextPassword = String(form.get('password') || '').trim();
    if (nextPassword && nextPassword.length < 4) throw new Error('Пароль должен быть длиннее 3 символов');
    let photo = data.profile.photo || '';
    if (form.get('removeImage') === '1') photo = '';
    const file = form.get('image');
    if (file instanceof File && file.size) photo = await compressImage(file);
    data.profile = { name, date, message: cleanText(form.get('message'), 280), photo };
    data.kaspi = kaspi;
    if (nextPassword) data.adminPassword = nextPassword;
    await saveMeta(data);
    return toPublic(data);
  }

  if ((url === 'api/admin/gifts' || url.startsWith('api/admin/gifts/')) && method === 'POST' && !url.endsWith('/release')) {
    assertAdmin(url, options);
    const form = options.body;
    const data = await loadRecord();
    const id = url === 'api/admin/gifts' ? '' : decodeURIComponent(url.slice('api/admin/gifts/'.length));
    const previous = id ? data.gifts.find((item) => item.id === id) : null;
    if (id && !previous) throw new Error('Подарок не найден');
    const title = cleanText(form.get('title'), 80);
    if (title.length < 2) throw new Error('Добавь название подарка');
    const link = httpUrl(form.get('link'));
    const imageUrl = cleanText(form.get('imageUrl'), 500);
    if (imageUrl && !isHttp(imageUrl)) throw new Error('Ссылка на фото должна начинаться с http:// или https://');
    let image = previous ? previous.image || '' : '';
    const file = form.get('image');
    if (file instanceof File && file.size) image = await compressImage(file);
    else if (imageUrl) image = imageUrl;
    else if (form.get('removeImage') === '1') image = '';
    const gift = {
      id: previous ? previous.id : newId(),
      title,
      description: cleanText(form.get('description'), 400),
      price: cleanText(form.get('price'), 40),
      link,
      image,
      reservedBy: previous ? previous.reservedBy || '' : '',
    };
    if (previous) Object.assign(previous, gift);
    else data.gifts.push(gift);
    await saveGift(gift);
    await saveMeta(data);
    return toPublic(data);
  }

  if (url.startsWith('api/admin/gifts/') && method === 'DELETE') {
    assertAdmin(url, options);
    const id = decodeURIComponent(url.slice('api/admin/gifts/'.length));
    const data = await loadRecord();
    if (!data.gifts.some((item) => item.id === id)) throw new Error('Подарок не найден');
    data.gifts = data.gifts.filter((item) => item.id !== id);
    await cloudRequest(`${CLOUD_NS}/gift/${id}`, 'DELETE');
    await saveMeta(data);
    return toPublic(data);
  }

  if (url.endsWith('/release') && method === 'POST') {
    assertAdmin(url, options);
    const id = decodeURIComponent(url.slice('api/admin/gifts/'.length, -'/release'.length));
    const data = await loadRecord();
    const gift = data.gifts.find((item) => item.id === id);
    if (!gift) throw new Error('Подарок не найден');
    gift.reservedBy = '';
    await saveGift(gift);
    return toPublic(data);
  }

  throw new Error('Не получилось');
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
  const frame = h('div', { class: 'polaroid-photo' });
  const src = safeImg(profile.photo);
  if (src) {
    const img = h('img', { src, alt: profile.name || 'Именинник' });
    img.addEventListener('error', () => {
      frame.replaceChildren(emptyPhoto());
    });
    frame.append(img);
  } else {
    frame.append(emptyPhoto());
  }
  photo.append(frame);
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
    if (!state.data) showError(error.message);
    if (!options.quiet) toast(error.message);
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

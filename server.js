const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const multer = require('multer');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'wishlist.json');
const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads');

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DEFAULT_DATA = {
  profile: {
    name: 'Мерей',
    date: '2026-12-03',
    message: 'Напиши имя и выбери подарки. Можно взять несколько, но один подарок выбирает только один человек.',
    photo: '',
  },
  kaspi: '87005050822',
  adminPassword: 'kuromi',
  gifts: [],
};

function readData() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    raw.profile = { ...DEFAULT_DATA.profile, ...(raw.profile || {}) };
    raw.gifts = Array.isArray(raw.gifts) ? raw.gifts : [];
    raw.kaspi = raw.kaspi || DEFAULT_DATA.kaspi;
    raw.adminPassword = raw.adminPassword || DEFAULT_DATA.adminPassword;
    return raw;
  } catch (error) {
    if (error.code === 'ENOENT') {
      writeData(DEFAULT_DATA);
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
    throw error;
  }
}

function writeData(data) {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let queue = Promise.resolve();

function withData(mutator) {
  const run = queue.then(async () => {
    const data = readData();
    const result = await mutator(data);
    writeData(data);
    return result;
  });
  queue = run.then(
    () => {},
    () => {}
  );
  return run;
}

function publicView(data) {
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

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function cleanText(value, max) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function localUploadPath(urlPath) {
  if (!urlPath || !urlPath.startsWith('/uploads/')) return null;
  const base = path.basename(urlPath);
  const full = path.resolve(UPLOAD_DIR, base);
  if (!full.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) return null;
  return full;
}

function removeUpload(urlPath) {
  const full = localUploadPath(urlPath);
  if (!full) return;
  fs.rm(full, { force: true }, () => {});
}

const tokens = new Map();
const TOKEN_TTL = 12 * 60 * 60 * 1000;

function auth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expires = tokens.get(token);
  if (!token || !expires || expires < Date.now()) {
    tokens.delete(token);
    return res.status(401).json({ error: 'Нужно войти заново' });
  }
  next();
}

let loginFails = [];

function tooManyLogins() {
  const now = Date.now();
  loginFails = loginFails.filter((time) => now - time < 10 * 60 * 1000);
  return loginFails.length >= 12;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      cb(new Error('Можно загрузить только картинку JPG, PNG, WEBP или GIF'));
      return;
    }
    cb(null, true);
  },
});

function optionalImage(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Картинка больше 8 МБ' });
    }
    return res.status(400).json({ error: error.message || 'Не получилось загрузить картинку' });
  });
}

function giftFromBody(body, file, previous) {
  const title = cleanText(body.title, 80);
  if (title.length < 2) fail(400, 'Добавь название подарка');

  const link = cleanText(body.link, 500);
  if (link && !isHttpUrl(link)) fail(400, 'Ссылка должна начинаться с http:// или https://');

  const imageUrl = cleanText(body.imageUrl, 500);
  if (imageUrl && !isHttpUrl(imageUrl)) fail(400, 'Ссылка на фото должна начинаться с http:// или https://');

  let image = previous ? previous.image || '' : '';
  const previousImage = image;
  if (file) image = `/uploads/${file.filename}`;
  else if (imageUrl) image = imageUrl;
  else if (body.removeImage === '1') image = '';
  if (previousImage && previousImage !== image) removeUpload(previousImage);

  return {
    id: previous ? previous.id : crypto.randomBytes(8).toString('hex'),
    title,
    description: cleanText(body.description, 400),
    price: cleanText(body.price, 40),
    link,
    image,
    reservedBy: previous ? previous.reservedBy || '' : '',
  };
}

const app = express();
app.disable('x-powered-by');
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '1mb' }));

app.get('/api/wishlist', (req, res) => {
  res.json(publicView(readData()));
});

app.post('/api/reserve', async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 40);
    const id = cleanText(req.body.id, 40);
    if (name.length < 2) fail(400, 'Напиши, как тебя зовут');
    const wishlist = await withData((data) => {
      const gift = (data.gifts || []).find((item) => item.id === id);
      if (!gift) fail(404, 'Подарок не найден');
      if (gift.reservedBy) fail(409, 'Этот подарок уже занят');
      gift.reservedBy = name;
      return publicView(data);
    });
    res.json(wishlist);
  } catch (error) {
    next(error);
  }
});

app.post('/api/unreserve', async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 40);
    const id = cleanText(req.body.id, 40);
    if (name.length < 2) fail(400, 'Напиши то же имя, которым бронировала');
    const wishlist = await withData((data) => {
      const gift = (data.gifts || []).find((item) => item.id === id);
      if (!gift) fail(404, 'Подарок не найден');
      if (!gift.reservedBy) return publicView(data);
      if (gift.reservedBy.toLowerCase() !== name.toLowerCase()) {
        fail(403, 'Снять бронь может только тот, кто её поставил');
      }
      gift.reservedBy = '';
      return publicView(data);
    });
    res.json(wishlist);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', (req, res) => {
  if (tooManyLogins()) {
    return res.status(429).json({ error: 'Слишком много попыток. Подожди немного.' });
  }
  const data = readData();
  const password = String(req.body.password || '');
  if (!safeEqual(password, data.adminPassword || '')) {
    loginFails.push(Date.now());
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, Date.now() + TOKEN_TTL);
  res.json({ token });
});

app.post('/api/admin/logout', auth, (req, res) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  tokens.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/me', auth, (req, res) => {
  res.json({ ok: true });
});

app.post('/api/admin/profile', auth, optionalImage, async (req, res, next) => {
  try {
    const wishlist = await withData((data) => {
      const name = cleanText(req.body.name, 40);
      if (name.length < 2) fail(400, 'Добавь имя именинника');
      const date = String(req.body.date || '').trim();
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, 'Некорректная дата');
      const kaspi = String(req.body.kaspi || '').replace(/\D/g, '');
      if (!/^8\d{10}$/.test(kaspi)) fail(400, 'Номер Kaspi: 11 цифр, начинается с 8');
      const nextPassword = String(req.body.password || '').trim();
      if (nextPassword && nextPassword.length < 4) fail(400, 'Пароль должен быть длиннее 3 символов');

      const previousPhoto = data.profile.photo || '';
      let photo = previousPhoto;
      if (req.body.removeImage === '1') photo = '';
      if (req.file) photo = `/uploads/${req.file.filename}`;
      if ((req.body.removeImage === '1' || req.file) && previousPhoto && previousPhoto !== photo) {
        removeUpload(previousPhoto);
      }

      data.profile.name = name;
      data.profile.date = date;
      data.profile.message = cleanText(req.body.message, 280);
      data.profile.photo = photo;
      data.kaspi = kaspi;
      if (nextPassword) data.adminPassword = nextPassword;
      return publicView(data);
    });
    res.json(wishlist);
  } catch (error) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    next(error);
  }
});

app.post('/api/admin/gifts', auth, optionalImage, async (req, res, next) => {
  try {
    const wishlist = await withData((data) => {
      data.gifts = data.gifts || [];
      data.gifts.push(giftFromBody(req.body, req.file, null));
      return publicView(data);
    });
    res.json(wishlist);
  } catch (error) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    next(error);
  }
});

app.post('/api/admin/gifts/:id', auth, optionalImage, async (req, res, next) => {
  try {
    const wishlist = await withData((data) => {
      const gift = (data.gifts || []).find((item) => item.id === req.params.id);
      if (!gift) fail(404, 'Подарок не найден');
      const nextGift = giftFromBody(req.body, req.file, gift);
      Object.assign(gift, nextGift);
      return publicView(data);
    });
    res.json(wishlist);
  } catch (error) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    next(error);
  }
});

app.delete('/api/admin/gifts/:id', auth, async (req, res, next) => {
  try {
    const wishlist = await withData((data) => {
      const gift = (data.gifts || []).find((item) => item.id === req.params.id);
      if (!gift) fail(404, 'Подарок не найден');
      removeUpload(gift.image);
      data.gifts = data.gifts.filter((item) => item.id !== req.params.id);
      return publicView(data);
    });
    res.json(wishlist);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/gifts/:id/release', auth, async (req, res, next) => {
  try {
    const wishlist = await withData((data) => {
      const gift = (data.gifts || []).find((item) => item.id === req.params.id);
      if (!gift) fail(404, 'Подарок не найден');
      gift.reservedBy = '';
      return publicView(data);
    });
    res.json(wishlist);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(ROOT, 'public')));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  const message = status >= 500 ? 'Что-то пошло не так' : error.message;
  res.status(status).json({ error: message || 'Что-то пошло не так' });
});

function lanUrls(port) {
  const urls = [];
  let nets = {};
  try {
    nets = os.networkInterfaces();
  } catch {
    return urls;
  }
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      const isV4 = net.family === 'IPv4' || net.family === 4;
      if (isV4 && !net.internal) urls.push(`http://${net.address}:${port}`);
    }
  }
  return urls;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Вишлист: http://localhost:${PORT}`);
  for (const url of lanUrls(PORT)) console.log(`В сети:    ${url}`);
});

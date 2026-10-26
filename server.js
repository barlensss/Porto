const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  name: 'bara.sid',
  secret: process.env.SESSION_SECRET || 'dev-only-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 8 }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return []; }
}
function saveUsers(users) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}
function safeUser(u) {
  return { id: u.id, email: u.email, role: u.role, createdAt: u.createdAt };
}
function currentUser(req) {
  if (!req.session.userId) return null;
  return loadUsers().find(u => u.id === req.session.userId) || null;
}
function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Silakan login dulu.' });
  req.user = user;
  next();
}
function requireCEO(req, res, next) {
  if (req.user.role !== 'CEO') return res.status(403).json({ error: 'Fitur ini khusus CEO.' });
  next();
}
function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 180;
}

async function seedCEO() {
  const email = (process.env.CEO_EMAIL || 'baraganteng@gmail.com').toLowerCase();
  const password = process.env.CEO_PASSWORD || 'barawow';
  const users = loadUsers();
  if (!users.some(u => u.email === email)) {
    users.push({
      id: require('crypto').randomUUID(),
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'CEO',
      createdAt: new Date().toISOString()
    });
    saveUsers(users);
    console.log(`CEO account initialized for ${email}. Change default credentials before public deployment.`);
  }
}
seedCEO().catch(err => { console.error('Could not initialize CEO account:', err); process.exit(1); });

app.post('/api/register', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  if (!validEmail(email)) return res.status(400).json({ error: 'Email tidak valid.' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 200)
    return res.status(400).json({ error: 'Password harus 8–200 karakter.' });
  const users = loadUsers();
  if (users.some(u => u.email === email)) return res.status(409).json({ error: 'Email sudah terdaftar.' });
  const user = {
    id: require('crypto').randomUUID(),
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'Member',
    createdAt: new Date().toISOString()
  };
  users.push(user);
  saveUsers(users);
  req.session.userId = user.id;
  res.status(201).json({ user: safeUser(user) });
});

app.post('/api/login', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  const user = loadUsers().find(u => u.email === email);
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: 'Email atau password salah.' });
  req.session.userId = user.id;
  res.json({ user: safeUser(user) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('bara.sid');
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  const user = currentUser(req);
  res.json({ user: user ? safeUser(user) : null });
});

app.get('/api/users', requireAuth, requireCEO, (req, res) => {
  res.json({ users: loadUsers().map(safeUser) });
});

app.patch('/api/users/:id/role', requireAuth, requireCEO, (req, res) => {
  const role = req.body.role;
  if (!['Member', 'Moderator', 'CEO'].includes(role))
    return res.status(400).json({ error: 'Role tidak dikenal.' });
  const users = loadUsers();
  const target = users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  if (target.id === req.user.id && role !== 'CEO')
    return res.status(400).json({ error: 'CEO tidak bisa menurunkan role akunnya sendiri.' });
  target.role = role;
  saveUsers(users);
  res.json({ user: safeUser(target) });
});

app.get('/api/moderator/overview', requireAuth, (req, res) => {
  if (!['Moderator', 'CEO'].includes(req.user.role))
    return res.status(403).json({ error: 'Menu ini khusus Moderator/CEO.' });
  res.json({ message: 'Akses moderator aktif.', totalAccounts: loadUsers().length, role: req.user.role });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Bara Portfolio jalan di http://0.0.0.0:${PORT}`));

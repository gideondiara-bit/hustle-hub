import "dotenv/config";
import express from "express";
import Database from "better-sqlite3";
import multer from "multer";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Default admin secret (change via ADMIN_SECRET env var in production if you want)
const ADMIN_SECRET = process.env.ADMIN_SECRET || "37fa4efa3decca0f446755bc8f5ea6cab6f758a1a125e6ae";

// Payment details (already set to your account)
const BANK_NAME = process.env.BANK_NAME || "Opay";
const BANK_ACCOUNT = process.env.BANK_ACCOUNT || "9014800674";
const ACCOUNT_NAME = process.env.ACCOUNT_NAME || "Oluwayemisi Alice Atimiri";

// Mail domain used for generated addresses (no real MX needed for simulation mode)
const MAIL_DOMAIN = process.env.MAIL_DOMAIN || "bombin.com";

// Data directory – on Railway mount a volume at /data so DB + uploads survive restarts
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.DB_PATH || path.join(dataDir, "hustle-hub.db");
const db = new Database(dbPath);
const uploadDir = process.env.UPLOAD_DIR || path.join(dataDir, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Simple in-memory rate limit for auth endpoints
const rateMap = new Map();
function rateLimit(key, max = 20, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  let entry = rateMap.get(key) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) entry = { count: 0, reset: now + windowMs };
  entry.count++;
  rateMap.set(key, entry);
  return entry.count <= max;
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  wallet INTEGER DEFAULT 0,
  pending_wallet INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mailboxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  address TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  country TEXT NOT NULL,
  plan TEXT NOT NULL,
  free_plan INTEGER DEFAULT 0,
  expires_at TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mailbox_id INTEGER NOT NULL,
  sender TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at TEXT DEFAULT CURRENT_TIMESTAMP,
  delete_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  mailbox_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  slip_path TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  reviewer_note TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const countries = {
  USA: ["Michael Carter", "James Wilson", "Daniel Brooks", "Ethan Miller", "Olivia Parker", "Emma Johnson", "Ava Thompson"],
  UK: ["Oliver Smith", "George Taylor", "Harry Brown", "Amelia Wilson", "Isla Thomas", "Emily Clarke"],
  Australia: ["Jack Williams", "Noah Anderson", "Liam Martin", "Charlotte Jones", "Mia Walker", "Sophie Hall"],
  Germany: ["Lukas Schneider", "Jonas Fischer", "Felix Weber", "Anna Müller", "Lea Wagner", "Hannah Becker"],
  France: ["Lucas Martin", "Julien Bernard", "Thomas Dubois", "Camille Moreau", "Chloé Laurent", "Emma Lefèvre"],
  Switzerland: ["Luca Müller", "Noah Meier", "Leon Keller", "Sophie Schmid", "Nina Weber", "Laura Frei"],
  Canada: ["Liam Smith", "Ethan Brown", "Noah Wilson", "Mia Taylor", "Emma Martin", "Olivia Clark"],
  Netherlands: ["Daan de Vries", "Sem Jansen", "Lucas de Boer", "Sophie Visser", "Emma Smit", "Mila Bakker"],
  Nigeria: ["Chinedu Okonkwo", "Adebayo Adeyemi", "Emeka Nwosu", "Ngozi Okafor", "Aisha Bello", "Funke Adewale", "Tunde Bakare"],
  India: ["Arjun Sharma", "Rohan Patel", "Vikram Singh", "Priya Reddy", "Ananya Gupta", "Neha Kapoor"],
  SouthAfrica: ["Thabo Nkosi", "Sipho Dlamini", "Johan van der Berg", "Lerato Molefe", "Aisha Khan", "Emma Botha"]
};

const plans = {
  weekly: { label: "Weekly", days: 7, price: 7500, limitPerCountry: 2 },
  monthly: { label: "Monthly", days: 30, price: 18000, limitPerCountry: 5 },
  annual: { label: "Annual", days: 365, price: 120000, limitPerCountry: Infinity }
};

function nowIso() {
  return new Date().toISOString();
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(":");
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}
function sessionToken() {
  return crypto.randomBytes(32).toString("hex");
}
function addressToken() {
  return crypto.randomBytes(3).toString("hex");
}
function slug(name) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/gi, "");
}
function notify(userId, title, body) {
  db.prepare("INSERT INTO notifications(user_id,title,body) VALUES(?,?,?)").run(userId, title, body);
}
function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Please log in." });
  const user = db
    .prepare(`SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=?`)
    .get(token);
  if (!user) return res.status(401).json({ error: "Session expired. Please log in again." });
  req.user = user;
  req.token = token;
  next();
}
function admin(req, res, next) {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Admin authentication failed." });
  }
  next();
}

function cleanup() {
  const now = Date.now();
  const graceCutoff = new Date(now - 3 * 86400000).toISOString();
  db.prepare("DELETE FROM messages WHERE delete_at < ?").run(nowIso());
  db.prepare("UPDATE mailboxes SET status='grace' WHERE status='active' AND expires_at < ?").run(nowIso());

  const expired = db
    .prepare(
      `SELECT id,user_id,address FROM mailboxes
       WHERE status='grace' AND expires_at < ?`
    )
    .all(graceCutoff);

  const tx = db.transaction(() => {
    for (const box of expired) {
      db.prepare("DELETE FROM messages WHERE mailbox_id=?").run(box.id);
      db.prepare("UPDATE mailboxes SET status='expired' WHERE id=?").run(box.id);
      notify(box.user_id, "Mailbox expired", `${box.address} has expired and its stored messages have been deleted.`);
    }
  });
  tx();
}
setInterval(cleanup, 30000);
cleanup();

/* ---------- Health ---------- */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    version: "3.0.0",
    time: nowIso(),
    bank: { name: BANK_NAME, account: BANK_ACCOUNT, holder: ACCOUNT_NAME }
  });
});

/* ---------- Auth ---------- */
app.post("/api/register", (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  if (!rateLimit(`reg:${ip}`, 8)) return res.status(429).json({ error: "Too many attempts. Try again later." });

  const { email, password } = req.body || {};
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: "Enter a valid email and a password of at least 6 characters." });
  }
  try {
    const r = db
      .prepare("INSERT INTO users(email,password_hash) VALUES(?,?)")
      .run(email.toLowerCase().trim(), hashPassword(password));
    const token = sessionToken();
    db.prepare("INSERT INTO sessions(token,user_id) VALUES(?,?)").run(token, r.lastInsertRowid);
    notify(
      r.lastInsertRowid,
      "Welcome to HUSTLE HUB",
      "You have a 36-hour free trial. You may create one free mailbox in one country."
    );
    res.json({ token, userId: r.lastInsertRowid, email: email.toLowerCase().trim() });
  } catch {
    res.status(409).json({ error: "That login email is already registered." });
  }
});

app.post("/api/login", (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  if (!rateLimit(`login:${ip}`, 15)) return res.status(429).json({ error: "Too many attempts. Try again later." });

  const { email, password } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE email=?").get((email || "").toLowerCase().trim());
  if (!u || !verifyPassword(password || "", u.password_hash)) {
    return res.status(401).json({ error: "Invalid login details." });
  }
  const token = sessionToken();
  db.prepare("INSERT INTO sessions(token,user_id) VALUES(?,?)").run(token, u.id);
  res.json({ token, userId: u.id, email: u.email });
});

app.post("/api/logout", auth, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token=?").run(req.token);
  res.json({ ok: true });
});

app.post("/api/change-password", auth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }
  if (!verifyPassword(currentPassword || "", req.user.password_hash)) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(newPassword), req.user.id);
  notify(req.user.id, "Password changed", "Your account password was successfully updated.");
  res.json({ ok: true });
});

/* ---------- User dashboard ---------- */
app.get("/api/dashboard", auth, (req, res) => {
  cleanup();
  const user = db
    .prepare("SELECT id,email,wallet,pending_wallet,created_at FROM users WHERE id=?")
    .get(req.user.id);
  const boxes = db
    .prepare(
      `SELECT id,address,display_name,country,plan,free_plan,expires_at,status,created_at
       FROM mailboxes WHERE user_id=? AND status!='expired' ORDER BY id DESC`
    )
    .all(req.user.id);
  const messages = db
    .prepare(
      `SELECT m.id,m.mailbox_id,m.sender,m.subject,m.body,m.received_at,m.delete_at,b.address
       FROM messages m JOIN mailboxes b ON b.id=m.mailbox_id
       WHERE b.user_id=? ORDER BY m.received_at DESC`
    )
    .all(req.user.id);
  const notifications = db
    .prepare(
      `SELECT id,title,body,read,created_at FROM notifications
       WHERE user_id=? ORDER BY id DESC LIMIT 30`
    )
    .all(req.user.id);

  const freeMailbox = db
    .prepare(`SELECT * FROM mailboxes WHERE user_id=? AND free_plan=1 ORDER BY id LIMIT 1`)
    .get(req.user.id);

  const trialHoursLeft = Math.max(
    0,
    36 - (Date.now() - new Date(user.created_at).getTime()) / 3600000
  );

  res.json({
    user,
    boxes,
    messages,
    notifications,
    freeMailbox,
    trialHoursLeft: Math.round(trialHoursLeft * 10) / 10,
    countries: Object.keys(countries),
    plans,
    paymentAccount: {
      bankName: BANK_NAME,
      accountNumber: BANK_ACCOUNT,
      accountName: ACCOUNT_NAME
    }
  });
});

/* Free trial: exactly one mailbox, 36 hours from account creation. */
app.post("/api/free-mailbox", auth, (req, res) => {
  const { country } = req.body || {};
  if (!countries[country]) return res.status(400).json({ error: "Choose a valid country." });

  const existing = db.prepare("SELECT * FROM mailboxes WHERE user_id=? AND free_plan=1").get(req.user.id);
  if (existing) return res.status(400).json({ error: "You have already used your one free mailbox." });

  const ageHours = (Date.now() - new Date(req.user.created_at).getTime()) / 3600000;
  if (ageHours >= 36) {
    return res.status(400).json({ error: "Your 36-hour free plan has expired. Subscribe to continue." });
  }

  const name = countries[country][Math.floor(Math.random() * countries[country].length)];
  const address = `${slug(name)}${addressToken()}@${MAIL_DOMAIN}`;
  const expires = new Date(new Date(req.user.created_at).getTime() + 36 * 3600000).toISOString();

  const r = db
    .prepare(
      `INSERT INTO mailboxes(user_id,address,display_name,country,plan,free_plan,expires_at)
       VALUES(?,?,?,?,?,?,?)`
    )
    .run(req.user.id, address, name, country, "free", 1, expires);

  notify(req.user.id, "Free mailbox created", `${address} is active for the remainder of your 36-hour trial.`);
  res.json({ ok: true, id: r.lastInsertRowid, address, name, country, expires_at: expires });
});

/* ---------- Funding ---------- */
app.post("/api/fund", auth, upload.single("slip"), (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: "Enter a valid amount in naira." });
  }
  if (!req.file) return res.status(400).json({ error: "Upload your payment slip." });

  db.prepare("UPDATE users SET pending_wallet=pending_wallet+? WHERE id=?").run(amount, req.user.id);
  const p = db
    .prepare(`INSERT INTO payments(user_id,amount,slip_path) VALUES(?,?,?)`)
    .run(req.user.id, amount, req.file.filename);

  notify(
    req.user.id,
    "Payment submitted",
    `₦${amount.toLocaleString()} was added as pending wallet credit. It cannot be spent until your payment slip is approved.`
  );
  res.json({ ok: true, paymentId: p.lastInsertRowid, pendingAmount: amount });
});

/* ---------- Purchase ---------- */
app.post("/api/purchase", auth, (req, res) => {
  cleanup();
  const { country, plan } = req.body || {};
  if (!countries[country] || !plans[plan]) {
    return res.status(400).json({ error: "Invalid country or plan." });
  }

  const p = plans[plan];
  if (req.user.wallet < p.price) {
    return res
      .status(400)
      .json({ error: "Your approved wallet balance is insufficient. Fund your wallet and wait for payment approval." });
  }

  if (p.limitPerCountry !== Infinity) {
    const count = db
      .prepare(
        `SELECT COUNT(*) AS c FROM mailboxes
         WHERE user_id=? AND country=? AND plan=? AND status IN ('active','grace')`
      )
      .get(req.user.id, country, plan).c;
    if (count >= p.limitPerCountry) {
      return res
        .status(400)
        .json({ error: `Your ${p.label} plan allows ${p.limitPerCountry} mailboxes for ${country}.` });
    }
  }

  const name = countries[country][Math.floor(Math.random() * countries[country].length)];
  const address = `${slug(name)}${addressToken()}@${MAIL_DOMAIN}`;
  const expires = new Date(Date.now() + p.days * 86400000).toISOString();

  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET wallet=wallet-? WHERE id=?").run(p.price, req.user.id);
    const b = db
      .prepare(
        `INSERT INTO mailboxes(user_id,address,display_name,country,plan,free_plan,expires_at)
         VALUES(?,?,?,?,?,?,?)`
      )
      .run(req.user.id, address, name, country, plan, 0, expires);
    db.prepare("INSERT INTO purchases(user_id,mailbox_id,plan,amount) VALUES(?,?,?,?)").run(
      req.user.id,
      b.lastInsertRowid,
      plan,
      p.price
    );
    return b.lastInsertRowid;
  });
  const mailboxId = tx();
  notify(req.user.id, "Mailbox purchased", `Your ${country} ${p.label.toLowerCase()} mailbox ${address} is ready.`);
  res.json({ ok: true, mailboxId, address, name, country, plan, expires_at: expires });
});

/* ---------- Notifications ---------- */
app.post("/api/notifications/read", auth, (req, res) => {
  db.prepare("UPDATE notifications SET read=1 WHERE user_id=?").run(req.user.id);
  res.json({ ok: true });
});

/* ---------- Admin ---------- */
app.get("/api/admin/summary", admin, (req, res) => {
  cleanup();
  const payments = db
    .prepare(
      `SELECT p.id,p.user_id,p.amount,p.status,p.created_at,p.reviewed_at,p.reviewer_note,
              u.email
       FROM payments p JOIN users u ON u.id=p.user_id
       WHERE p.status='pending' ORDER BY p.id DESC`
    )
    .all();
  const recentUsers = db
    .prepare(`SELECT id,email,wallet,pending_wallet,created_at FROM users ORDER BY id DESC LIMIT 50`)
    .all();
  const stats = {
    users: db.prepare("SELECT COUNT(*) c FROM users").get().c,
    activeMailboxes: db.prepare("SELECT COUNT(*) c FROM mailboxes WHERE status='active'").get().c,
    pendingPayments: payments.length,
    approvedVolume: db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='approved'").get().s
  };
  res.json({ stats, payments, recentUsers });
});

app.post("/api/admin/payment/:id/approve", admin, (req, res) => {
  const payment = db.prepare("SELECT * FROM payments WHERE id=? AND status='pending'").get(req.params.id);
  if (!payment) return res.status(404).json({ error: "Pending payment not found." });

  const tx = db.transaction(() => {
    db.prepare("UPDATE payments SET status='approved',reviewed_at=?,reviewer_note=? WHERE id=?").run(
      nowIso(),
      req.body?.note || "Approved",
      payment.id
    );
    db.prepare("UPDATE users SET pending_wallet=pending_wallet-?, wallet=wallet+? WHERE id=?").run(
      payment.amount,
      payment.amount,
      payment.user_id
    );
    notify(
      payment.user_id,
      "Payment approved",
      `Your ₦${payment.amount.toLocaleString()} payment has been approved. Your balance is now available for purchases in any supported country.`
    );
  });
  tx();
  res.json({ ok: true });
});

app.post("/api/admin/payment/:id/reject", admin, (req, res) => {
  const payment = db.prepare("SELECT * FROM payments WHERE id=? AND status='pending'").get(req.params.id);
  if (!payment) return res.status(404).json({ error: "Pending payment not found." });

  const tx = db.transaction(() => {
    db.prepare("UPDATE payments SET status='rejected',reviewed_at=?,reviewer_note=? WHERE id=?").run(
      nowIso(),
      req.body?.note || "Payment slip rejected",
      payment.id
    );
    db.prepare("UPDATE users SET pending_wallet=pending_wallet-? WHERE id=?").run(payment.amount, payment.user_id);
    notify(
      payment.user_id,
      "Payment not approved",
      `Your ₦${payment.amount.toLocaleString()} payment could not be approved. ${req.body?.note || "Please contact support."}`
    );
  });
  tx();
  res.json({ ok: true });
});

/* Inbound message injector (works without owning a domain).
   Use this from the admin board or curl to put real-looking messages
   into any active mailbox. No domain purchase required for the app to function. */
app.post("/api/dev-message", (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
  const { address, sender, subject, body } = req.body || {};
  const b = db.prepare("SELECT * FROM mailboxes WHERE address=? AND status='active'").get(address);
  if (!b) return res.status(404).json({ error: "Active mailbox not found." });
  const deleteAt = new Date(Date.now() + 10 * 60000).toISOString();
  db.prepare("INSERT INTO messages(mailbox_id,sender,subject,body,delete_at) VALUES(?,?,?,?,?)").run(
    b.id,
    sender || "test@example.com",
    subject || "Test message",
    body || "Demo message",
    deleteAt
  );
  notify(b.user_id, "New email", `A new message arrived at ${address}. It will be automatically deleted after 10 minutes.`);
  res.json({ ok: true });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`HUSTLE HUB v3 running on http://0.0.0.0:${PORT}`);
  console.log(`Payment account: ${ACCOUNT_NAME} | ${BANK_ACCOUNT} | ${BANK_NAME}`);
  console.log(`Admin secret (default): ${ADMIN_SECRET}`);
  console.log(`Mail domain: @${MAIL_DOMAIN}  (simulation mode – no domain purchase needed)`);
});

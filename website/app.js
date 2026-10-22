// server.ts
import http from "node:http";
import fs2 from "node:fs";
import path2 from "node:path";
import { fileURLToPath } from "node:url";

// backend/index.ts
import crypto2 from "node:crypto";
import zlib from "node:zlib";

// backend/sdk.ts
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
var DATA_DIR = path.resolve(process.cwd(), "data");
var DB_FILE = path.join(DATA_DIR, "db.json");
function loadEnvFile() {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
  }
}
loadEnvFile();
var memoryStore = null;
function getStore() {
  if (memoryStore) return memoryStore;
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      memoryStore = JSON.parse(raw);
      return memoryStore;
    }
  } catch {
  }
  memoryStore = {};
  return memoryStore;
}
function saveStore(store) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), "utf-8");
}
var pool = null;
var mariaDbReady = false;
var initPromise = null;
function getDbConfig() {
  const host = process.env.DB_HOST || process.env.MYSQL_HOST;
  const user = process.env.DB_USER || process.env.MYSQL_USER;
  const password = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || "";
  const database = process.env.DB_NAME || process.env.MYSQL_DATABASE;
  const port = Number(process.env.DB_PORT || process.env.MYSQL_PORT) || 3306;
  if (host && user && database) {
    return { host, user, password, database, port };
  }
  return null;
}
async function initMariaDb() {
  if (mariaDbReady) return true;
  const config = getDbConfig();
  if (!config) return false;
  try {
    const mysql = await import("mysql2/promise");
    if (!pool) {
      pool = mysql.createPool({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        port: config.port,
        waitForConnections: true,
        connectionLimit: 15,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 1e4
      });
    }
    await pool.query(`
            CREATE TABLE IF NOT EXISTS app_records (
                collection VARCHAR(64) NOT NULL,
                id VARCHAR(128) NOT NULL,
                data LONGTEXT NOT NULL,
                created_at BIGINT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (collection, id),
                INDEX idx_created (collection, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    const [rows] = await pool.query("SELECT COUNT(*) as count FROM app_records");
    if (Number(rows[0]?.count || 0) === 0 && fs.existsSync(DB_FILE)) {
      console.log("[MariaDB] Table is empty. Migrating all records from data/db.json into MariaDB...");
      const store = getStore();
      for (const [coll, items] of Object.entries(store)) {
        if (Array.isArray(items) && items.length > 0) {
          for (const rec of items) {
            const id = rec.id || crypto.randomUUID();
            const createdAt = Number(rec.createdAt) || 0;
            await pool.query(
              "INSERT INTO app_records (collection, id, data, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), created_at = VALUES(created_at)",
              [coll, id, JSON.stringify(rec), createdAt]
            );
          }
        }
      }
      console.log("[MariaDB] Migration from db.json to MariaDB completed successfully.");
    }
    mariaDbReady = true;
    console.log(`[MariaDB] Connected to enterprise database: ${config.database}@${config.host}`);
    return true;
  } catch (e) {
    console.warn("[MariaDB] Notice: Could not connect to MariaDB:", e?.message || e);
    console.warn("[MariaDB] Using local JSON database (data/db.json).");
    mariaDbReady = false;
    return false;
  }
}
async function ensureDb() {
  if (initPromise) return initPromise;
  initPromise = initMariaDb().then(() => {
  });
  return initPromise;
}
var db = {
  async isMariaDbActive() {
    await ensureDb();
    return mariaDbReady;
  },
  async list(collection, options) {
    await ensureDb();
    if (mariaDbReady && pool) {
      try {
        const limit = options?.limit || 5e3;
        const [rows] = await pool.query(
          "SELECT data FROM app_records WHERE collection = ? ORDER BY created_at DESC, id ASC LIMIT ?",
          [collection, limit]
        );
        const items2 = rows.map((r) => JSON.parse(r.data));
        return { items: items2 };
      } catch (e) {
        console.error("[MariaDB Query Error]:", e);
      }
    }
    const store = getStore();
    const list = store[collection] || [];
    const items = options?.limit ? list.slice(0, options.limit) : [...list];
    return { items };
  },
  async add(collection, records) {
    await ensureDb();
    const ids = [];
    if (mariaDbReady && pool) {
      try {
        for (const rec of records) {
          const id = rec.id || crypto.randomUUID();
          const createdAt = Number(rec.createdAt) || Date.now();
          const fullRec = { ...rec, id };
          await pool.query(
            "INSERT INTO app_records (collection, id, data, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), created_at = VALUES(created_at)",
            [collection, id, JSON.stringify(fullRec), createdAt]
          );
          ids.push(id);
        }
        return ids;
      } catch (e) {
        console.error("[MariaDB Add Error]:", e);
      }
    }
    const store = getStore();
    if (!store[collection]) store[collection] = [];
    for (const rec of records) {
      const id = rec.id || crypto.randomUUID();
      store[collection].push({ ...rec, id });
      ids.push(id);
    }
    saveStore(store);
    return ids;
  },
  async update(collection, id, patch) {
    await ensureDb();
    if (mariaDbReady && pool) {
      try {
        const [rows] = await pool.query(
          "SELECT data FROM app_records WHERE collection = ? AND id = ?",
          [collection, id]
        );
        if (!rows || rows.length === 0) return null;
        const current = JSON.parse(rows[0].data);
        const updated = { ...current, ...patch, id };
        await pool.query(
          "UPDATE app_records SET data = ? WHERE collection = ? AND id = ?",
          [JSON.stringify(updated), collection, id]
        );
        return updated;
      } catch (e) {
        console.error("[MariaDB Update Error]:", e);
      }
    }
    const store = getStore();
    if (!store[collection]) return null;
    const idx = store[collection].findIndex((item) => item.id === id);
    if (idx === -1) return null;
    store[collection][idx] = { ...store[collection][idx], ...patch, id };
    saveStore(store);
    return store[collection][idx];
  },
  async delete(collection, ids) {
    await ensureDb();
    if (mariaDbReady && pool) {
      try {
        if (ids.length === 0) return;
        const placeholders = ids.map(() => "?").join(",");
        await pool.query(
          `DELETE FROM app_records WHERE collection = ? AND id IN (${placeholders})`,
          [collection, ...ids]
        );
        return;
      } catch (e) {
        console.error("[MariaDB Delete Error]:", e);
      }
    }
    const store = getStore();
    if (!store[collection]) return;
    const idSet = new Set(ids);
    store[collection] = store[collection].filter((item) => !idSet.has(item.id));
    saveStore(store);
  }
};
function json(data, status = 200) {
  return { status, body: data };
}
function error(message, status = 400) {
  return { status, body: { error: message } };
}
function matchPattern(pattern, pathname) {
  const pParts = pattern.split("/").filter(Boolean);
  const uParts = pathname.split("/").filter(Boolean);
  if (pParts.length !== uParts.length) return null;
  const params = {};
  for (let i = 0; i < pParts.length; i++) {
    const p = pParts[i];
    const u = uParts[i];
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(u);
    } else if (p !== u) {
      return null;
    }
  }
  return params;
}
async function readJsonBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return {};
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}
function router(routes) {
  const compiled = Object.entries(routes).map(([key, handlers]) => {
    const [method, ...pathRest] = key.trim().split(/\s+/);
    return {
      method: method.toUpperCase(),
      pattern: pathRest.join(" "),
      handlers
    };
  });
  return async (req, res, next) => {
    const urlStr = req.url || "/";
    if (!urlStr.startsWith("/api/")) {
      if (next) return next();
      return;
    }
    const parsedUrl = new URL(urlStr, "http://localhost");
    const method = (req.method || "GET").toUpperCase();
    for (const route of compiled) {
      if (route.method !== method) continue;
      const params = matchPattern(route.pattern, parsedUrl.pathname);
      if (!params) continue;
      try {
        const body = await readJsonBody(req);
        const query = {};
        parsedUrl.searchParams.forEach((v, k) => {
          query[k] = v;
        });
        let lastResult = { status: 200, body: {} };
        for (const fn of route.handlers) {
          lastResult = await fn({ params, body, query });
        }
        res.statusCode = lastResult.status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(lastResult.body));
        return;
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: err?.message || "Internal server error" }));
        return;
      }
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Not found" }));
  };
}

// backend/index.ts
function hashPassword(password) {
  const salt = crypto2.randomBytes(16).toString("hex");
  const derived = crypto2.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}
function verifyPassword(password, stored) {
  const [salt, key] = (stored || "").split(":");
  if (!salt || !key) return false;
  const derivedBuf = crypto2.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  if (derivedBuf.length !== keyBuf.length) return false;
  return crypto2.timingSafeEqual(derivedBuf, keyBuf);
}
function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    accountType: u.accountType || "student",
    schoolName: u.schoolName || "",
    gradeLevel: u.gradeLevel ?? 4,
    region: u.region || "",
    promotionRank: u.promotionRank || ""
  };
}
async function getUserByToken(token) {
  if (!token || typeof token !== "string") return null;
  const { items: sessions } = await db.list("sessions", { limit: 1e3 });
  const sess = sessions.find((s) => s.token === token);
  if (!sess) return null;
  const { items: users } = await db.list("users", { limit: 1e3 });
  return users.find((u) => u.id === sess.userId) || null;
}
async function getInboxCode() {
  const { items } = await db.list("settings", { limit: 50 });
  const doc = items.find((i) => i.key === "inbox");
  return doc ? doc.passcode : null;
}
async function isStaff(code) {
  const saved = await getInboxCode();
  return !!saved && typeof code === "string" && code === saved;
}
var SCHOOL_LEVELS = [4, 5, 6, 7, 8, 9];
var SHS_LEVELS = ["SHS 1", "SHS 2", "SHS 3"];
var TRACKS = ["BECE", "WASSCE", "GTLE", "GES-PROMO"];
function normLevel(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return SCHOOL_LEVELS.includes(n) ? n : null;
  }
  const basicMatch = s.match(/^(?:basic|grade|class|b)\s*(\d+)$/i);
  if (basicMatch) {
    const n = Number(basicMatch[1]);
    return SCHOOL_LEVELS.includes(n) ? n : null;
  }
  const shsMatch = s.match(/^(?:shs|form)\s*([1-3])$/i);
  if (shsMatch) {
    return `SHS ${shsMatch[1]}`;
  }
  const u = s.toUpperCase();
  if (u === "SHS" || u === "SHS 1 - 3" || u === "SHS 1-3") {
    return "SHS 1";
  }
  if (u === "GES PROMOTION" || u === "GES PROMOTION EXAMS" || u === "GES-PROMOTION") {
    return "GES-PROMO";
  }
  if (SHS_LEVELS.includes(u)) return u;
  return TRACKS.includes(u) ? u : null;
}
var DEFAULT_SUBJECTS = ["Mathematics", "Computing", "Science", "English"];
var SAMPLES = {
  Mathematics: [
    { level: 4, text: "What is 7 \xD7 8?", options: ["54", "56", "58", "64"], correctIndex: 1, explanation: "7 \xD7 8 = 56." },
    { level: 4, text: "Which number is the largest?", options: ["489", "498", "849", "894"], correctIndex: 3, explanation: "894 has the most hundreds and tens." },
    { level: 7, text: "Solve: 3x + 5 = 20", options: ["x = 3", "x = 5", "x = 15", "x = 25"], correctIndex: 1, explanation: "3x = 15, so x = 5." },
    { level: 7, text: "What is 25% of 80?", options: ["15", "20", "25", "40"], correctIndex: 1, explanation: "25% is one quarter; 80 \xF7 4 = 20." }
  ],
  Computing: [
    { level: 4, text: "Which device is used to type letters into a computer?", options: ["Mouse", "Keyboard", "Monitor", "Speaker"], correctIndex: 1, explanation: "A keyboard is the input device for typing." },
    { level: 4, text: "Which of these is an output device?", options: ["Scanner", "Microphone", "Printer", "Keyboard"], correctIndex: 2, explanation: "A printer produces output on paper." },
    { level: 7, text: "What does CPU stand for?", options: ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Control Processing Unit"], correctIndex: 0, explanation: "CPU means Central Processing Unit." },
    { level: 7, text: "Which of these is an example of an operating system?", options: ["Chrome", "Windows", "Excel", "Google"], correctIndex: 1, explanation: "Windows manages the computer hardware and software." }
  ],
  Science: [
    { level: 4, text: "Which organ pumps blood around the body?", options: ["Lungs", "Stomach", "Heart", "Brain"], correctIndex: 2, explanation: "The heart pumps blood." },
    { level: 4, text: "What do plants need to make their food?", options: ["Sunlight", "Sand", "Plastic", "Salt"], correctIndex: 0, explanation: "Plants use sunlight, water and carbon dioxide." },
    { level: 7, text: "What is the chemical symbol for water?", options: ["O2", "CO2", "H2O", "HO"], correctIndex: 2, explanation: "Water is two hydrogen atoms and one oxygen atom." },
    { level: 7, text: "Which planet is closest to the Sun?", options: ["Venus", "Mercury", "Earth", "Mars"], correctIndex: 1, explanation: "Mercury is the closest planet to the Sun." }
  ],
  English: [
    { level: 4, text: "Choose the correct plural of 'child'.", options: ["childs", "childes", "children", "childrens"], correctIndex: 2, explanation: "'Children' is the irregular plural of child." },
    { level: 4, text: "Which word is a noun?", options: ["Quickly", "Table", "Run", "Beautiful"], correctIndex: 1, explanation: "A noun names a thing; table is a thing." },
    { level: 7, text: "Which word is closest in meaning to 'happy'?", options: ["Sad", "Angry", "Joyful", "Tired"], correctIndex: 2, explanation: "Joyful is a synonym of happy." },
    { level: 7, text: "Identify the verb: 'The dog runs fast.'", options: ["dog", "runs", "fast", "The"], correctIndex: 1, explanation: "Runs is the action word." }
  ]
};
async function ensureSeed() {
  const { items } = await db.list("subjects", { limit: 1 });
  if (items.length > 0) return;
  const ids = await db.add(
    "subjects",
    DEFAULT_SUBJECTS.map((name) => ({ name }))
  );
  const qs = [];
  DEFAULT_SUBJECTS.forEach((name, i) => {
    (SAMPLES[name] || []).forEach((q2) => {
      qs.push({ subjectId: ids[i], ...q2, createdAt: Date.now() });
    });
  });
  if (qs.length > 0) await db.add("questions", qs);
}
var q = (subject, level, text, options, correctIndex, explanation) => ({
  subject,
  level,
  text,
  options,
  correctIndex,
  explanation
});
var TRACK_SAMPLES = [
  q("Mathematics", "BECE", "Simplify: 2/3 + 1/6", ["5/6", "3/9", "1/2", "2/9"], 0, "2/3 = 4/6, and 4/6 + 1/6 = 5/6."),
  q("Mathematics", "BECE", "Solve for x: 2x \u2212 7 = 11", ["x = 2", "x = 9", "x = 18", "x = 4"], 1, "2x = 18, so x = 9."),
  q("Mathematics", "BECE", "What is the area of a rectangle 8 cm long and 5 cm wide?", ["13 cm\xB2", "26 cm\xB2", "40 cm\xB2", "80 cm\xB2"], 2, "Area = length \xD7 width = 8 \xD7 5 = 40 cm\xB2."),
  q("English", "BECE", "Choose the word that is opposite in meaning to 'generous'.", ["Kind", "Selfish", "Rich", "Careful"], 1, "Selfish is the opposite of generous."),
  q("English", "BECE", "Choose the correct sentence.", ["She don't like rice.", "She doesn't like rice.", "She not like rice.", "She doesn't likes rice."], 1, "After 'doesn't' the verb stays in its base form."),
  q("English", "BECE", "What is the plural of 'tooth'?", ["tooths", "teeth", "teeths", "toothes"], 1, "'Teeth' is the irregular plural of tooth."),
  q("Science", "BECE", "Which part of a plant absorbs water from the soil?", ["Leaf", "Stem", "Root", "Flower"], 2, "Roots take in water and minerals from the soil."),
  q("Science", "BECE", "What is the process by which liquid water changes to water vapour?", ["Condensation", "Evaporation", "Freezing", "Melting"], 1, "Evaporation is a liquid changing into a gas."),
  q("Science", "BECE", "Which of these is a good conductor of electricity?", ["Rubber", "Copper", "Wood", "Plastic"], 1, "Metals such as copper conduct electricity well."),
  q("Mathematics", "WASSCE", "If log\u2081\u2080 1000 = x, find x.", ["1", "2", "3", "10"], 2, "10\xB3 = 1000, so x = 3."),
  q("Mathematics", "WASSCE", "Find the gradient of the line y = 3x + 5.", ["5", "3", "1/3", "8"], 1, "In y = mx + c the gradient is m, which is 3."),
  q("English", "WASSCE", "Choose the option that best completes the sentence: Neither the teacher nor the students ___ present.", ["was", "were", "is", "has been"], 1, 'The verb agrees with the nearer subject, "students", so "were" is used.'),
  q("English", "WASSCE", "Which word is closest in meaning to 'diligent'?", ["Lazy", "Hardworking", "Careless", "Proud"], 1, "A diligent person works carefully and hard."),
  q("Science", "WASSCE", "Which of the following is a scalar quantity?", ["Velocity", "Force", "Mass", "Displacement"], 2, "Mass has size only; velocity, force and displacement also have direction."),
  q("Science", "WASSCE", "What is the chemical formula of sodium chloride?", ["NaCl", "Na2Cl", "NaCl2", "NCl"], 0, "One sodium ion combines with one chloride ion: NaCl."),
  q("Professional Studies", "GTLE", "A teacher checks learners\u2019 understanding during a lesson so that she can adjust her teaching. This is called:", ["Summative assessment", "Formative assessment", "Standardised testing", "External examination"], 1, "Formative assessment happens during learning and guides what the teacher does next."),
  q("Professional Studies", "GTLE", "Which of these is a clear learning objective?", ["Pupils will learn about fractions.", "The teacher will explain fractions.", "By the end of the lesson, pupils will add two fractions with the same denominator.", "Fractions will be taught."], 2, "A good objective states what learners will be able to do, and can be checked."),
  q("Professional Studies", "GTLE", "Which action best supports an inclusive classroom?", ["Seat struggling learners at the back", "Use varied activities so all learners can take part", "Teach only to the fastest learners", "Excuse some learners from taking part"], 1, "Varied activities give every learner a way to take part and learn."),
  q("Professional Studies", "GES-PROMO", "A teacher notices that a pupil often comes to school hungry and tired. What is the most professional first step?", ["Punish the pupil", "Ignore it", "Speak with the pupil privately and involve the school\u2019s guidance or welfare support", "Tell the whole class"], 2, "Handle the matter privately, kindly and through the proper school channels."),
  q("Professional Studies", "GES-PROMO", "Keeping accurate records of learners\u2019 attendance and progress mainly helps a teacher to:", ["Avoid planning lessons", "Track progress and support learners who fall behind", "Reduce the number of lessons", "Replace assessment"], 1, "Good records show who needs extra help and whether teaching is working."),
  q("Professional Studies", "GES-PROMO", "A lesson plan should be prepared:", ["After teaching the lesson", "Before teaching the lesson", "Only when inspectors visit", "Only at the end of term"], 1, "Planning ahead keeps the lesson focused on its objectives.")
];
var PROMOTION_RANK_ITEMS = [
  { id: "rank-ad-ii", name: "Assistant Director II (AD II)" },
  { id: "rank-ad-i", name: "Assistant Director I (AD I)" },
  { id: "rank-dd", name: "Deputy Director (DD)" },
  { id: "rank-dir-ii", name: "Director II (Dir II)" }
];
async function ensureTrackSeed() {
  const { items: settings } = await db.list("settings", { limit: 50 });
  if (settings.some((s) => s.key === "seed-tracks-v1")) return;
  await db.add("settings", [{ key: "seed-tracks-v1" }]);
  const { items: subs } = await db.list("subjects", { limit: 100 });
  const idByName = {};
  subs.forEach((s) => {
    idByName[String(s.name).toLowerCase()] = s.id;
  });
  if (!idByName["professional studies"]) {
    const [pid] = await db.add("subjects", [{ name: "Professional Studies" }]);
    if (pid) idByName["professional studies"] = pid;
  }
  const rows = [];
  TRACK_SAMPLES.forEach((t, i) => {
    const subjectId = t.level === "GES-PROMO" ? "rank-ad-ii" : idByName[t.subject.toLowerCase()];
    if (!subjectId) return;
    rows.push({
      subjectId,
      level: t.level,
      text: t.text,
      options: t.options,
      correctIndex: t.correctIndex,
      explanation: t.explanation,
      createdAt: Date.now() + i
    });
  });
  if (rows.length > 0) await db.add("questions", rows);
}
async function ensureGesPromoRankSeed() {
  const { items: settings } = await db.list("settings", { limit: 50 });
  if (settings.some((s) => s.key === "seed-ges-ranks-v1")) return;
  await db.add("settings", [{ key: "seed-ges-ranks-v1" }]);
  const validRankIds = new Set(PROMOTION_RANK_ITEMS.map((r) => r.id));
  const existingQs = await allQuestions();
  for (const eq of existingQs) {
    if (eq.level === "GES-PROMO" && !validRankIds.has(eq.subjectId)) {
      await db.update("questions", eq.id, { subjectId: "rank-ad-ii" });
    }
  }
  const rankSamples = [
    {
      subjectId: "rank-ad-i",
      level: "GES-PROMO",
      text: "In school supervision, clinical supervision primarily focuses on:",
      options: [
        "Fault-finding during classroom visits",
        "Collaborative improvement of classroom instruction between supervisor and teacher",
        "Transferring teachers to other districts",
        "Writing annual financial audit reports"
      ],
      correctIndex: 1,
      explanation: "Clinical supervision is a developmental, collaborative process aimed at improving teaching practice.",
      createdAt: Date.now() + 10
    },
    {
      subjectId: "rank-dd",
      level: "GES-PROMO",
      text: "Which body in Ghana is responsible for formulating and implementing pre-tertiary education policies under the Ministry of Education?",
      options: [
        "National Teaching Council (NTC)",
        "Ghana Education Service (GES)",
        "West African Examinations Council (WAEC)",
        "National Council for Tertiary Education"
      ],
      correctIndex: 1,
      explanation: "The Ghana Education Service (GES) implements approved national pre-tertiary educational policies and programmes.",
      createdAt: Date.now() + 11
    },
    {
      subjectId: "rank-dir-ii",
      level: "GES-PROMO",
      text: "Strategic educational planning at the directorate level begins with:",
      options: [
        "Disbursing capitation grants without a budget",
        "Conducting a comprehensive situational analysis and needs assessment",
        "Closing down low-performing schools immediately",
        "Suspending all in-service training programmes"
      ],
      correctIndex: 1,
      explanation: "A situational analysis and needs assessment establish baseline data and priorities before setting strategic goals.",
      createdAt: Date.now() + 12
    }
  ];
  await db.add("questions", rankSamples);
  await ensureShsSeed();
}
async function ensureShsSeed() {
  const { items: settings } = await db.list("settings", { limit: 50 });
  if (settings.some((s) => s.key === "seed-shs-v1")) return;
  await db.add("settings", [{ key: "seed-shs-v1" }]);
  const { items: subs } = await db.list("subjects", { limit: 100 });
  const idByName = {};
  subs.forEach((s) => {
    idByName[String(s.name).toLowerCase()] = s.id;
  });
  const shsSamples = [
    q("Mathematics", "SHS 1", "Express 0.0045 in standard form.", ["4.5 \xD7 10\u207B\xB3", "4.5 \xD7 10\u207B\xB2", "45 \xD7 10\u207B\u2074", "4.5 \xD7 10\xB3"], 0, "Moving the decimal point 3 places to the right gives 4.5 \xD7 10\u207B\xB3."),
    q("English", "SHS 1", 'Identify the part of speech of the underlined word: "She spoke very *fluently* at the debate."', ["Adjective", "Adverb", "Preposition", "Conjunction"], 1, '"Fluently" modifies the verb "spoke", so it is an adverb.'),
    q("Science", "SHS 1", "Which subatomic particle carries a negative electric charge?", ["Proton", "Neutron", "Electron", "Nucleus"], 2, "Electrons are negatively charged particles orbiting the nucleus."),
    q("Computing", "SHS 1", "Convert the binary number 1010\u2082 to base 10.", ["8", "10", "12", "14"], 1, "1\xD78 + 0\xD74 + 1\xD72 + 0\xD71 = 10."),
    q("Mathematics", "SHS 2", "Find the 5th term of the geometric progression 2, 6, 18, ...", ["54", "108", "162", "486"], 2, "Here a = 2 and r = 3; T\u2085 = a\xB7r\u2074 = 2 \xD7 81 = 162."),
    q("English", "SHS 2", 'Choose the option that is nearest in meaning to "ephemeral".', ["Permanent", "Short-lived", "Ancient", "Careful"], 1, '"Ephemeral" means lasting for a very short time.'),
    q("Science", "SHS 2", "What is the SI unit of electric current?", ["Volt", "Ohm", "Ampere", "Watt"], 2, "Electric current is measured in Amperes (A)."),
    q("Computing", "SHS 2", "In relational databases, a field that uniquely identifies each record in a table is called a:", ["Foreign key", "Primary key", "Index row", "Secondary query"], 1, "A primary key uniquely identifies each row in a database table."),
    q("Mathematics", "SHS 3", "Differentiate y = 3x\xB2 \u2212 4x + 7 with respect to x.", ["6x \u2212 4", "3x \u2212 4", "6x + 7", "x\xB3 \u2212 2x\xB2"], 0, "dy/dx = 2(3x) \u2212 4 = 6x \u2212 4."),
    q("English", "SHS 3", 'In literature, a comparison between two unlike things using "like" or "as" is a:', ["Metaphor", "Simile", "Personification", "Hyperbole"], 1, 'A simile uses "like" or "as" to make a direct comparison.'),
    q("Science", "SHS 3", "Which organic compound belongs to the alkane homologous series?", ["C\u2082H\u2084", "C\u2082H\u2082", "CH\u2084", "C\u2082H\u2085OH"], 2, "Methane (CH\u2084) follows the alkane general formula C\u2099H\u2082\u2099\u208A\u2082."),
    q("Computing", "SHS 3", "Which protocol is responsible for securely transferring web pages over an encrypted connection?", ["FTP", "HTTP", "HTTPS", "SMTP"], 2, "HTTPS (Hypertext Transfer Protocol Secure) encrypts communication between browser and server.")
  ];
  const rows = [];
  shsSamples.forEach((t, i) => {
    const subjectId = idByName[t.subject.toLowerCase()];
    if (!subjectId) return;
    rows.push({
      subjectId,
      level: t.level,
      text: t.text,
      options: t.options,
      correctIndex: t.correctIndex,
      explanation: t.explanation,
      createdAt: Date.now() + 20 + i
    });
  });
  if (rows.length > 0) await db.add("questions", rows);
}
async function getAdminCode() {
  const { items } = await db.list("settings", { limit: 50 });
  const doc = items.find((i) => i.key === "admin");
  return doc ? doc.passcode : null;
}
async function isAdmin(code) {
  const saved = await getAdminCode();
  return !!saved && typeof code === "string" && code === saved;
}
async function allQuestions() {
  const { items } = await db.list("questions", { limit: 5e3 });
  return [...items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
function resolvePromotionRankId(rawRank) {
  const s = String(rawRank ?? "").trim();
  if (!s) return void 0;
  const norm = s.toUpperCase().replace(/[\s\-()]+/g, "_").replace(/^_+|_+$/g, "");
  if (norm === "AD_II" || norm === "AD2" || norm === "RANK_AD_II" || norm.includes("ASSISTANT_DIRECTOR_II") || norm.endsWith("_AD_II")) {
    return "rank-ad-ii";
  }
  if (norm === "AD_I" || norm === "AD1" || norm === "RANK_AD_I" || norm.includes("ASSISTANT_DIRECTOR_I") || norm.endsWith("_AD_I")) {
    return "rank-ad-i";
  }
  if (norm === "DD" || norm === "RANK_DD" || norm.includes("DEPUTY_DIRECTOR") || norm.endsWith("_DD")) {
    return "rank-dd";
  }
  if (norm === "DIR_II" || norm === "DIR2" || norm === "RANK_DIR_II" || norm.includes("DIRECTOR_II") || norm.endsWith("_DIR_II")) {
    return "rank-dir-ii";
  }
  return void 0;
}
function decodeXmlEntities(s) {
  return s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}
function resolveCorrectIndex(rawAns, options) {
  if (typeof rawAns === "number" && Number.isInteger(rawAns)) {
    if (rawAns >= 0 && rawAns <= 3) return rawAns;
    if (rawAns >= 1 && rawAns <= 4) return rawAns - 1;
  }
  const s = String(rawAns ?? "").trim();
  if (!s) return -1;
  const letterMatch = s.match(/^(?:option\s*)?\(?([A-Da-d])\)?(?:\s*[:.)-].*)?$/i);
  if (letterMatch) {
    return letterMatch[1].toUpperCase().charCodeAt(0) - 65;
  }
  if (/^[1-4]$/.test(s)) {
    return Number(s) - 1;
  }
  const idx = options.findIndex((o) => o.trim().toLowerCase() === s.toLowerCase());
  return idx;
}
function readZipEntries(buf) {
  const entries = /* @__PURE__ */ new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 101010256) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return entries;
  const totalEntries = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < totalEntries && pos + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(pos) !== 33639248) break;
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    pos += 46 + nameLen + extraLen + commentLen;
    if (localOffset + 30 > buf.length) continue;
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > buf.length) continue;
    const slice = buf.subarray(dataStart, dataStart + compSize);
    try {
      if (method === 0) {
        entries.set(name, slice);
      } else if (method === 8) {
        entries.set(name, zlib.inflateRawSync(slice));
      }
    } catch {
    }
  }
  return entries;
}
function parseCsvRows(rawText) {
  const cleaned = rawText.replace(/^\uFEFF/, "");
  const firstLine = cleaned.split(/\r?\n/)[0] || "";
  const delimiter = firstLine.includes("	") && !firstLine.includes(",") ? "	" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (ch === "\r" && next === "\n") {
        currentRow.push(currentField.trim());
        if (currentRow.some((c) => c !== "")) rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        currentRow.push(currentField.trim());
        if (currentRow.some((c) => c !== "")) rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += ch;
      }
    }
  }
  currentRow.push(currentField.trim());
  if (currentRow.some((c) => c !== "")) rows.push(currentRow);
  return rows;
}
function parseTableRowsToItems(rows) {
  if (rows.length === 0) return [];
  const first = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const hasHeader = first.some((h) => h.includes("question") || h === "text" || h === "prompt") && first.some((h) => h.includes("optiona") || h === "a" || h.includes("answer") || h.includes("correct"));
  let qIdx = 0;
  let aIdx = 1;
  let bIdx = 2;
  let cIdx = 3;
  let dIdx = 4;
  let ansIdx = 5;
  let expIdx = 6;
  let lvlIdx = 7;
  let yearIdx = -1;
  let rankIdx = -1;
  let catIdx = -1;
  if (hasHeader) {
    const findCol = (preds, fallback) => {
      for (const pred of preds) {
        const i = first.findIndex(pred);
        if (i !== -1) return i;
      }
      return fallback;
    };
    yearIdx = findCol([(h) => h === "year" || h.includes("examyear")], -1);
    rankIdx = findCol([(h) => h === "rank" || h.includes("promotionrank")], -1);
    catIdx = findCol([(h) => h === "category" || h === "topic" || h === "domain"], -1);
    qIdx = findCol([(h) => h.includes("question") || h === "text" || h === "prompt"], 0);
    aIdx = findCol([(h) => h === "optiona" || h === "a" || h === "choicea"], 1);
    bIdx = findCol([(h) => h === "optionb" || h === "b" || h === "choiceb"], 2);
    cIdx = findCol([(h) => h === "optionc" || h === "c" || h === "choicec"], 3);
    dIdx = findCol([(h) => h === "optiond" || h === "d" || h === "choiced"], 4);
    ansIdx = findCol([(h) => h.includes("correct") || h.includes("answer") || h === "key"], 5);
    expIdx = findCol([(h) => h.includes("explanation") || h.includes("rationale") || h.includes("note")], 6);
    lvlIdx = findCol([(h) => h.includes("level") || h.includes("grade") || h.includes("section")], -1);
  }
  const startRow = hasHeader ? 1 : 0;
  const out = [];
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    const text = String(row[qIdx] || "").trim();
    if (!text) continue;
    if (text.toLowerCase() === "question" && String(row[aIdx] || "").toLowerCase().includes("option")) continue;
    const options = [
      String(row[aIdx] || "").trim(),
      String(row[bIdx] || "").trim(),
      String(row[cIdx] || "").trim(),
      String(row[dIdx] || "").trim()
    ];
    if (options.some((o) => !o)) continue;
    const correctIndex = resolveCorrectIndex(row[ansIdx], options);
    if (correctIndex < 0 || correctIndex > 3) continue;
    const explanation = expIdx >= 0 && expIdx < row.length ? String(row[expIdx] || "").trim() : "";
    const rawLvl = lvlIdx >= 0 && lvlIdx < row.length ? row[lvlIdx] : void 0;
    const year = yearIdx >= 0 && yearIdx < row.length ? String(row[yearIdx] || "").trim() : void 0;
    const category = catIdx >= 0 && catIdx < row.length ? String(row[catIdx] || "").trim() : void 0;
    const rawRank = rankIdx >= 0 && rankIdx < row.length ? String(row[rankIdx] || "").trim() : void 0;
    const resolvedRankId = resolvePromotionRankId(rawRank);
    out.push({
      text,
      options,
      correctIndex,
      explanation,
      level: resolvedRankId ? "GES-PROMO" : rawLvl ? normLevel(rawLvl) : void 0,
      subjectId: resolvedRankId,
      year: year || void 0,
      category: category || void 0,
      rank: rawRank || void 0
    });
  }
  return out;
}
function parseWordOrTextBlocks(rawText) {
  if (/<tr[\s>]/i.test(rawText) && /<td[\s>]/i.test(rawText)) {
    const trMatches = rawText.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const tableRows = [];
    for (const tr of trMatches) {
      const cellMatches = tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
      if (cellMatches.length >= 6) {
        const cells = cellMatches.map(
          (c) => decodeXmlEntities(c.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        );
        tableRows.push(cells);
      }
    }
    const fromTable = parseTableRowsToItems(tableRows);
    if (fromTable.length > 0) return fromTable;
  }
  const plain = decodeXmlEntities(
    rawText.replace(/<\/(p|div|tr|li|h[1-6]|br\s*\/?)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
  );
  const lines = plain.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const items = [];
  let curQuestion = "";
  let curOptions = ["", "", "", ""];
  let curAnswerRaw = "";
  let curExplanation = "";
  let curLevel = void 0;
  let curSubjectId = void 0;
  let curYear = "";
  let curCategory = "";
  let curRank = "";
  const resetCurrent = () => {
    curQuestion = "";
    curOptions = ["", "", "", ""];
    curAnswerRaw = "";
    curExplanation = "";
    curLevel = void 0;
    curSubjectId = void 0;
    curYear = "";
    curCategory = "";
    curRank = "";
  };
  const flushCurrent = () => {
    if (curQuestion.trim() && curOptions.every((o) => o.trim())) {
      const correctIndex = resolveCorrectIndex(curAnswerRaw, curOptions);
      if (correctIndex >= 0 && correctIndex <= 3) {
        items.push({
          text: curQuestion.trim(),
          options: curOptions.map((o) => o.trim()),
          correctIndex,
          explanation: curExplanation.trim(),
          level: curLevel,
          subjectId: curSubjectId,
          year: curYear.trim() || void 0,
          category: curCategory.trim() || void 0,
          rank: curRank.trim() || void 0
        });
      }
    }
    resetCurrent();
  };
  for (const line of lines) {
    if (/^(?:-{3,}|={3,})\s*$/.test(line)) {
      flushCurrent();
      continue;
    }
    if (/^(#|\/\/|examhub bulk question|instructions\s*(for administrators)?\s*:|fill in your questions|format\s*[ab12]:)/i.test(
      line
    ) || /^[1-9]\.\s*(fill in your questions|separate each question|valid ranks\s*:|correct choices\s*:)/i.test(line)) {
      continue;
    }
    const yearMatch = line.match(/^(?:exam\s*)?year\s*[:=\-]\s*(.+)$/i);
    if (yearMatch) {
      if (curQuestion && curOptions.every((o) => o.trim())) flushCurrent();
      curYear = yearMatch[1].trim();
      continue;
    }
    const rankMatch = line.match(/^(?:promotion\s*)?rank\s*[:=\-]\s*(.+)$/i);
    if (rankMatch) {
      if (curQuestion && curOptions.every((o) => o.trim())) flushCurrent();
      curRank = rankMatch[1].trim();
      const resolvedRankId = resolvePromotionRankId(curRank);
      if (resolvedRankId) {
        curSubjectId = resolvedRankId;
        curLevel = "GES-PROMO";
      }
      continue;
    }
    const catMatch = line.match(/^(?:category|topic|domain|subject\s*area)\s*[:=\-]\s*(.+)$/i);
    if (catMatch) {
      if (curQuestion && curOptions.every((o) => o.trim())) flushCurrent();
      curCategory = catMatch[1].trim();
      continue;
    }
    const lvlMatch = line.match(/^(?:level|grade|class|section)\s*[:=\-]\s*(.+)$/i);
    if (lvlMatch) {
      if (curQuestion && curOptions.every((o) => o.trim()) && !curLevel) {
        curLevel = normLevel(lvlMatch[1].trim());
      } else {
        if (curQuestion && curOptions.every((o) => o.trim())) flushCurrent();
        curLevel = normLevel(lvlMatch[1].trim());
      }
      continue;
    }
    const optMatch = line.match(/^(\*)?(?:option\s*)?\(?([A-Da-d])\)?\s*[:.)\-]\s*(.+)$/i);
    if (optMatch && curQuestion) {
      const starred = !!optMatch[1];
      const idx = optMatch[2].toUpperCase().charCodeAt(0) - 65;
      curOptions[idx] = optMatch[3].trim();
      if (starred && !curAnswerRaw) curAnswerRaw = optMatch[2].toUpperCase();
      continue;
    }
    const ansMatch = line.match(/^(?:correct\s*answer|correct\s*choice|answer|correct|ans|key)\s*[:=\-]\s*(.+)$/i);
    if (ansMatch && curQuestion) {
      curAnswerRaw = ansMatch[1].trim();
      continue;
    }
    const expMatch = line.match(/^(?:explanation|rationale|note)\s*[:=\-]\s*(.*)$/i);
    if (expMatch && curQuestion) {
      curExplanation = expMatch[1].trim();
      continue;
    }
    const qPrefixMatch = line.match(/^(?:question\s*\d*|q\d+|\d+)\s*[:.)\-]\s*(.+)$/i);
    if (qPrefixMatch) {
      if (curQuestion) flushCurrent();
      curQuestion = qPrefixMatch[1].trim();
      continue;
    }
  }
  flushCurrent();
  return items;
}
function parseDocxBuffer(buf) {
  const entries = readZipEntries(buf);
  const docXml = entries.get("word/document.xml")?.toString("utf8") || "";
  if (!docXml) return [];
  const trMatches = docXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
  if (trMatches.length > 0) {
    const rows = [];
    for (const tr of trMatches) {
      const tcMatches = tr.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
      if (tcMatches.length >= 6) {
        const cells = tcMatches.map((tc) => {
          const texts = (tc.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map(
            (t) => decodeXmlEntities(t.replace(/<[^>]+>/g, ""))
          );
          return texts.join("").trim();
        });
        rows.push(cells);
      }
    }
    const fromTable = parseTableRowsToItems(rows);
    if (fromTable.length > 0) return fromTable;
  }
  const pMatches = docXml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
  const lines = pMatches.map((p) => {
    const texts = (p.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map(
      (t) => decodeXmlEntities(t.replace(/<[^>]+>/g, ""))
    );
    return texts.join("").trim();
  });
  return parseWordOrTextBlocks(lines.join("\n"));
}
function parseXlsxBuffer(buf) {
  const entries = readZipEntries(buf);
  const sharedXml = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  const sharedStrings = [];
  if (sharedXml) {
    const siMatches = sharedXml.match(/<si[\s>][\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = (si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || []).map(
        (t) => decodeXmlEntities(t.replace(/<[^>]+>/g, ""))
      );
      sharedStrings.push(tMatches.join(""));
    }
  }
  const sheetXml = entries.get("xl/worksheets/sheet1.xml")?.toString("utf8") || Array.from(entries.entries()).find(([k]) => k.startsWith("xl/worksheets/sheet") && k.endsWith(".xml"))?.[1]?.toString("utf8") || "";
  if (!sheetXml) return [];
  const rowMatches = sheetXml.match(/<row[\s>][\s\S]*?<\/row>/g) || [];
  const rows = [];
  for (const rowXml of rowMatches) {
    const cMatches = rowXml.match(/<c[\s>][\s\S]*?<\/c>/g) || [];
    const rowCells = [];
    for (const cXml of cMatches) {
      const refMatch = cXml.match(/\br="([A-Z]+)\d+"/);
      const typeMatch = cXml.match(/\bt="([^"]+)"/);
      let colIdx = rowCells.length;
      if (refMatch) {
        const letters = refMatch[1];
        colIdx = 0;
        for (let i = 0; i < letters.length; i++) {
          colIdx = colIdx * 26 + (letters.charCodeAt(i) - 64);
        }
        colIdx -= 1;
      }
      const cellType = typeMatch ? typeMatch[1] : "";
      let val = "";
      if (cellType === "inlineStr") {
        const tMatches = (cXml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || []).map(
          (t) => decodeXmlEntities(t.replace(/<[^>]+>/g, ""))
        );
        val = tMatches.join("");
      } else {
        const vMatch = cXml.match(/<v>([\s\S]*?)<\/v>/);
        if (vMatch) {
          const rawV = decodeXmlEntities(vMatch[1]);
          if (cellType === "s") {
            val = sharedStrings[Number(rawV)] ?? "";
          } else {
            val = rawV;
          }
        }
      }
      while (rowCells.length <= colIdx) rowCells.push("");
      rowCells[colIdx] = val.trim();
    }
    if (rowCells.some((c) => c !== "")) rows.push(rowCells);
  }
  return parseTableRowsToItems(rows);
}
function normalizeJsonItems(rawList) {
  const out = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const obj = item;
    const text = String(obj.question ?? obj.Question ?? obj.text ?? "").trim();
    if (!text) continue;
    const options = Array.isArray(obj.options ?? obj.Options) ? (obj.options ?? obj.Options).slice(0, 4).map((o) => String(o ?? "").trim()) : [
      String(obj.optionA ?? obj.a ?? obj.A ?? "").trim(),
      String(obj.optionB ?? obj.b ?? obj.B ?? "").trim(),
      String(obj.optionC ?? obj.c ?? obj.C ?? "").trim(),
      String(obj.optionD ?? obj.d ?? obj.D ?? "").trim()
    ];
    if (options.length !== 4 || options.some((o) => !o)) continue;
    const rawAns = obj.correctIndex ?? obj.correctAnswer ?? obj.answer ?? obj.correct ?? obj.Correct;
    const correctIndex = resolveCorrectIndex(rawAns, options);
    if (correctIndex < 0 || correctIndex > 3) continue;
    const explanation = String(obj.explanation ?? obj.Explanation ?? "").trim();
    const year = String(obj.year ?? obj.Year ?? "").trim();
    const category = String(obj.category ?? obj.Category ?? "").trim();
    const rawRank = obj.rank ?? obj.Rank ?? obj.promotionRank;
    const resolvedRankId = resolvePromotionRankId(rawRank);
    const level = resolvedRankId ? "GES-PROMO" : obj.level !== void 0 ? normLevel(obj.level) : obj.Level !== void 0 ? normLevel(obj.Level) : void 0;
    const subjectId = resolvedRankId ? resolvedRankId : obj.subjectId ? String(obj.subjectId).trim() : void 0;
    out.push({
      text,
      options,
      correctIndex,
      explanation,
      level,
      subjectId,
      year: year || void 0,
      category: category || void 0,
      rank: rawRank ? String(rawRank).trim() : void 0
    });
  }
  return out;
}
function parseBulkQuestionsPayload(body) {
  if (Array.isArray(body?.questions)) {
    return normalizeJsonItems(body.questions);
  }
  const fileName = String(body?.fileName || "").toLowerCase();
  const fileBase64 = String(body?.fileBase64 || "");
  if (!fileBase64) return [];
  const buf = Buffer.from(fileBase64, "base64");
  const isZip = buf.length >= 4 && buf.readUInt32LE(0) === 67324752;
  if (fileName.endsWith(".xlsx") || isZip && fileName.includes("xls")) {
    return parseXlsxBuffer(buf);
  }
  if (fileName.endsWith(".docx") || isZip) {
    const docxItems = parseDocxBuffer(buf);
    if (docxItems.length > 0) return docxItems;
    return parseXlsxBuffer(buf);
  }
  const text = buf.toString("utf8");
  if (fileName.endsWith(".json")) {
    try {
      const parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
      return normalizeJsonItems(arr);
    } catch {
      return [];
    }
  }
  if (fileName.endsWith(".csv") || fileName.endsWith(".tsv")) {
    return parseTableRowsToItems(parseCsvRows(text));
  }
  if (fileName.endsWith(".doc") || fileName.endsWith(".txt")) {
    const wordItems2 = parseWordOrTextBlocks(text);
    if (wordItems2.length > 0) return wordItems2;
    return parseTableRowsToItems(parseCsvRows(text));
  }
  try {
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
    if (arr.length > 0) return normalizeJsonItems(arr);
  } catch {
  }
  const wordItems = parseWordOrTextBlocks(text);
  if (wordItems.length > 0) return wordItems;
  return parseTableRowsToItems(parseCsvRows(text));
}
var handler = router({
  "GET /api/_healthcheck": [async () => json({ message: "Success" })],
  // ---------- ExamHub: Student Auth (Register / Login / Session) ----------
  "POST /api/auth/register": [
    async (ctx) => {
      const b = ctx.body || {};
      const accountType = b.accountType === "ges-promo" ? "ges-promo" : "student";
      const name = String(b.name || "").trim();
      const email = String(b.email || "").trim().toLowerCase();
      const password = String(b.password || "");
      if (!name) return error("Full name is required", 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error("Enter a valid email address", 400);
      if (password.length < 6) return error("Password must be at least 6 characters", 400);
      let schoolName = "";
      let gradeLevel = 4;
      let region = "";
      let promotionRank = "";
      if (accountType === "ges-promo") {
        region = String(b.region || "").trim();
        promotionRank = String(b.promotionRank || "").trim();
        if (!region) return error("Select your Ghana Region", 400);
        if (!promotionRank) return error("Select your Eligible Promotion Rank", 400);
        schoolName = `${region} (${promotionRank})`;
        gradeLevel = "GES-PROMO";
      } else {
        schoolName = String(b.schoolName || "").trim();
        const parsedLevel = normLevel(b.gradeLevel);
        if (parsedLevel === null) return error("Choose a valid grade or exam level", 400);
        gradeLevel = parsedLevel;
      }
      const { items: users } = await db.list("users", { limit: 1e3 });
      if (users.some((u) => String(u.email).toLowerCase() === email)) {
        return error("An account with this email already exists. Please sign in.", 409);
      }
      const passwordHash = hashPassword(password);
      const userRecord = {
        name,
        email,
        accountType,
        schoolName,
        gradeLevel,
        region,
        promotionRank,
        passwordHash,
        passwordPlain: password,
        createdAt: Date.now()
      };
      const [userId] = await db.add("users", [userRecord]);
      const token = crypto2.randomBytes(24).toString("hex");
      await db.add("sessions", [{ userId, token, createdAt: Date.now() }]);
      return json(
        {
          token,
          user: publicUser({ id: userId, ...userRecord })
        },
        201
      );
    }
  ],
  "POST /api/auth/login": [
    async (ctx) => {
      const b = ctx.body || {};
      const email = String(b.email || "").trim().toLowerCase();
      const password = String(b.password || "");
      if (!email || !password) return error("Enter your email and password", 400);
      const { items: users } = await db.list("users", { limit: 1e3 });
      const user = users.find((u) => String(u.email).toLowerCase() === email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return error("Invalid email or password", 401);
      }
      if (!user.passwordPlain) {
        await db.update("users", user.id, { ...user, passwordPlain: password });
      }
      const token = crypto2.randomBytes(24).toString("hex");
      await db.add("sessions", [{ userId: user.id, token, createdAt: Date.now() }]);
      return json({
        token,
        user: publicUser(user)
      });
    }
  ],
  "POST /api/auth/recover": [
    async (ctx) => {
      const b = ctx.body || {};
      const email = String(b.email || "").trim().toLowerCase();
      const newPassword = typeof b.newPassword === "string" ? b.newPassword : "";
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return error("Enter the email address you registered with", 400);
      }
      const { items: users } = await db.list("users", { limit: 1e3 });
      const user = users.find((u) => String(u.email).toLowerCase() === email);
      if (!user) {
        return error("No registered account was found with that email address.", 404);
      }
      if (newPassword) {
        if (newPassword.length < 6) {
          return error("New password must be at least 6 characters", 400);
        }
        const passwordHash = hashPassword(newPassword);
        const updated = await db.update("users", user.id, {
          ...user,
          passwordHash,
          passwordPlain: newPassword,
          updatedAt: Date.now()
        });
        const token = crypto2.randomBytes(24).toString("hex");
        await db.add("sessions", [{ userId: user.id, token, createdAt: Date.now() }]);
        return json({
          ok: true,
          reset: true,
          recoveredPassword: newPassword,
          token,
          user: publicUser(updated || { ...user, passwordHash, passwordPlain: newPassword })
        });
      }
      let recoveredPassword = String(user.passwordPlain || "");
      let isTemporary = false;
      if (!recoveredPassword) {
        recoveredPassword = `Exam${crypto2.randomInt(1e3, 9999)}`;
        isTemporary = true;
        const passwordHash = hashPassword(recoveredPassword);
        await db.update("users", user.id, {
          ...user,
          passwordHash,
          passwordPlain: recoveredPassword,
          updatedAt: Date.now()
        });
      }
      return json({
        ok: true,
        accountName: user.name,
        email: user.email,
        gradeLabel: user.accountType === "ges-promo" ? user.promotionRank : typeof user.gradeLevel === "number" ? `Basic ${user.gradeLevel}` : String(user.gradeLevel),
        recoveredPassword,
        isTemporary
      });
    }
  ],
  "POST /api/auth/me": [
    async (ctx) => {
      const b = ctx.body || {};
      const user = await getUserByToken(b.token);
      if (!user) return error("Not signed in", 401);
      return json({ user: publicUser(user) });
    }
  ],
  "POST /api/auth/logout": [
    async (ctx) => {
      const b = ctx.body || {};
      if (b.token) {
        const { items: sessions } = await db.list("sessions", { limit: 1e3 });
        const matching = sessions.filter((s) => s.token === b.token).map((s) => s.id);
        if (matching.length > 0) await db.delete("sessions", matching);
      }
      return json({ ok: true });
    }
  ],
  // ---------- Website: Contact Form & Staff Inbox ----------
  "POST /api/contact": [
    async (ctx) => {
      const b = ctx.body || {};
      const name = String(b.name || "").trim();
      const email = String(b.email || "").trim();
      const phone = String(b.phone || "").trim();
      const topic = String(b.topic || "Something else").trim();
      const message = String(b.message || "").trim();
      if (!name) return error("Enter your name", 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error("Enter a valid email address", 400);
      if (!message) return error("Enter a message", 400);
      if (name.length > 100 || email.length > 200 || phone.length > 40 || topic.length > 100) {
        return error("One of the fields is too long", 400);
      }
      if (message.length > 4e3) return error("The message is too long (4000 characters maximum)", 400);
      const [id] = await db.add("messages", [{ name, email, phone, topic, message, createdAt: Date.now() }]);
      if (!id) return error("Could not save your message. Please try again.", 500);
      return json({ ok: true }, 201);
    }
  ],
  "GET /api/inbox/status": [
    async () => {
      const saved = await getInboxCode();
      return json({ configured: !!saved });
    }
  ],
  "POST /api/inbox/setup": [
    async (ctx) => {
      const b = ctx.body || {};
      const passcode = String(b.passcode || "").trim();
      if (await getInboxCode()) return error("The inbox passcode is already set", 409);
      if (passcode.length < 4) return error("The passcode must be at least 4 characters", 400);
      await db.add("settings", [{ key: "inbox", passcode }]);
      return json({ ok: true }, 201);
    }
  ],
  "POST /api/inbox/list": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isStaff(b.passcode)) return error("Incorrect passcode", 401);
      const { items } = await db.list("messages", { limit: 500 });
      const messages = [...items].sort((a, c) => (c.createdAt || 0) - (a.createdAt || 0));
      return json({ messages });
    }
  ],
  "POST /api/inbox/:id/delete": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isStaff(b.passcode)) return error("Incorrect passcode", 401);
      await db.delete("messages", [ctx.params.id]);
      return json({ deleted: true });
    }
  ],
  // ---------- ExamHub: Public (Student) ----------
  "GET /api/subjects": [
    async () => {
      await ensureSeed();
      await ensureTrackSeed();
      await ensureGesPromoRankSeed();
      const { items } = await db.list("subjects", { limit: 100 });
      const subjects = items.map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name));
      return json({ subjects });
    }
  ],
  "GET /api/counts": [
    async () => {
      await ensureGesPromoRankSeed();
      const qs = await allQuestions();
      const counts = {};
      qs.forEach((q2) => {
        const key = `${q2.subjectId}|${q2.level}`;
        counts[key] = (counts[key] || 0) + 1;
      });
      return json({ counts });
    }
  ],
  "GET /api/exam/:level/:subjectId": [
    async (ctx) => {
      const level = normLevel(ctx.params.level);
      if (level === null) return error("Invalid level", 400);
      const qs = (await allQuestions()).filter(
        (q2) => q2.subjectId === ctx.params.subjectId && q2.level === level
      );
      return json({
        questions: qs.map((q2) => ({
          id: q2.id,
          text: q2.text,
          options: q2.options,
          correctIndex: q2.correctIndex,
          explanation: q2.explanation || "",
          year: q2.year || void 0,
          category: q2.category || void 0
        }))
      });
    }
  ],
  "POST /api/exam/submit": [
    async (ctx) => {
      const b = ctx.body || {};
      const user = await getUserByToken(b.token);
      const studentName = String(user?.name || b.studentName || "").trim();
      const schoolName = String(user?.schoolName || b.schoolName || "").trim();
      const studentEmail = String(user?.email || b.studentEmail || "").trim();
      const level = normLevel(b.level);
      const subjectId = String(b.subjectId || "");
      const answers = b.answers || {};
      const questionIds = Array.isArray(b.questionIds) ? b.questionIds.map(String) : [];
      if (!studentName) return error("Please sign in before submitting an exam", 401);
      if (level === null) return error("Invalid level", 400);
      if (!subjectId) return error("Subject is required", 400);
      const allLevelQs = (await allQuestions()).filter((q2) => q2.subjectId === subjectId && q2.level === level);
      if (allLevelQs.length === 0) return error("There are no questions for this level and subject", 400);
      const qSet = new Set(questionIds);
      const qs = questionIds.length > 0 ? allLevelQs.filter((q2) => qSet.has(q2.id)) : allLevelQs;
      if (qs.length === 0) return error("No matching questions found for this exam submission", 400);
      let score = 0;
      const review = qs.map((q2) => {
        const chosen = typeof answers[q2.id] === "number" ? answers[q2.id] : null;
        const correct = chosen === q2.correctIndex;
        if (correct) score += 1;
        return {
          id: q2.id,
          correctIndex: q2.correctIndex,
          chosen,
          correct,
          explanation: q2.explanation || ""
        };
      });
      const { items: subjects } = await db.list("subjects", { limit: 100 });
      const subj = subjects.find((s) => s.id === subjectId) || PROMOTION_RANK_ITEMS.find((r) => r.id === subjectId);
      const total = qs.length;
      const percent = Math.round(score / total * 100);
      await db.add("results", [
        {
          userId: user?.id || null,
          studentName,
          studentEmail,
          schoolName,
          level,
          subjectId,
          subjectName: subj ? subj.name : "Unknown",
          score,
          total,
          percent,
          createdAt: Date.now()
        }
      ]);
      return json({ score, total, percent, review });
    }
  ],
  // ---------- ExamHub: Admin ----------
  "GET /api/admin/status": [
    async () => {
      const saved = await getAdminCode();
      return json({ configured: !!saved });
    }
  ],
  "POST /api/admin/setup": [
    async (ctx) => {
      const b = ctx.body || {};
      const passcode = String(b.passcode || "").trim();
      if (await getAdminCode()) return error("Admin passcode is already set", 409);
      if (passcode.length < 4) return error("Passcode must be at least 4 characters", 400);
      await db.add("settings", [{ key: "admin", passcode }]);
      return json({ ok: true }, 201);
    }
  ],
  "POST /api/admin/login": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isAdmin(b.passcode)) return error("Incorrect passcode", 401);
      return json({ ok: true });
    }
  ],
  "POST /api/admin/subjects": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isAdmin(b.passcode)) return error("Not authorised", 401);
      const name = String(b.name || "").trim();
      if (!name) return error("Subject name is required", 400);
      const { items } = await db.list("subjects", { limit: 100 });
      if (items.some((s) => String(s.name).toLowerCase() === name.toLowerCase())) {
        return error("That subject already exists", 409);
      }
      const [id] = await db.add("subjects", [{ name }]);
      if (!id) return error("Failed to add subject", 500);
      return json({ id, name }, 201);
    }
  ],
  "POST /api/admin/subjects/:id/delete": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isAdmin(b.passcode)) return error("Not authorised", 401);
      const id = ctx.params.id;
      const qs = (await allQuestions()).filter((q2) => q2.subjectId === id);
      if (qs.length > 0) await db.delete("questions", qs.map((q2) => q2.id));
      await db.delete("subjects", [id]);
      return json({ deleted: true, questionsRemoved: qs.length });
    }
  ],
  "POST /api/admin/questions/list": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isAdmin(b.passcode)) return error("Not authorised", 401);
      await ensureGesPromoRankSeed();
      const qs = await allQuestions();
      return json({ questions: qs });
    }
  ],
  "POST /api/admin/questions": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isAdmin(b.passcode)) return error("Not authorised", 401);
      const subjectId = String(b.subjectId || "");
      const level = normLevel(b.level);
      const text = String(b.text || "").trim();
      const options = Array.isArray(b.options) ? b.options.map((o) => String(o || "").trim()) : [];
      const correctIndex = Number(b.correctIndex);
      const explanation = String(b.explanation || "").trim();
      const year = String(b.year || "").trim();
      const category = String(b.category || "").trim();
      if (level === null) return error("Choose Basic 4 to Basic 9, or an exam section", 400);
      if (!text) return error("Question text is required", 400);
      if (options.length !== 4 || options.some((o) => !o)) return error("Provide all four answer options", 400);
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
        return error("Choose the correct answer", 400);
      }
      const { items: subjects } = await db.list("subjects", { limit: 100 });
      const validTarget = subjects.some((s) => s.id === subjectId) || PROMOTION_RANK_ITEMS.some((r) => r.id === subjectId);
      if (!validTarget) return error("Choose a valid subject or promotion rank", 400);
      const record = {
        subjectId,
        level,
        text,
        options,
        correctIndex,
        explanation,
        ...year ? { year } : {},
        ...category ? { category } : {},
        createdAt: Date.now()
      };
      const [id] = await db.add("questions", [record]);
      if (!id) return error("Failed to add question", 500);
      return json({ id, ...record }, 201);
    }
  ],
  "POST /api/admin/questions/bulk": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isAdmin(b.passcode)) return error("Not authorised", 401);
      const defaultSubjectId = String(b.subjectId || "").trim();
      const defaultLevel = normLevel(b.level);
      const { items: subjects } = await db.list("subjects", { limit: 100 });
      const isValidSubjectOrRank = (id) => subjects.some((s) => s.id === id) || PROMOTION_RANK_ITEMS.some((r) => r.id === id);
      const parsedItems = parseBulkQuestionsPayload(b);
      if (parsedItems.length === 0) {
        return error(
          "No valid questions found in the uploaded file. Please make sure each question has question text, 4 answer options (A\u2013D), and a correct answer (A, B, C, or D).",
          400
        );
      }
      const now = Date.now();
      const records = [];
      for (let i = 0; i < parsedItems.length; i++) {
        const item = parsedItems[i];
        const targetSubjectId = item.subjectId && isValidSubjectOrRank(item.subjectId) ? item.subjectId : defaultSubjectId;
        const targetLevel = item.level !== void 0 && item.level !== null ? item.level : defaultLevel;
        if (!targetSubjectId || !isValidSubjectOrRank(targetSubjectId)) {
          return error("Choose a valid subject or promotion rank before uploading.", 400);
        }
        if (targetLevel === null) {
          return error("Choose a valid class level or exam section before uploading.", 400);
        }
        records.push({
          subjectId: targetSubjectId,
          level: targetLevel,
          text: item.text,
          options: item.options,
          correctIndex: item.correctIndex,
          explanation: item.explanation || "",
          ...item.year ? { year: item.year } : {},
          ...item.category ? { category: item.category } : {},
          ...item.rank ? { rank: item.rank } : {},
          createdAt: now + i
        });
      }
      const ids = await db.add("questions", records);
      return json(
        {
          imported: ids.length,
          questions: records.map((r, i) => ({ id: ids[i], ...r }))
        },
        201
      );
    }
  ],
  "POST /api/admin/questions/:id/update": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isAdmin(b.passcode)) return error("Not authorised", 401);
      const id = ctx.params.id;
      const subjectId = String(b.subjectId || "");
      const level = normLevel(b.level);
      const text = String(b.text || "").trim();
      const options = Array.isArray(b.options) ? b.options.map((o) => String(o || "").trim()) : [];
      const correctIndex = Number(b.correctIndex);
      const explanation = String(b.explanation || "").trim();
      const year = String(b.year || "").trim();
      const category = String(b.category || "").trim();
      if (level === null) return error("Choose Basic 4 to Basic 9, or an exam section", 400);
      if (!text) return error("Question text is required", 400);
      if (options.length !== 4 || options.some((o) => !o)) return error("Provide all four answer options", 400);
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
        return error("Choose the correct answer", 400);
      }
      const { items: subjects } = await db.list("subjects", { limit: 100 });
      const validTarget = subjects.some((s) => s.id === subjectId) || PROMOTION_RANK_ITEMS.some((r) => r.id === subjectId);
      if (!validTarget) return error("Choose a valid subject or promotion rank", 400);
      const updated = await db.update("questions", id, {
        subjectId,
        level,
        text,
        options,
        correctIndex,
        explanation,
        year,
        category,
        updatedAt: Date.now()
      });
      if (!updated) return error("Question not found", 404);
      return json({ question: updated });
    }
  ],
  "POST /api/admin/questions/:id/delete": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isAdmin(b.passcode)) return error("Not authorised", 401);
      await db.delete("questions", [ctx.params.id]);
      return json({ deleted: true });
    }
  ],
  "POST /api/admin/results": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isAdmin(b.passcode)) return error("Not authorised", 401);
      const { items } = await db.list("results", { limit: 500 });
      const results = [...items].sort((a, c) => (c.createdAt || 0) - (a.createdAt || 0));
      return json({ results });
    }
  ],
  "POST /api/admin/candidates": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isAdmin(b.passcode)) return error("Not authorised", 401);
      const { items: rawUsers } = await db.list("users", { limit: 1e3 });
      const { items: rawResults } = await db.list("results", { limit: 2e3 });
      const allCandidateUsers = [...rawUsers];
      const seenEmails = new Set(
        rawUsers.map((u) => String(u.email || "").trim().toLowerCase()).filter(Boolean)
      );
      const seenUserIds = new Set(
        rawUsers.map((u) => String(u.id || "").trim().toLowerCase()).filter(Boolean)
      );
      for (const r of rawResults) {
        const rEmail = String(r.studentEmail || "").trim().toLowerCase();
        const rUserId = String(r.userId || "").trim().toLowerCase();
        if (rEmail && !seenEmails.has(rEmail)) {
          seenEmails.add(rEmail);
          if (rUserId) seenUserIds.add(rUserId);
          allCandidateUsers.push({
            id: r.userId || `candidate-res-${r.id || crypto2.randomUUID()}`,
            name: r.studentName || r.studentEmail || "Candidate",
            email: r.studentEmail || "",
            accountType: r.level === "GES-PROMO" ? "ges-promo" : "student",
            gradeLevel: r.level === "GES-PROMO" ? "GES-PROMO" : r.level,
            schoolName: r.schoolName || "",
            region: "",
            promotionRank: r.level === "GES-PROMO" ? r.subjectName : "",
            createdAt: r.createdAt || Date.now()
          });
        } else if (!rEmail && rUserId && !seenUserIds.has(rUserId)) {
          seenUserIds.add(rUserId);
          allCandidateUsers.push({
            id: r.userId,
            name: r.studentName || "Candidate",
            email: "",
            accountType: r.level === "GES-PROMO" ? "ges-promo" : "student",
            gradeLevel: r.level === "GES-PROMO" ? "GES-PROMO" : r.level,
            schoolName: r.schoolName || "",
            region: "",
            promotionRank: r.level === "GES-PROMO" ? r.subjectName : "",
            createdAt: r.createdAt || Date.now()
          });
        }
      }
      const candidates = allCandidateUsers.map((u) => {
        const uEmail = String(u.email || "").trim().toLowerCase();
        const uId = String(u.id || "").trim();
        const userResults = rawResults.filter(
          (r) => uId && r.userId && String(r.userId).trim() === uId || uEmail && r.studentEmail && String(r.studentEmail).trim().toLowerCase() === uEmail
        );
        const sortedResults = [...userResults].sort((a, c) => (c.createdAt || 0) - (a.createdAt || 0));
        const examsTaken = sortedResults.length;
        const totalScore = sortedResults.reduce((acc, r) => acc + (Number(r.percent) || 0), 0);
        const avgPercent = examsTaken > 0 ? Math.round(totalScore / examsTaken) : 0;
        const bestPercent = examsTaken > 0 ? Math.max(...sortedResults.map((r) => Number(r.percent) || 0)) : 0;
        const lastExamAt = sortedResults[0]?.createdAt || null;
        const lastSubject = sortedResults[0]?.subjectName || null;
        let performanceStatus = "Pending";
        if (examsTaken > 0) {
          if (avgPercent >= 75) performanceStatus = "Distinction";
          else if (avgPercent >= 50) performanceStatus = "Pass";
          else performanceStatus = "Remedial";
        }
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          accountType: u.accountType,
          gradeLevel: u.gradeLevel,
          region: u.region || "",
          promotionRank: u.promotionRank || "",
          schoolName: u.schoolName || "",
          registeredAt: u.createdAt || 0,
          examsTaken,
          avgPercent,
          bestPercent,
          lastExamAt,
          lastSubject,
          performanceStatus,
          recentResults: sortedResults.slice(0, 10).map((r) => ({
            id: r.id,
            subjectName: r.subjectName,
            level: r.level,
            score: r.score,
            total: r.total,
            percent: r.percent,
            createdAt: r.createdAt
          }))
        };
      }).sort((a, b2) => (b2.lastExamAt || b2.registeredAt || 0) - (a.lastExamAt || a.registeredAt || 0));
      const totalExams = rawResults.length;
      const totalPass = rawResults.filter((r) => (Number(r.percent) || 0) >= 50).length;
      const totalDistinction = rawResults.filter((r) => (Number(r.percent) || 0) >= 75).length;
      const overallAverage = totalExams > 0 ? Math.round(rawResults.reduce((acc, r) => acc + (Number(r.percent) || 0), 0) / totalExams) : 0;
      const passRate = totalExams > 0 ? Math.round(totalPass / totalExams * 100) : 0;
      const distinctionRate = totalExams > 0 ? Math.round(totalDistinction / totalExams * 100) : 0;
      return json({
        candidates,
        totalCandidates: candidates.length,
        totalExams,
        overallAverage,
        passRate,
        distinctionRate
      });
    }
  ],
  "POST /api/admin/messages": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isAdmin(b.passcode)) return error("Not authorised", 401);
      const { items } = await db.list("messages", { limit: 1e3 });
      const messages = [...items].sort((a, c) => (c.createdAt || 0) - (a.createdAt || 0));
      const isMariaDb = await db.isMariaDbActive();
      return json({ messages, isMariaDb });
    }
  ],
  "POST /api/admin/messages/:id/delete": [
    async (ctx) => {
      const b = ctx.body || {};
      if (!await isAdmin(b.passcode)) return error("Not authorised", 401);
      await db.delete("messages", [ctx.params.id]);
      return json({ ok: true });
    }
  ]
});

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var DIST_DIR = path2.resolve(__dirname, "dist");
var MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8"
};
function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }
  const parsedUrl = new URL(req.url || "/", "http://localhost");
  let pathname = decodeURIComponent(parsedUrl.pathname);
  let filePath = path2.join(DIST_DIR, pathname);
  if (!filePath.startsWith(DIST_DIR)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  let stat = null;
  try {
    if (fs2.existsSync(filePath)) {
      stat = fs2.statSync(filePath);
      if (stat.isDirectory()) {
        filePath = path2.join(filePath, "index.html");
        stat = fs2.existsSync(filePath) ? fs2.statSync(filePath) : null;
      }
    }
  } catch {
    stat = null;
  }
  if (!stat || !fs2.existsSync(filePath)) {
    filePath = path2.join(DIST_DIR, "index.html");
    try {
      stat = fs2.statSync(filePath);
    } catch {
      res.statusCode = 404;
      res.end("Application not built yet. Run npm run build.");
      return;
    }
  }
  const ext = path2.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", stat.size);
  if (ext === ".html") {
    res.setHeader("Cache-Control", "no-cache");
  } else {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = fs2.createReadStream(filePath);
  stream.pipe(res);
}
var server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  if (url.startsWith("/api/")) {
    await handler(req, res, () => serveStatic(req, res));
    return;
  }
  serveStatic(req, res);
});
var PORT = process.env.PORT || 3e3;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

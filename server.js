const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const OWNER_TOKEN = process.env.OWNER_TOKEN;
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "requests.json");

if (!OWNER_TOKEN || !AGENT_TOKEN) {
  console.error("Set OWNER_TOKEN and AGENT_TOKEN environment variables before starting.");
  process.exit(1);
}
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf8");

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

function readDb() { try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch { return []; } }
function writeDb(rows) { fs.writeFileSync(DB_FILE, JSON.stringify(rows, null, 2), "utf8"); }
function safeEqual(a, b) {
  if (!a || !b) return false;
  const aa = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function auth(expected) {
  return (req, res, next) => {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!safeEqual(token, expected)) return res.status(401).json({ error: "Unauthorized" });
    next();
  };
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
    if (!allowed.includes(ext)) return cb(new Error("Only PDF, JPG, PNG, and WEBP files are accepted."));
    cb(null, true);
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "RK Digital World Smart Print" }));

// Customer submits one file. Public endpoint is rate-limit-ready; add a production rate limiter/WAF before launch.
app.post("/api/requests", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Please attach a file." });
  const copies = Math.max(1, Math.min(20, Number.parseInt(req.body.copies || "1", 10) || 1));
  const settings = {
    paper: String(req.body.paper || "A4").slice(0, 40),
    orientation: ["Portrait", "Landscape"].includes(req.body.orientation) ? req.body.orientation : "Portrait",
    copies,
    color: req.body.color === "Color" ? "Color" : "Black & White",
    fit: ["Fit to page", "Actual size", "Fill page"].includes(req.body.fit) ? req.body.fit : "Fit to page",
    sides: req.body.sides === "Double-sided" ? "Double-sided" : "Single-sided",
    note: String(req.body.note || "").slice(0, 180)
  };
  const row = {
    id: "RK-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    originalName: path.basename(req.file.originalname).slice(0, 160),
    storedName: req.file.filename,
    mimeType: req.file.mimetype,
    bytes: req.file.size,
    settings,
    jobType: req.body.jobType === "id-card" ? "id-card" : "standard",
    status: "Pending approval",
    createdAt: new Date().toISOString(),
    approvedAt: null,
    agentClaimedAt: null,
    printedAt: null
  };
  const db = readDb(); db.unshift(row); writeDb(db);
  res.status(201).json({ id: row.id, status: row.status, message: "Upload received. Wait for shop approval." });
});

// Owner dashboard APIs
app.get("/api/owner/requests", auth(OWNER_TOKEN), (_req, res) => {
  res.json(readDb().map(({ storedName, ...r }) => r));
});

// Return the exact ID-card A4 PDF uploaded by the customer for owner review.
// This route is protected with the same owner token as the approval dashboard.
app.get("/api/owner/requests/:id/preview", auth(OWNER_TOKEN), (req, res) => {
  const row = readDb().find(x => x.id === req.params.id);
  if (!row || row.jobType !== "id-card" || path.extname(row.originalName).toLowerCase() !== ".pdf") {
    return res.status(404).json({ error: "ID-card preview not found." });
  }
  const filePath = path.join(UPLOAD_DIR, path.basename(row.storedName));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Preview file missing." });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="ID-Card-Front-Back.pdf"');
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(filePath);
});
app.post("/api/owner/requests/:id/decision", auth(OWNER_TOKEN), (req, res) => {
  const decision = req.body && req.body.decision;
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Decision must be approve or reject." });
  const db = readDb(); const row = db.find(x => x.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Request not found." });
  if (row.status !== "Pending approval") return res.status(409).json({ error: "Request is no longer pending." });
  row.status = decision === "approve" ? "Approved" : "Rejected";
  row.approvedAt = decision === "approve" ? new Date().toISOString() : null;
  writeDb(db); res.json({ id: row.id, status: row.status });
});

// Print agent asks for approved jobs. It claims one job at a time to prevent duplicate pickup.
app.get("/api/agent/next", auth(AGENT_TOKEN), (_req, res) => {
  const db = readDb();
  const row = db.find(x => x.status === "Approved" && !x.agentClaimedAt);
  if (!row) return res.status(204).end();
  row.agentClaimedAt = new Date().toISOString();
  row.status = "Printing";
  writeDb(db);
  res.json({ id: row.id, originalName: row.originalName, storedName: row.storedName, settings: row.settings, downloadPath: "/api/agent/file/" + encodeURIComponent(row.id) });
});
app.get("/api/agent/file/:id", auth(AGENT_TOKEN), (req, res) => {
  const row = readDb().find(x => x.id === req.params.id);
  if (!row || !["Printing", "Approved"].includes(row.status)) return res.status(404).json({ error: "File unavailable." });
  const filePath = path.join(UPLOAD_DIR, path.basename(row.storedName));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing." });
  res.download(filePath, row.originalName);
});
app.post("/api/agent/complete/:id", auth(AGENT_TOKEN), (req, res) => {
  const db = readDb(); const row = db.find(x => x.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Request not found." });
  row.status = req.body && req.body.success ? "Printed" : "Print error";
  row.printedAt = new Date().toISOString();
  row.printMessage = String((req.body && req.body.message) || "").slice(0, 300);
  writeDb(db); res.json({ id: row.id, status: row.status });
});

app.use((err, _req, res, _next) => {
  const status = err instanceof multer.MulterError ? 400 : 400;
  res.status(status).json({ error: err.message || "Request failed." });
});
app.listen(PORT, () => console.log(`RK Smart Print server listening on port ${PORT}`));

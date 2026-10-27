const express = require("express");
const compression = require("compression");
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
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

function readDb() { try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch { return []; } }
function writeDb(rows) { fs.writeFileSync(DB_FILE, JSON.stringify(rows, null, 2), "utf8"); }

const UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1000;
function cleanupExpiredUploads() {
  const cutoff = Date.now() - UPLOAD_RETENTION_MS;
  const rows = readDb();
  const kept = [];
  const removeStored = (storedName) => {
    if (!storedName) return;
    const safeName = path.basename(storedName);
    const fullPath = path.join(UPLOAD_DIR, safeName);
    if (fullPath.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch (err) { console.error("Could not delete expired upload:", safeName, err.message); }
    }
  };
  for (const row of rows) {
    const created = Date.parse(row.createdAt || "");
    if (Number.isFinite(created) && created <= cutoff) {
      removeStored(row.storedName);
      if (row.idCardPhotos) {
        removeStored(row.idCardPhotos.frontStoredName);
        removeStored(row.idCardPhotos.backStoredName);
      }
    } else {
      kept.push(row);
    }
  }
  if (kept.length !== rows.length) writeDb(kept);
  // Also remove untracked/orphaned uploads after 24 hours (e.g. interrupted uploads).
  for (const entry of fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(UPLOAD_DIR, entry.name);
    try {
      if (fs.statSync(fullPath).mtimeMs <= cutoff) fs.unlinkSync(fullPath);
    } catch (err) {
      console.error("Could not clean old upload:", entry.name, err.message);
    }
  }
}
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
  limits: { fileSize: 20 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
    if (!allowed.includes(ext)) return cb(new Error("Only PDF, JPG, PNG, and WEBP files are accepted."));
    cb(null, true);
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "RK Digital World Smart Print" }));

// Customer submits a print file. ID-card requests may also keep the original front/back photos
// privately so the owner can fix the crop when a customer cannot edit it correctly.
const customerUploadFields = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "idFrontPhoto", maxCount: 1 },
  { name: "idBackPhoto", maxCount: 1 }
]);
app.post("/api/requests", customerUploadFields, (req, res) => {
  const mainFile = req.files && req.files.file && req.files.file[0];
  const frontPhoto = req.files && req.files.idFrontPhoto && req.files.idFrontPhoto[0];
  const backPhoto = req.files && req.files.idBackPhoto && req.files.idBackPhoto[0];
  if (!mainFile) {
    [frontPhoto, backPhoto].filter(Boolean).forEach(f => fs.unlink(f.path, () => {}));
    return res.status(400).json({ error: "Please attach a file." });
  }
  const isIdCard = req.body.jobType === "id-card";
  const hasBothPhotos = !!(frontPhoto && backPhoto && isIdCard);
  const copies = Math.max(1, Math.min(20, Number.parseInt(req.body.copies || "1", 10) || 1));
  const settings = {
    paper: String(req.body.paper || "A4").slice(0, 40),
    orientation: ["Portrait", "Landscape"].includes(req.body.orientation) ? req.body.orientation : "Portrait",
    copies,
    color: req.body.color === "Color" ? "Color" : "Black & White",
    fit: ["Fit to page", "Actual size", "Fill page"].includes(req.body.fit) ? req.body.fit : "Fit to page",
    sides: req.body.sides === "Double-sided" ? req.body.sides : "Single-sided",
    note: String(req.body.note || "").slice(0, 180)
  };
  const row = {
    id: "RK-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    originalName: path.basename(mainFile.originalname).slice(0, 160),
    storedName: mainFile.filename,
    mimeType: mainFile.mimetype,
    bytes: mainFile.size,
    settings,
    jobType: isIdCard ? "id-card" : "standard",
    ...(hasBothPhotos ? { idCardPhotos: {
      frontStoredName: frontPhoto.filename,
      frontOriginalName: path.basename(frontPhoto.originalname).slice(0, 160),
      frontMimeType: frontPhoto.mimetype,
      backStoredName: backPhoto.filename,
      backOriginalName: path.basename(backPhoto.originalname).slice(0, 160),
      backMimeType: backPhoto.mimetype
    } } : {}),
    status: "Pending approval",
    createdAt: new Date().toISOString(),
    approvedAt: null,
    agentClaimedAt: null,
    printedAt: null
  };
  if (isIdCard && !hasBothPhotos && (frontPhoto || backPhoto)) {
    [frontPhoto, backPhoto].filter(Boolean).forEach(f => fs.unlink(f.path, () => {}));
  }
  const db = readDb(); db.unshift(row); writeDb(db);
  res.status(201).json({ id: row.id, status: row.status, message: "Upload received. Wait for shop approval." });
});

// Owner dashboard APIs
app.get("/api/owner/requests", auth(OWNER_TOKEN), (_req, res) => {
  res.json(readDb().map(({ storedName, idCardPhotos, ...r }) => ({
    ...r,
    hasIdCardPhotos: !!(idCardPhotos && idCardPhotos.frontStoredName && idCardPhotos.backStoredName)
  })));
});

// Serve uploaded PDFs and images for authenticated owner preview.
app.get("/api/owner/requests/:id/preview", auth(OWNER_TOKEN), (req, res) => {
  const row = readDb().find(x => x.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Preview request not found." });
  const ext = path.extname(row.originalName).toLowerCase();
  const mimeTypes = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp"
  };
  const contentType = mimeTypes[ext];
  if (!contentType) return res.status(415).json({ error: "Preview is only available for PDF, JPG, PNG, and WEBP files." });
  const filePath = path.join(UPLOAD_DIR, path.basename(row.storedName));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Preview file missing." });
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", 'inline; filename="upload-preview' + ext + '"');
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(filePath);
});
// Return an original front/back photo only to an authenticated owner, for manual crop correction.
app.get("/api/owner/requests/:id/id-card-photos/:side", auth(OWNER_TOKEN), (req, res) => {
  const row = readDb().find(x => x.id === req.params.id);
  if (!row || row.jobType !== "id-card" || row.status !== "Pending approval" || !row.idCardPhotos) {
    return res.status(404).json({ error: "Original ID-card photos are unavailable for editing." });
  }
  const side = req.params.side === "front" ? "front" : req.params.side === "back" ? "back" : null;
  if (!side) return res.status(400).json({ error: "Side must be front or back." });
  const storedName = row.idCardPhotos[side + "StoredName"];
  const mimeType = row.idCardPhotos[side + "MimeType"];
  if (!storedName) return res.status(404).json({ error: "Original photo not found." });
  const filePath = path.join(UPLOAD_DIR, path.basename(storedName));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Original photo file is missing." });
  res.setHeader("Content-Type", mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", 'inline; filename="id-card-' + side + '"');
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(filePath);
});

// Owner saves a corrected A4 ID-card PDF. Only pending ID-card jobs can be edited.
const ownerIdCardReplaceFields = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "idFrontPhoto", maxCount: 1 },
  { name: "idBackPhoto", maxCount: 1 }
]);
app.post("/api/owner/requests/:id/replace-id-card-pdf", auth(OWNER_TOKEN), ownerIdCardReplaceFields, (req, res) => {
  const mainFile = req.files && req.files.file && req.files.file[0];
  const frontPhoto = req.files && req.files.idFrontPhoto && req.files.idFrontPhoto[0];
  const backPhoto = req.files && req.files.idBackPhoto && req.files.idBackPhoto[0];
  const cleanupIncoming = () => [mainFile, frontPhoto, backPhoto].filter(Boolean).forEach(f => fs.unlink(f.path, () => {}));
  if (!mainFile || path.extname(mainFile.originalname).toLowerCase() !== ".pdf") {
    cleanupIncoming();
    return res.status(400).json({ error: "Corrected print file must be a PDF." });
  }
  if (!!frontPhoto !== !!backPhoto) {
    cleanupIncoming();
    return res.status(400).json({ error: "Upload both front and back photos together." });
  }
  const db = readDb();
  const row = db.find(x => x.id === req.params.id);
  if (!row || row.jobType !== "id-card") {
    cleanupIncoming();
    return res.status(404).json({ error: "ID-card request not found." });
  }
  if (row.status !== "Pending approval") {
    cleanupIncoming();
    return res.status(409).json({ error: "Only pending requests can be edited. Reject or create a new request if needed." });
  }
  const previousPdf = row.storedName;
  const previousPhotos = row.idCardPhotos;
  row.storedName = mainFile.filename;
  row.originalName = "ID-Card-Front-Back.pdf";
  row.mimeType = mainFile.mimetype;
  row.bytes = mainFile.size;
  row.settings = {
    ...row.settings,
    copies: Math.max(1, Math.min(20, Number.parseInt(req.body.copies || String(row.settings.copies || 1), 10) || 1)),
    color: req.body.color === "Color" ? "Color" : "Black & White",
    fit: "Actual size",
    paper: "A4",
    orientation: "Portrait",
    sides: "Single-sided",
    note: "Owner-corrected ID Card Front left, Back right"
  };
  if (frontPhoto && backPhoto) {
    row.idCardPhotos = {
      frontStoredName: frontPhoto.filename,
      frontOriginalName: path.basename(frontPhoto.originalname).slice(0, 160),
      frontMimeType: frontPhoto.mimetype,
      backStoredName: backPhoto.filename,
      backOriginalName: path.basename(backPhoto.originalname).slice(0, 160),
      backMimeType: backPhoto.mimetype
    };
  }
  writeDb(db);
  [previousPdf].filter(Boolean).forEach(name => {
    const oldPath = path.join(UPLOAD_DIR, path.basename(name));
    if (oldPath !== mainFile.path && fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
  });
  if (frontPhoto && backPhoto && previousPhotos) {
    [previousPhotos.frontStoredName, previousPhotos.backStoredName].filter(Boolean).forEach(name => {
      const oldPath = path.join(UPLOAD_DIR, path.basename(name));
      if (oldPath !== frontPhoto.path && oldPath !== backPhoto.path && fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
    });
  }
  res.json({ id: row.id, status: row.status, message: "Corrected ID-card PDF saved. Review the preview, then approve the request." });
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
cleanupExpiredUploads();
setInterval(cleanupExpiredUploads, 15 * 60 * 1000).unref();
app.listen(PORT, () => console.log(`RK Smart Print server listening on port ${PORT}`));

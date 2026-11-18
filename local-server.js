// Server lokal sederhana: menyajikan file web + menjalankan api/chat.js (tanpa Vercel CLI)
const http = require("http"), fs = require("fs"), path = require("path");

// Baca .env
try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*(\w+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
} catch (e) {}

const handler = require("./api/chat.js");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (url === "/api/chat") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = {}; }
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(o)); return res; };
      Promise.resolve(handler(req, res)).catch((e) => {
        if (!res.headersSent) res.status(500).json({ error: e.message }); else res.end();
      });
    });
    return;
  }

  const file = path.join(__dirname, url === "/" ? "index.html" : decodeURIComponent(url));
  const blocked = /(^|\/)\./.test(url) || /^\/(api|local-server\.js|vercel\.json)/.test(url);
  if (blocked || !file.startsWith(__dirname)) { res.statusCode = 404; return res.end("Not found"); }

  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    res.end(data);
  });
}).listen(3000, () => console.log("Jalan di http://localhost:3000 (jangan tutup terminal ini)"))
  .on("error", (e) => console.log("Gagal start:", e.message));
process.on("exit", (c) => console.log("Server berhenti, kode:", c));
process.on("uncaughtException", (e) => console.log("Error:", e.message));
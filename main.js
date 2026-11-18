const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
let chats = [], cur = null, busy = false, ctrl = null;
try { chats = JSON.parse(localStorage.getItem("studyai_chats") || "[]"); } catch (e) {}
const save = () => { try { localStorage.setItem("studyai_chats", JSON.stringify(chats)); } catch (e) {} };
const get = () => chats.find((c) => c.id === cur);

// Sapaan sesuai jam
const h = new Date().getHours();
$("hi").textContent = (h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam") + ", mau ngoding apa?";

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 4000);
}

/* ===== Markdown renderer (tahan terhadap blok kode yang belum selesai saat streaming) ===== */
function inl(s) {
  const codes = [];
  s = esc(s).replace(/`([^`]+)`/g, (_, x) => { codes.push(x); return "\u0001" + (codes.length - 1) + "\u0001"; });
  s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, "$1<i>$2</i>");
  return s.replace(/\u0001(\d+)\u0001/g, (_, n) => "<code>" + codes[n] + "</code>");
}
function codeBlock(lang, code) {
  return `<div class="cb"><div class="ch"><span>${esc(lang || "kode")}</span><button class="cc">Salin</button></div><pre><code>${esc(code)}</code></pre></div>`;
}
function md(src) {
  const lines = src.replace(/\r/g, "").split("\n");
  const LIST = /^\s*([-*]|\d+\.)\s/;
  let out = "", i = 0, m;
  while (i < lines.length) {
    const l = lines[i];
    if ((m = l.match(/^```\s*([\w+#.-]*)/))) {
      const code = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++; out += codeBlock(m[1], code.join("\n")); continue;
    }
    if (/^\s*$/.test(l)) { i++; continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { const n = m[1].length + 1; out += `<h${n}>${inl(m[2])}</h${n}>`; i++; continue; }
    if (/^\s*---+\s*$/.test(l)) { out += "<hr>"; i++; continue; }
    if (LIST.test(l)) {
      const ord = /^\s*\d+\./.test(l), items = [];
      while (i < lines.length && LIST.test(lines[i])) { items.push(lines[i].replace(LIST, "")); i++; }
      out += `<${ord ? "ol" : "ul"}>` + items.map((x) => `<li>${inl(x)}</li>`).join("") + `</${ord ? "ol" : "ul"}>`; continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && lines[i + 1].includes("|") && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])) {
      const row = (s) => s.trim().replace(/^\||\|$/g, "").split("|").map((x) => x.trim());
      const head = row(l); i += 2; const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { body.push(row(lines[i])); i++; }
      out += `<div class="tw"><table><thead><tr>${head.map((x) => `<th>${inl(x)}</th>`).join("")}</tr></thead><tbody>` +
        body.map((r) => `<tr>${r.map((c) => `<td>${inl(c)}</td>`).join("")}</tr>`).join("") + `</tbody></table></div>`; continue;
    }
    if (/^>/.test(l)) {
      const q = [];
      while (i < lines.length && /^>/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, "")); i++; }
      out += `<blockquote>${q.map(inl).join("<br>")}</blockquote>`; continue;
    }
    const p = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(```|#{1,4}\s|>)/.test(lines[i]) && !LIST.test(lines[i])) { p.push(lines[i]); i++; }
    if (!p.length) { p.push(lines[i]); i++; }
    out += `<p>${p.map(inl).join("<br>")}</p>`;
  }
  return out;
}

/* ===== UI ===== */
function scrollDown(force) {
  const s = $("scroll");
  if (force || s.scrollHeight - s.scrollTop - s.clientHeight < 160) s.scrollTop = s.scrollHeight;
}
function row(role) {
  const r = document.createElement("div");
  r.className = "row " + role;
  r.innerHTML = '<div class="body"></div>';
  $("msgs").appendChild(r);
  return r;
}
function addActions(r, text, last) {
  const a = document.createElement("div");
  a.className = "act";
  a.innerHTML = "<button>Salin</button>" + (last ? "<button>Ulangi</button>" : "");
  const [cp, rd] = a.querySelectorAll("button");
  cp.onclick = () => { navigator.clipboard.writeText(text); cp.textContent = "Tersalin ✓"; setTimeout(() => (cp.textContent = "Salin"), 1500); };
  if (rd) rd.onclick = redo;
  r.appendChild(a);
}
function renderSide() {
  $("list").innerHTML = chats.map((c) =>
    `<div class="it ${c.id === cur ? "on" : ""}" data-id="${c.id}"><span>${esc(c.title)}</span><button data-del="${c.id}" title="Hapus">✕</button></div>`).join("");
}
function render() {
  renderSide();
  const c = get();
  $("empty").style.display = c ? "none" : "block";
  document.querySelector("main").classList.toggle("home", !c);
  $("msgs").innerHTML = "";
  if (c) c.msgs.forEach((m, i) => {
    const r = row(m.role), b = r.querySelector(".body");
    if (m.role === "user") b.textContent = m.content;
    else { b.innerHTML = md(m.content); addActions(r, m.content, i === c.msgs.length - 1); }
  });
  scrollDown(true);
}
function setBusy(v) { busy = v; $("send").textContent = v ? "■" : "↑"; $("send").title = v ? "Hentikan" : "Kirim"; }
function newChat() { if (busy) return; cur = null; render(); closeSide(); $("in").focus(); }
function redo() {
  if (busy) return;
  const c = get(); if (!c) return;
  if (c.msgs.length && c.msgs[c.msgs.length - 1].role === "assistant") c.msgs.pop();
  const u = c.msgs.pop(); if (!u) return;
  save(); render(); send(u.content);
}

/* ===== Kirim pesan dengan streaming ===== */
async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  setBusy(true);
  $("in").value = ""; $("in").style.height = "auto";
  if (!cur) { const n = { id: Date.now() + "", title: text.slice(0, 40), msgs: [] }; chats.unshift(n); cur = n.id; }
  const c = get();
  c.msgs.push({ role: "user", content: text });
  render();
  const r = row("assistant"), b = r.querySelector(".body");
  b.innerHTML = '<span class="dots">● ● ●</span>'; scrollDown(true);

  let full = "", failed = null;
  ctrl = new AbortController();
  try {
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: c.msgs, mode: $("mode").value }), signal: ctrl.signal,
    });
    if (!res.ok) { let m = "Terjadi kesalahan."; try { m = (await res.json()).error || m; } catch (e) {} throw new Error(m); }
    const rd = res.body.getReader(), dec = new TextDecoder();
    let pend = false;
    const paint = () => { pend = false; b.innerHTML = md(full); scrollDown(); };
    while (true) {
      const { done, value } = await rd.read();
      if (done) break;
      full += dec.decode(value, { stream: true });
      if (!pend) { pend = true; requestAnimationFrame(paint); }
    }
    full += dec.decode();
  } catch (e) { if (e.name !== "AbortError") failed = e.message; }
  ctrl = null;

  if (full.trim()) {
    c.msgs.push({ role: "assistant", content: full });
    b.innerHTML = md(full);
    if (failed) b.insertAdjacentHTML("beforeend", `<p class="err">⚠️ ${esc(failed)}</p>`);
    addActions(r, full, true);
  } else {
    c.msgs.pop();                 // batalkan pesan user yang gagal
    $("in").value = text;         // kembalikan teksnya ke kotak input
    if (!c.msgs.length) { chats = chats.filter((x) => x !== c); cur = null; }
    if (failed) toast("⚠️ " + failed);
    render();
  }
  save(); renderSide(); setBusy(false);
}

/* ===== Event ===== */
const openSide = () => { $("side").classList.add("open"); $("shade").classList.add("open"); };
const closeSide = () => { $("side").classList.remove("open"); $("shade").classList.remove("open"); };
$("send").onclick = () => (busy ? ctrl && ctrl.abort() : send($("in").value));
$("in").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!busy) send($("in").value); } });
$("in").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 220) + "px"; });
$("new").onclick = newChat;
$("menu").onclick = openSide;
$("shade").onclick = closeSide;
document.querySelector(".sg").onclick = (e) => { if (e.target.tagName === "BUTTON") send(e.target.textContent); };
$("msgs").onclick = (e) => {
  const b = e.target.closest(".cc"); if (!b) return;
  navigator.clipboard.writeText(b.closest(".cb").querySelector("code").textContent);
  b.textContent = "Tersalin ✓"; setTimeout(() => (b.textContent = "Salin"), 1500);
};
$("list").onclick = (e) => {
  if (busy) return;
  const del = e.target.dataset.del, it = e.target.closest(".it");
  if (del) { chats = chats.filter((c) => c.id !== del); if (cur === del) cur = null; save(); render(); }
  else if (it) { cur = it.dataset.id; render(); closeSide(); }
};
render();
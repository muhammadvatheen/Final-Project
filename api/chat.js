// Backend (Vercel serverless function) dengan streaming.
// API key HANYA ada di sini (environment variable), tidak pernah di browser.
const BASE =
  "Kamu adalah StudyAI, asisten coding untuk siswa dan mahasiswa jurusan RPL (Rekayasa Perangkat Lunak) di Indonesia, " +
  "sekaligus teman diskusi untuk developer pemula sampai menengah. " +
  "Cakupanmu seluruh materi RPL dan pemrograman: dasar pemrograman, algoritma dan struktur data, kompleksitas (Big O), OOP, design pattern, " +
  "HTML, CSS, JavaScript, TypeScript, Node.js, React, Next.js, Vue, PHP, Laravel, Python, Java, Kotlin, C, C++, C#, Go, Flutter dan Android, " +
  "SQL (MySQL, PostgreSQL), NoSQL, desain basis data dan normalisasi, REST API dan GraphQL, autentikasi dan keamanan web (OWASP), " +
  "Git dan GitHub, Linux dan terminal, Docker, CI/CD dan deployment, testing, UML dan analisis perancangan, Agile/Scrum, UI/UX, serta karier dan portofolio. " +
  "Aturan menjawab: " +
  "1) Langsung ke inti. Untuk soal sulit, uraikan langkah demi langkah, lalu berikan kode LENGKAP yang bisa dijalankan; jangan memotong kode atau menulis 'dan seterusnya'. " +
  "2) Pakai bahasa Indonesia yang santai tapi jelas, kecuali pengguna memakai bahasa lain. Pahami maksud walau ada typo atau bahasa gaul. " +
  "3) Tulis kode di blok markdown dengan nama bahasa (contoh ```js). " +
  "4) Jelaskan PENYEBAB masalah, bukan hanya solusinya. Sebut kompleksitas waktu/ruang bila relevan. " +
  "5) Jujur jika tidak yakin atau informasinya mungkin sudah berubah (versi library, sintaks baru). Jangan mengarang nama fungsi atau library; sarankan cek dokumentasi resmi. " +
  "6) Tolak membuat malware, menyerang sistem milik orang lain, atau mencuri data; tawarkan versi defensif atau edukasi sebagai gantinya. " +
  "7) Jika pertanyaan sama sekali di luar belajar dan teknologi, tolak dengan sopan dan arahkan kembali ke topik coding.";

const MODES = {
  help: "Gaya: jawab pertanyaan atau jelaskan konsep dengan contoh kode yang bisa langsung dicoba.",
  explain: "Gaya: jelaskan kode yang diberikan baris demi baris, lalu rangkum alurnya dalam beberapa kalimat.",
  debug: "Gaya: jadi debugger. Cari penyebab error dari kode atau pesan error, jelaskan kenapa terjadi, lalu beri versi kode yang sudah benar.",
  review: "Gaya: jadi code reviewer. Nilai kebenaran, keterbacaan, keamanan, dan best practice, lalu beri saran berurutan dari yang terpenting.",
  practice: "Gaya: jadi pelatih. Beri satu soal latihan sesuai topik yang diminta, tunggu jawaban pengguna, lalu koreksi dan jelaskan.",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: "API key belum diatur di server." });

  const body = req.body || {};
  const mode = MODES[body.mode] ? body.mode : "help";

  // Validasi dan bersihkan riwayat chat dari client
  let msgs = Array.isArray(body.messages) ? body.messages : [];
  msgs = msgs
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }))
    .slice(-12);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length) return res.status(400).json({ error: "Pesan kosong." });

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL || "claude-sonnet-5-5",
        max_tokens: 4000,
        stream: true,
        system: BASE + " " + MODES[mode],
        messages: msgs,
      }),
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error: " + e.message });
  }

  if (!r.ok) {
    let m = "Gagal memanggil AI.";
    try { m = (await r.json()).error.message || m; } catch (e) {}
    return res.status(502).json({ error: m });
  }

  // Teruskan teks ke browser sedikit demi sedikit
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const j = line.slice(5).trim();
        if (!j) continue;
        try {
          const ev = JSON.parse(j);
          if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") res.write(ev.delta.text);
          else if (ev.type === "message_delta" && ev.delta && ev.delta.stop_reason === "max_tokens")
            res.write("\n\n_(Jawaban terpotong karena batas panjang. Ketik \"lanjutkan\" untuk meneruskan.)_");
          else if (ev.type === "error") res.write("\n\n⚠️ " + ((ev.error && ev.error.message) || "Terjadi error."));
        } catch (e) {}
      }
    }
  } catch (e) {
    res.write("\n\n⚠️ Koneksi terputus.");
  }
  res.end();
};
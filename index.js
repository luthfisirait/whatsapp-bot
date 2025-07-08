const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode-terminal");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const otpStore = require("./otp-store"); // pastikan file ini ada dan berfungsi

// === Express & HTTP Server Setup ===
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const server = http.createServer(app); // untuk gabung WebSocket dan Express
const wss = new WebSocket.Server({ server });

// === Simpan koneksi WebSocket berdasarkan nomor WA ===
const wsClients = new Map(); // key: waNumber, value: ws connection

wss.on("connection", (ws) => {
  console.log("🔌 WebSocket client connected.");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "register" && data.phone) {
        const waNumber = data.phone.replace(/^0/, "62") + "@c.us";
        wsClients.set(waNumber, ws);
        console.log("📲 WebSocket registered for", waNumber);
      }
    } catch (err) {
      console.error("❌ Invalid WS message:", err.message);
    }
  });

  ws.on("close", () => {
    for (const [key, client] of wsClients.entries()) {
      if (client === ws) {
        wsClients.delete(key);
        console.log("❌ WS client for", key, "disconnected");
        break;
      }
    }
  });
});

// === WhatsApp Client Setup ===
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, ".wwebjs_auth"),
  }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// === WhatsApp Events ===
client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("📸 Scan QR dari WhatsApp kamu");
});

client.on("authenticated", () => {
  console.log("🔐 Autentikasi berhasil. Session akan tersimpan otomatis.");
});

client.on("ready", async () => {
  const state = await client.getState();
  console.log("\n=============================");
  console.log("🤖 Bot WhatsApp AKTIF!");
  console.log("📁 Lokasi session:", path.join(__dirname, ".wwebjs_auth"));
  console.log("📦 Status:", state);
  console.log("📬 Menunggu pesan OTP dari user...");
  console.log("=============================\n");
});

client.on("auth_failure", (msg) => {
  console.error("❌ Autentikasi gagal:", msg);
});

// === Proses Pesan Masuk (Verifikasi OTP) ===
client.on("message", (msg) => {
  const from = msg.from;
  const content = msg.body.trim();
  const otpMatch = content.match(/\b\d{6}\b/);

  console.log(`📩 Pesan masuk dari ${from}: "${content}"`);

  if (!otpMatch) {
    return console.log("❌ Tidak ada OTP valid ditemukan.");
  }

  const otp = otpMatch[0];
  const matched = otpStore.verifyOtp(from, otp);

  if (matched) {
    console.log(`✅ OTP cocok dari ${from}`);
    msg.reply("✅ OTP kamu berhasil diverifikasi.");

    const ws = wsClients.get(from);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "otp_verified" }));
      console.log("📡 WS otp_verified dikirim ke frontend");
    }
  } else {
    console.log(`❌ OTP tidak cocok dari ${from}: "${otp}"`);
    msg.reply("❌ OTP tidak cocok. Silakan coba lagi.");
  }
});

// === Endpoint Webhook OTP dari Frontend ===
app.post("/webhook/otp", (req, res) => {
  const { phone, otp } = req.body;
  const fullNumber = phone.startsWith("62") ? phone : phone.replace(/^0/, "62");
  const waNumber = fullNumber + "@c.us";

  otpStore.saveOtp(waNumber, otp);
  console.log(`📥 OTP ${otp} disimpan untuk ${waNumber}`);
  res.json({ success: true });
});

// === Jalankan Server Express + WebSocket ===
server.listen(port, () => {
  console.log(`🚀 Server berjalan di http://localhost:${port}`);
});

// === Jalankan WhatsApp Bot ===
client.initialize();

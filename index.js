require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');

const DB_FILE = 'keys.json';
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({}));

function getDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function saveDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

const app = express();
app.use(express.json());

// ==========================================
// PHẦN 1: DISCORD BOT
// ==========================================
client.once('ready', () => {
  console.log(`[BOT] Đã đăng nhập: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  let db = getDB();

  // Lệnh: !getkey
  if (command === 'getkey') {
    const userId = message.author.id;
    if (db[userId]) {
      const expireDate = new Date(db[userId].expire).toLocaleString('vi-VN');
      return message.reply(`Bạn đã có key: \`${db[userId].key}\`\nHết hạn: ${expireDate}`);
    }

    const newKey = generateKey();
    const expireTime = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 ngày
    db[userId] = { key: newKey, expire: expireTime, hwid: null };
    saveDB(db);

    try {
      await message.author.send(`Key của bạn: \`${newKey}\`\nHết hạn: ${new Date(expireTime).toLocaleString('vi-VN')}`);
      message.reply('Đã gửi key qua DM!');
    } catch {
      message.reply('Không thể DM. Hãy mở tin nhắn riêng.');
    }
  }

  // Lệnh Admin: !gen <số_ngày>
  if (command === 'gen') {
    if (message.author.id !== process.env.ADMIN_ID) return message.reply('Không có quyền.');
    const days = parseInt(args[0]) || 30;
    const newKey = generateKey();
    const expireTime = Date.now() + (days * 24 * 60 * 60 * 1000);
    db[newKey] = { key: newKey, expire: expireTime, hwid: null, owner: null };
    saveDB(db);
    message.reply(`Đã tạo key: \`${newKey}\` (${days} ngày)`);
  }

  // Lệnh Admin: !reset @user
  if (command === 'reset') {
    if (message.author.id !== process.env.ADMIN_ID) return message.reply('Không có quyền.');
    const target = message.mentions.users.first();
    if (!target) return message.reply('Cần tag user.');
    delete db[target.id];
    saveDB(db);
    message.reply(`Đã reset key của ${target.tag}.`);
  }
});

// ==========================================
// PHẦN 2: API SERVER (CHO LOADER C++)
// ==========================================
app.post('/api/activate', (req, res) => {
  const { key, hwid } = req.body;
  if (!key || !hwid) return res.status(400).json({ error: "Thiếu key hoặc hwid" });

  const db = getDB();
  
  // Tìm key trong DB (có thể lưu theo userId hoặc key trực tiếp)
  let foundKey = null;
  let ownerId = null;

  for (const [id, data] of Object.entries(db)) {
    if (data.key === key || id === key) {
      foundKey = data;
      ownerId = id;
      break;
    }
  }

  if (!foundKey) return res.status(403).json({ error: "Key không tồn tại" });

  if (foundKey.expire && Date.now() > foundKey.expire) {
    return res.status(403).json({ error: "Key đã hết hạn" });
  }

  // Gắn HWID nếu chưa có
  if (!foundKey.hwid) {
    foundKey.hwid = hwid;
  } else if (foundKey.hwid !== hwid) {
    return res.status(403).json({ error: "Key đã được dùng trên thiết bị khác" });
  }

  db[ownerId] = foundKey;
  saveDB(db);

  const expireStr = foundKey.expire ? new Date(foundKey.expire).toLocaleString('vi-VN') : 'Vĩnh viễn';
  res.json({ token: "session_" + Math.random().toString(36).substring(2), expire: expireStr });
});

// Route ping để giữ bot không bị Render ngủ
app.get('/ping', (req, res) => res.send('OK'));

function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    if (i < 3) result += '-';
  }
  return result;
}

client.login(process.env.DISCORD_TOKEN);
app.listen(process.env.PORT || 3000, () => console.log(`[API] Running on port ${process.env.PORT || 3000}`));
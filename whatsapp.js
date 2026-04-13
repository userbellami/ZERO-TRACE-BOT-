const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const config = require('./config');
let sock = null, isConnected = false, startTime = null;
const connectWA = async (pairingNumber = null, onPairingCode = null) => {
    const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_DIR);
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['Zero Trace Bot', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        patchMessageBeforeSending: (msg) => { if (msg.text && msg.text.length > 500) msg.text = msg.text.substring(0,500)+'...'; return msg; },
        generateHighQualityLinkPreview: false,
        logger: require('pino')({ level: 'silent' }),
        maxCachedMessages: 50,
        maxMessageRetryCount: 1
    });
    startTime = Date.now();
    sock.ev.on('creds.update', saveCreds);
    if (pairingNumber) setTimeout(async () => {
        try {
            const code = await sock.requestPairingCode(pairingNumber.replace(/[^0-9]/g, ''));
            if (onPairingCode) onPairingCode(code, pairingNumber);
        } catch (err) { if (onPairingCode) onPairingCode(null, null, err.message); }
    }, 1000);
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            isConnected = false;
            if ((lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut)
                setTimeout(() => connectWA(), 5000);
        } else if (connection === 'open') {
            isConnected = true;
            const ownerJid = config.OWNER_NUMBER + '@s.whatsapp.net';
            if (fs.existsSync(config.STARTUP_IMAGE))
                await sock.sendMessage(ownerJid, { image: fs.readFileSync(config.STARTUP_IMAGE), caption: `🚀 ${config.BOT_NAME} online!\n💧 Prefix: ${config.PREFIX}` });
            else
                await sock.sendMessage(ownerJid, { text: `🚀 ${config.BOT_NAME} online!` });
        }
    });
    return sock;
};
const disconnectWA = async () => { if (sock) await sock.logout(); sock = null; isConnected = false; };
const restartWithPairing = async (phone, cb) => { await disconnectWA(); return await connectWA(phone, cb); };
const getWAConnection = () => sock;
const isWAConnected = () => isConnected;
const getWAUptime = () => startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
module.exports = { connectWA, disconnectWA, restartWithPairing, getWAConnection, isWAConnected, getWAUptime };

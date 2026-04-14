const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const config = require('./config');

let sock = null;
let isConnected = false;
let connectionStartTime = null;
let pingInterval = null;

const connectWA = async (pairingNumber = null, onPairingCode = null) => {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_DIR);
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['ZeroTraceBot', 'Chrome', '122.0.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: true,
            patchMessageBeforeSending: (msg) => {
                if (msg.text && msg.text.length > 500) msg.text = msg.text.substring(0,500)+'...';
                return msg;
            },
            generateHighQualityLinkPreview: false,
            logger: require('pino')({ level: 'silent' }),
            maxCachedMessages: 50,
            maxMessageRetryCount: 1,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000  // Send ping every 30s to keep connection alive
        });

        connectionStartTime = Date.now();
        sock.ev.on('creds.update', saveCreds);

        // Pairing logic (same as before)
        if (pairingNumber && typeof pairingNumber === 'string') {
            const waitForOpen = () => new Promise((resolve) => {
                const onUpdate = (update) => {
                    if (update.connection === 'open') {
                        sock.ev.off('connection.update', onUpdate);
                        resolve(true);
                    }
                };
                sock.ev.on('connection.update', onUpdate);
                setTimeout(() => resolve(false), 20000);
            });
            
            const opened = await waitForOpen();
            if (!opened) {
                if (onPairingCode) onPairingCode(null, null, 'Connection timeout');
                return sock;
            }
            
            try {
                const formattedNumber = pairingNumber.replace(/[^0-9]/g, '');
                console.log(`[PAIR] Requesting code for ${formattedNumber}`);
                const code = await sock.requestPairingCode(formattedNumber);
                console.log(`[PAIR] Code received: ${code}`);
                if (onPairingCode) onPairingCode(code, formattedNumber, null);
            } catch (err) {
                console.error('[PAIR] Error:', err);
                if (onPairingCode) onPairingCode(null, null, err.message);
            }
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            console.log(`[WA] Connection update: ${connection || 'connecting'}`);
            
            if (connection === 'close') {
                isConnected = false;
                if (pingInterval) clearInterval(pingInterval);
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log('[WA] Reconnecting in 5s...');
                    setTimeout(() => connectWA(), 5000);
                }
            } else if (connection === 'open') {
                isConnected = true;
                console.log('[WA] Connected successfully!');
                // Send a ping every 30 seconds to keep the socket alive
                pingInterval = setInterval(() => {
                    if (sock && isConnected) {
                        sock.sendPresenceUpdate('available').catch(e => console.log('Ping failed'));
                    }
                }, 30000);
                
                const ownerJid = config.OWNER_NUMBER + '@s.whatsapp.net';
                if (fs.existsSync(config.STARTUP_IMAGE)) {
                    await sock.sendMessage(ownerJid, { image: fs.readFileSync(config.STARTUP_IMAGE), caption: `🚀 ${config.BOT_NAME} online!` });
                } else {
                    await sock.sendMessage(ownerJid, { text: `🚀 ${config.BOT_NAME} online!` });
                }
            }
        });

        return sock;
    } catch (error) {
        console.error('[WA] Connection error:', error);
        throw error;
    }
};

const disconnectWA = async () => {
    if (pingInterval) clearInterval(pingInterval);
    if (sock) await sock.logout();
    sock = null;
    isConnected = false;
};
const restartWithPairing = async (phone, cb) => { await disconnectWA(); return await connectWA(phone, cb); };
const getWAConnection = () => sock;
const isWAConnected = () => isConnected;
const getWAUptime = () => connectionStartTime ? Math.floor((Date.now() - connectionStartTime) / 1000) : 0;

module.exports = { connectWA, disconnectWA, restartWithPairing, getWAConnection, isWAConnected, getWAUptime };

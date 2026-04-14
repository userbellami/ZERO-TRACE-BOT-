const fs = require('fs');
const config = require('./config');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');
const commands = require('./commands.json');
const replies = require('./replies.json');
const getMenu = () => fs.existsSync(config.MENU_FILE) ? fs.readFileSync(config.MENU_FILE, 'utf-8') : "Menu missing";
const isOwner = (num) => num.replace(/[^0-9]/g, '') === config.OWNER_NUMBER.replace(/[^0-9]/g, '');
const formatUptime = (s) => `${Math.floor(s/86400)}d ${Math.floor((s%86400)/3600)}h ${Math.floor((s%3600)/60)}m ${s%60}s`;
const processWhatsAppMessage = async (sock, msg, waUptime) => {
    try {
        if (!msg.message || msg.key.fromMe) return;
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (!text) return;
        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');
        const sender = (msg.key.participant || jid).split('@')[0];
        let groupMeta = null;
        if (isGroup) try { groupMeta = await sock.groupMetadata(jid); } catch(e) {}
        if (!text.startsWith(config.PREFIX)) {
            const lower = text.toLowerCase();
            for (const [k, v] of Object.entries(replies))
                if (lower.includes(k)) return await sock.sendMessage(jid, { text: v });
            return;
        }
        const cmd = text.slice(config.PREFIX.length).trim().split(' ')[0].toLowerCase();
        const args = text.slice(config.PREFIX.length).trim().split(' ').slice(1);
        if (!commands[cmd]) return await sock.sendMessage(jid, { text: `❌ Unknown. ${config.PREFIX}menu` });
        if (commands[cmd].category === 'owner' && !isOwner(sender))
            return await sock.sendMessage(jid, { text: '❌ Owner only.' });
        switch (cmd) {
            case 'menu': return await sock.sendMessage(jid, { text: getMenu() });
            case 'ping': return await sock.sendMessage(jid, { text: '🏓 Pong!' });
            case 'info': return await sock.sendMessage(jid, { text: `🤖 ${config.BOT_NAME}\nPrefix: ${config.PREFIX}\nOwner: LORD MONK` });
            case 'owner': return await sock.sendMessage(jid, { text: `👑 *Owner*: LORD MONK\n🤖 ${config.BOT_NAME}` });
            case 'uptime': return await sock.sendMessage(jid, { text: `⏱️ ${formatUptime(waUptime)}` });
            case 'joke': return await sock.sendMessage(jid, { text: `😂 ${['Why?','What?','How?'][Math.floor(Math.random()*3)]} joke!` });
            case 'tagall':
                if (!groupMeta) return await sock.sendMessage(jid, { text: 'Group only.' });
                const mentions = groupMeta.participants.map(p => p.id);
                return await sock.sendMessage(jid, { text: '📢 @everyone\n' + mentions.map(m => `@${m.split('@')[0]}`).join('\n'), mentions });
            case 'admins':
                if (!groupMeta) return await sock.sendMessage(jid, { text: 'Group only.' });
                const admins = groupMeta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
                if (!admins.length) return await sock.sendMessage(jid, { text: 'No admins.' });
                return await sock.sendMessage(jid, { text: '👑 Admins\n' + admins.map(a => `@${a.id.split('@')[0]}`).join('\n'), mentions: admins.map(a => a.id) });
            case 'ytmp3':
                if (!args.length) return await sock.sendMessage(jid, { text: 'Usage: 💧ytmp3 <song name or URL>' });
                await sock.sendMessage(jid, { text: '🎵 Searching...' });
                let url = args.join(' ');
                if (!url.includes('youtube.com')) {
                    const search = await ytSearch(url);
                    if (!search.videos.length) return await sock.sendMessage(jid, { text: 'Not found.' });
                    url = search.videos[0].url;
                }
                const info = await ytdl.getInfo(url);
                const title = info.videoDetails.title.replace(/[^\w\s]/g, '');
                const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
                const pass = new PassThrough();
                ffmpeg(stream).toFormat('mp3').audioBitrate(128).pipe(pass);
                return await sock.sendMessage(jid, { audio: { stream: pass }, mimetype: 'audio/mpeg', fileName: `${title}.mp3`, caption: `🎵 ${title}` });
            default: return await sock.sendMessage(jid, { text: '⚠️ Not implemented.' });
        }
    } catch (err) { console.error(err); await sock.sendMessage(msg.key.remoteJid, { text: '❌ Error' }); }
};
module.exports = { processWhatsAppMessage, isOwner, formatUptime };

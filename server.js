const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let qrCodeData = null;
let isConnected = false;
let statusText = "Initializing...";
let connectionTimeout; // Watchdog timer

// --- 1. BOOT CLEANUP (Prevents "Zombie" Sessions) ---
console.log('>>> SYSTEM BOOT: Clearing session cache... <<<');
if (fs.existsSync('auth_info')) {
    try {
        fs.rmSync('auth_info', { recursive: true, force: true });
        console.log('>>> Cache cleared. Ready. <<<');
    } catch (e) {
        console.error('Clear failed:', e);
    }
}

async function startWhatsApp() {
    statusText = "Fetching WhatsApp Version...";
    console.log(statusText);

    // Fetch latest version to avoid "Outdated" errors
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WhatsApp v${version.join('.')}, isLatest: ${isLatest}`);

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true, // Helpful for logs
        // USE WINDOWS SIGNATURE (Most stable)
        browser: ["Windows", "Chrome", "10.15.7"], 
        syncFullHistory: false, // Faster connection
        connectTimeoutMs: 20000, // Fail fast if stuck
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // --- WATCHDOG: If stuck on "connecting" for 15s, restart ---
        if (connection === 'connecting') {
            statusText = "Connecting to WhatsApp servers...";
            console.log(statusText);
            clearTimeout(connectionTimeout);
            connectionTimeout = setTimeout(() => {
                console.log('>>> STUCK CONNECTING? Force Restarting... <<<');
                sock.end(undefined);
                startWhatsApp();
            }, 15000); // 15 Seconds
        }

        if (qr) {
            // QR received! Kill the watchdog, we are good.
            clearTimeout(connectionTimeout);
            statusText = "QR Code Generated! Waiting for scan...";
            console.log('>>> NEW QR CODE GENERATED <<<'); 
            qrcode.toDataURL(qr, (err, url) => {
                qrCodeData = url;
            });
        }

        if (connection === 'close') {
            clearTimeout(connectionTimeout);
            const reason = (lastDisconnect.error)?.output?.statusCode;
            statusText = `Connection Closed. Reason: ${reason}`;
            console.log(statusText);

            // Reconnect logic
            if (reason === DisconnectReason.loggedOut || reason === 401) {
                console.log('Logged out. cleaning up...');
                if (fs.existsSync('auth_info')) fs.rmSync('auth_info', { recursive: true, force: true });
                isConnected = false;
                qrCodeData = null;
                setTimeout(startWhatsApp, 2000); 
            } else {
                statusText = "Reconnecting...";
                setTimeout(startWhatsApp, 2000); 
            }
        } else if (connection === 'open') {
            clearTimeout(connectionTimeout);
            statusText = "Connected!";
            console.log('>>> WhatsApp Connected Successfully! <<<');
            isConnected = true;
            qrCodeData = null;
        }
    });
}

startWhatsApp();

// ---------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------

app.get('/', (req, res) => {
    res.send(`<h1>WhatsApp Bridge</h1><p>Status: <b>${statusText}</b></p>`);
});

app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        qr: qrCodeData,
        message: statusText
    });
});

app.get('/reset', async (req, res) => {
    try {
        statusText = "Resetting...";
        if (sock) sock.end(undefined);
        if (fs.existsSync('auth_info')) fs.rmSync('auth_info', { recursive: true, force: true });
        isConnected = false;
        qrCodeData = null;
        setTimeout(startWhatsApp, 2000);
        res.json({ status: 'success', message: 'Reset complete.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});

app.post('/send-message', async (req, res) => {
    if (!isConnected) return res.status(500).json({ status: 'error', message: 'Not connected' });
    const { number, message } = req.body;
    try {
        const jid = number.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        await sock.sendMessage(jid, { text: message });
        res.json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});

app.listen(port, () => {
    console.log(`Baileys Bridge running on port ${port}`);
});

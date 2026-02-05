const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
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
let statusText = "Initializing..."; // <--- NEW: Tracks exactly what the bot is doing

// --- AUTO-WIPE ON STARTUP ---
// Ensures no bad session files exist when the server wakes up
if (fs.existsSync('auth_info')) {
    try {
        fs.rmSync('auth_info', { recursive: true, force: true });
        console.log('>>> Session wiped on boot. <<<');
    } catch (e) {
        console.error('Wipe failed:', e);
    }
}
// ----------------------------

async function startWhatsApp() {
    statusText = "Starting WhatsApp Client...";
    console.log(statusText);
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        // USE STANDARD BROWSER SIGNATURE TO PREVENT BLOCKS
        browser: ["Ubuntu", "Chrome", "20.0.04"], 
        connectTimeoutMs: 60000, 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            statusText = "QR Code Generated! Waiting for scan...";
            console.log('>>> NEW QR CODE GENERATED <<<'); 
            qrcode.toDataURL(qr, (err, url) => {
                qrCodeData = url;
            });
        }

        if (connection === 'close') {
            const reason = (lastDisconnect.error)?.output?.statusCode;
            statusText = `Connection Closed. Reason: ${reason}`;
            console.log(statusText);

            if (reason === DisconnectReason.loggedOut || reason === 401) {
                console.log('Session invalid. Wiping...');
                if (fs.existsSync('auth_info')) {
                    fs.rmSync('auth_info', { recursive: true, force: true });
                }
                isConnected = false;
                qrCodeData = null;
                setTimeout(startWhatsApp, 2000); 
            } else {
                statusText = "Reconnecting...";
                startWhatsApp(); 
            }
        } else if (connection === 'connecting') {
            statusText = "Connecting to WhatsApp servers...";
        } else if (connection === 'open') {
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
    res.send(`<h1>WhatsApp Bridge is Running!</h1><p>Current Status: <b>${statusText}</b></p>`);
});

// UPDATED STATUS ENDPOINT
app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        qr: qrCodeData,
        message: statusText // <--- Now you can see this in your browser
    });
});

app.get('/reset', async (req, res) => {
    try {
        statusText = "Resetting...";
        if (sock) { sock.end(undefined); }
        if (fs.existsSync('auth_info')) {
            fs.rmSync('auth_info', { recursive: true, force: true });
        }
        isConnected = false;
        qrCodeData = null;
        setTimeout(startWhatsApp, 2000);
        res.json({ status: 'success', message: 'Reset complete. Wait 10s.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});

app.post('/send-message', async (req, res) => {
    if (!isConnected) return res.status(500).json({ status: 'error', message: 'Not connected' });
    const { number, message } = req.body;
    if (!number || !message) return res.status(400).json({ status: 'error', message: 'Missing data' });
    
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

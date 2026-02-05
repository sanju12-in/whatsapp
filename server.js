const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let qrCodeData = null;
let isConnected = false;

async function startWhatsApp() {
    // Save login credentials to a folder named 'auth_info'
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Prints QR to logs as backup
        logger: pino({ level: 'silent' }), // Hide debug logs
        browser: ["FiveMojo", "Chrome", "1.0.0"] // Fakes a browser signature
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('NEW QR CODE RECEIVED');
            // Convert QR to Image Data for your PHP App
            qrcode.toDataURL(qr, (err, url) => {
                qrCodeData = url;
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            isConnected = false;
            // Auto-reconnect unless logged out
            if (shouldReconnect) {
                startWhatsApp();
            } else {
                console.log('Logged out. Delete auth_info folder to re-scan.');
            }
        } else if (connection === 'open') {
            console.log('WhatsApp Connected Successfully!');
            isConnected = true;
            qrCodeData = null;
        }
    });
}

// Start the bot
startWhatsApp();

// ---------------------------------------------------------
// API ROUTES (Compatible with your PHP Script)
// ---------------------------------------------------------

// 1. Status Check
app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        qr: qrCodeData
    });
});

// 2. Send Message
app.post('/send-message', async (req, res) => {
    if (!isConnected) {
        return res.status(500).json({ status: 'error', message: 'WhatsApp not connected' });
    }

    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({ status: 'error', message: 'Missing number or message' });
    }

    try {
        // Format number: '919876543210' -> '919876543210@s.whatsapp.net'
        const cleanNumber = number.replace(/[^0-9]/g, '');
        const jid = cleanNumber + "@s.whatsapp.net";

        await sock.sendMessage(jid, { text: message });
        
        console.log(`Message sent to ${jid}`);
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Send failed:', error);
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});

app.listen(port, () => {
    console.log(`Baileys Bridge running on port ${port}`);
});

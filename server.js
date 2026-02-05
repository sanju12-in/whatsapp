const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const app = express();
const port = process.env.PORT || 3000; // Render sets PORT automatically

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let qrCodeData = null;
let isReady = false;

// ---------------------------------------------------------
// FIX FOR RENDER: Detect Chrome Path Automatically
// ---------------------------------------------------------
const puppeteer = require('puppeteer'); 
// You might need to run: npm install puppeteer (if not already installed)

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Important for memory limits on free tier
            '--disable-gpu'
        ],
        // Tell it to use the system installed Chrome
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath()
    }
});
// ---------------------------------------------------------

client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
        qrCodeData = url;
    });
});

client.on('ready', () => {
    console.log('Client is ready!');
    isReady = true;
    qrCodeData = null;
});

client.on('disconnected', () => {
    console.log('Client disconnected');
    isReady = false;
    client.initialize();
});

client.initialize();

// ... (Rest of your API routes: /status, /send-message) ...

app.listen(port, () => {
    console.log(`WhatsApp Bridge running on port ${port}`);
});

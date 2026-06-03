const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { chromium } = require('playwright');

const app = express();

// ----------------------------
// MIDDLEWARE (VACİB FIX)
// ----------------------------
app.use(cors());

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.use(express.static('.'));

// ----------------------------
// docx.js serve
// ----------------------------
app.get('/docx.js', (req, res) => {
  const docxPath = path.join(
    __dirname,
    'node_modules',
    'docx',
    'dist',
    'index.iife.js'
  );

  if (fs.existsSync(docxPath)) {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(docxPath);
  } else {
    res.status(404).send('docx not found');
  }
});

// ----------------------------
// filename safe
// ----------------------------
function safeFilename(name) {
  return (name || 'file')
    .replace(/ə/g, 'e').replace(/Ə/g, 'E')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/[^a-zA-Z0-9_\-]/g, '_');
}

// ----------------------------
// PDF GENERATOR (FIXED)
// ----------------------------
app.post('/api/docx-to-pdf', async (req, res) => {
  let browser;

  try {
    // 🔒 SAFETY CHECK
    if (!req.body || !req.body.html) {
      return res.status(400).json({
        error: "html missing in request body"
      });
    }

    const { html, filename } = req.body;
    const safeName = safeFilename(filename);

    browser = await chromium.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    });

    const page = await browser.newPage();

    await page.setContent(String(html), {
      waitUntil: 'networkidle'
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '20mm',
        right: '20mm'
      }
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}.pdf"`
    );

    res.send(pdfBuffer);

  } catch (error) {
    console.error('PDF ERROR:', error);

    if (browser) await browser.close();

    res.status(500).json({
      error: error.message || "PDF generation failed"
    });
  }
});

// ----------------------------
// PDF loader
// ----------------------------
function loadPDFs() {
  const pdfsDir = path.join(__dirname, 'pdfs');
  const pdfs = [];

  if (!fs.existsSync(pdfsDir)) return pdfs;

  const files = fs.readdirSync(pdfsDir).filter(f => f.endsWith('.pdf'));

  for (const file of files) {
    const data = fs.readFileSync(path.join(pdfsDir, file));

    pdfs.push({
      name: file,
      base64: data.toString('base64')
    });
  }

  return pdfs;
}

const pdfFiles = loadPDFs();

// ----------------------------
// CHAT endpoint
// ----------------------------
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    const systemPrompt = `
Sən "Rəfiq" adlı AI assistantsan.
PDF sənədlərə əsaslanırsan.
Azərbaycan dilində cavab ver.
`;

    const lastMessage = messages[messages.length - 1];

    const userContent = [];

    for (const pdf of pdfFiles) {
      userContent.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdf.base64
        }
      });
    }

    if (typeof lastMessage.content === 'string') {
      userContent.push({
        type: 'text',
        text: lastMessage.content
      });
    } else {
      userContent.push(...lastMessage.content);
    }

    const updatedMessages = [
      ...messages.slice(0, -1),
      { role: 'user', content: userContent }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: systemPrompt,
        messages: updatedMessages
      })
    });

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------
// START
// ----------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Rəfiq server işləyir: http://localhost:${PORT}`);
});
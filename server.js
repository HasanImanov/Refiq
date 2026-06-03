const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const chromium = require('chrome-aws-lambda');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
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
  return (name || 'arayish')
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
// PDF GENERATOR (HTML -> PDF)
// ----------------------------
app.post('/api/docx-to-pdf', async (req, res) => {
  let browser;

  try {
    const { html, filename } = req.body;
    const safeName = safeFilename(filename);

    // Chromium launch (Render-safe)
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: true,
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'networkidle0'
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
    console.error('PDF error:', error);

    if (browser) await browser.close();

    res.status(500).json({
      error: error.message
    });
  }
});

// ----------------------------
// Load PDFs
// ----------------------------
function loadPDFs() {
  const pdfsDir = path.join(__dirname, 'pdfs');
  const pdfs = [];

  if (!fs.existsSync(pdfsDir)) {
    console.log('pdfs folderi tapılmadı');
    return pdfs;
  }

  const files = fs.readdirSync(pdfsDir).filter(f => f.endsWith('.pdf'));

  for (const file of files) {
    const data = fs.readFileSync(path.join(pdfsDir, file));

    pdfs.push({
      name: file,
      base64: data.toString('base64')
    });

    console.log(`PDF yükləndi: ${file}`);
  }

  return pdfs;
}

const pdfFiles = loadPDFs();

// ----------------------------
// CHAT endpoint (Claude)
// ----------------------------
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    const systemPrompt = `
Sən "Rəfiq" adlı sosial xidmətlər üzrə ixtisaslaşmış AI assistantsan.
Sənə verilən PDF sənədlər əsasında cavab verirsən.

CAVAB FORMATI:
1. Reqlamentə əsasən
2. Qanuni əsas
3. Əgər məlumat yoxdursa: "Bu barədə mövcud sənədlərdə məlumat yoxdur"

QADAĞA: sənədlərdən kənar məlumat vermə.
Cavabları Azərbaycan dilində ver.
    `;

    const lastMessage = messages[messages.length - 1];

    const userContent = [];

    // PDFs inject
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

    // user message
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
      {
        role: 'user',
        content: userContent
      }
    ];

    const response = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
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
      }
    );

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message
    });
  }
});

// ----------------------------
// START SERVER
// ----------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Rəfiq server işləyir: http://localhost:${PORT}`);
});
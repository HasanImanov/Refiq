const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

// ----------------------------
// MIDDLEWARE
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
  return String(name || 'arayish')
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
// PDF GENERATOR
// ----------------------------
app.post('/api/docx-to-pdf', async (req, res) => {
  let browser;

  try {
    if (!req.body || !req.body.html) {
      return res.status(400).json({ error: "html missing in request body" });
    }

    const { html, filename } = req.body;
    const safeName = safeFilename(filename || "arayish");

    // Liberation Sans fontlarını oxu və HTML-ə əlavə et
    const fontRegular = fs.readFileSync(path.join(__dirname, 'fonts', 'LiberationSans-Regular.ttf')).toString('base64');
    const fontBold = fs.readFileSync(path.join(__dirname, 'fonts', 'LiberationSans-Bold.ttf')).toString('base64');
    const fontCSS = `<style>@font-face{font-family:'Arial';font-weight:normal;src:url('data:font/ttf;base64,${fontRegular}')format('truetype')}@font-face{font-family:'Arial';font-weight:bold;src:url('data:font/ttf;base64,${fontBold}')format('truetype')}</style>`;
    const htmlFinal = html.includes('<head>') ? html.replace('<head>', '<head>' + fontCSS) : fontCSS + html;

    const chromium = await import('@sparticuz/chromium').then(m => m.default || m);
    const puppeteer = await import('puppeteer-core').then(m => m.default || m);

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: {
  width: 1240,
  height: 1754,
  deviceScaleFactor: 2
},
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    await page.setContent(String(htmlFinal), { waitUntil: 'domcontentloaded' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0mm',
        bottom: '0mm',
        left: '0mm',
        right: '0mm'
      }
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('PDF ERROR:', error);
    if (browser) await browser.close();
    res.status(500).json({ error: error.message || "PDF generation failed" });
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
// ----------------------------
// ARAYIŞ PDF - Word şablondan
// ----------------------------
app.post('/api/arayish-pdf', async (req, res) => {
  let browser;
  try {
    const { metn, tarixMetn, bitme, yerMetn, vezife, imza, fin } = req.body;

    // Word şablonu oxu
    const PizZip = require('pizzip');
    const Docxtemplater = require('docxtemplater');
    const fs = require('fs');
    const path = require('path');

    const templatePath = path.join(__dirname, 'arayish_sablon.docx');
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    doc.render({
      METN: metn || '',
      TARIX_METN: tarixMetn || '',
      BITME: bitme || 'müddətsiz',
      YER_METN: yerMetn || '',
      VEZIFE: vezife || 'Direktor müavini',
      IMZA: imza || 'Şamil Əliyev',
    });

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    const tmpDocx = path.join('/tmp', `arayish_${fin||'tmp'}.docx`);
    const tmpPdf = path.join('/tmp', `arayish_${fin||'tmp'}.pdf`);
    fs.writeFileSync(tmpDocx, buf);

    // LibreOffice ilə PDF-ə çevir
    const { execSync } = require('child_process');
    execSync(`libreoffice --headless --convert-to pdf --outdir /tmp ${tmpDocx}`);

    const pdfBuf = fs.readFileSync(tmpPdf);
    fs.unlinkSync(tmpDocx);
    fs.unlinkSync(tmpPdf);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="arayish_${fin||'namelum'}.pdf"`);
    res.send(pdfBuf);

  } catch (error) {
    console.error('ARAYISH PDF ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

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
      userContent.push({ type: 'text', text: lastMessage.content });
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


// ----------------------------
// ARAYIŞ - Word şablondan
// ----------------------------
app.post('/api/arayish-word', async (req, res) => {
  try {
    const { metn, tarixMetn, bitme, yerMetn, fin } = req.body;
    const AdmZip = require('adm-zip');

    const templatePath = path.join(__dirname, 'arayish_sablon.docx');
    const zip = new AdmZip(templatePath);

    // XML-i oxu və placeholder-ları əvəz et
    let xml = zip.readAsText('word/document.xml');

    function escapeXml(str) {
      return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    xml = xml.replace(/\{METN\}/g, escapeXml(metn||''));
    xml = xml.replace(/\{TARIX_METN\}/g, escapeXml(tarixMetn||''));
    xml = xml.replace(/\{BITME\}/g, escapeXml(bitme||'müddətsiz'));
    xml = xml.replace(/\{YER_METN\}/g, escapeXml(yerMetn||''));

    zip.updateFile('word/document.xml', Buffer.from(xml, 'utf-8'));
    const buf = zip.toBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="arayish_${fin||'namelum'}.docx"`);
    res.send(buf);

  } catch (error) {
    console.error('ARAYISH WORD ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Rəfiq server işləyir: http://localhost:${PORT}`);
});
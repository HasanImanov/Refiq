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


// ----------------------------
// ARAYIŞ PDF - Word şablondan
// ----------------------------
app.post('/api/arayish-pdf', async (req, res) => {
  let browser;
  try {
    const { metn, tarixMetn, bitme, yerMetn, fin } = req.body;

    const fontRegular = fs.readFileSync(path.join(__dirname, 'fonts', 'LiberationSans-Regular.ttf')).toString('base64');
    const fontBold = fs.readFileSync(path.join(__dirname, 'fonts', 'LiberationSans-Bold.ttf')).toString('base64');
    const GERB = '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';

    function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    const tarixHisse = tarixMetn ? '<p class="metn indent">'+esc(tarixMetn)+'</p>' : '';
    const bitmeHisse = bitme ? '<p class="metn indent">Toyinatın bitmə tarixi: '+esc(bitme)+'.</p>' : '';

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
      + '@font-face{font-family:Arial;font-weight:normal;src:url("data:font/ttf;base64,'+fontRegular+'")format("truetype")}'
      + '@font-face{font-family:Arial;font-weight:bold;src:url("data:font/ttf;base64,'+fontBold+'")format("truetype")}'
      + '@page{size:A4;margin:0;}'
      + '*{box-sizing:border-box;margin:0;padding:0;}'
      + 'body{font-family:Arial,sans-serif;font-size:12pt;color:#000;padding:12.5mm 11.6mm 40mm 25mm;}'
      + '.header-img{width:calc(100% + 25mm + 11.6mm);margin-left:-25mm;margin-top:-12.5mm;display:block;}'
      + '.bosh{display:block;line-height:1.5;}'
      + '.arayish{text-align:center;font-size:12pt;font-weight:bold;margin:4mm 0 3mm 0;}'
      + '.metn{font-size:12pt;text-align:justify;line-height:1.3;margin-bottom:0;}'
      + '.indent{text-indent:12.5mm;}'
      + '.imza{display:flex;justify-content:space-between;font-size:12pt;font-weight:bold;margin-top:10mm;}'
      + '</style></head><body>'
      + '<img class="header-img" src="data:image/jpeg;base64,'+GERB+'"/>'
      + '<span class="bosh">&nbsp;</span>'
      + '<span class="bosh">&nbsp;</span>'
      + '<p class="arayish">ARAYIŞ</p>'
      + '<p class="metn indent">'+esc(metn||'')+'</p>'
      + tarixHisse
      + bitmeHisse
      + '<p class="metn indent">'+esc(yerMetn||'')+'</p>'
      + '<div class="imza"><span>Direktor müavini</span><span>Şamil ƌliyev</span></div>'
      + '</body></html>';

    const chromium = await import('@sparticuz/chromium').then(m => m.default || m);
    const puppeteer = await import('puppeteer-core').then(m => m.default || m);

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 2 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
    });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="arayish_'+(fin||'namelum')+'.pdf"');
    res.send(pdfBuffer);

  } catch (error) {
    console.error('ARAYISH PDF ERROR:', error);
    if (browser) await browser.close();
    res.status(500).json({ error: error.message });
  }
});


app.listen(PORT, () => {
  console.log(`Rəfiq server işləyir: http://localhost:${PORT}`);
});
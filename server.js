const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

// PDF-ləri yüklə
function loadPDFs() {
  const pdfsDir = path.join(__dirname, 'pdfs');
  const pdfs = [];
  
  if (!fs.existsSync(pdfsDir)) {
    console.log('pdfs folderi tapılmadı');
    return pdfs;
  }

  const files = fs.readdirSync(pdfsDir).filter(f => f.endsWith('.pdf'));
  
  for (const file of files) {
    const filePath = path.join(pdfsDir, file);
    const data = fs.readFileSync(filePath);
    const base64 = data.toString('base64');
    pdfs.push({ name: file, base64 });
    console.log(`PDF yükləndi: ${file}`);
  }
  
  return pdfs;
}

const pdfFiles = loadPDFs();

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    const systemPrompt = `Sən "Rəfiq" adlı sosial xidmətlər üzrə ixtisaslaşmış AI assistantsan.
Sənə verilən PDF sənədlər (reqlamentlər və qanunlar) əsasında cavab verirsən.

CAVAB FORMATI:
1. Əvvəlcə reqlamentdən cavabı yaz: "**Reqlamentə əsasən:** ..."
2. Sonra qanuni əsası göstər: "**Qanunun X maddəsinin Y bəndinə əsasən:** burda belə deyilir..."
3. Sənədlərdə məlumat yoxdursa, bunu açıq bildir: "Bu barədə mövcud sənədlərdə məlumat yoxdur."

QADAĞA: Sənədlərdən kənar məlumat vermə. Yalnız verilən PDF-lərə əsaslan.
Azərbaycan dilində cavab ver.`;

    // Son mesajı götür və PDF-ləri əlavə et
    const lastMessage = messages[messages.length - 1];
    const userContent = [];

    // PDF-ləri əlavə et
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

    // İstifadəçinin sualını əlavə et
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Rəfiq server işləyir: http://localhost:${PORT}`);
});
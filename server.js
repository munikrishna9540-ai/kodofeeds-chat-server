// server.js — Express proxy to OpenAI Responses API + built-in /test page
// Node 18+ (global fetch available)

import express from 'express';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors()); // keep simple for now

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Health
app.get('/', (_req, res) => res.send('Kodofeeds chat server OK'));

// Built-in test page (same origin, no CORS issues)
app.get('/test', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html>
<head><meta charset="utf-8"><title>Kodofeeds Chat Test</title></head>
<body>
  <h3>Kodofeeds Chat (Render backend)</h3>
  <input id="msg" placeholder="Type a question" style="width:60%">
  <button id="send">Send</button>
  <pre id="out" style="white-space:pre-wrap;"></pre>
  <script>
    const ENDPOINT = '/chat'; // same host
    document.getElementById('send').onclick = async () => {
      const msg = document.getElementById('msg').value.trim();
      if (!msg) return;
      document.getElementById('out').textContent = '…asking the assistant…';
      try {
        const r = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
        const j = await r.json();
        document.getElementById('out').textContent =
          j.assistant_message || JSON.stringify(j, null, 2);
      } catch (e) {
        document.getElementById('out').textContent =
          'Request failed. Open the Console for details.';
        console.error(e);
      }
    };
  </script>
</body>
</html>`);
});

// Chat proxy
app.post('/chat', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY env var' });
    }

    const { message, previous_response_id } = req.body || {};
    if (!message || message.length > 4000) {
      return res.status(400).json({ error: 'Empty or too long message' });
    }

    const instructions = `
You are the Kodofeeds website assistant.
- Be concise, friendly, action-focused.
- Give numbered steps for how-tos; minimal code when helpful.
- Never reveal API keys or internal tokens.
`.trim();

    const payload = {
      model: MODEL,
      instructions,
      input: message,
      temperature: 0.7,
      ...(previous_response_id ? { previous_response_id } : {})
    };

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const json = await r.json();
    if (!r.ok) return res.status(r.status).json(json);

    let text = '';
    if (Array.isArray(json.output)) {
      for (const out of json.output) {
        if (Array.isArray(out.content)) {
          for (const part of out.content) {
            if (part.type === 'output_text' && part.text) text += part.text;
          }
        }
      }
    }

    return res.json({
      ok: true,
      response_id: json.id,
      assistant_message: text || '[No text]'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Kodofeeds chat server on :' + port));

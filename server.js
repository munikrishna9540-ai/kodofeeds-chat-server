// server.js — minimal Express proxy to OpenAI Responses API
// Node 18+ (global fetch available)

import express from 'express';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors()); // we'll lock this down later

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

app.get('/', (_req, res) => res.send('Kodofeeds chat server OK'));

app.post('/chat', async (req, res) => {
  try {
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
      body: JSON.stringify(payload),
    });

    const json = await r.json();
    if (!r.ok) return res.status(r.status).json(json);

    let text = '';
    if (Array.isArray(json.output)) {
      for (const out of json.output) {
        if (!Array.isArray(out.content)) continue;
        for (const part of out.content) {
          if (part.type === 'output_text' && part.text) text += part.text;
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

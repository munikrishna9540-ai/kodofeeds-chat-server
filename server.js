// server.js — Express proxy to OpenAI Responses API + /test + /widget.js + /widget-demo
// Requires: Node 18+ (global fetch) and package.json { "type": "module" }

import express from 'express';
import cors from 'cors';

// ---------- Plain-text filter (removes emojis/markdown/html) ----------
function toPlainText(s = '') {
  return String(s)
    .replace(/```[\s\S]*?```/g, '')                    // fenced code
    .replace(/`([^`]+)`/g, '$1')                       // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')              // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')           // links -> text
    .replace(/(\*\*|__)(.*?)\1/g, '$2')                // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')                   // italics
    .replace(/^#{1,6}\s*/gm, '')                       // headings
    .replace(/^\s*[-*•●]\s+/gm, '- ')                  // bullets normalize
    .replace(/\p{Extended_Pictographic}/gu, '')        // emojis/symbols
    .replace(/<[^>]+>/g, '')                           // HTML tags
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")       // smart quotes
    .replace(/[^\S\r\n]+/g, ' ')                       // collapse spaces
    .replace(/\n{3,}/g, '\n\n')                        // collapse blank lines
    .trim();
}

// ---------- App ----------
const app = express();
app.use(express.json());
app.use(cors()); // permissive so the widget can be embedded anywhere

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Health
app.get('/', (_req, res) => res.send('Kodofeeds chat server OK'));

// Simple same-origin test page
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
    const ENDPOINT = '/chat';
    document.getElementById('send').onclick = async () => {
      const msg = document.getElementById('msg').value.trim();
      if (!msg) return;
      document.getElementById('out').textContent = '...asking the assistant...';
      try {
        const r = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
        const j = await r.json();
        document.getElementById('out').textContent = j.assistant_message || JSON.stringify(j, null, 2);
      } catch (e) {
        document.getElementById('out').textContent = 'Request failed. Open Console for details.';
        console.error(e);
      }
    };
  </script>
</body>
</html>`);
});

// Embeddable widget script
app.get('/widget.js', (_req, res) => {
  res.type('application/javascript').send(`(function(){
    var endpoint = (function(){ try { return new URL('./chat', document.currentScript.src).href; } catch(e){ return '/chat'; } })();

    var css = ''
      + '.kf-chat-bubble{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;'
      + 'background:#111;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;'
      + 'box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:9999;font:600 18px system-ui}'
      + '.kf-chat-panel{position:fixed;right:20px;bottom:90px;width:min(380px,calc(100vw - 40px));height:520px;'
      + 'background:#fff;border:1px solid #e5e7eb;border-radius:16px;display:none;flex-direction:column;'
      + 'box-shadow:0 12px 28px rgba(0,0,0,.18);overflow:hidden;z-index:9999}'
      + '.kf-chat-header{padding:12px 14px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:8px}'
      + '.kf-dot{width:8px;height:8px;border-radius:50%;background:#10b981}'
      + '.kf-title{font:600 14px system-ui}'
      + '.kf-body{flex:1;overflow:auto;padding:14px;background:#fafafa}'
      + '.kf-msg{max-width:85%;padding:10px 12px;border-radius:12px;margin:8px 0;white-space:pre-wrap;word-wrap:break-word}'
      + '.kf-user{margin-left:auto;background:#111;color:#fff;border-bottom-right-radius:4px}'
      + '.kf-ai{margin-right:auto;background:#f3f4f6;border-bottom-left-radius:4px}'
      + '.kf-typing{font:500 12px system-ui;color:#6b7280;margin:4px 2px}'
      + '.kf-input{display:flex;gap:8px;border-top:1px solid #eee;padding:10px;background:#fff}'
      + '.kf-input input{flex:1;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font:14px system-ui}'
      + '.kf-input button{padding:10px 14px;border-radius:10px;border:0;background:#111;color:#fff;font:600 14px system-ui;cursor:pointer}';

    var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

    var bubble = document.createElement('div'); bubble.className='kf-chat-bubble'; bubble.textContent='✳';
    var panel  = document.createElement('div'); panel.className='kf-chat-panel';
    panel.innerHTML = ''
      + '<div class="kf-chat-header"><span class="kf-dot"></span><div class="kf-title">Kodofeeds Assistant</div></div>'
      + '<div class="kf-body" id="kf-body"></div>'
      + '<div class="kf-input"><input id="kf-input" placeholder="Ask anything..." />'
      + '<button id="kf-send">Send</button></div>';
    document.body.appendChild(bubble); document.body.appendChild(panel);

    var body=document.getElementById('kf-body');
    var input=document.getElementById('kf-input');
    var send=document.getElementById('kf-send');
    var open=false, previousResponseId=localStorage.getItem('kf_prev_id')||null;

    function pushMsg(text,who){
      var m=document.createElement('div');
      m.className='kf-msg '+(who==='user'?'kf-user':'kf-ai');
      m.textContent=text; body.appendChild(m); body.scrollTop=body.scrollHeight;
    }
    function setTyping(on){
      var el=document.querySelector('.kf-typing');
      if(on){ if(!el){ el=document.createElement('div'); el.className='kf-typing'; el.textContent='Assistant is typing…';
        panel.insertBefore(el, panel.querySelector('.kf-input')); } }
      else if(el){ el.remove(); }
    }
    async function talk(){
      var text=input.value.trim(); if(!text) return;
      input.value=''; pushMsg(text,'user'); setTyping(true);
      try{
        var payload={ message:text }; if(previousResponseId) payload.previous_response_id=previousResponseId;
        var r=await fetch(endpoint,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        var j=await r.json();
        if(!j.ok) throw new Error(j.error||'Request failed');
        pushMsg(j.assistant_message||'[No text]','ai');
        if(j.response_id){ previousResponseId=j.response_id; localStorage.setItem('kf_prev_id',previousResponseId); }
      }catch(e){ pushMsg('Sorry, something went wrong. Please try again.','ai'); console.error(e); }
      finally{ setTyping(false); }
    }
    bubble.addEventListener('click',function(){ open=!open; panel.style.display=open?'flex':'none'; if(open) input.focus(); });
    send.addEventListener('click',talk);
    input.addEventListener('keydown',function(e){ if(e.key==='Enter') talk(); });
  })();`);
});

// Styled demo page that embeds the widget
app.get('/widget-demo', (_req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Kodofeeds — Widget Demo</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
         background:linear-gradient(180deg,#f8fafc,#eef2ff);color:#0f172a;min-height:100vh}
    header{padding:16px 24px;border-bottom:1px solid #e5e7eb}
    .brand{font-weight:800}
    .wrap{max-width:1000px;margin:0 auto;padding:32px 20px 80px}
    .hero{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:28px 24px;box-shadow:0 8px 24px rgba(15,23,42,.06)}
    .hero h1{margin:0 0 8px;font-size:28px}
    .hero p{margin:0;color:#475569}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:22px}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:16px;min-height:110px;box-shadow:0 6px 18px rgba(15,23,42,.05)}
    .card h3{margin:0 0 6px;font-size:16px}
    .card p{margin:0;color:#475569;font-size:14px;line-height:1.4}
    .spacer{height:120px}
  </style>
</head>
<body>
  <header><div class="brand">Kodofeeds</div></header>
  <div class="wrap">
    <section class="hero">
      <h1>Kodofeeds Assistant (Live Demo)</h1>
      <p>Click the black bubble at the bottom-right and ask anything in English, Kannada, or Telugu.</p>
    </section>

    <div class="grid">
      <div class="card"><h3>What this shows</h3><p>Embedded chat widget talking to our Render backend. Replies are plain text only.</p></div>
      <div class="card"><h3>Security</h3><p>Your OpenAI key stays on the server. The browser calls our /chat endpoint.</p></div>
      <div class="card"><h3>Use on any site</h3><p>Add one line: &lt;script src="https://kodofeeds-chat-server.onrender.com/widget.js" defer&gt;&lt;/script&gt;</p></div>
    </div>

    <div class="spacer"></div>
  </div>

  <script src="/widget.js" defer></script>
</body>
</html>`);
});

// Chat proxy
app.post('/chat', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'Missing OPENAI_API_KEY env var' });

    const { message, previous_response_id } = req.body || {};
    if (!message || message.length > 4000) {
      return res.status(400).json({ error: 'Empty or too long message' });
    }

    const instructions = `
You are the Kodofeeds website assistant.

LANGUAGE:
- Detect the user's language automatically.
- If the user writes in Kannada, reply in Kannada.
- If the user writes in Telugu, reply in Telugu.
- If mixed or unclear, default to English.

STYLE:
- PLAIN TEXT ONLY: no emojis, no decorative symbols, no Markdown/bold/italics.
- Use short sentences and simple numbered or dashed lists.
- Be concise, friendly, and action-focused.

SAFETY:
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

    // Collect text parts
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

    // Enforce plain text
    text = toPlainText(text);

    return res.json({ ok: true, response_id: json.id, assistant_message: text || '[No text]' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Kodofeeds chat server on :' + port));

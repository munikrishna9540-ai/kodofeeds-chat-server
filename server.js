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

const port = process.env.PORT || 3000; // Lightweight chat widget served from this server
app.get('/widget.js', (_req, res) => {
  res.type('application/javascript').send(`(function(){
    // Always point to this server's /chat, no matter where the script is embedded
    var endpoint = (function(){
      try { return new URL('./chat', document.currentScript.src).href; }
      catch(e){ return 'https://kodofeeds-chat-server.onrender.com/chat'; }
    })();

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

app.listen(port, () => console.log('Kodofeeds chat server on :' + port));

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function intParam(value, min, max, fallback = null) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function cleanRef(value) {
  return typeof value === 'string'
    ? value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
    : '';
}

function cleanAgents(value) {
  const allowed = new Set(['codex','claude','cursor']);
  return String(value || '')
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(x => allowed.has(x))
    .slice(0, 3);
}

const LABELS = { codex: 'Codex', claude: 'Claude Code', cursor: 'Cursor' };

export default function handler(req, res) {
  const ref = cleanRef(req.query.ref);
  const score = req.query.score === 'na' ? null : intParam(req.query.score, 0, 100, null);
  const total = intParam(req.query.total, 0, 999, 0);
  const portable = intParam(req.query.portable, 0, total || 999, 0);
  const drift = intParam(req.query.drift, 0, 999, 0);
  const agents = cleanAgents(req.query.agents);
  const agentLabel = agents.length ? agents.map(a => LABELS[a]).join(' ↔ ') : 'Agent setup';
  const origin = `https://${req.headers.host}`;
  const canonical = new URL(req.url, origin).toString();
  const checkUrl = `${origin}/?ref=${encodeURIComponent(ref)}`;
  const title = score === null
    ? `${total} AI skills in my setup`
    : `My AI setup is ${score}% portable`;
  const description = score === null
    ? `${total} global skills scanned across ${agentLabel}. No cross-agent score yet.`
    : `${portable} of ${total} global skills are portable across ${agentLabel}.`;

  const og = new URL('/api/og', origin);
  og.searchParams.set('score', score === null ? 'na' : String(score));
  og.searchParams.set('total', String(total));
  og.searchParams.set('portable', String(portable));
  og.searchParams.set('drift', String(drift));
  og.searchParams.set('agents', agents.join(','));

  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical)}`;
  const xText = score === null
    ? `I checked my AI setup: ${total} global skills across ${agentLabel}. Curious how portable yours is?`
    : `My AI setup is ${score}% portable across ${agentLabel}. ${portable}/${total} skills travel cleanly. Curious what yours looks like?`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}&url=${encodeURIComponent(canonical)}`;
  const postText = score === null
    ? `I checked my AI setup. I have ${total} global skills in ${agentLabel}, but I only use one agent right now so there isn't a cross-agent score yet.\n\nCurious what yours looks like: ${canonical}`
    : `My AI setup is ${score}% portable across ${agentLabel}.\n\n${portable}/${total} skills travel cleanly and ${drift} have drifted copies.\n\nCheck yours: ${canonical}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)} · Agent Portability Check</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(og.toString())}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(og.toString())}">
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0b0d10;color:#f7f8fa}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:28px}
    .wrap{width:min(860px,100%)}
    .card{background:#12161b;border:1px solid #2a313a;border-radius:28px;padding:42px;box-shadow:0 30px 90px rgba(0,0,0,.35)}
    .eyebrow{font-family:ui-monospace,monospace;color:#94a0ad;letter-spacing:.08em}
    h1{font-size:clamp(36px,6vw,64px);line-height:1;margin:18px 0}
    .score{font-size:clamp(72px,14vw,140px);font-weight:850;letter-spacing:-.06em;margin:26px 0 4px}
    .muted{color:#94a0ad}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:28px 0}
    .pill{border:1px solid #303945;border-radius:999px;padding:10px 14px}
    .actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}
    a,button{appearance:none;border:0;border-radius:12px;padding:13px 17px;font-weight:700;text-decoration:none;cursor:pointer}
    .primary{background:#fff;color:#0b0d10}.secondary{background:#1c232b;color:#fff;border:1px solid #303945}
    .cta{margin-top:24px;padding-top:24px;border-top:1px solid #2a313a}
    .copybox{margin-top:26px;background:#0d1116;border:1px solid #2a313a;border-radius:16px;padding:18px;white-space:pre-wrap;line-height:1.45;color:#d9e0e7}
    code{font-family:ui-monospace,monospace}
  </style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="eyebrow">AGENT PORTABILITY CHECK</div>
    <h1>How portable is my AI setup?</h1>
    <div class="score">${score === null ? total : esc(score) + '%'}</div>
    <div class="muted">${score === null ? 'global skills found · ' : ''}${esc(agentLabel)}</div>
    <div class="stats">
      <span class="pill">${portable} / ${total} portable</span>
      <span class="pill">${drift} drifted</span>
    </div>
    <p>${esc(description)}</p>

    <div class="copybox" id="posttext">${esc(postText)}</div>

    <div class="actions">
      <button id="copyPost" class="primary">Copy post text</button>
      <a id="linkedin" class="secondary" href="${esc(linkedin)}" target="_blank" rel="noopener">Open LinkedIn</a>
      <a id="xshare" class="secondary" href="${esc(xUrl)}" target="_blank" rel="noopener">Share on X</a>
      <button id="copy" class="secondary">Copy link</button>
    </div>

    <div class="cta">
      <h2>What does yours look like?</h2>
      <p class="muted">One local command. No skill contents are uploaded.</p>
      <a id="check" class="primary" href="${esc(checkUrl)}">Check yours →</a>
    </div>
  </div>
</div>
<script>
const referralId = ${JSON.stringify(ref)};
const postText = ${JSON.stringify(postText)};
const anon = localStorage.getItem('apc_web_id') || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
localStorage.setItem('apc_web_id', anon);

async function track(event, extra={}) {
  try {
    await fetch('/api/telemetry', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        event,
        distinct_id:'web_' + anon,
        properties:{ referral_id: referralId, ...extra }
      })
    });
  } catch {}
}

track('apc_referral_page_opened');
document.getElementById('linkedin').addEventListener('click',()=>track('apc_linkedin_share_clicked',{share_surface:'linkedin'}));
document.getElementById('xshare').addEventListener('click',()=>track('apc_x_share_clicked',{share_surface:'x'}));
document.getElementById('check').addEventListener('click',()=>track('apc_check_yours_clicked'));

document.getElementById('copyPost').addEventListener('click',async()=>{
  await navigator.clipboard.writeText(postText);
  document.getElementById('copyPost').textContent='Post text copied';
  track('apc_copy_link_clicked',{share_surface:'post_text'});
});

document.getElementById('copy').addEventListener('click',async()=>{
  await navigator.clipboard.writeText(location.href);
  document.getElementById('copy').textContent='Copied';
  track('apc_copy_link_clicked',{share_surface:'copy'});
});
</script>
</body>
</html>`);
}

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
  const shared = intParam(req.query.shared, 0, total || 999, portable);
  const drift = intParam(req.query.drift, 0, 999, 0);
  const agents = cleanAgents(req.query.agents);
  const singleAgent = score === null;
  const agentLabel = agents.length ? agents.map(a => LABELS[a]).join(' ↔ ') : 'Agent setup';
  const origin = `https://${req.headers.host}`;
  const canonical = new URL(req.url, origin).toString();
  const checkUrl = `${origin}/?ref=${encodeURIComponent(ref)}`;

  const title = singleAgent
    ? `${shared}/${total} AI skills in shared format`
    : `My AI setup is ${score}% portable`;

  const description = singleAgent
    ? `${total} global skills found in ${agentLabel}. ${shared} are currently in a shared cross-agent location.`
    : `${portable} of ${total} global skills are portable across ${agentLabel}.`;

  const og = new URL('/api/og', origin);
  og.searchParams.set('v', '3');
  og.searchParams.set('score', singleAgent ? 'na' : String(score));
  og.searchParams.set('total', String(total));
  og.searchParams.set('portable', String(portable));
  og.searchParams.set('shared', String(shared));
  og.searchParams.set('drift', String(drift));
  og.searchParams.set('agents', agents.join(','));

  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical)}`;
  const xText = singleAgent
    ? `I found ${total} AI skills in my ${agentLabel} setup. ${shared}/${total} are in a shared cross-agent format. Check yours:`
    : `My AI setup is ${score}% portable across ${agentLabel}. ${portable}/${total} skills travel cleanly. Check yours:`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}&url=${encodeURIComponent(canonical)}`;

  const postText = singleAgent
    ? `I found ${total} AI skills in my ${agentLabel} setup.\n\n${shared}/${total} are currently in a shared cross-agent format.\n\nCheck yours: ${canonical}`
    : `My AI setup is ${score}% portable across ${agentLabel}.\n\n${portable}/${total} skills travel cleanly and ${drift} have drifted copies.\n\nCheck yours: ${canonical}`;

  const hero = singleAgent ? `${shared} / ${total}` : `${score}%`;
  const heroLabel = singleAgent ? 'skills in shared format' : 'portable across my agents';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
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
    :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#090c0f;color:#f7f8fa}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:32px}
    .wrap{width:min(820px,100%)}
    .card{background:#12161b;border:1px solid #2a313a;border-radius:30px;padding:44px;box-shadow:0 32px 100px rgba(0,0,0,.38)}
    .eyebrow{font-family:ui-monospace,monospace;color:#94a0ad;letter-spacing:.09em;font-size:14px}
    h1{font-size:clamp(34px,5vw,52px);line-height:1.02;letter-spacing:-.04em;margin:16px 0 34px}
    .hero{font-size:clamp(74px,13vw,118px);line-height:.9;font-weight:900;letter-spacing:-.065em}
    .hero-label{font-size:22px;color:#a8b2bd;margin-top:14px}
    .context{font-size:18px;color:#d6dde5;margin-top:26px}
    .stats{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0 8px}
    .pill{border:1px solid #303945;border-radius:999px;padding:9px 13px;color:#c8d0d9;font-size:14px}
    .insight{margin-top:24px;padding:18px 20px;border-radius:16px;background:#0d1116;border:1px solid #252d36;line-height:1.55}
    .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}
    a,button{appearance:none;border:0;border-radius:12px;padding:13px 16px;font-weight:750;text-decoration:none;cursor:pointer;font-size:14px}
    .primary{background:#fff;color:#0b0d10}.secondary{background:#1c232b;color:#fff;border:1px solid #303945}
    .copybox{margin-top:22px;background:#0d1116;border:1px dashed #303945;border-radius:14px;padding:16px;white-space:pre-wrap;line-height:1.5;color:#cbd4dd;font-size:14px}
    .cta{margin-top:30px;padding-top:26px;border-top:1px solid #2a313a;display:flex;justify-content:space-between;gap:18px;align-items:end}
    .cta h2{margin:0 0 8px;font-size:23px}.muted{color:#94a0ad;margin:0}
    @media(max-width:680px){.card{padding:28px}.cta{align-items:flex-start;flex-direction:column}}
  </style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="eyebrow">AGENT PORTABILITY CHECK</div>
    <h1>How portable is my AI setup?</h1>

    <div class="hero">${esc(hero)}</div>
    <div class="hero-label">${esc(heroLabel)}</div>
    <div class="context">${esc(agentLabel)} setup · ${total} global skills</div>

    <div class="stats">
      <span class="pill">${shared} shared-format</span>
      <span class="pill">${drift} drifted</span>
      ${singleAgent ? '<span class="pill">1 agent detected</span>' : `<span class="pill">${portable} / ${total} cross-agent</span>`}
    </div>

    <div class="insight">${esc(description)}</div>

    <div class="copybox" id="posttext">${esc(postText)}</div>

    <div class="actions">
      <button id="copyPost" class="primary">Copy post text</button>
      <a id="linkedin" class="secondary" href="${esc(linkedin)}" target="_blank" rel="noopener">Open LinkedIn</a>
      <a id="xshare" class="secondary" href="${esc(xUrl)}" target="_blank" rel="noopener">Share on X</a>
      <button id="copy" class="secondary">Copy link</button>
    </div>

    <div class="cta">
      <div>
        <h2>What does yours look like?</h2>
        <p class="muted">One local command. Skill contents stay on your machine.</p>
      </div>
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

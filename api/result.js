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

function cleanTeam(value) {
  return typeof value === 'string'\n    ? value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)\n    : '';\n}\n\nfunction cleanTarget(value) {\n  return ['claude', 'codex', 'cursor'].includes(value) ? value : '';
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
  const ref = cleanRef(req.query.ref);\n  const teamCode = cleanTeam(req.query.team);\n  const score = req.query.score === 'na' ? null : intParam(req.query.score, 0, 100, null);
  const total = intParam(req.query.total, 0, 999, 0);
  const portable = intParam(req.query.portable, 0, total || 999, 0);
  const ready = intParam(req.query.ready ?? req.query.shared, 0, total || 999, portable);
  const drift = intParam(req.query.drift, 0, 999, 0);
  const agents = cleanAgents(req.query.agents);
  const target = cleanTarget(req.query.target);
  const targetLabel = target ? LABELS[target] : '';
  const targetTotal = target ? intParam(req.query.targetTotal, 0, 999, total) : 0;
  const targetReady = target ? intParam(req.query.targetReady, 0, targetTotal || 999, 0) : 0;
  const targetAuto = target ? intParam(req.query.targetAuto, 0, 999, 0) : 0;
  const targetManual = target ? intParam(req.query.targetManual, 0, 999, 0) : 0;
  const targetContext = target ? intParam(req.query.targetContext, 0, 999, 0) : 0;
  const targetDeps = target ? intParam(req.query.targetDeps, 0, 999, 0) : 0;
  const runtime = req.query.runtime === 'cloud' ? 'cloud' : 'local';

  const singleAgent = score === null;
  const readiness = total > 0 ? Math.round(100 * ready / total) : null;
  const portableReady = total > 0 && readiness === 100 && drift === 0;
  const targetComplete = Boolean(
    target &&
    targetTotal > 0 &&
    targetReady === targetTotal &&
    targetAuto === 0 &&
    targetManual === 0 &&
    targetContext === 0 &&
    targetDeps === 0 &&
    req.query.targetComplete === '1'
  );
  const shareAchievement = targetComplete || portableReady;

  const agentLabel = agents.length ? agents.map(a => LABELS[a]).join(' ↔ ') : 'Agent setup';
  const origin = `https://${req.headers.host}`;
  const canonical = new URL(req.url, origin).toString();

  const checkParams = new URLSearchParams();
  if (ref) checkParams.set('ref', ref);
  if (target) checkParams.set('target', target);
  if (runtime === 'cloud') checkParams.set('runtime', 'cloud');\n  if (teamCode) checkParams.set('team', teamCode);\n  const checkUrl = `${origin}/?${checkParams.toString()}`;

  const fixCommand = [
    'npx github:Sakshambhutani/agent-portability-check',
    target ? `--target ${target}` : '',
    runtime === 'cloud' ? '--runtime cloud' : '',
    '--fix',
    ref ? `--ref ${ref}` : '',\n    teamCode ? `--team ${teamCode}` : '',\n  ].filter(Boolean).join(' ');

  const title = targetComplete
    ? `My AI setup is ready for ${targetLabel}`
    : portableReady
      ? 'My AI setup is 100% portable-ready'
      : target
        ? `${targetReady}/${targetTotal} skills ready for ${targetLabel}`
        : `${ready}/${total} AI skills portable-ready`;

  const description = targetComplete
    ? `All ${targetTotal} skills are discoverable and structurally ready for ${targetLabel}.`
    : portableReady
      ? `${ready}/${total} global skills are in shared format with no drift.`
      : target
        ? `${targetAuto} auto-fix, ${targetManual} manual, ${targetDeps} dependency blockers, and ${targetContext} context gaps before moving to ${targetLabel}${runtime === 'cloud' ? ' Cloud' : ''}.`
        : `${total} global skills found in ${agentLabel}. ${ready} are currently portable-ready.`;

  const og = new URL('/api/og', origin);
  og.searchParams.set('v', '6');
  og.searchParams.set('score', score === null ? 'na' : String(score));
  og.searchParams.set('total', String(total));
  og.searchParams.set('portable', String(portable));
  og.searchParams.set('ready', String(ready));
  og.searchParams.set('drift', String(drift));
  og.searchParams.set('agents', agents.join(','));
  if (target) {
    og.searchParams.set('target', target);
    og.searchParams.set('targetReady', String(targetReady));
    og.searchParams.set('targetTotal', String(targetTotal));
    og.searchParams.set('targetAuto', String(targetAuto));
    og.searchParams.set('targetManual', String(targetManual));
    og.searchParams.set('targetContext', String(targetContext));
    og.searchParams.set('targetDeps', String(targetDeps));
    og.searchParams.set('runtime', runtime);
    og.searchParams.set('targetComplete', targetComplete ? '1' : '0');
  }

  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical)}`;

  const shareSentence = targetComplete
    ? `I got all ${targetTotal} of my AI skills, dependencies, and context ready for ${targetLabel}${runtime === 'cloud' ? ' Cloud' : ''}.`
    : `I made my AI setup 100% portable-ready. ${ready}/${total} skills are now in shared format.`;

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareSentence + ' Check yours:')}&url=${encodeURIComponent(canonical)}`;
  const postText = `${shareSentence}\n\nCheck yours: ${canonical}`;

  const hero = target
    ? `${targetReady} / ${targetTotal}`
    : portableReady
      ? '100%'
      : `${ready} / ${total}`;

  const heroLabel = target
    ? `ready for ${targetLabel}`
    : portableReady
      ? 'PORTABLE-READY'
      : 'skills portable-ready';

  const badge = new URL('/api/badge', origin);
  if (target) badge.searchParams.set('target', target);
  badge.searchParams.set('ready', String(target ? targetReady : ready));
  badge.searchParams.set('total', String(target ? targetTotal : total));
  const badgeMarkdown = `[![Agent Portability](${badge.toString()})](${canonical})`;

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
    .cta h2{margin:0 0 8px;font-size:23px}.muted{color:#94a0ad;margin:0}\n    .identity{margin-top:26px;padding:22px;border:1px solid #2a313a;border-radius:18px;background:#0d1116}\n    .identity input{width:100%;background:#090c0f;color:#fff;border:1px solid #303945;border-radius:11px;padding:12px 13px;margin-top:10px}\n    .identity .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.hidden{display:none!important}\n    .identity-status{color:#9aa6b2;margin-top:12px;min-height:22px}\n    @media(max-width:680px){.card{padding:28px}.cta{align-items:flex-start;flex-direction:column}}
  </style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="eyebrow">${target ? 'MIGRATION CHECK' : 'AGENT PORTABILITY CHECK'}</div>
    <h1>${target ? `Ready for ${esc(targetLabel)}?` : 'How portable is my AI setup?'}</h1>

    <div class="hero">${esc(hero)}</div>
    <div class="hero-label">${esc(heroLabel)}</div>
    <div class="context">${esc(agentLabel)} setup · ${total} global skills</div>

    <div class="stats">
      ${target ? `
        <span class="pill">${targetAuto} auto-fix</span>
        <span class="pill">${targetManual} manual</span>
        <span class="pill">${targetDeps} dependency blockers</span>
        <span class="pill">${targetContext} context gaps</span>
      ` : `
        <span class="pill">${ready} portable-ready</span>
        <span class="pill">${drift} drifted</span>
      `}
    </div>

    <div class="insight">${esc(description)}</div>

    ${shareAchievement ? `
      <div class="copybox" id="posttext">${esc(postText)}</div>
      <div class="actions">
        <button id="copyPost" class="primary">Copy post text</button>
        <a id="linkedin" class="secondary" href="${esc(linkedin)}" target="_blank" rel="noopener">Open LinkedIn</a>
        <a id="xshare" class="secondary" href="${esc(xUrl)}" target="_blank" rel="noopener">Share on X</a>
        <button id="copyBadge" class="secondary">Copy README badge</button>
        <button id="copy" class="secondary">Copy link</button>
      </div>
      <div class="cta">
        <div>
          <h2>Challenge a teammate</h2>
          <p class="muted">Their scan keeps skill contents on their machine.</p>
        </div>
        <a id="check" class="primary" href="${esc(checkUrl)}">Check yours →</a>
      </div>
    ` : `
      <div class="insight">
        <strong>This is the before state.</strong><br>
        The CLI can safely fix location/discovery issues. Conflicts and missing files stay manual.
      </div>
      <div class="copybox" id="fixcommand">${esc(fixCommand)}</div>
      <div class="actions">
        <button id="copyFix" class="primary">Copy fix command</button>
        <button id="copy" class="secondary">Copy result link</button>
      </div>
      <p class="muted" id="fixhint" style="margin-top:12px">Paste the copied command into Terminal. The CLI previews changes before applying them.</p>
    `}
  </div>
</div>
<script>
const referralId = ${JSON.stringify(ref)};
const postText = ${JSON.stringify(postText)};
const fixCommand = ${JSON.stringify(fixCommand)};
const badgeMarkdown = ${JSON.stringify(badgeMarkdown)};
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

const linkedinEl = document.getElementById('linkedin');
const xEl = document.getElementById('xshare');
const checkEl = document.getElementById('check');
const copyFixEl = document.getElementById('copyFix');
const copyPostEl = document.getElementById('copyPost');
const copyBadgeEl = document.getElementById('copyBadge');
const copyEl = document.getElementById('copy');

if (linkedinEl) linkedinEl.addEventListener('click',()=>track('apc_linkedin_share_clicked',{share_surface:'linkedin'}));
if (xEl) xEl.addEventListener('click',()=>track('apc_x_share_clicked',{share_surface:'x'}));
if (checkEl) checkEl.addEventListener('click',()=>track('apc_check_yours_clicked'));

if (copyFixEl) copyFixEl.addEventListener('click',async()=>{
  await navigator.clipboard.writeText(fixCommand);
  copyFixEl.textContent='Copied — paste in Terminal';
  const hint = document.getElementById('fixhint');
  if (hint) hint.textContent='Now paste into Terminal and press Enter. The CLI will preview safe changes before applying them.';
  track('apc_fix_command_copied');
});

if (copyPostEl) copyPostEl.addEventListener('click',async()=>{
  await navigator.clipboard.writeText(postText);
  copyPostEl.textContent='Post text copied';
  track('apc_copy_link_clicked',{share_surface:'post_text'});
});

if (copyBadgeEl) copyBadgeEl.addEventListener('click',async()=>{
  await navigator.clipboard.writeText(badgeMarkdown);
  copyBadgeEl.textContent='Badge copied';
  track('apc_badge_copied',{share_surface:'readme_badge'});
});

if (copyEl) copyEl.addEventListener('click',async()=>{
  await navigator.clipboard.writeText(location.href);
  copyEl.textContent='Copied';
  track('apc_copy_link_clicked',{share_surface:'copy'});
});
</script>
</body>
</html>`);
}

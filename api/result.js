import { supabaseRpc } from '../lib/supabase.js';
import { HARNESS_ORDER, harnessDefinition, targetLabels } from '../src/harnesses.js';

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
  return typeof value === 'string'
    ? value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
    : '';
}

function cleanTarget(value) {
  return HARNESS_ORDER.includes(value) ? value : '';
}

function cleanAgents(value) {
  const allowed = new Set(HARNESS_ORDER);
  return String(value || '')
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(x => allowed.has(x))
    .slice(0, HARNESS_ORDER.length);
}

function publicResultInt(value, min, max, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function publicResultAgents(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => String(v).toLowerCase()))]
    .filter(v => HARNESS_ORDER.includes(v))
    .slice(0, HARNESS_ORDER.length);
}

function cleanAllRows(value) {
  const allowed = new Set([
    ...HARNESS_ORDER,
    ...HARNESS_ORDER.filter(key => harnessDefinition(key)?.cloud).map(key => key + '-cloud'),
  ]);
  return String(value || '')
    .split(',')
    .slice(0, 12)
    .map(item => {
      const [id, ready, total, autoFix, manual, context, deps, complete] = item.split(':');
      if (!allowed.has(id)) return null;
      const base = id.endsWith('-cloud') ? id.slice(0, -6) : id;
      const isCloud = id.endsWith('-cloud');
      const meta = harnessDefinition(base);
      const totalValue = intParam(total, 0, 999, 0);
      return {
        id,
        label: isCloud ? (meta?.cloudLabel || (meta?.label + ' Cloud')) : meta?.label,
        ready: intParam(ready, 0, totalValue || 999, 0),
        total: totalValue,
        autoFix: intParam(autoFix, 0, 999, 0),
        manual: intParam(manual, 0, 999, 0),
        context: intParam(context, 0, 999, 0),
        deps: intParam(deps, 0, 999, 0),
        complete: complete === '1',
      };
    })
    .filter(Boolean);
}

async function createPublicResult(req, res) {
  let raw = '';
  try { raw = JSON.stringify(req.body || {}); } catch {
    return res.status(400).json({ error: 'invalid_body' });
  }
  if (Buffer.byteLength(raw) > 4096) {
    return res.status(413).json({ error: 'payload_too_large' });
  }

  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const total = publicResultInt(input.total, 0, 999, 0);
  const target = cleanTarget(input.target) || null;
  const targetTotal = target ? publicResultInt(input.targetTotal, 0, 999, total) : 0;

  try {
    const code = await supabaseRpc('apc_create_public_result', {
      p_score: input.score === null || input.score === undefined
        ? null
        : publicResultInt(input.score, 0, 100, null),
      p_total: total,
      p_portable: publicResultInt(input.portable, 0, total, 0),
      p_ready: publicResultInt(input.ready, 0, total, 0),
      p_shared: publicResultInt(input.shared, 0, total, 0),
      p_drift: publicResultInt(input.drift, 0, 999, 0),
      p_agents: publicResultAgents(input.agents),
      p_target: target,
      p_target_ready: target ? publicResultInt(input.targetReady, 0, targetTotal, 0) : 0,
      p_target_total: targetTotal,
      p_target_auto: target ? publicResultInt(input.targetAuto, 0, 999, 0) : 0,
      p_target_manual: target ? publicResultInt(input.targetManual, 0, 999, 0) : 0,
      p_target_context: target ? publicResultInt(input.targetContext, 0, 999, 0) : 0,
      p_target_deps: target ? publicResultInt(input.targetDeps, 0, 999, 0) : 0,
      p_runtime: input.runtime === 'cloud' ? 'cloud' : 'local',
      p_target_complete: Boolean(input.targetComplete),
      p_team_code: cleanTeam(input.team) || null,
    });

    if (!code || typeof code !== 'string') {
      return res.status(502).json({ error: 'result_store_failed' });
    }
    const origin = `https://${req.headers.host}`;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      code,
      url: `${origin}/r/${code}`,
    });
  } catch (error) {
    console.error('result_create_failed', error?.data || error?.message || error);
    return res.status(502).json({ error: 'result_store_failed' });
  }
}

const LABELS = targetLabels();

export default async function handler(req, res) {
  if (req.method === 'POST') return createPublicResult(req, res);
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const ref = cleanRef(req.query.ref);
  let stored = null;

  if (ref && req.query.total === undefined) {
    try {
      stored = await supabaseRpc('apc_public_result_snapshot', { p_code: ref });
    } catch {}
    if (!stored) {
      return res.status(404).send('Result not found.');
    }
  }

  const source = stored || req.query;
  const teamCode = cleanTeam(source.team);
  const score = source.score === null || source.score === 'na'
    ? null
    : intParam(source.score, 0, 100, null);
  const total = intParam(source.total, 0, 999, 0);
  const portable = intParam(source.portable, 0, total || 999, 0);
  const ready = intParam(source.ready ?? source.shared, 0, total || 999, portable);
  const drift = intParam(source.drift, 0, 999, 0);
  const agents = cleanAgents(source.agents);
  const target = cleanTarget(source.target);
  const targetTotal = target ? intParam(source.targetTotal, 0, 999, total) : 0;
  const targetReady = target ? intParam(source.targetReady, 0, targetTotal || 999, 0) : 0;
  const targetAuto = target ? intParam(source.targetAuto, 0, 999, 0) : 0;
  const targetManual = target ? intParam(source.targetManual, 0, 999, 0) : 0;
  const targetContext = target ? intParam(source.targetContext, 0, 999, 0) : 0;
  const targetDeps = target ? intParam(source.targetDeps, 0, 999, 0) : 0;
  const runtime = source.runtime === 'cloud' ? 'cloud' : 'local';
  const targetLabel = target
    ? (runtime === 'cloud' ? (harnessDefinition(target)?.cloudLabel || `${LABELS[target]} Cloud`) : LABELS[target])
    : '';
  const allMode = source.mode === 'all';
  const allRows = allMode ? cleanAllRows(source.all) : [];
  const allTargetsTotal = allMode ? intParam(source.allTotal, 0, 20, allRows.length) : 0;
  const allTargetsReady = allMode ? intParam(source.allReady, 0, allTargetsTotal || 20, allRows.filter(row => row.complete).length) : 0;
  const allComplete = Boolean(
    allMode &&
    allTargetsTotal > 0 &&
    allTargetsReady === allTargetsTotal &&
    (source.allComplete === '1' || source.allComplete === true)
  );

  const singleAgent = score === null;
  const readiness = total > 0 ? Math.round(100 * ready / total) : null;
  const portableReady = total > 0 && readiness === 100 && drift === 0;
  const targetComplete = Boolean(
    target &&
    targetTotal > 0 &&
    targetReady === targetTotal &&
    targetAuto === 0 &&
    targetManual === 0 &&
    targetDeps === 0 &&
    (source.targetComplete === '1' || source.targetComplete === true)
  );
  const shareAchievement = allMode ? allComplete : target ? targetComplete : portableReady;

  const agentLabel = agents.length ? agents.map(a => LABELS[a]).join(' ↔ ') : 'Agent setup';
  const origin = `https://${req.headers.host}`;
  const canonical = stored ? `${origin}/r/${ref}` : new URL(req.url, origin).toString();

  const checkParams = new URLSearchParams();
  if (ref) checkParams.set('ref', ref);
  if (allMode) checkParams.set('all', '1');
  if (target) checkParams.set('target', target);
  if (runtime === 'cloud') checkParams.set('runtime', 'cloud');
  if (teamCode) checkParams.set('team', teamCode);
  const checkUrl = `${origin}/?${checkParams.toString()}`;

  const fixCommand = [
    'npx github:Sakshambhutani/agent-portability-check',
    allMode ? '--all' : target ? `--target ${target}` : '',
    !allMode && runtime === 'cloud' ? '--runtime cloud' : '',
    '--fix',
    ref ? `--ref ${ref}` : '',
    teamCode ? `--team ${teamCode}` : '',
  ].filter(Boolean).join(' ');

  const title = allMode
    ? allComplete
      ? `My AI skills are ready across all ${allTargetsTotal} supported harness surfaces`
      : `${allTargetsReady}/${allTargetsTotal} harness targets ready`
    : targetComplete
      ? `My AI skills are ready for ${targetLabel}`
      : portableReady
        ? 'My AI setup is 100% portable-ready'
        : target
          ? `${targetReady}/${targetTotal} skills ready for ${targetLabel}`
          : `${ready}/${total} AI skills portable-ready`;

  const description = allMode
    ? allComplete
      ? `All checked skill packages are ready across ${allTargetsTotal} supported local/cloud harness surfaces. Context differences remain visible separately.`
      : `${allTargetsReady} of ${allTargetsTotal} supported harness surfaces are package-ready. The diagnostic shows the remaining auto-fix, manual, dependency, and context gaps by target.`
    : targetComplete
      ? `All ${targetTotal} skill packages are discoverable and structurally ready for ${targetLabel}.${targetContext ? ` ${targetContext} context gap${targetContext === 1 ? '' : 's'} still shown separately.` : ''}`
      : portableReady
        ? `${ready}/${total} global skills are in shared format with no drift.`
        : target
          ? `${targetAuto} auto-fix, ${targetManual} manual, ${targetDeps} dependency blockers, and ${targetContext} context gaps before moving to ${targetLabel}.`
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

  const shareSentence = allMode && allComplete
    ? `I got my AI skill packages ready across all ${allTargetsTotal} supported harness surfaces.`
    : targetComplete
      ? `I got all ${targetTotal} of my AI skill packages ready for ${targetLabel}.${targetContext ? ` The checker still flags ${targetContext} separate context gap${targetContext === 1 ? '' : 's'}.` : ''}`
      : `I made my AI setup 100% portable-ready. ${ready}/${total} skills are now in shared format.`;

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareSentence + ' Check yours:')}&url=${encodeURIComponent(canonical)}`;
  const postText = `${shareSentence}

Check yours: ${canonical}`;
  const postPreview = `${shareSentence}

Result link will be included when you copy.`;

  const hero = allMode
    ? `${allTargetsReady} / ${allTargetsTotal}`
    : target
      ? `${targetReady} / ${targetTotal}`
      : portableReady
        ? '100%'
        : `${ready} / ${total}`;

  const heroLabel = allMode
    ? 'harness targets package-ready'
    : target
      ? `skill packages ready for ${targetLabel}`
      : portableReady
        ? 'PORTABLE-READY'
        : 'skills portable-ready';

  const badge = new URL('/api/badge', origin);
  if (target) badge.searchParams.set('target', target);
  badge.searchParams.set('ready', String(allMode ? allTargetsReady : target ? targetReady : ready));
  badge.searchParams.set('total', String(allMode ? allTargetsTotal : target ? targetTotal : total));
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
    .cta h2{margin:0 0 8px;font-size:23px}.muted{color:#94a0ad;margin:0}
    .identity{margin-top:26px;padding:22px;border:1px solid #2a313a;border-radius:18px;background:#0d1116}
    .identity input{width:100%;background:#090c0f;color:#fff;border:1px solid #303945;border-radius:11px;padding:12px 13px;margin-top:10px}
    .identity .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.hidden{display:none!important}
    .identity-status{color:#9aa6b2;margin-top:12px;min-height:22px}
    @media(max-width:680px){.card{padding:28px}.cta{align-items:flex-start;flex-direction:column}}
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
      <div class="copybox" id="posttext">${esc(postPreview)}</div>
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
          <p class="muted">See whether their setup can reach the same portable-ready result. Their scan stays local.</p>
        </div>
        <a id="check" class="primary" href="${esc(checkUrl)}">Challenge teammate →</a>
      </div>


    ` : `
      <div class="insight">
        <strong>This is your diagnostic.</strong><br>
        The CLI can safely fix location/discovery issues. Team Compare is available now; public social sharing unlocks after a portable-ready or target-ready achievement.
      </div>
      <div class="copybox" id="fixcommand">${esc(fixCommand)}</div>
      <div class="actions">
        <button id="copyFix" class="primary">Copy fix command</button>
        <button id="copy" class="secondary">Copy diagnostic link</button>
      </div>
      <p class="muted" id="fixhint" style="margin-top:12px">Paste the copied command into Terminal. The CLI previews changes before applying them.</p>
    `}

      <div class="identity">
        <h2>Compare with your team</h2>
        <p class="muted">Keep the individual scan account-free. Compare the same diagnostic across your team; sign in only when you want to save and group results.</p>
        <div class="actions">
          <button id="teamAction" class="secondary">Save result / Compare team</button>
        </div>
      </div>

      <div id="identityPanel" class="identity hidden">
        <h2>Save result / Compare with team</h2>
        <p class="muted">Identity is requested only for the multiplayer layer. Skill names and contents are not uploaded.</p>

        <div id="identitySignedOut">
          <input id="identityEmail" type="email" autocomplete="email" placeholder="Work email">
          <div class="row">
            <button id="identityEmailLogin" class="primary">Email sign-in</button>
            <button id="identityGithubLogin" class="secondary hidden">GitHub sign-in</button>
          </div>
        </div>

        <div id="identitySignedIn" class="hidden">
          <p id="identityWho" class="muted"></p>
          <input id="displayNameInput" type="text" autocomplete="name" placeholder="Your name (optional)">
          <div class="row">
            <button id="saveResult" class="primary">Save result</button>
            <button id="showCreateTeam" class="secondary">Create team</button>
          </div>

          <div id="createTeamArea" class="hidden">
            <input id="teamNameInput" type="text" placeholder="Team name">
            <div class="row">
              <button id="createTeam" class="primary">Create team & save result</button>
            </div>
          </div>

          <div id="teamInviteArea" class="hidden">
            <div class="copybox" id="teamInviteUrl"></div>
            <div class="row">
              <button id="copyTeamInvite" class="primary">Copy teammate invite</button>
            </div>
          </div>
        </div>

        <div id="identityStatus" class="identity-status"></div>
      </div>
  </div>
</div>
<script>
const referralId = ${JSON.stringify(ref)};
const postText = ${JSON.stringify(postText)};
const fixCommand = ${JSON.stringify(fixCommand)};
const badgeMarkdown = ${JSON.stringify(badgeMarkdown)};
const teamCode = ${JSON.stringify(teamCode)};
const resultPayload = ${JSON.stringify({
  referral_id: ref,
  target,
  runtime,
  target_ready: targetReady,
  target_total: targetTotal,
  target_auto: targetAuto,
  target_manual: targetManual,
  target_context: targetContext,
  target_deps: targetDeps,
  portable_ready: ready,
  total_skills: total,
  drift,
  complete: shareAchievement,
})};
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

try {
  localStorage.setItem('apc_last_result', JSON.stringify({
    url: location.href,
    target: ${JSON.stringify(target)},
    runtime: ${JSON.stringify(runtime)},
    complete: ${JSON.stringify(shareAchievement)},
    updatedAt: Date.now()
  }));
} catch {}

track('apc_referral_page_opened');

const linkedinEl = document.getElementById('linkedin');
const xEl = document.getElementById('xshare');
const checkEl = document.getElementById('check');
const copyFixEl = document.getElementById('copyFix');
const copyPostEl = document.getElementById('copyPost');
const copyBadgeEl = document.getElementById('copyBadge');
const copyEl = document.getElementById('copy');
const teamActionEl = document.getElementById('teamAction');
const identityPanelEl = document.getElementById('identityPanel');
let identitySupabase = null;
let identitySession = null;
let identityConfigured = false;

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


async function identityFetch(path, options={}) {
  if (!identitySession?.access_token) throw new Error('not_signed_in');
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type':'application/json',
      Authorization:'Bearer ' + identitySession.access_token,
      ...(options.headers || {}),
    },
  });
}

function renderIdentityAuth() {
  if (!identityPanelEl) return;
  const signedIn = Boolean(identitySession?.user);
  document.getElementById('identitySignedOut')?.classList.toggle('hidden', signedIn);
  document.getElementById('identitySignedIn')?.classList.toggle('hidden', !signedIn);
  const who = document.getElementById('identityWho');
  if (who && signedIn) {
    who.textContent = 'Signed in as ' + (identitySession.user.email || identitySession.user.user_metadata?.user_name || 'GitHub user');
  }
  if (teamCode) {
    const action = document.getElementById('saveResult');
    if (action) action.textContent = 'Save to team';
    document.getElementById('showCreateTeam')?.classList.add('hidden');
    if (teamActionEl) teamActionEl.textContent = 'Save to team';
  }
}

async function setupIdentity() {
  if (!teamActionEl) return;
  try {
    const configResponse = await fetch('/api/public-config');
    const config = await configResponse.json();
    if (!config.configured) {
      teamActionEl.textContent = 'Team Compare needs deployment setup';
      teamActionEl.disabled = true;
      document.getElementById('identityStatus').textContent = 'Team Compare is not configured on this deployment yet.';
      return;
    }

    identityConfigured = true;
    if (config.githubEnabled) document.getElementById('identityGithubLogin')?.classList.remove('hidden');
    const module = await import('https://esm.sh/@supabase/supabase-js@2');
    identitySupabase = module.createClient(config.url, config.anonKey, {
      auth:{persistSession:true,detectSessionInUrl:true},
    });
    const current = await identitySupabase.auth.getSession();
    identitySession = current.data.session;
    renderIdentityAuth();
    identitySupabase.auth.onAuthStateChange((_event, nextSession)=>{
      identitySession = nextSession;
      renderIdentityAuth();
    });
  } catch {}
}

if (teamActionEl) teamActionEl.addEventListener('click',()=>{
  if (!identityConfigured) return;
  identityPanelEl?.classList.toggle('hidden');
  track('apc_identity_cta_clicked');
});

document.getElementById('identityEmailLogin')?.addEventListener('click',async()=>{
  if (!identitySupabase) return;
  const email = document.getElementById('identityEmail')?.value?.trim();
  if (!email) {
    document.getElementById('identityStatus').textContent = 'Enter your email first.';
    return;
  }
  const result = await identitySupabase.auth.signInWithOtp({
    email,
    options:{emailRedirectTo:location.href},
  });
  document.getElementById('identityStatus').textContent = result.error ? result.error.message : 'Check your email for the sign-in link.';
  if (!result.error) track('apc_identity_signin_started',{share_surface:'email'});
});

document.getElementById('identityGithubLogin')?.addEventListener('click',async()=>{
  if (!identitySupabase) return;
  const result = await identitySupabase.auth.signInWithOAuth({
    provider:'github',
    options:{redirectTo:location.href},
  });
  if (result.error) document.getElementById('identityStatus').textContent = result.error.message;
  else track('apc_identity_signin_started',{share_surface:'github'});
});

async function saveCurrentResult(code='') {
  const status = document.getElementById('identityStatus');
  if (!identitySession) {
    status.textContent = 'Sign in first.';
    return null;
  }
  status.textContent = code ? 'Saving to team…' : 'Saving result…';
  const response = await identityFetch('/api/save-result',{
    method:'POST',
    body:JSON.stringify({...resultPayload,team_code:code || undefined}),
  });
  const data = await response.json();
  if (!response.ok) {
    status.textContent = data.error === 'join_team_first'
      ? 'Join this team from its invite page first.'
      : (data.error || 'Could not save result.');
    return null;
  }
  status.textContent = code ? 'Saved to team.' : 'Result saved.';
  track(code ? 'apc_team_result_saved' : 'apc_result_saved');
  return data.result;
}

document.getElementById('saveResult')?.addEventListener('click',()=>saveCurrentResult(teamCode));

document.getElementById('showCreateTeam')?.addEventListener('click',()=>{
  document.getElementById('createTeamArea')?.classList.toggle('hidden');
});

document.getElementById('createTeam')?.addEventListener('click',async()=>{
  const status = document.getElementById('identityStatus');
  if (!identitySession) {
    status.textContent='Sign in first.';
    return;
  }
  status.textContent='Creating team…';
  const response = await identityFetch('/api/team-create',{
    method:'POST',
    body:JSON.stringify({
      name:document.getElementById('teamNameInput')?.value || 'My Agent Team',
      display_name:document.getElementById('displayNameInput')?.value || '',
      target:resultPayload.target,
      runtime:resultPayload.runtime,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    status.textContent=data.error || 'Could not create team.';
    return;
  }
  const saved = await saveCurrentResult(data.team.invite_code);
  if (!saved) return;
  document.getElementById('teamInviteUrl').textContent=data.team.invite_url;
  document.getElementById('teamInviteArea').classList.remove('hidden');
  status.textContent='Team created and result saved. Share the invite.';
  track('apc_team_created');
});

document.getElementById('copyTeamInvite')?.addEventListener('click',async()=>{
  const url=document.getElementById('teamInviteUrl')?.textContent || '';
  if (!url) return;
  await navigator.clipboard.writeText(url);
  document.getElementById('copyTeamInvite').textContent='Invite copied';
  track('apc_team_invite_copied');
});

setupIdentity();

if (copyEl) copyEl.addEventListener('click',async()=>{
  await navigator.clipboard.writeText(location.href);
  copyEl.textContent='Copied';
  track('apc_copy_link_clicked',{share_surface:'copy'});
});
</script>
</body>
</html>`);
}

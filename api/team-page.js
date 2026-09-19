import { cleanTeamCode } from '../lib/supabase.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

export default function handler(req, res) {
  const code = cleanTeamCode(req.query.code);
  if (!code) return res.status(400).send('Invalid team invite.');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Team Compare · Agent Portability Check</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#090c0f;color:#f7f8fa}
    *{box-sizing:border-box}body{margin:0}.shell{width:min(960px,calc(100% - 36px));margin:auto;padding:28px 0 80px}
    a{color:inherit}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:58px;color:#aab4bf}
    .eyebrow{font-family:ui-monospace,monospace;color:#84909d;font-size:13px;letter-spacing:.08em}
    h1{font-size:clamp(42px,7vw,72px);line-height:.98;letter-spacing:-.05em;margin:16px 0}.lead{font-size:19px;color:#a8b2bd;line-height:1.55;max-width:720px}
    .card{margin-top:28px;background:#12161b;border:1px solid #2a313a;border-radius:22px;padding:26px}
    .leader{display:grid;grid-template-columns:minmax(160px,1fr) 110px 120px 100px;gap:12px;align-items:center;padding:14px 0;border-bottom:1px solid #242b33}
    .leader:last-child{border-bottom:0}.score{font-size:24px;font-weight:850}.muted{color:#8e9ba9}.good{color:#68d391}.warn{color:#f4c969}
    .command{margin-top:22px;background:#0d1116;border:1px solid #303945;border-radius:14px;padding:16px;font-family:ui-monospace,monospace;overflow-wrap:anywhere}
    .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.btn{appearance:none;border:0;border-radius:11px;padding:12px 16px;font-weight:800;cursor:pointer;background:#fff;color:#0b0d10}.secondary{background:#1a2027;color:#fff;border:1px solid #303945}
    input{width:100%;background:#0d1116;color:#fff;border:1px solid #303945;border-radius:11px;padding:13px 14px;font-size:15px}.auth-grid{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:16px}
    .status{margin-top:12px;color:#9ba6b1;min-height:24px}.hidden{display:none!important}
    @media(max-width:650px){.leader{grid-template-columns:1fr 90px}.leader .desktop{display:none}.auth-grid{grid-template-columns:1fr}.top{align-items:flex-start;gap:20px}}
  </style>
</head>
<body>
<div class="shell">
  <div class="top"><strong>Agent Portability Check</strong><a href="/">Run your own check ↗</a></div>
  <div class="eyebrow">TEAM COMPARE</div>
  <h1 id="teamName">Loading team…</h1>
  <p class="lead" id="teamLead">See how portable each teammate's latest AI skill setup is. Join explicitly, run the local scan, then save your result here.</p>

  <div class="card">
    <div class="eyebrow">LATEST RESULTS</div>
    <div id="leaderboard" style="margin-top:12px"><div class="muted">Loading…</div></div>
  </div>

  <div class="card">
    <div class="eyebrow">ADD YOUR RESULT</div>
    <p class="muted">Your scan still runs locally. Signing in only saves the summary metrics you explicitly submit to this team.</p>

    <div id="signedOut">
      <div class="auth-grid">
        <input id="email" type="email" placeholder="Work email">
        <button id="emailLogin" class="btn">Email me a sign-in link</button>
      </div>
      <div class="actions"><button id="githubLogin" class="btn secondary">Continue with GitHub</button></div>
    </div>

    <div id="signedIn" class="hidden">
      <p id="who" class="muted"></p>
      <input id="displayName" placeholder="Name shown to teammates">
      <div class="actions">
        <button id="join" class="btn">Join team</button>
        <button id="signOut" class="btn secondary">Sign out</button>
      </div>
    </div>

    <div id="authStatus" class="status"></div>

    <div id="scanArea" class="hidden">
      <div class="command" id="command"></div>
      <div class="actions"><button id="copyCommand" class="btn">Copy team scan command</button></div>
      <p class="muted">After the scan, open its result page and choose <strong>Save to team</strong>.</p>
    </div>
  </div>
</div>

<script type="module">
const code = ${JSON.stringify(code)};
const $ = id => document.getElementById(id);
let supabase = null;
let session = null;
let team = null;
const anon = localStorage.getItem('apc_web_id') || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
localStorage.setItem('apc_web_id', anon);

async function track(event, extra={}) {
  try {
    await fetch('/api/telemetry',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        event,
        distinct_id:'web_' + anon,
        properties:extra,
      }),
    });
  } catch {}
}

track('apc_team_page_viewed');

function commandForTeam() {
  if (!team) return '';
  return [
    'npx github:Sakshambhutani/agent-portability-check',
    team.target ? '--target ' + team.target : '',
    team.runtime === 'cloud' ? '--runtime cloud' : '',
    '--team ' + code,
  ].filter(Boolean).join(' ');
}

function renderLeaderboard(rows) {
  if (!rows.length) {
    $('leaderboard').innerHTML = '<div class="muted">No saved results yet. Be the first teammate to add one.</div>';
    return;
  }
  $('leaderboard').innerHTML = rows.map(item => {
    const result = item.result;
    const score = result?.percent == null ? '—' : result.percent + '%';
    const detail = result ? result.ready + '/' + result.total : 'No scan';
    const issues = result ? (result.manual + result.context_gaps + result.dependency_blockers) : 0;
    return '<div class="leader">' +
      '<div><strong>' + escapeHtml(item.display_name) + '</strong><div class="muted">' + (result ? escapeHtml(result.target || 'portable-ready') : 'waiting for scan') + '</div></div>' +
      '<div class="score ' + (result?.complete ? 'good' : '') + '">' + score + '</div>' +
      '<div class="desktop">' + detail + ' ready</div>' +
      '<div class="desktop ' + (issues ? 'warn' : 'good') + '">' + (result ? issues + ' gaps' : '—') + '</div>' +
    '</div>';
  }).join('');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

async function loadTeam() {
  const response = await fetch('/api/team-data?code=' + encodeURIComponent(code));
  if (!response.ok) {
    $('teamName').textContent = 'Team unavailable';
    $('teamLead').textContent = 'This invite may be invalid or Team Compare is not configured yet.';
    $('leaderboard').innerHTML = '<div class="muted">Could not load this team.</div>';
    return;
  }
  const data = await response.json();
  team = data.team;
  $('teamName').textContent = team.name;
  const label = team.target ? team.target + (team.runtime === 'cloud' ? ' cloud' : '') : 'portable readiness';
  $('teamLead').textContent = 'Compare the latest ' + label + ' result across teammates.';
  renderLeaderboard(data.leaderboard || []);
  $('command').textContent = commandForTeam();
}

async function setupAuth() {
  const configResponse = await fetch('/api/public-config');
  const config = await configResponse.json();
  if (!config.configured) {
    $('authStatus').textContent = 'Team sign-in is not configured on this deployment yet.';
    $('signedOut').classList.add('hidden');
    return;
  }

  const module = await import('https://esm.sh/@supabase/supabase-js@2');
  supabase = module.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, detectSessionInUrl: true },
  });

  const current = await supabase.auth.getSession();
  session = current.data.session;
  renderAuth();

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    renderAuth();
  });
}

function renderAuth() {
  const isIn = Boolean(session?.user);
  $('signedOut').classList.toggle('hidden', isIn);
  $('signedIn').classList.toggle('hidden', !isIn);
  if (isIn) {
    $('who').textContent = 'Signed in as ' + (session.user.email || session.user.user_metadata?.user_name || 'GitHub user');
    $('displayName').value = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.user_metadata?.user_name || '';
  }
}

$('emailLogin').addEventListener('click', async () => {
  if (!supabase) return;
  const email = $('email').value.trim();
  if (!email) return $('authStatus').textContent = 'Enter your email first.';
  $('authStatus').textContent = 'Sending sign-in link…';
  const result = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.href },
  });
  $('authStatus').textContent = result.error ? result.error.message : 'Check your email for the sign-in link.';
});

$('githubLogin').addEventListener('click', async () => {
  if (!supabase) return;
  const result = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: location.href },
  });
  if (result.error) $('authStatus').textContent = result.error.message;
});

$('signOut').addEventListener('click', async () => {
  if (supabase) await supabase.auth.signOut();
});

$('join').addEventListener('click', async () => {
  if (!session) return;
  $('authStatus').textContent = 'Joining team…';
  const response = await fetch('/api/team-join', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token,
    },
    body: JSON.stringify({ code, display_name: $('displayName').value }),
  });
  const data = await response.json();
  if (!response.ok) return $('authStatus').textContent = data.error || 'Could not join team.';
  $('authStatus').textContent = 'Joined. Run the command below, then save your result to this team.';\n  track('apc_team_joined');\n  $('scanArea').classList.remove('hidden');
  $('command').textContent = commandForTeam();
  await loadTeam();
});

$('copyCommand').addEventListener('click', async () => {
  await navigator.clipboard.writeText(commandForTeam());
  $('copyCommand').textContent = 'Copied — paste in Terminal';\n  track('apc_team_command_copied');\n});

await loadTeam();
await setupAuth();
</script>
</body>
</html>`);
}

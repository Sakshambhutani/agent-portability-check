import sharp from 'sharp';

function intParam(value, min, max, fallback = null) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function cleanAgents(value) {
  const allowed = new Set(['codex', 'claude', 'cursor']);
  return String(value || '')
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(x => allowed.has(x))
    .slice(0, 3);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[ch]));
}

const LABELS = { codex: 'Codex', claude: 'Claude Code', cursor: 'Cursor' };

export default async function handler(req, res) {
  const score = req.query?.score === 'na' ? null : intParam(req.query?.score, 0, 100, null);
  const total = intParam(req.query?.total, 0, 999, 0);
  const portable = intParam(req.query?.portable, 0, total || 999, 0);
  const ready = intParam(req.query?.ready ?? req.query?.shared, 0, total || 999, portable);
  const drift = intParam(req.query?.drift, 0, 999, 0);
  const agents = cleanAgents(req.query?.agents);
  const target = ['claude','codex','cursor'].includes(req.query?.target) ? req.query.target : '';
  const targetLabel = target ? LABELS[target] : '';
  const targetTotal = target ? intParam(req.query?.targetTotal, 0, 999, total) : 0;
  const targetReady = target ? intParam(req.query?.targetReady, 0, targetTotal || 999, 0) : 0;
  const targetAuto = target ? intParam(req.query?.targetAuto, 0, 999, 0) : 0;
  const targetManual = target ? intParam(req.query?.targetManual, 0, 999, 0) : 0;

  const agentLabel = agents.length ? agents.map(a => LABELS[a]).join(' ↔ ') : 'Agent setup';
  const readiness = total > 0 ? Math.round(100 * ready / total) : null;
  const portableReady = total > 0 && readiness === 100 && drift === 0;
  const targetComplete = Boolean(
    target &&
    targetTotal > 0 &&
    targetReady === targetTotal &&
    targetAuto === 0 &&
    targetManual === 0
  );

  const hero = target
    ? `${targetReady}/${targetTotal}`
    : portableReady
      ? '100%'
      : `${ready}/${total}`;

  const heroLabel = target
    ? `READY FOR ${targetLabel.toUpperCase()}`
    : portableReady
      ? 'PORTABLE-READY'
      : 'SKILLS PORTABLE-READY';

  const title = target ? `Ready for ${targetLabel}?` : 'How portable is my AI setup?';

  const sub = target
    ? targetComplete
      ? `All skills are discoverable and structurally ready for ${targetLabel}`
      : `${targetAuto} auto-fix · ${targetManual} manual before moving to ${targetLabel}`
    : portableReady
      ? `${ready}/${total} skills are in shared format with no drift`
      : `${total} global skills found in ${agentLabel}`;

  const accent = targetComplete || portableReady ? '#68d391' : '#9aa6b2';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#0b0d10"/>
    <text x="72" y="92" fill="#9aa6b2" font-size="27" font-family="Arial,Helvetica,sans-serif" font-weight="600" letter-spacing="2">
      ${esc(target ? 'AGENT MIGRATION CHECK' : 'AGENT PORTABILITY CHECK')}
    </text>
    <text x="72" y="174" fill="#ffffff" font-size="58" font-family="Arial,Helvetica,sans-serif" font-weight="800">
      ${esc(title)}
    </text>

    <text x="72" y="390" fill="#ffffff" font-size="126" font-family="Arial,Helvetica,sans-serif" font-weight="900">
      ${esc(hero)}
    </text>
    <text x="76" y="440" fill="${accent}" font-size="28" font-family="Arial,Helvetica,sans-serif" font-weight="700">
      ${esc(heroLabel)}
    </text>

    <foreignObject x="610" y="250" width="510" height="150">
      <div xmlns="http://www.w3.org/1999/xhtml" style="color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:34px;font-weight:700;line-height:1.25;">
        ${esc(sub)}
      </div>
    </foreignObject>
    <text x="610" y="430" fill="#c8d0d9" font-size="24" font-family="Arial,Helvetica,sans-serif">
      ${esc(`${drift} drifted · ${agentLabel}`)}
    </text>

    <line x1="72" y1="508" x2="1128" y2="508" stroke="#2a313a"/>
    <text x="72" y="562" fill="#68d391" font-size="26" font-family="Arial,Helvetica,sans-serif">
      Check yours → agent-portability-check.vercel.app
    </text>
    <text x="1128" y="562" text-anchor="end" fill="#707c88" font-size="22" font-family="Arial,Helvetica,sans-serif">
      local-first · open source
    </text>
  </svg>`;

  try {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400');
    res.status(200).end(png);
  } catch (error) {
    res.status(500).json({ error: 'og_render_failed' });
  }
}

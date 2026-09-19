import { ImageResponse } from '@vercel/og';
import { jsxs } from 'react/jsx-runtime';

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

const LABELS = { codex: 'Codex', claude: 'Claude Code', cursor: 'Cursor' };

function el(type, props, ...children) {
  return jsxs(type, { ...props, children });
}

export default function handler(req) {
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

  const sub = target
    ? targetComplete
      ? `All skills are discoverable and structurally ready for ${targetLabel}`
      : `${targetAuto} auto-fix · ${targetManual} manual before moving to ${targetLabel}`
    : portableReady
      ? `${ready}/${total} skills are in shared format with no drift`
      : `${total} global skills found in ${agentLabel}`;

  const card = el('div', {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#0b0d10',
        color: '#ffffff',
        padding: '64px 72px',
      },
    },
    el('div', { style: { display: 'flex', flexDirection: 'column' } },
      el('div', { style: { fontSize: 27, color: '#9aa6b2', letterSpacing: '0.08em' } },
        target ? 'AGENT MIGRATION CHECK' : 'AGENT PORTABILITY CHECK'
      ),
      el('div', { style: { fontSize: 58, fontWeight: 800, marginTop: 24, letterSpacing: '-0.04em' } },
        target ? `Ready for ${targetLabel}?` : 'How portable is my AI setup?'
      ),
    ),
    el('div', { style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' } },
      el('div', { style: { display: 'flex', flexDirection: 'column' } },
        el('div', { style: { fontSize: 126, fontWeight: 900, letterSpacing: '-0.07em', lineHeight: 0.9 } }, hero),
        el('div', {
          style: {
            fontSize: 28,
            color: targetComplete || portableReady ? '#68d391' : '#9aa6b2',
            marginTop: 14,
          },
        }, heroLabel),
      ),
      el('div', { style: { display: 'flex', flexDirection: 'column', width: 520, paddingBottom: 8 } },
        el('div', { style: { fontSize: 34, fontWeight: 700, lineHeight: 1.25 } }, sub),
        el('div', { style: { display: 'flex', gap: 18, marginTop: 24, fontSize: 24, color: '#c8d0d9' } },
          el('div', {}, `${drift} drifted`),
          el('div', {}, '·'),
          el('div', {}, agentLabel),
        ),
      ),
    ),
    el('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid #2a313a',
        paddingTop: 24,
      },
    },
      el('div', { style: { fontSize: 26, color: '#68d391' } }, 'Check yours → agent-portability-check.vercel.app'),
      el('div', { style: { fontSize: 22, color: '#707c88' } }, 'local-first · open source'),
    ),
  );

  return new ImageResponse(card, {
    width: 1200,
    height: 630,
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=86400',
    },
  });
}

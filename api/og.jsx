import React from 'react';
import { ImageResponse } from '@vercel/og';

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

export default function handler(req) {
  const score = req.query?.score === 'na' ? null : intParam(req.query?.score, 0, 100, null);
  const total = intParam(req.query?.total, 0, 999, 0);
  const portable = intParam(req.query?.portable, 0, total || 999, 0);
  const shared = intParam(req.query?.shared, 0, total || 999, portable);
  const drift = intParam(req.query?.drift, 0, 999, 0);
  const agents = cleanAgents(req.query?.agents);
  const agentLabel = agents.length ? agents.map(a => LABELS[a]).join(' ↔ ') : 'Agent setup';
  const singleAgent = score === null;

  const hero = singleAgent ? `${shared}/${total}` : `${score}%`;
  const heroLabel = singleAgent ? 'skills in shared format' : 'portable';
  const sub = singleAgent
    ? `${total} global skills found in ${agentLabel}`
    : `${portable} / ${total} skills travel across ${agentLabel}`;

  return new ImageResponse(
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      background: '#0b0d10',
      color: '#ffffff',
      padding: '64px 72px',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 27, color: '#9aa6b2', letterSpacing: '0.08em' }}>
          AGENT PORTABILITY CHECK
        </div>
        <div style={{ fontSize: 58, fontWeight: 800, marginTop: 24, letterSpacing: '-0.04em' }}>
          How portable is my AI setup?
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: singleAgent ? 126 : 142, fontWeight: 900, letterSpacing: '-0.07em', lineHeight: 0.9 }}>
            {hero}
          </div>
          <div style={{ fontSize: 30, color: '#9aa6b2', marginTop: 14 }}>
            {heroLabel}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', width: 520, paddingBottom: 8 }}>
          <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.25 }}>{sub}</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 24, fontSize: 24, color: '#c8d0d9' }}>
            <div>{drift} drifted</div>
            <div>·</div>
            <div>{agentLabel}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #2a313a', paddingTop: 24 }}>
        <div style={{ fontSize: 26, color: '#68d391' }}>Check yours → agent-portability-check.vercel.app</div>
        <div style={{ fontSize: 22, color: '#707c88' }}>local-first · open source</div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=86400',
      },
    },
  );
}

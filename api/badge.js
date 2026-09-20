import { HARNESS_ORDER, targetLabels } from '../src/harnesses.js';
function escXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  }[ch]));
}

function intParam(value, min, max, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

const LABELS = targetLabels();

export default function handler(req, res) {
  const target = HARNESS_ORDER.includes(req.query.target) ? req.query.target : '';
  const total = intParam(req.query.total, 0, 999, 0);
  const ready = intParam(req.query.ready, 0, total || 999, 0);
  const complete = total > 0 && ready === total;

  const left = target ? `agent portability · ${LABELS[target]}` : 'agent portability';
  const right = total > 0
    ? `${ready}/${total} ${complete ? 'ready' : 'checked'}`
    : 'checked';

  const leftWidth = Math.max(116, Math.round(left.length * 7.2 + 24));
  const rightWidth = Math.max(82, Math.round(right.length * 7.2 + 24));
  const width = leftWidth + rightWidth;
  const rightFill = complete ? '#2ea043' : '#57606a';

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400');
  res.status(200).send(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28" role="img" aria-label="${escXml(left)}: ${escXml(right)}">
  <title>${escXml(left)}: ${escXml(right)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".08"/>
    <stop offset="1" stop-opacity=".08"/>
  </linearGradient>
  <clipPath id="r"><rect width="${width}" height="28" rx="6"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="28" fill="#24292f"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="28" fill="${rightFill}"/>
    <rect width="${width}" height="28" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="12" font-weight="600">
    <text x="${leftWidth / 2}" y="18">${escXml(left)}</text>
    <text x="${leftWidth + rightWidth / 2}" y="18">${escXml(right)}</text>
  </g>
</svg>`);
}

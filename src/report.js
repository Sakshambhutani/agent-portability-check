import fs from 'node:fs';
import path from 'node:path';

const REPO = 'github.com/Sakshambhutani/agent-portability-check';

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function createCardSvg(report) {
  const top = report.findings.slice(0, 3);
  const rows = [
    `${report.totalSkills} unique skills found`,
    `${report.harnessSpecificSkills.length} harness-specific skills`,
    `${report.drift.length} drifted skill copies`,
    `${report.cursorRules.length} Cursor-only rules`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0b0d10"/>
  <rect x="42" y="42" width="1116" height="546" rx="34" fill="#12161b" stroke="#2a313a"/>
  <text x="88" y="112" fill="#aab4c0" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="27">AGENT PORTABILITY CHECK</text>
  <text x="88" y="186" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="48">How portable is your AI setup?</text>
  <text x="88" y="306" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="112">${report.score}<tspan font-size="44" fill="#8995a3"> / 100</tspan></text>
  <text x="88" y="354" fill="#8995a3" font-family="Arial, Helvetica, sans-serif" font-size="24">experimental portability score</text>
  ${rows.map((r,i)=>`<text x="640" y="${272+i*48}" fill="${i===0?'#ffffff':'#c8d0d9'}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="25">${esc(r)}</text>`).join('\n  ')}
  <line x1="88" y1="435" x2="1112" y2="435" stroke="#2a313a"/>
  <text x="88" y="490" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="26">${esc(top[0]?.text || 'No obvious portability problems found.')}</text>
  <text x="88" y="548" fill="#68d391" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24">Check yours → ${REPO}</text>
</svg>`;
}

export function createHtml(report) {
  const findingRows = report.findings.map(f => `<li class="${f.level}">${esc(f.text)}</li>`).join('');
  const skillRows = report.skills.length ? report.skills.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.owner)}</td><td><code>${esc(s.path)}</code></td><td><code>${esc(s.hash)}</code></td></tr>`).join('') : '<tr><td colspan="4">No skills found.</td></tr>';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent Portability Check</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#e9eef4;background:#0b0d10}body{max-width:980px;margin:0 auto;padding:48px 22px}header{border:1px solid #2a313a;border-radius:24px;padding:32px;background:#12161b}.eyebrow{font-family:ui-monospace,monospace;color:#8995a3}.score{font-size:86px;font-weight:800;margin:10px 0}.muted{color:#8995a3}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.metric{background:#12161b;border:1px solid #2a313a;border-radius:16px;padding:18px}.metric b{font-size:28px;display:block}section{margin-top:34px}li{margin:10px 0}code{font-family:ui-monospace,monospace;color:#c7d2fe}table{width:100%;border-collapse:collapse;background:#12161b;border-radius:16px;overflow:hidden}th,td{text-align:left;padding:12px;border-bottom:1px solid #252c34}.share{display:inline-block;margin-top:16px;padding:12px 16px;border:1px solid #3d4855;border-radius:12px;color:#fff;text-decoration:none}.note{padding:14px 16px;background:#101820;border-left:3px solid #68d391;border-radius:8px}@media(max-width:700px){.grid{grid-template-columns:1fr 1fr}.score{font-size:64px}table{font-size:12px}}
  </style></head><body><header><div class="eyebrow">AGENT PORTABILITY CHECK</div><h1>How portable is your AI setup?</h1><div class="score">${report.score}<span class="muted" style="font-size:32px"> / 100</span></div><div class="muted">Experimental score. This checks files and locations, not model behavior.</div></header>
  <div class="grid"><div class="metric"><b>${report.totalSkills}</b>skills</div><div class="metric"><b>${report.harnessSpecificSkills.length}</b>harness-specific</div><div class="metric"><b>${report.drift.length}</b>drifted</div><div class="metric"><b>${report.activeHarnesses.length}</b>harnesses detected</div></div>
  <section><h2>What stood out</h2><ul>${findingRows}</ul></section>
  <section><h2>Skills found</h2><table><thead><tr><th>Skill</th><th>Location type</th><th>Path</th><th>Hash</th></tr></thead><tbody>${skillRows}</tbody></table></section>
  <section><div class="note"><strong>Privacy:</strong> this report was generated locally. The scanner does not upload your instruction or skill contents.</div><p class="muted">Share the SVG card, not this detailed HTML report, if your paths are sensitive.</p><a class="share" href="https://${REPO}">Check yours → ${REPO}</a></section>
  </body></html>`;
}

export function writeReports(report, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const htmlPath = path.join(outputDir, 'agent-portability-report.html');
  const svgPath = path.join(outputDir, 'agent-portability-card.svg');
  const jsonPath = path.join(outputDir, 'agent-portability-report.json');
  fs.writeFileSync(htmlPath, createHtml(report));
  fs.writeFileSync(svgPath, createCardSvg(report));
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  return { htmlPath, svgPath, jsonPath };
}

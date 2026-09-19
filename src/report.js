import fs from 'node:fs';
import path from 'node:path';

const REPO = 'github.com/Sakshambhutani/agent-portability-check';

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function createCardSvg(report) {
  const score = report.score === null ? 'N/A' : `${report.score}%`;
  const hero = report.totalSkills === 0 ? 'No skills found' : `${report.crossHarnessSkills} / ${report.totalSkills} skills cross-harness`;
  const mainFinding = report.findings[0]?.text || 'No obvious portability problems found.';
  const harnesses = report.activeHarnesses.join(' · ') || 'No harness-specific footprint detected';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0b0d10"/>
  <rect x="42" y="42" width="1116" height="546" rx="34" fill="#12161b" stroke="#2a313a"/>
  <text x="88" y="110" fill="#aab4c0" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="26">AGENT PORTABILITY CHECK</text>
  <text x="88" y="178" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="47">How portable is your AI setup?</text>
  <text x="88" y="304" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="105">${esc(score)}</text>
  <text x="88" y="350" fill="#8995a3" font-family="Arial, Helvetica, sans-serif" font-size="24">skill portability score</text>

  <text x="610" y="270" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="38">${esc(hero)}</text>
  <text x="610" y="320" fill="#c8d0d9" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="23">Fully portable: ${report.fullyPortableSkills} / ${report.totalSkills}</text>
  <text x="610" y="360" fill="#c8d0d9" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="23">Drifted copies: ${report.drift.length}</text>
  <text x="610" y="400" fill="#8995a3" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="21">Footprints: ${esc(harnesses)}</text>

  <line x1="88" y1="445" x2="1112" y2="445" stroke="#2a313a"/>
  <text x="88" y="500" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="25">${esc(mainFinding)}</text>
  <text x="88" y="552" fill="#68d391" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24">Check yours → ${REPO}</text>
</svg>`;
}

export function createHtml(report) {
  const findingRows = report.findings.map(f => `<li class="${f.level}">${esc(f.text)}</li>`).join('');
  const skillRows = report.skillPortability.length
    ? report.skillPortability.map(s => `<tr><td>${esc(s.name)}</td><td>${Math.round(s.portability * 100)}%</td><td>${esc(s.reason)}</td><td>${s.copies.map(c => `<code>${esc(c.path)}</code>`).join('<br>')}</td></tr>`).join('')
    : '<tr><td colspan="4">No skills found.</td></tr>';
  const scoreText = report.score === null ? 'N/A' : `${report.score}`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent Portability Check</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#e9eef4;background:#0b0d10}body{max-width:980px;margin:0 auto;padding:48px 22px}header{border:1px solid #2a313a;border-radius:24px;padding:32px;background:#12161b}.eyebrow{font-family:ui-monospace,monospace;color:#8995a3}.score{font-size:86px;font-weight:800;margin:10px 0}.muted{color:#8995a3}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.metric{background:#12161b;border:1px solid #2a313a;border-radius:16px;padding:18px}.metric b{font-size:28px;display:block}section{margin-top:34px}li{margin:10px 0}code{font-family:ui-monospace,monospace;color:#c7d2fe}table{width:100%;border-collapse:collapse;background:#12161b;border-radius:16px;overflow:hidden}th,td{text-align:left;padding:12px;border-bottom:1px solid #252c34;vertical-align:top}.share{display:inline-block;margin-top:16px;padding:12px 16px;border:1px solid #3d4855;border-radius:12px;color:#fff;text-decoration:none}.note{padding:14px 16px;background:#101820;border-left:3px solid #68d391;border-radius:8px}@media(max-width:700px){.grid{grid-template-columns:1fr 1fr}.score{font-size:64px}table{font-size:12px}}
  </style></head><body><header><div class="eyebrow">AGENT PORTABILITY CHECK</div><h1>How portable is your AI setup?</h1><div class="score">${scoreText}${report.score === null ? '' : '<span class="muted" style="font-size:32px"> / 100</span>'}</div><div class="muted">V0.2 score = average portability of unique skills. It does not claim identical files guarantee identical model behavior.</div></header>
  <div class="grid"><div class="metric"><b>${report.totalSkills}</b>unique skills</div><div class="metric"><b>${report.crossHarnessSkills}</b>cross-harness</div><div class="metric"><b>${report.fullyPortableSkills}</b>fully portable</div><div class="metric"><b>${report.drift.length}</b>drifted</div></div>
  <section><h2>What stood out</h2><ul>${findingRows}</ul></section>
  <section><h2>How the score works</h2><p class="muted">Shared <code>.agents/skills</code> or identical copies across all three supported harnesses = 100%. Identical copies across two harnesses = 50%. One harness only or drifted same-name copies = 0%.</p></section>
  <section><h2>Skill portability</h2><table><thead><tr><th>Skill</th><th>Portability</th><th>Why</th><th>Copies found</th></tr></thead><tbody>${skillRows}</tbody></table></section>
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

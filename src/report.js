import fs from 'node:fs';
import path from 'node:path';

const REPO = 'github.com/Sakshambhutani/agent-portability-check';

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function agentPair(report) {
  return report.installedHarnesses.map(h => h.label).join(' ↔ ');
}

function displayShareHost(shareUrl) {
  try { return new URL(shareUrl).host; } catch { return REPO; }
}

export function createCardSvg(report, { shareUrl = '' } = {}) {
  const hasScore = report.global.score !== null;
  const scoreText = hasScore ? `${report.global.score}%` : 'NO SCORE YET';
  const subtitle = hasScore
    ? `${report.global.portableAcrossInstalled} / ${report.global.totalSkills} global skills portable across all detected agents`
    : `${report.installedHarnesses.length} agent detected · ${report.global.totalSkills} global skills`;
  const agents = report.installedHarnesses.length ? agentPair(report) : 'No supported agent detected';
  const finding = report.findings[0]?.text || 'No obvious portability issue found.';
  const shareLabel = shareUrl ? displayShareHost(shareUrl) : REPO;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0b0d10"/>
  <rect x="42" y="42" width="1116" height="546" rx="34" fill="#12161b" stroke="#2a313a"/>
  <text x="88" y="110" fill="#aab4c0" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="26">AGENT PORTABILITY CHECK</text>
  <text x="88" y="176" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="47">How portable is my AI setup?</text>
  <text x="88" y="305" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="98">${esc(scoreText)}</text>
  <text x="88" y="355" fill="#8995a3" font-family="Arial, Helvetica, sans-serif" font-size="24">${esc(agents)}</text>
  <text x="610" y="274" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="33">${esc(subtitle)}</text>
  <text x="610" y="330" fill="#c8d0d9" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="23">Shared-format: ${report.global.sharedFormatSkills} / ${report.global.totalSkills}</text>
  <text x="610" y="370" fill="#c8d0d9" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="23">Drifted: ${report.global.drift.length}</text>
  <text x="610" y="410" fill="#8995a3" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="21">Project skills: ${report.project.totalSkills}</text>
  <line x1="88" y1="445" x2="1112" y2="445" stroke="#2a313a"/>
  <text x="88" y="500" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="24">${esc(finding)}</text>
  <text x="88" y="552" fill="#68d391" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24">Check yours → ${esc(shareLabel)}</text>
</svg>`;
}

function skillRows(data) {
  if (!data.statuses.length) return '<tr><td colspan="4">No skills found.</td></tr>';
  return data.statuses.map(s => `<tr><td>${esc(s.name)}</td><td>${s.portableAcrossInstalled ? 'Yes' : 'No'}</td><td>${esc(s.reason)}</td><td>${s.copies.map(c => `<code>${esc(c.path)}</code>`).join('<br>')}</td></tr>`).join('');
}

function targetCompatibilityHtml(target) {
  if (!target) return '';
  const rows = target.skills.map(skill => {
    const deps = [
      ...(skill.dependencies?.commands || []).filter(item => item.needsSetup).map(item => `CLI: ${item.name}`),
      ...(skill.dependencies?.environment || []).filter(item => item.required && (item.available === false || item.needsCloudSecret)).map(item => `ENV: ${item.name}`),
      ...(skill.dependencies?.mcpServers || []).filter(item => !item.available).map(item => `MCP: ${item.name}`),
    ];
    return `<tr><td>${esc(skill.scope || 'global')}</td><td>${esc(skill.name)}</td><td>${esc(skill.status)}</td><td>${esc(skill.reason)}</td><td>${deps.length ? deps.map(esc).join('<br>') : '—'}</td></tr>`;
  }).join('');

  const context = target.contextRisks?.length
    ? `<ul>${target.contextRisks.map(risk => `<li><code>${esc(risk.path)}</code> — ${esc(risk.reason)}</li>`).join('')}</ul>`
    : '<p class="muted">No harness-specific context gaps detected.</p>';

  return `<section><h2>Target compatibility — ${esc(target.targetLabel)}</h2>
    <div class="grid">
      <div class="metric"><b>${target.summary.total}</b>skills checked</div>
      <div class="metric"><b>${target.summary.ready}</b>ready</div>
      <div class="metric"><b>${target.summary.autoFix}</b>auto-fix</div>
      <div class="metric"><b>${target.summary.manual}</b>manual</div>
    </div>
    <p class="muted">Runtime: ${esc(target.runtime || 'local')} · dependency blockers: ${target.dependencyRiskCount || 0} · context gaps: ${target.contextRisks?.length || 0}</p>
    <table><thead><tr><th>Scope</th><th>Skill</th><th>Status</th><th>Reason</th><th>Dependencies</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No skills found.</td></tr>'}</tbody></table>
    <h3>Context that may not carry over</h3>${context}
  </section>`;
}

export function createHtml(report, { shareUrl = '', targetCompatibility = null } = {}) {
  const findingRows = report.findings.map(f => `<li>${esc(f.text)}</li>`).join('');
  const installed = report.installedHarnesses.length
    ? report.installedHarnesses.map(h => `<li><strong>${esc(h.label)}</strong> — ${h.evidence.map(e => esc(e.type + ': ' + e.detail)).join('; ')}</li>`).join('')
    : '<li>No supported agent installation detected.</li>';
  const footprints = report.configFootprints.length
    ? report.configFootprints.map(f => `<li><code>${esc(f.path)}</code> — ${esc(f.label)} (${esc(f.scope)})</li>`).join('')
    : '<li>None found.</li>';
  const score = report.global.score === null ? 'N/A' : `${report.global.score}%`;
  const shareCta = shareUrl
    ? `<p><a class="share" href="${esc(shareUrl)}">Open share page →</a></p>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent Portability Check</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#e9eef4;background:#0b0d10}body{max-width:1000px;margin:0 auto;padding:48px 22px}header{border:1px solid #2a313a;border-radius:24px;padding:32px;background:#12161b}.eyebrow{font-family:ui-monospace,monospace;color:#8995a3}.score{font-size:78px;font-weight:800;margin:10px 0}.muted{color:#8995a3}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.metric{background:#12161b;border:1px solid #2a313a;border-radius:16px;padding:18px}.metric b{font-size:28px;display:block}section{margin-top:34px}li{margin:10px 0}code{font-family:ui-monospace,monospace;color:#c7d2fe}table{width:100%;border-collapse:collapse;background:#12161b;border-radius:16px;overflow:hidden}th,td{text-align:left;padding:12px;border-bottom:1px solid #252c34;vertical-align:top}.note{padding:14px 16px;background:#101820;border-left:3px solid #68d391;border-radius:8px}.share{display:inline-block;padding:12px 16px;border-radius:12px;background:#fff;color:#0b0d10;text-decoration:none;font-weight:700}@media(max-width:700px){.grid{grid-template-columns:1fr 1fr}.score{font-size:56px}table{font-size:12px}}
  </style></head><body><header><div class="eyebrow">AGENT PORTABILITY CHECK</div><h1>How portable is my AI setup?</h1><div class="score">${esc(score)}</div><div class="muted">Global score is shown only when at least two supported agents are detected.</div>${shareCta}</header>
  <section><h2>Agent tools detected</h2><ul>${installed}</ul><h3>Config footprints</h3><ul>${footprints}</ul></section>
  <div class="grid"><div class="metric"><b>${report.global.totalSkills}</b>global skills</div><div class="metric"><b>${report.global.portableAcrossInstalled}</b>across all agents</div><div class="metric"><b>${report.project.totalSkills}</b>project skills</div><div class="metric"><b>${report.global.drift.length + report.project.drift.length}</b>drifted</div></div>
  <section><h2>What stood out</h2><ul>${findingRows}</ul></section>\n  ${targetCompatibilityHtml(targetCompatibility)}\n  <section><h2>Global skills</h2><table><thead><tr><th>Skill</th><th>Across all detected agents?</th><th>Why</th><th>Copies</th></tr></thead><tbody>${skillRows(report.global)}</tbody></table></section>
  <section><h2>This project</h2><p class="muted"><code>${esc(report.cwd)}</code></p><table><thead><tr><th>Skill</th><th>Across all detected agents?</th><th>Why</th><th>Copies</th></tr></thead><tbody>${skillRows(report.project)}</tbody></table></section>
  <section><div class="note"><strong>Privacy:</strong> scan and report generation happen locally. Reports store paths and hashes, not instruction or skill contents.</div></section>
  </body></html>`;
}

export function writeReports(report, outputDir, { shareUrl = '', targetCompatibility = null } = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const htmlPath = path.join(outputDir, 'agent-portability-report.html');
  const svgPath = path.join(outputDir, 'agent-portability-card.svg');
  const jsonPath = path.join(outputDir, 'agent-portability-report.json');
  fs.writeFileSync(htmlPath, createHtml(report, { shareUrl, targetCompatibility }));
  fs.writeFileSync(svgPath, createCardSvg(report, { shareUrl }));
  fs.writeFileSync(jsonPath, JSON.stringify({ ...report, targetCompatibility }, null, 2));
  return { htmlPath, svgPath, jsonPath };
}

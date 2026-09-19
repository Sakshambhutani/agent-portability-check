#!/usr/bin/env node
import path from 'node:path';
import { scan } from './scan.js';
import { writeReports } from './report.js';

function parseArgs(argv) {
  const args = { cwd: process.cwd(), output: '.agent-portability', json: false, write: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--path' || a === '-p') && argv[i + 1]) args.cwd = path.resolve(argv[++i]);
    else if ((a === '--output' || a === '-o') && argv[i + 1]) args.output = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--no-write') args.write = false;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`\nAgent Portability Check\n\nUsage:\n  npx github:Sakshambhutani/agent-portability-check\n  agent-portability-check [options]\n\nOptions:\n  -p, --path <dir>     Project to scan (default: current directory)\n  -o, --output <dir>   Report folder (default: .agent-portability)\n      --json           Print the full report as JSON\n      --no-write       Do not write HTML/SVG/JSON files\n  -h, --help           Show help\n`);
}

function mark(found) { return found ? '✓' : '✕'; }
function findingIcon(level) {
  if (level === 'good') return '✓';
  if (level === 'high') return '✕';
  if (level === 'info') return '•';
  return '⚠';
}

function printInstalled(report) {
  const installed = new Map(report.installedHarnesses.map(h => [h.key, h]));
  console.log('\nAgent tools detected');
  for (const [key, label] of [['codex', 'Codex'], ['claude', 'Claude Code'], ['cursor', 'Cursor']]) {
    const item = installed.get(key);
    const detail = item ? ` (${item.evidence.map(e => e.type).join(', ')})` : '';
    console.log(`${mark(Boolean(item))} ${label}${detail}`);
  }
}

function printFootprints(report) {
  console.log('\nConfig footprints found');
  if (!report.configFootprints.length) {
    console.log('none');
    return;
  }
  const installed = new Set(report.installedHarnesses.map(h => h.key));
  for (const f of report.configFootprints) {
    const suffix = installed.has(f.key) ? '' : '  (config only; tool not detected)';
    console.log(`• ${f.path} — ${f.label}${suffix}`);
  }
}

function printScope(title, data, installedCount) {
  console.log(`\n${title}`);
  console.log(`Skills              ${data.totalSkills}`);
  console.log(`Shared-format       ${data.sharedFormatSkills} / ${data.totalSkills}`);
  if (installedCount >= 2) {
    console.log(`Across all agents   ${data.portableAcrossInstalled} / ${data.totalSkills}`);
    console.log(`Portability score   ${data.score === null ? 'N/A' : `${data.score}%`}`);
  } else {
    console.log('Cross-agent score   N/A (need at least 2 detected agents)');
  }
  console.log(`Drifted copies      ${data.drift.length}`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) { printHelp(); process.exit(0); }

const report = scan({ cwd: args.cwd });
if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('\nAgent Portability Check');
  console.log('────────────────────────────────────');
  console.log(`Current project      ${report.cwd}`);
  printInstalled(report);
  printFootprints(report);
  printScope('GLOBAL SETUP', report.global, report.installedHarnesses.length);
  printScope('THIS PROJECT', report.project, report.installedHarnesses.length);
  console.log('\nWhat stood out');
  for (const f of report.findings) console.log(`${findingIcon(f.level)} ${f.text}`);
}

if (args.write) {
  const out = path.resolve(args.cwd, args.output);
  const files = writeReports(report, out);
  if (!args.json) {
    console.log('\nShare card:  ' + files.svgPath);
    console.log('Full report: ' + files.htmlPath);
    console.log('\nNothing was uploaded. Scan + report generation happened locally.\n');
  }
}

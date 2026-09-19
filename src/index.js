#!/usr/bin/env node
import path from 'node:path';
import { scan } from './scan.js';
import { writeReports } from './report.js';

function parseArgs(argv) {
  const args = { cwd: process.cwd(), output: '.agent-portability', json: false, write: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--path' || a === '-p') && argv[i+1]) args.cwd = path.resolve(argv[++i]);
    else if ((a === '--output' || a === '-o') && argv[i+1]) args.output = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--no-write') args.write = false;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`\nAgent Portability Check\n\nUsage:\n  npx github:Sakshambhutani/agent-portability-check\n  agent-portability-check [options]\n\nOptions:\n  -p, --path <dir>     Project to scan (default: current directory)\n  -o, --output <dir>   Report folder (default: .agent-portability)\n      --json           Print the full report as JSON\n      --no-write       Do not write HTML/SVG/JSON files\n  -h, --help           Show help\n`);
}

function icon(level) {
  if (level === 'good') return '✓';
  if (level === 'high') return '✕';
  if (level === 'info') return '•';
  return '⚠';
}

const args = parseArgs(process.argv.slice(2));
if (args.help) { printHelp(); process.exit(0); }

const report = scan({ cwd: args.cwd });
if (args.json) console.log(JSON.stringify(report, null, 2));
else {
  const scoreText = report.score === null ? 'N/A' : `${report.score} / 100`;
  console.log('\nAgent Portability Check');
  console.log('────────────────────────────────────');
  console.log(`PORTABILITY SCORE   ${scoreText}`);
  console.log(`Harness footprints  ${report.activeHarnesses.join(', ') || 'none detected'}`);
  console.log(`Unique skills       ${report.totalSkills}`);
  console.log(`Cross-harness       ${report.crossHarnessSkills} / ${report.totalSkills}`);
  console.log(`Fully portable      ${report.fullyPortableSkills} / ${report.totalSkills}`);
  console.log(`Drifted copies      ${report.drift.length}`);
  console.log('');
  for (const f of report.findings) console.log(`${icon(f.level)} ${f.text}`);
  if (report.score !== null) {
    console.log('\nScore = average portability of your unique skills.');
    console.log('Shared .agents/skills = 100%; identical copies in 2 harnesses = 50%; one harness/drift = 0%.');
  }
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

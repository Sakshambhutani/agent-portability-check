#!/usr/bin/env node
import path from 'node:path';
import { scan } from './scan.js';
import { writeReports } from './report.js';
import { createShareInfo, normalizeReferralId } from './share.js';
import {
  buildScanTelemetry,
  captureTelemetry,
  ensureTelemetryPreference,
  getTelemetryStatus,
  setTelemetryPreference,
  telemetryDestinationConfigured,
} from './telemetry.js';

function parseArgs(argv) {
  const args = {
    cwd: process.cwd(),
    output: '.agent-portability',
    json: false,
    write: true,
    analytics: null,
    ref: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--path' || a === '-p') && argv[i + 1]) args.cwd = path.resolve(argv[++i]);
    else if ((a === '--output' || a === '-o') && argv[i + 1]) args.output = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--no-write') args.write = false;
    else if (a === '--analytics' && argv[i + 1]) args.analytics = argv[++i].toLowerCase();
    else if (a === '--ref' && argv[i + 1]) args.ref = normalizeReferralId(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`\nAgent Portability Check\n\nUsage:\n  npx github:Sakshambhutani/agent-portability-check\n  agent-portability-check [options]\n\nOptions:\n  -p, --path <dir>       Project to scan (default: current directory)\n  -o, --output <dir>     Report folder (default: .agent-portability)\n      --json             Print the full report as JSON\n      --no-write         Do not write HTML/SVG/JSON files\n      --analytics <mode> on | off | status\n      --ref <id>         Attribute this scan to a shared referral link\n  -h, --help             Show help\n`);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (args.analytics) {
    if (!['on', 'off', 'status'].includes(args.analytics)) {
      console.error('Invalid --analytics value. Use: on, off, or status.');
      process.exitCode = 1;
      return;
    }

    if (args.analytics === 'status') {
      console.log(`Anonymous usage analytics: ${getTelemetryStatus()}`);
      console.log(`Telemetry destination: ${telemetryDestinationConfigured() ? 'configured' : 'not configured'}`);
      return;
    }

    setTelemetryPreference(args.analytics === 'on');
    console.log(`Anonymous usage analytics preference: ${args.analytics}`);
    if (args.analytics === 'on' && !telemetryDestinationConfigured()) {
      console.log('Telemetry destination is not configured, so no events will be sent yet.');
    }
    return;
  }

  const report = scan({ cwd: args.cwd });
  const shareInfo = createShareInfo(report);

  let files = null;

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
    files = writeReports(report, out, { shareUrl: shareInfo?.url });
    if (!args.json) {
      console.log('\nShare card:  ' + files.svgPath);
      console.log('Full report: ' + files.htmlPath);
      if (shareInfo) console.log('Share link:   ' + shareInfo.url);
    }
  } else if (shareInfo && !args.json) {
    console.log('\nShare link:   ' + shareInfo.url);
  }

  const allowPrompt = !args.json && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const preference = await ensureTelemetryPreference({ allowPrompt });

  if (preference.enabled && telemetryDestinationConfigured()) {
    const baseProperties = buildScanTelemetry(report);
    if (args.ref) baseProperties.referral_id = args.ref;

    if (preference.justEnabled) {
      await captureTelemetry('apc_analytics_enabled', baseProperties);
    }

    await captureTelemetry('apc_scan_completed', baseProperties);

    if (args.ref) {
      await captureTelemetry('apc_referred_scan_completed', baseProperties);
    }

    if (files) {
      await captureTelemetry('apc_share_card_generated', baseProperties);
    }

    if (shareInfo) {
      await captureTelemetry('apc_share_link_generated', {
        ...baseProperties,
        referral_id: shareInfo.referralId,
      });
    }
  }

  if (!args.json) {
    console.log('\nScan contents and generated reports stay local.');
    if (telemetryDestinationConfigured()) {
      console.log(`Anonymous usage analytics: ${preference.enabled ? 'on' : 'off'}${preference.enabled ? ' (no skill names, paths, or contents)' : ''}.`);
      console.log('Change anytime with --analytics on|off.\n');
    } else {
      console.log('Anonymous usage analytics: not configured in this build.\n');
    }
  }
}

await main();

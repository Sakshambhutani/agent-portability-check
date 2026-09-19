#!/usr/bin/env node
import path from 'node:path';
import readline from 'node:readline/promises';
import { scan } from './scan.js';
import { writeReports } from './report.js';
import { createShareInfo, normalizeReferralId, normalizeTeamCode } from './share.js';
import { planPortableReadyFix, applyPortableReadyFix } from './fix.js';
import { analyzeTargetCompatibility, TARGETS } from './compatibility.js';
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
    fix: false,
    yes: false,
    target: null,
    runtime: 'local',
    team: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--path' || a === '-p') && argv[i + 1]) args.cwd = path.resolve(argv[++i]);
    else if ((a === '--output' || a === '-o') && argv[i + 1]) args.output = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--no-write') args.write = false;
    else if (a === '--analytics' && argv[i + 1]) args.analytics = argv[++i].toLowerCase();
    else if (a === '--ref' && argv[i + 1]) args.ref = normalizeReferralId(argv[++i]);
    else if (a === '--target' && argv[i + 1]) args.target = argv[++i].toLowerCase();
    else if (a === '--runtime' && argv[i + 1]) args.runtime = argv[++i].toLowerCase();
    else if (a === '--team' && argv[i + 1]) args.team = normalizeTeamCode(argv[++i]);
    else if (a === '--fix') args.fix = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`\nAgent Portability Check\n\nUsage:\n  npx github:Sakshambhutani/agent-portability-check\n  agent-portability-check [options]\n\nOptions:\n  -p, --path <dir>       Project to scan (default: current directory)\n  -o, --output <dir>     Report folder (default: .agent-portability)\n      --json             Print the full report as JSON\n      --no-write         Do not write HTML/SVG/JSON files\n      --analytics <mode> on | off | status\n      --ref <id>         Attribute this scan to a shared referral link\n      --target <agent>    Simulate migration to claude, codex, or cursor\n      --runtime <mode>    local (default) or cloud; cloud currently means Cursor Cloud\n      --team <code>       Attach an explicitly joined team invite to the result\n      --fix              Preview and apply safe portable-ready/target fixes\n  -y, --yes              Apply --fix without confirmation\n  -h, --help             Show help\n`);
}

function mark(found) { return found ? '✓' : '✕'; }

function findingIcon(level) {
  if (level === 'good') return '✓';
  if (level === 'high') return '✕';
  if (level === 'info') return '•';
  return '⚠';
}

function terminalLink(label, url) {
  if (!process.stdout.isTTY) return url;
  return `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;
}

function printShareLink(shareInfo) {
  if (!shareInfo) return;
  console.log('\nOpen share page: ' + terminalLink('CLICK HERE', shareInfo.url));
  console.log(shareInfo.url);
  if (process.platform === 'darwin') {
    console.log('Tip: in macOS Terminal, Command-click the URL if a normal click does not open it.');
  }
}

async function confirmFix() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('\nApply these changes? [y/N] ');
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function printFixPlan(plan, report) {
  const before = report.global.portableReadyPercent;
  console.log('\nPORTABLE-READY FIX');
  console.log('────────────────────────────────────');
  console.log(`Current global readiness  ${before === null ? 'N/A' : `${before}%`}`);
  console.log(`Skills to canonicalize  ${plan.copyPlans.length}`);
  console.log(`Claude adapters         ${plan.adapterPlans.length}`);
  console.log(`Conflicts needing review ${plan.conflicts.length}`);

  if (plan.copyPlans.length) {
    console.log('\nWill create shared-format copies (originals stay untouched):');
    for (const item of plan.copyPlans) console.log(`  + [${item.scope}] ${item.name} → ${item.targetDir}`);
  }

  if (plan.adapterPlans.length) {
    console.log('\nWill add Claude skill adapters:');
    for (const item of plan.adapterPlans) console.log(`  + [${item.scope}] ${item.name} → ${item.linkPath}`);
  }

  if (plan.conflicts.length) {
    console.log('\nWill NOT auto-fix these conflicts:');
    for (const item of plan.conflicts) console.log(`  ! [${item.scope || 'global'}] ${item.name}: ${item.reason}`);
  }

  console.log('\nSafety: no existing skill files are deleted or overwritten.');
}

function compatibilityIcon(status) {
  if (status === 'ready') return '✓';
  if (status === 'auto-fix') return '⚡';
  return '✕';
}

function printTargetCompatibility(result, { heading = 'TARGET COMPATIBILITY' } = {}) {
  if (!result) return;

  console.log(`\n${heading} — ${result.targetLabel}`);
  console.log('────────────────────────────────────');
  console.log(`Skills checked       ${result.summary.total}`);
  console.log(`Ready                ${result.summary.ready}`);
  console.log(`Auto-fix             ${result.summary.autoFix}`);
  console.log(`Manual attention     ${result.summary.manual}`);
  console.log(`Package-ready        ${result.readyPercent === null ? 'N/A' : `${result.readyPercent}%`}`);
  console.log(`Dependency blockers ${result.dependencyRiskCount || 0}`);
  console.log(`Context gaps         ${result.contextRisks?.length || 0}`);
  console.log(`Runtime              ${result.runtime || 'local'}`);
  if (!result.targetInstalled && result.runtime !== 'cloud') {
    console.log(`Mode                 migration simulation (target not installed)`);
  }

  if (result.skills.length) {
    console.log('');
    for (const skill of result.skills) {
      const label = skill.status === 'auto-fix'
        ? 'AUTO-FIX'
        : skill.status.toUpperCase();
      console.log(`${compatibilityIcon(skill.status)} ${skill.scope === 'project' ? '[project] ' : ''}${skill.name} — ${label}`);
      console.log(`  ${skill.reason}`);
      if (skill.fix) console.log(`  Fix: ${skill.fix}`);
    }
  }

  if (result.contextRisks?.length) {
    console.log('\nContext that will not automatically carry over');
    for (const risk of result.contextRisks) {
      console.log(`⚠ ${risk.path}`);
      console.log(`  ${risk.reason}`);
    }
  }

  if (result.localOnlyRisks?.length) {
    console.log('\nLocal-only / cloud portability risks');
    for (const risk of result.localOnlyRisks) {
      console.log(`⚠ ${risk.name}: ${risk.reason}`);
    }
  }
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
  console.log(`Portable-ready      ${data.portableReadySkills ?? 0} / ${data.totalSkills}`);
  console.log(`Readiness           ${data.portableReadyPercent === null ? 'N/A' : `${data.portableReadyPercent}%`}`);
  console.log(`Shared location     ${data.sharedFormatSkills} / ${data.totalSkills}`);
  if (installedCount >= 2) {
    console.log(`Across all agents   ${data.portableAcrossInstalled} / ${data.totalSkills}`);
    console.log(`Cross-agent score   ${data.score === null ? 'N/A' : `${data.score}%`}`);
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

  if (args.target && !TARGETS[args.target]) {
    console.error('Invalid --target value. Use: claude, codex, or cursor.');
    process.exitCode = 1;
    return;
  }
  if (!['local', 'cloud'].includes(args.runtime)) {
    console.error('Invalid --runtime value. Use: local or cloud.');
    process.exitCode = 1;
    return;
  }
  if (args.runtime === 'cloud' && args.target !== 'cursor') {
    console.error('--runtime cloud is currently supported only with --target cursor.');
    process.exitCode = 1;
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

  let report = scan({ cwd: args.cwd });
  let targetReport = args.target
    ? analyzeTargetCompatibility(report, args.target, { cwd: args.cwd, runtime: args.runtime })
    : null;
  let fixPlan = null;
  let fixApplied = false;

  if (args.fix) {
    const blockedSkillKeys = targetReport
      ? targetReport.skills
          .filter(skill => skill.status === 'manual')
          .map(skill => `${skill.scope || 'global'}:${skill.name}`)
      : [];

    fixPlan = planPortableReadyFix(report, {
      cwd: args.cwd,
      target: args.target,
      blockedSkillKeys,
    });
    printFixPlan(fixPlan, report);
    if (targetReport) printTargetCompatibility(targetReport, { heading: 'BEFORE FIX' });

    if (fixPlan.changeCount > 0) {
      const approved = args.yes || await confirmFix();
      if (approved) {
        applyPortableReadyFix(fixPlan);
        const before = report.global.portableReadyPercent;
        report = scan({ cwd: args.cwd });
        targetReport = args.target
          ? analyzeTargetCompatibility(report, args.target, { cwd: args.cwd, runtime: args.runtime })
          : null;
        const after = report.global.portableReadyPercent;
        fixApplied = true;

        console.log('\n✓ Fix applied');
        console.log(`Portable readiness   ${before === null ? 'N/A' : `${before}%`} → ${after === null ? 'N/A' : `${after}%`}`);
        if (targetReport) {
          printTargetCompatibility(targetReport, { heading: 'AFTER FIX' });
          if (targetReport.fullyReady) console.log(`🏆 ALL SKILLS + CONTEXT READY FOR ${targetReport.targetLabel.toUpperCase()}`);
        }
        if (after === 100) console.log('🏆 100% PORTABLE-READY');
      } else {
        console.log('\nNo changes applied.');
        if (!process.stdin.isTTY && !args.yes) {
          console.log('Run again with --fix --yes to apply in a non-interactive shell.');
        }
      }
    } else if (fixPlan.conflicts.length === 0) {
      console.log('\n✓ Nothing to change. Your global skills are already in shared format.');
    }
  }

  const shareInfo = createShareInfo(report, { targetCompatibility: targetReport, teamCode: args.team });

  let files = null;

  if (args.json) {
    console.log(JSON.stringify({
      ...report,
      targetCompatibility: targetReport,
    }, null, 2));
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
    if (targetReport && !args.fix) printTargetCompatibility(targetReport);
  }

  if (args.write) {
    const out = path.resolve(args.cwd, args.output);
    files = writeReports(report, out, { shareUrl: shareInfo?.url, targetCompatibility: targetReport });
    if (!args.json) {
      console.log('\nShare card:  ' + files.svgPath);
      console.log('Full report: ' + files.htmlPath);
      printShareLink(shareInfo);
    }
  } else if (shareInfo && !args.json) {
    printShareLink(shareInfo);
  }

  const allowPrompt = !args.json && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const preference = await ensureTelemetryPreference({ allowPrompt });

  if (preference.enabled && telemetryDestinationConfigured()) {
    const baseProperties = buildScanTelemetry(report);
    if (args.ref) baseProperties.referral_id = args.ref;
    if (targetReport) {
      const bucket = (value) => {
        if (value <= 0) return '0';
        if (value <= 5) return '1-5';
        if (value <= 10) return '6-10';
        if (value <= 25) return '11-25';
        return '26+';
      };
      baseProperties.target_agent = targetReport.target;
      baseProperties.target_ready_count_bucket = bucket(targetReport.summary.ready);
      baseProperties.target_auto_count_bucket = bucket(targetReport.summary.autoFix);
      baseProperties.target_manual_count_bucket = bucket(targetReport.summary.manual);\n      baseProperties.target_context_count_bucket = bucket(targetReport.contextRisks?.length || 0);\n      baseProperties.target_dependency_count_bucket = bucket(targetReport.dependencyRiskCount || 0);\n      baseProperties.target_runtime = targetReport.runtime || 'local';\n      baseProperties.target_complete = Boolean(targetReport.fullyReady);
    }

    if (args.fix && fixPlan) {
      await captureTelemetry('apc_fix_previewed', baseProperties);
      if (fixApplied) {
        await captureTelemetry('apc_fix_applied', baseProperties);
        if (report.global.portableReadyPercent === 100) {
          await captureTelemetry('apc_portable_ready_achieved', baseProperties);
        }
      }
    }

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

#!/usr/bin/env node
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { scan } from './scan.js';
import { writeReports } from './report.js';
import { publishShareResult, normalizeReferralId, normalizeTeamCode } from './share.js';
import { planPortableReadyFix, applyPortableReadyFix } from './fix.js';
import { analyzeAllCompatibility, analyzeTargetCompatibility, TARGETS } from './compatibility.js';
import { HARNESS_DEFINITIONS, HARNESS_ORDER, targetKeys } from './harnesses.js';
import { openBrowser } from './browser.js';
import {
  createSession,
  isAchievement,
  loadLatestSession,
  loadSession,
  saveSession,
  updateSession,
} from './session.js';
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
    publish: true,
    analytics: null,
    ref: '',
    fix: false,
    yes: false,
    target: null,
    all: false,
    runtime: 'local',
    team: '',
    resume: null,
    pathProvided: false,
    targetProvided: false,
    runtimeProvided: false,
    teamProvided: false,
    refProvided: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--path' || a === '-p') && argv[i + 1]) { args.cwd = path.resolve(argv[++i]); args.pathProvided = true; }
    else if ((a === '--output' || a === '-o') && argv[i + 1]) args.output = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--no-write') args.write = false;
    else if (a === '--no-publish') args.publish = false;
    else if (a === '--analytics' && argv[i + 1]) args.analytics = argv[++i].toLowerCase();
    else if (a === '--ref' && argv[i + 1]) { args.ref = normalizeReferralId(argv[++i]); args.refProvided = true; }
    else if (a === '--target' && argv[i + 1]) { args.target = argv[++i].toLowerCase(); args.targetProvided = true; }
    else if (a === '--all') { args.all = true; args.targetProvided = true; }
    else if (a === '--runtime' && argv[i + 1]) { args.runtime = argv[++i].toLowerCase(); args.runtimeProvided = true; }
    else if (a === '--team' && argv[i + 1]) { args.team = normalizeTeamCode(argv[++i]); args.teamProvided = true; }
    else if (a === '--resume') {
      args.resume = 'latest';
      if (argv[i + 1] && !argv[i + 1].startsWith('-')) args.resume = argv[++i];
    }
    else if (a === '--fix') args.fix = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`\nAgent Portability Check\n\nUsage:\n  npx github:Sakshambhutani/agent-portability-check\n  agent-portability-check [options]\n\nOptions:\n  -p, --path <dir>       Project to scan (default: current directory)\n  -o, --output <dir>     Report folder (default: .agent-portability)\n      --json             Print the full report as JSON\n      --no-write         Do not write HTML/SVG/JSON files\n      --no-publish       Do not create a public result URL\n      --analytics <mode> on | off | status\n      --ref <id>         Attribute this scan to a shared referral link\n      --target <agent>    ${targetKeys().join(' | ')}\n      --all               Check every supported local + cloud harness\n      --runtime <mode>    local (default) or cloud for supported cloud targets\n      --team <code>       Attach an explicitly joined team invite to the result\n      --resume [id]       Resume the latest (or named) local session\n      --fix              Preview and apply safe portable-ready/target fixes\n  -y, --yes              Apply --fix without confirmation\n  -h, --help             Show help\n`);
}

async function ask(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return '';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

function applySessionDefaults(args, session) {
  if (!args.pathProvided && session.cwd) args.cwd = session.cwd;
  if (!args.targetProvided && session.all) args.all = true;
  if (!args.targetProvided && session.target) args.target = session.target;
  if (!args.runtimeProvided && session.runtime) args.runtime = session.runtime;
  if (!args.teamProvided && session.team) args.team = session.team;
}

function progressLine(session) {
  const s = session.summary || {};
  if (session.all && s.allTargetsTotal != null) {
    return `${s.allTargetsReady ?? 0} / ${s.allTargetsTotal ?? 0} harness targets ready`;
  }
  if (session.target && s.targetTotal != null) {
    return `${s.targetReady ?? 0} / ${s.targetTotal ?? 0} ready for ${session.target}`;
  }
  return `${s.portableReady ?? 0} / ${s.totalSkills ?? 0} portable-ready`;
}

async function prepareResume(args) {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY && !args.json);
  let session = null;
  let resumed = false;
  let openedPrevious = false;

  if (args.resume) {
    session = loadSession(args.resume);
    if (!session) {
      console.error('No resumable Agent Portability session was found.');
      process.exitCode = 1;
      return { handled: true, session: null, resumed: false, openedPrevious: false };
    }
    applySessionDefaults(args, session);
    return { handled: false, session, resumed: true, openedPrevious: false };
  }

  const hasExplicitIntent =
    args.fix || args.targetProvided || args.all || args.teamProvided || args.refProvided || args.pathProvided;
  if (!interactive || hasExplicitIntent) {
    return { handled: false, session: null, resumed: false, openedPrevious: false };
  }

  const latest = loadLatestSession();
  if (!latest) return { handled: false, session: null, resumed: false, openedPrevious: false };

  console.log('\nWelcome back.');
  console.log(`Last check: ${progressLine(latest)}`);
  if (latest.target) console.log(`Target: ${latest.target}`);

  if (latest.achieved && latest.resultUrl) {
    const answer = (await ask('\n[O] Open trophy  [R] Rescan  [N] New check\nChoose: ')).toLowerCase();
    if (answer === 'o' || answer === '') {
      if (openBrowser(latest.resultUrl)) {
        console.log('Opening your previous achievement in the browser…');
        saveSession(updateSession(latest, { browserOpened: true, deferred: false }));
      } else {
        console.log('Could not open the browser automatically.');
        console.log(latest.resultUrl);
      }
      return { handled: true, session: latest, resumed: false, openedPrevious: true };
    }
    if (answer === 'r') {
      session = latest;
      resumed = true;
      applySessionDefaults(args, session);
    }
    return { handled: false, session, resumed, openedPrevious: false };
  }

  const answer = (await ask('\n[R] Resume  [V] View previous result  [N] New check\nChoose: ')).toLowerCase();
  if (answer === 'v' && latest.resultUrl) {
    if (openBrowser(latest.resultUrl)) {
      console.log('Opening your previous result in the browser…');
      saveSession(updateSession(latest, { browserOpened: true }));
    } else {
      console.log(latest.resultUrl);
    }
    return { handled: true, session: latest, resumed: false, openedPrevious: true };
  }
  if (answer === 'r' || answer === '') {
    session = latest;
    resumed = true;
    applySessionDefaults(args, session);
  }
  return { handled: false, session, resumed, openedPrevious: false };
}

function runSelf(sessionId, extraArgs = []) {
  const child = spawnSync(
    process.execPath,
    [process.argv[1], '--resume', sessionId, ...extraArgs],
    { stdio: 'inherit' },
  );
  if (typeof child.status === 'number' && child.status !== 0) process.exitCode = child.status;
}

async function chooseMigrationTarget() {
  const answer = (await ask(
    '\nTest migration to:\n' +
    '[1] Claude Code  [2] Codex  [3] Cursor  [4] Cursor Cloud\n' +
    '[5] Gemini CLI   [6] GitHub Copilot  [7] Copilot Cloud Agent\n' +
    '[8] OpenCode     [9] Roo Code  [Q] Cancel\nChoose: '
  )).toLowerCase();
  if (answer === '1' || answer === 'claude') return { target: 'claude', runtime: 'local' };
  if (answer === '2' || answer === 'codex') return { target: 'codex', runtime: 'local' };
  if (answer === '3' || answer === 'cursor') return { target: 'cursor', runtime: 'local' };
  if (answer === '4' || answer === 'cursor-cloud') return { target: 'cursor', runtime: 'cloud' };
  if (answer === '5' || answer === 'gemini') return { target: 'gemini', runtime: 'local' };
  if (answer === '6' || answer === 'copilot') return { target: 'copilot', runtime: 'local' };
  if (answer === '7' || answer === 'copilot-cloud') return { target: 'copilot', runtime: 'cloud' };
  if (answer === '8' || answer === 'opencode') return { target: 'opencode', runtime: 'local' };
  if (answer === '9' || answer === 'roo') return { target: 'roo', runtime: 'local' };
  return null;
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
  console.log(`Discovery adapters      ${plan.adapterPlans.length}`);
  console.log(`Conflicts needing review ${plan.conflicts.length}`);

  if (plan.copyPlans.length) {
    console.log('\nWill create shared-format copies (originals stay untouched):');
    for (const item of plan.copyPlans) console.log(`  + [${item.scope}] ${item.name} → ${item.targetDir}`);
  }

  if (plan.adapterPlans.length) {
    console.log('\nWill add target discovery adapters:');
    for (const item of plan.adapterPlans) console.log(`  + [${item.scope}] ${item.name} → ${item.linkPath}${item.label ? ` (${item.label})` : ''}`);
  }

  if (plan.conflicts.length) {
    console.log('\nWill NOT auto-fix these conflicts:');
    for (const item of plan.conflicts) console.log(`  ! [${item.scope || 'global'}] ${item.name}: ${item.reason}`);
  }

  console.log('\nSafety: no existing skill files are deleted or overwritten.');
}

function printManualReview(conflicts) {
  console.log('\nMANUAL REVIEW');
  console.log('────────────────────────────────────');
  for (const item of conflicts) {
    console.log(`! [${item.scope || 'global'}] ${item.name}`);
    console.log(`  ${item.reason}`);
  }
  console.log('\nFix these issues in the source skill package, then run the check again.');
  console.log('Nothing is changed automatically for manual issues.');
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

function printAllCompatibility(result, { heading = 'ALL-HARNESS COMPATIBILITY' } = {}) {
  if (!result) return;

  console.log('\n' + heading);
  console.log('──────────────────────────────────────────────────────────────────────────────');
  console.log('Target                         Ready      Auto   Manual  Context  Status');
  console.log('──────────────────────────────────────────────────────────────────────────────');

  for (const target of result.targets) {
    const ready = String(target.summary.ready) + '/' + String(target.summary.total);
    const status = target.skillPackagesReady ? '✓ READY' : target.summary.manual ? '✕ REVIEW' : '⚡ FIX';
    console.log(
      target.targetLabel.padEnd(30) +
      ready.padEnd(11) +
      String(target.summary.autoFix).padEnd(7) +
      String(target.summary.manual).padEnd(8) +
      String(target.contextRisks?.length || 0).padEnd(9) +
      status
    );
  }

  console.log('──────────────────────────────────────────────────────────────────────────────');
  console.log('Targets package-ready  ' + result.summary.targetsReady + ' / ' + result.summary.targets);
  console.log('Skills checked          ' + result.summary.totalSkills);
  console.log('Targets with context    ' + result.summary.contextGapTargets);

  const blockers = result.targets.flatMap(target =>
    target.skills
      .filter(skill => skill.status !== 'ready')
      .map(skill => ({
        target: target.targetLabel,
        scope: skill.scope,
        name: skill.name,
        status: skill.status,
        reason: skill.reason,
      }))
  );

  if (blockers.length) {
    console.log('\nWhat still needs work');
    for (const item of blockers.slice(0, 30)) {
      const icon = item.status === 'auto-fix' ? '⚡' : '✕';
      console.log(icon + ' ' + item.target + ' · ' + (item.scope === 'project' ? '[project] ' : '') + item.name);
      console.log('  ' + item.reason);
    }
    if (blockers.length > 30) {
      console.log('… ' + (blockers.length - 30) + ' more target-specific blocker(s) are in the JSON/HTML report.');
    }
  }

  if (result.summary.allSkillPackagesReady) {
    console.log('\n🏆 ALL SKILL PACKAGES READY ACROSS SUPPORTED HARNESSES');
    if (result.summary.contextGapTargets) {
      console.log('⚠ Context differences remain on ' + result.summary.contextGapTargets + ' target surface(s) and are shown separately.');
    }
  }
}


function printInstalled(report) {
  const installed = new Map(report.installedHarnesses.map(h => [h.key, h]));
  console.log('\nAgent tools detected');
  for (const key of HARNESS_ORDER) {
    const label = HARNESS_DEFINITIONS[key].label;
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
  if (data.managedSkillCount) {
    console.log(`Harness-managed    ${data.managedSkillCount} (excluded from readiness)`);
  }
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

  const resumeState = await prepareResume(args);
  if (resumeState.handled) return;
  let localSession = resumeState.session;
  const sessionResumed = resumeState.resumed;

  if (args.all && args.target) {
    console.error('Use either --all or --target, not both.');
    process.exitCode = 1;
    return;
  }
  if (args.all && args.runtimeProvided) {
    console.error('--all already checks all supported local and cloud surfaces; do not combine it with --runtime.');
    process.exitCode = 1;
    return;
  }

  if (args.target && !TARGETS[args.target]) {
    console.error(`Invalid --target value. Use: ${targetKeys().join(', ')}.`);
    process.exitCode = 1;
    return;
  }
  if (!['local', 'cloud'].includes(args.runtime)) {
    console.error('Invalid --runtime value. Use: local or cloud.');
    process.exitCode = 1;
    return;
  }
  if (args.runtime === 'cloud' && !TARGETS[args.target]?.cloud) {
    console.error('--runtime cloud is supported only for cloud-capable targets (currently Cursor and GitHub Copilot).');
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
  let allReport = args.all
    ? analyzeAllCompatibility(report, { cwd: args.cwd, includeCloud: true })
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
      targets: args.all ? targetKeys() : [],
      blockedSkillKeys: args.all ? [] : blockedSkillKeys,
    });
    printFixPlan(fixPlan, report);
    if (targetReport) printTargetCompatibility(targetReport, { heading: 'BEFORE FIX' });
    if (allReport) printAllCompatibility(allReport, { heading: 'BEFORE FIX — ALL HARNESSES' });

    if (fixPlan.changeCount > 0) {
      const approved = args.yes || await confirmFix();
      if (approved) {
        const before = report.global.portableReadyPercent;
        const beforeTargetReady = targetReport?.readyPercent ?? null;
        applyPortableReadyFix(fixPlan);
        report = scan({ cwd: args.cwd });
        targetReport = args.target
          ? analyzeTargetCompatibility(report, args.target, { cwd: args.cwd, runtime: args.runtime })
          : null;
        allReport = args.all
          ? analyzeAllCompatibility(report, { cwd: args.cwd, includeCloud: true })
          : null;
        const after = report.global.portableReadyPercent;
        fixApplied = true;

        console.log('\n✓ Fix applied');
        console.log(`Portable readiness   ${before === null ? 'N/A' : `${before}%`} → ${after === null ? 'N/A' : `${after}%`}`);
        if (targetReport) {
          console.log(`Target readiness     ${beforeTargetReady === null ? 'N/A' : `${beforeTargetReady}%`} → ${targetReport.readyPercent === null ? 'N/A' : `${targetReport.readyPercent}%`}`);
          printTargetCompatibility(targetReport, { heading: 'AFTER FIX' });
          if (targetReport.skillPackagesReady) {
            console.log(`🏆 ALL SKILL PACKAGES READY FOR ${targetReport.targetLabel.toUpperCase()}`);
            if (targetReport.contextRisks?.length) {
              console.log(`⚠ ${targetReport.contextRisks.length} context gap${targetReport.contextRisks.length === 1 ? '' : 's'} still shown separately.`);
            }
          }
        }
        if (allReport) printAllCompatibility(allReport, { heading: 'AFTER FIX — ALL HARNESSES' });
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

  const shareInfo = args.publish
    ? await publishShareResult(report, {
        targetCompatibility: targetReport,
        allCompatibility: allReport,
        teamCode: args.team,
      })
    : null;

  let files = null;

  if (args.json) {
    console.log(JSON.stringify({
      ...report,
      targetCompatibility: targetReport,
      allCompatibility: allReport,
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
    if (allReport && !args.fix) printAllCompatibility(allReport);
  }

  if (args.write) {
    const out = path.resolve(args.cwd, args.output);
    files = writeReports(report, out, {
      shareUrl: shareInfo?.url,
      targetCompatibility: targetReport,
      allCompatibility: allReport,
    });
    if (!args.json) {
      const cardLabel = (allReport ? allReport.summary.allSkillPackagesReady : isAchievement(report, targetReport))
        ? 'Local achievement card:'
        : 'Local diagnostic card:';
      console.log('\n' + cardLabel.padEnd(24) + files.svgPath);
      console.log('Local full report:       ' + files.htmlPath);
    }
  } else if (shareInfo && !args.json && !process.stdout.isTTY) {
    console.log('Result page: ' + shareInfo.url);
  }

  const achievedNow = allReport
    ? Boolean(allReport.summary.allSkillPackagesReady)
    : isAchievement(report, targetReport);
  if (shareInfo) {
    if (!localSession) {
      localSession = createSession({
        cwd: args.cwd,
        target: args.target,
        runtime: args.runtime,
        team: args.team,
        report,
        targetCompatibility: targetReport,
        allCompatibility: allReport,
        resultUrl: shareInfo.url,
        resultId: shareInfo.referralId,
      });
    } else {
      const resultChanged = localSession.resultUrl && localSession.resultUrl !== shareInfo.url;
      localSession = updateSession(localSession, {
        cwd: args.cwd,
        target: args.target,
        runtime: args.runtime,
        team: args.team,
        report,
        targetCompatibility: targetReport,
        allCompatibility: allReport,
        resultUrl: shareInfo.url,
        resultId: shareInfo.referralId,
        browserOpened: resultChanged ? false : localSession.browserOpened,
        deferred: false,
      });
    }
    saveSession(localSession);
  }

  let followUp = null;
  let resultOpenedFromCli = false;
  let deferredNow = false;
  let manualReviewedNow = false;
  let migrationTestSelectedNow = false;
  const interactive = !args.json && Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (interactive && shareInfo) {
    if (achievedNow) {
      console.log('\n🏆 Achievement unlocked.');
      console.log('Sharing is enabled because this result is now a defensible achievement.');
      const answer = (await ask('Open your achievement page in the browser? [Y/n] ')).toLowerCase();
      if (answer !== 'n' && answer !== 'no') {
        if (openBrowser(shareInfo.url)) {
          console.log('Opening your result…');
          resultOpenedFromCli = true;
          if (localSession) {
            localSession = updateSession(localSession, { browserOpened: true, deferred: false });
            saveSession(localSession);
          }
        } else {
          console.log('Could not open the browser automatically.');
          console.log(shareInfo.url);
        }
      } else {
        deferredNow = true;
        if (localSession) {
          localSession = updateSession(localSession, { deferred: true });
          saveSession(localSession);
        }
        console.log('\nYour trophy is saved locally. Reopen it later with:');
        console.log('npx github:Sakshambhutani/agent-portability-check --resume');
      }
    } else if (localSession) {
      const blockedSkillKeys = targetReport
        ? targetReport.skills
            .filter(skill => skill.status === 'manual')
            .map(skill => `${skill.scope || 'global'}:${skill.name}`)
        : [];
      const previewPlan = planPortableReadyFix(report, {
        cwd: args.cwd,
        target: args.target,
        targets: args.all ? targetKeys() : [],
        blockedSkillKeys: args.all ? [] : blockedSkillKeys,
      });

      console.log('\nNext step');
      console.log('────────────────────────────────────');
      const hasSafeFixes = previewPlan.changeCount > 0;
      const hasManualIssues = !hasSafeFixes && previewPlan.conflicts.length > 0;
      if (hasSafeFixes) {
        console.log(`I can safely improve ${previewPlan.changeCount} item${previewPlan.changeCount === 1 ? '' : 's'}.`);
        console.log('Original skills stay untouched and nothing is silently overwritten.');
      } else if (hasManualIssues) {
        console.log(`${previewPlan.conflicts.length} issue${previewPlan.conflicts.length === 1 ? '' : 's'} need manual attention.`);
        console.log('Automatic fixes are exhausted; review the exact blockers to keep moving toward an achievement.');
      } else {
        console.log('No automatic changes are needed right now.');
      }
      if (!args.target && !args.all && report.installedHarnesses.length === 1) {
        console.log('You can still test whether this setup is ready for Claude Code, Codex, Cursor, or Cursor Cloud.');
      }

      const actionPrompt = hasSafeFixes
        ? '\n[F] Fix now  [T] Test migration  [V] View diagnostic  [Q] Continue later\nChoose: '
        : hasManualIssues
          ? '\n[R] Review issues  [T] Test migration  [V] View diagnostic  [Q] Continue later\nChoose: '
          : '\n[T] Test migration  [V] View diagnostic  [Q] Continue later\nChoose: ';
      let answer = (await ask(actionPrompt)).toLowerCase();

      if (answer === 'r' && hasManualIssues) {
        printManualReview(previewPlan.conflicts);
        manualReviewedNow = true;
        answer = (await ask('\n[T] Test migration  [V] View diagnostic  [Q] Continue later\nChoose: ')).toLowerCase();
      }

      if (answer === 'f' && hasSafeFixes) {
        followUp = { type: 'spawn', args: ['--fix'] };
      } else if (answer === 't') {
        const choice = await chooseMigrationTarget();
        if (choice) {
          migrationTestSelectedNow = true;
          followUp = {
            type: 'spawn',
            args: ['--target', choice.target, '--runtime', choice.runtime],
          };
        }
      } else if (answer === 'v') {
        if (openBrowser(shareInfo.url)) {
          console.log('Opening your result…');
          resultOpenedFromCli = true;
          localSession = updateSession(localSession, { browserOpened: true });
          saveSession(localSession);
        } else {
          console.log(shareInfo.url);
        }
      } else {
        deferredNow = true;
        localSession = updateSession(localSession, { deferred: true });
        saveSession(localSession);
        console.log('\nContinue later with:');
        console.log('npx github:Sakshambhutani/agent-portability-check --resume');
      }
    } else if (!achievedNow && localSession) {
      deferredNow = true;
      console.log('\nContinue later with:');
      console.log('npx github:Sakshambhutani/agent-portability-check --resume');
    }
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
      baseProperties.target_manual_count_bucket = bucket(targetReport.summary.manual);
      baseProperties.target_context_count_bucket = bucket(targetReport.contextRisks?.length || 0);
      baseProperties.target_dependency_count_bucket = bucket(targetReport.dependencyRiskCount || 0);
      baseProperties.target_runtime = targetReport.runtime || 'local';
      baseProperties.target_complete = Boolean(targetReport.fullyReady);
    }
    if (allReport) {
      baseProperties.target_agent = 'all';
      baseProperties.target_runtime = 'all';
      baseProperties.target_complete = Boolean(allReport.summary.allSkillPackagesReady);
      baseProperties.target_ready_count_bucket = String(allReport.summary.targetsReady);
      baseProperties.target_manual_count_bucket = String(allReport.summary.manualTargets);
      baseProperties.target_context_count_bucket = String(allReport.summary.contextGapTargets);
    }

    if (sessionResumed) {
      await captureTelemetry('apc_cli_session_resumed', baseProperties);
    }
    if (resultOpenedFromCli) {
      await captureTelemetry('apc_cli_result_opened', baseProperties);
    }
    if (deferredNow) {
      await captureTelemetry('apc_cli_deferred', baseProperties);
    }
    if (manualReviewedNow) {
      await captureTelemetry('apc_manual_issues_reviewed', baseProperties);
    }
    if (migrationTestSelectedNow) {
      await captureTelemetry('apc_migration_test_selected', baseProperties);
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

  if (followUp?.type === 'spawn' && localSession) {
    runSelf(localSession.id, followUp.args);
  }
}

await main();

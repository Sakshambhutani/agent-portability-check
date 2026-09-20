import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

function root(home) {
  return path.join(home, '.agent-portability', 'sessions');
}

function latestPointer(home) {
  return path.join(root(home), 'latest');
}

function safeId(value) {
  return typeof value === 'string'
    ? value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
    : '';
}

export function newSessionId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function isAchievement(report, targetCompatibility = null, allCompatibility = null) {
  if (allCompatibility) return Boolean(allCompatibility.summary?.allSkillPackagesReady);
  if (targetCompatibility) return Boolean(targetCompatibility.skillPackagesReady ?? targetCompatibility.fullyReady);
  return Boolean(
    report?.global?.totalSkills > 0 &&
    report?.global?.portableReadyPercent === 100 &&
    (report?.global?.drift?.length || 0) === 0
  );
}

export function sessionSummary(report, targetCompatibility = null, allCompatibility = null) {
  return {
    totalSkills: report?.global?.totalSkills || 0,
    portableReady: report?.global?.portableReadySkills || 0,
    readinessPercent: report?.global?.portableReadyPercent ?? null,
    drift: report?.global?.drift?.length || 0,
    targetReady: targetCompatibility?.summary?.ready ?? null,
    targetTotal: targetCompatibility?.summary?.total ?? null,
    targetAuto: targetCompatibility?.summary?.autoFix ?? null,
    targetManual: targetCompatibility?.summary?.manual ?? null,
    targetContext: targetCompatibility?.contextRisks?.length ?? null,
    targetDependencies: targetCompatibility?.dependencyRiskCount ?? null,
    allTargetsReady: allCompatibility?.summary?.targetsReady ?? null,
    allTargetsTotal: allCompatibility?.summary?.targets ?? null,
    allManualTargets: allCompatibility?.summary?.manualTargets ?? null,
    allContextGapTargets: allCompatibility?.summary?.contextGapTargets ?? null,
  };
}

export function createSession({
  cwd,
  target = null,
  runtime = 'local',
  team = '',
  report,
  targetCompatibility = null,
  allCompatibility = null,
  resultUrl = '',
  resultId = '',
} = {}) {
  const now = new Date().toISOString();
  const achieved = isAchievement(report, targetCompatibility, allCompatibility);
  return {
    version: 2,
    id: newSessionId(),
    createdAt: now,
    updatedAt: now,
    cwd: path.resolve(cwd || process.cwd()),
    target: target || null,
    all: Boolean(allCompatibility),
    runtime: runtime === 'cloud' ? 'cloud' : 'local',
    team: safeId(team),
    status: achieved ? 'achieved' : 'scanned',
    achieved,
    browserOpened: false,
    deferred: false,
    resultUrl: resultUrl || '',
    resultId: safeId(resultId),
    summary: sessionSummary(report, targetCompatibility, allCompatibility),
  };
}

export function updateSession(session, {
  cwd,
  target,
  runtime,
  team,
  report,
  targetCompatibility,
  allCompatibility,
  resultUrl,
  resultId,
  browserOpened,
  deferred,
} = {}) {
  const achieved = report
    ? isAchievement(report, targetCompatibility || null, allCompatibility || null)
    : Boolean(session.achieved);

  return {
    ...session,
    updatedAt: new Date().toISOString(),
    cwd: cwd ? path.resolve(cwd) : session.cwd,
    target: target !== undefined ? (target || null) : session.target,
    all: allCompatibility !== undefined ? Boolean(allCompatibility) : Boolean(session.all),
    runtime: runtime ? (runtime === 'cloud' ? 'cloud' : 'local') : session.runtime,
    team: team !== undefined ? safeId(team) : session.team,
    status: achieved ? 'achieved' : 'scanned',
    achieved,
    browserOpened: browserOpened !== undefined ? Boolean(browserOpened) : session.browserOpened,
    deferred: deferred !== undefined ? Boolean(deferred) : session.deferred,
    resultUrl: resultUrl !== undefined ? resultUrl : session.resultUrl,
    resultId: resultId !== undefined ? safeId(resultId) : session.resultId,
    summary: report ? sessionSummary(report, targetCompatibility || null, allCompatibility || null) : session.summary,
  };
}

export function saveSession(session, { home = os.homedir() } = {}) {
  const dir = root(home);
  fs.mkdirSync(dir, { recursive: true });
  const id = safeId(session.id);
  if (!id) throw new Error('invalid_session_id');
  const file = path.join(dir, id + '.json');
  fs.writeFileSync(file, JSON.stringify({ ...session, id }, null, 2), { mode: 0o600 });
  fs.writeFileSync(latestPointer(home), id, { mode: 0o600 });
  return file;
}

export function loadSession(id, { home = os.homedir() } = {}) {
  let wanted = safeId(id);
  if (!wanted || wanted === 'latest') {
    try { wanted = safeId(fs.readFileSync(latestPointer(home), 'utf8').trim()); } catch { return null; }
  }
  if (!wanted) return null;
  try {
    const value = JSON.parse(fs.readFileSync(path.join(root(home), wanted + '.json'), 'utf8'));
    return value?.id === wanted ? value : null;
  } catch {
    return null;
  }
}

export function loadLatestSession({ home = os.homedir() } = {}) {
  return loadSession('latest', { home });
}

import { spawn } from 'node:child_process';

export function browserCommand(url, platform = process.platform) {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  return { command: 'xdg-open', args: [url] };
}

export function openBrowser(url, {
  platform = process.platform,
  spawnImpl = spawn,
} = {}) {
  if (!url || typeof url !== 'string') return false;
  const { command, args } = browserCommand(url, platform);
  try {
    const child = spawnImpl(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    if (typeof child?.unref === 'function') child.unref();
    return true;
  } catch {
    return false;
  }
}

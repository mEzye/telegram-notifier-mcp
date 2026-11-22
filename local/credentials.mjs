import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function loadCredentials() {
  const ps = join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const output = execFileSync(ps, ['-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference='Stop'; $c=Import-Clixml -LiteralPath (Join-Path $env:USERPROFILE '.telegram-notifier-mcp/bot-token.xml'); $c.GetNetworkCredential().Password | ConvertTo-Json -Compress"
  ], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const settings = JSON.parse(readFileSync(join(homedir(), '.telegram-notifier-mcp/settings.json'), 'utf8').replace(/^\uFEFF/, ''));
  return {token: JSON.parse(output.replace(/^\uFEFF/, '').trim()), chatId: String(settings.chatId)};
}

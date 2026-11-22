# Telegram Notifier MCP — Codex bridge

[mEzye's fork](https://github.com/mEzye/telegram-notifier-mcp) of
[AdeshAtole/telegram-notifier-mcp](https://github.com/AdeshAtole/telegram-notifier-mcp),
with a Telegram bridge for local Codex agents on Windows.

Agents send progress updates and results to Telegram. The owner uses **Reply** on
an agent's message, and the receiver routes the request to the exact Codex thread
that sent it.

## Features

- Send text, links, code snippets, documents, photos, video, and audio files.
- Bind outgoing messages to individual agents with `agentThreadId`.
- Deliver the owner's new text together with the original quoted message.
- Support multiple main agents and subagents, addressed by thread ID.
- Share one background inbox receiver across agents, with update journaling and duplicate-request protection.
- Create and archive chats using Telegram commands.
- Show delivery and completion reactions instead of separate forwarding notices.
- Load credentials through Windows DPAPI and run the receiver without a console window.
- Enable the [telegram-progress skill](skills/telegram-progress/SKILL.md) explicitly.

## Usage

1. Invoke `$telegram-progress` in the Codex thread you want to connect.
2. The agent sends a message with a one-word signature, such as `[Reword]`.
3. Use **Reply** on that message and enter your request.
4. The receiver queues the request for that thread. A busy agent handles it after its current work.

The coordinator passes skill activation to new and existing participating
subagents. Each agent uses its own signature and its own `CODEX_THREAD_ID`.
Independent threads enable the skill separately.

### Telegram commands

| Command | Behavior |
|---|---|
| `/new` | Create a blank chat in `D:/Assistant`. |
| `/new D:/Projects/MyApp` | Create a chat in the specified existing directory. |
| `/new "D:/My Project"` | Select a directory whose path contains spaces. |
| `/archive` in Reply | Archive the chat bound to the selected agent message. |
| `/archive UUID` | Archive the explicitly specified thread. |
| `/help` | Show commands and examples. |

After `/new`, the bot sends an introduction containing the new chat's directory
and ID. Reply to that introduction with its first task. History from the previous
thread is not copied.

Directories are not created automatically. Without a Reply target or UUID,
`/archive` asks you to select a chat. Archiving preserves history; ordinary
Replies do not reopen chats archived through the bot.

### Reactions

| Reaction | Meaning |
|---|---|
| 👀 | Codex accepted the message into the target thread's queue. |
| 👍 | The receiving agent finished handling the request and acknowledged completion. |

The receiver sets 👀 immediately after successful queue acceptance, without
waiting for the model's response. It does not prove the agent is already working.
The agent sets 👍 after completion. These reactions are separate from Telegram's
native read checkmarks.

## Requirements and installation

The current bridge targets **Windows**. It needs Node.js, PowerShell, Python with
`pythonw.exe` for the supervisor, and an authenticated Codex CLI with a local app
server. The tested setup uses Node.js 24 and Python 3.11.

```powershell
git clone https://github.com/mEzye/telegram-notifier-mcp.git D:/Assistant/telegram-notifier-mcp
cd D:/Assistant/telegram-notifier-mcp
npm ci
npm run build
npm test
```

These commands build the source. Bot credentials, MCP registration, and background
startup must be configured separately. The current scripts contain paths from the
installed setup; adapt them for another computer. Exact paths and the Windows task
are documented in [local/INSTALLATION.md](local/INSTALLATION.md).

### Bot credentials

Create a bot with [@BotFather](https://t.me/BotFather), send it `/start`, and
determine your private chat ID before starting the background receiver.

The local launcher reads two files from `%USERPROFILE%/.telegram-notifier-mcp/`:

| File | Contents |
|---|---|
| `bot-token.xml` | A PSCredential containing the token, encrypted with Windows DPAPI. |
| `settings.json` | A `chatId` field containing the owner's private chat ID as a string. |

Store the token from PowerShell without writing its plaintext into the repository:

```powershell
$stateDir = Join-Path $env:USERPROFILE '.telegram-notifier-mcp'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$botToken = Read-Host 'BotFather token' -AsSecureString
$botCredential = New-Object System.Management.Automation.PSCredential('telegram-bot', $botToken)
$botCredential | Export-Clixml -LiteralPath (Join-Path $stateDir 'bot-token.xml')
$ownerChatId = Read-Host 'Your private chat ID'
if ($ownerChatId -notmatch '^[1-9][0-9]*$') { throw 'An owner private chat ID is required' }
@{ chatId = $ownerChatId } | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $stateDir 'settings.json')
```

The DPAPI file is tied to the Windows account and computer. Run the receiver under
that same account.

### MCP and background receiver

Register the local launcher in Codex. For the installed setup:

```powershell
codex mcp add telegram-notifier -- D:/Assistant/.tools/node-v24.22.3-win-x64/node.exe D:/Assistant/telegram-notifier-mcp/local/launch.mjs
```

Open a new Codex session or restart the client to load the tools. Registering the
MCP server alone does not start background Telegram polling.

The receiver is `local/reply-router.mjs`; its supervisor is `local/run-router.py`.
In the configured installation, the Windows task `Codex-Telegram-Agent-Replies`
launches it through `pythonw.exe` at login. After adapting paths and credentials,
you can also start the receiver manually:

```powershell
node local/reply-router.mjs
```

Copy `skills/telegram-progress` into your Codex skills directory and adapt the
instruction paths. Its `allow_implicit_invocation: false` policy requires an
explicit `$telegram-progress` invocation or an activation handoff from a coordinator.

## MCP tools

| Tool | Purpose |
|---|---|
| `send_message` | Send text with optional formatting. |
| `send_document` | Send a file or document. |
| `send_photo` | Send an image. |
| `send_video` | Send a video file. |
| `send_audio` | Send an audio file. |
| `acknowledge_reply` | Acknowledge request state; `completed` sets 👍. |
| `get_updates` | Base manual polling; disabled by the local launcher while the receiver owns the inbox. |

On all five sending tools, an agent supplies `agentThreadId` equal to its own
`CODEX_THREAD_ID`. This binds the Telegram message ID to the thread; a visible
signature alone is not sufficient for routing.

To set 👍, the receiving agent calls `acknowledge_reply` with its
`agentThreadId`, the incoming `telegramMessageId`, and `stage: "completed"`.
The legacy `started` stage remains compatible but is no longer needed for
automatic 👀 reactions.

Running `build/index.js` directly uses `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID` environment variables. The configured Windows launcher,
`local/launch.mjs`, loads them from local files.
Running `npx telegram-notifier-mcp` uses the original author's npm package,
not this fork's bridge extensions.

## Architecture

- `src/`: MCP server, message-to-thread bindings, and reaction receipts.
- `local/`: receiver, chat commands, Codex client, supervisor, and tests.
- `skills/`: agent instructions.

The receiver uses the installed `codex app-server proxy` for chat lifecycle
operations and `codex queue --resume` for ordinary Replies. It opens no TCP
listener and starts no second app server. It does not override the thread's
model or execution permissions.

## Current limitations

- Incoming requests and commands are accepted only from the configured private-chat owner.
- The laptop must be awake, online, and able to reach Telegram and Codex.
- Messages without a saved thread binding cannot address an agent.
- Incoming voice messages and attachments without text do not start an agent.
- Outgoing messages have no durable retry queue.
- Ambiguous dispatch timeouts are not blindly replayed.
- The token, routes, journal, reaction receipts, and archive state are stored
  outside Git in `%USERPROFILE%/.telegram-notifier-mcp/`.

## Validation

```powershell
npm run build
npm test
```

Unit tests cover routing, owner validation, duplicate updates, reactions, and chat
commands. They do not send Telegram messages or start model tasks.

`node local/check.mjs` checks MCP connectivity. Adding `--send` also sends a
test notification to the configured chat.

## Attribution and license

Base messaging and media support come from
[AdeshAtole/telegram-notifier-mcp](https://github.com/AdeshAtole/telegram-notifier-mcp).
This fork adds Codex integration, chat lifecycle commands, and agent instructions.

License: MIT, as declared in [package.json](package.json).

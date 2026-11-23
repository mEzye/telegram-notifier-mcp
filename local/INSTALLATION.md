# Local installation

Upstream: https://github.com/AdeshAtole/telegram-notifier-mcp
Version: 1.3.1
Commit: 138a7b56082a6ea4a427ba5fcf9820d7045f3fd9

Dependencies were installed from the upstream lockfile, then updated to address npm security advisories. The local package manifest uses Zod 4.6.7; the local lockfile records the resolved dependencies. A local extension adds `agentThreadId` on the five sending tools, stores message-to-thread routes, and disables agent inbox polling in favor of one background Reply router.
Node.js 24.22.3 is installed in `D:/Assistant/.tools` and verified against the official SHA256 manifest.

Codex global MCP name: `telegram-notifier`.
Launch command: `D:/Assistant/.tools/node-v24.22.3-win-x64/node.exe D:/Assistant/telegram-notifier-mcp/local/launch.mjs`.

The launcher loads the token encrypted with Windows DPAPI from `%USERPROFILE%/.telegram-notifier-mcp/bot-token.xml` and the paired chat from `settings.json` in the same directory. The token can be decrypted only under the corresponding Windows account on this computer. No token is stored in this repository or in Codex configuration.

After installation, start a new Codex conversation or restart the app to load the added MCP server. Agent progress guidance is in `%USERPROFILE%/.codex/AGENTS.md`.

Smoke check: run the local Node executable with `local/check.mjs`. Adding `--send` sends a test notification to the paired chat.

The upstream sending tools still have no durable outbound queue. The local Reply router polls Telegram and uses the existing `codex queue --resume` command with an explicit local daemon socket to wake or queue input for the exact bound thread. A thread already owned by another live app server consumes its shared queue after its current work; the router reports that as waiting, not failure. Only the paired owner in the configured private chat is accepted. Every reply includes the new text and the original quoted message. Missing message bindings and deleted threads produce a Telegram explanation.

Router: `local/reply-router.mjs`; supervisor: `local/run-router.py` via `D:/Tools/Python311/pythonw.exe`. The Windows scheduled task `Codex-Telegram-Agent-Replies` launches it without a console at login and independently of the calling agent's process lifetime. To disable automatic startup, disable that task; to stop the current router, stop the task and its supervisor/Node processes. Do not run MCP `get_updates` alongside it. Reply bindings and deduplication journals are in `%USERPROFILE%/.telegram-notifier-mcp/`. Incoming attachments without text do not start an agent. An ambiguous dispatch is not automatically retried.

Receipt reactions: the router adds 👀 immediately after Codex accepts the incoming message into the target thread's queue. Successful forwarding and waiting no longer generate text acknowledgments. The receiving agent calls `acknowledge_reply` (or `local/ack-reply.mjs`) with its own thread ID and `completed` after answering, which changes 👀 to 👍. The legacy `started` call remains compatible. Bindings and stages are checked against `reply-receipts/` in the state directory; stage updates cannot regress a completed receipt. Failed eyes reactions are retried independently without duplicating the queued request. Ordinary Bot API read checkmarks cannot be controlled; 👀 means received/queued, not that the agent is already working.

The single inbox reader is protected by `proper-lockfile` with a heartbeat and a 30-second stale-lock window. This avoids abandoned named-pipe handles preventing a receiver restart. Scheduler actions use Python's windowless runtime and launch Node without a console.

Chat commands: `/new` creates a blank thread in `D:/Assistant`; `/new <existing absolute folder>` selects another working directory. `/archive` in Reply archives the bound thread, and `/archive <UUID>` accepts an explicit target. `/help` lists syntax. Commands are owner-only and journaled to prevent duplicate lifecycle operations on redelivery. Missing directories do not get created implicitly. Bot-archived threads have local tombstones preventing ordinary Replies from reopening them.

`local/codex-client.mjs` uses the `ws` library over the installed `codex app-server proxy` transport (a WebSocket stream over stdin/stdout) to call the existing local daemon. It opens no TCP listener and starts no second app server. New Telegram threads explicitly use `sandbox: "danger-full-access"` and `approvalPolicy: "never"`; the model is inherited. Ordinary Replies preserve the target thread's settings. Tests create and archive temporary empty threads without starting model turns.

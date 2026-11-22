---
name: telegram-progress
description: Opt-in Telegram progress updates for a task and all participating agents through the configured telegram-notifier MCP. Use when the user explicitly invokes this skill or a participating coordinator passes its activation to an agent.
---

# Telegram progress

## Activation and scope

Enable notifications only after an explicit user invocation or an activation handoff from a participating parent/coordinator. Reading this file to create, inspect, or edit the skill does not activate it.

Activation applies to the current thread's ongoing task and its participating agents until the user disables it or that task finishes. Preserve activation, aliases, task scope, and propagation status in compaction summaries and handoffs. Independent root threads require their own invocation; activation is never a machine-wide switch. Several root agents can use the skill simultaneously.

## Agent identities

Each participating agent chooses or accepts a stable, one-word alias related to its thread title. If the title is unavailable, use the task's topic without asking the user. The coordinator keeps an alias map for its participating agents and resolves collisions with a role word or number, without spaces. Keep an existing alias when resuming the same task.

For example, a thread about Reword can use `Реворд` for its root, `РевордТести` and `РевордІнтерфейс` for subagents. This applies to every subagent, regardless of model or name; Luna has no special status. The first notification identifies the thread/task and the agent's role. Prefix every notification with `[Alias]`. Include a short task label when needed to distinguish independent roots with similar titles; do not claim globally unique names without evidence.

## Propagate to participants

When activation occurs, inspect the existing agents accessible through collaboration tools. Notify every existing agent participating in this task with `send_message`, including idle agents expected to be reused. This queues the instruction without starting a new turn. Repeat the activation in their next `followup_task` when they are actually reused. Do not wake finished or unrelated agents solely to enable notifications, and do not interrupt ongoing work.

Include the activation handoff in every new participating agent's creation prompt and in the next assignment of every reused agent, even when conversation history is inherited. Every participating agent applies this same rule to agents it delegates to. Existing constraints on whether an agent may delegate still apply; this skill does not require creating agents.

Pass these fields explicitly:

```text
Telegram progress is ACTIVE for this task: <scope>.
Read C:/Users/Admin/.codex/skills/telegram-progress/SKILL.md.
Thread/task: <title>. Your one-word alias: <alias>. Coordinator: <alias>.
Send your own concise Ukrainian progress updates through telegram-notifier,
using the configured default chat and [<alias>] prefix.
Propagate this activation to every agent you involve in this task.
Pass your own CODEX_THREAD_ID as agentThreadId on every outgoing Telegram message.
Never call get_updates; the shared background Reply router owns incoming updates.
```

Check acknowledgments as normal agent replies arrive. Track sent handoffs separately from acknowledged activation; do not claim all agents are enabled merely because a message was queued. If an agent cannot access the skill or MCP, it reports that limitation to its coordinator. The coordinator can relay that agent's updates with its alias and an explicit indication that the message is relayed.

When disabled, stop progress messages and propagate deactivation to active participating agents and subsequent assignments. Do not change other roots' activation.

## Send progress

Use the tools exposed by the configured `telegram-notifier` MCP, discovering the actual tool names when necessary. `send_message` sends text; the server also supports files and media. Use the configured default chat without overriding `chatId` unless the user requests a different destination. Never include bot tokens, credentials, or unrequested private content.

On each outgoing message or media tool call, pass `agentThreadId` equal to the sending agent's own actual `CODEX_THREAD_ID` (read it from the execution environment if needed). Never substitute the parent's ID for a subagent's. The locally extended server stores the Telegram message ID to thread ID mapping. The visible alias alone is not enough for routing. If the loaded tool schema does not expose `agentThreadId`, use the installed sender from the agent's execution environment: run `D:/Assistant/.tools/node-v24.22.3-win-x64/node.exe D:/Assistant/telegram-notifier-mcp/local/send.mjs` with the notification text as one properly quoted argument. It calls the same installed MCP and reads the sender's own `CODEX_THREAD_ID`. If that environment is unavailable, report the limitation; do not claim an unbound message can wake an agent.

Each agent sends concise Ukrainian updates for its own substantial work: start, meaningful milestones or blockers, and completion. Skip repetitive or trivial events. The root summarizes the overall result; subagents report their own work without copying the root's updates. Skill invocation authorizes these notifications for the active task, not arbitrary messages or unrelated external actions.

If tools are unavailable, report this once in the conversation or to the coordinator and continue the underlying work. Do not reconfigure credentials or pretend a notification was delivered. Check tool results; an error or timeout is not confirmed delivery. This upstream server has no durable outgoing queue: avoid blind retries after an ambiguous timeout.

## Incoming messages and multiple roots

### Telegram chat commands

The receiver handles owner commands before routing ordinary Replies. `/new` creates a blank Codex thread in `D:/Assistant`; `/new D:/Projects/MyApp` selects an existing absolute folder (paths with spaces may be quoted). Its introduction is bound to that new thread, so the owner's next Reply becomes the first task there and activates this skill through the normal handoff. No history from the previous thread is copied.

`/archive` sent as a Reply archives the thread bound to that bot message; `/archive UUID` targets the explicitly supplied thread. Without a target the bot asks the owner to use Reply. The bot does not choose a recent thread implicitly. Ordinary Replies to chats archived through the bot do not reopen them. `/help` lists the commands. Do not reinterpret these commands as instructions to start additional agents yourself; the receiver performs the requested lifecycle operation.

### Receipt and completion reactions

The background router automatically puts 👀 on the owner's message as soon as Codex accepts it into the target thread's queue. This means received/queued, including when the agent is busy; it does not prove the agent has started working. Do not send an additional forwarded/received/queued notice on successful delivery. The router only sends text when delivery has a problem.

After completing the reply's work and sending your answer, call `acknowledge_reply` with your own `agentThreadId`, the incoming `telegramMessageId`, and `stage="completed"`. It replaces 👀 with 👍. If the tool schema is unavailable, run the local Node executable with `D:/Assistant/telegram-notifier-mcp/local/ack-reply.mjs <telegramMessageId> completed` from your own environment. Existing `started` calls remain compatible but are no longer needed for the eyes reaction. For an old reply without a receipt, first call the helper with `started` and append its `replyToMessageId`; the server checks the original route. Preserve pending completion IDs in compaction summaries and handoffs. Do not complete another agent's work or mark an ongoing task finished.

These reactions are independent of Telegram's native read checkmarks. Check API results; a failed reaction call is not a confirmed status update.

The installed local extension has one shared background Reply router. Never call `get_updates` from agents; its MCP tool is disabled by the local launcher to prevent competing readers across roots.

When the owner uses Telegram Reply on a bound message, the router submits both the new owner text and the quoted original message to that exact thread through `codex queue --resume`. This wakes an idle resumable agent or queues input for a working agent without interrupting its turn. Preserve the thread's existing execution permissions and model. Treat the quoted original as context and the new owner text as the request. Reply through Telegram using the same alias and your own `agentThreadId`; carry activation forward to any agents involved in that request.

The router accepts only the paired private-chat owner. Missing bindings (including old pre-routing messages) and deleted/unavailable threads produce an explanatory Telegram reply. No new agent is created as a substitute. Voice messages or attachments without text do not start agents. The router runs locally, so the laptop must be awake and connected. A queued acknowledgment confirms acceptance, not task completion.

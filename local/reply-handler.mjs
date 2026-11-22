import {parseCommand,handleChatCommand} from './chat-commands.mjs';

export function replyContext(message, route) {
  return [
    `Telegram Reply from the configured owner to agent [${route.alias}].`,
    'Read C:/Users/Admin/.codex/skills/telegram-progress/SKILL.md. Telegram progress is ACTIVE for this reply task.',
    `Keep your alias [${route.alias}]. Send your answer through telegram-notifier with agentThreadId set to your own CODEX_THREAD_ID.`,
    `The router marks accepted delivery with 👀 automatically. Do not send a separate received/forwarded notice. After completing and sending your answer, run the local Node executable with D:/Assistant/telegram-notifier-mcp/local/ack-reply.mjs ${message.message_id} completed. Never mark another agent's work completed.`,
    'The original message below is quoted context; the new owner message is the request.',
    JSON.stringify({
      telegramMessageId: message.message_id,
      replyToMessageId: message.reply_to_message.message_id,
      originalMessage: message.reply_to_message.text ?? message.reply_to_message.caption ?? route.text,
      originalMedia: message.reply_to_message.document?.file_name ?? (message.reply_to_message.photo ? 'photo' : null),
      ownerMessage: message.text ?? message.caption ?? '',
    }, null, 2)
  ].join('\n');
}

export async function handleUpdate(update, deps) {
  const m = update.message;
  if (!m || m.chat?.type !== 'private' || String(m.chat.id) !== deps.chatId || String(m.from?.id) !== deps.chatId || m.from?.is_bot) return;
  const command=parseCommand(m.text,deps.botUsername);
  if(command){await handleChatCommand(update,deps,command);return;}
  const previous = await deps.readJournal(update.update_id);
  if (previous) {
    if (previous.receiptPending) {
      await deps.markReceived(m.message_id, previous.threadId);
      await deps.writeJournal(update.update_id, {...previous, receiptPending: false});
    }
    if (previous.status === 'dispatching') {
      await deps.notify(m, 'Не можу підтвердити доставку попередньої відповіді після перезапуску. Автоматично повторно агента не запускаю.');
      await deps.writeJournal(update.update_id, {status: 'uncertain'});
    }
    return;
  }
  const finish = async (text, route) => {
    await deps.writeJournal(update.update_id, {status: 'handled'});
    await deps.notify(m, text, route);
  };
  if (!m.reply_to_message) {
    await finish('Щоб звернутися до агента, натисни «Відповісти» на його повідомленні та напиши свій текст.');
    return;
  }
  if (m.reply_to_message.from?.id !== deps.botId) {
    await finish('Це не повідомлення цього бота. Вибери повідомлення потрібного агента.');
    return;
  }
  const route = await deps.loadRoute(deps.chatId, m.reply_to_message.message_id);
  if (!route) {
    await finish('Агента для цього повідомлення не знайдено. Старі повідомлення без прив’язки не можуть запускати агентів.');
    return;
  }
  if(await deps.isArchived?.(route.threadId)){
    await finish(`[${route.alias}] Цей чат архівований. Створи новий командою /new.`);
    return;
  }
  if (!(m.text ?? m.caption)?.trim()) {
    await finish('Для запуску агента додай текст до відповіді. Голосові та вкладення без тексту поки не підтримуються.', route);
    return;
  }
  await deps.registerReceipt(m.message_id, route.threadId, m.reply_to_message.message_id);
  await deps.writeJournal(update.update_id, {status: 'dispatching', threadId: route.threadId});
  const result = await deps.dispatch(route.threadId, replyContext(m, route));
  const delivered = ['accepted', 'waiting', 'queued'].includes(result.status);
  const record = {status: result.status, threadId: route.threadId, receiptPending: delivered};
  await deps.writeJournal(update.update_id, record);
  if (delivered) {
    await deps.markReceived(m.message_id, route.threadId);
    await deps.writeJournal(update.update_id, {...record, receiptPending: false});
  }
  if (result.status === 'accepted' || result.status === 'waiting') return;
  const labels = {
    missing: `Агент [${route.alias}] більше не існує або його тред видалено.`,
    queued: `Відповідь збережено для [${route.alias}], але Codex не зміг запустити агента.`,
    unavailable: `Агент [${route.alias}] зараз недоступний. Codex не прийняв відповідь.`,
    uncertain: `Не можу підтвердити, чи Codex прийняв відповідь для [${route.alias}]. Автоматично повторно її не надсилаю.`,
  };
  await deps.notify(m, labels[result.status] ?? labels.unavailable, route);
}

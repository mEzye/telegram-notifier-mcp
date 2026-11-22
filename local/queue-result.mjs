export function classifyQueueResult(code, output, errors) {
  if (code === 0 && /Queued message/i.test(output)) {
    if (/already has an active writer/i.test(errors)) return 'waiting';
    return /could not resume|warning.*queued/i.test(errors) ? 'queued' : 'accepted';
  }
  if (/no rollout found|no active session found|thread.*(?:not found|does not exist|deleted)/i.test(errors)) return 'missing';
  return 'unavailable';
}

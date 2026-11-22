"""Keep the Telegram receiver running without a console or agent-owned process lifetime."""
import datetime
import os
from pathlib import Path
import subprocess
import time

state = Path.home() / '.telegram-notifier-mcp'
state.mkdir(exist_ok=True)
with (state / 'reply-supervisor.log').open('a', encoding='utf-8') as log:
    log.write(f'{datetime.datetime.now().isoformat()} supervisor started pid={os.getpid()}\n')
while True:
    try:
        with (state / 'reply-worker-stderr.log').open('a', encoding='utf-8') as errors:
            result = subprocess.run(
                ['D:/Assistant/.tools/node-v24.22.3-win-x64/node.exe',
                 'D:/Assistant/telegram-notifier-mcp/local/reply-router.mjs'],
                cwd='D:/Assistant/telegram-notifier-mcp',
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=errors,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
        if result.returncode == 0:
            break
    except OSError as error:
        with (state / 'reply-supervisor.log').open('a', encoding='utf-8') as log:
            log.write(f'{datetime.datetime.now().isoformat()} router start failed ({error}); retrying\n')
    time.sleep(10)

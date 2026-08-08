import { onCommandMessage } from '../bridge/runtime'
import { handleSeekCommand, type SeekCommand } from '../handlers/commands'
import { auditEvent } from '../debug/seekAudit'

export function setupCommandRouting(
  getVideo: () => HTMLVideoElement | null,
  isTyping: () => boolean,
  log: (kind: string, data?: unknown) => void
): () => void {
  return onCommandMessage(async (command) => {
    const typing = isTyping();
    const video = getVideo();
    auditEvent('command-received', { command, typing, hasVideo: !!video }, 'warn');
    log('status', { status: 'command', command });
    if (typing) return;
    if (!video) return;
    if (isSeekCommand(command)) {
      handleSeekCommand(video, command);
    }
  });
}

function isSeekCommand(cmd: string): cmd is SeekCommand {
  return (
    cmd === 'seek-backward-60' ||
    cmd === 'seek-backward-10' ||
    cmd === 'seek-forward-60' ||
    cmd === 'seek-forward-10'
  );
}

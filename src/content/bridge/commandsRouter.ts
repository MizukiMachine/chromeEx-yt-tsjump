import { onCommandMessage } from '../bridge/runtime'
import { handleSeekCommand, type SeekCommand } from '../handlers/commands'

export function setupCommandRouting(
  getVideo: () => HTMLVideoElement | null,
  isTyping: () => boolean,
  log: (kind: string, data?: unknown) => void
): () => void {
  return onCommandMessage(async (command) => {
    log('status', { status: 'command', command });
    if (isTyping()) return;
    const video = getVideo();
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


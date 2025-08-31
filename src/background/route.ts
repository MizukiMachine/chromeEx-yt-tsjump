/**
 * Command routing for frames
 * タブごとに動画のあるframeIdを記録
 */

export type StatusKind = 'ready' | 'video-found' | 'video-lost' | 'error';

type TabId = number;
type FrameId = number;

const map = new Map<TabId, FrameId>();

export function updateStatus(tabId: TabId | undefined, frameId: FrameId | undefined, status: StatusKind): void {
  if (tabId == null || frameId == null) return;
  if (status === 'video-found') {
    map.set(tabId, frameId);
    return;
  }
  if (status === 'video-lost') {
    // 登録済みと同じframeなら解除
    const cur = map.get(tabId);
    if (cur === frameId) map.delete(tabId);
  }
}

export function pickFrame(tabId: TabId): FrameId | undefined {
  return map.get(tabId);
}

export function clearTab(tabId: TabId): void {
  map.delete(tabId);
}

export function _debugDump(): Array<{ tabId: number; frameId: number }> {
  return Array.from(map.entries()).map(([t, f]) => ({ tabId: t, frameId: f }));
}


/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// コンテンツの依存をモック
const handleSeekMock = vi.fn();
vi.mock('../src/content/handlers/commands', () => ({
  handleSeekCommand: (...args: any[]) => handleSeekMock(...args),
}));

vi.mock('../src/content/dom/video', () => ({
  observeVideo: (cb: any) => {
    // シンプルなvideoを作成
    const v = document.createElement('video') as HTMLVideoElement;
    Object.defineProperty(v, 'duration', { value: 100, configurable: true });
    Object.defineProperty(v, 'currentTime', { value: 10, writable: true, configurable: true });
    Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
    // 直ちに既存通知
    cb(v, 'existing');
    return { disconnect() {}, getCurrent() { return v; } };
  },
}));

declare global { var chrome: any }

beforeEach(() => {
  // chromeモック
  global.chrome = {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  };
  handleSeekMock.mockReset();
});

describe('content/index wiring', () => {
  it('COMMAND受信でhandleSeekCommandが呼ばれる', async () => {
    let listener: any;
    chrome.runtime.onMessage.addListener.mockImplementation((fn: any) => { listener = fn; });

    // モジュールを読み込むと初期化が走る
    await import('../src/content/index');

    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);

    // COMMANDを投げる
    const sendResponse = vi.fn();
    await listener({ type: 'COMMAND', command: 'seek-forward-10' }, {}, sendResponse);

    // videoとコマンドが渡される
    expect(handleSeekMock).toHaveBeenCalledTimes(1);
    const args = handleSeekMock.mock.calls[0];
    expect(args[1]).toBe('seek-forward-10');

    // ステータスメッセージも送られているはず
    const sent = chrome.runtime.sendMessage.mock.calls.map((c: any[]) => c[0]);
    expect(sent.some((m: any) => m && m.type === 'STATUS' && m.status === 'ready')).toBe(true);
  });
});


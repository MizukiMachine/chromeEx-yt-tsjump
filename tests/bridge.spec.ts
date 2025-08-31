/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onCommandMessage, sendStatusToBackground } from '../src/content/bridge/runtime';

declare global {
  // 最低限のchrome型を宣言
  // 実体はテスト内でモック
  // 省略しても動くが型エラーを避ける
  // 日本語コメントに句点は使わない
  // eslint-disable-next-line no-var
  var chrome: any;
}

beforeEach(() => {
  // chrome.runtime の最小モックを用意
  global.chrome = {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('onCommandMessage', () => {
  it('有効なCOMMANDだけハンドラを呼ぶ', async () => {
    // addListenerに渡された実体を取り出すための入れ物
    let registered: any = null;
    chrome.runtime.onMessage.addListener.mockImplementation((fn: any) => {
      registered = fn;
    });

    const handler = vi.fn();
    const dispose = onCommandMessage(handler);

    // 無効メッセージは無視
    await registered(
      { type: 'DEBUG', payload: 1 },
      {},
      vi.fn()
    );
    expect(handler).not.toHaveBeenCalled();

    // 有効なCOMMANDは呼ばれる
    const sendResponse = vi.fn();
    await registered(
      { type: 'COMMAND', command: 'seek-forward-10', timestamp: 123 },
      {},
      sendResponse
    );
    expect(handler).toHaveBeenCalledTimes(1);
    // レスポンスが返ること
    expect(sendResponse).toHaveBeenCalledWith({ received: true, result: 'success' });

    // クリーンアップが呼べること
    dispose();
    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
  });
});

describe('sendStatusToBackground', () => {
  it('STATUSメッセージを送信する', async () => {
    await sendStatusToBackground('ready', { note: 'test' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'STATUS',
      status: 'ready',
      details: { note: 'test' },
    });
  });
});


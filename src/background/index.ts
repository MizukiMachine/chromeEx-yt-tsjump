/**
 * Background Service Worker
 * Chrome拡張機能のバックグラウンドで常駐するスクリプト
 * 主な役割：キーボードショートカットを受け取ってコンテンツスクリプトに転送
 */

// キーボードショートカットのコマンドを監視
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[Background] Command received:', command);

  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.id) {
      console.warn('[Background] No active tab to send');
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'COMMAND', command });
      console.log('[Background] Message sent to tab', tab.id);
    } catch (err) {
      console.error('[Background] sendMessage failed', err);
    }
  } catch (e) {
    console.error('[Background] tabs.query failed', e);
  }
});

// 拡張機能がインストール・更新された時
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed/updated');
  // 現在のショートカット割り当てを表示
  try {
    chrome.commands.getAll((cmds) => {
      console.log('[Background] Commands registered:', cmds.map(c => ({ name: c.name, shortcut: c.shortcut })));
      const missing = cmds.filter(c => !c.shortcut).map(c => c.name);
      if (missing.length) {
        console.warn('[Background] Some shortcuts are not assigned. Set them in chrome://extensions/shortcuts', missing);
      }
    });
  } catch (e) {
    console.warn('[Background] commands.getAll not available', e);
  }
});

// ブラウザ起動時にも確認
chrome.runtime.onStartup?.addListener(() => {
  chrome.commands.getAll((cmds) => {
    console.log('[Background] onStartup commands:', cmds.map(c => ({ name: c.name, shortcut: c.shortcut })));
  });
});

// Service Workerとして生き続けるためのダミー処理
// （Chrome 110以降は不要だが互換性のため）
export {};

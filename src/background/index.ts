/**
 * Background Service Worker
 * Chrome拡張機能のバックグラウンドで常駐するスクリプト
 * 主な役割：キーボードショートカットを受け取ってコンテンツスクリプトに転送
 */

import { pickFrame, updateStatus, clearTab } from './route';

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
      const frameId = pickFrame(tab.id);
      const options = frameId != null ? { frameId } : undefined;
      await chrome.tabs.sendMessage(tab.id, { type: 'COMMAND', command }, options as any);
      console.log('[Background] Message sent to tab', { tabId: tab.id, frameId });
    } catch (err) {
      console.error('[Background] sendMessage failed', err);
    }
  } catch (e) {
    console.error('[Background] tabs.query failed', e);
  }
});

// content からのSTATUSメッセージを受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'STATUS') {
    const tabId = sender.tab?.id;
    const frameId = sender.frameId;
    updateStatus(tabId, frameId, message.status);
    console.log('[Background] Status received:', { status: message.status, tabId, frameId });
    try { sendResponse({ received: true }); } catch {}
    return true;
  }
  if (message && message.type === 'OPEN_OPTIONS') {
    (async () => {
      try {
        if (chrome.runtime.openOptionsPage) {
          await chrome.runtime.openOptionsPage();
        } else {
          const url = chrome.runtime.getURL('public/options.html');
          await chrome.tabs.create({ url });
        }
        try { sendResponse({ received: true }); } catch {}
      } catch (e) {
        console.error('[Background] Failed to open options:', e);
        try { sendResponse({ received: false, error: (e as any)?.message || String(e) }); } catch {}
      }
    })();
    return true;
  }
  if (message && message.type === 'OPTIONS_TZ_UPDATED') {
    try {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (!tab.id) return;
          try {
            chrome.tabs.sendMessage(tab.id, { type: 'OPTIONS_TZ_UPDATED' }, () => void chrome.runtime.lastError);
          } catch {}
        });
      });
    } catch {}
    try { sendResponse({ received: true }); } catch {}
    return true;
  }
  return false;
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

// タブが閉じられたらルーティングを解放
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTab(tabId);
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

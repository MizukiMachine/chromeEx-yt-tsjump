/**
 * Content Script
 * YouTubeページに注入される
 * 役割 動画制御 UI表示 ユーザー操作処理
 */
import { observeVideo, type VideoObserverHandle } from './dom/video';
import { handleSeekCommand } from './handlers/commands';
import { startCalibration, stopCalibration } from './core/calibration';
import { mountCard, type CardAPI } from './ui/card';
import { onCommandMessage, sendStatusToBackground } from './bridge/runtime';
import { startAdWatch } from './core/adsense';
import { initToast, showToast } from './ui/toast';

function frameTag(): string {
  try {
    return window === window.top ? 'top' : 'iframe';
  } catch {
    return 'iframe';
  }
}

console.log(`[Content:${frameTag()}] YouTube Long Seek & Timestamp Jump loaded`);

// 初期化フラグ（重複実行防止）
let isInitialized = false;
let currentVideo: HTMLVideoElement | null = null;
let videoObserver: VideoObserverHandle | null = null;
let hasShadowRoot = false;
let disposeMessageListener: (() => void) | null = null;
let cardApi: CardAPI | null = null;
let numericGuardAttached = false;
// deprecated flags (no longer used)
// let jumpBtnInserted = false;
// let controlsObserver: MutationObserver | null = null;
let controlsMO: MutationObserver | null = null;
// Jumpボタンの整列は最小限のスタイルのみ（実測アラインは行わない）

/**
 * 初期化処理
 */
function initialize() {
  if (isInitialized) return;
  isInitialized = true;
  
  console.log(`[Content:${frameTag()}] Initializing...`);
  
  // 動画要素の出現と差し替えを監視
  setupVideoObserver();
  
  // バックグラウンドからのメッセージを受信
  setupMessageListener();

  // ステータス送信
  sendStatusToBackground('ready').catch(() => {});
}

/**
 * Shadow DOM を作成
 * UIをYouTubeのスタイルから隔離するため
 */
function createShadowRoot() {
  // Shadow DOM のホスト要素を作成
  const host = document.createElement('div');
  host.id = 'yt-longseek-tsjump-root';
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.zIndex = '999999';  // YouTubeのUIより前面
  
  // body に追加
  document.body.appendChild(host);
  
  // Shadow DOM を作成
  const shadowRoot = host.attachShadow({ mode: 'open' });
  
  // スタイルとコンテナを追加
  shadowRoot.innerHTML = `
    <style>
      :host {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #container {
        position: relative;
        pointer-events: none;
      }
      #shortcut-help {
        position: fixed;
        top: 8px;
        right: 8px;
        background: rgba(17,17,17,.9);
        color: #fff;
        font-size: 12px;
        line-height: 1.3;
        border-radius: 6px;
        padding: 8px 10px;
        box-shadow: 0 2px 8px rgba(0,0,0,.3);
        pointer-events: auto;
        user-select: none;
      }
      #shortcut-help .row { display: flex; gap: 6px; align-items: center; }
      #shortcut-help .btn { background: #2563eb; color: #fff; border: 0; padding: 2px 6px; border-radius: 4px; cursor: pointer; }
      #shortcut-help .btn:disabled { opacity: .6; cursor: default; }
      #shortcut-help .close { margin-left: 6px; cursor: pointer; color: #bbb; }
      #shortcut-help small { color: #bbb; }
    </style>
    <div id="container">
      <!-- UI components will be inserted here -->
      <div id="shortcut-help" style="display:none">
        <div class="row">
          <span>Set keyboard shortcuts in chrome://extensions/shortcuts</span>
          <button class="btn" id="btn-open-shortcuts">Open</button>
          <span class="close" id="btn-close-help">×</span>
        </div>
        <small id="help-status"></small>
      </div>
    </div>
  `;
  
  console.log(`[Content:${frameTag()}] Shadow DOM created`);
}

/**
 * ShadowRootを一度だけ用意
 */
function ensureShadowRoot(): ShadowRoot | null {
  if (hasShadowRoot) {
    const exist = document.getElementById('yt-longseek-tsjump-root');
    return exist && exist.shadowRoot ? exist.shadowRoot : null;
  }
  if (document.getElementById('yt-longseek-tsjump-root')) {
    hasShadowRoot = true;
    const exist = document.getElementById('yt-longseek-tsjump-root')!;
    return exist.shadowRoot;
  }
  createShadowRoot();
  hasShadowRoot = true;
  const host = document.getElementById('yt-longseek-tsjump-root');
  return host ? host.shadowRoot : null;
}

/**
 * 動画要素の出現 差し替え 消失を監視
 */
function setupVideoObserver() {
  // 既存の監視を停止
  videoObserver?.disconnect();
  
  videoObserver = observeVideo((video, reason) => {
    currentVideo = video;
    if (video) {
      ensureShadowRoot();
      ensureCard();
      ensureToast();
      ensureShortcutHelp();
      ensureJumpButton();
      // startEpoch 検出は廃止（シンプル化）
      console.log(
        `[Content:${frameTag()}] Video ready reason=${reason} duration=${video.duration} current=${video.currentTime} readyState=${video.readyState}`
      );
      // 広告監視を起動
      try {
        const playerRoot = (video.closest('.html5-video-player') as HTMLElement | null) ?? document;
        startAdWatch(playerRoot, (active) => {
          if (active) {
            showToast('An ad is playing, so seeking is paused.', 'warn');
          }
        });
      } catch {}

      // コントロールバーの変化を監視してJumpボタンを維持
      // 旧コントロール監視は撤去（下で全体MOを起動）
      // ステータス送信
      sendStatusToBackground('video-found', { reason }).catch(() => {});
      // 初期キャリブレーションはデフォルト無効
      // 計測が必要なときだけ localStorage のフラグで明示的に有効化
      // 例: localStorage.setItem('cfg:cal:auto','1') または debug:cal=1
      try {
        const auto = localStorage.getItem('cfg:cal:auto') === '1';
        const debug = localStorage.getItem('debug:cal') === '1';
        if (auto || debug) {
          startCalibration(video);
        }
      } catch {
        /* no-op */
      }
    } else {
      console.log(`[Content:${frameTag()}] Video missing reason=${reason}`);
      sendStatusToBackground('video-lost', { reason }).catch(() => {});
    }
  });
}

/**
 * バックグラウンドからのメッセージリスナー
 * 新しい型安全なメッセージバスを使用
 */
function setupMessageListener() {
  // 既存の購読を解除
  disposeMessageListener?.();
  // ブリッジ経由で購読
  disposeMessageListener = onCommandMessage(async (command) => {
    console.log(`[Content:${frameTag()}] Message received`, { type: 'COMMAND', command });
    handleCommand(command);
  });
}

/**
 * コマンドを処理
 */
function handleCommand(command: string) {
  // 入力中はショートカット無効化
  if (cardApi?.isTyping && cardApi.isTyping()) {
    console.log(`[Content:${frameTag()}] Ignored command while typing`);
    return;
  }
  const video = currentVideo ?? (document.querySelector('video') as HTMLVideoElement | null);
  if (!video) {
    console.warn('[Content] No video element found');
    return;
  }
  
  console.log(`[Content:${frameTag()}] Handling command ${command}`);
  
  switch (command) {
    case 'seek-backward-60':
      handleSeekCommand(video, 'seek-backward-60');
      break;
    case 'seek-backward-10':
      handleSeekCommand(video, 'seek-backward-10');
      break;
    case 'seek-forward-60':
      handleSeekCommand(video, 'seek-forward-60');
      break;
    case 'seek-forward-10':
      handleSeekCommand(video, 'seek-forward-10');
      break;
    // ジャンプカードとデバッグパネルはUI経由で操作
  }
}

// ページ読み込み後に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// デバッグ用：キーボードイベントを直接監視（開発時のみ）
if (process.env.NODE_ENV === 'development') {
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const key = e.key.toUpperCase();
      if (['Q', 'A', 'W', 'S'].includes(key)) {
        console.log(`[Content:${frameTag()}] DEBUG: Alt+${key} pressed directly`);
      }
    }
  });
}

// ページアンロード時の後片付け
window.addEventListener('unload', () => {
  videoObserver?.disconnect();
  stopCalibration();
  disposeMessageListener?.();
});

export {};

/**
 * ショートカット設定ヘルプの設置とイベント
 */
function ensureShortcutHelp() {
  const host = document.getElementById('yt-longseek-tsjump-root');
  const sr = host?.shadowRoot;
  if (!sr) return;
  const dismissed = localStorage.getItem('shortcutsHelpDismissed') === '1';
  const box = sr.getElementById('shortcut-help') as HTMLDivElement | null;
  if (!box) return;
  if (dismissed) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  const openBtn = sr.getElementById('btn-open-shortcuts') as HTMLButtonElement | null;
  const closeBtn = sr.getElementById('btn-close-help') as HTMLSpanElement | null;
  const status = sr.getElementById('help-status') as HTMLElement | null;
  if (openBtn && !openBtn.onclick) {
    openBtn.onclick = async () => {
      openBtn.disabled = true;
      status && (status.textContent = 'Opening...');
      try {
        const res = await chrome.runtime.sendMessage({ type: 'OPEN_SHORTCUTS' } as any);
        if (res && res.opened) {
          status && (status.textContent = 'Opened in a new tab');
        } else {
          throw new Error('open failed');
        }
      } catch {
        try {
          await navigator.clipboard.writeText('chrome://extensions/shortcuts');
          status && (status.textContent = 'Copied link to clipboard');
        } catch {
          status && (status.textContent = 'Please open chrome://extensions/shortcuts');
        }
      } finally {
        openBtn.disabled = false;
      }
    };
  }
  if (closeBtn && !closeBtn.onclick) {
    closeBtn.onclick = () => {
      localStorage.setItem('shortcutsHelpDismissed', '1');
      box.style.display = 'none';
    };
  }
}

// Cardの設置とトグルショートカット
function ensureCard() {
  if (cardApi) return;
  const host = document.getElementById('yt-longseek-tsjump-root');
  const sr = host?.shadowRoot;
  if (!sr) return;
  cardApi = mountCard(sr, () => currentVideo);
  // Alt+Shift+J で開閉
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.key.toUpperCase() === 'J') {
      // 入力中は無視
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      cardApi?.toggle();
    }
  };
  window.addEventListener('keydown', onKey);

  // カード開時は数字キーの既定シークを抑止
  if (!numericGuardAttached) {
    const handler = (e: KeyboardEvent) => {
      if (!cardApi?.isOpen || !cardApi.isOpen()) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      const editable = (t && (t as any).isContentEditable) || tag === 'input' || tag === 'textarea';
      if (editable) return;
      const k = e.key;
      if (k && k.length === 1 && k >= '0' && k <= '9') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // バブリングで監視 入力側のキャプチャ停止が優先される
    window.addEventListener('keydown', handler, false);
    window.addEventListener('keypress', handler, false);
    numericGuardAttached = true;
  }
}

// ToastをShadowRootに初期化
function ensureToast() {
  const host = document.getElementById('yt-longseek-tsjump-root');
  const sr = host?.shadowRoot;
  if (!sr) return;
  initToast(sr);
}

// YouTubeコントロールバー右端にJumpボタンを挿入（失敗しても致命ではない）
function ensureJumpButton() {
  try { mountJumpButton(); } catch {}
  // 軽量MutationObserverでSPA再描画に追随（重複挿入は防止）
  if (!controlsMO) {
    controlsMO = new MutationObserver(() => { try { mountJumpButton(); } catch {} });
    try { controlsMO.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
  }
}

function mountJumpButton(): void {
  const controls = document.querySelector('.html5-video-player .ytp-right-controls') as HTMLElement | null;
  if (!controls) return;
  if (controls.querySelector('#ytp-longseek-jump')) return; // already

  const btn = document.createElement('button');
  btn.className = 'ytp-button';
  btn.id = 'ytp-longseek-jump';
  btn.type = 'button';
  btn.title = 'Jump to local time';
  btn.setAttribute('aria-label', 'Jump to local time');
  btn.innerHTML = '<svg viewBox="0 0 36 36" width="100%" height="100%" style="display:block;pointer-events:none" aria-hidden="true"><path fill="currentColor" d="M10 18h16v2H10zM18 10l6 6h-4v10h-4V16h-4z"/></svg>';
  btn.addEventListener('click', () => { try { cardApi?.toggle(); } catch {} });

  const afterNode = controls.querySelector('.ytp-subtitles-button') as HTMLElement | null;
  const beforeNode = controls.querySelector('.ytp-settings-button') as HTMLElement | null;
  if (afterNode && afterNode.nextSibling) controls.insertBefore(btn, afterNode.nextSibling);
  else if (beforeNode) controls.insertBefore(btn, beforeNode);
  else controls.appendChild(btn);
}

// 標準コントロールの高さ/ベースラインに合わせてJumpボタンにスタイルを適用
// applyJumpButtonStyle は不要になった（ネイティブytp-buttonに完全相乗り）

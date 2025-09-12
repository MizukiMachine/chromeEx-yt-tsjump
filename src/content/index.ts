/**
 * Content Script
 * YouTubeページに注入される
 * 役割 動画制御 UI表示 ユーザー操作処理
 */
import { observeVideo, type VideoObserverHandle } from './dom/video';
import { handleSeekCommand } from './handlers/commands';
import { stopCalibration } from './core/calibration';
import { initHybrid, startCalibration as startHybridCalibration, disposeHybrid } from './core/hybridCalibration';
import { mountCard, type CardAPI } from './ui/card';
import { onCommandMessage, sendStatusToBackground } from './bridge/runtime';
import { startAdWatch } from './core/adsense';
import { initToast, showToast } from './ui/toast';
import { getBool, setBool, setString, Keys } from './store/local';
import { t } from './utils/i18n';
import { mountDebug, type DebugAPI } from './ui/debug';
import { logStatus, logAd } from './events/emit';

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
let debugApi: DebugAPI | null = null;
// deprecated flags (no longer used)
// let jumpBtnInserted = false;
// let controlsObserver: MutationObserver | null = null;
let controlsMO: MutationObserver | null = null;
// URL変更監視用
let currentURL = location.href;
// Jumpボタンの整列は最小限のスタイルのみ（実測アラインは行わない）

/**
 * 初期化処理
 */
function initialize() {
  if (isInitialized) return;
  isInitialized = true;
  
  console.log(`[Content:${frameTag()}] Initializing...`);
  // 可能なら options（chrome.storage.local）から初期値を取り込み
  loadOptionsFromStorage();
  
  // 動画要素の出現と差し替えを監視
  setupVideoObserver();
  
  // バックグラウンドからのメッセージを受信
  setupMessageListener();

  // URL変更監視を開始
  setupURLObserver();

  // ステータス送信
  sendStatusToBackground('ready').catch(() => {});
  try { logStatus('ready'); } catch {}
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
      ensureDebug();
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
            showToast(t('toast.ad_paused'), 'warn');
          }
          try { logAd(active); } catch {}
        });
      } catch {}

      // コントロールバーの変化を監視してJumpボタンを維持
      // 旧コントロール監視は撤去（下で全体MOを起動）
      // ステータス送信
      sendStatusToBackground('video-found', { reason }).catch(() => {});
      try { logStatus('video-found', { reason }); } catch {}
      // ハイブリッドキャリブレーションシステムの初期化と開始
      try {
        // ハイブリッドシステム初期化（デフォルト設定使用）
        initHybrid(video);
        
        // Edge-Snap監視開始
        startHybridCalibration();
        
        console.log(`[Content:${frameTag()}] Hybrid calibration system started`);
      } catch (error) {
        console.error(`[Content:${frameTag()}] Failed to start hybrid calibration:`, error);
      }
    } else {
      console.log(`[Content:${frameTag()}] Video missing reason=${reason}`);
      sendStatusToBackground('video-lost', { reason }).catch(() => {});
      try { logStatus('video-lost', { reason }); } catch {}
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
  try { logStatus('command', { command }); } catch {}
  
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

/**
 * URL変更を監視してカードを閉じる
 * YouTubeのSPAナビゲーションでは unload が発生しないため
 */
function setupURLObserver() {
  // pushState/replaceState をフック
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    const result = originalPushState.apply(this, args);
    checkURLChange();
    return result;
  };
  
  history.replaceState = function(...args) {
    const result = originalReplaceState.apply(this, args);
    checkURLChange();
    return result;
  };
  
  // popstateイベント（戻る/進むボタン）
  window.addEventListener('popstate', checkURLChange);
  
  // 定期チェックも追加（フォールバック）
  setInterval(checkURLChange, 1000);
}

/**
 * URL変更をチェックしてカードを閉じる
 */
function checkURLChange() {
  const newURL = location.href;
  if (newURL !== currentURL) {
    console.log(`[Content:${frameTag()}] URL changed: ${currentURL} -> ${newURL}`);
    currentURL = newURL;
    
    // カードが開いていれば閉じる
    if (cardApi?.isOpen && cardApi.isOpen()) {
      console.log(`[Content:${frameTag()}] Closing card due to URL change`);
      cardApi.close();
    }
  }
}

// ページアンロード時の後片付け
window.addEventListener('unload', () => {
  videoObserver?.disconnect();
  stopCalibration();
  disposeHybrid(); // ハイブリッドシステムのクリーンアップ
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
  const dismissed = getBool(Keys.ShortcutsHelpDismissed);
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
      setBool(Keys.ShortcutsHelpDismissed, true);
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
      e.preventDefault();
      e.stopPropagation();
      try {
        const isOpen = cardApi && typeof (cardApi as any).isOpen === 'function' && (cardApi as any).isOpen();
        if (isOpen) cardApi?.close?.();
        else if (cardApi && typeof (cardApi as any).openSmart === 'function') (cardApi as any).openSmart();
        else cardApi?.toggle();
      } catch {}
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

// DebugパネルをShadowRootに初期化（Alt+Shift+L で開閉）
function ensureDebug() {
  if (debugApi) return;
  const host = document.getElementById('yt-longseek-tsjump-root');
  const sr = host?.shadowRoot;
  if (!sr) return;
  debugApi = mountDebug(sr, () => currentVideo);
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.key.toUpperCase() === 'L') {
      // 入力中は無視
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      debugApi?.toggle();
    }
  };
  window.addEventListener('keydown', onKey);
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
  if (controls.querySelector('#ytp-jump')) return; // already

  const btn = document.createElement('button');
  btn.className = 'ytp-button ytp-jump';
  btn.id = 'ytp-jump';
  btn.type = 'button';
  btn.title = 'Jump';
  btn.setAttribute('aria-label', 'Jump');
  btn.innerHTML = '<span class="ytp-jump__inner"><span class="ytp-jump__label">Jump</span></span>';
  btn.addEventListener('click', () => {
    try {
      const isOpen = cardApi && typeof (cardApi as any).isOpen === 'function' && (cardApi as any).isOpen();
      if (isOpen) cardApi?.close?.();
      else if (cardApi && typeof (cardApi as any).openSmart === 'function') (cardApi as any).openSmart();
      else cardApi?.toggle();
    } catch {}
  });

  const afterNode = controls.querySelector('.ytp-subtitles-button') as HTMLElement | null;
  const beforeNode = controls.querySelector('.ytp-settings-button') as HTMLElement | null;
  if (afterNode && afterNode.nextSibling) controls.insertBefore(btn, afterNode.nextSibling);
  else if (beforeNode) controls.insertBefore(btn, beforeNode);
  else controls.appendChild(btn);
}

// 標準コントロールの高さ/ベースラインに合わせてJumpボタンにスタイルを適用
// applyJumpButtonStyle は不要になった（ネイティブytp-buttonに完全相乗り）
// optionsページで保存された既定値を localStorage ラッパに反映（片方向）
function loadOptionsFromStorage() {
  try {
    const anyChrome = (globalThis as any).chrome
    if (!anyChrome?.storage?.local) return
    anyChrome.storage.local.get(['cfg:cal:auto','debug:cal','lang','shortcutsHelpDismissed'], (res: any) => {
      // Bool系は '1'|'0' で保存されている前提にも、boolean保存にも両対応
      const normalize = (v: any) => v === '1' || v === 1 || v === true
      try { if (res && res['cfg:cal:auto'] != null) setBool(Keys.CalAuto, normalize(res['cfg:cal:auto'])) } catch {}
      try { if (res && res['debug:cal'] != null) setBool(Keys.DebugCal, normalize(res['debug:cal'])) } catch {}
      try { if (typeof res?.['lang'] === 'string') setString(Keys.Lang, res['lang']) } catch {}
      try { if (res && res['shortcutsHelpDismissed'] != null) setBool(Keys.ShortcutsHelpDismissed, normalize(res['shortcutsHelpDismissed'])) } catch {}
    })
  } catch {}
}

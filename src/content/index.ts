/**
 * Content Script
 * YouTubeページに注入される
 * 役割 動画制御 UI表示 ユーザー操作処理
 */
import { observeVideo, type VideoObserverHandle } from './dom/video';
import { initHybrid, startCalibration as startHybridCalibration, disposeHybrid } from './core/hybridCalibration';
import { startSeekableAnomalyProbe, stopSeekableAnomalyProbe } from './core/seekableProbe';
// 開発用: コンソールから停止できるように露出
try { (window as any).__seekProbeStop = stopSeekableAnomalyProbe; } catch {}
import { mountCard, type CardAPI } from './ui/card';
import { sendStatusToBackground } from './bridge/runtime';
import { startAdWatch } from './core/adsense';
import { initToast, showToast } from './ui/toast';
import { getBool, Keys } from './store/local';
import { t } from './utils/i18n';
import { mountDebug, type DebugAPI } from './ui/debug';
import { logStatus, logAd } from './events/emit';
import { ensureShadowRoot } from './services/shadowRoot';
import { ensureJumpButton } from './ui/jumpButton';
import { setupURLObserver } from './services/urlWatcher';
import { setupCommandRouting } from './bridge/commandsRouter';
import { loadOptionsFromStorage } from './services/options';

function frameTag(): string {
  try {
    return window === window.top ? 'top' : 'iframe';
  } catch {
    return 'iframe';
  }
}

console.log(`[Content:${frameTag()}] TS Jump on Youtube loaded`);

// 初期化フラグ（重複実行防止）
let isInitialized = false;
let currentVideo: HTMLVideoElement | null = null;
let videoObserver: VideoObserverHandle | null = null;
let disposeMessageListener: (() => void) | null = null;
let cardApi: CardAPI | null = null;
let numericGuardAttached = false;
let debugApi: DebugAPI | null = null;
// deprecated flags (no longer used)
// let jumpBtnInserted = false;
// let controlsObserver: MutationObserver | null = null;
// moved to ui/jumpButton.ts
// URL変更監視は services/urlWatcher.ts で行う（ここでのURL保持は不要）
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

  // URL変更監視を開始（カードを閉じる）
  setupURLObserver(() => {
    if (cardApi?.isOpen && cardApi.isOpen()) {
      console.log(`[Content:${frameTag()}] Closing card due to URL change`);
      cardApi.close();
    }
  });

  // ステータス送信
  sendStatusToBackground('ready').catch(() => {});
  try { logStatus('ready'); } catch {}
}

/**
 * Shadow DOM を作成
 * UIをYouTubeのスタイルから隔離するため
 */
// ShadowRoot logic moved to services/shadowRoot.ts

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
      // DebugパネルはデバッグモードON時のみ有効化
      try { if (getBool(Keys.DebugAll)) ensureDebug(); } catch {}
      ensureJumpButton({
        isOpen: () => !!(cardApi?.isOpen && cardApi.isOpen()),
        openSmart: () => { try { (cardApi as any)?.openSmart?.(); } catch {} },
        close: () => { try { cardApi?.close?.(); } catch {} },
      });
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
        // seekable先行の観測プローブ開始（デバッグフラグ有効時）
        // デバッグモードON時のみプローブを開始
        try { if (getBool(Keys.DebugAll)) startSeekableAnomalyProbe(video); } catch {}
        
        console.log(`[Content:${frameTag()}] Hybrid calibration system started`);
      } catch (error) {
        console.error(`[Content:${frameTag()}] Failed to start hybrid calibration:`, error);
      }
    } else {
      console.log(`[Content:${frameTag()}] Video missing reason=${reason}`);
      sendStatusToBackground('video-lost', { reason }).catch(() => {});
      try { logStatus('video-lost', { reason }); } catch {}
      // プローブ停止
      try { stopSeekableAnomalyProbe(); } catch {}
    }
  });
}

/**
 * バックグラウンドからのメッセージリスナー
 * 新しい型安全なメッセージバスを使用
 */
function setupMessageListener() {
  disposeMessageListener?.();
  disposeMessageListener = setupCommandRouting(
    () => currentVideo ?? (document.querySelector('video') as HTMLVideoElement | null),
    () => !!(cardApi?.isTyping && cardApi.isTyping()),
    (k, d) => { try { logStatus(k, d); } catch {} }
  );
}

/**
 * コマンドを処理
 */
// Command handling moved to bridge/commandsRouter.ts

// ページ読み込み後に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// デバッグ用：キーボードイベントを直接監視（開発時のみ）
if (process.env.NODE_ENV === 'development') {
  document.addEventListener('keydown', (e) => {
    // Align with actual manifest shortcuts: Alt+Shift+S/D/F/G
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const key = e.key.toUpperCase();
      if (['S', 'D', 'F', 'G'].includes(key)) {
        console.log(`[Content:${frameTag()}] DEBUG: Alt+Shift+${key} pressed directly`);
      }
    }
  });
}

/**
 * URL変更を監視してカードを閉じる
 * YouTubeのSPAナビゲーションでは unload が発生しないため
 */
// URL observer moved to services/urlWatcher.ts

/**
 * URL変更をチェックしてカードを閉じる
 */
// checkURLChange inlined into setupURLObserver callback

// ページアンロード時の後片付け
window.addEventListener('unload', () => {
  videoObserver?.disconnect();
  disposeHybrid(); // ハイブリッドシステムのクリーンアップ
  stopSeekableAnomalyProbe();
  disposeMessageListener?.();
});

export {};

// shortcuts help popup has been removed

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
// ensureJumpButton moved to ui/jumpButton.ts

// mountJumpButton moved to ui/jumpButton.ts

// 標準コントロールの高さ/ベースラインに合わせてJumpボタンにスタイルを適用
// applyJumpButtonStyle は不要になった（ネイティブytp-buttonに完全相乗り）
// loadOptionsFromStorage moved to services/options.ts

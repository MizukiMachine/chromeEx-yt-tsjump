/**
 * Content Script
 * YouTubeページに注入される
 * 役割 動画制御 UI表示 ユーザー操作処理
 */
import { observeVideo, type VideoObserverHandle } from './dom/video';
import { handleSeekCommand } from './handlers/commands';
import { startCalibration, stopCalibration } from './core/calibration';
import { onCommandMessage, sendStatusToBackground } from './bridge/runtime';

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
  host.style.pointerEvents = 'none';  // 初期状態ではクリック透過
  
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
      }
    </style>
    <div id="container">
      <!-- UI components will be inserted here -->
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
      console.log(
        `[Content:${frameTag()}] Video ready reason=${reason} duration=${video.duration} current=${video.currentTime} readyState=${video.readyState}`
      );
      // ステータス送信
      sendStatusToBackground('video-found', { reason }).catch(() => {});
      // 初期キャリブレーションを開始
      startCalibration(video);
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

/**
 * Content Script
 * YouTubeページに注入される
 * 役割 動画制御 UI表示 ユーザー操作処理
 */
import { observeVideo, type VideoObserverHandle } from './dom/video';

console.log('[Content] YouTube Long Seek & Timestamp Jump loaded');

// 初期化フラグ（重複実行防止）
let isInitialized = false;
let currentVideo: HTMLVideoElement | null = null;
let videoObserver: VideoObserverHandle | null = null;

/**
 * 初期化処理
 */
function initialize() {
  if (isInitialized) return;
  isInitialized = true;
  
  console.log('[Content] Initializing...');
  
  // Shadow DOM のルートを作成
  createShadowRoot();
  
  // 動画要素の出現と差し替えを監視
  setupVideoObserver();
  
  // バックグラウンドからのメッセージを受信
  setupMessageListener();
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
  
  console.log('[Content] Shadow DOM created');
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
      console.log('[Content] Video ready:', {
        reason,
        duration: video.duration,
        currentTime: video.currentTime,
        readyState: video.readyState,
      });
      // TODO 初期キャリブレーションの起動をここで開始
    } else {
      console.log('[Content] Video missing:', { reason });
    }
  });
}

/**
 * バックグラウンドからのメッセージリスナー
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log('[Content] Message received:', message);
    
    if (message.type === 'COMMAND') {
      handleCommand(message.command);
    }
    
    sendResponse({ received: true });
    return true;  // 非同期レスポンスのため
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
  
  console.log('[Content] Handling command:', command);
  
  // TODO: 実際のシーク処理を実装
  switch (command) {
    case 'seek-backward-60':
      console.log('TODO: Seek -60 minutes');
      break;
    case 'seek-backward-10':
      console.log('TODO: Seek -10 minutes');
      break;
    case 'seek-forward-60':
      console.log('TODO: Seek +60 minutes');
      break;
    case 'seek-forward-10':
      console.log('TODO: Seek +10 minutes');
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

// ページアンロード時の後片付け
window.addEventListener('unload', () => {
  videoObserver?.disconnect();
});

export {};

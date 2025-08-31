/**
 * Runtime Message Bridge
 * background ↔ content 間の型安全な通信層
 */
import type { 
  BackgroundToContentMessage, 
  ContentToBackgroundMessage,
  ContentResponse,
  CommandType
} from '../../types/messages';

/**
 * デバッグログを出力するかどうか
 */
const DEBUG = process.env.NODE_ENV === 'development';

/**
 * フレーム識別タグ
 */
function frameTag(): string {
  try {
    return window === window.top ? 'top' : 'iframe';
  } catch {
    return 'iframe';
  }
}

/**
 * バックグラウンドへステータスを送信
 */
export async function sendStatusToBackground(
  status: ContentToBackgroundMessage['status'],
  details?: any
): Promise<void> {
  const message: ContentToBackgroundMessage = {
    type: 'STATUS',
    status,
    details
  };
  
  try {
    await chrome.runtime.sendMessage(message);
    if (DEBUG) {
      console.log(`[Bridge:${frameTag()}] Status sent to background:`, status, details);
    }
  } catch (error) {
    // 背景が未起動などで受信側なしの可能性
    if (DEBUG) console.warn(`[Bridge:${frameTag()}] Failed to send status:`, error);
  }
}

/**
 * コマンドメッセージのリスナーを設定
 */
export function onCommandMessage(
  handler: (command: CommandType) => void | Promise<void>
): () => void {
  const listener = async (
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ContentResponse) => void
  ) => {
    // 型チェック
    if (!isBackgroundToContentMessage(message)) {
      return false;
    }
    
    if (DEBUG) {
      console.log(`[Bridge:${frameTag()}] Command received:`, message.command, {
        timestamp: message.timestamp,
        sender: sender.id
      });
    }
    
    try {
      await handler(message.command);
      sendResponse({ 
        received: true,
        result: 'success'
      });
    } catch (error) {
      console.error(`[Bridge:${frameTag()}] Command handler error:`, error);
      sendResponse({ 
        received: true,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    return true; // 非同期レスポンスのため
  };
  
  chrome.runtime.onMessage.addListener(listener);
  
  // クリーンアップ関数を返す
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
}

/**
 * 型ガード: BackgroundToContentMessage かどうか
 */
function isBackgroundToContentMessage(message: any): message is BackgroundToContentMessage {
  return (
    message &&
    typeof message === 'object' &&
    message.type === 'COMMAND' &&
    typeof message.command === 'string' &&
    isValidCommand(message.command)
  );
}

/**
 * 有効なコマンドかチェック
 */
function isValidCommand(command: string): command is CommandType {
  return [
    'seek-backward-60',
    'seek-backward-10',
    'seek-forward-60',
    'seek-forward-10'
  ].includes(command);
}

/**
 * エラーレポート用のヘルパー
 */
export function reportError(context: string, error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[Bridge:${frameTag()}] Error in ${context}:`, errorMessage);
  
  // バックグラウンドにエラーを通知
  sendStatusToBackground('error', {
    context,
    error: errorMessage,
    frame: frameTag()
  }).catch(() => {
    // エラー送信自体が失敗した場合は何もしない
  });
}

/**
 * メッセージングの型定義
 * background ↔ content 間の通信で使用
 */

// 利用可能なコマンド一覧（シーク系のみ実装済み）
export type CommandType = 
  | 'seek-backward-60'
  | 'seek-backward-10' 
  | 'seek-forward-60'
  | 'seek-forward-10';

// メッセージタイプ
export type MessageType = 'COMMAND' | 'CALIBRATION' | 'DEBUG' | 'STATUS';

// バックグラウンドからコンテンツへのメッセージ
export interface BackgroundToContentMessage {
  type: 'COMMAND';
  command: CommandType;
  timestamp?: number;
}

// コンテンツからバックグラウンドへのメッセージ
export interface ContentToBackgroundMessage {
  type: 'STATUS';
  status: 'ready' | 'video-found' | 'video-lost' | 'error';
  details?: any;
}

// コンテンツスクリプトからのレスポンス
export interface ContentResponse {
  received: boolean;
  error?: string;
  result?: any;
}

// 送信ヘルパーのインターフェース
export interface MessageSender {
  sendCommandToContent: (tabId: number, command: CommandType) => Promise<ContentResponse>;
  sendStatusToBackground: (status: ContentToBackgroundMessage['status'], details?: any) => Promise<void>;
}
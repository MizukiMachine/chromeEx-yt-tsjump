import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    preact(),
    webExtension({
      manifest: () => ({
        manifest_version: 3,
        name: 'YouTube Long Seek & Timestamp Jump',
        version: '1.0.0',
        description: 'Enhanced YouTube controls with long seek and timestamp-aware time jumping',
        
        // 権限設定
        permissions: [
          'storage',     // 設定保存用
          'scripting',   // コンテンツスクリプト注入
          'activeTab',   // アクティブタブ操作
          'commands'     // キーボードショートカット
        ],
        
        // YouTubeドメインへのアクセス権限
        host_permissions: [
          'https://www.youtube.com/*',
          'https://www.youtube-nocookie.com/*'
        ],
        
        // バックグラウンドサービスワーカー
        background: {
          service_worker: 'src/background/index.ts',
          type: 'module'
        },
        
        // コンテンツスクリプト
        content_scripts: [
          {
            matches: [
              'https://www.youtube.com/*',
              'https://www.youtube-nocookie.com/*'
            ],
            js: ['src/content/index.ts'],
            css: ['src/styles/index.css'],
            all_frames: true,  // iframe内でも動作
            run_at: 'document_end'
          }
        ],
        
        // キーボードショートカット（Alt+Q/A/W/S を正式仕様とする）
        commands: {
          'seek-backward-60': {
            suggested_key: {
              default: 'Alt+Q'
            },
            description: 'Seek backward 60 minutes'
          },
          'seek-backward-10': {
            suggested_key: {
              default: 'Alt+A'
            },
            description: 'Seek backward 10 minutes'
          },
          'seek-forward-60': {
            suggested_key: {
              default: 'Alt+W'
            },
            description: 'Seek forward 60 minutes'
          },
          'seek-forward-10': {
            suggested_key: {
              default: 'Alt+S'
            },
            description: 'Seek forward 10 minutes'
          }
        },
        
        // アイコン
        icons: {
          '16': 'icons/icon-16.png',
          '48': 'icons/icon-48.png',
          '128': 'icons/icon-128.png'
        }
      }),
      additionalInputs: ['src/content/index.ts', 'src/background/index.ts'],
    })
  ],
  
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV === 'development',
    // rollupOptionsは削除（web-extensionプラグインが自動処理）
  },
  
  // テストモード時の設定
  define: {
    'TEST_MODE': JSON.stringify(process.env.TEST_MODE === 'true')
  }
});

import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    preact(),
    webExtension({
      manifest: () => {
        const testMode = process.env.TEST_MODE === 'true';
        const matches = testMode
          ? ['http://localhost:5173/src/mock/*']
          : ['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*'];
        return ({
        manifest_version: 3,
        name: 'TS Jump on Youtube',
        version: '1.0.0',
        description: 'Enhanced YouTube controls with long skip and timestamp-aware time jumping',
        
        // 権限設定
        permissions: [
          'storage',     // 設定保存
          'scripting',   // スクリプト注入
          'tabs',        // activeタブの取得とメッセージ送信
          'activeTab',   // 一部の操作に必要な場合の補助
          'commands'     // キーボードショートカット
        ],
        
        // YouTubeドメインへのアクセス権限
        host_permissions: matches,
        
        // バックグラウンドサービスワーカー
        background: {
          service_worker: 'src/background/index.ts',
          type: 'module'
        },
        
        // オプションページ
        options_page: 'public/options.html',
        
        // コンテンツスクリプト
        content_scripts: [
          {
            matches,
            js: ['src/content/index.ts'],
            css: ['src/styles/index.css'],
            all_frames: true,  // iframe内でも動作
            run_at: 'document_end'
          }
        ],
        
        // キーボードショートカット Alt+Shift+S/D/F/G
        // 注意 manifestのバリデータは[A-Z]のみ許容 数字は不可
        // プラットフォーム別指定で自動設定を改善
        commands: {
          'seek-backward-60': {
            suggested_key: {
              windows: 'Alt+Shift+S',
              mac: 'Alt+Shift+S', 
              chromeos: 'Alt+Shift+S',
              linux: 'Alt+Shift+S'
            },
            description: 'Seek backward 60 minutes'
          },
          'seek-backward-10': {
            suggested_key: {
              windows: 'Alt+Shift+D',
              mac: 'Alt+Shift+D',
              chromeos: 'Alt+Shift+D', 
              linux: 'Alt+Shift+D'
            },
            description: 'Seek backward 10 minutes'
          },
          'seek-forward-60': {
            suggested_key: {
              windows: 'Alt+Shift+G',
              mac: 'Alt+Shift+G',
              chromeos: 'Alt+Shift+G',
              linux: 'Alt+Shift+G'
            },
            description: 'Seek forward 60 minutes'
          },
          'seek-forward-10': {
            suggested_key: {
              windows: 'Alt+Shift+F',
              mac: 'Alt+Shift+F',
              chromeos: 'Alt+Shift+F',
              linux: 'Alt+Shift+F'
            },
            description: 'Seek forward 10 minutes'
          }
        },
        
        // アイコン
        icons: {
          '16': 'icons/icon-16.png',
          '32': 'icons/icon-32.png',
          '48': 'icons/icon-48.png',
          '128': 'icons/icon-128.png'
        }
      });
      },
      additionalInputs: ['src/content/index.ts', 'src/background/index.ts', 'src/options/index.tsx', 'src/mock/index.html', 'src/mock/index.js'],
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

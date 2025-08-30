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
        name: 'YouTube Long Seek & Timezone Jump',
        version: '1.0.0',
        description: 'Enhanced YouTube controls with long seek and timezone-aware time jumping',
        
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
        
        // キーボードショートカット
        commands: {
          'seek-backward-60': {
            suggested_key: {
              default: 'Alt+Shift+Q'
            },
            description: 'Seek backward 60 minutes'
          },
          'seek-backward-10': {
            suggested_key: {
              default: 'Alt+Shift+A'
            },
            description: 'Seek backward 10 minutes'
          },
          'seek-forward-60': {
            suggested_key: {
              default: 'Alt+Shift+W'
            },
            description: 'Seek forward 60 minutes'
          },
          'seek-forward-10': {
            suggested_key: {
              default: 'Alt+Shift+S'
            },
            description: 'Seek forward 10 minutes'
          },
          'toggle-jump-card': {
            suggested_key: {
              default: 'Alt+Shift+J'
            },
            description: 'Toggle jump card'
          },
          'toggle-debug-panel': {
            suggested_key: {
              default: 'Alt+Shift+D'
            },
            description: 'Toggle debug panel'
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
    rollupOptions: {
      input: {
        // オプションページ（将来用）
        // options: resolve(__dirname, 'options.html'),
      }
    }
  },
  
  // テストモード時の設定
  define: {
    'TEST_MODE': JSON.stringify(process.env.TEST_MODE === 'true')
  }
});
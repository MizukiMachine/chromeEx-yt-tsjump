# YouTube TSジャンプ（Chrome 拡張）
主に、YouTubeの24時間ライブ配信に向けた便利機能です。

「TSジャンプ」や「自由にカスタマイズできる早送り巻き戻しボタン」 が使えます。

- TSジャンプ（タイムスタンプジャンプ）
    - コントロールバーのJumpボタン、もしくはショートカットキー Alt+Shift+J
    - HH:mm や HHmmss の形式で入力してEnter
    - 例： “12:30:20”, “1230”
- カスタムスキップボタン
    - カスタムできる早送り巻き戻しボタン6個
    - 移動できる秒数や分数は自由にカスタムできます
- Youtubeに馴染んだ控えめなUIで、普段の操作の邪魔をしません

## これは何？

YouTubeのシークバーだけでは動かしづらい、長時間配信動画用に作りました。

ライブ配信以外でも長時間動画でも便利だと思います。

TSジャンプ機能は、YouTubeに数多くある24時間ライブ配信向けの機能です。

様々なタイムゾーン対応しており、 + DST（夏時間）も自動処理します。

## 使い方

- 操作パネルの表示非表示
    - 動画領域コントロールバーの「Jump」ボタンをクリック or Alt+Shift+J
- TSジャンプ
    - 時刻入力欄に、 `HHmm` や、`HHmmss` `HH:mm:ss` などの形式を入力 → Enter
- カスタムボタン
    - 操作パネルに表示されている▼/▲で開閉
    - ✎で編集 → 秒数とラベルを設定（最大6個）
- タイムゾーン
    - ドロップダウンから選択
- ±60/±10分移動に関してはショートカット移動も可能
    - 好きなキーの割当もできます: `chrome://extensions/shortcuts`

## よくある質問

Q. ショートカットキーでの移動が効かない

- A. Chrome のショートカット設定で割り当てをご確認ください。別アプリと衝突する場合はキーを変更してください。

Q. 広告中に動かない

- A. 仕様です。広告中は誤動作を避けるため抑止しています。終了後は自動で復帰します。

Q. 時刻ジャンプが少しズレる

- A. 遅延や配信設定の影で、数秒単位の差が出ることがあります。大きくズレだした場合は画面再読み込みしてください。
---

## 開発者向け説明

### 必要環境
- Node.js 20 以上
- Chrome（Stable 最新）

### インストール（開発者モードで使ってみる）
1. 依存をインストール: `npm i`
2. ビルド: `npm run build`
3. Chrome で `chrome://extensions` を開き、右上の「デベロッパーモード」をON
4. 「パッケージ化されていない拡張機能を読み込む」→ リポジトリの `dist/` を選択

### モック環境（TEST_MODE）での動作確認
YouTubeに触らず、テスト用のモック動画ページで動かす方法です。

1. ターミナルA: `npm run dev`（モックページが `http://localhost:5173/src/mock/index.html` で開ける状態に）
2. ターミナルB: `TEST_MODE=true npm run build`（拡張の注入先をモックに切替）
3. `chrome://extensions` で拡張を再読み込み → モックページを開いて挙動を確認

### テスト
- 単体テスト: `npm run test`
  - 対象: timeparse / timezone ほか。`happy-dom` で軽量に実行
- ウォッチ実行: `npm run test:watch`
- E2E（任意）:
  1) 初回のみ `npx playwright install chromium`
  2) ターミナルAで `npm run dev`、ターミナルBで `TEST_MODE=true npm run build`
  3) `TEST_MODE=true npm run test:e2e`

### 提出用ビルド（パッケージング）
1. `npm run build`（`dist/` にMV3の成果物が生成されます）
2. ストア提出時は `dist/` を ZIP にまとめてアップロード（Chrome デベロッパーダッシュボードの指示に従う）

### よく使うスクリプト（npm scripts）
- `dev`: Vite の開発サーバ（モックページ用）
- `build`: 型チェック + ビルド（`dist/` 出力）
- `preview`: ビルド済みのプレビュー（必要に応じて）
- `test`: 単体テスト実行
- `test:watch`: 単体テストのウォッチ実行
- `test:e2e`: Playwright でE2E（TEST_MODE ビルドが前提）

### ディレクトリの目安
- `src/content/` … コンテンツスクリプト本体（UIやコア処理）
- `src/background/` … サービスワーカー（commands→content転送）
- `src/mock/` … モックページ（E2E/手動検証用）
- `tests/` … 単体テスト
- `tests-e2e/` … E2E テスト
- `public/icons/` … 拡張アイコン
- `store-assets/` … ストア用スクリーンショット等（任意で作成）

### ショートカットの変更
- `chrome://extensions/shortcuts` で自由に割り当て可能です。

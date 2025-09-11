# YouTube 長時間シーク & 時刻ジャンプ — ARCHITECTURE

## ■ 採用スタックと方針

- Manifest V3, Desktop Chrome
- バンドラ: Vite
- UI: Preact + TypeScript（Shadow DOM 上で描画）
- 単体テスト: Vitest（happy-dom）
- E2E: Playwright（拡張を読み込んだ Chromium）
- 時刻計算: Temporal API（`@js-temporal/polyfill` を同梱しフォールバック）
- コンテンツ注入: `content_scripts` を `all_frames: true` で実行。プレイヤー iframe のみ制御
- セキュリティ: 外部通信なし、最小権限、CSP 準拠

## ■ 高レベル構成

- background/service worker
  - chrome.commands を購読、アクティブタブの content にメッセージを転送
- content script
  - YouTube プレイヤー iframe に注入し、動画要素取得・制御、UI（カード/トースト/デバッグ）を Shadow DOM で提供
  - 主要ロジック（校正、時刻正規化、TZ 変換、端ジャンプ、広告検知）を実装
- injected page script（必要時）
  - 直接 DOM に近い操作が必要な場合のみ使用（最小化）

## ■ データフロー

1) ページ読み込み → content が Shadow DOM を作成し、`<video>` を検出
2) （任意）校正開始（1 秒間隔で C をサンプリング）。通常は必要時/デバッグ時のみ起動
3) ユーザー操作（ショートカット／カード） → background の commands → content のハンドラ
4) 入力 → 正規化 → TZ 変換 → `E_target` 算出 → `t_target = E_target − C` → 範囲判定 → seek
5) 広告検知中は抑止。イベントや計算結果はログリングに保存、デバッグパネルとコンソールへ出力

## ■ モジュール構成

```
src/
  background/
    index.ts                  # commands → content へ転送
    route.ts                  # メッセージルーティング
  content/
    index.ts                  # 起点（UI ルート、video 検出、初回校正）
    bridge/runtime.ts         # postMessage/受信、型安全なチャネル
    core/
      calibration.ts          # C の推定（中央値＋MAD）、再校正トリガ
      timeparse.ts            # 24h 正規化・自動補正
      timezone.ts             # Temporal で TZ 変換（DST: gap/ambiguous）
      seek.ts                 # getSeekable*, clamp, seek, ±10/±60
      jump.ts                 # 入力→t_target→端ジャンプ
      adsense.ts              # MutationObserver で広告検知
    ui/
      card.tsx                # 入力カード（TZ ドロップダウン MRU、カスタムボタン）
      toast.ts                # フレンドリートースト
      debug.tsx               # デバッグパネル（Alt+Shift+L）
      hooks/                  # UI関連カスタムフック
        useCardPosition.ts    # カード位置管理
        useDragHandling.ts    # ドラッグ処理
        useTimezoneData.ts    # TZ・MRU管理
    utils/                    # ユーティリティ
      i18n.ts                 # 多言語化（カテゴリ分け辞書、型安全）
      layout.ts               # レイアウト・位置計算
    log/
      buffer.ts               # 固定長リング（N=200）
      emit.ts                 # イベント集約
    store/
      local.ts                # localStorage（位置、ピン、TZ、MRU）
      customButtons.ts        # カスタムボタン設定・バリデーション
    dom/video.ts              # `<video>` 検出ユーティリティ
    handlers/
      commands.ts             # コマンドハンドラ
  options/
    index.tsx                 # 任意のオプションページ
  types/
    messages.ts, index.d.ts   # 型定義
  styles/
    index.css                 # z-index, shadow host の見た目
```

### ディレクトリ構造の意図

- `content/ui/`: UI コンポーネント（カード、トースト、デバッグパネル、カスタムボタン）
- `content/ui/hooks/`: Preactカスタムフック（位置管理、ドラッグ、TZ管理）
- `content/utils/`: 汎用ユーティリティ（多言語化、レイアウト計算）
- `content/core/`: ビジネスロジック（時刻変換、シーク、ジャンプ、広告検知）
- `content/store/`: 設定管理・永続化（localStorage、カスタムボタン）
- `content/handlers/`: イベント処理
- モジュール間の依存関係を明確化し、循環依存を回避

## ■ 型と状態

主要型（例）
- `CalibrationState { offsetC: number, mad: number, samples: number, lastUpdated: number }`
- `NormalizedTime { hh: number, mm: number, ss: number, normalized: string, rolledOver: boolean }`
- `TZSetting { current: string, mru: string[] }`
- `JumpRequest { input: string, zone: string }`
- `JumpDecision { E_target: number, t_target: number, clamped: boolean, clampReason?: "range"|"ad", target: "exact"|"start"|"end" }`
- `AdState { active: boolean, since: number }`
- `LogEvent { ts: number, kind: string, payload: Record<string,unknown> }`

UI 状態
- `card:pos`, `card:pinned`, `tz:current`, `tz:mru` を localStorage に保存
- デバッグパネル開閉はメモリ保持（必要なら保存可）

## ■ アルゴリズム詳細

キャリブレーション
- 条件: `video.readyState >= HAVE_METADATA`
- サンプル: 最大 6 秒、1 秒間隔で `C_i = (Date.now()/1000) − end_i`
- 外れ値除去: 中央値 `med` と MAD を算出し、`|C_i − med| > 0.75` を除外（厳しくしない）
- 推定: 残サンプルの中央値を `C` とする。品質として MAD を保持
- 暫定推定: サンプル 1〜2 個でも `C_prov` を返し、完了後に差分を内部補正
- 再測定: seekable 変化 ≥60s / 10 分軽量再測定（3 点）/ 実測ズレ >3s

24h 入力正規化
- 許容: `HH:mm`, `HH:mm:ss`, `HHmm`, `HHmmss`
- 補正: 欠落秒は `:00`。分・秒 ≥60 は繰り上げ。`HH>=24` は当日外（範囲外扱い候補）

タイムゾーン変換（Temporal）
- `Z` の今日の日付を取得 → `ZonedDateTime` を構築
- DST gap: 前方スナップ。DST ambiguous: earlier を採用
- `E_target = zonedDateTime.epochSeconds`

ジャンプ決定
- `E_target` は選択TZの「今日/昨日/明日」の3候補から選ぶ
  - 範囲 `[E_start, E_end]`（`E_start = C + start`, `E_end = C + (end − GUARD)`）に含まれる候補があれば `E_end` に近い方
  - 含まれない場合は区間への距離が最小の候補を選ぶ
- `t_target = E_target − C`
- 範囲 `[start, end − GUARD]` に含まれれば `seek(t_target)`。含まれない場合は端比較（`E`空間距離で近い端。同距離は live edge）

広告検知
- `.ad-showing`, `.ytp-ad-player-overlay`, `#player-ads` を監視
- `AdState.active` を切替。active 中は seek/jump を抑止

## ■ エラーハンドリングと通知

- 入力不正: 正規化レイヤでエラー型を返却し、トーストで簡潔表示
- 校正未完: 暫定推定で実行し、完了後は内部で差分吸収
- 広告中: `An ad is playing, so seeking is paused.`
- 範囲外: `That time isn’t available — moved to the start.` など（実際の端に応じて文言を出し分け）

## ■ テスト戦略

単体（Vitest）
- `timeparse.ts`: 正規化と繰り上げの全境界ケース
- `timezone.ts`: 各 TZ の DST 境界日（gap/ambiguous）
- `calibration.ts`: median/MAD の動作、外れ値除去
- `jump.ts`: 端比較（同距離は live edge）

E2E（Playwright）
- TEST_MODE のビルドで `mock/` を matches に差し替え、video と seekable を操作可能に
- シナリオ: ±シーク、正確ジャンプ、範囲外クラップ、広告抑止、フルスクリーン UI

## ■ ビルドとパッケージング

- `vite-plugin-web-extension` で MV3 を出力
- manifest.json
  - permissions: `commands`, `storage`, `scripting`, `activeTab`
  - host_permissions: `https://www.youtube.com/*`, `https://www.youtube-nocookie.com/*`
  - content_scripts: `all_frames: true`, `run_at: document_end`
  - commands: Alt+Shift+S/D/F/G
- `npm run build` で zip 生成。ストア提出物を同梱

## ■ パフォーマンスとリソース

- デバッグパネルはレンダリング間引き（requestAnimationFrame またはタイマースロットリング）
- MutationObserver は観測対象をプレイヤー配下に限定
- GC 負荷を避けるため、ログリングは固定長配列を再利用

## ■ セキュリティ／プライバシー設計

- 外部通信なし、最小権限、CSP 準拠。外部 CDN を使用しない
- 保存は UI 状態のみ（カード位置・ピン、TZ、MRU）。個人情報は扱わない

## ■ 新機能設計（カスタムシークボタン）

### カスタムボタン UI 拡張
- **card.tsx の拡張**: 操作パネル3段目にカスタムボタン群を追加
- **レスポンシブレイアウト**: CSS Grid + Ghost DOM測定で 6×1 ↔ 3×2 のインテリジェント切り替え
  ```css
  .custom-buttons.row {
    grid-template-columns: repeat(var(--cols, 6), 1fr);
  }
  .custom-buttons.compact {
    grid-template-columns: repeat(3, 1fr);
  }
  /* Ghost DOM測定用の計測モード */
  .custom-buttons[data-measure="1"] {
    position: absolute !important;
    visibility: hidden !important;
    display: inline-flex !important;
    flex-wrap: nowrap !important;
  }
  ```

### データ構造とストレージ
- **型定義**: `CustomButton { label: string, seconds: number, enabled: boolean }`
- **保存先**: `localStorage['custom-buttons']` に配列形式
- **デフォルト値**: 6 ボタン設定を初期化時にロード
- **バリデーション**: `^[A-Za-z0-9+\-]{1,12}$` パターンマッチング

### シーク処理の共通化
- **core/seek.ts 拡張**:
  ```typescript
  export function seekBySeconds(video: HTMLVideoElement, seconds: number): void {
    const currentTime = video.currentTime;
    const targetTime = currentTime + seconds;
    const clampedTime = clampToPlayable(targetTime, getSeekableStart(video), getSeekableEnd(video));
    seek(video, clampedTime);
  }
  ```
- **既存ショートカット**: `seekBySeconds()` を呼び出すようリファクタリング
- **カスタムボタン**: 同じ `seekBySeconds()` を使用

### オプションページ拡張
- **options.tsx 拡張**: カスタムボタン設定セクションを追加
- **UI コンポーネント**: 
  - ボタン 1-6 の設定フォーム（ラベル + 秒数入力）
  - リアルタイムプレビュー表示
  - リセット/デフォルト復元ボタン
- **エラーハンドリング**: バリデーション失敗時の多言語エラー表示

### モジュール構成の追加
```
src/content/
  ui/
    card.tsx                    # カスタムボタン群を統合
    components/
      CustomButtons.tsx         # カスタムボタンコンポーネント
  core/
    seek.ts                     # seekBySeconds() 追加
  store/
    customButtons.ts            # カスタムボタン設定管理
    schema.ts                   # 設定スキーマ定義
  utils/
    validation.ts               # ラベルバリデーション

src/options/
  components/
    CustomButtonsSettings.tsx   # 設定UI
```

### 状態管理フロー
1. **初期化**: `localStorage` からカスタムボタン設定をロード
2. **UI 描画**: 有効なボタンのみ表示、レスポンシブレイアウト適用
3. **ボタンクリック**: `seekBySeconds(video, button.seconds)` を実行
4. **設定変更**: オプションページで設定更新 → `localStorage` 保存 → UI 再描画

### パフォーマンス考慮
- **ボタン描画**: `useMemo()` でボタン配列をメモ化
- **レイアウト計算**: `ResizeObserver` で画面幅変化を監視
- **設定保存**: デバウンス処理で連続入力時の保存負荷軽減

## ■ 多言語化システム（S16.6追加）

### カテゴリ分け辞書構造
```typescript
interface I18nDict {
  ui: {          // メインUI（ヘッダー、ボタン、プレースホルダー、ヘルプ）
    jump_header: string
    jump_button: string
    placeholder_time: string
    help_text: string
  }
  popup: {       // 編集ポップアップ
    label_with_max: string     // "表示ラベル（英数字, +, -, 12文字まで）"
    seconds_to_seek: string    // "移動秒数"
    save: string
    cancel: string
  }
  tooltip: {     // ツールチップ
    click_edit: string
    add_button: string
    edit_buttons: string
    show_buttons: string
    hide_buttons: string
    help: string
    close: string
    seconds_format: string     // "{0} seconds" / "{0}秒"
  }
  toast: {       // トースト通知
    moved_current: string
    moved_start: string
    ad_paused: string
    clamped: string
  }
}
```

### 使用方法
```typescript
// カテゴリ分けキー
t('ui.jump_header')           // 'Jump to timestamp' / 'タイムスタンプへジャンプ'
t('popup.save')               // 'Save' / '保存'
t('tooltip.click_edit')       // 'Click to edit' / 'クリックして編集'

// テンプレート（引数付き）
t('tooltip.seconds_format', '+30')  // '+30 seconds' / '+30秒'
formatSeconds(30)                    // 便利関数
```

### 特徴
- **型安全**: TypeScript インターフェースで型チェック
- **後方互換**: 既存の flat キー（`toast_*` など）も継続サポート
- **適切な用語**: 日本語では「シーク」→「移動」など自然な表現を採用

## ■ 将来拡張フック

- 任意分数の長時間シーク設定
- より高度な広告検知の切替可能化
- タイムゾーンのインポート/エクスポート
- 言語追加（韓国語、中国語など）

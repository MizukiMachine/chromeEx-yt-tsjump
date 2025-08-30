# YouTube 長時間シーク & 時刻ジャンプ — Requirements

## ■ 目的と背景

YouTube の長尺動画および DVR 対応ライブ配信に対して、以下を提供する。
- 長時間シーク（±10 分／±60 分）
- 選択タイムゾーンのローカル時刻へジャンプ（24 時間表記のみ、DST を含む）
- キーボードショートカット操作と軽量 UI（Jump ボタン＋入力カード）
- 広告再生中の安全な抑止、端クランプ、デバッグ可視化

## ■ スコープ

対象
- デスクトップ版 Chrome の YouTube 視聴ページ（VOD、DVR 有効ライブ）
- 埋め込みプレイヤー（`youtube.com` / `youtube-nocookie.com` の iframe）にベストエフォートで対応

スコープ外
- 広告スキップ、DVR 無効を回避する機能
- モバイル版 Chrome（拡張機能は未対応）
- 外部同期／クラウド保存／アカウント連携

## ■ 定義・用語

- t（media time）: 動画上の秒数
- E（epoch）: 世界共通の秒（Unix 時刻）
- C（offset）: キャリブレーションで推定するオフセット。概ね E ≈ C + t を満たす
- start, end: `video.seekable.start(0)`, `video.seekable.end(0)`
- live edge: ライブ配信の最終到達点（実装上は end 近傍）
- GUARD: 3 秒。終端での意図しない停止を防ぐ保護帯
- TZ（timezone）: 選択するタイムゾーン。MRU（最近使った順）を先頭表示

## ■ 機能要件（FR）

FR-1 長時間シーク
- 既定ショートカット: Alt+Q（−60）、Alt+A（−10）、Alt+W（＋60）、Alt+S（＋10）
- シークは [start, end−GUARD] にクランプ
- 入力中（IME 変換含む）は誤作動防止のためショートカットを抑止

FR-2 時刻ジャンプ（選択タイムゾーン）
- 入力形式: `HH:mm`, `HH:mm:ss`, `HHmm`, `HHmmss`（24 時間表記のみ）
- 自動補正: 欠落秒は `:00`。分・秒が 60 以上は繰り上げ（例: `08:80` → `09:20:00`）。補正後に `HH>=24` は当日外
- タイムゾーン: 入力カード右上で選択。既定は `Europe/Amsterdam`。MRU 先頭 5 件、残りはアルファベット順
- 初期リスト: `Asia/Tokyo`, `Europe/Amsterdam`, `Africa/Windhoek`, `America/New_York`, `America/Los_Angeles`, `Europe/London`, `Europe/Berlin`, `Australia/Sydney`, `UTC`, `Asia/Singapore`
- 日付の決定: 選択 TZ の「今日」に入力時刻を結合
- DST: ギャップは前方スナップ。曖昧は先に現れる時刻を採用
- ジャンプ計算: `t_target = E_target − C`
- 範囲外入力: epoch 基準で `E_start = C+start`, `E_end = C+(end−GUARD)` と比較し、近い方にジャンプ（同距離は live edge 優先）

FR-3 キャリブレーション（非ブロッキング）
- 開始: ページ読み込み直後にバックグラウンドで実施（最大 6 秒、1 秒間隔サンプリング）
- 推定: サンプルの中央値を C とし、中央値±0.75 秒を外れ値として除去（厳しくしない）
- 暫定推定: 完了前でも少数サンプルで一時値を返し、完了後に差分を吸収
- 再測定トリガ: seekable 範囲が 60 秒以上変化、10 分ごとの軽量再測定（3 点）、実測ズレ 3 秒超

FR-4 ユーザーインターフェース
- Jump ボタン: YouTube コントロール群近傍に設置。クリックで入力カード開閉
- 入力カード: ドラッグ移動、ピン留め、位置とピン状態、選択 TZ を `localStorage` に保存。フルスクリーン時も可視
- キー操作: Alt+Shift+J（カード開閉・フォーカス）、Enter（ジャンプ実行）、Esc（閉じる）

FR-5 通知
- 文体: Friendly（英語）
- 例: `Jumped to the live edge for you.` / `That time isn’t available — moved to the start.` / `An ad is playing, so seeking is paused.` / `Clamped to playable range.`

FR-6 広告検知
- 方式: MutationObserver で `.ad-showing`, `.ytp-ad-player-overlay`, `#player-ads` などを監視
- 広告中はシーク／ジャンプを抑止し、簡潔なトーストで通知。解除後は復帰

FR-7 埋め込み対応（ベストエフォート）
- `content_scripts.all_frames: true` でプレイヤー iframe に注入
- 親ページ DOM には依存しない。プレイヤー内の動画要素と UI のみ制御

FR-8 ログとデバッグ
- Alt+Shift+D で右下デバッグパネル開閉。最新 N=200 のリングバッファ
- 表示項目: seekable 範囲、live edge、選択 TZ、入力文字列、正規化結果、E_target、C、t_target、クランプ理由、広告状態、最終アクション
- Copy debug snapshot ボタンでクリップボード出力
- 詳細は DevTools Console にも出力（verbose）

FR-9 設定（オプション）
- デバッグ既定の切替、TZ 初期リストの編集、通知文言トーン（将来）

## ■ 非機能要件（NFR）

NFR-1 性能
- UI 操作は非同期・非ブロッキング。ジャンプ／シークは 100ms オーダで応答
- デバッグパネル表示中も動画再生に支障を与えない（レンダリング間引き）

NFR-2 セキュリティ／プライバシー
- 外部通信なし。最小権限（`commands`, `storage`, `scripting`, `activeTab`）
- host permissions は `youtube.com` / `youtube-nocookie.com` に限定
- CSP 準拠（インライン禁止、外部 CDN 不使用）
- 保存データは `localStorage` のみ（カード位置、ピン状態、選択 TZ、MRU）

NFR-3 アクセシビリティ
- 入力カードは `role="dialog"` と `aria-label` を付与。閉じると動画へフォーカス復帰

NFR-4 互換性
- Chrome Stable 現行。Manifest V3。デスクトップのみ

NFR-5 国際化
- 既定は英語 UI。将来的に多言語化を許容（本文言はフラグで切替可能な設計）

## ■ 受け入れ基準（概要）

- VOD/DVR で ±10/±60 が正しく動作し、端でクランプ
- 時刻ジャンプ: 4 種の入力形式を受理、DST 境界日を含め期待どおりにシーク
- 範囲外入力時は距離比較で近い端へ（同距離は live edge）
- 広告中は抑止され、解除後に復帰
- デバッグパネルで全指標が観測可能、スナップショットが仕様どおり
- 埋め込みで基本操作が動作（ベストエフォート）

## ■ リスクと緩和

- YouTube DOM 変更: 監視セレクタを冗長化。判定不明時は安全側（抑止）
- DST／TZ 差異: Temporal を優先し、境界ケースの単体テストを多数用意
- 端付近の不安定: GUARD=3 秒、クランプ動作を徹底

## ■ リリース・配布

- Chrome Web Store に提出（Public または Unlisted）
- パッケージにはアイコン、説明、スクリーンショット、CHANGELOG を含む


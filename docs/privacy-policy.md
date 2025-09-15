# プライバシーポリシー

最終更新日: 2025-09-16

本拡張機能「YouTube TSジャンプ」（以下「本拡張」）は、ユーザーの個人情報を収集・外部送信しません。設定や一時的な状態はブラウザ内にのみ保存されます。

## 1. 収集するデータ
- 本拡張は、個人を特定できる情報（氏名、メールアドレス等）を収集しません。
- 利用状況の解析（アナリティクス）やトラッキングは行いません。

## 2. 保存するデータ（ローカル）
- ブラウザ内の `chrome.storage` または `localStorage` に、以下の設定が保存されます。
  - カスタムスキップボタンの設定（ラベル・秒数）
  - 言語設定・タイムゾーンの選択履歴（MRU）
  - デバッグ表示のオン/オフ、コピー件数
- これらのデータは端末内に保存され、拡張から外部サーバーへ送信されることはありません。
- Chrome の同期機能を利用している場合、Google アカウントにより端末間で同期されることがあります（同期間の管理はブラウザ設定に従います）。

## 3. 権限について
- `activeTab` / `tabs` / `scripting` / `storage` / `commands` を使用します。
- コンテンツスクリプトの注入先は YouTube ドメイン（youtube.com / youtube‑nocookie.com）に限定されています。

## 4. 第三者提供・広告
- 第三者へデータを提供しません。
- 広告配信・トラッキングを行いません。

## 5. 子どものプライバシー
- 本拡張は子どもを主な対象としていません。

## 6. 本ポリシーの変更
- 必要に応じて本ポリシーを更新します。重要な変更がある場合はリポジトリ上で告知します。

## 7. お問い合わせ
- 不具合報告・ご要望は GitHub の Issue へお寄せください。

---

# Privacy Policy

Last updated: 2025‑09‑16

"YouTube TS Jump" (the "Extension") does not collect or transmit any personally identifiable information. Preferences are stored locally in your browser.

## 1. Data Collection
- The Extension does not collect personal data.
- No analytics, tracking, or telemetry is performed.

## 2. Local Storage
- The Extension stores the following settings in `chrome.storage` or `localStorage`:
  - Custom skip button configuration (labels and seconds)
  - Language and timezone MRU
  - Debug visibility and copy count
- These values stay on your device and are not sent to external servers.
- If Chrome Sync is enabled, the browser may sync settings across your devices (managed by Chrome).

## 3. Permissions
- Uses `activeTab`, `tabs`, `scripting`, `storage`, and `commands`.
- Content scripts are limited to YouTube domains (youtube.com / youtube‑nocookie.com).

## 4. Third Parties & Ads
- No data is shared with third parties.
- No advertising or tracking is included.

## 5. Children’s Privacy
- The Extension is not directed to children.

## 6. Changes to This Policy
- We may update this policy and will announce significant changes in the repository.

## 7. Contact
- Please open an Issue on GitHub for questions or requests.


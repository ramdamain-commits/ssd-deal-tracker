# Repo Rules

- 親 `C:\Users\ramda\projects\CLAUDE.md` を先に適用する
- 現行仕様の正本は `README.md` + `CHANGELOG.md`。初期設計の経緯は `docs/superpowers/specs/2026-03-18-ssd-deal-tracker-design.md` を参照
- 構成: GAS バックエンド（`gas/*.gs`）が `WebApp.gs` の `doGet` で products / price_history を JSON API として公開し、静的フロントエンド（`pages/app.js`）が fetch して表示する。同じ API はもう1箇所、別 repo の portal（`../portal/index.html` 内 `initSsdWidget`）からも fetch されている（repo をまたぐ依存）
- GAS コードは clasp push でデプロイ。コミット後は `cd gas && npx @google/clasp push` もセットで実行する
- **GAS 再デプロイでデプロイ ID が変わったら**: (1) `pages/app.js` の API_URL を更新、(2) portal の SSD ウィジェット JS（`index.html` 内 `initSsdWidget` の `API_URL`）を更新、(3) `setting/scripts/Invoke-DeploySmokeTest.ps1` の allowedPatterns を更新
- 文字コードは UTF-8

## スクレイピング

- User-Agent だけでなく Accept, Accept-Language, Referer 等の完全なヘッダーセットを設定する
- 価格取得は JSON-LD を優先し、正規表現は fallback にする
- 連続失敗が出たときの原因切り分け: ページ HTML に `prdlprc: 0` + 「現在価格情報の登録がありません」が出ていれば、HTML構造変更ではなく**取扱店舗ゼロ状態**。NAND高騰等で在庫が消えると発生する。Python の `urllib` で当該ページを取得し `cp932` でデコードしてキーワード確認する

## マイグレーション関数

- 過去のマイグレーション関数（setupSheets〜migration202604d）は全て実行済み・コードから削除済み。config シートにフラグのみ残る
- 次回ラインナップ更新時は新しいマイグレーション関数を追加する
- マイグレーション関数を書くときはデフォルト値やフォールバック値（`|| N`）も全箇所更新すること（`gas/*.gs` を `|| ` で grep して洗い出す）
- マイグレーション関数にはヘッダー追加・フラグ登録など付随作業も含め、手動作業ゼロで完結させる

## 通知メール

- 通知メールの有効/無効は `Config.gs` のフラグ定数（例 `DAILY_SUMMARY_ENABLED`）で制御し、各送信関数の冒頭で早期リターンする。GASの時間トリガーはエディタUIの手動設定でコード管理外なので、トリガーを消し忘れてもフラグが false ならメールは飛ばない安全装置になる（2026-06-08 日次サマリー無効化で導入）
- メール送信関数: `sendDealNotifications`（買い時即時・`checkAllPrices`内）/ `sendWeeklySummary`（週次トリガー）/ `sendDailySummary`（無効化中）

## GAS 実行の注意

- エディタの「実行」ボタンから呼ぶ関数では `SpreadsheetApp.getUi().alert()` が使えない（コンテキストエラーになる）。結果出力は `Logger.log()` を使う
- `getUi().alert()` はスプレッドシートのカスタムメニュー経由でのみ使用可能

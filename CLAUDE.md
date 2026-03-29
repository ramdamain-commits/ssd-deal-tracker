# Repo Rules

- 親 `C:\Users\ramda\projects\CLAUDE.md` を先に適用する
- 現行仕様の正本は `README.md` + `CHANGELOG.md`。初期設計の経緯は `docs/superpowers/specs/2026-03-18-ssd-deal-tracker-design.md` を参照
- GAS コードは clasp push でデプロイ
- 文字コードは UTF-8

## スクレイピング

- User-Agent だけでなく Accept, Accept-Language, Referer 等の完全なヘッダーセットを設定する
- 価格取得は JSON-LD を優先し、正規表現は fallback にする

## マイグレーション関数

- `seedProducts()` → `fixProducts()` → `updateProducts2026()` の順で積み重なっている
- 次回ラインナップ更新時は新しいマイグレーション関数を追加し、古いものはアーカイブを検討する
- マイグレーション関数を書くときは `setupSheets()` のデフォルト値やフォールバック値（`|| N`）も全箇所更新すること

# Repo Rules

- 親 `C:\Users\ramda\projects\CLAUDE.md` を先に適用する
- 正本は `docs/superpowers/specs/2026-03-18-ssd-deal-tracker-design.md`
- GAS コードは clasp push でデプロイ
- 文字コードは UTF-8

## スクレイピング

- User-Agent だけでなく Accept, Accept-Language, Referer 等の完全なヘッダーセットを設定する
- 価格取得は JSON-LD を優先し、正規表現は fallback にする

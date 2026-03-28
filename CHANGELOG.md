# Changelog

このプロジェクトの主な変更履歴を記録する。

## v1.1.0 — ラインナップ拡充・閾値見直し (2026-03-28)

### Added
- 2TB モデル3機種を追加（990 PRO HS / SN850P / T500 HS）
- WD_BLACK SN7100 1TB を追加（SN850X 後継の注目モデル）
- Samsung 9100 PRO HS 2TB を追加（Gen5 大容量枠）
- チャートカラーを14色に拡張

### Changed
- 既存9製品の target_price を 2026年3月の相場に合わせて引き上げ
- price_threshold_pct を 5→10 に変更（「もう少し」判定の幅を拡大）

### Removed
- Seagate FireCuda 530 Heatsink 1TB（旧世代・在庫減少のため監視終了）

## v1.0.0 — 初期リリース (2026-03-19)

### Added
- GAS による価格.com 10機種の最安値自動追跡（JSON-LD パース）
- 目標価格を下回った場合の Gmail 通知
- GitHub Pages ビューページ（カード表示 + Chart.js 価格推移チャート）
- Toast 進捗表示
- 週次サマリーメール機能（毎週月曜、トレンド分類付き）
- 週次メールに価格.com URL を追記

### Fixed
- モバイルレスポンシブ対応（カード幅・overflow・word-break）
- モバイルチャート表示改善（aspectRatio 1:1、フォント縮小、軸ラベル非表示）
- fetch 中のローディング表示追加

### Docs
- AGENTS.md 追加（Codex 連携用リポルール）

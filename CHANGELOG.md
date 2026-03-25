# Changelog

このプロジェクトの主な変更履歴を記録する。

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

# Changelog

このプロジェクトの主な変更履歴を記録する。

## v1.2.1 — GAS メール通知修正・運用ドキュメント整備 (2026-04-15)

### Fixed
- GAS メール通知の絵文字（🔥👀等）を BMP 記号（★▶⚠等）に置換（ConvertTo-Json 互換性・文字化け対応）(e2befce)

### Docs
- GAS 再デプロイ時の URL 更新チェックリストを追加（CLAUDE.md に反映済み）(7537ce5)

## v1.2.0 — ラインナップ見直し・フィルタ整理 (2026-04-07)

### Changed
- 追跡対象を14製品→5製品に絞り込み（1TB・3万円以下に集中）
- 残り5製品の target_price を市場価格の90%に更新
- メーカーフィルタから Samsung・ADATA を削除

### Removed
- 2TB 全4製品（Samsung 990 PRO HS / WD SN850P / Crucial T500 HS / Samsung 9100 PRO HS）
- 高額1TB 4製品（Samsung 990 PRO HS / WD SN850X HS / Samsung 9100 PRO / Samsung 990 PRO）
- ADATA LEGEND 960 1TB（1店舗のみ）
- 容量フィルタ（全製品1TBのため不要に）

### Fixed
- 前回セッション分: Shift_JIS デコード修正、店舗数パース修正、異常値検出削除、コード整理(-413行)、チャート日付ソート修正

## 2026-03-29

### Changed

- 正本参照を設計書から README.md + CHANGELOG.md に変更（CLAUDE.md, AGENTS.md）
- 初期設計書に「初期設計記録」注記を追加し、現行仕様との差異を注記

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

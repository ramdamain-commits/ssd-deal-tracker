# v1.2.0 ラインナップ見直し設計書

## 背景

- 2026年3-4月にかけて NAND フラッシュの値上がりにより、全 SSD 製品が大幅に価格上昇
- 全14製品で target_price が市場価格の 1/2〜1/4 になり、追跡が実質的に機能していない
- ユーザーの購入目的: PS5用 1TB SSD を3万円以下で購入したい

## 変更概要

14製品 → 5製品に絞り込み。2TB 全廃、高額ハイエンド削除、店舗少の ADATA 削除。

## 削除する製品（9製品）

### 2TB（4製品）— 予算外
| product_id | 名前 |
|-----------|------|
| samsung-990-pro-hs-2tb | Samsung 990 PRO with Heatsink 2TB |
| wd-black-sn850p-2tb | WD_BLACK SN850P for PS5 2TB |
| crucial-t500-hs-2tb | Crucial T500 with Heatsink 2TB |
| samsung-9100-pro-hs-2tb | Samsung 9100 PRO with Heatsink 2TB |

### 高額1TB（4製品）— 4.7万円〜5.4万円で予算の1.6〜1.8倍
| product_id | 名前 |
|-----------|------|
| samsung-990-pro-hs-1tb | Samsung 990 PRO with Heatsink 1TB |
| wd-black-sn850x-hs-1tb | WD_BLACK SN850X with Heatsink 1TB |
| samsung-9100-pro-1tb | Samsung 9100 PRO 1TB |
| samsung-990-pro-1tb | Samsung 990 PRO 1TB |

### 店舗少（1製品）— 1店舗のみで価格競争が期待できない
| product_id | 名前 |
|-----------|------|
| adata-legend-960-1tb | ADATA LEGEND 960 (Dospara) 1TB |

## 残す製品（5製品）+ 新 target_price

target_price は市場価格の90%（切り捨て100円単位）で設定。

| product_id | 名前 | 市場価格 (2026-04-07) | 新 target_price |
|-----------|------|---------------------|----------------|
| crucial-t500-hs-1tb | Crucial T500 with Heatsink 1TB | ¥28,800 | ¥25,900 |
| crucial-t500-1tb | Crucial T500 1TB | ¥29,280 | ¥26,400 |
| kioxia-exceria-plus-g3-1tb | KIOXIA EXCERIA PLUS G3 1TB | ¥28,105 | ¥25,300 |
| kioxia-exceria-plus-g4-1tb | KIOXIA EXCERIA PLUS G4 1TB | ¥30,862 | ¥27,800 |
| wd-black-sn7100-1tb | WD_BLACK SN7100 1TB | ¥32,250 | ¥29,000 |

## 実装項目

### 1. マイグレーション関数 `migration202604e()`（Config.gs）

- products シートから削除対象9製品の行を削除（下から順に削除して行番号ズレ防止）
- 残り5製品の target_price を更新
- マイグレーションガードで二重実行防止
- Menu.gs にメニュー項目追加

### 2. フィルタバー整理（pages/index.html + pages/app.js）

- **容量フィルタ**: グループ丸ごと削除（全製品1TBなので不要）
- **メーカーフィルタ**: Samsung, ADATA ボタンを削除。残り: 全て / WD / Crucial / KIOXIA
- **app.js `detectBrand()`**: samsung, adata の判定を削除
- **app.js `filterState`**: capacity を削除。URL パラメータ `?capacity=` も非対応に

### 3. ドキュメント更新

- **README.md**: 「14機種」→「5機種」、ラインナップ表更新、フィルタ説明更新、マイグレーション表に `migration202604e` 追加
- **CHANGELOG.md**: v1.2.0 エントリ追加
- **mock-data.json**: 5製品に合わせて更新

### 4. price_history の扱い

- 削除した製品の価格履歴は price_history シートにそのまま残す（過去データとして保持）
- チャートには残存5製品のみ表示される（product_id ベースでフィルタされるため自動的に対応）

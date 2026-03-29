# PS5 SSD Deal Tracker

PS5対応SSD 14機種（1TB/2TB）の価格を自動追跡し、目標価格を下回ったらメール通知するシステム。

## 機能

- 価格.com から1日2回自動で最安値を取得
- 目標価格を下回ったら Gmail で購入リンク付き通知
- 取得エラー時のアラートメール（連続3回失敗で警告）
- GitHub Pages で価格一覧・推移チャートを公開
- Spreadsheet カスタムメニューで SSD の追加・削除・バリデーション
- 容量・メーカー・ステータスの3軸フィルタで絞り込み（詳細は[フィルタ機能](#フィルタ機能)参照）

## 技術スタック

- Google Apps Script + Google Spreadsheet
- GitHub Pages + Chart.js
- clasp (GASデプロイ)

## セットアップ

### 1. Google Spreadsheet の準備

1. Google Spreadsheet を新規作成（名前: `SSD Deal Tracker`）
2. シート名を `products`, `price_history`, `config` に変更
3. products シートのヘッダー行（A1:N1）:
   ```
   product_id | name | capacity | kakaku_url | target_price | current_price | lowest_price | recent_avg_price | last_checked | last_notified | shop_name | shop_url | consecutive_fail_count | status
   ```
4. price_history シートのヘッダー行（A1:D1）:
   ```
   product_id | checked_at | price | source
   ```
5. config シートにデータ入力:
   | key | value |
   |-----|-------|
   | notify_email | (あなたのメールアドレス) |
   | cooldown_hours | 24 |
   | price_threshold_pct | 10 |

### 2. clasp push

1. 拡張機能 → Apps Script でプロジェクトを開き、scriptId を控える
2. `gas/.clasp.json` の `scriptId` を更新
3. `cd gas && npx @google/clasp push`

### 3. GAS Web App デプロイ

1. GAS エディタ → デプロイ → 新しいデプロイ
2. 種類: ウェブアプリ / 実行ユーザー: 自分 / アクセス: 全員
3. 表示されたURLを `pages/app.js` の `API_URL` に設定

### 4. GAS トリガー設定

1. GAS エディタ → トリガー → 新しいトリガー
2. 関数: `checkAllPrices` / 時間主導型 / 日付ベース / 午前9時〜10時
3. 同様にもう1つ: 午後8時〜9時

### 5. GitHub Pages 有効化

1. リポジトリの Settings → Pages
2. Source: Deploy from a branch / Branch: main / Folder: /pages

## フィルタ機能

GitHub Pages の一覧ページ上部に3つのフィルタバーがある。各フィルタはピル型ボタンで切り替え、複数軸を組み合わせた AND 絞り込みに対応する。

| フィルタ軸 | 選択肢 | 説明 |
|-----------|--------|------|
| 容量 | 全て / 1TB / 2TB | 製品の容量で絞り込む。追跡対象に応じてボタンは追加可能 |
| メーカー | 全て / Samsung / WD / Crucial / KIOXIA / ADATA | 製品名からブランドを自動判定して絞り込む |
| ステータス | 全て / 買い時 / 高め / 未取得 | 目標価格との比較結果で絞り込む。「未取得」は取得エラーの製品を含む |

- 絞り込み条件は URL クエリパラメータ（例: `?capacity=2tb&brand=samsung&status=買い時`）に反映され、リンク共有やブックマークに対応する
- 条件に一致する製品がない場合は「条件に一致する製品がありません。」を表示する

## ラインナップ更新（マイグレーション）

製品の追加・削除・`target_price` 一括更新は、`Config.gs` に定義されたマイグレーション関数で管理する。

| 関数 | 内容 |
|------|------|
| `seedProducts()` | 初期10機種を一括登録（初回のみ） |
| `fixProducts()` | 販売終了4件を差し替え |
| `updateProducts2026()` | 2026-03 ラインナップ更新（FireCuda 530 HS 削除、2TB 3機種 + SN7100 追加、target_price 更新） |

**実行手順:** スプレッドシートを開き、「SSD管理」メニュー → 実行したい関数を選択。各関数は一度だけ実行すること。

> 次回ラインナップ更新時は、新しいマイグレーション関数を `Config.gs` に追加する（既存関数は変更しない）。

## ファイル構成

```
ssd-deal-tracker/
├── CLAUDE.md                 # repo固有ルール
├── README.md                 # このファイル
├── gas/
│   ├── appsscript.json       # GASマニフェスト
│   ├── .clasp.json           # clasp設定
│   ├── Config.gs             # 定数・シート名・ヘルパー
│   ├── Scraper.gs            # 価格.com スクレイピング
│   ├── PriceChecker.gs       # 価格取得フロー・バリデーション
│   ├── Notifier.gs           # メール通知
│   ├── WebApp.gs             # JSON API
│   └── Menu.gs               # カスタムメニュー
└── pages/
    ├── index.html            # ビューページ
    ├── style.css             # スタイル
    ├── app.js                # データ取得・描画
    └── mock-data.json        # 開発用モックデータ
```

# PS5 SSD Deal Tracker

PS5対応SSD 14機種（1TB/2TB）の価格を自動追跡し、目標価格を下回ったらメール通知するシステム。

## 機能

- 価格.com から1日2回自動で最安値を取得
- 目標価格を下回ったら Gmail で購入リンク付き通知
- 取得エラー時のアラートメール（連続3回失敗で警告）
- GitHub Pages で価格一覧・推移チャートを公開
- Spreadsheet カスタムメニューで SSD の追加・削除・バリデーション

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

# PS5用SSD価格トラッキング＆通知システム 設計書

> **注記（2026-03-29 追記）**: この文書は 2026-03-18 時点の初期設計記録である。現行仕様（追跡対象・閾値等）は [README.md](../../../README.md) および [CHANGELOG.md](../../../CHANGELOG.md) を参照すること。

## 概要

PS5対応M.2 NVMe Gen4 SSDの価格を自動追跡し、目標価格を下回ったらメール通知するシステム。
ビューページで全体の価格状況を一覧でき、通知メールからワンクリックで購入ページへ遷移できる。

## 目的

- SSDの買い時を逃さない（毎日の手動チェックを不要にする）
- 複数SSDの価格を横断比較できる
- 目標価格を下回ったら、購入リンク付きメールで即座に行動できる

## 技術スタック

| 要素 | 技術 | 理由 |
|------|------|------|
| バックエンド | Google Apps Script (GAS) | healthcare プロジェクトで運用実績あり、無料 |
| データベース | Google Spreadsheet | GAS との親和性、視覚的にデータ確認可能 |
| 通知 | Gmail (GmailApp) | GAS からノーコスト・ノー設定で送信可能 |
| ビューページ | GitHub Pages | 無料静的ホスティング |
| チャート | Chart.js | 軽量で導入が容易 |
| デプロイ | clasp | 既存の GAS デプロイワークフローを踏襲 |

## 追跡対象SSD

すべて PS5 拡張スロット要件（M.2 2280 / PCIe Gen4 x4 / シーケンシャルリード 5,500MB/s 以上 / ヒートシンク込み高さ 11.25mm 以内）を満たすモデル。1TB と 2TB の計14系統を追跡する。

> **変更履歴**: 初期設計時は 1TB × 10機種だったが、v1.1.0（2026-03-28）で 2TB モデル3機種・SN7100・Samsung 9100 PRO HS を追加し、FireCuda 530 HS を削除して14系統に拡張した。詳細は CHANGELOG.md を参照。

| # | 製品 | 容量 | リード速度 | ヒートシンク | 特徴 |
|---|------|------|-----------|-------------|------|
| 1 | WD_BLACK SN850X with Heatsink | 1TB | 7,300 MB/s | 付属 | PS5公式推奨、定番中の定番 |
| 2 | WD_BLACK SN850P for PS5 | 1TB | 7,300 MB/s | 付属 | PS5公式ライセンス品 |
| 3 | Samsung 990 PRO with Heatsink | 1TB | 7,450 MB/s | 付属 | 最速クラス、高信頼性 |
| 4 | Crucial T500 with Heatsink | 1TB | 7,300 MB/s | 付属 | コスパ良好、頻繁にセール |
| 5 | Nextorage NEM-PAB | 1TB | 7,300 MB/s | 付属 | ソニーグループ、PS5相性◎ |
| 6 | Corsair MP600 PRO LPX | 1TB | 7,100 MB/s | 付属 | PS5専用設計ヒートシンク |
| 7 | Kingston FURY Renegade with Heatsink | 1TB | 7,300 MB/s | 付属 | 高耐久・高速 |
| 8 | ADATA Legend 960 MAX | 1TB | 7,400 MB/s | 付属 | 廉価帯で人気 |
| 9 | Team Group T-FORCE CARDEA A440 PRO | 1TB | 7,000 MB/s | 付属 | コスパ重視の選択肢 |
| 10 | WD_BLACK SN7100 | 1TB | — | — | SN850X 後継の注目モデル（v1.1.0 追加） |
| 11 | Samsung 990 PRO with Heatsink | 2TB | 7,450 MB/s | 付属 | 大容量枠（v1.1.0 追加） |
| 12 | WD_BLACK SN850P for PS5 | 2TB | 7,300 MB/s | 付属 | 大容量枠（v1.1.0 追加） |
| 13 | Crucial T500 with Heatsink | 2TB | 7,300 MB/s | 付属 | 大容量枠（v1.1.0 追加） |
| 14 | Samsung 9100 PRO with Heatsink | 2TB | — | 付属 | Gen5 大容量枠（v1.1.0 追加） |

※ Seagate FireCuda 530 Heatsink 1TB は旧世代・在庫減少のため v1.1.0 で監視終了。
※ 製品の追加・削除はカスタムメニュー「SSD管理」またはスプレッドシート直接編集で対応可能。

## データ構造

### `products` シート — 製品マスター

| カラム | 型 | 説明 |
|--------|------|------|
| product_id | string | 一意識別子（例: `wd-sn850x-1tb`） |
| name | string | 製品名 |
| capacity | string | 容量（`1TB` / `2TB`） |
| kakaku_url | string | 価格.com 製品ページURL |
| target_price | number | 目標購入価格（円） |
| current_price | number | 最新取得価格（円） |
| lowest_price | number | 過去最安値（円） |
| recent_avg_price | number | 直近30日平均価格（円） |
| last_checked | datetime | 最終価格取得日時 |
| last_notified | datetime | 最終通知送信日時（クールダウン用） |
| shop_name | string | 最安ショップ名 |
| shop_url | string | 最安ショップの購入ページURL |
| consecutive_fail_count | number | 連続取得失敗回数（成功時に0リセット） |
| status | string | `買い時` / `もう少し` / `高め` / `取得エラー` |

### `price_history` シート — 価格推移ログ

| カラム | 型 | 説明 |
|--------|------|------|
| product_id | string | 製品ID |
| checked_at | datetime | 取得日時 |
| price | number | 取得価格（円） |
| source | string | 取得元（`kakaku.com`） |

### `config` シート — 設定

| key | value | 説明 |
|-----|-------|------|
| notify_email | (メールアドレス) | 通知先 |
| cooldown_hours | 24 | 同一製品の通知間隔（時間） |
| price_threshold_pct | 10 | 目標価格からのバッファ（%）。10%以内なら「もう少し」（初期設計時は 5% だったが、v1.1.0 で 10% に拡大） |

## 価格取得

### 方式

GAS の `UrlFetchApp` で価格.com の製品ページHTMLを取得し、最安値をパースする。

**パース対象の HTML 要素**（CSSセレクタ・class名等）は実装時に実機確認して確定させること。価格.com の構造はバージョンアップで変わるため、設計書に固定値を記載しない。Bot対策（403/429レスポンス）で取得できなかった場合は、即座に `status = 取得エラー` として処理する。

### フロー

```
GASトリガー（1日2回: 9時・20時）
  ↓
products シートから全製品の kakaku_url を取得
  ↓
各URLに UrlFetchApp.fetch() を実行
  ↓
HTMLから最安値・最安ショップ名・ショップURLをパース
  ↓
バリデーション（null/0/異常値チェック）
  ├─ 正常 → price_history に追記、products を更新
  └─ 異常 → status を「取得エラー」に設定、エラーアラートメール送信
  ↓
閾値チェック → 条件合致 & クールダウン経過 → 通知メール送信
```

### スクレイピング失敗検知（レビュー反映）

批判派・技術審査官の指摘を受け、以下の安全装置を初期実装に含める：

1. **バリデーション**: 取得価格が null / 0 / 前回比50%以上変動の場合は異常値として扱う
2. **エラーアラート**: 取得失敗時に即座にメールで通知（「価格取得に失敗しました: 〇〇」）
3. **ステータス反映**: 失敗した製品は `status = 取得エラー` として、ビューページでも視覚的に分かるようにする
4. **連続失敗カウント**: 3回連続失敗でサマリーアラートメール送信（HTMLパース修正が必要な可能性）

### 制約事項

- 価格.com の HTML 構造変更でパースが壊れる可能性がある → 失敗検知で早期発見
- GAS の UrlFetch は JS レンダリング不可 → 価格.com のサーバーサイドレンダリング部分に依存
- 1日2回 × 14系統 = 28回のfetch → GAS無料枠（20,000回/日）に対して十分余裕（初期設計時は10機種前提で10〜12回だった）

## 通知

### メール通知

**トリガー条件**: `current_price <= target_price` かつ `last_notified` から `cooldown_hours` 経過

**メール内容**:
```
件名: 【買い時】{製品名} が目標価格を下回りました！

{製品名} ({容量})
現在価格: ¥{current_price}（目標: ¥{target_price}）
目標との差額: ¥{target_price - current_price} お得！
過去最安値: ¥{lowest_price}

▶ 最安ショップで購入: {ショップ名}
  {購入URL}

▶ 価格.comで詳細を見る:
  {kakaku_url}

※ 価格.com表示価格です。送料別の場合があります。
※ 価格一覧ページ: {GitHub Pages URL}
```

**クールダウン状態の保存**: `products` シートの `last_notified` 列に記録。GAS再起動時も状態が保持される。

### エラーアラートメール

```
件名: 【SSD Tracker】価格取得エラー

以下の製品で価格取得に失敗しました:
- {製品名}: {エラー内容}

{連続失敗3回の場合}
⚠ 連続3回失敗しています。価格.comのHTML構造が変更された可能性があります。
パースロジックの確認をお願いします。
```

## ビューページ

### 構成

GitHub Pages で公開する静的ページ。GAS Web App (`doGet`) が Spreadsheet データを JSON で返し、フロントエンドで表示。

### 画面要素

1. **ヘッダー**: タイトル + 最終更新日時（目立つ位置に表示）
2. **製品カード一覧**: 各SSDごとにカード表示
   - 製品名・容量
   - 現在価格（大きく）
   - 目標価格
   - 過去最安値 / 直近30日平均（目標価格設定のガイド）
   - ステータスバッジ: 「買い時！」(緑) / 「もう少し」(黄) / 「高め」(灰) / 「取得エラー」(赤)
   - 購入リンクボタン
3. **価格推移チャート**: Chart.js で各製品の価格推移を折れ線グラフ表示
4. **フッター注記**: 「※ 価格.com表示価格。送料別の場合があります」

### ステータス判定ロジック

| 条件 | ステータス | バッジ色 |
|------|----------|---------|
| `current_price <= target_price` | 買い時！ | 緑 |
| `current_price <= target_price * (1 + threshold_pct/100)` | もう少し | 黄 |
| `current_price > target_price * (1 + threshold_pct/100)` | 高め | 灰 |
| 取得失敗 | 取得エラー | 赤 |

### GAS Web App API

`doGet()` で以下の JSON を返す:

```json
{
  "updated_at": "2026-03-18T20:00:00+09:00",
  "products": [
    {
      "product_id": "wd-sn850x-1tb",
      "name": "WD Black SN850X",
      "capacity": "1TB",
      "current_price": 12800,
      "target_price": 11000,
      "lowest_price": 10500,
      "recent_avg_price": 13200,
      "status": "もう少し",
      "kakaku_url": "https://kakaku.com/...",
      "shop_url": "https://...",
      "shop_name": "Amazon.co.jp",
      "last_checked": "2026-03-18T20:00:00+09:00"
    }
  ],
  "price_history": {
    "wd-sn850x-1tb": [
      { "date": "2026-03-01", "price": 13500 },
      { "date": "2026-03-02", "price": 13200 }
    ]
  }
}
```

## ディレクトリ構成

```
C:\Users\ramda\projects\ssd-deal-tracker/
├── CLAUDE.md                # repo固有ルール
├── README.md                # プロジェクト概要
├── gas/
│   ├── Code.gs              # メイン（価格取得・通知・WebApp API）
│   ├── Config.gs            # 定数・設定
│   └── .clasp.json          # clasp設定
├── docs/
│   └── superpowers/specs/   # 設計ドキュメント
└── pages/
    ├── index.html            # ビューページ
    ├── style.css             # スタイル
    └── app.js                # データ取得・表示・チャート描画
```

## SSD管理（カスタムメニュー）

Spreadsheet のカスタムメニュー「SSD管理」からウォッチ対象の追加・削除・検証を行う。

### メニュー構成

`onOpen()` でカスタムメニューを登録:

| メニュー項目 | 機能 |
|-------------|------|
| 新しいSSDを追加 | 入力ダイアログで製品情報を登録 |
| 選択したSSDを削除 | 選択行の製品を確認付きで削除 |
| バリデーション実行 | 全製品の整合性チェック |
| 今すぐ価格取得 | 手動で即時価格取得を実行 |

### 追加フロー

「新しいSSDを追加」選択時のダイアログ入力項目:

| 項目 | 必須 | 説明 |
|------|------|------|
| 製品名 | Yes | 例: `WD Black SN850X` |
| 容量 | Yes | プルダウン: `1TB` / `2TB` / `4TB`（デフォルト: `1TB`） |
| 価格.com URL | Yes | 製品ページのURL |
| 目標価格（円） | Yes | 通知トリガーとなる価格 |

追加時の自動処理:
1. `product_id` を自動生成（製品名と容量からスラッグ化。例: `wd-black-sn850x-1tb`）
2. URL 形式バリデーション（`kakaku.com` ドメインか確認）
3. 重複チェック（同じ `kakaku_url` が既に登録されていないか）
4. 初回価格取得を即時実行し、`current_price` / `lowest_price` / `recent_avg_price` を初期化
5. `status` / `consecutive_fail_count` 等を初期値で設定

### 削除フロー

1. ユーザーが products シートで行を選択
2. メニューから「選択したSSDを削除」を実行
3. 確認ダイアログ:「{製品名} ({容量}) を削除しますか？価格履歴も削除されます」
4. 承認 → products の行を削除 + price_history から該当 product_id の行を全削除

### バリデーション

「バリデーション実行」で全行をチェック:

| チェック項目 | エラー時の表示 |
|-------------|---------------|
| 必須列（name, capacity, kakaku_url, target_price）が空 | 「行X: {列名} が未入力です」 |
| kakaku_url が `kakaku.com` を含まない | 「行X: URLが価格.comの形式ではありません」 |
| target_price が 0 以下 | 「行X: 目標価格は正の数値にしてください」 |
| product_id の重複 | 「行X, Y: product_id が重複しています」 |

結果はダイアログで一覧表示。エラーがなければ「全製品の設定に問題ありません」と表示。

### ディレクトリへの影響

`gas/Code.gs` に追加、または `gas/Menu.gs` として分離:

```
gas/
├── Code.gs      # メイン（価格取得・通知・WebApp API）
├── Config.gs    # 定数・設定
├── Menu.gs      # カスタムメニュー（追加・削除・バリデーション）
└── .clasp.json
```

## セットアップ手順

1. Google Spreadsheet を新規作成、シート3つ（products, price_history, config）を用意
2. products シートに追跡対象SSDの情報を入力（kakaku_url, target_price 等）
3. config シートに通知先メール等を設定
4. GAS プロジェクトを clasp 連携
5. 価格.com からの取得ロジックを実装・テスト
6. GAS トリガー設定（1日2回: 9時・20時）
7. GAS Web App をデプロイ（「自分として実行」「全員がアクセス可能」）。**注意**: `doGet()` は `products` と `price_history` のデータのみ返すこと。`config` シート（メールアドレス等）は API レスポンスに含めない
8. GitHub Pages でビューページを公開

## テスト方針

- **価格パーステスト**: 価格.com のサンプルHTMLに対してパース実行 → 期待: 数値（例: 12800）が返る。null/NaN は失敗
- **異常値検知テスト**: fetch結果を null / 0 / 前回比50%超に改ざんして実行 → 期待: status が `取得エラー` になり、エラーアラートメールが送信される
- **通知テスト**: target_price を現在価格より高く設定して実行 → 期待: 通知メールが届き、購入リンクが含まれる
- **クールダウンテスト**: `last_notified` から23時間後に実行 → 期待: メール送信なし。25時間後に実行 → 期待: メール送信あり
- **ビューページテスト**: ローカルで JSON mock を使って表示 → 期待: カード表示・ステータスバッジ・チャートが正しく描画される
- **SSD追加テスト**: カスタムメニューからSSDを追加 → 期待: product_id が自動生成され、初回価格取得が実行される
- **SSD削除テスト**: 製品を選択して削除 → 期待: products 行と price_history の該当行が削除される
- **バリデーションテスト**: 必須列を空にした行を作成してバリデーション実行 → 期待: エラーがダイアログに表示される

## 将来の拡張（スコープ外）

以下は初期実装には含めないが、将来追加可能：

- Amazon PA-API / 楽天商品検索API への切り替え（スクレイピング安定性向上）
- LINE Notify 通知
- PS5以外のデバイス対応
- 複数ユーザー対応

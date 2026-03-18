# PS5用SSD価格トラッカー 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PS5対応SSD 10機種の価格を自動追跡し、目標価格を下回ったらメール通知するシステムを構築する

**Architecture:** GAS が価格.com から1日2回価格を取得し Spreadsheet に蓄積。閾値を下回ったら Gmail で購入リンク付き通知を送信。GAS Web App が JSON API を公開し、GitHub Pages の静的サイトで価格一覧・推移チャートを表示する。

**Tech Stack:** Google Apps Script, Google Spreadsheet, clasp, GitHub Pages, Chart.js

**Spec:** `docs/superpowers/specs/2026-03-18-ssd-deal-tracker-design.md`

---

## ファイル構成

```
ssd-deal-tracker/
├── CLAUDE.md                 # repo固有ルール
├── README.md                 # プロジェクト概要
├── gas/
│   ├── appsscript.json       # GASマニフェスト（タイムゾーン等）
│   ├── .clasp.json           # clasp設定（scriptId）
│   ├── Config.gs             # 定数・シート名・カラムインデックス
│   ├── Scraper.gs            # 価格.com HTML取得・パース
│   ├── PriceChecker.gs       # 価格取得フロー・バリデーション・履歴記録
│   ├── Notifier.gs           # メール通知（買い時通知・エラーアラート）
│   ├── WebApp.gs             # doGet() JSON API
│   └── Menu.gs               # カスタムメニュー（追加・削除・バリデーション）
├── pages/
│   ├── index.html            # ビューページ
│   ├── style.css             # スタイル
│   └── app.js                # データ取得・カード描画・チャート
└── docs/
    └── superpowers/
        ├── specs/            # 設計書
        └── plans/            # この計画
```

**設計書から変更**: `Code.gs` を責務ごとに分離（Scraper / PriceChecker / Notifier / WebApp / Menu）。GAS は全 `.gs` ファイルをフラットに読み込むため、ファイル分割しても動作に影響なし。

---

## Task 1: プロジェクト初期化と clasp セットアップ

**Files:**
- Create: `ssd-deal-tracker/CLAUDE.md`
- Create: `ssd-deal-tracker/gas/appsscript.json`
- Create: `ssd-deal-tracker/gas/.clasp.json`
- Create: `ssd-deal-tracker/gas/Config.gs`

**前提:** Google Spreadsheet を手動で新規作成済み。GAS プロジェクトが紐づいている状態。

- [ ] **Step 1: CLAUDE.md を作成**

```markdown
# Repo Rules

- 親 `C:\Users\ramda\projects\CLAUDE.md` を先に適用する
- 正本は `docs/superpowers/specs/2026-03-18-ssd-deal-tracker-design.md`
- コミットメッセージは日本語で簡潔に書く
- GAS コードは clasp push でデプロイ
- 文字コードは UTF-8
```

- [ ] **Step 2: appsscript.json を作成**

```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

- [ ] **Step 3: Config.gs を作成**

```javascript
// ===== シート名 =====
const SHEET_PRODUCTS = 'products';
const SHEET_PRICE_HISTORY = 'price_history';
const SHEET_CONFIG = 'config';

// ===== products シートのカラム順序（1始まり） =====
const COL = {
  PRODUCT_ID: 1,
  NAME: 2,
  CAPACITY: 3,
  KAKAKU_URL: 4,
  TARGET_PRICE: 5,
  CURRENT_PRICE: 6,
  LOWEST_PRICE: 7,
  RECENT_AVG_PRICE: 8,
  LAST_CHECKED: 9,
  LAST_NOTIFIED: 10,
  SHOP_NAME: 11,
  SHOP_URL: 12,
  CONSECUTIVE_FAIL_COUNT: 13,
  STATUS: 14,
};

// ===== ステータス =====
const STATUS_BUY = '買い時';
const STATUS_ALMOST = 'もう少し';
const STATUS_HIGH = '高め';
const STATUS_ERROR = '取得エラー';

// ===== 定数 =====
const HEADER_ROW = 1;
const DATA_START_ROW = 2;
const PRICE_ANOMALY_RATIO = 0.5; // 前回比50%以上変動で異常値
const CONSECUTIVE_FAIL_ALERT_THRESHOLD = 3;

// ===== ヘルパー =====
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

function getConfigValue(key) {
  const sheet = getSheet(SHEET_CONFIG);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}
```

- [ ] **Step 4: .clasp.json を作成（scriptId はユーザーが後で設定）**

```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE",
  "rootDir": "."
}
```

- [ ] **Step 5: コミット**

```bash
git add ssd-deal-tracker/CLAUDE.md ssd-deal-tracker/gas/
git commit -m "プロジェクト初期化: CLAUDE.md, clasp設定, Config.gs"
```

---

## Task 2: 価格.com スクレイピング (Scraper.gs)

**Files:**
- Create: `ssd-deal-tracker/gas/Scraper.gs`

- [ ] **Step 1: 価格.com の製品ページ HTML 構造を実機確認**

GAS スクリプトエディタで以下を手動実行し、HTML を確認:

```javascript
function debugFetchKakaku() {
  const url = 'https://kakaku.com/item/K0001520655/'; // SN850X 1TB の例
  const options = {
    muteHttpExceptions: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
  const response = UrlFetchApp.fetch(url, options);
  Logger.log('Status: ' + response.getResponseCode());
  Logger.log('Body (先頭2000文字): ' + response.getContentText().substring(0, 2000));
}
```

実行結果から、最安値・ショップ名・ショップURLのHTML要素（class名やid）を特定する。

- [ ] **Step 2: Scraper.gs を実装**

パースロジックの class 名等は Step 1 の結果に基づいて確定する。以下はテンプレート:

```javascript
/**
 * 価格.com の製品ページから最安値情報を取得する
 * @param {string} kakakuUrl - 価格.com 製品ページURL
 * @returns {{price: number|null, shopName: string|null, shopUrl: string|null, error: string|null}}
 */
function scrapeKakakuPrice(kakakuUrl) {
  try {
    const options = {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
    const response = UrlFetchApp.fetch(kakakuUrl, options);
    const statusCode = response.getResponseCode();

    if (statusCode !== 200) {
      return { price: null, shopName: null, shopUrl: null, error: 'HTTP ' + statusCode };
    }

    const html = response.getContentText();
    return parseKakakuHtml(html, kakakuUrl);
  } catch (e) {
    return { price: null, shopName: null, shopUrl: null, error: e.message };
  }
}

/**
 * 価格.com HTML から最安値情報をパースする
 * @param {string} html - ページHTML
 * @param {string} baseUrl - 元URL（ショップURL組み立て用）
 * @returns {{price: number|null, shopName: string|null, shopUrl: string|null, error: string|null}}
 */
function parseKakakuHtml(html, baseUrl) {
  // ⚠ 重要: 以下の正規表現は例示用テンプレートです。
  // Step 1 の実機確認で実際のHTML構造を特定してから修正すること。
  // Step 1 を完了するまで、この関数をそのまま動かさないでください。

  // 最安値を抽出
  const priceMatch = html.match(/class="priceTxt"[^>]*>.*?¥([\d,]+)/s);
  if (!priceMatch) {
    return { price: null, shopName: null, shopUrl: null, error: '価格要素が見つかりません' };
  }
  const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
  if (isNaN(price) || price <= 0) {
    return { price: null, shopName: null, shopUrl: null, error: '価格の数値変換に失敗' };
  }

  // 最安ショップ名を抽出
  const shopNameMatch = html.match(/class="shopName"[^>]*>([^<]+)/);
  const shopName = shopNameMatch ? shopNameMatch[1].trim() : null;

  // 最安ショップURLを抽出
  const shopUrlMatch = html.match(/class="shopName"[^>]*>.*?<a[^>]+href="([^"]+)"/s);
  const shopUrl = shopUrlMatch ? shopUrlMatch[1] : null;

  return { price, shopName, shopUrl, error: null };
}
```

- [ ] **Step 3: 手動実行テスト**

GAS エディタで以下を実行:

```javascript
function testScraper() {
  const result = scrapeKakakuPrice('https://kakaku.com/item/K0001520655/');
  Logger.log(JSON.stringify(result));
  // 期待: { price: (正の数値), shopName: (文字列), shopUrl: (URL), error: null }
}
```

期待: `price` が正の整数（例: 12800）。`error` が null。

- [ ] **Step 4: パース失敗ケースのテスト**

```javascript
function testScraperInvalidUrl() {
  const result = scrapeKakakuPrice('https://kakaku.com/item/INVALID_ID/');
  Logger.log(JSON.stringify(result));
  // 期待: error が null でない文字列
}
```

- [ ] **Step 5: コミット**

```bash
git add ssd-deal-tracker/gas/Scraper.gs
git commit -m "価格.comスクレイピング実装 (Scraper.gs)"
```

---

## Task 3: 価格取得フロー・バリデーション・履歴記録 (PriceChecker.gs)

**Files:**
- Create: `ssd-deal-tracker/gas/PriceChecker.gs`

- [ ] **Step 1: PriceChecker.gs を実装**

```javascript
/**
 * 全製品の価格を取得し、Spreadsheet を更新する（メインエントリポイント）
 * GAS トリガーから呼び出される
 */
function checkAllPrices() {
  const sheet = getSheet(SHEET_PRODUCTS);
  const historySheet = getSheet(SHEET_PRICE_HISTORY);
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return;

  const data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STATUS).getValues();
  const errors = [];
  const deals = [];
  const now = new Date();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + DATA_START_ROW;
    const productId = row[COL.PRODUCT_ID - 1];
    const name = row[COL.NAME - 1];
    const capacity = row[COL.CAPACITY - 1];
    const kakakuUrl = row[COL.KAKAKU_URL - 1];
    const targetPrice = row[COL.TARGET_PRICE - 1];
    const prevPrice = row[COL.CURRENT_PRICE - 1];
    const prevLowest = row[COL.LOWEST_PRICE - 1];
    const lastNotified = row[COL.LAST_NOTIFIED - 1];
    const consecutiveFails = row[COL.CONSECUTIVE_FAIL_COUNT - 1] || 0;

    if (!kakakuUrl) continue;

    // 価格取得
    const result = scrapeKakakuPrice(kakakuUrl);

    if (result.error || result.price === null) {
      // 取得失敗
      const newFailCount = consecutiveFails + 1;
      sheet.getRange(rowNum, COL.CONSECUTIVE_FAIL_COUNT).setValue(newFailCount);
      sheet.getRange(rowNum, COL.STATUS).setValue(STATUS_ERROR);
      sheet.getRange(rowNum, COL.LAST_CHECKED).setValue(now);
      errors.push({ name, capacity, error: result.error, failCount: newFailCount });
      continue;
    }

    // 異常値チェック（前回価格がある場合、50%以上の変動は異常）
    if (prevPrice && prevPrice > 0) {
      const ratio = Math.abs(result.price - prevPrice) / prevPrice;
      if (ratio > PRICE_ANOMALY_RATIO) {
        const newFailCount = consecutiveFails + 1;
        sheet.getRange(rowNum, COL.CONSECUTIVE_FAIL_COUNT).setValue(newFailCount);
        sheet.getRange(rowNum, COL.STATUS).setValue(STATUS_ERROR);
        sheet.getRange(rowNum, COL.LAST_CHECKED).setValue(now);
        errors.push({
          name, capacity,
          error: '異常値検出: ¥' + prevPrice + ' → ¥' + result.price + ' (変動率' + Math.round(ratio * 100) + '%)',
          failCount: newFailCount
        });
        continue;
      }
    }

    // 正常取得 → Spreadsheet 更新
    sheet.getRange(rowNum, COL.CURRENT_PRICE).setValue(result.price);
    sheet.getRange(rowNum, COL.LAST_CHECKED).setValue(now);
    sheet.getRange(rowNum, COL.SHOP_NAME).setValue(result.shopName || '');
    sheet.getRange(rowNum, COL.SHOP_URL).setValue(result.shopUrl || '');
    sheet.getRange(rowNum, COL.CONSECUTIVE_FAIL_COUNT).setValue(0);

    // 最安値更新
    const newLowest = (!prevLowest || result.price < prevLowest) ? result.price : prevLowest;
    sheet.getRange(rowNum, COL.LOWEST_PRICE).setValue(newLowest);

    // 直近30日平均を更新
    const avg = calcRecentAvgPrice(productId, historySheet);
    if (avg !== null) {
      sheet.getRange(rowNum, COL.RECENT_AVG_PRICE).setValue(Math.round(avg));
    }

    // 価格履歴に追記
    historySheet.appendRow([productId, now, result.price, 'kakaku.com']);

    // ステータス判定
    const thresholdPct = getConfigValue('price_threshold_pct') || 5;
    const status = determineStatus(result.price, targetPrice, thresholdPct);
    sheet.getRange(rowNum, COL.STATUS).setValue(status);

    // 買い時通知チェック
    if (status === STATUS_BUY) {
      const cooldownHours = getConfigValue('cooldown_hours') || 24;
      if (isCooldownExpired(lastNotified, cooldownHours, now)) {
        deals.push({
          name, capacity, currentPrice: result.price, targetPrice,
          lowestPrice: newLowest, shopName: result.shopName,
          shopUrl: result.shopUrl, kakakuUrl
        });
        sheet.getRange(rowNum, COL.LAST_NOTIFIED).setValue(now);
      }
    }
  }

  // 通知送信
  if (deals.length > 0) sendDealNotifications(deals);
  if (errors.length > 0) sendErrorNotifications(errors);
}

/**
 * ステータスを判定する
 */
function determineStatus(currentPrice, targetPrice, thresholdPct) {
  if (!currentPrice || !targetPrice) return STATUS_HIGH;
  if (currentPrice <= targetPrice) return STATUS_BUY;
  if (currentPrice <= targetPrice * (1 + thresholdPct / 100)) return STATUS_ALMOST;
  return STATUS_HIGH;
}

/**
 * クールダウンが経過しているか判定する
 */
function isCooldownExpired(lastNotified, cooldownHours, now) {
  if (!lastNotified) return true;
  const elapsed = (now.getTime() - new Date(lastNotified).getTime()) / (1000 * 60 * 60);
  return elapsed >= cooldownHours;
}

/**
 * 直近30日の平均価格を計算する
 */
function calcRecentAvgPrice(productId, historySheet) {
  const data = historySheet.getDataRange().getValues();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  let sum = 0;
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === productId && new Date(data[i][1]) >= thirtyDaysAgo) {
      sum += data[i][2];
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}
```

- [ ] **Step 2: テスト — products シートにテスト用データを1行入力して手動実行**

GAS エディタで `checkAllPrices()` を実行。
期待: products シートの current_price, last_checked, status が更新される。price_history に1行追加される。

- [ ] **Step 3: テスト — 異常値検知**

products シートの current_price を手動で 100 に設定してから `checkAllPrices()` を再実行。
期待: 取得価格との差が50%超で status が `取得エラー` になる。

- [ ] **Step 4: コミット**

```bash
git add ssd-deal-tracker/gas/PriceChecker.gs
git commit -m "価格取得フロー・バリデーション・履歴記録 (PriceChecker.gs)"
```

---

## Task 4: メール通知 (Notifier.gs)

**Files:**
- Create: `ssd-deal-tracker/gas/Notifier.gs`

- [ ] **Step 1: Notifier.gs を実装**

```javascript
/**
 * 買い時通知メールを送信する
 * @param {Array<Object>} deals - 通知対象の製品情報配列
 */
function sendDealNotifications(deals) {
  const notifyEmail = getConfigValue('notify_email');
  if (!notifyEmail) return;

  for (const deal of deals) {
    const subject = '【買い時】' + deal.name + ' が目標価格を下回りました！';
    const body = [
      deal.name + ' (' + deal.capacity + ')',
      '現在価格: ¥' + deal.currentPrice.toLocaleString() + '（目標: ¥' + deal.targetPrice.toLocaleString() + '）',
      '目標との差額: ¥' + (deal.targetPrice - deal.currentPrice).toLocaleString() + ' お得！',
      '過去最安値: ¥' + (deal.lowestPrice ? deal.lowestPrice.toLocaleString() : '---'),
      '',
      '▶ 最安ショップで購入: ' + (deal.shopName || '不明'),
      '  ' + (deal.shopUrl || '(URLなし)'),
      '',
      '▶ 価格.comで詳細を見る:',
      '  ' + deal.kakakuUrl,
      '',
      '※ 価格.com表示価格です。送料別の場合があります。',
    ].join('\n');

    GmailApp.sendEmail(notifyEmail, subject, body);
  }
}

/**
 * エラーアラートメールを送信する
 * @param {Array<Object>} errors - エラー情報配列
 */
function sendErrorNotifications(errors) {
  const notifyEmail = getConfigValue('notify_email');
  if (!notifyEmail) return;

  const lines = ['以下の製品で価格取得に失敗しました:', ''];
  let hasCritical = false;

  for (const err of errors) {
    lines.push('- ' + err.name + ' (' + err.capacity + '): ' + err.error);
    if (err.failCount >= CONSECUTIVE_FAIL_ALERT_THRESHOLD) {
      hasCritical = true;
    }
  }

  if (hasCritical) {
    lines.push('');
    lines.push('⚠ 連続' + CONSECUTIVE_FAIL_ALERT_THRESHOLD + '回以上失敗している製品があります。');
    lines.push('価格.comのHTML構造が変更された可能性があります。');
    lines.push('パースロジックの確認をお願いします。');
  }

  GmailApp.sendEmail(notifyEmail, '【SSD Tracker】価格取得エラー', lines.join('\n'));
}
```

- [ ] **Step 2: テスト — 買い時通知**

products シートの target_price を現在価格より高く設定し、last_notified を空にして `checkAllPrices()` を実行。
期待: Gmail に「【買い時】」メールが届き、購入リンクが含まれる。

- [ ] **Step 3: テスト — クールダウン**

直前のテストで last_notified が設定された状態で再度 `checkAllPrices()` を実行。
期待: メールが送信されない（24時間未経過のため）。

- [ ] **Step 4: テスト — エラーアラート**

products シートの kakaku_url を不正なURLに変更して `checkAllPrices()` を実行。
期待: Gmail に「【SSD Tracker】価格取得エラー」メールが届く。

- [ ] **Step 5: コミット**

```bash
git add ssd-deal-tracker/gas/Notifier.gs
git commit -m "メール通知実装 (Notifier.gs): 買い時通知・エラーアラート"
```

---

## Task 5: GAS Web App API (WebApp.gs)

**Files:**
- Create: `ssd-deal-tracker/gas/WebApp.gs`

- [ ] **Step 1: WebApp.gs を実装**

```javascript
/**
 * GAS Web App エンドポイント
 * products と price_history のデータを JSON で返す
 * ※ config シート（メールアドレス等）は含めない
 */
function doGet(e) {
  try {
    const productsSheet = getSheet(SHEET_PRODUCTS);
    const historySheet = getSheet(SHEET_PRICE_HISTORY);

    const products = getProductsAsJson(productsSheet);
    const priceHistory = getPriceHistoryAsJson(historySheet);

    const result = {
      updated_at: Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"),
      products: products,
      price_history: priceHistory,
    };

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * products シートを JSON 配列に変換する
 */
function getProductsAsJson(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return [];

  const data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STATUS).getValues();
  return data.map(function(row) {
    return {
      product_id: row[COL.PRODUCT_ID - 1],
      name: row[COL.NAME - 1],
      capacity: row[COL.CAPACITY - 1],
      current_price: row[COL.CURRENT_PRICE - 1] || null,
      target_price: row[COL.TARGET_PRICE - 1] || null,
      lowest_price: row[COL.LOWEST_PRICE - 1] || null,
      recent_avg_price: row[COL.RECENT_AVG_PRICE - 1] || null,
      status: row[COL.STATUS - 1] || STATUS_HIGH,
      kakaku_url: row[COL.KAKAKU_URL - 1] || '',
      shop_url: row[COL.SHOP_URL - 1] || '',
      shop_name: row[COL.SHOP_NAME - 1] || '',
      last_checked: row[COL.LAST_CHECKED - 1] ? new Date(row[COL.LAST_CHECKED - 1]).toISOString() : null,
    };
  }).filter(function(p) { return p.product_id; });
}

/**
 * price_history シートを product_id 別の JSON に変換する
 */
function getPriceHistoryAsJson(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};

  const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const history = {};

  for (let i = 0; i < data.length; i++) {
    const productId = data[i][0];
    const checkedAt = data[i][1];
    const price = data[i][2];
    if (!productId) continue;

    if (!history[productId]) history[productId] = [];
    history[productId].push({
      date: Utilities.formatDate(new Date(checkedAt), 'Asia/Tokyo', 'yyyy-MM-dd'),
      price: price,
    });
  }

  return history;
}
```

- [ ] **Step 2: テスト — GAS エディタで doGet をシミュレート**

```javascript
function testDoGet() {
  const result = doGet({});
  const json = JSON.parse(result.getContent());
  Logger.log(JSON.stringify(json, null, 2));
  // 期待: products 配列に製品データ、price_history にキー付きデータ
  // config のメールアドレスが含まれていないことを確認
}
```

- [ ] **Step 3: コミット**

```bash
git add ssd-deal-tracker/gas/WebApp.gs
git commit -m "GAS Web App API 実装 (WebApp.gs)"
```

---

## Task 6: カスタムメニュー (Menu.gs)

**Files:**
- Create: `ssd-deal-tracker/gas/Menu.gs`

- [ ] **Step 1: Menu.gs を実装**

```javascript
/**
 * Spreadsheet 起動時にカスタムメニューを追加する
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('SSD管理')
    .addItem('新しいSSDを追加', 'showAddDialog')
    .addItem('選択したSSDを削除', 'deleteSelectedProduct')
    .addItem('バリデーション実行', 'runValidation')
    .addSeparator()
    .addItem('今すぐ価格取得', 'checkAllPrices')
    .addToUi();
}

/**
 * SSD追加ダイアログを表示する
 */
function showAddDialog() {
  const ui = SpreadsheetApp.getUi();

  const nameResult = ui.prompt('SSD追加 (1/4)', '製品名を入力してください:', ui.ButtonSet.OK_CANCEL);
  if (nameResult.getSelectedButton() !== ui.Button.OK) return;
  const name = nameResult.getResponseText().trim();
  if (!name) { ui.alert('製品名は必須です'); return; }

  const capResult = ui.prompt('SSD追加 (2/4)', '容量を入力してください (1TB / 2TB / 4TB):', ui.ButtonSet.OK_CANCEL);
  if (capResult.getSelectedButton() !== ui.Button.OK) return;
  const capacity = capResult.getResponseText().trim();
  if (!['1TB', '2TB', '4TB'].includes(capacity)) { ui.alert('容量は 1TB, 2TB, 4TB のいずれかです'); return; }

  const urlResult = ui.prompt('SSD追加 (3/4)', '価格.com の製品ページURLを入力してください:', ui.ButtonSet.OK_CANCEL);
  if (urlResult.getSelectedButton() !== ui.Button.OK) return;
  const kakakuUrl = urlResult.getResponseText().trim();
  if (!kakakuUrl.includes('kakaku.com')) { ui.alert('URLに kakaku.com が含まれていません'); return; }

  // 重複チェック
  const sheet = getSheet(SHEET_PRODUCTS);
  const existingUrls = sheet.getRange(DATA_START_ROW, COL.KAKAKU_URL, Math.max(1, sheet.getLastRow() - HEADER_ROW), 1).getValues().flat();
  if (existingUrls.includes(kakakuUrl)) { ui.alert('このURLは既に登録されています'); return; }

  const priceResult = ui.prompt('SSD追加 (4/4)', '目標価格（円）を入力してください:', ui.ButtonSet.OK_CANCEL);
  if (priceResult.getSelectedButton() !== ui.Button.OK) return;
  const targetPrice = parseInt(priceResult.getResponseText().trim(), 10);
  if (isNaN(targetPrice) || targetPrice <= 0) { ui.alert('目標価格は正の数値にしてください'); return; }

  // product_id 自動生成
  const productId = generateProductId(name, capacity);

  // 初回価格取得
  ui.alert('価格を取得中…しばらくお待ちください');
  const scrapeResult = scrapeKakakuPrice(kakakuUrl);
  const now = new Date();

  const newRow = new Array(COL.STATUS).fill('');
  newRow[COL.PRODUCT_ID - 1] = productId;
  newRow[COL.NAME - 1] = name;
  newRow[COL.CAPACITY - 1] = capacity;
  newRow[COL.KAKAKU_URL - 1] = kakakuUrl;
  newRow[COL.TARGET_PRICE - 1] = targetPrice;
  newRow[COL.CURRENT_PRICE - 1] = scrapeResult.price || '';
  newRow[COL.LOWEST_PRICE - 1] = scrapeResult.price || '';
  newRow[COL.RECENT_AVG_PRICE - 1] = scrapeResult.price || '';
  newRow[COL.LAST_CHECKED - 1] = now;
  newRow[COL.LAST_NOTIFIED - 1] = '';
  newRow[COL.SHOP_NAME - 1] = scrapeResult.shopName || '';
  newRow[COL.SHOP_URL - 1] = scrapeResult.shopUrl || '';
  newRow[COL.CONSECUTIVE_FAIL_COUNT - 1] = scrapeResult.error ? 1 : 0;
  newRow[COL.STATUS - 1] = scrapeResult.error ? STATUS_ERROR :
    determineStatus(scrapeResult.price, targetPrice, getConfigValue('price_threshold_pct') || 5);

  sheet.appendRow(newRow);

  if (scrapeResult.price) {
    const historySheet = getSheet(SHEET_PRICE_HISTORY);
    historySheet.appendRow([productId, now, scrapeResult.price, 'kakaku.com']);
  }

  const msg = scrapeResult.error
    ? name + ' を追加しました（価格取得失敗: ' + scrapeResult.error + '）'
    : name + ' を追加しました（現在価格: ¥' + scrapeResult.price.toLocaleString() + '）';
  ui.alert(msg);
}

/**
 * 製品名と容量から product_id を生成する
 */
function generateProductId(name, capacity) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + capacity.toLowerCase();
}

/**
 * 選択行の製品を削除する
 */
function deleteSelectedProduct() {
  const ui = SpreadsheetApp.getUi();
  const sheet = getSheet(SHEET_PRODUCTS);
  const activeRow = sheet.getActiveRange().getRow();

  if (activeRow < DATA_START_ROW) {
    ui.alert('削除する製品の行を選択してください（ヘッダー行は選択できません）');
    return;
  }

  const name = sheet.getRange(activeRow, COL.NAME).getValue();
  const capacity = sheet.getRange(activeRow, COL.CAPACITY).getValue();
  const productId = sheet.getRange(activeRow, COL.PRODUCT_ID).getValue();

  const confirm = ui.alert(
    '削除確認',
    name + ' (' + capacity + ') を削除しますか？\n価格履歴も削除されます。',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // products から行を削除
  sheet.deleteRow(activeRow);

  // price_history から該当 product_id の行を削除
  const historySheet = getSheet(SHEET_PRICE_HISTORY);
  const historyData = historySheet.getDataRange().getValues();
  for (let i = historyData.length - 1; i >= 1; i--) {
    if (historyData[i][0] === productId) {
      historySheet.deleteRow(i + 1);
    }
  }

  ui.alert(name + ' を削除しました');
}

/**
 * 全製品のバリデーションを実行する
 */
function runValidation() {
  const ui = SpreadsheetApp.getUi();
  const sheet = getSheet(SHEET_PRODUCTS);
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) {
    ui.alert('製品が登録されていません');
    return;
  }

  const data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STATUS).getValues();
  const errors = [];
  const ids = {};

  for (let i = 0; i < data.length; i++) {
    const rowNum = i + DATA_START_ROW;
    const row = data[i];

    if (!row[COL.NAME - 1]) errors.push('行' + rowNum + ': 製品名が未入力です');
    if (!row[COL.CAPACITY - 1]) errors.push('行' + rowNum + ': 容量が未入力です');
    if (!row[COL.KAKAKU_URL - 1]) errors.push('行' + rowNum + ': URLが未入力です');
    else if (!String(row[COL.KAKAKU_URL - 1]).includes('kakaku.com')) {
      errors.push('行' + rowNum + ': URLが価格.comの形式ではありません');
    }
    if (!row[COL.TARGET_PRICE - 1] || row[COL.TARGET_PRICE - 1] <= 0) {
      errors.push('行' + rowNum + ': 目標価格は正の数値にしてください');
    }

    const pid = row[COL.PRODUCT_ID - 1];
    if (pid) {
      if (ids[pid]) {
        errors.push('行' + ids[pid] + ', ' + rowNum + ': product_id "' + pid + '" が重複しています');
      } else {
        ids[pid] = rowNum;
      }
    }
  }

  if (errors.length === 0) {
    ui.alert('全製品の設定に問題ありません (' + data.length + '件)');
  } else {
    ui.alert('バリデーションエラー (' + errors.length + '件)\n\n' + errors.join('\n'));
  }
}
```

- [ ] **Step 2: テスト — Spreadsheet を開いてカスタムメニュー表示を確認**

Spreadsheet をリロード → 「SSD管理」メニューが表示される。

- [ ] **Step 3: テスト — 「新しいSSDを追加」でテスト用SSDを追加**

期待: ダイアログ4ステップ → 行が追加され product_id が自動生成 → 初回価格取得が実行される。

- [ ] **Step 4: テスト — 追加した行を選択して「選択したSSDを削除」**

期待: 確認ダイアログ後、products 行と price_history の該当行が削除される。

- [ ] **Step 5: テスト — 必須列を空にして「バリデーション実行」**

期待: エラーメッセージがダイアログに表示される。

- [ ] **Step 6: コミット**

```bash
git add ssd-deal-tracker/gas/Menu.gs
git commit -m "カスタムメニュー実装 (Menu.gs): SSD追加・削除・バリデーション"
```

---

## Task 7: 初期データ投入と clasp push

**Files:**
- Modify: `ssd-deal-tracker/gas/.clasp.json` (ユーザーが scriptId を設定)

- [ ] **Step 1: ユーザーに Spreadsheet / GAS プロジェクトを作成してもらう**

1. Google Spreadsheet を新規作成（名前: `SSD Deal Tracker`）
2. シート名を `products`, `price_history`, `config` に変更
3. products シートのヘッダー行（A1:N1）:
   `product_id | name | capacity | kakaku_url | target_price | current_price | lowest_price | recent_avg_price | last_checked | last_notified | shop_name | shop_url | consecutive_fail_count | status`
4. price_history シートのヘッダー行（A1:D1）:
   `product_id | checked_at | price | source`
5. config シートにデータ入力:
   - A1: `key`, B1: `value`（ヘッダー行）
   - A2: `notify_email`, B2: (ユーザーのメールアドレス)
   - A3: `cooldown_hours`, B3: `24`
   - A4: `price_threshold_pct`, B4: `5`
6. 拡張機能 → Apps Script でプロジェクトを開き、scriptId を控える

- [ ] **Step 2: .clasp.json に scriptId を設定**

ユーザーから受け取った scriptId を `.clasp.json` に記入。

- [ ] **Step 3: clasp push でデプロイ**

```bash
cd ssd-deal-tracker/gas
npx @google/clasp push
```

期待: `Pushed N files.` と表示される。

- [ ] **Step 4: GAS エディタで Scraper.gs の debugFetchKakaku を実行してパースロジックを確定**

Step 1 で取得した実際の HTML を見て、`parseKakakuHtml` の正規表現を修正。

- [ ] **Step 5: パースロジック修正後に clasp push を再実行**

```bash
cd ssd-deal-tracker/gas
npx @google/clasp push
```

期待: 修正した Scraper.gs が反映される。GAS エディタで `testScraper()` を実行して価格が正しく取得できることを確認。

- [ ] **Step 6: GAS Web App をデプロイ**

GAS エディタ → デプロイ → 新しいデプロイ:
- 種類: ウェブアプリ
- 実行ユーザー: 自分
- アクセスできるユーザー: 全員
- デプロイ → 表示されたURLを控える（Task 8 で使用）

- [ ] **Step 7: 10機種の初期データを products シートに投入**

カスタムメニュー「新しいSSDを追加」を10回実行、または直接シートに入力。
各製品の価格.com URL は実機で検索して確定する。

- [ ] **Step 6: GAS トリガーを設定**

GAS エディタ → トリガー → 新しいトリガー:
- 関数: `checkAllPrices`
- イベント: 時間主導型 → 日付ベースのタイマー → 午前9時〜10時
- 同様にもう1つ: 午後8時〜9時

- [ ] **Step 7: 手動で「今すぐ価格取得」を実行して全体動作確認**

期待: 全10製品の価格が取得され、products シートが更新される。

- [ ] **Step 8: コミット**

```bash
git add ssd-deal-tracker/gas/
git commit -m "clasp設定とパースロジック確定"
```

---

## Task 8: ビューページ (GitHub Pages)

**Files:**
- Create: `ssd-deal-tracker/pages/index.html`
- Create: `ssd-deal-tracker/pages/style.css`
- Create: `ssd-deal-tracker/pages/app.js`

- [ ] **Step 1: index.html を作成**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PS5 SSD Deal Tracker</title>
  <link rel="stylesheet" href="style.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <header>
    <h1>PS5 SSD Deal Tracker</h1>
    <p id="updated-at">最終更新: 読み込み中...</p>
  </header>
  <main>
    <div id="product-cards" class="card-grid"></div>
    <section id="chart-section">
      <h2>価格推移</h2>
      <canvas id="price-chart"></canvas>
    </section>
  </main>
  <footer>
    <p>※ 価格.com表示価格。送料別の場合があります。</p>
  </footer>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: style.css を作成**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; }
header { background: #1a237e; color: #fff; padding: 1.5rem; text-align: center; }
header h1 { font-size: 1.5rem; }
#updated-at { font-size: 0.85rem; opacity: 0.8; margin-top: 0.3rem; }
main { max-width: 1200px; margin: 1.5rem auto; padding: 0 1rem; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
.card { background: #fff; border-radius: 8px; padding: 1.2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.card h3 { font-size: 1rem; margin-bottom: 0.5rem; }
.card .price { font-size: 1.8rem; font-weight: bold; color: #1a237e; }
.card .meta { font-size: 0.8rem; color: #888; margin-top: 0.5rem; }
.badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; color: #fff; }
.badge-buy { background: #2e7d32; }
.badge-almost { background: #f9a825; color: #333; }
.badge-high { background: #9e9e9e; }
.badge-error { background: #c62828; }
.btn-shop { display: inline-block; margin-top: 0.8rem; padding: 0.5rem 1rem; background: #ff6f00; color: #fff; text-decoration: none; border-radius: 4px; font-size: 0.85rem; }
.btn-shop:hover { background: #e65100; }
#chart-section { margin-top: 2rem; background: #fff; padding: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
footer { text-align: center; padding: 1.5rem; font-size: 0.8rem; color: #888; }
```

- [ ] **Step 3: app.js を作成**

```javascript
// GAS Web App の URL（デプロイ後にここを更新する）
const API_URL = 'YOUR_GAS_WEBAPP_URL_HERE';

const STATUS_BADGE = {
  '買い時': { class: 'badge-buy', label: '買い時！' },
  'もう少し': { class: 'badge-almost', label: 'もう少し' },
  '高め': { class: 'badge-high', label: '高め' },
  '取得エラー': { class: 'badge-error', label: '取得エラー' },
};

async function init() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    renderUpdatedAt(data.updated_at);
    renderCards(data.products);
    renderChart(data.products, data.price_history);
  } catch (err) {
    document.getElementById('product-cards').innerHTML =
      '<p style="color:red;">データの取得に失敗しました: ' + err.message + '</p>';
  }
}

function renderUpdatedAt(updatedAt) {
  const el = document.getElementById('updated-at');
  if (updatedAt) {
    const d = new Date(updatedAt);
    el.textContent = '最終更新: ' + d.toLocaleString('ja-JP');
  }
}

function renderCards(products) {
  const container = document.getElementById('product-cards');
  container.innerHTML = products.map(function(p) {
    const badge = STATUS_BADGE[p.status] || STATUS_BADGE['高め'];
    const priceText = p.current_price ? '¥' + p.current_price.toLocaleString() : '---';
    const targetText = p.target_price ? '¥' + p.target_price.toLocaleString() : '---';
    const lowestText = p.lowest_price ? '¥' + p.lowest_price.toLocaleString() : '---';
    const avgText = p.recent_avg_price ? '¥' + p.recent_avg_price.toLocaleString() : '---';
    const shopLink = p.shop_url
      ? '<a class="btn-shop" href="' + p.shop_url + '" target="_blank" rel="noopener">' + (p.shop_name || '最安ショップ') + 'で購入</a>'
      : '<a class="btn-shop" href="' + p.kakaku_url + '" target="_blank" rel="noopener">価格.comで見る</a>';

    return '<div class="card">'
      + '<h3>' + escapeHtml(p.name) + ' (' + escapeHtml(p.capacity) + ')</h3>'
      + '<span class="badge ' + badge.class + '">' + badge.label + '</span>'
      + '<div class="price">' + priceText + '</div>'
      + '<div class="meta">目標: ' + targetText + ' / 過去最安: ' + lowestText + ' / 30日平均: ' + avgText + '</div>'
      + shopLink
      + '</div>';
  }).join('');
}

function renderChart(products, priceHistory) {
  const ctx = document.getElementById('price-chart').getContext('2d');
  const colors = ['#1a237e','#c62828','#2e7d32','#ff6f00','#6a1b9a','#00838f','#4e342e','#546e7a','#ad1457','#1565c0'];
  const datasets = [];

  products.forEach(function(p, i) {
    const history = priceHistory[p.product_id] || [];
    if (history.length === 0) return;
    datasets.push({
      label: p.name,
      data: history.map(function(h) { return { x: h.date, y: h.price }; }),
      borderColor: colors[i % colors.length],
      fill: false,
      tension: 0.3,
      pointRadius: 2,
    });
  });

  new Chart(ctx, {
    type: 'line',
    data: { datasets: datasets },
    options: {
      responsive: true,
      scales: {
        x: { type: 'category', title: { display: true, text: '日付' } },
        y: { title: { display: true, text: '価格（円）' }, beginAtZero: false },
      },
      plugins: {
        legend: { position: 'bottom' },
      },
    },
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

init();
```

- [ ] **Step 4: mock JSON ファイルを作成**

`pages/mock-data.json` を作成:

```json
{
  "updated_at": "2026-03-18T20:00:00+09:00",
  "products": [
    {
      "product_id": "wd-black-sn850x-1tb", "name": "WD_BLACK SN850X", "capacity": "1TB",
      "current_price": 12800, "target_price": 11000, "lowest_price": 10500,
      "recent_avg_price": 13200, "status": "もう少し",
      "kakaku_url": "https://kakaku.com/item/K0001520655/",
      "shop_url": "https://example.com", "shop_name": "Amazon.co.jp",
      "last_checked": "2026-03-18T20:00:00+09:00"
    },
    {
      "product_id": "samsung-990-pro-1tb", "name": "Samsung 990 PRO", "capacity": "1TB",
      "current_price": 10500, "target_price": 11000, "lowest_price": 10500,
      "recent_avg_price": 12000, "status": "買い時",
      "kakaku_url": "https://kakaku.com/item/K0001234567/",
      "shop_url": "https://example.com", "shop_name": "ヨドバシ.com",
      "last_checked": "2026-03-18T20:00:00+09:00"
    }
  ],
  "price_history": {
    "wd-black-sn850x-1tb": [
      { "date": "2026-03-01", "price": 13500 },
      { "date": "2026-03-10", "price": 13200 },
      { "date": "2026-03-18", "price": 12800 }
    ],
    "samsung-990-pro-1tb": [
      { "date": "2026-03-01", "price": 12000 },
      { "date": "2026-03-10", "price": 11200 },
      { "date": "2026-03-18", "price": 10500 }
    ]
  }
}
```

- [ ] **Step 5: ローカルサーバーで表示確認**

`app.js` の `API_URL` を一時的に `'mock-data.json'` に変更し、ローカルサーバーを起動:

```bash
cd ssd-deal-tracker/pages
python -m http.server 8000
# ブラウザで http://localhost:8000/ を開く
```

期待: カード2枚（「もう少し」黄バッジ + 「買い時！」緑バッジ）、価格推移チャートが表示される。

- [ ] **Step 6: API_URL を GAS Web App の実際のURLに更新**

Task 7 Step 6 で控えた GAS Web App のデプロイ URL に差し替え。`mock-data.json` はそのまま残す（デバッグ用）。

- [ ] **Step 6: コミット**

```bash
git add ssd-deal-tracker/pages/
git commit -m "ビューページ実装 (GitHub Pages): カード表示・価格推移チャート"
```

---

## Task 9: README.md と最終確認

**Files:**
- Create: `ssd-deal-tracker/README.md`

- [ ] **Step 1: README.md を作成**

```markdown
# PS5 SSD Deal Tracker

PS5対応SSD 10機種の価格を自動追跡し、目標価格を下回ったらメール通知するシステム。

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

`docs/superpowers/specs/2026-03-18-ssd-deal-tracker-design.md` の「セットアップ手順」を参照。
```

- [ ] **Step 2: 全体動作確認チェックリスト**

以下を順番に確認:
1. Spreadsheet に10機種のデータが入っている
2. カスタムメニュー「SSD管理」が表示される
3. 「今すぐ価格取得」で全製品の価格が更新される
4. target_price を高く設定して通知メールが届く
5. GAS Web App のURL にアクセスして JSON が返る
6. GitHub Pages のビューページでカード・チャートが表示される
7. GAS トリガー（9時・20時）が設定されている

- [ ] **Step 3: コミット**

```bash
git add ssd-deal-tracker/README.md
git commit -m "README.md 追加と最終確認"
```

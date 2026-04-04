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
  STORE_COUNT: 15,
};

// ===== ステータス =====
const STATUS_BUY = '買い時';
const STATUS_ALMOST = 'もう少し';
const STATUS_HIGH = '高め';
const STATUS_ERROR = '取得エラー';

// ===== 定数 =====
const HEADER_ROW = 1;
const DATA_START_ROW = 2;
const PRICE_ANOMALY_RATIO = 0.5; // 基準価格比50%以上変動で異常値（基準=30日平均 or 前回価格）
const CONSECUTIVE_FAIL_ALERT_THRESHOLD = 3;
const LOW_STORE_COUNT_THRESHOLD = 3; // これ以下の店舗数は信頼性が低い

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

// ===== マイグレーションガード =====

/**
 * マイグレーション関数が実行済みかチェックする
 * @param {string} funcName - 関数名
 * @returns {boolean} 実行済みなら true
 */
function isMigrationDone(funcName) {
  return getConfigValue('migration_' + funcName) === 'done';
}

/**
 * マイグレーション関数を実行済みとしてマークする
 * @param {string} funcName - 関数名
 */
function markMigrationDone(funcName) {
  var configSheet = getSheet(SHEET_CONFIG);
  configSheet.appendRow(['migration_' + funcName, 'done']);
}

/**
 * 初期セットアップ: ヘッダー行と config データを投入する
 * ※ 一度だけ実行すること
 */
function setupSheets() {
  const ss = getSpreadsheet();

  // --- products シート ---
  const products = ss.getSheetByName(SHEET_PRODUCTS);
  products.getRange(1, 1, 1, 15).setValues([[
    'product_id', 'name', 'capacity', 'kakaku_url', 'target_price',
    'current_price', 'lowest_price', 'recent_avg_price', 'last_checked',
    'last_notified', 'shop_name', 'shop_url', 'consecutive_fail_count', 'status', 'store_count'
  ]]);
  products.getRange(1, 1, 1, 15).setFontWeight('bold');
  products.setFrozenRows(1);

  // --- price_history シート ---
  const history = ss.getSheetByName(SHEET_PRICE_HISTORY);
  history.getRange(1, 1, 1, 4).setValues([[
    'product_id', 'checked_at', 'price', 'source'
  ]]);
  history.getRange(1, 1, 1, 4).setFontWeight('bold');
  history.setFrozenRows(1);

  // --- config シート ---
  const config = ss.getSheetByName(SHEET_CONFIG);
  config.getRange(1, 1, 4, 2).setValues([
    ['key', 'value'],
    ['notify_email', Session.getActiveUser().getEmail()],
    ['cooldown_hours', 24],
    ['price_threshold_pct', 10]
  ]);
  config.getRange(1, 1, 1, 2).setFontWeight('bold');
  config.setFrozenRows(1);

  SpreadsheetApp.getUi().alert('セットアップ完了！\n\nnotify_email: ' + Session.getActiveUser().getEmail());
}

/**
 * PS5対応SSD 10機種を一括登録する
 * ※ 一度だけ実行すること
 */
function seedProducts() {
  if (isMigrationDone('seedProducts')) { Logger.log('seedProducts は実行済みです'); return; }
  const products = [
    ['samsung-990-pro-hs-1tb', 'Samsung 990 PRO with Heatsink', '1TB', 'https://kakaku.com/item/K0001546439/', 13000],
    ['wd-black-sn850x-hs-1tb', 'WD_BLACK SN850X with Heatsink', '1TB', 'https://kakaku.com/item/K0001472482/', 12000],
    ['wd-black-sn850p-1tb', 'WD_BLACK SN850P for PS5', '1TB', 'https://kakaku.com/item/K0001551011/', 13000],
    ['crucial-t500-hs-1tb', 'Crucial T500 with Heatsink', '1TB', 'https://kakaku.com/item/K0001588763/', 11000],
    ['crucial-t500-1tb', 'Crucial T500', '1TB', 'https://kakaku.com/item/K0001588761/', 10000],
    ['seagate-firecuda-530-hs-1tb', 'Seagate FireCuda 530 Heatsink', '1TB', 'https://kakaku.com/item/K0001388785/', 15000],
    ['nextorage-nem-pa-1tb', 'Nextorage NEM-PA', '1TB', 'https://kakaku.com/item/K0001505323/', 12000],
    ['nextorage-ne1n-1tb', 'Nextorage NE1N with Heatsink', '1TB', 'https://kakaku.com/item/K0001533469/', 14000],
    ['samsung-9100-pro-1tb', 'Samsung 9100 PRO', '1TB', 'https://kakaku.com/item/K0001681635/', 14000],
    ['crucial-p5-plus-1tb', 'Crucial P5 Plus', '1TB', 'https://kakaku.com/item/K0001374156/', 10000],
  ];

  const sheet = getSheet(SHEET_PRODUCTS);
  const now = new Date();

  for (const p of products) {
    const newRow = new Array(COL.STORE_COUNT).fill('');
    newRow[COL.PRODUCT_ID - 1] = p[0];
    newRow[COL.NAME - 1] = p[1];
    newRow[COL.CAPACITY - 1] = p[2];
    newRow[COL.KAKAKU_URL - 1] = p[3];
    newRow[COL.TARGET_PRICE - 1] = p[4];
    newRow[COL.CONSECUTIVE_FAIL_COUNT - 1] = 0;
    newRow[COL.STATUS - 1] = STATUS_HIGH;
    sheet.appendRow(newRow);
  }

  markMigrationDone('seedProducts');
  SpreadsheetApp.getUi().alert(products.length + '機種を登録しました！\n\n次に「SSD管理」→「今すぐ価格取得」で初回価格を取得してください。');
}

/**
 * 販売終了だった4製品を在庫ありの製品に差し替える
 * ※ 一度だけ実行すること
 */
function fixProducts() {
  if (isMigrationDone('fixProducts')) { Logger.log('fixProducts は実行済みです'); return; }
  const sheet = getSheet(SHEET_PRODUCTS);
  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STORE_COUNT).getValues();

  // 差し替えマップ: 旧product_id → [新product_id, 新name, 新url, 新target_price]
  const replacements = {
    'wd-black-sn850p-1tb': ['kioxia-exceria-plus-g3-1tb', 'KIOXIA EXCERIA PLUS G3', 'https://kakaku.com/item/K0001579414/', 12000],
    'nextorage-nem-pa-1tb': ['kioxia-exceria-plus-g4-1tb', 'KIOXIA EXCERIA PLUS G4', 'https://kakaku.com/item/K0001672715/', 14000],
    'nextorage-ne1n-1tb': ['adata-legend-960-1tb', 'ADATA LEGEND 960 (Dospara)', 'https://kakaku.com/item/K0001591844/', 13000],
    'crucial-p5-plus-1tb': ['samsung-990-pro-1tb', 'Samsung 990 PRO', 'https://kakaku.com/item/K0001504087/', 13000],
  };

  let fixCount = 0;
  for (let i = 0; i < data.length; i++) {
    const pid = data[i][COL.PRODUCT_ID - 1];
    if (replacements[pid]) {
      const r = replacements[pid];
      const rowNum = i + DATA_START_ROW;
      // 既存行の内容を複製してから差し替えフィールドのみ上書き（1回の setValues でAPI呼び出しを削減）
      const updatedRow = data[i].slice();
      updatedRow[COL.PRODUCT_ID - 1] = r[0];
      updatedRow[COL.NAME - 1] = r[1];
      updatedRow[COL.KAKAKU_URL - 1] = r[2];
      updatedRow[COL.TARGET_PRICE - 1] = r[3];
      updatedRow[COL.CURRENT_PRICE - 1] = '';
      updatedRow[COL.LOWEST_PRICE - 1] = '';
      updatedRow[COL.RECENT_AVG_PRICE - 1] = '';
      updatedRow[COL.SHOP_NAME - 1] = '';
      updatedRow[COL.SHOP_URL - 1] = '';
      updatedRow[COL.CONSECUTIVE_FAIL_COUNT - 1] = 0;
      updatedRow[COL.STATUS - 1] = STATUS_HIGH;
      sheet.getRange(rowNum, 1, 1, updatedRow.length).setValues([updatedRow]);
      fixCount++;
    }
  }

  markMigrationDone('fixProducts');
  SpreadsheetApp.getUi().alert(fixCount + '件を差し替えました。\n\n「SSD管理」→「今すぐ価格取得」で再取得してください。');
}

/**
 * 2026-03 ラインナップ更新
 * - 旧世代1件を削除（FireCuda 530 HS）
 * - 既存製品の target_price を相場に合わせて引き上げ
 * - 2TB枠 + SN7100 の5製品を追加
 * - config の price_threshold_pct を 5→10 に更新
 * ※ 一度だけ実行すること
 */
function updateProducts2026() {
  if (isMigrationDone('updateProducts2026')) { Logger.log('updateProducts2026 は実行済みです'); return; }
  const sheet = getSheet(SHEET_PRODUCTS);
  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STORE_COUNT).getValues();

  // --- 1. FireCuda 530 HS を削除 ---
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][COL.PRODUCT_ID - 1] === 'seagate-firecuda-530-hs-1tb') {
      sheet.deleteRow(i + DATA_START_ROW);
    }
  }

  // --- 2. 既存製品の target_price 更新 ---
  const priceUpdates = {
    'samsung-990-pro-hs-1tb': 14500,
    'wd-black-sn850x-hs-1tb': 13000,
    'crucial-t500-hs-1tb': 12500,
    'crucial-t500-1tb': 12000,
    'kioxia-exceria-plus-g3-1tb': 13000,
    'kioxia-exceria-plus-g4-1tb': 15000,
    'adata-legend-960-1tb': 14000,
    'samsung-9100-pro-1tb': 15000,
    'samsung-990-pro-1tb': 14000,
  };

  // 削除後に再取得
  const lastRow2 = sheet.getLastRow();
  const data2 = sheet.getRange(DATA_START_ROW, 1, lastRow2 - HEADER_ROW, COL.STORE_COUNT).getValues();
  let updateCount = 0;
  for (let i = 0; i < data2.length; i++) {
    const pid = data2[i][COL.PRODUCT_ID - 1];
    if (priceUpdates[pid]) {
      sheet.getRange(i + DATA_START_ROW, COL.TARGET_PRICE).setValue(priceUpdates[pid]);
      updateCount++;
    }
  }

  // --- 3. 新製品5件を追加 ---
  const newProducts = [
    ['samsung-990-pro-hs-2tb', 'Samsung 990 PRO with Heatsink', '2TB', 'https://kakaku.com/item/K0001546441/', 24000],
    ['wd-black-sn850p-2tb', 'WD_BLACK SN850P for PS5', '2TB', 'https://kakaku.com/item/K0001551012/', 24000],
    ['crucial-t500-hs-2tb', 'Crucial T500 with Heatsink', '2TB', 'https://kakaku.com/item/K0001588764/', 20000],
    ['wd-black-sn7100-1tb', 'WD_BLACK SN7100', '1TB', 'https://kakaku.com/item/K0001673419/', 15000],
    ['samsung-9100-pro-hs-2tb', 'Samsung 9100 PRO with Heatsink', '2TB', 'https://kakaku.com/item/K0001681636/', 40000],
  ];

  for (const p of newProducts) {
    const newRow = new Array(COL.STORE_COUNT).fill('');
    newRow[COL.PRODUCT_ID - 1] = p[0];
    newRow[COL.NAME - 1] = p[1];
    newRow[COL.CAPACITY - 1] = p[2];
    newRow[COL.KAKAKU_URL - 1] = p[3];
    newRow[COL.TARGET_PRICE - 1] = p[4];
    newRow[COL.CONSECUTIVE_FAIL_COUNT - 1] = 0;
    newRow[COL.STATUS - 1] = STATUS_HIGH;
    sheet.appendRow(newRow);
  }

  // --- 4. config: price_threshold_pct を 10 に ---
  const configSheet = getSheet(SHEET_CONFIG);
  const configData = configSheet.getDataRange().getValues();
  for (let i = 1; i < configData.length; i++) {
    if (configData[i][0] === 'price_threshold_pct') {
      configSheet.getRange(i + 1, 2).setValue(10);
      break;
    }
  }

  markMigrationDone('updateProducts2026');
  SpreadsheetApp.getUi().alert(
    '2026-03 ラインナップ更新完了！\n\n' +
    '・旧世代削除: 1件（FireCuda 530 HS）\n' +
    '・target_price更新: ' + updateCount + '件\n' +
    '・新製品追加: ' + newProducts.length + '件\n' +
    '・price_threshold_pct: 5→10\n\n' +
    '「SSD管理」→「今すぐ価格取得」で新製品の初回価格を取得してください。'
  );
}

/**
 * 2026-04 メンテナンス
 * - 重複 product_id を除去（updateProducts2026 誤再実行の修復）
 * - WD_BLACK SN850P 2TB（取り扱い中止）を削除
 * - 全製品の consecutive_fail_count をゼロにリセット
 * - エラーステータスを「高め」にリセット
 * ※ エディタから直接実行可能（getUi不使用）
 */
function maintenance202604() {
  if (isMigrationDone('maintenance202604')) { Logger.log('maintenance202604 は実行済みです'); return; }
  var sheet = getSheet(SHEET_PRODUCTS);

  // --- 0. 重複 product_id を除去（後ろの行を削除） ---
  var lastRow0 = sheet.getLastRow();
  var data0 = sheet.getRange(DATA_START_ROW, 1, lastRow0 - HEADER_ROW, COL.STORE_COUNT).getValues();
  var seen = {};
  var dupCount = 0;
  for (var k = data0.length - 1; k >= 0; k--) {
    var pid = data0[k][COL.PRODUCT_ID - 1];
    if (seen[pid]) {
      sheet.deleteRow(k + DATA_START_ROW);
      dupCount++;
    } else {
      seen[pid] = true;
    }
  }

  // --- 1. SN850P 2TB を削除 ---
  var lastRow1 = sheet.getLastRow();
  var data1 = sheet.getRange(DATA_START_ROW, 1, lastRow1 - HEADER_ROW, COL.STORE_COUNT).getValues();
  var deleteCount = 0;
  for (var i = data1.length - 1; i >= 0; i--) {
    if (data1[i][COL.PRODUCT_ID - 1] === 'wd-black-sn850p-2tb') {
      sheet.deleteRow(i + DATA_START_ROW);
      deleteCount++;
    }
  }

  // --- 2. 全製品の fail count リセット + エラーステータス解除 ---
  var lastRow2 = sheet.getLastRow();
  var data2 = sheet.getRange(DATA_START_ROW, 1, lastRow2 - HEADER_ROW, COL.STORE_COUNT).getValues();
  var resetCount = 0;
  for (var j = 0; j < data2.length; j++) {
    var rowNum = j + DATA_START_ROW;
    var failCount = data2[j][COL.CONSECUTIVE_FAIL_COUNT - 1] || 0;
    var status = data2[j][COL.STATUS - 1];

    if (failCount > 0) {
      sheet.getRange(rowNum, COL.CONSECUTIVE_FAIL_COUNT).setValue(0);
      resetCount++;
    }
    if (status === STATUS_ERROR) {
      sheet.getRange(rowNum, COL.STATUS).setValue(STATUS_HIGH);
    }
  }

  markMigrationDone('maintenance202604');
  var msg = '2026-04 メンテナンス完了！' +
    ' 重複除去: ' + dupCount + '件' +
    ' / SN850P削除: ' + deleteCount + '件' +
    ' / failリセット: ' + resetCount + '件' +
    ' / 残り製品数: ' + (lastRow2 - HEADER_ROW) + '件';
  Logger.log(msg);
}

/**
 * 2026-04 マイグレーション (b)
 * - products シートに store_count ヘッダー追加（O列）
 * - 既存マイグレーション関数の実行済みフラグを一括登録
 * ※ エディタから直接実行可能（getUi不使用）
 */
function migration202604b() {
  if (isMigrationDone('migration202604b')) { Logger.log('migration202604b は実行済みです'); return; }

  // --- 1. store_count ヘッダー追加 ---
  var sheet = getSheet(SHEET_PRODUCTS);
  var currentHeader = sheet.getRange(HEADER_ROW, COL.STORE_COUNT).getValue();
  if (!currentHeader) {
    sheet.getRange(HEADER_ROW, COL.STORE_COUNT).setValue('store_count').setFontWeight('bold');
    Logger.log('store_count ヘッダーを追加しました');
  }

  // --- 2. 過去マイグレーションの実行済みフラグを一括登録 ---
  var pastMigrations = ['seedProducts', 'fixProducts', 'updateProducts2026', 'maintenance202604'];
  var registered = 0;
  for (var i = 0; i < pastMigrations.length; i++) {
    if (!isMigrationDone(pastMigrations[i])) {
      markMigrationDone(pastMigrations[i]);
      registered++;
    }
  }

  markMigrationDone('migration202604b');
  Logger.log('migration202604b 完了: ヘッダー追加=' + (currentHeader ? 'スキップ' : '済') + ' / フラグ登録=' + registered + '件');
}

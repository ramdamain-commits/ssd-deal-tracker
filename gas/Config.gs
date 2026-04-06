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

// ===== 実行済みマイグレーション（削除済み） =====
// setupSheets, seedProducts, fixProducts, updateProducts2026,
// maintenance202604, migration202604b, migration202604c, migration202604d
// → 全て実行済み。config シートにフラグあり。

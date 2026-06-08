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

// 日次サマリーメールの有効/無効（2026-06-08: ユーザー要望で無効化＝週次のみ受信）
// ※ GAS の sendDailySummary 時間トリガーを消し忘れても、false の間はメールが飛ばない安全装置
const DAILY_SUMMARY_ENABLED = false;

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

/**
 * v1.2.0 ラインナップ見直し (2026-04-07)
 * - 2TB 全4製品 + 高額1TB 4製品 + ADATA 1製品 = 9製品を削除
 * - 残り5製品の target_price を市場価格の90%に更新
 */
function migration202604e() {
  if (isMigrationDone('migration202604e')) {
    Logger.log('migration202604e は実行済みです');
    return;
  }

  var sheet = getSheet(SHEET_PRODUCTS);
  var lastRow = sheet.getLastRow();
  var data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STORE_COUNT).getValues();

  // 削除対象の product_id
  var deleteIds = [
    'samsung-990-pro-hs-2tb',
    'wd-black-sn850p-2tb',
    'crucial-t500-hs-2tb',
    'samsung-9100-pro-hs-2tb',
    'samsung-990-pro-hs-1tb',
    'wd-black-sn850x-hs-1tb',
    'samsung-9100-pro-1tb',
    'samsung-990-pro-1tb',
    'adata-legend-960-1tb',
  ];

  // target_price 更新マップ
  var priceUpdates = {
    'crucial-t500-hs-1tb': 25900,
    'crucial-t500-1tb': 26400,
    'kioxia-exceria-plus-g3-1tb': 25300,
    'kioxia-exceria-plus-g4-1tb': 27800,
    'wd-black-sn7100-1tb': 29000,
  };

  // 下から順に削除（行番号ズレ防止）
  for (var i = data.length - 1; i >= 0; i--) {
    var productId = data[i][COL.PRODUCT_ID - 1];
    if (deleteIds.indexOf(productId) !== -1) {
      sheet.deleteRow(i + DATA_START_ROW);
      Logger.log('削除: ' + productId);
    }
  }

  // target_price 更新（削除後に再取得）
  lastRow = sheet.getLastRow();
  data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STORE_COUNT).getValues();
  for (var j = 0; j < data.length; j++) {
    var pid = data[j][COL.PRODUCT_ID - 1];
    if (priceUpdates[pid] !== undefined) {
      sheet.getRange(j + DATA_START_ROW, COL.TARGET_PRICE).setValue(priceUpdates[pid]);
      Logger.log('更新: ' + pid + ' → ¥' + priceUpdates[pid]);
    }
  }

  markMigrationDone('migration202604e');
  Logger.log('migration202604e 完了: 9製品削除、5製品の target_price 更新');
}

/**
 * v1.3.0 ターゲット価格を「正常化アンカー」基準に変更 (2026-04-30)
 *
 * 背景:
 * - migration202604e は「市場価格の90%」基準だったが、NAND高騰中(2026Q2予測 +70〜75%)に
 *   高値追随する設計になっていた。ユーザー意図は「正常化したら買う」基準。
 * - 2024〜2025年5月の底値帯(Gen4主流1TB ¥9,000〜10,000台、高速Gen4/Gen5 ¥12,000〜13,000台)を
 *   アンカーに再設定する。
 *
 * 注意（2026-10 に再レビュー予定）:
 * - kioxia-exceria-plus-g4-1tb と wd-black-sn7100-1tb は新型で2024-2025の底値が
 *   観測されていない。旧世代(G3, SN770)からの類推で設定した「推定アンカー」。
 * - 当面1〜2年は全製品 NORMAL のままになる可能性が高い(=高騰相場で買わせない設計)。
 */
function migration202604f() {
  if (isMigrationDone('migration202604f')) {
    Logger.log('migration202604f は実行済みです');
    return;
  }

  var sheet = getSheet(SHEET_PRODUCTS);
  var lastRow = sheet.getLastRow();
  var data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STORE_COUNT).getValues();

  // target_price 更新マップ（正常化アンカー基準）
  var priceUpdates = {
    'crucial-t500-hs-1tb': 12500,        // 2024年特価帯 ¥12,100〜12,700
    'crucial-t500-1tb': 12500,           // 同上
    'kioxia-exceria-plus-g3-1tb': 10000, // Gen4主流底値 ¥9,000〜10,000台
    'kioxia-exceria-plus-g4-1tb': 12500, // 推定アンカー（新型・2026-10再レビュー）
    'wd-black-sn7100-1tb': 11500,        // 推定アンカー（SN770類推・2026-10再レビュー）
  };

  for (var j = 0; j < data.length; j++) {
    var pid = data[j][COL.PRODUCT_ID - 1];
    if (priceUpdates[pid] !== undefined) {
      sheet.getRange(j + DATA_START_ROW, COL.TARGET_PRICE).setValue(priceUpdates[pid]);
      Logger.log('更新: ' + pid + ' → ¥' + priceUpdates[pid]);
    }
  }

  markMigrationDone('migration202604f');
  Logger.log('migration202604f 完了: 5製品の target_price を正常化アンカーに更新');
}

/**
 * v1.3.1 Crucial T500 1TB（HSなし）を追跡対象から削除 (2026-05-08)
 *
 * 背景:
 * - 2026-05時点で価格.com の取扱店舗ゼロ（prdlprc: 0）。13日連続で取得失敗
 * - HTML構造変更ではなく「現在価格情報の登録がありません」状態
 * - NAND高騰でメーカーがヒートシンク付き(crucial-t500-hs-1tb)に在庫を絞った可能性
 * - HSあり版で代替可能なため追跡対象から除外
 */
function migration202605a() {
  if (isMigrationDone('migration202605a')) {
    Logger.log('migration202605a は実行済みです');
    return;
  }

  var sheet = getSheet(SHEET_PRODUCTS);
  var lastRow = sheet.getLastRow();
  var data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STORE_COUNT).getValues();

  var deleteIds = ['crucial-t500-1tb'];

  for (var i = data.length - 1; i >= 0; i--) {
    var productId = data[i][COL.PRODUCT_ID - 1];
    if (deleteIds.indexOf(productId) !== -1) {
      sheet.deleteRow(i + DATA_START_ROW);
      Logger.log('削除: ' + productId);
    }
  }

  markMigrationDone('migration202605a');
  Logger.log('migration202605a 完了: crucial-t500-1tb を削除（4製品体制）');
}

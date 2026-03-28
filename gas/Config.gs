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

/**
 * 初期セットアップ: ヘッダー行と config データを投入する
 * ※ 一度だけ実行すること
 */
function setupSheets() {
  const ss = getSpreadsheet();

  // --- products シート ---
  const products = ss.getSheetByName(SHEET_PRODUCTS);
  products.getRange(1, 1, 1, 14).setValues([[
    'product_id', 'name', 'capacity', 'kakaku_url', 'target_price',
    'current_price', 'lowest_price', 'recent_avg_price', 'last_checked',
    'last_notified', 'shop_name', 'shop_url', 'consecutive_fail_count', 'status'
  ]]);
  products.getRange(1, 1, 1, 14).setFontWeight('bold');
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
    const newRow = new Array(COL.STATUS).fill('');
    newRow[COL.PRODUCT_ID - 1] = p[0];
    newRow[COL.NAME - 1] = p[1];
    newRow[COL.CAPACITY - 1] = p[2];
    newRow[COL.KAKAKU_URL - 1] = p[3];
    newRow[COL.TARGET_PRICE - 1] = p[4];
    newRow[COL.CONSECUTIVE_FAIL_COUNT - 1] = 0;
    newRow[COL.STATUS - 1] = STATUS_HIGH;
    sheet.appendRow(newRow);
  }

  SpreadsheetApp.getUi().alert(products.length + '機種を登録しました！\n\n次に「SSD管理」→「今すぐ価格取得」で初回価格を取得してください。');
}

/**
 * 販売終了だった4製品を在庫ありの製品に差し替える
 * ※ 一度だけ実行すること
 */
function fixProducts() {
  const sheet = getSheet(SHEET_PRODUCTS);
  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STATUS).getValues();

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
      sheet.getRange(rowNum, COL.PRODUCT_ID).setValue(r[0]);
      sheet.getRange(rowNum, COL.NAME).setValue(r[1]);
      sheet.getRange(rowNum, COL.KAKAKU_URL).setValue(r[2]);
      sheet.getRange(rowNum, COL.TARGET_PRICE).setValue(r[3]);
      // リセット
      sheet.getRange(rowNum, COL.CURRENT_PRICE).setValue('');
      sheet.getRange(rowNum, COL.LOWEST_PRICE).setValue('');
      sheet.getRange(rowNum, COL.RECENT_AVG_PRICE).setValue('');
      sheet.getRange(rowNum, COL.SHOP_NAME).setValue('');
      sheet.getRange(rowNum, COL.SHOP_URL).setValue('');
      sheet.getRange(rowNum, COL.CONSECUTIVE_FAIL_COUNT).setValue(0);
      sheet.getRange(rowNum, COL.STATUS).setValue(STATUS_HIGH);
      fixCount++;
    }
  }

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
  const sheet = getSheet(SHEET_PRODUCTS);
  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STATUS).getValues();

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
  const data2 = sheet.getRange(DATA_START_ROW, 1, lastRow2 - HEADER_ROW, COL.STATUS).getValues();
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
    const newRow = new Array(COL.STATUS).fill('');
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

  SpreadsheetApp.getUi().alert(
    '2026-03 ラインナップ更新完了！\n\n' +
    '・旧世代削除: 1件（FireCuda 530 HS）\n' +
    '・target_price更新: ' + updateCount + '件\n' +
    '・新製品追加: ' + newProducts.length + '件\n' +
    '・price_threshold_pct: 5→10\n\n' +
    '「SSD管理」→「今すぐ価格取得」で新製品の初回価格を取得してください。'
  );
}

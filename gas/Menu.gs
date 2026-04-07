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
    .addSeparator()
    .addItem('v1.2.0 ラインナップ見直し', 'migration202604e')
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

  const newRow = new Array(COL.STORE_COUNT).fill('');
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
    determineStatus(scrapeResult.price, targetPrice, getConfigValue('price_threshold_pct') || 10);
  newRow[COL.STORE_COUNT - 1] = scrapeResult.storeCount !== null ? scrapeResult.storeCount : '';

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

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

/**
 * Web App テスト用関数
 */
function testDoGet() {
  const result = doGet({});
  const json = JSON.parse(result.getContent());
  Logger.log(JSON.stringify(json, null, 2));
}

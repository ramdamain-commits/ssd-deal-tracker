/**
 * 全製品の価格を取得し、Spreadsheet を更新する（メインエントリポイント）
 * GAS トリガーから呼び出される
 */
function checkAllPrices() {
  const ss = getSpreadsheet();
  const sheet = getSheet(SHEET_PRODUCTS);
  const historySheet = getSheet(SHEET_PRICE_HISTORY);
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) {
    ss.toast('製品が登録されていません', '価格取得', 3);
    return;
  }

  const data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STATUS).getValues();
  const total = data.length;
  const errors = [];
  const deals = [];
  const now = new Date();

  ss.toast('価格取得を開始します（' + total + '件）...', '価格取得', 3);
  Logger.log('=== 価格取得開始: ' + total + '件 ===');

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

    // 進捗表示
    ss.toast('(' + (i + 1) + '/' + total + ') ' + name + ' を取得中...', '価格取得', 30);
    Logger.log('(' + (i + 1) + '/' + total + ') ' + name + ' ...');

    // 価格取得
    const result = scrapeKakakuPrice(kakakuUrl);

    if (result.error || result.price === null) {
      // 取得失敗
      const newFailCount = consecutiveFails + 1;
      sheet.getRange(rowNum, COL.CONSECUTIVE_FAIL_COUNT).setValue(newFailCount);
      sheet.getRange(rowNum, COL.STATUS).setValue(STATUS_ERROR);
      sheet.getRange(rowNum, COL.LAST_CHECKED).setValue(now);
      errors.push({ name, capacity, error: result.error, failCount: newFailCount });
      Logger.log('  ✗ エラー: ' + result.error);
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
    const thresholdPct = getConfigValue('price_threshold_pct') || 10;
    const status = determineStatus(result.price, targetPrice, thresholdPct);
    sheet.getRange(rowNum, COL.STATUS).setValue(status);
    Logger.log('  ✓ ¥' + result.price + ' [' + status + ']');

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

  // 完了サマリー
  const okCount = total - errors.length;
  const summary = '完了！ 成功: ' + okCount + '件 / エラー: ' + errors.length + '件' + (deals.length > 0 ? ' / 買い時: ' + deals.length + '件' : '');
  ss.toast(summary, '価格取得完了', 10);
  Logger.log('=== ' + summary + ' ===');
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

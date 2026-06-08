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

// ===== 週次サマリー =====

/**
 * 週次サマリーメールを送信する（毎週月曜トリガー用）
 */
function sendWeeklySummary() {
  const notifyEmail = getConfigValue('notify_email');
  if (!notifyEmail) return;

  const sheet = getSheet(SHEET_PRODUCTS);
  const historySheet = getSheet(SHEET_PRICE_HISTORY);
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return;

  const data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STORE_COUNT).getValues();
  const historyData = historySheet.getDataRange().getValues();

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const items = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const productId = row[COL.PRODUCT_ID - 1];
    const name = row[COL.NAME - 1];
    const capacity = row[COL.CAPACITY - 1];
    const currentPrice = row[COL.CURRENT_PRICE - 1];
    const targetPrice = row[COL.TARGET_PRICE - 1];
    const lowestPrice = row[COL.LOWEST_PRICE - 1];
    const kakakuUrl = row[COL.KAKAKU_URL - 1];
    const status = row[COL.STATUS - 1];

    if (!currentPrice || status === STATUS_ERROR) continue;

    // 1週間前の価格を取得
    const weekAgoPrice = getWeekAgoPrice(productId, historyData, oneWeekAgo);

    // 変動率を計算
    let changeRate = null;
    let changeLabel = '---';
    if (weekAgoPrice && weekAgoPrice > 0) {
      changeRate = (currentPrice - weekAgoPrice) / weekAgoPrice * 100;
      changeLabel = (changeRate >= 0 ? '+' : '') + changeRate.toFixed(1) + '%';
    }

    // トレンドラベルを判定
    const trend = classifyTrend(changeRate, currentPrice, targetPrice);

    items.push({
      name, capacity, currentPrice, targetPrice, lowestPrice,
      weekAgoPrice, changeRate, changeLabel, trend, kakakuUrl
    });
  }

  // トレンド順でソート: 急落注目 → 目標接近 → じわ下げ → 上昇注意 → 横ばい
  const trendOrder = { '急落注目': 0, '目標接近': 1, 'じわ下げ': 2, '上昇注意': 3, '横ばい': 4, '---': 5 };
  items.sort(function(a, b) { return (trendOrder[a.trend] || 9) - (trendOrder[b.trend] || 9); });

  // メール本文を組み立て
  const lines = [
    'PS5 SSD Deal Tracker 週次レポート',
    '集計日: ' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd (E)'),
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  // トレンド別に注目ポイントをまとめる
  const notable = items.filter(function(it) { return it.trend !== '横ばい' && it.trend !== '---'; });
  if (notable.length > 0) {
    lines.push('');
    lines.push('▼ 今週の注目');
    lines.push('');
    for (const it of notable) {
      lines.push('  【' + it.trend + '】' + it.name + ' (' + it.capacity + ')');
      if (it.weekAgoPrice) {
        lines.push('    ¥' + it.weekAgoPrice.toLocaleString() + ' → ¥' + it.currentPrice.toLocaleString() + ' (' + it.changeLabel + ')');
      }
      if (it.trend === '目標接近') {
        lines.push('    目標¥' + it.targetPrice.toLocaleString() + 'まであと¥' + (it.currentPrice - it.targetPrice).toLocaleString());
      }
      lines.push('    ' + it.kakakuUrl);
    }
  } else {
    lines.push('');
    lines.push('今週は大きな変動はありませんでした。');
  }

  // 全製品一覧
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('▼ 全製品サマリー');
  lines.push('');

  for (const it of items) {
    const arrow = it.changeRate === null ? '  ' : (it.changeRate < 0 ? '↓' : (it.changeRate > 0 ? '↑' : '→'));
    lines.push(arrow + ' ' + it.name + ' (' + it.capacity + ')');
    lines.push('  現在: ¥' + it.currentPrice.toLocaleString() + ' / 目標: ¥' + it.targetPrice.toLocaleString() + ' / 最安記録: ¥' + (it.lowestPrice ? it.lowestPrice.toLocaleString() : '---'));
    lines.push('  週間変動: ' + it.changeLabel + ' [' + it.trend + ']');
    lines.push('  ' + it.kakakuUrl);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('ビューページ: https://ramdamain-commits.github.io/ssd-deal-tracker/');
  lines.push('※ 価格.com表示価格。送料別の場合があります。');

  const subject = '【SSD週次レポート】' + (notable.length > 0 ? notable[0].trend + ': ' + notable[0].name : '今週の価格動向');
  GmailApp.sendEmail(notifyEmail, subject, lines.join('\n'));
}

/**
 * 1週間前に最も近い価格を取得する
 */
function getWeekAgoPrice(productId, historyData, oneWeekAgo) {
  let closestPrice = null;
  let closestDiff = Infinity;

  for (let i = 1; i < historyData.length; i++) {
    if (historyData[i][0] !== productId) continue;
    const date = new Date(historyData[i][1]);
    const diff = Math.abs(date.getTime() - oneWeekAgo.getTime());
    if (diff < closestDiff) {
      closestDiff = diff;
      closestPrice = historyData[i][2];
    }
  }

  // 3日以上離れていたらデータなし扱い
  if (closestDiff > 3 * 24 * 60 * 60 * 1000) return null;
  return closestPrice;
}

/**
 * 週間変動率からトレンドラベルを判定する
 *
 * | ラベル     | 条件                          |
 * |-----------|-------------------------------|
 * | 急落注目   | 週間 -5% 以上の下落            |
 * | じわ下げ   | 週間 -2%〜-5%                 |
 * | 横ばい     | 週間 ±2% 以内                 |
 * | 上昇注意   | 週間 +5% 以上                 |
 * | 目標接近   | 目標価格の +10% 以内          |
 */
function classifyTrend(changeRate, currentPrice, targetPrice) {
  // 目標接近は変動率に関わらず優先判定
  if (targetPrice && currentPrice <= targetPrice * 1.10) {
    return '目標接近';
  }

  if (changeRate === null) return '---';
  if (changeRate <= -5) return '急落注目';
  if (changeRate <= -2) return 'じわ下げ';
  if (changeRate >= 5) return '上昇注意';
  return '横ばい';
}

// ===== デイリーサマリー =====

/**
 * デイリーサマリーメールを送信する（毎日21時トリガー用）
 * 全製品の価格状況 + エラーがあればまとめて1通で送る
 */
function sendDailySummary() {
  // 安全装置: 日次サマリーは無効化中（週次のみ受信）。トリガー消し忘れでもメールを飛ばさない
  if (!DAILY_SUMMARY_ENABLED) {
    Logger.log('sendDailySummary: DAILY_SUMMARY_ENABLED=false のためスキップ');
    return;
  }

  const notifyEmail = getConfigValue('notify_email');
  if (!notifyEmail) return;

  const sheet = getSheet(SHEET_PRODUCTS);
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return;

  const data = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, COL.STORE_COUNT).getValues();
  const now = new Date();

  const lines = [
    'SSD Deal Tracker デイリーサマリー',
    Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd (E) HH:mm'),
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  // エラー集計
  const errorItems = [];
  const normalItems = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const name = row[COL.NAME - 1];
    const capacity = row[COL.CAPACITY - 1];
    const currentPrice = row[COL.CURRENT_PRICE - 1];
    const targetPrice = row[COL.TARGET_PRICE - 1];
    const lowestPrice = row[COL.LOWEST_PRICE - 1];
    const status = row[COL.STATUS - 1];
    const storeCount = row[COL.STORE_COUNT - 1];
    const consecutiveFails = row[COL.CONSECUTIVE_FAIL_COUNT - 1] || 0;
    const kakakuUrl = row[COL.KAKAKU_URL - 1];

    if (status === STATUS_ERROR) {
      errorItems.push({ name, capacity, failCount: consecutiveFails });
    } else if (currentPrice) {
      normalItems.push({ name, capacity, currentPrice, targetPrice, lowestPrice, status, storeCount, kakakuUrl });
    }
  }

  // エラーセクション
  if (errorItems.length > 0) {
    lines.push('');
    lines.push('⚠ 取得エラー: ' + errorItems.length + '件');
    lines.push('');
    for (const err of errorItems) {
      const warn = err.failCount >= CONSECUTIVE_FAIL_ALERT_THRESHOLD ? ' ← 連続' + err.failCount + '回失敗' : '';
      lines.push('  - ' + err.name + ' (' + err.capacity + ')' + warn);
    }
    if (errorItems.some(function(e) { return e.failCount >= CONSECUTIVE_FAIL_ALERT_THRESHOLD; })) {
      lines.push('');
      lines.push('  ※ 連続' + CONSECUTIVE_FAIL_ALERT_THRESHOLD + '回以上失敗 → HTML構造変更の可能性あり');
    }
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  // 価格サマリーセクション
  lines.push('');
  lines.push('▼ 全製品サマリー（' + normalItems.length + '件）');
  lines.push('');

  // ステータス順: 買い時 → もう少し → 高め
  const statusOrder = { [STATUS_BUY]: 0, [STATUS_ALMOST]: 1, [STATUS_HIGH]: 2 };
  normalItems.sort(function(a, b) { return (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9); });

  for (const it of normalItems) {
    const icon = it.status === STATUS_BUY ? '★' : (it.status === STATUS_ALMOST ? '▶' : ' ');
    lines.push(icon + ' [' + it.status + '] ' + it.name + ' (' + it.capacity + ')');
    let storeLine = '  現在: ¥' + it.currentPrice.toLocaleString() + ' / 目標: ¥' + it.targetPrice.toLocaleString() + ' / 最安記録: ¥' + (it.lowestPrice ? it.lowestPrice.toLocaleString() : '---');
    if (it.storeCount) storeLine += ' / ' + it.storeCount + '店';
    lines.push(storeLine);
    if (it.storeCount && it.storeCount <= LOW_STORE_COUNT_THRESHOLD) {
      lines.push('  ⚠ 取扱' + it.storeCount + '店のみ — 価格の信頼性が低い可能性あり');
    }
    lines.push('  ' + it.kakakuUrl);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('ビューページ: https://ramdamain-commits.github.io/ssd-deal-tracker/');

  const errorTag = errorItems.length > 0 ? ' (エラー' + errorItems.length + '件)' : '';
  const subject = '【SSD日次レポート】' + Utilities.formatDate(now, 'Asia/Tokyo', 'MM/dd') + errorTag;
  GmailApp.sendEmail(notifyEmail, subject, lines.join('\n'));
}

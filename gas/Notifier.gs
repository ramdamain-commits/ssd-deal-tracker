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

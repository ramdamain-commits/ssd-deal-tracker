/**
 * UrlFetchApp 用の共通ヘッダーオプションを返す
 * @returns {Object}
 */
function buildFetchOptions() {
  return {
    muteHttpExceptions: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja-JP,ja;q=0.9',
      'Referer': 'https://kakaku.com/',
      'Cache-Control': 'no-cache'
    }
  };
}

/**
 * 価格.com の製品ページから最安値情報を取得する
 * @param {string} kakakuUrl - 価格.com 製品ページURL
 * @returns {{price: number|null, shopName: string|null, shopUrl: string|null, error: string|null}}
 */
function scrapeKakakuPrice(kakakuUrl) {
  try {
    const response = UrlFetchApp.fetch(kakakuUrl, buildFetchOptions());
    const statusCode = response.getResponseCode();

    if (statusCode !== 200) {
      return { price: null, shopName: null, shopUrl: null, storeCount: null, error: 'HTTP ' + statusCode };
    }

    const html = response.getContentText();
    return parseKakakuHtml(html, kakakuUrl);
  } catch (e) {
    return { price: null, shopName: null, shopUrl: null, storeCount: null, error: e.message };
  }
}

/**
 * 価格.com HTML から最安値情報をパースする
 * @param {string} html - ページHTML
 * @param {string} baseUrl - 元URL（デバッグ用）
 * @returns {{price: number|null, shopName: string|null, shopUrl: string|null, error: string|null}}
 */
function parseKakakuHtml(html, baseUrl) {
  let price = null;

  // --- 最安値を抽出 ---
  // 優先1: JSON-LD 構造化データ（Schema.org 標準、最も安定）
  const jsonLdMatch = html.match(/"lowPrice"\s*:\s*"(\d+)"/);
  if (jsonLdMatch) {
    price = parseInt(jsonLdMatch[1], 10);
  }

  // 優先2: JS 変数 prdlprc（価格.com 内部変数）
  if (!price) {
    const jsMatch = html.match(/prdlprc\s*:\s*(\d+)/);
    if (jsMatch) {
      price = parseInt(jsMatch[1], 10);
    }
  }

  if (!price || price <= 0) {
    return { price: null, shopName: null, shopUrl: null, storeCount: null, error: '価格要素が見つかりません' };
  }

  // --- 最安ショップURLを抽出 ---
  const shopUrlMatch = html.match(/href="(https?:\/\/c\.kakaku\.com\/forwarder\/forward\.aspx[^"]+)"/);
  const shopUrl = shopUrlMatch ? shopUrlMatch[1] : null;

  // --- 最安ショップ名を抽出 ---
  // ページは Shift_JIS なのでショップ名は文字化けの可能性あり
  // forwarder リンク直後の <a> タグテキストから取得を試みる
  let shopName = null;
  if (shopUrlMatch) {
    const pos = html.indexOf(shopUrlMatch[0]);
    const afterForwarder = html.substring(pos, pos + 500);
    const nameMatch = afterForwarder.match(/>([^<]{2,30})</);
    if (nameMatch) {
      shopName = nameMatch[1].trim();
    }
  }

  // --- 出品店舗数を抽出 ---
  let storeCount = null;
  // 優先1: JSON-LD の offerCount
  const offerCountMatch = html.match(/"offerCount"\s*:\s*"?(\d+)"?/);
  if (offerCountMatch) {
    storeCount = parseInt(offerCountMatch[1], 10);
  }
  // 優先2: 「XX店の価格を見る」パターン
  if (!storeCount) {
    const storeTextMatch = html.match(/(\d+)\s*店の価格/);
    if (storeTextMatch) {
      storeCount = parseInt(storeTextMatch[1], 10);
    }
  }

  return { price, shopName, shopUrl, storeCount, error: null };
}

// ===== デバッグ・テスト用関数 =====

/**
 * 価格.com のHTMLを取得してログに出力する（パース確認用）
 */
function debugFetchKakaku() {
  const url = 'https://kakaku.com/item/K0001520655/';
  const response = UrlFetchApp.fetch(url, buildFetchOptions());
  Logger.log('Status: ' + response.getResponseCode());
  const body = response.getContentText();
  Logger.log('Body length: ' + body.length);

  // パターン1: prdlprc JS変数
  const p1 = body.match(/prdlprc[\s\S]{0,30}/);
  Logger.log('P1 prdlprc: ' + (p1 ? p1[0] : 'NOT FOUND'));

  // パターン2: lowPrice / lowestPrice 系
  const p2 = body.match(/[Ll]ow[Pp]rice[\s\S]{0,50}/);
  Logger.log('P2 lowPrice: ' + (p2 ? p2[0] : 'NOT FOUND'));

  // パターン3: "price" を含むclass/id（最初の5件）
  const p3 = body.match(/[cC]lass="[^"]*[pP]rice[^"]*"/g);
  Logger.log('P3 price classes: ' + (p3 ? p3.slice(0, 5).join(' | ') : 'NOT FOUND'));

  // パターン4: 5桁以上のカンマ区切り数字（価格候補）の周辺
  const p4 = body.match(/.{0,40}(\d{1,3},\d{3})\s*円.{0,20}/g);
  Logger.log('P4 price-yen: ' + (p4 ? p4.slice(0, 3).join(' | ') : 'NOT FOUND'));

  // パターン5: カンマ区切り数字＋波線（~）
  const p5 = body.match(/.{0,40}\d{1,3},\d{3}\s*~.{0,20}/g);
  Logger.log('P5 price-tilde: ' + (p5 ? p5.slice(0, 3).join(' | ') : 'NOT FOUND'));

  // パターン6: forwarder リンク
  const p6 = body.match(/forwarder\/forward\.aspx[\s\S]{0,200}/);
  Logger.log('P6 forwarder: ' + (p6 ? p6[0] : 'NOT FOUND'));

  // パターン7: 製品ページのJSON-LD（構造化データ）
  const p7 = body.match(/"@type"\s*:\s*"Product"[\s\S]{0,500}/);
  Logger.log('P7 JSON-LD Product: ' + (p7 ? p7[0].substring(0, 300) : 'NOT FOUND'));

  // パターン8: "offers" / "lowPrice" in JSON-LD
  const p8 = body.match(/"lowPrice"[\s\S]{0,50}/);
  Logger.log('P8 JSON-LD lowPrice: ' + (p8 ? p8[0] : 'NOT FOUND'));

  // パターン9: priceTxt クラス（2025年時点の報告あり）
  const p9 = body.match(/class="priceTxt"[\s\S]{0,100}/);
  Logger.log('P9 priceTxt: ' + (p9 ? p9[0] : 'NOT FOUND'));

  // パターン10: window.__DATA__ 等の JS 埋め込みデータ
  const p10 = body.match(/__NEXT_DATA__|window\.__.*?=\s*\{[\s\S]{0,200}/);
  Logger.log('P10 window data: ' + (p10 ? p10[0].substring(0, 200) : 'NOT FOUND'));

  // パターン11: application/json type の script タグ
  const p11 = body.match(/application\/json[\s\S]{0,300}/);
  Logger.log('P11 json script: ' + (p11 ? p11[0].substring(0, 200) : 'NOT FOUND'));

  // HTML先頭200文字（ボット検知リダイレクト確認）
  Logger.log('HTML head: ' + body.substring(0, 200));
}

/**
 * スクレイパーの動作テスト
 */
function testScraper() {
  const result = scrapeKakakuPrice('https://kakaku.com/item/K0001520655/');
  Logger.log(JSON.stringify(result, null, 2));
  // 期待: { price: (正の数値), shopName: (文字列), shopUrl: (URL), error: null }
}

/**
 * 不正なURLでのエラーハンドリングテスト
 */
function testScraperInvalidUrl() {
  const result = scrapeKakakuPrice('https://kakaku.com/item/INVALID_ID_12345/');
  Logger.log(JSON.stringify(result, null, 2));
  // 期待: error が null でない文字列
}

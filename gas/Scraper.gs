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

    const html = response.getContentText('Shift_JIS');
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
  // 優先1: 「(N件/N店舗)」パターン（p-headline_sub 内）
  const storeShopMatch = html.match(/(\d+)件\/(\d+)店舗/);
  if (storeShopMatch) {
    storeCount = parseInt(storeShopMatch[2], 10);
  }
  // 優先2: JSON-LD の offerCount（現時点では価格.comは出力していないがフォールバック）
  if (!storeCount) {
    const offerCountMatch = html.match(/"offerCount"\s*:\s*"?(\d+)"?/);
    if (offerCountMatch) {
      storeCount = parseInt(offerCountMatch[1], 10);
    }
  }

  return { price, shopName, shopUrl, storeCount, error: null };
}


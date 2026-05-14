/* ============================================================
 * 💹 15-price-fetcher.js — 即時報價模組 (v3)
 * ============================================================
 * 用途：
 *   1. 抓取 Yahoo Finance 即時報價（透過 CORS Proxy）
 *   2. 30 秒快取避免頻繁請求
 *   3. 60 秒自動刷新所有持股
 *   4. 自動 dispatch 到 Store 更新價格
 *
 * API：
 *   PriceFetcher.fetchOne('2330.TW')
 *   PriceFetcher.fetchMany(['2330.TW', 'AAPL'])
 *   PriceFetcher.refreshAll()
 *   PriceFetcher.startAutoRefresh()
 *   PriceFetcher.stopAutoRefresh()
 *   PriceFetcher.toYahooSymbol('2330', 'TW')   // → '2330.TW'
 *
 * 依賴：CONFIG, Store
 * ============================================================ */
'use strict';

const PriceFetcher = {

  // ========== 內部狀態 ==========
  _cache: {},               // { yahooSymbol: { price, time, name, currency } }
  _autoTimer: null,
  _proxyIndex: 0,           // 當前使用的 proxy 索引
  _stats: {
    totalRequests: 0,
    successCount: 0,
    failCount: 0,
    lastError: null
  },

  // ========== 把使用者代號轉成 Yahoo 格式 ==========
  toYahooSymbol(symbol, market = 'TW') {
    if (!symbol) return '';
    const s = String(symbol).toUpperCase().trim();

    // 已經有後綴 → 直接回傳
    if (s.includes('.')) return s;

    // 期貨代號（特殊處理）
    if (s === 'TXF' || s === 'MXF' || s === 'TMF') {
      // Yahoo 沒有完美的台指期，先用台股加權指數作為近似
      return '^TWII';
    }

    switch (market.toUpperCase()) {
      case 'TW':
        // 台股：4 碼數字 → .TW；6 碼以上可能是上櫃 → .TWO
        if (/^\d{4}$/.test(s)) return s + '.TW';
        if (/^\d{5,6}$/.test(s)) return s + '.TWO';
        return s + '.TW';
      case 'HK':
        return s.padStart(4, '0') + '.HK';
      case 'US':
      default:
        return s;
    }
  },

  // ========== 抓單一檔 ==========
  async fetchOne(symbol, market = 'TW', { useCache = true } = {}) {
    const yahooSymbol = this.toYahooSymbol(symbol, market);
    if (!yahooSymbol) throw new Error('代號無效');

    // 1. 檢查快取
    if (useCache) {
      const cached = this._cache[yahooSymbol];
      if (cached && (Date.now() - cached.time) < CONFIG.PRICE.CACHE_SEC * 1000) {
        return cached;
      }
    }

    // 2. 嘗試所有 proxy
    const proxies = CONFIG.PRICE.CORS_PROXIES;
    let lastError = null;

    for (let i = 0; i < proxies.length; i++) {
      const proxyIdx = (this._proxyIndex + i) % proxies.length;
      const proxy = proxies[proxyIdx];

      try {
        const result = await this._fetchViaProxy(yahooSymbol, proxy);
        // 成功 → 把這個 proxy 設為下次優先
        this._proxyIndex = proxyIdx;
        this._cache[yahooSymbol] = result;
        this._stats.successCount++;
        return result;
      } catch (e) {
        lastError = e;
        console.warn(`[PriceFetcher] Proxy ${proxyIdx} 失敗 (${yahooSymbol}):`, e.message);
      }
    }

    // 3. 全部失敗
    this._stats.failCount++;
    this._stats.lastError = lastError?.message || '未知錯誤';
    throw new Error(`所有 Proxy 都失敗：${lastError?.message}`);
  },

  // ========== 內部：用指定 proxy 抓 ==========
  async _fetchViaProxy(yahooSymbol, proxy) {
    this._stats.totalRequests++;
    const yahooUrl = `${CONFIG.PRICE.YAHOO_BASE}${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
    const fullUrl = proxy + encodeURIComponent(yahooUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.PRICE.TIMEOUT_MS);

    try {
      const res = await fetch(fullUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // 解析 Yahoo 格式
      const result = json?.chart?.result?.[0];
      if (!result) throw new Error('Yahoo 回應無資料');

      const meta = result.meta || {};
      const price = Number(
        meta.regularMarketPrice ?? 
        meta.previousClose ?? 
        result.indicators?.quote?.[0]?.close?.slice(-1)?.[0] ?? 
        0
      );

      if (!price || isNaN(price)) throw new Error('無法解析價格');

      return {
        symbol: yahooSymbol,
        price: price,
        previousClose: Number(meta.previousClose) || 0,
        change: Number(meta.regularMarketPrice) - Number(meta.previousClose) || 0,
        changePercent: meta.previousClose ? 
          ((Number(meta.regularMarketPrice) - Number(meta.previousClose)) / Number(meta.previousClose) * 100) : 0,
        currency: meta.currency || 'TWD',
        marketState: meta.marketState || 'UNKNOWN',
        time: Date.now(),
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  },

  // ========== 批次抓多檔 ==========
  async fetchMany(symbols, market = 'TW') {
    if (!Array.isArray(symbols) || symbols.length === 0) return {};

    console.log(`[PriceFetcher] 批次抓取 ${symbols.length} 檔...`);

    const promises = symbols.map(s => 
      this.fetchOne(s, market).then(r => ({ symbol: s, success: true, data: r }))
        .catch(e => ({ symbol: s, success: false, error: e.message }))
    );

    const results = await Promise.allSettled(promises);
    const map = {};
    let okCount = 0;

    results.forEach(r => {
      if (r.status === 'fulfilled') {
        const v = r.value;
        map[v.symbol] = v;
        if (v.success) okCount++;
      }
    });

    console.log(`[PriceFetcher] 批次完成：${okCount}/${symbols.length} 成功`);
    return map;
  },

  // ========== 刷新 Store 中所有持股 ==========
  async refreshAll() {
    if (!window.Store) {
      console.warn('[PriceFetcher] Store 未載入');
      return;
    }

    const portfolio = Store.getPortfolio();
    if (!portfolio) return;

    // 蒐集所有要更新的代號（去重）
    const tasks = [];
    const seen = new Set();

    // 現股
    (portfolio.stocks || []).forEach(s => {
      const key = `${s.symbol}|${s.market || 'TW'}`;
      if (!seen.has(key)) {
        seen.add(key);
        tasks.push({ symbol: s.symbol, market: s.market || 'TW', target: 'stock' });
      }
    });

    // 融資券
    (portfolio.margin || []).forEach(s => {
      const key = `${s.symbol}|${s.market || 'TW'}`;
      if (!seen.has(key)) {
        seen.add(key);
        tasks.push({ symbol: s.symbol, market: s.market || 'TW', target: 'margin' });
      }
    });

    // 期貨（暫時跳過，Phase D 再處理特殊邏輯）
    // (portfolio.futures || []).forEach(...)

    // 觀察清單
    (portfolio.watchlist || []).forEach(s => {
      const key = `${s.symbol}|${s.market || 'TW'}`;
      if (!seen.has(key)) {
        seen.add(key);
        tasks.push({ symbol: s.symbol, market: s.market || 'TW', target: 'watchlist' });
      }
    });

    if (tasks.length === 0) {
      console.log('[PriceFetcher] 沒有持股需要更新');
      return { updated: 0, failed: 0 };
    }

    console.log(`[PriceFetcher] 準備更新 ${tasks.length} 檔報價...`);

    let updated = 0;
    let failed = 0;

    // 同步抓取（避免一次塞太多 Proxy 請求）
    for (const t of tasks) {
      try {
        const result = await this.fetchOne(t.symbol, t.market);

        // 更新到 Store
        if (t.target === 'stock') {
          Store.dispatch({
            type: 'STOCK_UPDATE_PRICE',
            payload: { symbol: t.symbol, price: result.price }
          });
        } else {
          // margin / watchlist：直接改物件（Store 暫時沒對應 action，下批做）
          this._directUpdate(t.target, t.symbol, result.price);
        }
        updated++;
      } catch (e) {
        console.warn(`[PriceFetcher] ${t.symbol} 更新失敗:`, e.message);
        failed++;
      }
    }

    console.log(`[PriceFetcher] ✅ 更新完成：${updated} 成功, ${failed} 失敗`);
    return { updated, failed };
  },

  // ========== 內部：直接更新（用於暫時沒對應 action 的市場）==========
  _directUpdate(target, symbol, price) {
    const portfolio = Store.getPortfolio();
    if (!portfolio) return;
    const arr = portfolio[target] || [];
    const item = arr.find(x => String(x.symbol).toUpperCase() === String(symbol).toUpperCase());
    if (item) {
      item.currentPrice = price;
      item.lastPriceUpdate = new Date().toISOString();
    }
    // 不 dispatch，但手動 notify
    Storage.saveLocal(portfolio);
    if (typeof Store._notify === 'function') Store._notify();
  },

  // ========== 自動刷新 ==========
  startAutoRefresh(intervalSec) {
    this.stopAutoRefresh();
    const sec = intervalSec || CONFIG.PRICE.AUTO_REFRESH_SEC;
    console.log(`[PriceFetcher] 🔄 啟動自動刷新（每 ${sec} 秒）`);
    this._autoTimer = setInterval(() => {
      this.refreshAll().catch(e => console.error('[PriceFetcher] 自動刷新失敗:', e));
    }, sec * 1000);
  },

  stopAutoRefresh() {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
      console.log('[PriceFetcher] ⏸ 已停止自動刷新');
    }
  },

  // ========== 工具：清除快取 ==========
  clearCache() {
    this._cache = {};
    console.log('[PriceFetcher] 🗑 快取已清空');
  },

  // ========== 工具：取得統計 ==========
  getStats() {
    return {
      ...this._stats,
      cacheSize: Object.keys(this._cache).length,
      currentProxy: CONFIG.PRICE.CORS_PROXIES[this._proxyIndex],
      autoRefreshActive: !!this._autoTimer
    };
  }
};

// 全域曝露
window.PriceFetcher = PriceFetcher;

console.log('[15-price-fetcher.js] ✅ PriceFetcher 已載入');

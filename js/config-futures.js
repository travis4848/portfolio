/* ============================================================
 * 📊 期貨合約規格資料庫 v2（含個股期動態產生）
 * ============================================================ */
'use strict';

const FUTURES_CONTRACTS = {
  // ==================== 台指類 ====================
  TXF: { symbol: 'TXF', name: '台指期', fullName: '臺股期貨',
    multiplier: 200, initialMargin: 184000, maintenanceMargin: 142000, settlementMargin: 184000,
    tickSize: 1, tickValue: 200, feePerLot: 50, taxRate: 0.00002,
    category: 'index_tw', exchange: 'TAIFEX' },
  MXF: { symbol: 'MXF', name: '小台指', fullName: '小型臺指期貨',
    multiplier: 50, initialMargin: 46000, maintenanceMargin: 35500, settlementMargin: 46000,
    tickSize: 1, tickValue: 50, feePerLot: 30, taxRate: 0.00002,
    category: 'index_tw', exchange: 'TAIFEX' },
  TMF: { symbol: 'TMF', name: '微台指', fullName: '微型臺指期貨',
    multiplier: 10, initialMargin: 9200, maintenanceMargin: 7100, settlementMargin: 9200,
    tickSize: 1, tickValue: 10, feePerLot: 15, taxRate: 0.00002,
    category: 'index_tw', exchange: 'TAIFEX' },

  // ==================== 類股期貨 ====================
  EXF: { symbol: 'EXF', name: '電子期', fullName: '電子類股期貨',
    multiplier: 4000, initialMargin: 100000, maintenanceMargin: 77000, settlementMargin: 100000,
    tickSize: 0.05, tickValue: 200, feePerLot: 50, taxRate: 0.00002,
    category: 'sector_tw', exchange: 'TAIFEX' },
  FXF: { symbol: 'FXF', name: '金融期', fullName: '金融保險類股期貨',
    multiplier: 1000, initialMargin: 60000, maintenanceMargin: 46000, settlementMargin: 60000,
    tickSize: 0.2, tickValue: 200, feePerLot: 50, taxRate: 0.00002,
    category: 'sector_tw', exchange: 'TAIFEX' },

  // ==================== 海外指數期貨 ====================
  UDF: { symbol: 'UDF', name: '美國道瓊', fullName: '美國道瓊期貨',
    multiplier: 20, initialMargin: 50000, maintenanceMargin: 38500, settlementMargin: 50000,
    tickSize: 1, tickValue: 20, feePerLot: 100, taxRate: 0.00002,
    category: 'index_global', exchange: 'TAIFEX' },
  UNF: { symbol: 'UNF', name: '美國那斯達克100', fullName: '美國那斯達克100期貨',
    multiplier: 50, initialMargin: 50000, maintenanceMargin: 38500, settlementMargin: 50000,
    tickSize: 1, tickValue: 50, feePerLot: 100, taxRate: 0.00002,
    category: 'index_global', exchange: 'TAIFEX' },
  SPF: { symbol: 'SPF', name: '美國標普500', fullName: '美國標普500期貨',
    multiplier: 50, initialMargin: 60000, maintenanceMargin: 46000, settlementMargin: 60000,
    tickSize: 0.25, tickValue: 12.5, feePerLot: 100, taxRate: 0.00002,
    category: 'index_global', exchange: 'TAIFEX' }
};

const FUTURES_CATEGORY_LABELS = {
  index_tw: '🇹🇼 台股指數',
  sector_tw: '🏢 類股期貨',
  index_global: '🌍 海外指數',
  stock_tw: '📈 個股期貨',
  custom: '⚙️ 自訂商品'
};

// ==================== 個股期保證金級距 ====================
// 依台灣期交所規範：個股期保證金 = 契約價值 × 級距%
// 級距由台股股票分級決定，這裡用簡化版（可在設定中覆蓋）
const STOCK_FUTURES_MARGIN_TIERS = {
  // 級距：原始 / 維持（占契約價值百分比）
  A: { initial: 0.135, maintenance: 0.1035 },  // 一般股票
  B: { initial: 0.1665, maintenance: 0.1278 }, // 較高波動
  C: { initial: 0.27, maintenance: 0.2070 }    // 高波動 / ETF 含槓桿
};

const FuturesHelper = {
  /** 取得合約規格（先查內建，再查自訂，最後嘗試個股期） */
  getContract(symbol) {
    if (!symbol) return null;
    const sym = String(symbol).trim().toUpperCase();

    // 1️⃣ 內建合約
    if (FUTURES_CONTRACTS[sym]) return FUTURES_CONTRACTS[sym];

    // 2️⃣ 使用者自訂合約（從 settings 讀）
    const settings = (typeof Store !== 'undefined' && Store.getSettings) ? Store.getSettings() : {};
    const customs = settings.customFutures || {};
    if (customs[sym]) return { ...customs[sym], symbol: sym, isCustom: true };

    // 3️⃣ 個股期：「2330F」「2454F」這類，或裸代號 4 碼數字
    return this._buildStockFuturesContract(sym);
  },

  /** 建立個股期合約規格（從 StockDB 動態產生） */
  _buildStockFuturesContract(sym) {
    if (!sym) return null;

    // 移除尾綴 F（個股期可能寫 2330F）
    const baseCode = sym.replace(/F$/, '');

    // 必須是 4 碼數字（台股代號）
    if (!/^\d{4}$/.test(baseCode)) return null;

    // 嘗試從 StockDB 找股票
    let stockName = baseCode;
    if (typeof StockDB !== 'undefined') {
      const s = (StockDB.getStock && StockDB.getStock(baseCode)) ||
                (StockDB.stocks && StockDB.stocks[baseCode]) || null;
      if (s && s.name) stockName = s.name;
    }

    // 嘗試從 PriceFetcher 快取拿現價（沒有就給預設）
    let estimatedPrice = 100;
    if (typeof PriceFetcher !== 'undefined' && PriceFetcher._cache) {
      const cached = PriceFetcher._cache.get(`TW:${baseCode}`);
      if (cached && cached.price) estimatedPrice = cached.price;
    }

    // 個股期：契約乘數 = 2,000 股（台灣標準）
    // 也有 100 股的小型個股期，預設用 2000，可在 modal 裡調整
    const multiplier = 2000;
    const tier = STOCK_FUTURES_MARGIN_TIERS.A;
    const contractValue = estimatedPrice * multiplier;

    return {
      symbol: baseCode,
      name: `${stockName}期`,
      fullName: `${stockName}股票期貨`,
      multiplier: multiplier,
      initialMargin: Math.ceil(contractValue * tier.initial),
      maintenanceMargin: Math.ceil(contractValue * tier.maintenance),
      settlementMargin: Math.ceil(contractValue * tier.initial),
      tickSize: 0.01,
      tickValue: 20,                     // 0.01 × 2000 = 20
      feePerLot: 30,
      taxRate: 0.00002,
      category: 'stock_tw',
      exchange: 'TAIFEX',
      isStockFutures: true,
      underlyingSymbol: baseCode,
      _isDynamic: true                   // 標記：動態產生（保證金會隨股價變動）
    };
  },

  getAllContracts() {
    return Object.values(FUTURES_CONTRACTS);
  },

  getContractsByCategory() {
    const groups = {};
    Object.values(FUTURES_CONTRACTS).forEach(c => {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    });
    return groups;
  },

  /** 搜尋合約（支援指數期 + 個股期 + 自訂） */
  searchContracts(keyword, limit = 10) {
    if (!keyword) return this.getAllContracts().slice(0, limit);
    const kw = String(keyword).trim().toUpperCase();
    if (!kw) return this.getAllContracts().slice(0, limit);

    const results = [];

    // 1️⃣ 內建合約模糊比對
    Object.values(FUTURES_CONTRACTS).forEach(c => {
      const symU = c.symbol.toUpperCase();
      const nameU = c.name.toUpperCase();
      if (symU === kw) results.unshift(c);              // 完全相符放最前
      else if (symU.startsWith(kw) || nameU.includes(kw) || c.name.includes(kw)) {
        results.push(c);
      }
    });

    // 2️⃣ 自訂合約
    const settings = (typeof Store !== 'undefined' && Store.getSettings) ? Store.getSettings() : {};
    const customs = settings.customFutures || {};
    Object.keys(customs).forEach(sym => {
      const c = { ...customs[sym], symbol: sym, isCustom: true };
      const symU = sym.toUpperCase();
      const nameU = (c.name || '').toUpperCase();
      if (symU.includes(kw) || nameU.includes(kw)) results.push(c);
    });

    // 3️⃣ 個股期（從 StockDB 找）
    if (typeof StockDB !== 'undefined' && StockDB.stocks) {
      const raw = StockDB.stocks;
      const matched = [];
      const iter = Array.isArray(raw) ? raw : Object.values(raw);
      for (const item of iter) {
        if (!item) continue;
        const code = String(item.symbol || item.code || item.id || '').trim();
        const name = String(item.name || '').trim();
        if (!/^\d{4}$/.test(code)) continue;
        if (code.startsWith(kw) || name.includes(kw) || name.toUpperCase().includes(kw)) {
          matched.push({ code, name });
          if (matched.length >= limit) break;
        }
      }
      matched.forEach(m => {
        const c = this._buildStockFuturesContract(m.code);
        if (c) results.push(c);
      });
    }

    return results.slice(0, limit);
  },

  calcContractValue(symbol, price, lots = 1) {
    const c = this.getContract(symbol);
    if (!c) return 0;
    return (Number(price) || 0) * c.multiplier * (Number(lots) || 1);
  },

  /** 計算所需保證金（個股期會依現價動態算） */
  calcRequiredMargin(symbol, lots = 1, marginType = 'initial', currentPrice = null) {
    const c = this.getContract(symbol);
    if (!c) return 0;

    // 個股期：用現價 × 乘數 × 級距%
    if (c.isStockFutures && currentPrice) {
      const tier = STOCK_FUTURES_MARGIN_TIERS.A;
      const cv = currentPrice * c.multiplier;
      const rate = marginType === 'maintenance' ? tier.maintenance : tier.initial;
      return Math.ceil(cv * rate) * (Number(lots) || 1);
    }

    const m = marginType === 'maintenance' ? c.maintenanceMargin
            : (marginType === 'settlement' ? c.settlementMargin : c.initialMargin);
    return m * (Number(lots) || 1);
  },

  calcFee(symbol, lots = 1, contractValue = 0) {
    const c = this.getContract(symbol);
    if (!c) return { fee: 0, tax: 0, total: 0 };
    const fee = c.feePerLot * (Number(lots) || 1) * 2;
    const tax = Math.round(contractValue * c.taxRate * 2);
    return { fee, tax, total: fee + tax };
  },

  calcPnLPerPoint(symbol, lots = 1) {
    const c = this.getContract(symbol);
    if (!c) return 0;
    return c.multiplier * (Number(lots) || 1);
  },

  calcLiquidationPoints(symbol, lots = 1, currentPrice = null) {
    const c = this.getContract(symbol);
    if (!c) return 0;
    let buf;
    if (c.isStockFutures && currentPrice) {
      const initM = this.calcRequiredMargin(symbol, 1, 'initial', currentPrice);
      const maintM = this.calcRequiredMargin(symbol, 1, 'maintenance', currentPrice);
      buf = initM - maintM;
    } else {
      buf = c.initialMargin - c.maintenanceMargin;
    }
    return buf / c.multiplier;
  }
};

window.FUTURES_CONTRACTS = FUTURES_CONTRACTS;
window.FUTURES_CATEGORY_LABELS = FUTURES_CATEGORY_LABELS;
window.STOCK_FUTURES_MARGIN_TIERS = STOCK_FUTURES_MARGIN_TIERS;
window.FuturesHelper = FuturesHelper;
console.log('[config-futures.js] ✅ 期貨合約規格 v2 已載入', Object.keys(FUTURES_CONTRACTS).length, '檔（內建）+ 個股期動態');

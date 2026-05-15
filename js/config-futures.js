/* ============================================================
 * 📊 期貨合約規格資料庫 v3
 * - 內建指數期、類股期、海外期
 * - 內建熱門個股期（含期貨代號 ↔ 股票代號對應）
 * - 支援使用者自訂合約
 * ============================================================ */
'use strict';

// ============================================================
// 1️⃣ 指數 / 類股 / 海外期貨
// ============================================================
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
  G2F: { symbol: 'G2F', name: '富櫃200期', fullName: '富櫃200期貨',
    multiplier: 50, initialMargin: 30000, maintenanceMargin: 23000, settlementMargin: 30000,
    tickSize: 0.05, tickValue: 2.5, feePerLot: 30, taxRate: 0.00002,
    category: 'sector_tw', exchange: 'TAIFEX' },
  SOF: { symbol: 'SOF', name: '半導體期', fullName: '半導體30期貨',
    multiplier: 50, initialMargin: 50000, maintenanceMargin: 38500, settlementMargin: 50000,
    tickSize: 1, tickValue: 50, feePerLot: 50, taxRate: 0.00002,
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
    category: 'index_global', exchange: 'TAIFEX' },
  UFF: { symbol: 'UFF', name: '美國費城半導體', fullName: '美國費城半導體期貨',
    multiplier: 50, initialMargin: 60000, maintenanceMargin: 46000, settlementMargin: 60000,
    tickSize: 0.25, tickValue: 12.5, feePerLot: 100, taxRate: 0.00002,
    category: 'index_global', exchange: 'TAIFEX' },

  // ==================== 商品期貨 ====================
  GDF: { symbol: 'GDF', name: '黃金期', fullName: '黃金期貨',
    multiplier: 100, initialMargin: 90000, maintenanceMargin: 69000, settlementMargin: 90000,
    tickSize: 0.1, tickValue: 10, feePerLot: 80, taxRate: 0.00002,
    category: 'commodity', exchange: 'TAIFEX' },
  MGF: { symbol: 'MGF', name: '微型黃金期', fullName: '微型黃金期貨',
    multiplier: 10, initialMargin: 9000, maintenanceMargin: 6900, settlementMargin: 9000,
    tickSize: 0.1, tickValue: 1, feePerLot: 30, taxRate: 0.00002,
    category: 'commodity', exchange: 'TAIFEX' }
};

// ============================================================
// 2️⃣ 個股期貨資料庫（期貨代號 ↔ 標的股票）
//    資料來源：台灣期交所
//    乘數預設 2,000 股；小型個股期 100 股（代號末為「F」）
// ============================================================
const STOCK_FUTURES_LIB = [
  // 半導體
  { code: 'CDF', stock: '2330', stockName: '台積電',  multiplier: 2000 },
  { code: 'NEF', stock: '2330', stockName: '台積電',  multiplier: 100, isSmall: true },
  { code: 'DHF', stock: '2454', stockName: '聯發科',  multiplier: 2000 },
  { code: 'NJF', stock: '2454', stockName: '聯發科',  multiplier: 100, isSmall: true },
  { code: 'IUF', stock: '3008', stockName: '大立光',  multiplier: 2000 },
  { code: 'IIF', stock: '3034', stockName: '聯詠',    multiplier: 2000 },
  { code: 'NYF', stock: '3037', stockName: '欣興',    multiplier: 2000 },
  { code: 'JSF', stock: '3711', stockName: '日月光投控', multiplier: 2000 },
  { code: 'IPF', stock: '6505', stockName: '台塑化',  multiplier: 2000 },
  { code: 'GTF', stock: '5347', stockName: '世界',    multiplier: 2000 },
  { code: 'GIF', stock: '6488', stockName: '環球晶',  multiplier: 2000 },
  { code: 'IXF', stock: '8046', stockName: '南電',    multiplier: 2000 },
  { code: 'JLF', stock: '3661', stockName: '世芯-KY', multiplier: 2000 },
  { code: 'JNF', stock: '3231', stockName: '緯創',    multiplier: 2000 },
  { code: 'JCF', stock: '6669', stockName: '緯穎',    multiplier: 2000 },
  { code: 'GLF', stock: '4961', stockName: '天鈺',    multiplier: 2000 },
  { code: 'KSF', stock: '6531', stockName: '愛普',    multiplier: 2000 },
  { code: 'IGF', stock: '5269', stockName: '祥碩',    multiplier: 2000 },
  { code: 'KCF', stock: '6770', stockName: '力積電',  multiplier: 2000 },
  { code: 'IZF', stock: '3443', stockName: '創意',    multiplier: 2000 },
  { code: 'NIF', stock: '4966', stockName: '譜瑞-KY', multiplier: 2000 },
  { code: 'IHF', stock: '6271', stockName: '同欣電',  multiplier: 2000 },
  { code: 'IRF', stock: '5871', stockName: '中租-KY', multiplier: 2000 },

  // 電子代工 / EMS
  { code: 'CEF', stock: '2317', stockName: '鴻海',    multiplier: 2000 },
  { code: 'NDF', stock: '2317', stockName: '鴻海',    multiplier: 100, isSmall: true },
  { code: 'CMF', stock: '2382', stockName: '廣達',    multiplier: 2000 },
  { code: 'CSF', stock: '2356', stockName: '英業達',  multiplier: 2000 },
  { code: 'GHF', stock: '3017', stockName: '奇鋐',    multiplier: 2000 },
  { code: 'JKF', stock: '3653', stockName: '健策',    multiplier: 2000 },
  { code: 'KAF', stock: '6438', stockName: '迅得',    multiplier: 2000 },

  // 網通 / 伺服器
  { code: 'JIF', stock: '6443', stockName: '元晶',    multiplier: 2000 },
  { code: 'JOF', stock: '4938', stockName: '和碩',    multiplier: 2000 },

  // 金融
  { code: 'CFF', stock: '2881', stockName: '富邦金',  multiplier: 2000 },
  { code: 'CHF', stock: '2882', stockName: '國泰金',  multiplier: 2000 },
  { code: 'CKF', stock: '2891', stockName: '中信金',  multiplier: 2000 },
  { code: 'IBF', stock: '2884', stockName: '玉山金',  multiplier: 2000 },
  { code: 'IDF', stock: '2885', stockName: '元大金',  multiplier: 2000 },
  { code: 'CTF', stock: '2886', stockName: '兆豐金',  multiplier: 2000 },
  { code: 'CUF', stock: '2887', stockName: '台新金',  multiplier: 2000 },
  { code: 'CWF', stock: '2890', stockName: '永豐金',  multiplier: 2000 },
  { code: 'IAF', stock: '2880', stockName: '華南金',  multiplier: 2000 },
  { code: 'CGF', stock: '2883', stockName: '開發金',  multiplier: 2000 },
  { code: 'CIF', stock: '2888', stockName: '新光金',  multiplier: 2000 },
  { code: 'CYF', stock: '2892', stockName: '第一金',  multiplier: 2000 },

  // 傳產 / 鋼鐵 / 塑化
  { code: 'CAF', stock: '1301', stockName: '台塑',    multiplier: 2000 },
  { code: 'CBF', stock: '1303', stockName: '南亞',    multiplier: 2000 },
  { code: 'CCF', stock: '1326', stockName: '台化',    multiplier: 2000 },
  { code: 'CXF', stock: '2002', stockName: '中鋼',    multiplier: 2000 },
  { code: 'CJF', stock: '1101', stockName: '台泥',    multiplier: 2000 },
  { code: 'CLF', stock: '1102', stockName: '亞泥',    multiplier: 2000 },

  // 電信 / 食品
  { code: 'CRF', stock: '2412', stockName: '中華電',  multiplier: 2000 },
  { code: 'CPF', stock: '3045', stockName: '台灣大',  multiplier: 2000 },
  { code: 'CQF', stock: '4904', stockName: '遠傳',    multiplier: 2000 },
  { code: 'CDF2', stock: '1216', stockName: '統一',   multiplier: 2000 },

  // 航運
  { code: 'IFF', stock: '2603', stockName: '長榮',    multiplier: 2000 },
  { code: 'IEF', stock: '2609', stockName: '陽明',    multiplier: 2000 },
  { code: 'IJF', stock: '2615', stockName: '萬海',    multiplier: 2000 },

  // 生技 / 製藥
  { code: 'IOF', stock: '6446', stockName: '藥華藥',  multiplier: 2000 },

  // ETF 期貨
  { code: 'NQF', stock: '0050', stockName: '元大台灣50', multiplier: 1000 },
  { code: 'NHF', stock: '00878', stockName: '國泰永續高股息', multiplier: 1000 },

  // 其他熱門
  { code: 'IVF', stock: '2308', stockName: '台達電',  multiplier: 2000 },
  { code: 'CNF', stock: '2303', stockName: '聯電',    multiplier: 2000 },
  { code: 'GMF', stock: '2379', stockName: '瑞昱',    multiplier: 2000 },
  { code: 'NFF', stock: '2376', stockName: '技嘉',    multiplier: 2000 },
  { code: 'NGF', stock: '3006', stockName: '晶豪科',  multiplier: 2000 },
  { code: 'JEF', stock: '2345', stockName: '智邦',    multiplier: 2000 },
  { code: 'KFF', stock: '6857', stockName: '驊訊',    multiplier: 2000 }
];

// ============================================================
// 3️⃣ 分類標籤
// ============================================================
const FUTURES_CATEGORY_LABELS = {
  index_tw: '🇹🇼 台股指數',
  sector_tw: '🏢 類股期貨',
  index_global: '🌍 海外指數',
  commodity: '🛢 商品期貨',
  stock_tw: '📈 個股期貨',
  custom: '⚙️ 自訂商品'
};

// ============================================================
// 4️⃣ 個股期保證金級距（占契約價值百分比）
// ============================================================
const STOCK_FUTURES_MARGIN_TIERS = {
  A: { initial: 0.135, maintenance: 0.1035 },
  B: { initial: 0.1665, maintenance: 0.1278 },
  C: { initial: 0.27, maintenance: 0.2070 }
};

// ============================================================
// 5️⃣ FuturesHelper：對外介面
// ============================================================
const FuturesHelper = {

  /** 從 PriceFetcher 取得快取現價（相容多種快取結構） */
  _getCachedPrice(stockCode) {
    if (typeof PriceFetcher === 'undefined' || !stockCode) return null;
    const cache = PriceFetcher._cache;
    if (!cache) return null;

    const tryKeys = [`TW:${stockCode}`, stockCode, `tw:${stockCode}`];

    for (const key of tryKeys) {
      let v = null;
      if (typeof cache.get === 'function') {
        try { v = cache.get(key); } catch (e) {}
      } else if (typeof cache === 'object') {
        v = cache[key];
      }
      if (v && typeof v === 'object' && v.price) return Number(v.price);
      if (typeof v === 'number') return v;
    }

    // 也試試從 Store 取得當前持股價
    if (typeof Store !== 'undefined' && Store.getStocks) {
      const stocks = Store.getStocks() || [];
      const found = stocks.find(s => s.symbol === stockCode);
      if (found && found.currentPrice) return Number(found.currentPrice);
    }

    return null;
  },

  /** 由個股期 lib 條目建立合約規格 */
  _buildStockFuturesContract(libItem) {
    if (!libItem) return null;

    const cachedPrice = this._getCachedPrice(libItem.stock) || 100;
    const contractValue = cachedPrice * libItem.multiplier;
    const tier = STOCK_FUTURES_MARGIN_TIERS.A;

    return {
      symbol: libItem.code,
      name: `${libItem.stockName}${libItem.isSmall ? '小' : ''}期`,
      fullName: `${libItem.stockName}股票期貨${libItem.isSmall ? '（小型）' : ''}`,
      multiplier: libItem.multiplier,
      initialMargin: Math.ceil(contractValue * tier.initial),
      maintenanceMargin: Math.ceil(contractValue * tier.maintenance),
      settlementMargin: Math.ceil(contractValue * tier.initial),
      tickSize: 0.01,
      tickValue: 0.01 * libItem.multiplier,
      feePerLot: libItem.isSmall ? 15 : 30,
      taxRate: 0.00002,
      category: 'stock_tw',
      exchange: 'TAIFEX',
      isStockFutures: true,
      isSmall: !!libItem.isSmall,
      underlyingSymbol: libItem.stock,
      underlyingName: libItem.stockName,
      _isDynamic: true
    };
  },

  /** 取得合約規格 */
  getContract(symbol) {
    if (!symbol) return null;
    const sym = String(symbol).trim().toUpperCase();

    // 1️⃣ 內建指數/類股
    if (FUTURES_CONTRACTS[sym]) return FUTURES_CONTRACTS[sym];

    // 2️⃣ 個股期 lib
    const libItem = STOCK_FUTURES_LIB.find(x => x.code.toUpperCase() === sym);
    if (libItem) return this._buildStockFuturesContract(libItem);

    // 3️⃣ 使用者自訂
    const settings = (typeof Store !== 'undefined' && Store.getSettings) ? Store.getSettings() : {};
    const customs = settings.customFutures || {};
    if (customs[sym]) return { ...customs[sym], symbol: sym, isCustom: true };

    return null;
  },

  /** 取得所有合約 */
  getAllContracts() {
    const list = [...Object.values(FUTURES_CONTRACTS)];
    STOCK_FUTURES_LIB.forEach(item => {
      const c = this._buildStockFuturesContract(item);
      if (c) list.push(c);
    });
    return list;
  },

  getContractsByCategory() {
    const groups = {};
    this.getAllContracts().forEach(c => {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    });
    return groups;
  },

  /** 智慧搜尋：支援期貨代號、股票代號、股票名稱、商品名稱 */
  searchContracts(keyword, limit = 12) {
    const all = this.getAllContracts();
    if (!keyword) {
      // 沒輸入：回傳常見熱門
      const popular = ['TXF', 'MXF', 'TMF', 'CDF', 'CEF', 'DHF', 'CFF', 'CHF', 'EXF', 'FXF'];
      const popList = popular.map(s => this.getContract(s)).filter(Boolean);
      return popList.slice(0, limit);
    }

    const kw = String(keyword).trim().toUpperCase();
    if (!kw) return all.slice(0, limit);

    const exact = [];
    const startsWith = [];
    const includes = [];

    for (const c of all) {
      const symU = (c.symbol || '').toUpperCase();
      const nameU = (c.name || '').toUpperCase();
      const fullU = (c.fullName || '').toUpperCase();
      const undSym = (c.underlyingSymbol || '').toUpperCase();
      const undName = (c.underlyingName || '').toUpperCase();
      const name = c.name || '';
      const fullName = c.fullName || '';
      const undNameRaw = c.underlyingName || '';

      // 完全相符
      if (symU === kw || undSym === kw) {
        exact.push(c);
      }
      // 前綴相符
      else if (symU.startsWith(kw) || undSym.startsWith(kw) ||
               nameU.startsWith(kw) || name.startsWith(keyword) ||
               undName.startsWith(kw) || undNameRaw.startsWith(keyword)) {
        startsWith.push(c);
      }
      // 包含
      else if (symU.includes(kw) || undSym.includes(kw) ||
               nameU.includes(kw) || name.includes(keyword) ||
               fullU.includes(kw) || fullName.includes(keyword) ||
               undName.includes(kw) || undNameRaw.includes(keyword)) {
        includes.push(c);
      }

      if (exact.length + startsWith.length + includes.length >= limit * 3) break;
    }

    // 加入自訂合約
    const settings = (typeof Store !== 'undefined' && Store.getSettings) ? Store.getSettings() : {};
    const customs = settings.customFutures || {};
    Object.keys(customs).forEach(sym => {
      const c = { ...customs[sym], symbol: sym, isCustom: true };
      const symU = sym.toUpperCase();
      const nameU = (c.name || '').toUpperCase();
      if (symU.includes(kw) || nameU.includes(kw)) includes.push(c);
    });

    return [...exact, ...startsWith, ...includes].slice(0, limit);
  },

  calcContractValue(symbol, price, lots = 1) {
    const c = this.getContract(symbol);
    if (!c) return 0;
    return (Number(price) || 0) * c.multiplier * (Number(lots) || 1);
  },

  calcRequiredMargin(symbol, lots = 1, marginType = 'initial', currentPrice = null) {
    const c = this.getContract(symbol);
    if (!c) return 0;

    if ((c.isStockFutures || c._isDynamic) && currentPrice) {
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
    if ((c.isStockFutures || c._isDynamic) && currentPrice) {
      const initM = this.calcRequiredMargin(symbol, 1, 'initial', currentPrice);
      const maintM = this.calcRequiredMargin(symbol, 1, 'maintenance', currentPrice);
      buf = initM - maintM;
    } else {
      buf = c.initialMargin - c.maintenanceMargin;
    }
    return c.multiplier > 0 ? buf / c.multiplier : 0;
  }
};

window.FUTURES_CONTRACTS = FUTURES_CONTRACTS;
window.STOCK_FUTURES_LIB = STOCK_FUTURES_LIB;
window.FUTURES_CATEGORY_LABELS = FUTURES_CATEGORY_LABELS;
window.STOCK_FUTURES_MARGIN_TIERS = STOCK_FUTURES_MARGIN_TIERS;
window.FuturesHelper = FuturesHelper;
console.log(
  '[config-futures.js] ✅ 期貨合約 v3 已載入：',
  Object.keys(FUTURES_CONTRACTS).length, '檔指數/類股 +',
  STOCK_FUTURES_LIB.length, '檔個股期'
);

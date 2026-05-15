/* ============================================================
 * 📊 期貨合約規格資料庫
 * ============================================================ */
'use strict';

const FUTURES_CONTRACTS = {
  // ==================== 台指類 ====================
  TXF: {
    symbol: 'TXF',
    name: '台指期',
    fullName: '臺股期貨',
    multiplier: 200,           // 元/點
    initialMargin: 184000,     // 原始保證金
    maintenanceMargin: 142000, // 維持保證金
    settlementMargin: 184000,  // 結算保證金
    tickSize: 1,               // 跳動點
    tickValue: 200,            // 跳動值（元）
    feePerLot: 50,             // 單邊手續費（每口）
    taxRate: 0.00002,          // 期交稅 0.002%
    category: 'index_tw',
    exchange: 'TAIFEX'
  },
  MXF: {
    symbol: 'MXF',
    name: '小台指',
    fullName: '小型臺指期貨',
    multiplier: 50,
    initialMargin: 46000,
    maintenanceMargin: 35500,
    settlementMargin: 46000,
    tickSize: 1,
    tickValue: 50,
    feePerLot: 30,
    taxRate: 0.00002,
    category: 'index_tw',
    exchange: 'TAIFEX'
  },
  TMF: {
    symbol: 'TMF',
    name: '微台指',
    fullName: '微型臺指期貨',
    multiplier: 10,
    initialMargin: 9200,
    maintenanceMargin: 7100,
    settlementMargin: 9200,
    tickSize: 1,
    tickValue: 10,
    feePerLot: 15,
    taxRate: 0.00002,
    category: 'index_tw',
    exchange: 'TAIFEX'
  },

  // ==================== 類股期貨 ====================
  EXF: {
    symbol: 'EXF',
    name: '電子期',
    fullName: '電子類股期貨',
    multiplier: 4000,
    initialMargin: 100000,
    maintenanceMargin: 77000,
    settlementMargin: 100000,
    tickSize: 0.05,
    tickValue: 200,
    feePerLot: 50,
    taxRate: 0.00002,
    category: 'sector_tw',
    exchange: 'TAIFEX'
  },
  FXF: {
    symbol: 'FXF',
    name: '金融期',
    fullName: '金融保險類股期貨',
    multiplier: 1000,
    initialMargin: 60000,
    maintenanceMargin: 46000,
    settlementMargin: 60000,
    tickSize: 0.2,
    tickValue: 200,
    feePerLot: 50,
    taxRate: 0.00002,
    category: 'sector_tw',
    exchange: 'TAIFEX'
  },

  // ==================== 海外指數期貨 ====================
  UDF: {
    symbol: 'UDF',
    name: '美國道瓊',
    fullName: '美國道瓊期貨',
    multiplier: 20,
    initialMargin: 50000,
    maintenanceMargin: 38500,
    settlementMargin: 50000,
    tickSize: 1,
    tickValue: 20,
    feePerLot: 100,
    taxRate: 0.00002,
    category: 'index_global',
    exchange: 'TAIFEX'
  },
  UNF: {
    symbol: 'UNF',
    name: '美國那斯達克100',
    fullName: '美國那斯達克100期貨',
    multiplier: 50,
    initialMargin: 50000,
    maintenanceMargin: 38500,
    settlementMargin: 50000,
    tickSize: 1,
    tickValue: 50,
    feePerLot: 100,
    taxRate: 0.00002,
    category: 'index_global',
    exchange: 'TAIFEX'
  },
  SPF: {
    symbol: 'SPF',
    name: '美國標普500',
    fullName: '美國標普500期貨',
    multiplier: 50,
    initialMargin: 60000,
    maintenanceMargin: 46000,
    settlementMargin: 60000,
    tickSize: 0.25,
    tickValue: 12.5,
    feePerLot: 100,
    taxRate: 0.00002,
    category: 'index_global',
    exchange: 'TAIFEX'
  }
};

// 分類標籤
const FUTURES_CATEGORY_LABELS = {
  index_tw: '🇹🇼 台股指數',
  sector_tw: '🏢 類股期貨',
  index_global: '🌍 海外指數',
  commodity: '🛢 商品期貨',
  forex: '💱 外匯期貨'
};

// 工具函式
const FuturesHelper = {
  /** 取得合約規格 */
  getContract(symbol) {
    if (!symbol) return null;
    return FUTURES_CONTRACTS[String(symbol).trim().toUpperCase()] || null;
  },

  /** 取得所有合約（依分類排序） */
  getAllContracts() {
    return Object.values(FUTURES_CONTRACTS);
  },

  /** 依分類取得合約 */
  getContractsByCategory() {
    const groups = {};
    Object.values(FUTURES_CONTRACTS).forEach(c => {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    });
    return groups;
  },

  /** 計算契約價值 */
  calcContractValue(symbol, price, lots = 1) {
    const c = this.getContract(symbol);
    if (!c) return 0;
    return (Number(price) || 0) * c.multiplier * (Number(lots) || 1);
  },

  /** 計算所需保證金 */
  calcRequiredMargin(symbol, lots = 1, marginType = 'initial') {
    const c = this.getContract(symbol);
    if (!c) return 0;
    const m = marginType === 'maintenance'
      ? c.maintenanceMargin
      : (marginType === 'settlement' ? c.settlementMargin : c.initialMargin);
    return m * (Number(lots) || 1);
  },

  /** 計算手續費（雙邊）+ 期交稅 */
  calcFee(symbol, lots = 1, contractValue = 0) {
    const c = this.getContract(symbol);
    if (!c) return { fee: 0, tax: 0, total: 0 };
    const fee = c.feePerLot * (Number(lots) || 1) * 2;       // 開倉+平倉
    const tax = Math.round(contractValue * c.taxRate * 2);   // 雙邊期交稅
    return { fee, tax, total: fee + tax };
  },

  /** 計算單點 PnL */
  calcPnLPerPoint(symbol, lots = 1) {
    const c = this.getContract(symbol);
    if (!c) return 0;
    return c.multiplier * (Number(lots) || 1);
  },

  /** 估算強平點數（從建倉價往不利方向） */
  calcLiquidationPoints(symbol, lots = 1) {
    const c = this.getContract(symbol);
    if (!c) return 0;
    const buffer = c.initialMargin - c.maintenanceMargin;
    return Math.floor(buffer / c.multiplier);
  }
};

window.FUTURES_CONTRACTS = FUTURES_CONTRACTS;
window.FUTURES_CATEGORY_LABELS = FUTURES_CATEGORY_LABELS;
window.FuturesHelper = FuturesHelper;
console.log('[config-futures.js] ✅ 期貨合約規格已載入', Object.keys(FUTURES_CONTRACTS).length, '檔');

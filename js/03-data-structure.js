/* ============================================================
 * 📦 03-data-structure.js - 資料結構工廠 + 遷移工具
 * ============================================================
 * 用途：
 *   1. DataStructure：建立各種資料物件的工廠方法
 *   2. Migration：v1 → v2 自動升級
 * 依賴：CONFIG, Utils
 * 對外：DataStructure, Migration（全域變數）
 * ============================================================ */
'use strict';

// ============================================================
// 📦 資料結構工具 - 預設資料
// ============================================================
const DataStructure = {
  // 預設主資料
  getDefaultPortfolio() {
    return {
      version: CONFIG.VERSION,
      lastUpdate: new Date().toISOString(),
      stocks: [],
      margin: [],
      futures: [],
      watchlist: [],
      settings: {
        autoFetchPrice: true,
        fetchInterval: 60000,
        onlyMarketHours: true,
        defaultMarginRate: 0.6,
        defaultInterestRate: 0.06,
        theme: 'dark',
        currency: 'TWD',
        language: 'zh-TW'
      }
    };
  },

  // 預設歷史資料
  getDefaultHistory() {
    return {
      version: CONFIG.VERSION,
      snapshots: [],
      transactions: []
    };
  },

  // 建立空 stock 物件
  createStock(symbol, name, market = 'TW') {
    return {
      id: Utils.uid('stk'),
      symbol: symbol,
      name: name,
      market: market,
      industry: '',
      lots: [],
      currentPrice: 0,
      lastPriceUpdate: null,
      realizedPnl: 0,
      tRollingProfit: 0
    };
  },

  // 建立 lot
  createStockLot(shares, cost, date = null, fee = 0, note = '') {
    return {
      id: Utils.uid('lot'),
      shares: Number(shares) || 0,
      cost: Number(cost) || 0,
      date: date || Utils.today(),
      fee: Number(fee) || 0,
      note: note || ''
    };
  },

  // 建立融資 lot
  createMarginLot(shares, cost, marginRate, interestRate, date, fee, note) {
    const total = shares * cost;
    const ownFund = total * (1 - marginRate);
    const marginLoan = total * marginRate;
    return {
      id: Utils.uid('lot'),
      shares: Number(shares) || 0,
      cost: Number(cost) || 0,
      date: date || Utils.today(),
      marginRate: Number(marginRate) || 0.6,
      ownFund: ownFund,
      marginLoan: marginLoan,
      interestRate: Number(interestRate) || 0.06,
      fee: Number(fee) || 0,
      note: note || ''
    };
  },

  // 建立期貨 lot
  createFuturesLot(direction, contracts, entryPrice, margin, contractSize, date, fee, note) {
    return {
      id: Utils.uid('lot'),
      direction: direction || 'long',
      contracts: Number(contracts) || 0,
      entryPrice: Number(entryPrice) || 0,
      margin: Number(margin) || 0,
      contractSize: Number(contractSize) || 200,
      date: date || Utils.today(),
      fee: Number(fee) || 0,
      note: note || ''
    };
  },

  // 建立交易紀錄
  createTransaction(type, category, symbol, name, shares, price, options = {}) {
    return {
      id: Utils.uid('tx'),
      timestamp: new Date().toISOString(),
      type: type,
      category: category,
      symbol: symbol,
      name: name || '',
      shares: Number(shares) || 0,
      price: Number(price) || 0,
      amount: (Number(shares) || 0) * (Number(price) || 0),
      fee: Number(options.fee) || 0,
      tax: Number(options.tax) || 0,
      realizedPnl: Number(options.realizedPnl) || 0,
      relatedLotIds: options.relatedLotIds || [],
      note: options.note || ''
    };
  },

  // 建立每日快照
  createSnapshot(stats) {
    return {
      date: Utils.today(),
      timestamp: new Date().toISOString(),
      totalAssets: stats.totalAssets || 0,
      totalCost: stats.totalCost || 0,
      totalPnl: stats.totalPnl || 0,
      pnlPct: stats.pnlPct || 0,
      breakdown: {
        stocks: stats.breakdown?.stocks || 0,
        margin: stats.breakdown?.margin || 0,
        futures: stats.breakdown?.futures || 0,
        cash: stats.breakdown?.cash || 0
      },
      positionsCount: stats.positionsCount || 0,
      realizedPnlAccum: stats.realizedPnlAccum || 0
    };
  }
};

// ============================================================
// 🔄 v1 → v2 遷移工具
// ============================================================
const Migration = {
  // 檢查是否為 v1 格式
  isV1(data) {
    if (!data) return false;
    if (data.version === '2.0.0') return false;
    // v1 通常沒有 version 或為 1.x
    if (!data.version || data.version.startsWith('1.')) return true;
    // 或者 stocks 結構是舊的（沒有 lots）
    if (Array.isArray(data.stocks) && data.stocks.length > 0) {
      const first = data.stocks[0];
      if (first && !Array.isArray(first.lots)) return true;
    }
    return false;
  },

  // 執行遷移
  migrate(oldData) {
    console.log('[Migration] 開始 v1 → v2 遷移...');
    const newData = DataStructure.getDefaultPortfolio();
    
    try {
      // 遷移現股
      if (Array.isArray(oldData.stocks)) {
        newData.stocks = oldData.stocks.map(s => this.migrateStock(s));
      }
      
      // 遷移期貨
      if (Array.isArray(oldData.futures)) {
        newData.futures = oldData.futures.map(f => this.migrateFutures(f));
      }
      
      // 遷移觀察清單
      if (Array.isArray(oldData.watchlist)) {
        newData.watchlist = oldData.watchlist.map(w => ({
          id: w.id || Utils.uid('wl'),
          symbol: w.symbol || '',
          name: w.name || '',
          market: w.market || 'TW',
          currentPrice: Number(w.currentPrice) || 0,
          addedDate: w.addedDate || new Date().toISOString(),
          note: w.note || ''
        }));
      }
      
      // 遷移設定
      if (oldData.settings) {
        Object.assign(newData.settings, oldData.settings);
      }
      
      console.log('[Migration] ✅ 遷移完成');
      return newData;
    } catch (err) {
      console.error('[Migration] ❌ 遷移失敗:', err);
      throw new Error(`資料遷移失敗：${err.message}`);
    }
  },

  // 遷移單一現股
  migrateStock(old) {
    const stock = DataStructure.createStock(
      old.symbol || '',
      old.name || '',
      old.market || 'TW'
    );
    stock.industry = old.industry || '';
    stock.currentPrice = Number(old.currentPrice) || 0;
    stock.lastPriceUpdate = old.lastPriceUpdate || null;
    stock.realizedPnl = Number(old.realizedPnl) || 0;
    
    // 把舊的 shares + avgCost 轉成單一 lot
    if (old.shares && old.avgCost) {
      stock.lots.push(DataStructure.createStockLot(
        old.shares,
        old.avgCost,
        old.buyDate || old.date || Utils.today(),
        old.fee || 0,
        old.note || ''
      ));
    } else if (Array.isArray(old.lots)) {
      // 已經是新格式（部分升級）
      stock.lots = old.lots.map(l => ({
        id: l.id || Utils.uid('lot'),
        shares: Number(l.shares) || 0,
        cost: Number(l.cost) || 0,
        date: l.date || Utils.today(),
        fee: Number(l.fee) || 0,
        note: l.note || ''
      }));
    }
    
    return stock;
  },

  // 遷移單一期貨
  migrateFutures(old) {
    const fut = {
      id: old.id || Utils.uid('fut'),
      symbol: old.symbol || '',
      name: old.name || '',
      productType: old.productType || 'TXF',
      lots: [],
      currentPrice: Number(old.currentPrice) || 0,
      lastPriceUpdate: old.lastPriceUpdate || null,
      realizedPnl: Number(old.realizedPnl) || 0
    };
    
    // 舊格式單筆 → 一個 lot
    if (old.contracts !== undefined && old.entryPrice !== undefined) {
      fut.lots.push(DataStructure.createFuturesLot(
        old.direction || 'long',
        old.contracts,
        old.entryPrice,
        old.margin || 0,
        old.contractSize || 200,
        old.date || Utils.today(),
        old.fee || 0,
        old.note || ''
      ));
    } else if (Array.isArray(old.lots)) {
      fut.lots = old.lots;
    }
    
    return fut;
  }
};

// 全域曝露
window.DataStructure = DataStructure;
window.Migration = Migration;

console.log('[03-data-structure.js] ✅ DataStructure + Migration 已載入');

/* ============================================================
 * 03-data-structure.js — v3 資料結構 + 遷移
 * ============================================================ */
'use strict';

const DataStructure = {

  // ========== 建立空的 v3 結構 ==========
  createEmpty() {
    return {
      version: '3.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      // 📈 現股
      stocks: {
        holdings: {},     // { ticker: { lots: [], avgCost, trueAvgCost, currentPrice, ... } }
        trades: [],
        realizedPL: 0
      },

      // 💳 融資融券
      margin: {
        holdings: {},     // { ticker: { type:'long'|'short', lots, ... } }
        trades: [],
        realizedPL: 0,
        // 使用者設定（可覆蓋 CONFIG.MARGIN）
        settings: {
          marginRate: 0.4,
          shortRate: 0.9,
          interestRate: 0.0645,
          shortFeeRate: 0.0008,
          brokerName: '國泰證券'
        }
      },

      // 📊 期貨
      futures: {
        holdings: {},     // { contract: { product, type, lots, ... } }
        trades: [],
        realizedPL: 0
      },

      // 🔄 做 T 紀錄
      tTrades: [],

      // 📸 快照
      snapshots: []
    };
  },

  // ========== 建立空的 lot（FIFO 用） ==========
  createLot(date, shares, price, fee = 0) {
    return {
      id: this._uuid(),
      date: date,
      shares: shares,
      price: price,
      fee: fee,
      remaining: shares,    // 剩餘股數（FIFO 賣出時遞減）
      createdAt: new Date().toISOString()
    };
  },

  // ========== 建立空的 holding ==========
  createHolding(ticker) {
    return {
      ticker: ticker,
      lots: [],
      avgCost: 0,           // 加權平均成本
      trueAvgCost: 0,       // 做 T 後的真實成本 ⭐
      currentPrice: 0,      // 即時價
      priceUpdatedAt: null,
      totalRealizedPL: 0    // 此檔已實現損益
    };
  },

  // ========== 建立融資券 holding ==========
  createMarginHolding(ticker, type) {
    return {
      ticker: ticker,
      type: type,           // 'long' = 融資, 'short' = 融券
      lots: [],
      avgCost: 0,
      trueAvgCost: 0,
      currentPrice: 0,
      priceUpdatedAt: null,
      totalRealizedPL: 0,
      // 融資專用
      loanAmount: 0,        // 融資金額
      // 融券專用
      depositAmount: 0      // 保證金
    };
  },

  // ========== 建立期貨 holding ==========
  createFuturesHolding(contract, product, type) {
    return {
      contract: contract,         // 例如 "TXF202506"
      product: product,           // 例如 "TXF"
      type: type,                 // 'long' / 'short'
      lots: [],
      avgPrice: 0,
      currentPrice: 0,
      priceUpdatedAt: null,
      totalRealizedPL: 0,
      marginUsed: 0               // 使用保證金
    };
  },

  // ========== 主遷移入口 ==========
  migrate(data) {
    if (!data) {
      console.log('[Migration] 無資料，建立全新 v3 結構');
      return this.createEmpty();
    }

    const ver = data.version || '1.0.0';
    console.log(`[Migration] 開始 ${ver} → 3.0.0 遷移...`);

    let result = data;

    // v1 → v2
    if (ver.startsWith('1.')) {
      result = this._migrateV1toV2(result);
    }

    // v2 → v3
    if ((result.version || '').startsWith('2.')) {
      result = this._migrateV2toV3(result);
    }

    // 已是 v3 但補欄位
    if ((result.version || '').startsWith('3.')) {
      result = this._ensureV3Fields(result);
    }

    console.log('[Migration] ✅ 遷移完成');
    return result;
  },

  // ========== v1 → v2 ==========
  _migrateV1toV2(v1) {
    const v2 = {
      version: '2.0.0',
      portfolio: {
        holdings: {},
        trades: [],
        realizedPL: 0,
        snapshots: []
      }
    };

    if (Array.isArray(v1.trades)) v2.portfolio.trades = v1.trades;
    if (v1.holdings) v2.portfolio.holdings = v1.holdings;
    if (typeof v1.realizedPL === 'number') v2.portfolio.realizedPL = v1.realizedPL;
    if (Array.isArray(v1.snapshots)) v2.portfolio.snapshots = v1.snapshots;

    return v2;
  },

  // ========== v2 → v3 ==========
  _migrateV2toV3(v2) {
    console.log('[Migration] v2 → v3 開始（將現股拆出，新增融資券/期貨）');

    const v3 = this.createEmpty();
    const oldP = v2.portfolio || v2;

    // 現股遷移
    if (oldP.holdings) {
      Object.keys(oldP.holdings).forEach(ticker => {
        const old = oldP.holdings[ticker] || {};
        const h = this.createHolding(ticker);
        h.avgCost = old.avgCost || 0;
        h.trueAvgCost = old.avgCost || 0;
        h.currentPrice = old.currentPrice || old.avgCost || 0;
        // 用舊資料合成一個 lot（避免 FIFO 缺失）
        if ((old.shares || 0) > 0) {
          h.lots.push({
            id: this._uuid(),
            date: old.firstBuyDate || new Date().toISOString().slice(0, 10),
            shares: old.shares,
            price: old.avgCost || 0,
            fee: 0,
            remaining: old.shares,
            createdAt: new Date().toISOString(),
            note: '由 v2 遷移合併'
          });
        }
        v3.stocks.holdings[ticker] = h;
      });
    }

    if (Array.isArray(oldP.trades)) {
      v3.stocks.trades = oldP.trades.map(t => ({
        ...t,
        market: 'stocks'
      }));
    }
    if (typeof oldP.realizedPL === 'number') {
      v3.stocks.realizedPL = oldP.realizedPL;
    }
    if (Array.isArray(oldP.snapshots)) {
      v3.snapshots = oldP.snapshots;
    }

    return v3;
  },

  // ========== 確保 v3 欄位齊全（防止舊版 v3 缺欄位） ==========
  _ensureV3Fields(v3) {
    const empty = this.createEmpty();

    // 補頂層
    ['stocks', 'margin', 'futures'].forEach(market => {
      if (!v3[market]) v3[market] = empty[market];
      if (!v3[market].holdings) v3[market].holdings = {};
      if (!Array.isArray(v3[market].trades)) v3[market].trades = [];
      if (typeof v3[market].realizedPL !== 'number') v3[market].realizedPL = 0;
    });

    if (!v3.margin.settings) v3.margin.settings = empty.margin.settings;
    if (!Array.isArray(v3.tTrades)) v3.tTrades = [];
    if (!Array.isArray(v3.snapshots)) v3.snapshots = [];

    // 補每個 holding 的欄位
    ['stocks', 'margin', 'futures'].forEach(market => {
      Object.keys(v3[market].holdings).forEach(key => {
        const h = v3[market].holdings[key];
        if (!Array.isArray(h.lots)) h.lots = [];
        if (typeof h.avgCost !== 'number') h.avgCost = 0;
        if (typeof h.trueAvgCost !== 'number') h.trueAvgCost = h.avgCost;
        if (typeof h.currentPrice !== 'number') h.currentPrice = h.avgCost;
      });
    });

    v3.version = '3.0.0';
    v3.updatedAt = new Date().toISOString();
    return v3;
  },

  // ========== 工具：UUID ==========
  _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  // ========== 驗證 ==========
  validate(data) {
    if (!data || typeof data !== 'object') return false;
    if (!data.version) return false;
    if (!data.stocks || !data.margin || !data.futures) return false;
    return true;
  }
};

window.DataStructure = DataStructure;
console.log('[03-data-structure.js] ✅ DataStructure + Migration 已載入 (v3)');

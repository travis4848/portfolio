/* ============================================================
 * 📦 03-data-structure.js - v3 資料結構（陣列導向）
 * ============================================================
 * 對應 Store 架構：
 *   portfolio = {
 *     stocks: [],     // 現股
 *     margin: [],     // 融資融券
 *     futures: [],    // 期貨
 *     tTrades: [],    // 做 T 紀錄
 *     watchlist: [],
 *     settings: {}
 *   }
 *   history = {
 *     transactions: [],
 *     snapshots: []
 *   }
 * ============================================================ */
'use strict';

const DataStructure = {

  // ========== 預設 portfolio ==========
  getDefaultPortfolio() {
    return {
      version: '3.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      stocks: [],     // 現股 holdings 陣列
      margin: [],     // 融資/融券 holdings 陣列
      futures: [],    // 期貨 holdings 陣列
      tTrades: [],    // 做 T 紀錄
      watchlist: [],

      settings: {
        // ── 融資券（國泰預設）──
        marginRate: 0.4,
        shortRate: 0.9,
        interestRate: 0.0645,        // 國泰 6.45%
        shortFeeRate: 0.0008,
        brokerName: '國泰證券',

        // ── 手續費 ──
        brokerFeeRate: 0.001425,
        brokerFeeDiscount: 0.28,
        minFee: 20,
        taxRateStock: 0.003,
        taxRateETF: 0.001,

        // ── 報價自動更新 ──
        autoRefreshSec: 60,
        priceCacheSec: 30,

        // ── 做 T 自動辨識 ──
        tTradeAutoDetect: true,
        tTradeMaxDays: 5,
        tTradeReduceCost: true
      }
    };
  },

  // ========== 預設 history ==========
  getDefaultHistory() {
    return {
      version: '3.0.0',
      transactions: [],
      snapshots: []
    };
  },

  // ========== 建立現股 ==========
  createStock(symbol, name = '', market = 'TW') {
    return {
      id: this._uid('stk'),
      symbol: String(symbol).toUpperCase(),
      name: name,
      market: market,                // 'TW' | 'US' | 'HK'
      lots: [],                      // FIFO 用：[{id, date, shares, price, effectiveCost, fee, note}]
      currentPrice: 0,
      lastPriceUpdate: null,
      realizedPnl: 0,                // 此檔已實現損益
      trueAvgCost: 0,                // 做 T 後的真實成本（顯示用）⭐
      createdDate: new Date().toISOString()
    };
  },

  // ========== 建立融資/融券持股 ==========
  // type: 'long' = 融資, 'short' = 融券
  createMargin(symbol, name = '', type = 'long', market = 'TW') {
    const isLong = type === 'long';
    return {
      id: this._uid('mg'),
      symbol: String(symbol).toUpperCase(),
      name: name,
      type: type,
      market: market,
      lots: [],
      currentPrice: 0,
      lastPriceUpdate: null,
      realizedPnl: 0,
      trueAvgCost: 0,

      // ── 融資專用 ──
      loanAmount: 0,           // 累計融資借款
      
      // ── 融券專用 ──
      depositAmount: 0,        // 累計保證金
      shortFee: 0,             // 累計借券費
      
      // ── 共用 ──
      interestAccrued: 0,      // 累計利息（融資每天計算）
      lastInterestDate: null,  // 上次計息日（避免重複計算）
      
      createdDate: new Date().toISOString()
    };
  },


  // ========== 建立期貨倉位 ==========
  // product: 'TXF' | 'MXF' | 'TMF' | 'STF' | 'MTF'
  // direction: 'long' | 'short'
  createFutures(product, contract, name = '', direction = 'long', underlyingSymbol = '') {
    return {
      id: this._uid('fut'),
      product: product,                  // 商品代號
      contract: contract,                // 合約代號（如 TXF202506）
      name: name,
      direction: direction,
      underlyingSymbol: underlyingSymbol, // 個股期才用（標的股票代號）
      lots: [],                          // [{id, date, contracts, price, fee, ...}]
      currentPrice: 0,
      lastPriceUpdate: null,
      realizedPnl: 0,
      avgPrice: 0,                       // 加權平均進場價
      totalContracts: 0,                 // 持有口數（多正空負或都正？這裡都用正數，方向看 direction）
      marginUsed: 0,                     // 已使用保證金
      createdDate: new Date().toISOString()
    };
  },


  // ========== 建立 lot（FIFO 用）==========
  createLot(date, shares, price, opts = {}) {
    return {
      id: this._uid('lot'),
      date: date,
      shares: Number(shares),
      remaining: Number(shares),     // 剩餘股數（FIFO 賣出時遞減）
      price: Number(price),
      effectiveCost: Number(opts.effectiveCost ?? price),
      fee: Number(opts.fee || 0),
      note: opts.note || '',
      createdAt: new Date().toISOString()
    };
  },

  // ========== 別名：createStockLot（相容 calculator）==========
  // 用法：createStockLot(shares, price, date, fee, note)
  // 內部轉呼叫 createLot(date, shares, price, { fee, note, effectiveCost })
  createStockLot(shares, price, date, fee = 0, note = '') {
    return this.createLot(
      date || new Date().toISOString().slice(0, 10),
      shares,
      price,
      {
        fee: fee,
        note: note,
        effectiveCost: price  // calculator 傳進來的 price 已是 effectiveCost
      }
    );
  },

  // ========== 別名：createMarginLot ==========
  createMarginLot(shares, price, date, fee = 0, note = '') {
    const lot = this.createStockLot(shares, price, date, fee, note);
    lot.marginType = 'long';
    return lot;
  },

  // ========== 別名：createFutureLot ==========
  createFuturesLot(date, contracts, price, opts = {}) {
    return {
      id: this._uid('flot'),
      date: date,
      contracts: Number(contracts),       // 開倉口數
      remaining: Number(contracts),       // 剩餘口數（FIFO 平倉）
      price: Number(price),               // 進場價
      fee: Number(opts.fee || 0),
      tax: Number(opts.tax || 0),
      margin: Number(opts.margin || 0),   // 此筆佔用的保證金
      note: opts.note || '',
      createdAt: new Date().toISOString()
    };
  },


  // ========== 建立 transaction（歷史紀錄）==========
  createTransaction(action, market, symbol, name, shares, price, extra = {}) {
    return {
      id: this._uid('tx'),
      timestamp: new Date().toISOString(),
      action: action,                // 'BUY' / 'SELL'
      market: market,                // 'stock' / 'margin' / 'futures'
      symbol: symbol,
      name: name || '',
      shares: Number(shares),
      price: Number(price),
      total: Number(shares) * Number(price),
      fee: Number(extra.fee || 0),
      tax: Number(extra.tax || 0),
      realizedPnl: extra.realizedPnl,
      relatedLotIds: extra.relatedLotIds || [],
      note: extra.note || '',
      // v3 新增
      isTTrade: extra.isTTrade || false,        // 是否為做 T
      tTradeId: extra.tTradeId || null
    };
  },

  // ========== 建立做 T 紀錄 ==========
  createTTrade(symbol, name, market = 'stock') {
    return {
      id: this._uid('tt'),
      symbol: String(symbol).toUpperCase(),
      name: name || '',
      market: market,
      // 第一腳：賣出
      sellTxId: null,
      sellDate: null,
      sellPrice: 0,
      sellShares: 0,
      // 第二腳：買回
      buyTxId: null,
      buyDate: null,
      buyPrice: 0,
      buyShares: 0,
      // 結果
      realizedPnl: 0,                // 做 T 賺賠
      reduceCost: true,              // 是否要降低原始持股成本
      cancelled: false,              // 使用者手動取消標記
      autoDetected: true,            // 自動辨識 or 手動標記
      createdAt: new Date().toISOString()
    };
  },

  // ========== Migration 入口 ==========
  migrate(data) {
    if (!data) return this.getDefaultPortfolio();

    const ver = data.version || '1.0.0';
    console.log(`[Migration] 偵測到 ${ver} 格式`);

    // v3 → 補欄位
    if (ver.startsWith('3.')) {
      return this._ensureV3(data);
    }

    // v2 → v3
    if (ver.startsWith('2.')) {
      return this._migrateV2toV3(data);
    }

    // v1 → v3
    return this._migrateV1toV3(data);
  },

  // ========== v1 → v3 ==========
  _migrateV1toV3(v1) {
    console.log('[Migration] v1 → v3');
    const v3 = this.getDefaultPortfolio();
    // v1 通常是個 holdings 物件
    if (v1.holdings) {
      Object.keys(v1.holdings).forEach(symbol => {
        const old = v1.holdings[symbol];
        const stock = this.createStock(symbol, old.name || symbol);
        if (old.shares > 0) {
          stock.lots.push(this.createLot(
            old.firstBuyDate || new Date().toISOString().slice(0, 10),
            old.shares,
            old.avgCost || 0,
            { note: '由 v1 遷移' }
          ));
          stock.trueAvgCost = old.avgCost || 0;
          stock.currentPrice = old.currentPrice || old.avgCost || 0;
        }
        v3.stocks.push(stock);
      });
    }
    return v3;
  },

  // ========== v2 → v3 ==========
  _migrateV2toV3(v2) {
    console.log('[Migration] v2 → v3');
    const v3 = this.getDefaultPortfolio();
    const old = v2.portfolio || v2;

    // v2 的 holdings 是物件，要轉成陣列
    if (old.holdings && typeof old.holdings === 'object') {
      Object.keys(old.holdings).forEach(symbol => {
        const o = old.holdings[symbol] || {};
        const stock = this.createStock(symbol, o.name || symbol, o.market || 'TW');
        if ((o.shares || 0) > 0) {
          stock.lots.push(this.createLot(
            o.firstBuyDate || new Date().toISOString().slice(0, 10),
            o.shares,
            o.avgCost || 0,
            { note: '由 v2 遷移合併' }
          ));
        }
        stock.currentPrice = o.currentPrice || o.avgCost || 0;
        stock.realizedPnl = o.realizedPnl || 0;
        stock.trueAvgCost = o.avgCost || 0;
        v3.stocks.push(stock);
      });
    }

    // 如果 v2 已經是陣列（你之前可能就是這樣）
    if (Array.isArray(old.stocks)) {
      v3.stocks = old.stocks.map(s => ({
        ...this.createStock(s.symbol, s.name, s.market),
        ...s,
        // 確保有 lots
        lots: Array.isArray(s.lots) ? s.lots : []
      }));
    }
    if (Array.isArray(old.watchlist)) v3.watchlist = old.watchlist;
    if (old.settings) Object.assign(v3.settings, old.settings);

    return v3;
  },

  // ========== 確保 v3 欄位齊全 ==========
  _ensureV3(v3) {
    const def = this.getDefaultPortfolio();

    if (!Array.isArray(v3.stocks))   v3.stocks   = [];
    if (!Array.isArray(v3.margin))   v3.margin   = [];
    if (!Array.isArray(v3.futures))  v3.futures  = [];
    if (!Array.isArray(v3.tTrades))  v3.tTrades  = [];
    if (!Array.isArray(v3.watchlist)) v3.watchlist = [];

    // 補 settings
    if (!v3.settings) v3.settings = {};
    Object.keys(def.settings).forEach(k => {
      if (v3.settings[k] === undefined) v3.settings[k] = def.settings[k];
    });

    // 補每筆 stock 的欄位
    v3.stocks.forEach(s => {
      if (!Array.isArray(s.lots)) s.lots = [];
      if (typeof s.realizedPnl !== 'number') s.realizedPnl = 0;
      if (typeof s.currentPrice !== 'number') s.currentPrice = 0;
      if (typeof s.trueAvgCost !== 'number') s.trueAvgCost = 0;
    });

    v3.version = '3.0.0';
    v3.updatedAt = new Date().toISOString();
    return v3;
  },

  // ========== 工具 ==========
  _uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  },

  validate(data) {
    return data && typeof data === 'object' && data.version;
  }
};

// ========== Migration 物件（沿用舊命名以相容 09-store.js）==========
const Migration = {
  isV1(data) {
    if (!data) return false;
    const ver = data.version || '1.0.0';
    return ver.startsWith('1.') || ver.startsWith('2.');
  },
  migrate(data) {
    return DataStructure.migrate(data);
  }
};

window.DataStructure = DataStructure;
window.Migration = Migration;
console.log('[03-data-structure.js] ✅ DataStructure + Migration 已載入 (v3 陣列版)');

/* ============================================================
 * 🏪 09-store.js - 中央狀態管理（Single Source of Truth）
 * ============================================================
 * 用途：
 *   1. 管理 portfolio + history 的記憶體狀態
 *   2. 提供 dispatch(action) 統一變更入口
 *   3. 訂閱者模式：UI 自動響應狀態變化
 *   4. 自動寫入 localStorage（保險）
 *   5. 提供雲端同步觸發
 * 依賴：CONFIG, Utils, Storage, DataStructure, Stats, SnapshotManager,
 *       Calculator
 * 對外：Store（全域變數）
 * ============================================================ */
'use strict';

const Store = {
  // ---------- 內部狀態 ----------
  state: {
    portfolio: null,
    history: null,
    initialized: false,
    syncing: false,
    lastError: null
  },
  
  _subscribers: [],
  _syncTimer: null,
  
  // ============================================================
  // 🚀 初始化
  // ============================================================
  
  // 從本地 + 雲端載入
  async init({ tryCloud = true } = {}) {
    console.log('[Store] 初始化...');
    
    // 1. 先讀本地（快速顯示）
    let portfolio = Storage.loadLocal();
    let history = Storage.loadLocalHistory();
    
    // 2. 自動遷移
    if (portfolio && Migration.isV1(portfolio)) {
      console.log('[Store] 偵測到 v1 格式，執行遷移...');
      portfolio = Migration.migrate(portfolio);
      Storage.saveLocal(portfolio);
    }
    
    // 3. 預設值
    if (!portfolio) portfolio = DataStructure.getDefaultPortfolio();
    if (!history) history = DataStructure.getDefaultHistory();
    
    this.state.portfolio = portfolio;
    this.state.history = history;
    
    // 4. 嘗試從雲端載入（背景）
    if (tryCloud && Storage.getToken() && Storage.getGistId()) {
      try {
        await this.loadFromCloud();
      } catch (err) {
        console.warn('[Store] 雲端載入失敗（仍可離線使用）:', err.message);
        this.state.lastError = err.message;
      }
    }
    
    this.state.initialized = true;
    this._notify();
    console.log('[Store] ✅ 初始化完成');
    return this.state;
  },

  // 從雲端拉取
  async loadFromCloud() {
    this.state.syncing = true;
    this._notify();
    try {
      const { portfolio, history } = await Storage.loadFromGist();
      this.state.portfolio = portfolio;
      this.state.history = history;
      Storage.saveLocal(portfolio);
      Storage.saveLocalHistory(history);
      this.state.syncing = false;
      this.state.lastError = null;
      this._notify();
      console.log('[Store] ✅ 雲端載入完成');
      return true;
    } catch (err) {
      this.state.syncing = false;
      this.state.lastError = err.message;
      this._notify();
      throw err;
    }
  },

  // 推到雲端
  async saveToCloud() {
    this.state.syncing = true;
    this._notify();
    try {
      await Storage.saveToGist(this.state.portfolio, this.state.history);
      this.state.syncing = false;
      this.state.lastError = null;
      this._notify();
      console.log('[Store] ✅ 雲端同步完成');
      return true;
    } catch (err) {
      this.state.syncing = false;
      this.state.lastError = err.message;
      this._notify();
      throw err;
    }
  },

  // 防抖推送（避免短時間多次 PATCH Gist）
  scheduleCloudSync(delay = 3000) {
    if (this._syncTimer) clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => {
      this.saveToCloud().catch(err => {
        console.error('[Store] 排程同步失敗:', err);
      });
    }, delay);
  },

  // ============================================================
  // 📨 訂閱
  // ============================================================
  
  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this._subscribers.push(fn);
    return () => {
      const idx = this._subscribers.indexOf(fn);
      if (idx >= 0) this._subscribers.splice(idx, 1);
    };
  },

  _notify() {
    this._subscribers.forEach(fn => {
      try { fn(this.state); }
      catch (e) { console.error('[Store] subscriber 錯誤:', e); }
    });
  },

  // ============================================================
  // 📋 取得 Getter
  // ============================================================
  
  getPortfolio() { return this.state.portfolio; },
  getHistory() { return this.state.history; },
  getStocks() { return this.state.portfolio?.stocks || []; },
  getMargin() { return this.state.portfolio?.margin || []; },
  getFutures() { return this.state.portfolio?.futures || []; },
  getWatchlist() { return this.state.portfolio?.watchlist || []; },
  getSettings() { return this.state.portfolio?.settings || {}; },
  
  // 取得整體統計
  getOverview() { return Stats.calcOverview(this.state.portfolio); },
  
  // 取得單一 stock by symbol
  getStockBySymbol(symbol) {
    if (!symbol) return null;
    const s = String(symbol).toUpperCase();
    return this.getStocks().find(x => x.symbol.toUpperCase() === s) || null;
  },

  // ============================================================
  // 🎯 Action Dispatcher（所有變更的唯一入口）
  // ============================================================
  
  dispatch(action) {
    if (!action || !action.type) {
      console.error('[Store] 無效的 action:', action);
      return null;
    }
    
    console.log('[Store] dispatch:', action.type, action.payload);
    
    let result = null;
    try {
      result = this._reduce(action);
    } catch (err) {
      console.error('[Store] reducer 錯誤:', err);
      this.state.lastError = err.message;
      this._notify();
      return null;
    }
    
    // 自動寫入 localStorage（每次變更都保險）
    Storage.saveLocal(this.state.portfolio);
    Storage.saveLocalHistory(this.state.history);
    
    this._notify();
    
    // 排程雲端同步
    if (Storage.getToken() && Storage.getGistId()) {
      this.scheduleCloudSync();
    }
    
    return result;
  },

  // ============================================================
  // 🔧 Reducer
  // ============================================================
  
  _reduce(action) {
    const { type, payload } = action;
    
    switch (type) {
      
      // ---------- 個股交易 ----------
      case 'STOCK_BUY': {
        // payload: { symbol, name, market, shares, price, fee, tax, total,
        //            effectiveCost, date, note, isETF, discount, isRegular }
        const symbol = String(payload.symbol).toUpperCase();
        let stock = this.getStockBySymbol(symbol);
        
        if (!stock) {
          // 新增 stock
          stock = DataStructure.createStock(symbol, payload.name || symbol, payload.market || 'TW');
          this.state.portfolio.stocks.push(stock);
        }
        
        // 應用買入（保留分批 lot）
        stock.lots = Calculator.applyBuy({
          existingLots: stock.lots,
          newBuy: {
            shares: payload.shares,
            price: payload.price,
            effectiveCost: payload.effectiveCost || payload.price,
            fee: payload.fee || 0,
            date: payload.date,
            note: payload.note
          },
          mode: 'separate'
        });
        
        // 記錄交易
        const tx = DataStructure.createTransaction(
          'BUY', 'stock', symbol, payload.name,
          payload.shares, payload.price,
          {
            fee: payload.fee || 0,
            tax: 0,
            note: payload.note
          }
        );
        SnapshotManager.addTransaction(tx);
        this.state.history.transactions.push(tx);
        
        return { stock, transaction: tx };
      }
      
      case 'STOCK_SELL': {
        // payload: { symbol, shares, price, fee, tax, total, date, note, isETF }
        const symbol = String(payload.symbol).toUpperCase();
        const stock = this.getStockBySymbol(symbol);
        if (!stock) throw new Error(`找不到股票 ${symbol}`);
        
        const result = Calculator.applySell({
          existingLots: stock.lots,
          sharesToSell: payload.shares,
          sellInfo: {
            total: payload.total, // 淨收
            fee: payload.fee,
            tax: payload.tax
          }
        });
        
        if (result.shortage > 0) {
          throw new Error(`庫存不足，缺少 ${result.shortage} 股`);
        }
        
        stock.lots = result.remainingLots;
        stock.realizedPnl = (Number(stock.realizedPnl) || 0) + result.realizedPnl;
        
        // 如果全部賣光，移除 stock
        if (stock.lots.length === 0) {
          this.state.portfolio.stocks = this.state.portfolio.stocks.filter(s => s.id !== stock.id);
        }
        
        // 記錄交易
        const tx = DataStructure.createTransaction(
          'SELL', 'stock', symbol, payload.name || stock.name,
          payload.shares, payload.price,
          {
            fee: payload.fee || 0,
            tax: payload.tax || 0,
            realizedPnl: result.realizedPnl,
            relatedLotIds: result.soldDetails.map(d => d.lotId),
            note: payload.note
          }
        );
        this.state.history.transactions.push(tx);
        
        return { stock, transaction: tx, realizedPnl: result.realizedPnl };
      }
      
      // ============================================================
      // 💎 融資 / 融券
      // ============================================================
      case 'MARGIN_BUY': {
        // payload: { symbol, name, type, shares, price, fee, date, note }
        // type: 'long' = 融資買進, 'short' = 融券賣出
        const symbol = String(payload.symbol).toUpperCase();
        const list = this.state.portfolio.margin || (this.state.portfolio.margin = []);
        let pos = list.find(s => s.symbol === symbol && s.type === payload.type);

        if (!pos) {
          pos = DataStructure.createMargin(symbol, payload.name || symbol, payload.type, 'TW');
          list.push(pos);
        }

        // 取設定（沿用你 01-config.js 的 CONFIG.MARGIN.LONG / SHORT）
        const cfg = (CONFIG.MARGIN && CONFIG.MARGIN[payload.type === 'long' ? 'LONG' : 'SHORT']) || {};
        const subtotal = payload.shares * payload.price;
        const fee = Number(payload.fee || 0);
        let loanAmount = 0;
        let depositAmount = 0;
        let shortFee = 0;
        let effectiveCost = payload.price;

        if (payload.type === 'long') {
          // 融資：借 60%
          loanAmount = subtotal * (cfg.LOAN_RATE || 0.6);
          pos.loanAmount = (pos.loanAmount || 0) + loanAmount;
          effectiveCost = (subtotal + fee) / payload.shares;
        } else {
          // 融券：保證金 90% + 借券費
          depositAmount = subtotal * (cfg.DEPOSIT_RATE || 0.9);
          shortFee = subtotal * (cfg.FEE_RATE || 0.0008);
          pos.depositAmount = (pos.depositAmount || 0) + depositAmount;
          pos.shortFee = (pos.shortFee || 0) + shortFee;
          effectiveCost = (subtotal - fee - shortFee) / payload.shares;
        }

        // 加 lot
        pos.lots.push(DataStructure.createLot(
          payload.date || new Date().toISOString().slice(0, 10),
          payload.shares,
          payload.price,
          { effectiveCost, fee, note: payload.note || '' }
        ));

        // 記錄交易
        const tx = DataStructure.createTransaction(
          payload.type === 'long' ? 'MARGIN_BUY' : 'SHORT_SELL',
          'margin',
          symbol,
          payload.name || pos.name,
          payload.shares,
          payload.price,
          { fee, tax: 0, note: payload.note || '' }
        );
        this.state.history.transactions.push(tx);

        return { position: pos, transaction: tx };
      }

      case 'MARGIN_SELL': {
        // payload: { id, shares, price, fee, date, note }
        // 融資：賣出平倉  /  融券：買回回補
        const list = this.state.portfolio.margin || [];
        const pos = list.find(s => s.id === payload.id);
        if (!pos) {
          console.warn('[Store] MARGIN_SELL: 找不到', payload.id);
          return null;
        }

        // 計算賣出明細（沿用 Calculator）
        const sellInfo = Calculator.calcSell({
          shares: payload.shares,
          price: payload.price,
          discount: this.state.portfolio.settings?.brokerFeeDiscount || 0.28,
          isETF: false
        });
        const result = Calculator.applySell({
          existingLots: pos.lots,
          sharesToSell: payload.shares,
          sellInfo
        });

        if (result.shortage > 0) {
          throw new Error(`庫存不足，缺少 ${result.shortage} 股`);
        }

        // 計算「平倉前」剩餘股數，算釋放比例
        const totalBefore = pos.lots.reduce((s, l) => s + (Number(l.shares) || 0), 0);
        const closeRatio = totalBefore > 0 ? (payload.shares / totalBefore) : 0;

        pos.lots = result.remainingLots;
        pos.realizedPnl = (Number(pos.realizedPnl) || 0) + result.realizedPnl;

        // 釋放融資金額 / 退還保證金
        if (pos.type === 'long') {
          pos.loanAmount = Math.max(0, (pos.loanAmount || 0) * (1 - closeRatio));
        } else {
          pos.depositAmount = Math.max(0, (pos.depositAmount || 0) * (1 - closeRatio));
        }

        // 平倉清空就移除
        if (pos.lots.length === 0) {
          this.state.portfolio.margin = list.filter(s => s.id !== pos.id);
        }

        // 記錄交易
        const tx = DataStructure.createTransaction(
          pos.type === 'long' ? 'MARGIN_SELL' : 'SHORT_COVER',
          'margin',
          pos.symbol,
          pos.name,
          payload.shares,
          payload.price,
          {
            fee: payload.fee || sellInfo.fee || 0,
            tax: sellInfo.tax || 0,
            realizedPnl: result.realizedPnl,
            note: payload.note || ''
          }
        );
        this.state.history.transactions.push(tx);

        return { position: pos, transaction: tx, realizedPnl: result.realizedPnl };
      }

      // ============================================================
      // 📈 期貨
      // ============================================================
            case 'FUTURES_OPEN': {
        // payload: { symbol, name, contractMonth, type, lots, price, multiplier,
        //           initialMargin, maintenanceMargin, fee, stopLoss, takeProfit, date, note }
        if (!this.state.portfolio.futures) this.state.portfolio.futures = [];

        // 🆕 用 FuturesHelper 補齊 isStockFutures / underlyingSymbol
        let isStockFutures = false;
        let underlyingSymbol = '';
        if (typeof FuturesHelper !== 'undefined') {
          const c = FuturesHelper.getContract(payload.symbol);
          if (c) {
            isStockFutures = !!c.isStockFutures;
            underlyingSymbol = c.underlyingSymbol || '';
          }
        }

        const newPos = {
          id: 'fut_' + Math.random().toString(36).slice(2, 12),
          symbol: payload.symbol,
          name: payload.name,
          contractMonth: payload.contractMonth,
          type: payload.type,                    // 'long' | 'short'
          lots: payload.lots,
          avgPrice: payload.price,
          currentPrice: payload.price,
          multiplier: payload.multiplier,
          initialMargin: payload.initialMargin,
          maintenanceMargin: payload.maintenanceMargin,
          fee: payload.fee || 0,
          stopLoss: payload.stopLoss,
          takeProfit: payload.takeProfit,

          // 🆕 標的股相關
          isStockFutures: isStockFutures,
          underlyingSymbol: underlyingSymbol,

          realizedPnl: 0,
          note: payload.note || '',
          openDate: payload.date,
          market: payload.market || 'TW',
          createdAt: Date.now()
        };

        this.state.portfolio.futures.push(newPos);

        // 記錄交易
        const tx = DataStructure.createTransaction(
          'FUTURES_OPEN',
          'futures',
          payload.symbol,
          payload.name,
          payload.lots,
          payload.price,
          {
            fee: payload.fee || 0,
            contractMonth: payload.contractMonth,
            direction: payload.type,
            note: payload.note || ''
          }
        );
        this.state.history.transactions.push(tx);

        return { position: newPos, transaction: tx };
      }

      case 'FUTURES_CLOSE': {
        // payload: { id, lots, price, fee, date, note }
        if (!this.state.portfolio.futures) this.state.portfolio.futures = [];
        const list = this.state.portfolio.futures;
        const idx = list.findIndex(p => p.id === payload.id);
        if (idx < 0) throw new Error('找不到期貨部位：' + payload.id);

        const pos = list[idx];
        const closeLots = Math.min(Number(payload.lots) || 0, pos.lots);
        if (closeLots <= 0) throw new Error('平倉口數必須大於 0');

        const closePrice = Number(payload.price) || 0;
        const closeFee = Number(payload.fee) || 0;
        const multiplier = pos.multiplier || 1;

        // 計算毛損益（不含手續費）
        const pointDiff = pos.type === 'long'
          ? (closePrice - pos.avgPrice)
          : (pos.avgPrice - closePrice);
        const grossPnl = pointDiff * multiplier * closeLots;

        // 期交稅（平倉那邊）
        const contractValue = closePrice * multiplier * closeLots;
        const taxRate = 0.00002; // 簡化：用統一稅率
        const tax = Math.round(contractValue * taxRate);

        const netPnl = grossPnl - closeFee - tax;

        // 累計已實現損益（含過去部分平倉的）
        pos.realizedPnl = (pos.realizedPnl || 0) + netPnl;

        // 部分平倉 / 全部平倉
        if (closeLots >= pos.lots) {
          // 全部平倉 → 從持倉移除，搬到 closedFutures 歷史
          if (!this.state.history.closedFutures) this.state.history.closedFutures = [];
          this.state.history.closedFutures.push({
            ...pos,
            closeDate: payload.date,
            closePrice: closePrice,
            closedLots: closeLots,
            closeFee: closeFee,
            closeTax: tax,
            finalPnl: pos.realizedPnl,
            closedAt: Date.now()
          });
          list.splice(idx, 1);
        } else {
          // 部分平倉 → 減少口數，按比例減保證金
          const ratio = (pos.lots - closeLots) / pos.lots;
          pos.initialMargin = Math.round(pos.initialMargin * ratio);
          pos.maintenanceMargin = Math.round(pos.maintenanceMargin * ratio);
          pos.lots = pos.lots - closeLots;
        }

        // 記錄交易
        const tx = DataStructure.createTransaction(
          'FUTURES_CLOSE',
          'futures',
          pos.symbol,
          pos.name,
          closeLots,
          closePrice,
          {
            fee: closeFee,
            tax: tax,
            grossPnl: grossPnl,
            netPnl: netPnl,
            direction: pos.type,
            contractMonth: pos.contractMonth,
            avgOpenPrice: pos.avgPrice,
            note: payload.note || ''
          }
        );
        this.state.history.transactions.push(tx);

        return { closedLots: closeLots, grossPnl, netPnl, tax };
      }

      case 'STOCK_UPDATE_PRICE': {
        // payload: { symbol, price }
        const stock = this.getStockBySymbol(payload.symbol);
        if (!stock) return null;
        stock.currentPrice = Number(payload.price) || 0;
        stock.lastPriceUpdate = new Date().toISOString();
        return stock;
      }

      // 🆕 ===== 加在這裡開始 =====
      case 'MARGIN_UPDATE_PRICE': {
        // payload: { symbol, price }
        // 同代號可能同時有「融資 long」和「融券 short」兩個 position → 都要更新
        const symbol = String(payload.symbol).toUpperCase();
        const list = this.state.portfolio.margin || [];
        const price = Number(payload.price) || 0;
        let updated = 0;
        list.forEach(p => {
          if (String(p.symbol).toUpperCase() === symbol) {
            p.currentPrice = price;
            p.lastPriceUpdate = new Date().toISOString();
            updated++;
          }
        });
        return updated > 0 ? { symbol, price, updated } : null;
      }

      case 'FUTURES_UPDATE_PRICE': {
        // payload: { id, price }（用 id 精確指定，因為期貨同商品多月份/方向）
        // 預留給未來 Phase D 自動報價用，目前手動輸入也走這個 action 比較統一
        const list = this.state.portfolio.futures || [];
        const pos = list.find(f => f.id === payload.id);
        if (!pos) return null;
        pos.currentPrice = Number(payload.price) || 0;
        pos.lastPriceUpdate = new Date().toISOString();
        return pos;
      }
      // 🆕 ===== 加到這裡結束 =====

      case 'STOCK_DELETE_LOT': {
        // payload: { symbol, lotId }
        const stock = this.getStockBySymbol(payload.symbol);
        if (!stock) return null;
        stock.lots = stock.lots.filter(l => l.id !== payload.lotId);
        if (stock.lots.length === 0) {
          this.state.portfolio.stocks = this.state.portfolio.stocks.filter(s => s.id !== stock.id);
        }
        return stock;
      }
      
      // ---------- 觀察清單 ----------
      case 'WATCHLIST_ADD': {
        const item = {
          id: Utils.uid('wl'),
          symbol: String(payload.symbol).toUpperCase(),
          name: payload.name || '',
          market: payload.market || 'TW',
          currentPrice: Number(payload.currentPrice) || 0,
          addedDate: new Date().toISOString(),
          note: payload.note || ''
        };
        this.state.portfolio.watchlist.push(item);
        return item;
      }
      
      case 'WATCHLIST_REMOVE': {
        this.state.portfolio.watchlist = this.state.portfolio.watchlist.filter(w => w.id !== payload.id);
        return true;
      }
      
      // ---------- 設定 ----------
      case 'SETTINGS_UPDATE': {
        Object.assign(this.state.portfolio.settings, payload);
        return this.state.portfolio.settings;
      }
      
      // ---------- 快照 ----------
      case 'SNAPSHOT_TAKE': {
        const stats = Stats.calcOverview(this.state.portfolio);
        const snap = SnapshotManager.addOrUpdateToday(stats);
        // 同步到 state.history
        this.state.history = SnapshotManager.getHistory();
        return snap;
      }
      
      // ---------- 重置 ----------
      case 'RESET_ALL': {
        this.state.portfolio = DataStructure.getDefaultPortfolio();
        this.state.history = DataStructure.getDefaultHistory();
        return true;
      }
      
      // ---------- 直接覆寫（從匯入用）----------
      case 'IMPORT_DATA': {
        if (payload.portfolio) {
          let imported = payload.portfolio;
          if (Migration.isV1(imported)) imported = Migration.migrate(imported);
          this.state.portfolio = imported;
        }
        if (payload.history) {
          this.state.history = payload.history;
        }
        return true;
      }
      
      default:
        console.warn('[Store] 未知的 action type:', type);
        return null;
    }
  },

  // ============================================================
  // 📤 匯出 / 匯入
  // ============================================================
  
  exportData() {
    return {
      version: CONFIG.VERSION,
      exportDate: new Date().toISOString(),
      portfolio: Utils.deepClone(this.state.portfolio),
      history: Utils.deepClone(this.state.history)
    };
  },

  async importData(data) {
    if (!data || !data.portfolio) throw new Error('資料格式錯誤');
    return this.dispatch({ type: 'IMPORT_DATA', payload: data });
  }
};

// 全域曝露
window.Store = Store;

console.log('[09-store.js] ✅ Store 已載入');

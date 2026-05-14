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
        const p = action.payload;
        const stocks = portfolio.margin || [];
        let stock = stocks.find(s => s.symbol === p.symbol && s.type === p.type);

        if (!stock) {
          stock = DataStructure.createMargin(p.symbol, p.name || p.symbol, p.type, 'TW');
          stocks.push(stock);
        }

        // 計算融資借款 / 融券保證金
        const cfg = (CONFIG.MARGIN_CONFIG && CONFIG.MARGIN_CONFIG[p.type === 'long' ? 'long' : 'short']) || {};
        const subtotal = p.shares * p.price;
        const fee = Number(p.fee || 0);
        let loanAmount = 0;
        let depositAmount = 0;
        let shortFee = 0;
        let effectiveCost = p.price;

        if (p.type === 'long') {
          // 融資：借 60%，自備 40%
          loanAmount = subtotal * (cfg.loanRate || 0.6);
          stock.loanAmount += loanAmount;
          effectiveCost = (subtotal + fee) / p.shares;  // 含手續費
        } else {
          // 融券：保證金 90% + 借券費 0.08%
          depositAmount = subtotal * (cfg.depositRate || 0.9);
          shortFee = subtotal * (cfg.feeRate || 0.0008);
          stock.depositAmount += depositAmount;
          stock.shortFee += shortFee;
          effectiveCost = (subtotal - fee - shortFee) / p.shares; // 賣空進帳
        }

        // 加 lot
        stock.lots.push(DataStructure.createLot(
          p.date || new Date().toISOString().slice(0, 10),
          p.shares,
          p.price,
          { effectiveCost, fee, note: p.note || '' }
        ));

        // 加交易紀錄
        history.transactions.push(DataStructure.createTransaction(
          p.type === 'long' ? 'MARGIN_BUY' : 'SHORT_SELL',
          'margin',
          p.symbol,
          p.name,
          p.shares,
          p.price,
          { fee, tax: 0, note: p.note || '' }
        ));

        return { portfolio: { ...portfolio, margin: stocks }, history };
      }

      case 'MARGIN_SELL': {
        // payload: { id, shares, price, fee, date, note }
        // 融資：賣出平倉   /   融券：買回回補
        const p = action.payload;
        const stocks = portfolio.margin || [];
        const stock = stocks.find(s => s.id === p.id);
        if (!stock) {
          console.warn('[Store] MARGIN_SELL: 找不到', p.id);
          return { portfolio, history };
        }

        // FIFO 平倉
        const sellInfo = Calculator.calcSell({
          shares: p.shares,
          price: p.price,
          discount: portfolio.settings?.brokerFeeDiscount || 0.28,
          isETF: false
        });
        const result = Calculator.applySell({
          existingLots: stock.lots,
          sharesToSell: p.shares,
          sellInfo
        });

        stock.lots = result.remainingLots;
        stock.realizedPnl += result.realizedPnl;

        // 釋放融資金額 / 退還保證金
        const closeRatio = p.shares / Math.max(1, stock.lots.reduce((s,l) => s + (l.shares||0), p.shares));
        if (stock.type === 'long') {
          stock.loanAmount = Math.max(0, stock.loanAmount * (1 - closeRatio));
        } else {
          stock.depositAmount = Math.max(0, stock.depositAmount * (1 - closeRatio));
        }

        history.transactions.push(DataStructure.createTransaction(
          stock.type === 'long' ? 'MARGIN_SELL' : 'SHORT_COVER',
          'margin',
          stock.symbol,
          stock.name,
          p.shares,
          p.price,
          { fee: p.fee || 0, tax: sellInfo.tax, realizedPnl: result.realizedPnl, note: p.note || '' }
        ));

        return { portfolio: { ...portfolio, margin: stocks }, history };
      }

      // ============================================================
      // 📈 期貨
      // ============================================================
      case 'FUTURES_OPEN': {
        // payload: { product, contract, name, direction, contracts, price, fee, date, note, underlyingSymbol }
        const p = action.payload;
        const futures = portfolio.futures || [];
        let pos = futures.find(f =>
          f.product === p.product &&
          f.contract === p.contract &&
          f.direction === p.direction
        );

        const productCfg = CONFIG.FUTURES_CONFIG?.products?.[p.product] || {};
        const fee = p.fee != null ? Number(p.fee) : (productCfg.feePerLot || 30) * p.contracts;

        // 計算保證金
        let marginNeeded = 0;
        if (productCfg.category === 'index') {
          marginNeeded = (productCfg.margin || 0) * p.contracts;
        } else if (productCfg.category === 'stock') {
          // 個股期：標的價 × 契約規模 × 保證金比率
          const notional = (p.price || 0) * (productCfg.contractSize || 2000);
          marginNeeded = notional * (productCfg.marginRate || 0.135) * p.contracts;
        }

        if (!pos) {
          pos = DataStructure.createFutures(
            p.product, p.contract, p.name || p.contract,
            p.direction, p.underlyingSymbol || ''
          );
          futures.push(pos);
        }

        // 加 lot
        pos.lots.push(DataStructure.createFuturesLot(
          p.date || new Date().toISOString().slice(0, 10),
          p.contracts,
          p.price,
          { fee, margin: marginNeeded, note: p.note || '' }
        ));

        // 重算加權平均進場價
        let totalCon = 0, totalNotion = 0;
        pos.lots.forEach(l => {
          const c = Number(l.remaining ?? l.contracts) || 0;
          totalCon += c;
          totalNotion += c * (Number(l.price) || 0);
        });
        pos.totalContracts = totalCon;
        pos.avgPrice = totalCon > 0 ? totalNotion / totalCon : 0;
        pos.marginUsed += marginNeeded;

        history.transactions.push(DataStructure.createTransaction(
          p.direction === 'long' ? 'FUT_LONG_OPEN' : 'FUT_SHORT_OPEN',
          'futures',
          p.contract,
          p.name,
          p.contracts,
          p.price,
          { fee, tax: 0, note: p.note || '', product: p.product }
        ));

        return { portfolio: { ...portfolio, futures }, history };
      }

      case 'FUTURES_CLOSE': {
        // payload: { id, contracts, price, fee, date, note }
        const p = action.payload;
        const futures = portfolio.futures || [];
        const pos = futures.find(f => f.id === p.id);
        if (!pos) {
          console.warn('[Store] FUTURES_CLOSE: 找不到', p.id);
          return { portfolio, history };
        }

        const productCfg = CONFIG.FUTURES_CONFIG?.products?.[pos.product] || {};
        const pointValue = productCfg.pointValue || (productCfg.contractSize || 2000);
        const fee = p.fee != null ? Number(p.fee) : (productCfg.feePerLot || 30) * p.contracts;

        // FIFO 平倉
        let remainingToClose = Number(p.contracts) || 0;
        let totalPnl = 0;
        let releasedMargin = 0;

        const sortedLots = [...pos.lots].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const newLots = [];

        sortedLots.forEach(lot => {
          const lotCons = Number(lot.remaining ?? lot.contracts) || 0;
          if (remainingToClose <= 0 || lotCons <= 0) {
            newLots.push(lot);
            return;
          }
          const close = Math.min(lotCons, remainingToClose);
          // 點數差 × 一點價值（多單：現價>進價賺；空單：現價<進價賺）
          const points = pos.direction === 'long' 
            ? (p.price - lot.price) 
            : (lot.price - p.price);
          totalPnl += points * pointValue * close;
          // 釋放保證金（按比例）
          if (lotCons > 0) {
            releasedMargin += (Number(lot.margin) || 0) * (close / lotCons);
          }
          remainingToClose -= close;
          newLots.push({
            ...lot,
            remaining: lotCons - close,
            margin: (Number(lot.margin) || 0) * ((lotCons - close) / Math.max(lotCons, 1))
          });
        });

        // 扣手續費和稅
        const tax = (p.contracts * p.price * pointValue) * (productCfg.taxRate || 0.00002);
        totalPnl -= (fee + tax);

        pos.lots = newLots;
        pos.realizedPnl += totalPnl;
        pos.marginUsed = Math.max(0, pos.marginUsed - releasedMargin);

        // 重算 totalContracts / avgPrice
        let totalCon = 0, totalNotion = 0;
        pos.lots.forEach(l => {
          const c = Number(l.remaining ?? l.contracts) || 0;
          totalCon += c;
          totalNotion += c * (Number(l.price) || 0);
        });
        pos.totalContracts = totalCon;
        pos.avgPrice = totalCon > 0 ? totalNotion / totalCon : 0;

        history.transactions.push(DataStructure.createTransaction(
          pos.direction === 'long' ? 'FUT_LONG_CLOSE' : 'FUT_SHORT_CLOSE',
          'futures',
          pos.contract,
          pos.name,
          p.contracts,
          p.price,
          { fee, tax, realizedPnl: totalPnl, note: p.note || '', product: pos.product }
        ));

        return { portfolio: { ...portfolio, futures }, history };
      }


      case 'STOCK_UPDATE_PRICE': {
        // payload: { symbol, price }
        const stock = this.getStockBySymbol(payload.symbol);
        if (!stock) return null;
        stock.currentPrice = Number(payload.price) || 0;
        stock.lastPriceUpdate = new Date().toISOString();
        return stock;
      }
      
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

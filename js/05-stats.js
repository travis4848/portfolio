/* ============================================================
 * 📊 05-stats.js - 統計計算引擎 + 快照管理
 * ============================================================
 * 用途：
 *   1. Stats：純計算函式（總資產、損益、加權成本...）
 *   2. SnapshotManager：每日快照記錄、歷史壓縮
 * 依賴：CONFIG, Utils, DataStructure
 * 對外：Stats, SnapshotManager（全域變數）
 * ============================================================ */
'use strict';

const Stats = {
  // ---------- 現股計算 ----------
  // 計算單一股票的加權平均成本
  calcStockAvgCost(stock) {
    if (!stock || !Array.isArray(stock.lots) || stock.lots.length === 0) {
      return { totalShares: 0, avgCost: 0, totalCost: 0 };
    }
    let totalShares = 0;
    let totalCost = 0;
    stock.lots.forEach(lot => {
      const shares = Number(lot.shares) || 0;
      const cost = Number(lot.cost) || 0;
      totalShares += shares;
      totalCost += shares * cost;
    });
    return {
      totalShares,
      totalCost,
      avgCost: totalShares > 0 ? totalCost / totalShares : 0
    };
  },

  // 計算單一股票市值與損益
  calcStockValue(stock) {
    const { totalShares, avgCost, totalCost } = this.calcStockAvgCost(stock);
    const price = Number(stock.currentPrice) || 0;
    const marketValue = totalShares * price;
    const unrealizedPnl = marketValue - totalCost;
    const pnlPct = totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0;
    return {
      totalShares,
      avgCost,
      totalCost,
      marketValue,
      unrealizedPnl,
      pnlPct,
      currentPrice: price
    };
  },

  // 計算整體現股
  calcStocks(stocks) {
    if (!Array.isArray(stocks)) return { totalCost: 0, totalValue: 0, totalPnl: 0, count: 0 };
    let totalCost = 0;
    let totalValue = 0;
    let count = 0;
    stocks.forEach(s => {
      const v = this.calcStockValue(s);
      if (v.totalShares > 0) {
        totalCost += v.totalCost;
        totalValue += v.marketValue;
        count++;
      }
    });
    return {
      totalCost,
      totalValue,
      totalPnl: totalValue - totalCost,
      count
    };
  },

  // ---------- 融資計算 ----------
  calcMarginPosition(position) {
    if (!position || !Array.isArray(position.lots) || position.lots.length === 0) {
      return { totalShares: 0, avgCost: 0, totalOwnFund: 0, totalLoan: 0, marketValue: 0, unrealizedPnl: 0 };
    }
    let totalShares = 0;
    let totalCost = 0;
    let totalOwnFund = 0;
    let totalLoan = 0;
    position.lots.forEach(lot => {
      const shares = Number(lot.shares) || 0;
      const cost = Number(lot.cost) || 0;
      totalShares += shares;
      totalCost += shares * cost;
      totalOwnFund += Number(lot.ownFund) || 0;
      totalLoan += Number(lot.marginLoan) || 0;
    });
    const price = Number(position.currentPrice) || 0;
    const marketValue = totalShares * price;
    const unrealizedPnl = marketValue - totalCost;
    return {
      totalShares,
      avgCost: totalShares > 0 ? totalCost / totalShares : 0,
      totalCost,
      totalOwnFund,
      totalLoan,
      marketValue,
      unrealizedPnl,
      pnlPct: totalOwnFund > 0 ? (unrealizedPnl / totalOwnFund) * 100 : 0
    };
  },

  calcMargin(margin) {
    if (!Array.isArray(margin)) return { totalOwnFund: 0, totalLoan: 0, totalValue: 0, totalPnl: 0, count: 0 };
    let totalOwnFund = 0;
    let totalLoan = 0;
    let totalValue = 0;
    let totalPnl = 0;
    let count = 0;
    margin.forEach(m => {
      const v = this.calcMarginPosition(m);
      if (v.totalShares > 0) {
        totalOwnFund += v.totalOwnFund;
        totalLoan += v.totalLoan;
        totalValue += v.marketValue;
        totalPnl += v.unrealizedPnl;
        count++;
      }
    });
    return { totalOwnFund, totalLoan, totalValue, totalPnl, count };
  },

  // ---------- 期貨計算 ----------
  calcFuturesPosition(position) {
    if (!position || !Array.isArray(position.lots) || position.lots.length === 0) {
      return { totalContracts: 0, totalMargin: 0, unrealizedPnl: 0 };
    }
    let totalContracts = 0;
    let totalMargin = 0;
    let unrealizedPnl = 0;
    const price = Number(position.currentPrice) || 0;
    
    position.lots.forEach(lot => {
      const contracts = Number(lot.contracts) || 0;
      const entry = Number(lot.entryPrice) || 0;
      const size = Number(lot.contractSize) || 200;
      const dir = lot.direction === 'short' ? -1 : 1;
      
      totalContracts += contracts;
      totalMargin += Number(lot.margin) || 0;
      
      if (price > 0) {
        unrealizedPnl += dir * (price - entry) * size * contracts;
      }
    });
    
    return {
      totalContracts,
      totalMargin,
      unrealizedPnl,
      pnlPct: totalMargin > 0 ? (unrealizedPnl / totalMargin) * 100 : 0
    };
  },

  calcFutures(futures) {
    if (!Array.isArray(futures)) return { totalMargin: 0, totalPnl: 0, count: 0 };
    let totalMargin = 0;
    let totalPnl = 0;
    let count = 0;
    futures.forEach(f => {
      const v = this.calcFuturesPosition(f);
      if (v.totalContracts > 0) {
        totalMargin += v.totalMargin;
        totalPnl += v.unrealizedPnl;
        count++;
      }
    });
    return { totalMargin, totalPnl, count };
  },

  // ---------- 整體統計 ----------
  calcOverview(portfolio) {
    if (!portfolio) {
      return {
        totalAssets: 0, totalCost: 0, totalPnl: 0, pnlPct: 0,
        breakdown: { stocks: 0, margin: 0, futures: 0, cash: 0 },
        positionsCount: 0, realizedPnlAccum: 0
      };
    }
    
    const stocks = this.calcStocks(portfolio.stocks || []);
    const margin = this.calcMargin(portfolio.margin || []);
    const futures = this.calcFutures(portfolio.futures || []);
    
    // 累計已實現損益
    let realizedAccum = 0;
    (portfolio.stocks || []).forEach(s => realizedAccum += Number(s.realizedPnl) || 0);
    (portfolio.margin || []).forEach(m => realizedAccum += Number(m.realizedPnl) || 0);
    (portfolio.futures || []).forEach(f => realizedAccum += Number(f.realizedPnl) || 0);
    
    const totalAssets = stocks.totalValue + margin.totalOwnFund + futures.totalMargin;
    const totalCost = stocks.totalCost + margin.totalOwnFund + futures.totalMargin;
    const totalPnl = stocks.totalPnl + margin.totalPnl + futures.totalPnl;
    
    return {
      totalAssets,
      totalCost,
      totalPnl,
      pnlPct: totalCost > 0 ? (totalPnl / totalCost) * 100 : 0,
      breakdown: {
        stocks: stocks.totalValue,
        margin: margin.totalOwnFund,
        futures: futures.totalMargin,
        cash: 0
      },
      positionsCount: stocks.count + margin.count + futures.count,
      realizedPnlAccum: realizedAccum,
      stocksDetail: stocks,
      marginDetail: margin,
      futuresDetail: futures
    };
  }
};

// ============================================================
// 📸 SnapshotManager - 快照管理
// ============================================================
const SnapshotManager = {
  // 取得歷史資料（自動初始化）
  getHistory() {
    let history = Storage.loadLocalHistory();
    if (!history) {
      history = DataStructure.getDefaultHistory();
      Storage.saveLocalHistory(history);
    }
    return history;
  },

  // 取得今日快照
  getTodaySnapshot() {
    const history = this.getHistory();
    const today = Utils.today();
    return history.snapshots.find(s => s.date === today) || null;
  },

  // 新增或更新今日快照
  addOrUpdateToday(stats) {
    const history = this.getHistory();
    const today = Utils.today();
    const existing = history.snapshots.findIndex(s => s.date === today);
    const snapshot = DataStructure.createSnapshot(stats);
    
    if (existing >= 0) {
      history.snapshots[existing] = snapshot;
    } else {
      history.snapshots.push(snapshot);
    }
    
    // 排序 + 壓縮
    history.snapshots.sort((a, b) => a.date.localeCompare(b.date));
    this.compressOldSnapshots(history);
    
    Storage.saveLocalHistory(history);
    return snapshot;
  },

  // 壓縮舊快照（>90 天每週、>365 天每月）
  compressOldSnapshots(history) {
    const today = new Date();
    const dailyKeep = CONFIG.HISTORY.DAILY_KEEP_DAYS;
    const weeklyKeep = CONFIG.HISTORY.WEEKLY_KEEP_DAYS;
    
    const result = [];
    const weeklyMap = new Map();
    const monthlyMap = new Map();
    
    history.snapshots.forEach(snap => {
      const days = Utils.daysBetween(snap.date, today.toISOString().slice(0, 10));
      
      if (days <= dailyKeep) {
        // 90 天內保留每日
        result.push(snap);
      } else if (days <= weeklyKeep) {
        // 90~365 天每週只保留一筆（每週日）
        const d = new Date(snap.date);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toISOString().slice(0, 10);
        if (!weeklyMap.has(key) || snap.date > weeklyMap.get(key).date) {
          weeklyMap.set(key, snap);
        }
      } else {
        // > 365 天每月一筆
        const key = snap.date.slice(0, 7);
        if (!monthlyMap.has(key) || snap.date > monthlyMap.get(key).date) {
          monthlyMap.set(key, snap);
        }
      }
    });
    
    history.snapshots = [
      ...Array.from(monthlyMap.values()),
      ...Array.from(weeklyMap.values()),
      ...result
    ].sort((a, b) => a.date.localeCompare(b.date));
  },

  // 加入交易紀錄
  addTransaction(tx) {
    const history = this.getHistory();
    history.transactions.push(tx);
    Storage.saveLocalHistory(history);
  },

  // 取得交易紀錄
  getTransactions(filter = {}) {
    const history = this.getHistory();
    let txs = history.transactions || [];
    if (filter.category) txs = txs.filter(t => t.category === filter.category);
    if (filter.symbol) txs = txs.filter(t => t.symbol === filter.symbol);
    return txs;
  },

  // 取得快照範圍
  getSnapshots(days = 30) {
    const history = this.getHistory();
    const limit = days > 0 ? -days : 0;
    return limit < 0 ? history.snapshots.slice(limit) : history.snapshots;
  }
};

// 全域曝露
window.Stats = Stats;
window.SnapshotManager = SnapshotManager;

console.log('[05-stats.js] ✅ Stats + SnapshotManager 已載入');

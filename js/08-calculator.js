/* ============================================================
 * 🧮 08-calculator.js - 交易計算引擎
 * ============================================================
 * 用途：
 *   1. 計算手續費（含折扣、最低 20 元、定期定額 1 元）
 *   2. 計算證交稅（一般 0.3%、ETF 0.1%、期貨另計）
 *   3. 計算交易總額（買入成本 / 賣出淨收）
 *   4. 加權平均成本更新（買入合併到 lot）
 *   5. FIFO 賣出（先進先出，計算已實現損益）
 * 依賴：CONFIG, Utils, DataStructure
 * 對外：Calculator（全域變數）
 * ============================================================ */
'use strict';

const Calculator = {
  // ============================================================
  // 💰 手續費 / 稅費
  // ============================================================
  
  // 計算台股手續費
  // params:
  //   amount: 成交金額（股數 × 價格）
  //   discount: 折扣（如 0.28 = 2.8 折，1 = 原價）
  //   isRegular: 是否定期定額（手續費僅 1 元）
  //   market: 'TW' | 'US'
  calcFee({ amount, discount = 0.28, isRegular = false, market = 'TW' }) {
    if (!amount || amount <= 0) return 0;
    
    if (market === 'US') {
      // 美股：依券商而定，這裡簡化為 0（可改為固定 1 美元等）
      return 0;
    }
    
    // 台股：成交金額 × 0.1425% × 折扣，最低 20 元
    if (isRegular) {
      return 1; // 定期定額
    }
    
    const baseRate = 0.001425;
    const fee = amount * baseRate * discount;
    return Math.max(20, Math.round(fee));
  },

  // 計算證交稅（賣出才需要）
  // params:
  //   amount: 成交金額
  //   isETF: 是否為 ETF（0.1%）
  //   category: 'stock' | 'margin' | 'futures'
  calcTax({ amount, isETF = false, category = 'stock' }) {
    if (!amount || amount <= 0) return 0;
    
    if (category === 'futures') {
      // 期貨交易稅：成交金額 × 0.002%（簡化）
      return Math.round(amount * 0.00002);
    }
    
    // 股票 / 融資：ETF 0.1%、一般 0.3%
    const rate = isETF ? 0.001 : 0.003;
    return Math.round(amount * rate);
  },

  // ============================================================
  // 📊 交易總計
  // ============================================================
  
  // 計算買入交易（總成本 = 小計 + 手續費）
  calcBuy({ shares, price, discount = 0.28, isRegular = false, isETF = false, market = 'TW' }) {
    const subtotal = shares * price;
    const fee = this.calcFee({ amount: subtotal, discount, isRegular, market });
    const tax = 0; // 買入不收證交稅
    const total = subtotal + fee + tax;
    
    return {
      shares: Number(shares) || 0,
      price: Number(price) || 0,
      subtotal,
      fee,
      tax,
      total,
      effectiveCost: total / shares // 含費用實際成本
    };
  },

  // 計算賣出交易（淨收 = 小計 - 手續費 - 證交稅）
  calcSell({ shares, price, discount = 0.28, isRegular = false, isETF = false, market = 'TW' }) {
    const subtotal = shares * price;
    const fee = this.calcFee({ amount: subtotal, discount, isRegular, market });
    const tax = this.calcTax({ amount: subtotal, isETF, category: 'stock' });
    const net = subtotal - fee - tax;
    
    return {
      shares: Number(shares) || 0,
      price: Number(price) || 0,
      subtotal,
      fee,
      tax,
      total: net,
      effectivePrice: net / shares // 含費用實際售價
    };
  },

  // ============================================================
  // 📦 加權平均成本（買入合併）
  // ============================================================
  
  // 將新買入合併到既有 lots（加權平均）
  // 實作策略：合併為單一 lot（用加權平均成本）
  // 也支援保留多 lot（傳入 mode='separate'）
  // params:
  //   existingLots: 既有 lot 陣列
  //   newBuy: { shares, price, fee, date, note }
  //   mode: 'merge'（合併） | 'separate'（保留分批）
  applyBuy({ existingLots = [], newBuy, mode = 'separate' }) {
    const newLot = DataStructure.createStockLot(
      newBuy.shares,
      newBuy.effectiveCost || newBuy.price, // 含手續費的有效成本
      newBuy.date || Utils.today(),
      newBuy.fee || 0,
      newBuy.note || ''
    );
    
    if (mode === 'merge' && existingLots.length > 0) {
      // 合併模式：把所有 lots + 新 lot 合併成單一加權平均
      let totalShares = 0;
      let totalCost = 0;
      [...existingLots, newLot].forEach(l => {
        totalShares += Number(l.shares) || 0;
        totalCost += (Number(l.shares) || 0) * (Number(l.cost) || 0);
      });
      const avgCost = totalShares > 0 ? totalCost / totalShares : 0;
      
      const merged = DataStructure.createStockLot(
        totalShares,
        avgCost,
        Utils.today(),
        0,
        '（自動合併）'
      );
      return [merged];
    }
    
    // 預設 separate 模式：保留每筆獨立 lot
    return [...existingLots, newLot];
  },

  // ============================================================
  // 🔻 FIFO 賣出（先進先出計算已實現損益）
  // ============================================================
  
  // 從既有 lots 賣出指定股數，依 FIFO 配對
  // 回傳：
  //   {
  //     remainingLots: 剩餘 lots（已扣除賣出股數）
  //     soldDetails: 配對細節 [{ lotId, sharesSold, costBasis, ... }]
  //     realizedPnl: 已實現損益（淨收 - 配對成本）
  //     soldShares: 實際賣出股數（可能小於要求，若庫存不足）
  //   }
  applySell({ existingLots = [], sharesToSell, sellInfo }) {
    const sortedLots = [...existingLots].sort((a, b) => 
      (a.date || '').localeCompare(b.date || '')
    );
    
    let remainingToSell = Number(sharesToSell) || 0;
    let totalCostBasis = 0; // 配對的成本
    const soldDetails = [];
    const remainingLots = [];
    
    sortedLots.forEach(lot => {
      if (remainingToSell <= 0) {
        remainingLots.push(lot);
        return;
      }
      
      const lotShares = Number(lot.shares) || 0;
      if (lotShares <= 0) {
        remainingLots.push(lot);
        return;
      }
      
      if (lotShares <= remainingToSell) {
        // 整個 lot 賣光
        const cost = lotShares * (Number(lot.cost) || 0);
        totalCostBasis += cost;
        soldDetails.push({
          lotId: lot.id,
          sharesSold: lotShares,
          costPerShare: lot.cost,
          costBasis: cost,
          lotDate: lot.date
        });
        remainingToSell -= lotShares;
        // 不加入 remainingLots（已賣完）
      } else {
        // 部分賣出
        const cost = remainingToSell * (Number(lot.cost) || 0);
        totalCostBasis += cost;
        soldDetails.push({
          lotId: lot.id,
          sharesSold: remainingToSell,
          costPerShare: lot.cost,
          costBasis: cost,
          lotDate: lot.date
        });
        // 剩餘 lot
        remainingLots.push({
          ...lot,
          shares: lotShares - remainingToSell
        });
        remainingToSell = 0;
      }
    });
    
    const soldShares = (Number(sharesToSell) || 0) - remainingToSell;
    const netReceived = sellInfo?.total || 0; // 賣出淨收（已扣手續費和稅）
    const realizedPnl = netReceived - totalCostBasis;
    
    return {
      remainingLots,
      soldDetails,
      realizedPnl,
      soldShares,
      totalCostBasis,
      netReceived,
      shortage: remainingToSell // 庫存不足的股數
    };
  },

  // ============================================================
  // 🔍 庫存檢查
  // ============================================================
  
  // 計算某 stock 的可用庫存
  getAvailableShares(stock) {
    if (!stock || !Array.isArray(stock.lots)) return 0;
    return stock.lots.reduce((sum, lot) => sum + (Number(lot.shares) || 0), 0);
  },

  // 檢查賣出是否合法
  canSell(stock, sharesToSell) {
    const available = this.getAvailableShares(stock);
    return {
      ok: available >= sharesToSell,
      available,
      requested: sharesToSell,
      shortage: Math.max(0, sharesToSell - available)
    };
  },

  // ============================================================
  // 💎 融資相關計算
  // ============================================================
  
  // 計算融資買進的自備款
  calcMarginBuy({ shares, price, marginRate = 0.6, discount = 0.28 }) {
    const subtotal = shares * price;
    const fee = this.calcFee({ amount: subtotal, discount });
    const totalCost = subtotal + fee;
    const marginLoan = totalCost * marginRate;
    const ownFund = totalCost - marginLoan;
    
    return {
      shares,
      price,
      subtotal,
      fee,
      tax: 0,
      total: totalCost,
      marginLoan,
      ownFund,
      marginRate,
      leverage: 1 / (1 - marginRate)
    };
  },

  // ============================================================
  // 📈 期貨相關計算
  // ============================================================
  
  // 計算期貨保證金需求
  // 預設台指期 (TXF) 保證金約 18.4 萬，這裡簡化為直接帶入
  calcFuturesEntry({ contracts, entryPrice, marginPerContract = 184000, contractSize = 200, fee = 50 }) {
    const totalMargin = contracts * marginPerContract;
    const totalFee = contracts * fee;
    const notional = contracts * entryPrice * contractSize;
    
    return {
      contracts,
      entryPrice,
      contractSize,
      marginPerContract,
      totalMargin,
      totalFee,
      notional, // 名目本金
      leverage: notional / totalMargin
    };
  }
};

// 全域曝露
window.Calculator = Calculator;

console.log('[08-calculator.js] ✅ Calculator 已載入');

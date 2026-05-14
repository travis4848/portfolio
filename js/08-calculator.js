/* ============================================================
 * 🧮 08-calculator.js - 交易計算引擎 (v3 對齊版)
 * ============================================================
 * 對齊：DataStructure v3 的 lot 欄位（effectiveCost, remaining）
 * 依賴：CONFIG, Utils, DataStructure
 * 對外：Calculator
 * ============================================================ */
'use strict';

const Calculator = {

  // ============================================================
  // 💰 手續費 / 稅費
  // ============================================================
  calcFee({ amount, discount = 0.28, isRegular = false, market = 'TW' }) {
    if (!amount || amount <= 0) return 0;
    if (market === 'US') return 0;
    if (isRegular) return 1;
    const baseRate = 0.001425;
    const fee = amount * baseRate * discount;
    return Math.max(20, Math.round(fee));
  },

  calcTax({ amount, isETF = false, category = 'stock' }) {
    if (!amount || amount <= 0) return 0;
    if (category === 'futures') return Math.round(amount * 0.00002);
    const rate = isETF ? 0.001 : 0.003;
    return Math.round(amount * rate);
  },

  // ============================================================
  // 📊 交易總計
  // ============================================================
  calcBuy({ shares, price, discount = 0.28, isRegular = false, isETF = false, market = 'TW' }) {
    const subtotal = shares * price;
    const fee = this.calcFee({ amount: subtotal, discount, isRegular, market });
    const total = subtotal + fee;
    return {
      shares: Number(shares) || 0,
      price: Number(price) || 0,
      subtotal,
      fee,
      tax: 0,
      total,
      effectiveCost: shares > 0 ? total / shares : price
    };
  },

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
      effectivePrice: shares > 0 ? net / shares : price
    };
  },

  // ============================================================
  // 📦 加權平均成本（買入合併）
  // ============================================================
  // 將新買入合併到既有 lots
  // params:
  //   existingLots: 既有 lot 陣列（v3 結構，含 effectiveCost / remaining）
  //   newBuy: { shares, price, fee, date, note, effectiveCost? }
  //   mode: 'merge' | 'separate'
  applyBuy({ existingLots = [], newBuy, mode = 'separate' }) {
    const newLot = DataStructure.createLot(
      newBuy.date || (typeof Utils !== 'undefined' && Utils.today ? Utils.today() : new Date().toISOString().slice(0, 10)),
      newBuy.shares,
      newBuy.price,
      {
        fee: newBuy.fee || 0,
        note: newBuy.note || '',
        effectiveCost: newBuy.effectiveCost ?? newBuy.price
      }
    );

    if (mode === 'merge' && existingLots.length > 0) {
      // 合併：所有 lot 加權平均成單一 lot
      let totalShares = 0;
      let totalCost = 0;
      [...existingLots, newLot].forEach(l => {
        const sh = Number(l.remaining ?? l.shares) || 0;
        const ec = Number(l.effectiveCost ?? l.price) || 0;
        totalShares += sh;
        totalCost += sh * ec;
      });
      const avgCost = totalShares > 0 ? totalCost / totalShares : 0;

      const merged = DataStructure.createLot(
        new Date().toISOString().slice(0, 10),
        totalShares,
        avgCost,
        { effectiveCost: avgCost, fee: 0, note: '（自動合併）' }
      );
      return [merged];
    }

    // 預設：保留每筆獨立 lot（FIFO 友善）
    return [...existingLots, newLot];
  },

  // ============================================================
  // 🔻 FIFO 賣出
  // ============================================================
  // params:
  //   existingLots: lot 陣列
  //   sharesToSell: 要賣出的股數
  //   sellInfo: { total } 賣出淨收（已扣費）
  // return:
  //   { remainingLots, soldDetails, realizedPnl, soldShares, totalCostBasis, netReceived, shortage }
  applySell({ existingLots = [], sharesToSell, sellInfo }) {
    // 依日期排序（先進先出）
    const sortedLots = [...existingLots].sort((a, b) =>
      (a.date || '').localeCompare(b.date || '')
    );

    let remainingToSell = Number(sharesToSell) || 0;
    let totalCostBasis = 0;
    const soldDetails = [];
    const remainingLots = [];

    sortedLots.forEach(lot => {
      // ⭐ v3：用 remaining 表示尚未賣出的股數
      const lotShares = Number(lot.remaining ?? lot.shares) || 0;
      const lotCost   = Number(lot.effectiveCost ?? lot.price) || 0;

      if (remainingToSell <= 0 || lotShares <= 0) {
        // 不動，原樣保留
        remainingLots.push(lot);
        return;
      }

      if (lotShares <= remainingToSell) {
        // 整批吃光
        const cost = lotShares * lotCost;
        totalCostBasis += cost;
        soldDetails.push({
          lotId: lot.id,
          sharesSold: lotShares,
          costPerShare: lotCost,
          costBasis: cost,
          lotDate: lot.date
        });
        remainingToSell -= lotShares;
        // 把 remaining 設為 0（保留歷史，避免 FIFO 後找不到出處）
        remainingLots.push({ ...lot, remaining: 0 });
      } else {
        // 部分吃
        const cost = remainingToSell * lotCost;
        totalCostBasis += cost;
        soldDetails.push({
          lotId: lot.id,
          sharesSold: remainingToSell,
          costPerShare: lotCost,
          costBasis: cost,
          lotDate: lot.date
        });
        remainingLots.push({
          ...lot,
          remaining: lotShares - remainingToSell
        });
        remainingToSell = 0;
      }
    });

    const soldShares = (Number(sharesToSell) || 0) - remainingToSell;
    const netReceived = sellInfo?.total || 0;
    const realizedPnl = netReceived - totalCostBasis;

    return {
      remainingLots,
      soldDetails,
      realizedPnl,
      soldShares,
      totalCostBasis,
      netReceived,
      shortage: remainingToSell
    };
  },

  // ============================================================
  // 🔍 庫存檢查
  // ============================================================
  getAvailableShares(stock) {
    if (!stock || !Array.isArray(stock.lots)) return 0;
    return stock.lots.reduce((sum, lot) => 
      sum + (Number(lot.remaining ?? lot.shares) || 0), 0
    );
  },

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
  // 💎 融資 / 📈 期貨
  // ============================================================
  calcMarginBuy({ shares, price, marginRate = 0.6, discount = 0.28 }) {
    const subtotal = shares * price;
    const fee = this.calcFee({ amount: subtotal, discount });
    const totalCost = subtotal + fee;
    const marginLoan = totalCost * marginRate;
    const ownFund = totalCost - marginLoan;
    return {
      shares, price, subtotal, fee, tax: 0,
      total: totalCost,
      marginLoan, ownFund, marginRate,
      leverage: marginRate < 1 ? 1 / (1 - marginRate) : 0
    };
  },

  calcFuturesEntry({ contracts, entryPrice, marginPerContract = 184000, contractSize = 200, fee = 50 }) {
    const totalMargin = contracts * marginPerContract;
    const totalFee = contracts * fee;
    const notional = contracts * entryPrice * contractSize;
    return {
      contracts, entryPrice, contractSize, marginPerContract,
      totalMargin, totalFee, notional,
      leverage: totalMargin > 0 ? notional / totalMargin : 0
    };
  }
};

window.Calculator = Calculator;
console.log('[08-calculator.js] ✅ Calculator 已載入 (v3 對齊版)');

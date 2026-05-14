/* ============================================================
 * 📋 11-trade-list.js - 持股列表 / 統計卡片渲染
 * ============================================================
 * 用途：渲染持股清單、統計卡片、空狀態
 * 依賴：Utils, Stats, Store, FormModal
 * 對外：TradeList（全域變數）
 * ============================================================ */
'use strict';

const TradeList = {
  // 渲染整個現股頁面
  render(containerId = 'tab-stocks') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const stocks = Store.getStocks();
    const overview = Store.getOverview();

    container.innerHTML = `
      ${this._renderStatsCards(overview)}
      ${this._renderActionBar()}
      ${stocks.length === 0 ? this._renderEmpty() : this._renderStockList(stocks)}
    `;

    this._bindEvents(container);
  },

  // 統計卡片
  _renderStatsCards(overview) {
    const pnlColor = overview.totalPnl >= 0 ? '#10b981' : '#ef4444';
    const pnlSign = overview.totalPnl >= 0 ? '+' : '';
    return `
      <div class="stats-grid" style="
        display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px; margin-bottom: 20px;
      ">
        <div class="stat-card" style="background:#1a1f2e; border:1px solid #2d3548; border-radius:10px; padding:16px;">
          <div style="color:#9ca3af; font-size:12px; margin-bottom:6px;">📊 總市值</div>
          <div style="color:#e5e7eb; font-size:22px; font-weight:700;">
            ${Utils.fmtMoney(overview.totalAssets)}
          </div>
        </div>
        <div class="stat-card" style="background:#1a1f2e; border:1px solid #2d3548; border-radius:10px; padding:16px;">
          <div style="color:#9ca3af; font-size:12px; margin-bottom:6px;">💵 總成本</div>
          <div style="color:#e5e7eb; font-size:22px; font-weight:700;">
            ${Utils.fmtMoney(overview.totalCost)}
          </div>
        </div>
        <div class="stat-card" style="background:#1a1f2e; border:1px solid #2d3548; border-radius:10px; padding:16px;">
          <div style="color:#9ca3af; font-size:12px; margin-bottom:6px;">📈 未實現損益</div>
          <div style="color:${pnlColor}; font-size:22px; font-weight:700;">
            ${pnlSign}${Utils.fmtMoney(overview.totalPnl)}
          </div>
          <div style="color:${pnlColor}; font-size:12px; margin-top:2px;">
            ${pnlSign}${Utils.fmtPct(overview.pnlPct)}
          </div>
        </div>
        <div class="stat-card" style="background:#1a1f2e; border:1px solid #2d3548; border-radius:10px; padding:16px;">
          <div style="color:#9ca3af; font-size:12px; margin-bottom:6px;">🏆 已實現損益</div>
          <div style="color:${overview.realizedPnlAccum >= 0 ? '#10b981' : '#ef4444'}; font-size:22px; font-weight:700;">
            ${overview.realizedPnlAccum >= 0 ? '+' : ''}${Utils.fmtMoney(overview.realizedPnlAccum)}
          </div>
        </div>
      </div>
    `;
  },

  // 操作列
  _renderActionBar() {
    return `
      <div style="display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;">
        <button class="btn-buy" style="
          padding: 10px 18px; background: #10b981; color: #fff; border: none;
          border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px;
        ">🛒 買入</button>
        <button class="btn-sell" style="
          padding: 10px 18px; background: #ef4444; color: #fff; border: none;
          border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px;
        ">💰 賣出</button>
        <button class="btn-snapshot" style="
          padding: 10px 18px; background: #6366f1; color: #fff; border: none;
          border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px;
        ">📸 拍快照</button>
      </div>
    `;
  },

  // 空狀態
  _renderEmpty() {
    return `
      <div style="
        background: #1a1f2e; border: 1px dashed #2d3548; border-radius: 12px;
        padding: 60px 20px; text-align: center;
      ">
        <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
        <div style="color: #9ca3af; font-size: 16px; margin-bottom: 8px;">尚無持股</div>
        <div style="color: #6b7280; font-size: 13px;">點上方「🛒 買入」開始記錄你的第一筆交易</div>
      </div>
    `;
  },

  // 股票列表
  _renderStockList(stocks) {
    const rows = stocks.map(stock => {
      const v = Stats.calcStockValue(stock);
      if (v.totalShares <= 0) return '';
      const pnlColor = v.unrealizedPnl >= 0 ? '#10b981' : '#ef4444';
      const sign = v.unrealizedPnl >= 0 ? '+' : '';
      const flag = stock.market === 'US' ? '🇺🇸' : '🇹🇼';
      const lotsCount = stock.lots.length;

      return `
        <div class="stock-card" data-symbol="${Utils.escapeHtml(stock.symbol)}" style="
          background: #1a1f2e; border: 1px solid #2d3548; border-radius: 10px;
          padding: 16px; margin-bottom: 10px; cursor: pointer;
          transition: border-color 0.2s;
        ">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-size: 16px;">${flag}</span>
                <span style="color: #e5e7eb; font-weight: 700; font-size: 16px;">
                  ${Utils.escapeHtml(stock.symbol)}
                </span>
                <span style="color: #9ca3af; font-size: 13px;">
                  ${Utils.escapeHtml(stock.name)}
                </span>
                ${lotsCount > 1 ? `<span style="background:#2d3548; color:#9ca3af; padding:1px 6px; border-radius:3px; font-size:10px;">${lotsCount} 批</span>` : ''}
              </div>
              <div style="color: #6b7280; font-size: 12px;">
                ${Utils.fmtNum(v.totalShares)} 股 × 均價 ${Utils.fmtMoney(v.avgCost)}
                ${v.currentPrice > 0 ? ` · 現價 ${Utils.fmtMoney(v.currentPrice)}` : ' · <span style="color:#fbbf24;">待輸入現價</span>'}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="color: #e5e7eb; font-size: 16px; font-weight: 600;">
                ${Utils.fmtMoney(v.marketValue)}
              </div>
              <div style="color: ${pnlColor}; font-size: 13px; font-weight: 600; margin-top: 2px;">
                ${sign}${Utils.fmtMoney(v.unrealizedPnl)}
              </div>
              <div style="color: ${pnlColor}; font-size: 11px;">
                ${sign}${Utils.fmtPct(v.pnlPct)}
              </div>
            </div>
          </div>
          <div class="stock-actions" style="
            display: flex; gap: 6px; margin-top: 12px; padding-top: 12px;
            border-top: 1px solid #2d3548;
          ">
            <button class="btn-add-buy" data-symbol="${Utils.escapeHtml(stock.symbol)}"
              style="flex:1; padding:6px; background:#10b981; color:#fff; border:none; border-radius:4px; font-size:12px; cursor:pointer;">
              ➕ 加碼
            </button>
            <button class="btn-do-sell" data-symbol="${Utils.escapeHtml(stock.symbol)}"
              style="flex:1; padding:6px; background:#ef4444; color:#fff; border:none; border-radius:4px; font-size:12px; cursor:pointer;">
              ➖ 賣出
            </button>
            <button class="btn-set-price" data-symbol="${Utils.escapeHtml(stock.symbol)}"
              style="flex:1; padding:6px; background:#6366f1; color:#fff; border:none; border-radius:4px; font-size:12px; cursor:pointer;">
              💲 改價
            </button>
          </div>
        </div>
      `;
    }).join('');

    return `<div class="stock-list">${rows}</div>`;
  },

  // 綁定事件
  _bindEvents(container) {
    container.querySelector('.btn-buy')?.addEventListener('click', () => {
      FormModal.open({ action: 'buy', category: 'stock' });
    });
    container.querySelector('.btn-sell')?.addEventListener('click', () => {
      FormModal.open({ action: 'sell', category: 'stock' });
    });
    container.querySelector('.btn-snapshot')?.addEventListener('click', () => {
      Store.dispatch({ type: 'SNAPSHOT_TAKE' });
      this._toast('📸 已記錄今日快照');
    });

    // 加碼 / 賣出 / 改價
    container.querySelectorAll('.btn-add-buy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const symbol = btn.dataset.symbol;
        const stock = Store.getStockBySymbol(symbol);
        FormModal.open({ action: 'buy', category: 'stock', prefill: { symbol, name: stock?.name } });
      });
    });
    container.querySelectorAll('.btn-do-sell').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const symbol = btn.dataset.symbol;
        const stock = Store.getStockBySymbol(symbol);
        FormModal.open({ action: 'sell', category: 'stock', prefill: { symbol, name: stock?.name } });
      });
    });
    container.querySelectorAll('.btn-set-price').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const symbol = btn.dataset.symbol;
        const stock = Store.getStockBySymbol(symbol);
        const cur = stock?.currentPrice || 0;
        const input = prompt(`請輸入 ${symbol} ${stock?.name || ''} 的現價：`, cur || '');
        if (input === null) return;
        const price = Number(input);
        if (!price || price <= 0) { alert('⚠️ 價格無效'); return; }
        Store.dispatch({ type: 'STOCK_UPDATE_PRICE', payload: { symbol, price } });
        this._toast(`✅ ${symbol} 現價已更新為 ${Utils.fmtMoney(price)}`);
      });
    });
  },

  // Toast
  _toast(msg, color = '#10b981') {
    const t = document.createElement('div');
    t.style.cssText = `
      position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
      background: ${color}; color: #fff; padding: 10px 20px;
      border-radius: 8px; font-weight: 600; z-index: 10001;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    `;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity 0.3s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 300);
    }, 2000);
  }
};

window.TradeList = TradeList;
console.log('[11-trade-list.js] ✅ TradeList 已載入');

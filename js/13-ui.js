/* ============================================================
 * 13-ui.js — UI 渲染（自動相容版）
 * ============================================================ */
'use strict';

const UI = {
  currentTab: 'holdings',

  // ========== 萬用：取得 portfolio ==========
  _getPortfolio() {
    // 嘗試各種可能的 API
    if (typeof Store === 'undefined') return this._emptyPortfolio();

    try {
      if (typeof Store.getState === 'function') {
        const s = Store.getState();
        return s.portfolio || s;
      }
      if (typeof Store.get === 'function') {
        return Store.get('portfolio') || Store.get();
      }
      if (Store.state) {
        return Store.state.portfolio || Store.state;
      }
      if (Store.portfolio) {
        return Store.portfolio;
      }
      // 最後嘗試直接讀 localStorage
      const raw = localStorage.getItem('portfolio_v2') || localStorage.getItem('portfolio');
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('[UI] 取得 portfolio 失敗:', e);
    }
    return this._emptyPortfolio();
  },

  _emptyPortfolio() {
    return { holdings: {}, trades: [], snapshots: [] };
  },

  // ========== 萬用：寫入 portfolio ==========
  _setPortfolio(portfolio) {
    try {
      if (typeof Store === 'undefined') return;
      if (typeof Store.setState === 'function') {
        Store.setState({ portfolio });
      } else if (typeof Store.set === 'function') {
        Store.set('portfolio', portfolio);
      } else if (Store.state) {
        Store.state.portfolio = portfolio;
      } else {
        Store.portfolio = portfolio;
      }
      // 同步存本地
      if (typeof Storage !== 'undefined' && Storage.saveLocal) {
        Storage.saveLocal(portfolio);
      }
    } catch (e) {
      console.warn('[UI] 寫入 portfolio 失敗:', e);
    }
  },

  // ========== 萬用：訂閱變化 ==========
  _subscribe(cb) {
    try {
      if (typeof Store !== 'undefined' && typeof Store.subscribe === 'function') {
        Store.subscribe(cb);
      } else if (typeof Store !== 'undefined' && typeof Store.on === 'function') {
        Store.on('change', cb);
      }
    } catch (e) {
      console.warn('[UI] 訂閱失敗:', e);
    }
  },

  // ========== 啟動 ==========
  init() {
    this._bindTabs();
    this._bindActions();
    this._subscribe(() => {
      this.renderCurrent();
      this.renderSyncBadge();
    });
    this.renderAll();
    console.log('[UI] ✅ 已啟動');
  },

  _bindTabs() {
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tab}`);
    });
    this.renderCurrent();
  },

  _bindActions() {
    const $ = id => document.getElementById(id);
    $('btnBuy')?.addEventListener('click', () => this.openBuyModal());
    $('btnBuy2')?.addEventListener('click', () => this.openBuyModal());
    $('btnSell')?.addEventListener('click', () => this.openSellModal());
    $('btnSell2')?.addEventListener('click', () => this.openSellModal());
    $('btnSnapshot')?.addEventListener('click', () => this.takeSnapshot());
    $('btnUpdatePrice')?.addEventListener('click', () => this.openUpdatePriceModal());
  },

  renderAll() {
    this.renderSyncBadge();
    this.renderCurrent();
  },

  renderCurrent() {
    try {
      if (this.currentTab === 'holdings') this.renderHoldings();
      else if (this.currentTab === 'trades') this.renderTrades();
      else if (this.currentTab === 'stats') this.renderStats();
      else if (this.currentTab === 'settings') this.renderSettings();
    } catch (e) {
      console.error('[UI] 渲染失敗:', e);
    }
  },

  // ========== 同步狀態 ==========
  renderSyncBadge() {
    const badge = document.getElementById('syncBadge');
    if (!badge) return;
    const hasToken = (typeof Storage !== 'undefined' && Storage.getToken) ? Storage.getToken() : '';
    const hasGist = (typeof Storage !== 'undefined' && Storage.getGistId) ? Storage.getGistId() : '';
    if (hasToken && hasGist) {
      badge.className = 'sync-badge online';
      badge.textContent = '☁️ 雲端';
    } else if (hasGist && !hasToken) {
      badge.className = 'sync-badge error';
      badge.textContent = '⚠️ 需 Token';
    } else {
      badge.className = 'sync-badge offline';
      badge.textContent = '💾 本地';
    }
  },

  // ========== 計算統計（萬用版） ==========
  _calcStats(portfolio) {
    try {
      if (typeof Stats !== 'undefined' && Stats.calculatePortfolioStats) {
        return Stats.calculatePortfolioStats(portfolio);
      }
    } catch (e) {}
    // 自己算
    const holdings = portfolio.holdings || {};
    let totalValue = 0, totalCost = 0;
    Object.values(holdings).forEach(h => {
      if (!h || h.shares <= 0) return;
      const cost = (h.shares || 0) * (h.avgCost || 0);
      const value = (h.shares || 0) * (h.currentPrice || h.avgCost || 0);
      totalCost += cost;
      totalValue += value;
    });
    const unrealizedPL = totalValue - totalCost;
    const unrealizedPLPct = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;
    const realizedPL = portfolio.realizedPL || 0;
    return { totalValue, totalCost, unrealizedPL, unrealizedPLPct, realizedPL };
  },

  // ========== 持股 ==========
  renderHoldings() {
    const portfolio = this._getPortfolio();
    const stats = this._calcStats(portfolio);

    const grid = document.getElementById('statGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="stat-card">
          <div class="stat-label">總市值</div>
          <div class="stat-value">${this._fmt(stats.totalValue)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">總成本</div>
          <div class="stat-value">${this._fmt(stats.totalCost)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">未實現損益</div>
          <div class="stat-value ${stats.unrealizedPL >= 0 ? 'up' : 'down'}">
            ${stats.unrealizedPL >= 0 ? '+' : ''}${this._fmt(stats.unrealizedPL)}
          </div>
          <div class="stat-sub ${stats.unrealizedPLPct >= 0 ? 'up' : 'down'}">
            ${stats.unrealizedPLPct >= 0 ? '+' : ''}${(stats.unrealizedPLPct || 0).toFixed(2)}%
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">已實現損益</div>
          <div class="stat-value ${stats.realizedPL >= 0 ? 'up' : 'down'}">
            ${stats.realizedPL >= 0 ? '+' : ''}${this._fmt(stats.realizedPL)}
          </div>
        </div>
      `;
    }

    const list = document.getElementById('holdingsList');
    if (!list) return;

    const holdings = portfolio.holdings || {};
    const tickers = Object.keys(holdings).filter(t => holdings[t] && holdings[t].shares > 0);

    if (tickers.length === 0) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📭</div>
          <div class="empty-text">尚無持股</div>
          <div class="empty-hint">點擊「🛒 買入」開始建立投資組合</div>
        </div>`;
      return;
    }

    let rows = '';
    tickers.forEach(ticker => {
      const h = holdings[ticker];
      const stock = (typeof StockDB !== 'undefined' && StockDB.getStock) ? StockDB.getStock(ticker) : null;
      const name = stock ? stock.name : '';
      const shares = h.shares || 0;
      const avgCost = h.avgCost || 0;
      const curPrice = h.currentPrice || avgCost;
      const cost = shares * avgCost;
      const value = shares * curPrice;
      const pl = value - cost;
      const plPct = cost > 0 ? (pl / cost) * 100 : 0;

      rows += `
        <tr>
          <td class="ticker-cell">${ticker}<span class="ticker-name">${name}</span></td>
          <td class="num">${this._fmt(shares)}</td>
          <td class="num">${avgCost.toFixed(2)}</td>
          <td class="num">${curPrice.toFixed(2)}</td>
          <td class="num">${this._fmt(cost)}</td>
          <td class="num">${this._fmt(value)}</td>
          <td class="num ${pl >= 0 ? 'up' : 'down'}">${pl >= 0 ? '+' : ''}${this._fmt(pl)}</td>
          <td class="num ${plPct >= 0 ? 'up' : 'down'}">${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%</td>
          <td><button class="btn btn-warning btn-sm" onclick="UI.openUpdatePriceModal('${ticker}')">💲</button></td>
        </tr>`;
    });

    list.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>股票</th><th>持股</th><th>均價</th><th>現價</th>
              <th>成本</th><th>市值</th><th>損益</th><th>%</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // ========== 交易 ==========
  renderTrades() {
    const portfolio = this._getPortfolio();
    const trades = portfolio.trades || [];
    const list = document.getElementById('tradesList');
    if (!list) return;

    if (trades.length === 0) {
      list.innerHTML = `<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">尚無交易紀錄</div></div>`;
      return;
    }

    const sorted = [...trades].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    let rows = '';
    sorted.forEach(t => {
      const stock = (typeof StockDB !== 'undefined' && StockDB.getStock) ? StockDB.getStock(t.ticker) : null;
      const name = stock ? stock.name : '';
      const isBuy = t.type === 'buy';
      rows += `
        <tr>
          <td>${t.date || '-'}</td>
          <td><span class="${isBuy ? 'up' : 'down'}">${isBuy ? '買入' : '賣出'}</span></td>
          <td class="ticker-cell">${t.ticker || '-'}<span class="ticker-name">${name}</span></td>
          <td class="num">${this._fmt(t.shares || 0)}</td>
          <td class="num">${(t.price || 0).toFixed(2)}</td>
          <td class="num">${this._fmt(t.fee || 0)}</td>
          <td class="num">${this._fmt((t.shares || 0) * (t.price || 0) + (t.fee || 0))}</td>
          <td>${t.note || ''}</td>
        </tr>`;
    });

    list.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>日期</th><th>類型</th><th>股票</th><th>股數</th>
            <th>價格</th><th>費用</th><th>金額</th><th>備註</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // ========== 統計 ==========
  renderStats() {
    const portfolio = this._getPortfolio();
    const stats = this._calcStats(portfolio);
    const snapshots = portfolio.snapshots || [];
    const trades = portfolio.trades || [];
    const el = document.getElementById('statsContent');
    if (!el) return;

    el.innerHTML = `
      <div class="section">
        <div class="section-title">📊 投資組合總覽</div>
        <div class="kv-row"><span class="kv-key">總市值</span><span class="kv-val">${this._fmt(stats.totalValue)}</span></div>
        <div class="kv-row"><span class="kv-key">總成本</span><span class="kv-val">${this._fmt(stats.totalCost)}</span></div>
        <div class="kv-row"><span class="kv-key">未實現損益</span><span class="kv-val ${stats.unrealizedPL >= 0 ? 'up' : 'down'}">${this._fmt(stats.unrealizedPL)}</span></div>
        <div class="kv-row"><span class="kv-key">已實現損益</span><span class="kv-val ${stats.realizedPL >= 0 ? 'up' : 'down'}">${this._fmt(stats.realizedPL)}</span></div>
        <div class="kv-row"><span class="kv-key">總損益</span><span class="kv-val ${(stats.unrealizedPL + stats.realizedPL) >= 0 ? 'up' : 'down'}">${this._fmt(stats.unrealizedPL + stats.realizedPL)}</span></div>
      </div>
      <div class="section">
        <div class="section-title">📈 交易統計</div>
        <div class="kv-row"><span class="kv-key">總交易筆數</span><span class="kv-val">${trades.length}</span></div>
        <div class="kv-row"><span class="kv-key">買入筆數</span><span class="kv-val">${trades.filter(t => t.type === 'buy').length}</span></div>
        <div class="kv-row"><span class="kv-key">賣出筆數</span><span class="kv-val">${trades.filter(t => t.type === 'sell').length}</span></div>
        <div class="kv-row"><span class="kv-key">快照數量</span><span class="kv-val">${snapshots.length}</span></div>
      </div>
    `;
  },

  // ========== 設定 ==========
  renderSettings() {
    const token = (typeof Storage !== 'undefined' && Storage.getToken) ? (Storage.getToken() || '') : '';
    const gistId = (typeof Storage !== 'undefined' && Storage.getGistId) ? (Storage.getGistId() || '') : '';
    const tokenMask = token ? token.substring(0, 8) + '...' + token.substring(token.length - 4) : '（未設定）';
    const lastSync = (typeof Storage !== 'undefined' && Storage.getLastSync) ? (Storage.getLastSync() || '從未') : '從未';
    const stockCount = (typeof StockDB !== 'undefined' && StockDB.stocks) ? Object.keys(StockDB.stocks).length : 0;
    const ver = (typeof CONFIG !== 'undefined' && CONFIG.VERSION) ? CONFIG.VERSION : '?';

    const el = document.getElementById('settingsContent');
    if (!el) return;

    el.innerHTML = `
      <div class="section">
        <div class="section-title">☁️ 雲端同步設定</div>
        <div class="section-desc">
          使用 GitHub Gist 雲端同步資料。需要產生 Personal Access Token（只需 gist 權限）。<br>
          產 Token： <a href="https://github.com/settings/tokens/new" target="_blank">https://github.com/settings/tokens/new</a>
        </div>
        <div class="form-group">
          <label class="form-label">GitHub Token（目前：${tokenMask}）</label>
          <input class="form-input" type="password" id="inpToken" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
        </div>
        <div class="form-group">
          <label class="form-label">Gist ID</label>
          <input class="form-input" type="text" id="inpGistId" value="${gistId}" placeholder="留空會自動建立">
        </div>
        <div class="action-bar">
          <button class="btn btn-primary" onclick="UI.saveCloudSettings()">💾 儲存設定</button>
          <button class="btn btn-success" onclick="UI.testSync()">☁️ 立即同步（拉取）</button>
          <button class="btn btn-warning" onclick="UI.pushSync()">📤 立即推送</button>
        </div>
      </div>
      <div class="section">
        <div class="section-title">📦 資料管理</div>
        <div class="action-bar">
          <button class="btn btn-secondary" onclick="UI.exportJSON()">📥 匯出 JSON</button>
          <button class="btn btn-secondary" onclick="UI.importJSON()">📤 匯入 JSON</button>
          <button class="btn btn-danger" onclick="UI.clearAll()">🗑️ 清空所有資料</button>
        </div>
      </div>
      <div class="section">
        <div class="section-title">ℹ️ 系統資訊</div>
        <div class="kv-row"><span class="kv-key">版本</span><span class="kv-val">${ver}</span></div>
        <div class="kv-row"><span class="kv-key">股票資料庫筆數</span><span class="kv-val">${stockCount}</span></div>
        <div class="kv-row"><span class="kv-key">最後同步時間</span><span class="kv-val">${lastSync}</span></div>
      </div>
    `;
  },

  // ========== 設定動作 ==========
  saveCloudSettings() {
    const tokenInput = document.getElementById('inpToken').value.trim();
    const gistIdInput = document.getElementById('inpGistId').value.trim();
    if (tokenInput && Storage.setToken) Storage.setToken(tokenInput);
    if (gistIdInput && Storage.setGistId) Storage.setGistId(gistIdInput);
    this.toast('✅ 已儲存設定', 'success');
    this.renderSyncBadge();
    this.renderSettings();
  },

  async testSync() {
    try {
      this.toast('☁️ 正在從雲端拉取...', 'success');
      const data = await Storage.loadFromGist();
      if (data) {
        this._setPortfolio(data);
        this.toast('✅ 同步成功！', 'success');
        this.renderAll();
      }
    } catch (e) {
      this.toast('❌ 失敗：' + e.message, 'error');
    }
  },

  async pushSync() {
    try {
      this.toast('📤 正在推送...', 'success');
      const portfolio = this._getPortfolio();
      await Storage.saveToGist(portfolio);
      this.toast('✅ 推送成功！', 'success');
      this.renderSyncBadge();
    } catch (e) {
      this.toast('❌ 失敗：' + e.message, 'error');
    }
  },

  exportJSON() {
    const data = this._getPortfolio();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast('📥 已匯出', 'success');
  },

  importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!confirm('⚠️ 將覆蓋目前資料，確定匯入？')) return;
        this._setPortfolio(data);
        this.toast('✅ 匯入完成', 'success');
        this.renderAll();
      } catch (err) {
        this.toast('❌ 解析失敗：' + err.message, 'error');
      }
    };
    input.click();
  },

  clearAll() {
    if (!confirm('⚠️ 確定要清空所有資料嗎？')) return;
    if (!confirm('⚠️ 真的要清空？再確認！')) return;
    localStorage.clear();
    location.reload();
  },

  // ========== 交易動作 ==========
  openBuyModal() { this._tradeModal('buy'); },
  openSellModal() { this._tradeModal('sell'); },

  _tradeModal(type) {
    const isBuy = type === 'buy';
    const html = `
      <div class="modal-mask" id="tradeModal">
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">${isBuy ? '🛒 買入' : '💰 賣出'}</div>
            <button class="modal-close" onclick="document.getElementById('tradeModal').remove()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">股票代號</label>
              <input class="form-input" id="m_ticker" placeholder="例如：2330">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">股數</label>
                <input class="form-input" type="number" id="m_shares" placeholder="1000">
              </div>
              <div class="form-group">
                <label class="form-label">價格</label>
                <input class="form-input" type="number" step="0.01" id="m_price" placeholder="580">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">手續費</label>
                <input class="form-input" type="number" id="m_fee" value="0">
              </div>
              <div class="form-group">
                <label class="form-label">日期</label>
                <input class="form-input" type="date" id="m_date" value="${new Date().toISOString().slice(0,10)}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">備註</label>
              <input class="form-input" id="m_note" placeholder="可選">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('tradeModal').remove()">取消</button>
            <button class="btn ${isBuy ? 'btn-success' : 'btn-danger'}" onclick="UI._submitTradeModal('${type}')">${isBuy ? '✅ 確認買入' : '✅ 確認賣出'}</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  _submitTradeModal(type) {
    const $v = id => document.getElementById(id).value.trim();
    const data = {
      ticker: $v('m_ticker').toUpperCase(),
      shares: parseFloat($v('m_shares')),
      price: parseFloat($v('m_price')),
      fee: parseFloat($v('m_fee')) || 0,
      date: $v('m_date'),
      note: $v('m_note'),
      type: type,
      id: (typeof Utils !== 'undefined' && Utils.uuid) ? Utils.uuid() : Date.now().toString()
    };

    if (!data.ticker || !data.shares || !data.price) {
      this.toast('❌ 請填寫必填欄位', 'error');
      return;
    }

    document.getElementById('tradeModal').remove();
    this._applyTrade(data);
  },

  _applyTrade(trade) {
    try {
      const portfolio = this._getPortfolio();
      portfolio.holdings = portfolio.holdings || {};
      portfolio.trades = portfolio.trades || [];

      // 嘗試用 Calculator
      if (typeof Calculator !== 'undefined' && Calculator.applyTrade) {
        Calculator.applyTrade(portfolio, trade);
      } else {
        // 自己手算
        this._manualApplyTrade(portfolio, trade);
      }

      portfolio.trades.push(trade);
      this._setPortfolio(portfolio);
      this.toast(`✅ ${trade.type === 'buy' ? '買入' : '賣出'}成功`, 'success');
      this.renderAll();
    } catch (e) {
      this.toast('❌ ' + e.message, 'error');
      console.error(e);
    }
  },

  _manualApplyTrade(portfolio, trade) {
    const t = trade.ticker;
    portfolio.holdings[t] = portfolio.holdings[t] || { shares: 0, avgCost: 0, currentPrice: 0 };
    const h = portfolio.holdings[t];
    if (trade.type === 'buy') {
      const oldCost = h.shares * h.avgCost;
      const newCost = trade.shares * trade.price + (trade.fee || 0);
      h.shares += trade.shares;
      h.avgCost = h.shares > 0 ? (oldCost + newCost) / h.shares : 0;
      h.currentPrice = trade.price;
    } else {
      // sell
      const realized = (trade.price - h.avgCost) * trade.shares - (trade.fee || 0);
      portfolio.realizedPL = (portfolio.realizedPL || 0) + realized;
      h.shares -= trade.shares;
      h.currentPrice = trade.price;
      if (h.shares <= 0) {
        h.shares = 0;
        h.avgCost = 0;
      }
    }
  },

  takeSnapshot() {
    try {
      const portfolio = this._getPortfolio();
      const stats = this._calcStats(portfolio);
      portfolio.snapshots = portfolio.snapshots || [];
      portfolio.snapshots.push({
        id: (typeof Utils !== 'undefined' && Utils.uuid) ? Utils.uuid() : Date.now().toString(),
        date: new Date().toISOString(),
        totalValue: stats.totalValue,
        totalCost: stats.totalCost,
        unrealizedPL: stats.unrealizedPL,
        realizedPL: stats.realizedPL
      });
      this._setPortfolio(portfolio);
      this.toast('📸 快照已儲存', 'success');
      this.renderStats();
    } catch (e) {
      this.toast('❌ ' + e.message, 'error');
    }
  },

  openUpdatePriceModal(ticker) {
    const portfolio = this._getPortfolio();
    const holdings = portfolio.holdings || {};
    if (!ticker) {
      const list = Object.keys(holdings).filter(t => holdings[t].shares > 0);
      if (list.length === 0) { this.toast('⚠️ 尚無持股', 'warning'); return; }
      ticker = list[0];
    }
    const cur = holdings[ticker]?.currentPrice || holdings[ticker]?.avgCost || 0;
    const newPrice = prompt(`輸入 ${ticker} 的最新價格：`, cur);
    if (newPrice === null) return;
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) { this.toast('❌ 價格無效', 'error'); return; }
    holdings[ticker].currentPrice = price;
    this._setPortfolio(portfolio);
    this.toast(`✅ ${ticker} 已更新為 ${price}`, 'success');
    this.renderHoldings();
  },

  // ========== Toast ==========
  toast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  },

  _fmt(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return Math.round(n).toLocaleString('zh-TW');
  }
};

window.UI = UI;
console.log('[13-ui.js] ✅ UI 已載入（萬用相容版）');

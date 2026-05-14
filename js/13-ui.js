/* ============================================================
 * 13-ui.js — UI 渲染（v3 對齊 Store 陣列架構）
 * ============================================================
 * 依賴：CONFIG, Store, Storage, Stats, Calculator, PriceFetcher,
 *       StockDB, Utils
 * ============================================================ */
'use strict';

const UI = {
  currentTab: 'holdings',
  _lastRefreshTime: null,
  _refreshing: false,

  // ============================================================
  // 啟動
  // ============================================================
  init() {
    this._bindTabs();
    this._bindActions();

    // 訂閱 Store 變化
    if (typeof Store !== 'undefined' && Store.subscribe) {
      Store.subscribe(() => {
        this.renderCurrent();
        this.renderSyncBadge();
      });
    }

    this.renderAll();

    // 每 30 秒重繪一次（讓「3 秒前」相對時間更新）
    setInterval(() => {
      if (this.currentTab === 'holdings') this.renderHoldings();
    }, 30000);

    console.log('[UI] ✅ 已啟動 (v3)');
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
    $('btnUpdatePrice')?.addEventListener('click', () => this.refreshAllPrices());
  },

  // ============================================================
  // 渲染分發
  // ============================================================
  renderAll() {
    this.renderSyncBadge();
    this.renderCurrent();
  },

  renderCurrent() {
    try {
      switch (this.currentTab) {
        case 'holdings': this.renderHoldings(); break;
        case 'trades':   this.renderTrades();   break;
        case 'stats':    this.renderStats();    break;
        case 'settings': this.renderSettings(); break;
      }
    } catch (e) {
      console.error('[UI] 渲染失敗:', e);
    }
  },

  // ============================================================
  // 同步狀態徽章
  // ============================================================
  renderSyncBadge() {
    const badge = document.getElementById('syncBadge');
    if (!badge) return;
    const hasToken = Storage.getToken();
    const hasGist = Storage.getGistId();

    if (Store.state.syncing) {
      badge.className = 'sync-badge';
      badge.textContent = '🔄 同步中...';
      return;
    }

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

  // ============================================================
  // 持股 Tab
  // ============================================================
  renderHoldings() {
    const portfolio = Store.getPortfolio();
    if (!portfolio) return;

    // ----- 統計卡片 -----
    const stocks = Store.getStocks();
    const stats = this._calcStockStats(stocks);

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

    // ----- 持股列表 -----
    const list = document.getElementById('holdingsList');
    if (!list) return;

    if (stocks.length === 0) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📭</div>
          <div class="empty-text">尚無持股</div>
          <div class="empty-hint">點擊「🛒 買入」開始建立投資組合</div>
        </div>`;
      return;
    }

    let rows = '';
    stocks.forEach(s => {
      const totalShares = (s.lots || []).reduce((sum, l) => sum + (l.remaining ?? l.shares ?? 0), 0);
      if (totalShares <= 0) return;

      // 加權平均成本（含手續費）
      let totalCost = 0;
      (s.lots || []).forEach(l => {
        const sh = l.remaining ?? l.shares ?? 0;
        const ec = l.effectiveCost ?? l.price ?? 0;
        totalCost += sh * ec;
      });
      const avgCost = totalShares > 0 ? totalCost / totalShares : 0;
      const curPrice = s.currentPrice || avgCost;
      const value = totalShares * curPrice;
      const pl = value - totalCost;
      const plPct = totalCost > 0 ? (pl / totalCost) * 100 : 0;

      // 報價時間
      const priceTimeStr = s.lastPriceUpdate 
        ? this._timeAgo(s.lastPriceUpdate)
        : '<span class="muted">未更新</span>';

      // 漲跌符號
      const priceClass = pl > 0 ? 'up' : pl < 0 ? 'down' : '';
      const priceArrow = pl > 0 ? '▲' : pl < 0 ? '▼' : '─';

      rows += `
        <tr>
          <td class="ticker-cell">
            <strong>${s.symbol}</strong>
            <span class="ticker-name">${s.name || ''}</span>
          </td>
          <td class="num">${this._fmt(totalShares)}</td>
          <td class="num">${avgCost.toFixed(2)}</td>
          <td class="num ${priceClass}">
            ${priceArrow} ${curPrice.toFixed(2)}
            <div class="muted small">${priceTimeStr}</div>
          </td>
          <td class="num">${this._fmt(totalCost)}</td>
          <td class="num">${this._fmt(value)}</td>
          <td class="num ${pl >= 0 ? 'up' : 'down'}">
            ${pl >= 0 ? '+' : ''}${this._fmt(pl)}
          </td>
          <td class="num ${plPct >= 0 ? 'up' : 'down'}">
            ${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%
          </td>
          <td>
            <button class="btn btn-warning btn-sm" 
                    onclick="UI.refreshOnePrice('${s.symbol}','${s.market || 'TW'}')"
                    title="抓即時報價">🔄</button>
            <button class="btn btn-secondary btn-sm" 
                    onclick="UI.openManualPriceModal('${s.symbol}')"
                    title="手動輸入">✏️</button>
          </td>
        </tr>`;
    });

    // 末次刷新時間提示
    const refreshHint = this._lastRefreshTime 
      ? `<div class="muted small" style="text-align:right;padding:4px 8px">
           最後抓取：${this._timeAgo(this._lastRefreshTime)}
         </div>`
      : '';

    list.innerHTML = `
      ${refreshHint}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>股票</th><th>持股</th><th>均價</th><th>現價</th>
              <th>成本</th><th>市值</th><th>損益</th><th>%</th><th>操作</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // ============================================================
  // 即時報價：刷新單檔
  // ============================================================
  async refreshOnePrice(symbol, market = 'TW') {
    if (typeof PriceFetcher === 'undefined') {
      this.toast('❌ PriceFetcher 未載入', 'error');
      return;
    }
    try {
      this.toast(`🔄 抓取 ${symbol}...`, 'success');
      const r = await PriceFetcher.fetchOne(symbol, market, { useCache: false });
      Store.dispatch({
        type: 'STOCK_UPDATE_PRICE',
        payload: { symbol, price: r.price }
      });
      this.toast(`✅ ${symbol}: ${r.price.toFixed(2)}`, 'success');
    } catch (e) {
      this.toast(`❌ ${symbol}: ${e.message}`, 'error');
    }
  },

  // ============================================================
  // 即時報價：刷新全部
  // ============================================================
  async refreshAllPrices() {
    if (this._refreshing) return;
    if (typeof PriceFetcher === 'undefined') {
      this.toast('❌ PriceFetcher 未載入', 'error');
      return;
    }

    const stocks = Store.getStocks();
    if (stocks.length === 0) {
      this.toast('⚠️ 無持股可更新', 'warning');
      return;
    }

    this._refreshing = true;
    this.toast(`🔄 抓取 ${stocks.length} 檔報價中...`, 'success');

    try {
      const r = await PriceFetcher.refreshAll();
      this._lastRefreshTime = new Date().toISOString();
      this.toast(`✅ 完成：${r.updated} 成功 / ${r.failed} 失敗`, 'success');
    } catch (e) {
      this.toast('❌ 刷新失敗：' + e.message, 'error');
    } finally {
      this._refreshing = false;
    }
  },

  // ============================================================
  // 手動輸入價格
  // ============================================================
  openManualPriceModal(symbol) {
    const stock = Store.getStockBySymbol(symbol);
    if (!stock) return;
    const cur = stock.currentPrice || 0;
    const newPrice = prompt(`手動輸入 ${symbol} 的價格：`, cur);
    if (newPrice === null) return;
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) {
      this.toast('❌ 價格無效', 'error');
      return;
    }
    Store.dispatch({
      type: 'STOCK_UPDATE_PRICE',
      payload: { symbol, price }
    });
    this.toast(`✅ ${symbol} → ${price}`, 'success');
  },

  // ============================================================
  // 統計：個股總覽
  // ============================================================
  _calcStockStats(stocks) {
    let totalValue = 0, totalCost = 0, realizedPL = 0;
    stocks.forEach(s => {
      let stockShares = 0, stockCost = 0;
      (s.lots || []).forEach(l => {
        const sh = l.remaining ?? l.shares ?? 0;
        const ec = l.effectiveCost ?? l.price ?? 0;
        stockShares += sh;
        stockCost += sh * ec;
      });
      totalCost += stockCost;
      totalValue += stockShares * (s.currentPrice || 0);
      realizedPL += s.realizedPnl || 0;
    });
    const unrealizedPL = totalValue - totalCost;
    const unrealizedPLPct = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;
    return { totalValue, totalCost, unrealizedPL, unrealizedPLPct, realizedPL };
  },

  // ============================================================
  // 交易紀錄 Tab
  // ============================================================
  renderTrades() {
    const history = Store.getHistory();
    const txs = (history?.transactions) || [];
    const list = document.getElementById('tradesList');
    if (!list) return;

    if (txs.length === 0) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📋</div>
          <div class="empty-text">尚無交易紀錄</div>
        </div>`;
      return;
    }

    const sorted = [...txs].sort((a, b) => 
      (b.timestamp || '').localeCompare(a.timestamp || '')
    );
    let rows = '';
    sorted.forEach(t => {
      const isBuy = t.action === 'BUY';
      const date = (t.timestamp || '').slice(0, 10);
      const total = (t.shares || 0) * (t.price || 0);
      rows += `
        <tr>
          <td>${date}</td>
          <td><span class="${isBuy ? 'up' : 'down'}">${isBuy ? '買入' : '賣出'}</span></td>
          <td class="ticker-cell">
            <strong>${t.symbol || '-'}</strong>
            <span class="ticker-name">${t.name || ''}</span>
          </td>
          <td class="num">${this._fmt(t.shares || 0)}</td>
          <td class="num">${(t.price || 0).toFixed(2)}</td>
          <td class="num">${this._fmt(t.fee || 0)}</td>
          <td class="num">${this._fmt(total)}</td>
          <td class="num ${(t.realizedPnl || 0) >= 0 ? 'up' : 'down'}">
            ${t.realizedPnl != null ? (t.realizedPnl >= 0 ? '+' : '') + this._fmt(t.realizedPnl) : '-'}
          </td>
          <td>${t.note || ''}</td>
        </tr>`;
    });

    list.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th><th>類型</th><th>股票</th><th>股數</th>
              <th>價格</th><th>費用</th><th>金額</th><th>已實現</th><th>備註</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // ============================================================
  // 統計 Tab
  // ============================================================
  renderStats() {
    const portfolio = Store.getPortfolio();
    const history = Store.getHistory();
    const stocks = Store.getStocks();
    const stats = this._calcStockStats(stocks);
    const txs = history?.transactions || [];
    const snapshots = history?.snapshots || [];

    const el = document.getElementById('statsContent');
    if (!el) return;

    const totalPL = stats.unrealizedPL + stats.realizedPL;

    el.innerHTML = `
      <div class="section">
        <div class="section-title">📊 投資組合總覽</div>
        <div class="kv-row"><span class="kv-key">總市值</span>
          <span class="kv-val">${this._fmt(stats.totalValue)}</span></div>
        <div class="kv-row"><span class="kv-key">總成本</span>
          <span class="kv-val">${this._fmt(stats.totalCost)}</span></div>
        <div class="kv-row"><span class="kv-key">未實現損益</span>
          <span class="kv-val ${stats.unrealizedPL >= 0 ? 'up' : 'down'}">
            ${this._fmt(stats.unrealizedPL)}</span></div>
        <div class="kv-row"><span class="kv-key">已實現損益</span>
          <span class="kv-val ${stats.realizedPL >= 0 ? 'up' : 'down'}">
            ${this._fmt(stats.realizedPL)}</span></div>
        <div class="kv-row"><span class="kv-key">總損益</span>
          <span class="kv-val ${totalPL >= 0 ? 'up' : 'down'}">
            ${this._fmt(totalPL)}</span></div>
      </div>
      <div class="section">
        <div class="section-title">📈 交易統計</div>
        <div class="kv-row"><span class="kv-key">總交易筆數</span>
          <span class="kv-val">${txs.length}</span></div>
        <div class="kv-row"><span class="kv-key">買入筆數</span>
          <span class="kv-val">${txs.filter(t => t.action === 'BUY').length}</span></div>
        <div class="kv-row"><span class="kv-key">賣出筆數</span>
          <span class="kv-val">${txs.filter(t => t.action === 'SELL').length}</span></div>
        <div class="kv-row"><span class="kv-key">快照數量</span>
          <span class="kv-val">${snapshots.length}</span></div>
      </div>
    `;
  },

  // ============================================================
  // 設定 Tab
  // ============================================================
  renderSettings() {
    const token = Storage.getToken() || '';
    const gistId = Storage.getGistId() || '';
    const tokenMask = token 
      ? token.substring(0, 8) + '...' + token.substring(token.length - 4) 
      : '（未設定）';
    const lastSync = Storage.getLastSync() || '從未';
    const stockCount = (typeof StockDB !== 'undefined' && StockDB.stocks) 
      ? Object.keys(StockDB.stocks).length : 0;
    const ver = CONFIG.VERSION || '?';

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
        <div class="kv-row"><span class="kv-key">版本</span>
          <span class="kv-val">${ver}</span></div>
        <div class="kv-row"><span class="kv-key">股票資料庫筆數</span>
          <span class="kv-val">${stockCount}</span></div>
        <div class="kv-row"><span class="kv-key">最後同步時間</span>
          <span class="kv-val">${lastSync}</span></div>
      </div>
    `;
  },

  // ============================================================
  // 設定動作
  // ============================================================
  saveCloudSettings() {
    const token = document.getElementById('inpToken').value.trim();
    const gistId = document.getElementById('inpGistId').value.trim();
    if (token) Storage.setToken(token);
    if (gistId) Storage.setGistId(gistId);
    this.toast('✅ 已儲存設定', 'success');
    this.renderSyncBadge();
    this.renderSettings();
  },

  async testSync() {
    try {
      this.toast('☁️ 雲端拉取中...', 'success');
      await Store.loadFromCloud();
      this.toast('✅ 同步成功！', 'success');
    } catch (e) {
      this.toast('❌ ' + e.message, 'error');
    }
  },

  async pushSync() {
    try {
      this.toast('📤 推送中...', 'success');
      await Store.saveToCloud();
      this.toast('✅ 推送成功！', 'success');
    } catch (e) {
      this.toast('❌ ' + e.message, 'error');
    }
  },

  exportJSON() {
    const data = Store.exportData();
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
        await Store.importData(data);
        this.toast('✅ 匯入完成', 'success');
      } catch (err) {
        this.toast('❌ 解析失敗：' + err.message, 'error');
      }
    };
    input.click();
  },

  clearAll() {
    if (!confirm('⚠️ 確定要清空所有資料嗎？')) return;
    if (!confirm('⚠️ 真的要清空？再確認！')) return;
    Store.dispatch({ type: 'RESET_ALL' });
    Storage.saveLocal(Store.getPortfolio());
    Storage.saveLocalHistory(Store.getHistory());
    this.toast('🗑️ 已清空', 'success');
    setTimeout(() => location.reload(), 1000);
  },

  // ============================================================
  // 買入 / 賣出 Modal
  // ============================================================
  openBuyModal()  { this._tradeModal('buy');  },
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
                <label class="form-label">交易稅（賣出）</label>
                <input class="form-input" type="number" id="m_tax" value="0" ${isBuy ? 'disabled' : ''}>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">日期</label>
                <input class="form-input" type="date" id="m_date" value="${new Date().toISOString().slice(0,10)}">
              </div>
              <div class="form-group">
                <label class="form-label">市場</label>
                <select class="form-input" id="m_market">
                  <option value="TW">台股</option>
                  <option value="US">美股</option>
                  <option value="HK">港股</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">備註</label>
              <input class="form-input" id="m_note" placeholder="可選">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('tradeModal').remove()">取消</button>
            <button class="btn ${isBuy ? 'btn-success' : 'btn-danger'}" 
                    onclick="UI._submitTradeModal('${type}')">
              ${isBuy ? '✅ 確認買入' : '✅ 確認賣出'}
            </button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  _submitTradeModal(type) {
    const $v = id => document.getElementById(id).value.trim();
    const symbol = $v('m_ticker').toUpperCase();
    const shares = parseFloat($v('m_shares'));
    const price  = parseFloat($v('m_price'));
    const fee    = parseFloat($v('m_fee')) || 0;
    const tax    = parseFloat($v('m_tax')) || 0;
    const date   = $v('m_date');
    const note   = $v('m_note');
    const market = $v('m_market') || 'TW';

    if (!symbol || !shares || !price) {
      this.toast('❌ 請填寫必填欄位', 'error');
      return;
    }

    document.getElementById('tradeModal').remove();

    // 嘗試從 StockDB 找名字
    let name = symbol;
    if (typeof StockDB !== 'undefined' && StockDB.getStock) {
      const s = StockDB.getStock(symbol);
      if (s && s.name) name = s.name;
    }

    try {
      if (type === 'buy') {
        const total = shares * price + fee;
        const effectiveCost = price + fee / shares;
        Store.dispatch({
          type: 'STOCK_BUY',
          payload: { symbol, name, market, shares, price, fee, tax: 0, total, 
                     effectiveCost, date, note }
        });
        this.toast(`✅ 買入 ${symbol} ${shares} 股`, 'success');
      } else {
        const total = shares * price - fee - tax;
        Store.dispatch({
          type: 'STOCK_SELL',
          payload: { symbol, name, shares, price, fee, tax, total, date, note }
        });
        this.toast(`✅ 賣出 ${symbol} ${shares} 股`, 'success');
      }
    } catch (e) {
      this.toast('❌ ' + e.message, 'error');
      console.error(e);
    }
  },

  // ============================================================
  // 拍快照
  // ============================================================
  takeSnapshot() {
    try {
      Store.dispatch({ type: 'SNAPSHOT_TAKE' });
      this.toast('📸 快照已儲存', 'success');
    } catch (e) {
      this.toast('❌ ' + e.message, 'error');
    }
  },

  // ============================================================
  // Toast
  // ============================================================
  toast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  },

  // ============================================================
  // 工具
  // ============================================================
  _fmt(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return Math.round(n).toLocaleString('zh-TW');
  },

  _timeAgo(isoStr) {
    if (!isoStr) return '';
    const t = new Date(isoStr).getTime();
    if (isNaN(t)) return '';
    const sec = Math.floor((Date.now() - t) / 1000);
    if (sec < 5)    return '剛剛';
    if (sec < 60)   return `${sec} 秒前`;
    if (sec < 3600) return `${Math.floor(sec / 60)} 分鐘前`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} 小時前`;
    return `${Math.floor(sec / 86400)} 天前`;
  }
};

window.UI = UI;
console.log('[13-ui.js] ✅ UI 已載入 (v3 對齊 Store 陣列版)');

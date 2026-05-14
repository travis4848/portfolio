/* ============================================================
 * 13-ui.js — UI 渲染與互動（接管所有 Tab）
 * 依賴：所有 01~12 模組
 * 對外：UI（全域變數）
 * ============================================================ */
'use strict';

const UI = {

  currentTab: 'holdings',

  // ========== 啟動 ==========
  init() {
    this._bindTabs();
    this._bindActions();
    this.renderAll();
    console.log('[UI] ✅ 已啟動');
  },

  // ========== Tab 切換 ==========
  _bindTabs() {
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
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

  // ========== 主按鈕 ==========
  _bindActions() {
    const $ = id => document.getElementById(id);

    $('btnBuy')?.addEventListener('click', () => this.openBuyModal());
    $('btnBuy2')?.addEventListener('click', () => this.openBuyModal());
    $('btnSell')?.addEventListener('click', () => this.openSellModal());
    $('btnSell2')?.addEventListener('click', () => this.openSellModal());
    $('btnSnapshot')?.addEventListener('click', () => this.takeSnapshot());
    $('btnUpdatePrice')?.addEventListener('click', () => this.openUpdatePriceModal());
  },

  // ========== 渲染入口 ==========
  renderAll() {
    this.renderSyncBadge();
    this.renderCurrent();
  },

  renderCurrent() {
    if (this.currentTab === 'holdings') this.renderHoldings();
    else if (this.currentTab === 'trades') this.renderTrades();
    else if (this.currentTab === 'stats') this.renderStats();
    else if (this.currentTab === 'settings') this.renderSettings();
  },

  // ========== 同步狀態 ==========
  renderSyncBadge() {
    const badge = document.getElementById('syncBadge');
    if (!badge) return;

    const hasToken = Storage.getToken && Storage.getToken();
    const hasGist = Storage.getGistId && Storage.getGistId();

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

  // ========== 持股 Tab ==========
  renderHoldings() {
    const portfolio = Store.getState().portfolio;
    const stats = Stats.calculatePortfolioStats(portfolio);

    // 統計卡片
    const grid = document.getElementById('statGrid');
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
          ${stats.unrealizedPLPct >= 0 ? '+' : ''}${stats.unrealizedPLPct.toFixed(2)}%
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已實現損益</div>
        <div class="stat-value ${stats.realizedPL >= 0 ? 'up' : 'down'}">
          ${stats.realizedPL >= 0 ? '+' : ''}${this._fmt(stats.realizedPL)}
        </div>
      </div>
    `;

    // 持股列表
    const list = document.getElementById('holdingsList');
    const holdings = portfolio.holdings || {};
    const tickers = Object.keys(holdings).filter(t => holdings[t].shares > 0);

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
      const stock = StockDB.getStock(ticker);
      const name = stock ? stock.name : '';
      const cost = h.shares * h.avgCost;
      const value = h.shares * (h.currentPrice || h.avgCost);
      const pl = value - cost;
      const plPct = cost > 0 ? (pl / cost) * 100 : 0;

      rows += `
        <tr>
          <td class="ticker-cell">${ticker}<span class="ticker-name">${name}</span></td>
          <td class="num">${this._fmt(h.shares)}</td>
          <td class="num">${(h.avgCost || 0).toFixed(2)}</td>
          <td class="num">${(h.currentPrice || h.avgCost || 0).toFixed(2)}</td>
          <td class="num">${this._fmt(cost)}</td>
          <td class="num">${this._fmt(value)}</td>
          <td class="num ${pl >= 0 ? 'up' : 'down'}">${pl >= 0 ? '+' : ''}${this._fmt(pl)}</td>
          <td class="num ${plPct >= 0 ? 'up' : 'down'}">${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%</td>
          <td>
            <button class="btn btn-warning btn-sm" onclick="UI.openUpdatePriceModal('${ticker}')">💲 改價</button>
          </td>
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

  // ========== 交易紀錄 Tab ==========
  renderTrades() {
    const trades = Store.getState().portfolio.trades || [];
    const list = document.getElementById('tradesList');

    if (trades.length === 0) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📋</div>
          <div class="empty-text">尚無交易紀錄</div>
        </div>`;
      return;
    }

    const sorted = [...trades].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    let rows = '';
    sorted.forEach(t => {
      const stock = StockDB.getStock(t.ticker);
      const name = stock ? stock.name : '';
      const isBuy = t.type === 'buy';
      rows += `
        <tr>
          <td>${t.date || '-'}</td>
          <td><span class="${isBuy ? 'up' : 'down'}">${isBuy ? '買入' : '賣出'}</span></td>
          <td class="ticker-cell">${t.ticker}<span class="ticker-name">${name}</span></td>
          <td class="num">${this._fmt(t.shares)}</td>
          <td class="num">${(t.price || 0).toFixed(2)}</td>
          <td class="num">${this._fmt(t.fee || 0)}</td>
          <td class="num">${this._fmt((t.shares || 0) * (t.price || 0) + (t.fee || 0))}</td>
          <td>${t.note || ''}</td>
        </tr>`;
    });

    list.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th><th>類型</th><th>股票</th><th>股數</th>
              <th>價格</th><th>費用</th><th>金額</th><th>備註</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // ========== 統計 Tab ==========
  renderStats() {
    const portfolio = Store.getState().portfolio;
    const stats = Stats.calculatePortfolioStats(portfolio);
    const snapshots = portfolio.snapshots || [];
    const trades = portfolio.trades || [];

    document.getElementById('statsContent').innerHTML = `
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

  // ========== 設定 Tab ==========
  renderSettings() {
    const token = (Storage.getToken && Storage.getToken()) || '';
    const gistId = (Storage.getGistId && Storage.getGistId()) || '';
    const tokenMask = token ? token.substring(0, 8) + '...' + token.substring(token.length - 4) : '（未設定）';

    document.getElementById('settingsContent').innerHTML = `
      <div class="section">
        <div class="section-title">☁️ 雲端同步設定</div>
        <div class="section-desc">使用 GitHub Gist 雲端同步資料。需要產生 Personal Access Token（只需 gist 權限）。<br>
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
          <button class="btn btn-warning" onclick="UI.pushSync()">📤 立即推送（上傳）</button>
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
        <div class="kv-row"><span class="kv-key">版本</span><span class="kv-val">${CONFIG.VERSION}</span></div>
        <div class="kv-row"><span class="kv-key">股票資料庫筆數</span><span class="kv-val">${Object.keys(StockDB.stocks || {}).length}</span></div>
        <div class="kv-row"><span class="kv-key">最後同步時間</span><span class="kv-val">${Storage.getLastSync ? (Storage.getLastSync() || '從未') : '從未'}</span></div>
      </div>
    `;
  },

  // ========== 設定動作 ==========
  saveCloudSettings() {
    const tokenInput = document.getElementById('inpToken').value.trim();
    const gistIdInput = document.getElementById('inpGistId').value.trim();

    if (tokenInput) Storage.setToken(tokenInput);
    if (gistIdInput) Storage.setGistId(gistIdInput);

    this.toast('✅ 已儲存設定', 'success');
    this.renderSyncBadge();
    this.renderSettings();
  },

  async testSync() {
    try {
      this.toast('☁️ 正在從雲端拉取...', 'success');
      const data = await Storage.loadFromGist();
      if (data) {
        Store.setState({ portfolio: data });
        await Storage.saveLocal(data);
        this.toast('✅ 同步成功！', 'success');
        this.renderAll();
      }
    } catch (e) {
      this.toast('❌ 失敗：' + e.message, 'error');
    }
  },

  async pushSync() {
    try {
      this.toast('📤 正在推送到雲端...', 'success');
      const portfolio = Store.getState().portfolio;
      await Storage.saveToGist(portfolio);
      this.toast('✅ 推送成功！', 'success');
      this.renderSyncBadge();
    } catch (e) {
      this.toast('❌ 失敗：' + e.message, 'error');
    }
  },

  exportJSON() {
    const data = Store.getState().portfolio;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast('📥 已匯出 JSON', 'success');
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
        Store.setState({ portfolio: data });
        await Storage.saveLocal(data);
        this.toast('✅ 匯入完成', 'success');
        this.renderAll();
      } catch (err) {
        this.toast('❌ 解析失敗：' + err.message, 'error');
      }
    };
    input.click();
  },

  clearAll() {
    if (!confirm('⚠️ 確定要清空所有資料嗎？此操作無法復原！')) return;
    if (!confirm('⚠️ 真的要清空？再確認一次！')) return;
    localStorage.clear();
    location.reload();
  },

  // ========== 買 / 賣 / 快照 / 改價 ==========
  openBuyModal() {
    if (typeof FormModal !== 'undefined' && FormModal.openBuy) {
      FormModal.openBuy(data => this.handleTrade('buy', data));
    } else {
      this._fallbackBuyModal();
    }
  },

  openSellModal() {
    if (typeof FormModal !== 'undefined' && FormModal.openSell) {
      FormModal.openSell(data => this.handleTrade('sell', data));
    } else {
      this._fallbackSellModal();
    }
  },

  handleTrade(type, data) {
    try {
      const portfolio = Store.getState().portfolio;
      const trade = { ...data, type, id: Utils.uuid() };
      Calculator.applyTrade(portfolio, trade);
      Store.setState({ portfolio });
      Storage.saveLocal(portfolio);
      this.toast(`✅ ${type === 'buy' ? '買入' : '賣出'}成功`, 'success');
      this.renderAll();
    } catch (e) {
      this.toast('❌ ' + e.message, 'error');
    }
  },

  takeSnapshot() {
    try {
      const portfolio = Store.getState().portfolio;
      const stats = Stats.calculatePortfolioStats(portfolio);
      portfolio.snapshots = portfolio.snapshots || [];
      portfolio.snapshots.push({
        id: Utils.uuid(),
        date: new Date().toISOString(),
        totalValue: stats.totalValue,
        totalCost: stats.totalCost,
        unrealizedPL: stats.unrealizedPL,
        realizedPL: stats.realizedPL
      });
      Store.setState({ portfolio });
      Storage.saveLocal(portfolio);
      this.toast('📸 快照已儲存', 'success');
      this.renderStats();
    } catch (e) {
      this.toast('❌ ' + e.message, 'error');
    }
  },

  openUpdatePriceModal(ticker) {
    const portfolio = Store.getState().portfolio;
    const holdings = portfolio.holdings || {};
    const list = ticker ? [ticker] : Object.keys(holdings);

    if (list.length === 0) {
      this.toast('⚠️ 尚無持股可更新', 'warning');
      return;
    }

    const t = ticker || list[0];
    const cur = holdings[t]?.currentPrice || holdings[t]?.avgCost || 0;
    const newPrice = prompt(`輸入 ${t} 的最新價格：`, cur);
    if (newPrice === null) return;

    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) {
      this.toast('❌ 價格無效', 'error');
      return;
    }

    holdings[t].currentPrice = price;
    Store.setState({ portfolio });
    Storage.saveLocal(portfolio);
    this.toast(`✅ ${t} 已更新為 ${price}`, 'success');
    this.renderHoldings();
  },

  // ========== Fallback Modal（FormModal 不可用時） ==========
  _fallbackBuyModal() { this._tradeModal('buy'); },
  _fallbackSellModal() { this._tradeModal('sell'); },

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
      note: $v('m_note')
    };

    if (!data.ticker || !data.shares || !data.price) {
      this.toast('❌ 請填寫必填欄位', 'error');
      return;
    }

    document.getElementById('tradeModal').remove();
    this.handleTrade(type, data);
  },

  // ========== Toast ==========
  toast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  },

  // ========== 工具 ==========
  _fmt(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return Math.round(n).toLocaleString('zh-TW');
  }
};

window.UI = UI;
console.log('[13-ui.js] ✅ UI 已載入');

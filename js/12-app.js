/* ============================================================
 * 🚀 12-app.js - 主程式進入點
 * ============================================================
 * 用途：
 *   1. 啟動流程（載入資料 → 渲染 UI）
 *   2. 訂閱 Store，自動重新渲染
 *   3. Tab 切換、Token 設定、匯入匯出
 * 依賴：所有 01~11 檔案
 * 對外：App（全域變數）
 * ============================================================ */
'use strict';

const App = {
  // ============================================================
  // 🚀 啟動
  // ============================================================
  async boot() {
    console.log('═══════════════════════════════════════');
    console.log('🚀 投資組合管理 v' + CONFIG.VERSION);
    console.log('═══════════════════════════════════════');

    // 顯示載入中
    this._showLoading('正在載入資料...');

    try {
      // 1. 初始化 Store
      await Store.init({ tryCloud: true });

      // 2. 訂閱狀態變化（自動重新渲染當前 tab）
      Store.subscribe(() => {
        this._renderCurrentTab();
        this._updateSyncStatus();
      });

      // 3. 綁定 UI 事件
      this._bindUIEvents();

      // 4. 首次渲染
      this._renderCurrentTab();
      this._updateSyncStatus();

      // 5. 移除載入中
      this._hideLoading();

      console.log('✅ 啟動完成');
    } catch (err) {
      console.error('❌ 啟動失敗:', err);
      this._hideLoading();
      this._showError('啟動失敗：' + err.message);
    }
  },

  // ============================================================
  // 🎨 UI 渲染
  // ============================================================
  _renderCurrentTab() {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (!activeTab) return;

    if (activeTab === 'stocks') {
      TradeList.render('tab-stocks');
    } else if (activeTab === 'margin') {
      this._renderPlaceholder('tab-margin', '🏦 融資功能', '即將推出，敬請期待');
    } else if (activeTab === 'futures') {
      this._renderPlaceholder('tab-futures', '📈 期貨功能', '即將推出，敬請期待');
    } else if (activeTab === 'watchlist') {
      this._renderPlaceholder('tab-watchlist', '👀 觀察清單', '即將推出，敬請期待');
    } else if (activeTab === 'history') {
      this._renderHistory();
    } else if (activeTab === 'settings') {
      this._renderSettings();
    }
  },

  _renderPlaceholder(id, title, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <div style="background:#1a1f2e; border:1px dashed #2d3548; border-radius:12px; padding:60px 20px; text-align:center;">
        <div style="font-size:48px; margin-bottom:12px;">${title.split(' ')[0]}</div>
        <div style="color:#e5e7eb; font-size:18px; margin-bottom:8px;">${Utils.escapeHtml(title)}</div>
        <div style="color:#6b7280; font-size:13px;">${Utils.escapeHtml(msg)}</div>
      </div>
    `;
  },

  _renderHistory() {
    const el = document.getElementById('tab-history');
    if (!el) return;

    const history = Store.getHistory();
    const txs = (history.transactions || []).slice().reverse(); // 最新在前
    const snapshots = (history.snapshots || []).slice().reverse();

    const txRows = txs.length === 0
      ? '<div style="color:#6b7280; text-align:center; padding:20px;">尚無交易紀錄</div>'
      : txs.slice(0, 50).map(tx => {
          const isB = tx.type === 'BUY';
          return `
            <div style="
              padding: 12px; background: #1a1f2e; border: 1px solid #2d3548;
              border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; gap: 12px;
            ">
              <div style="flex:1; min-width:0;">
                <div style="margin-bottom:4px;">
                  <span style="background:${isB ? '#10b981' : '#ef4444'}; color:#fff; padding:2px 8px; border-radius:3px; font-size:11px; font-weight:600;">
                    ${isB ? '買入' : '賣出'}
                  </span>
                  <span style="color:#e5e7eb; font-weight:600; margin-left:8px;">${Utils.escapeHtml(tx.symbol)}</span>
                  <span style="color:#9ca3af; font-size:12px; margin-left:6px;">${Utils.escapeHtml(tx.name || '')}</span>
                </div>
                <div style="color:#6b7280; font-size:12px;">
                  ${Utils.fmtNum(tx.shares)} 股 × ${Utils.fmtMoney(tx.price)} · ${Utils.fmtDateTime(tx.timestamp)}
                </div>
              </div>
              <div style="text-align:right;">
                <div style="color:#e5e7eb; font-weight:600;">${Utils.fmtMoney(tx.amount)}</div>
                ${tx.realizedPnl ? `<div style="color:${tx.realizedPnl >= 0 ? '#10b981' : '#ef4444'}; font-size:12px;">
                  損益 ${tx.realizedPnl >= 0 ? '+' : ''}${Utils.fmtMoney(tx.realizedPnl)}
                </div>` : ''}
              </div>
            </div>
          `;
        }).join('');

    el.innerHTML = `
      <div style="margin-bottom:24px;">
        <h3 style="color:#e5e7eb; margin:0 0 12px;">📜 交易紀錄（最新 50 筆）</h3>
        ${txRows}
      </div>
      <div>
        <h3 style="color:#e5e7eb; margin:0 0 12px;">📸 每日快照（${snapshots.length} 筆）</h3>
        ${snapshots.length === 0 ? '<div style="color:#6b7280; text-align:center; padding:20px;">尚無快照</div>' :
          snapshots.slice(0, 10).map(s => `
            <div style="padding:10px; background:#1a1f2e; border:1px solid #2d3548; border-radius:6px; margin-bottom:6px; display:flex; justify-content:space-between;">
              <span style="color:#9ca3af; font-size:13px;">${s.date}</span>
              <span style="color:#e5e7eb; font-weight:600;">${Utils.fmtMoney(s.totalAssets)}</span>
              <span style="color:${s.totalPnl >= 0 ? '#10b981' : '#ef4444'}; font-size:13px;">
                ${s.totalPnl >= 0 ? '+' : ''}${Utils.fmtMoney(s.totalPnl)}
              </span>
            </div>
          `).join('')}
      </div>
    `;
  },

  _renderSettings() {
    const el = document.getElementById('tab-settings');
    if (!el) return;
    const token = Storage.getToken() ? '已設定' : '❌ 未設定';
    const gistId = Storage.getGistId() ? '已設定' : '❌ 未設定';
    const lastSync = Storage.getLastSync() || '從未同步';

    el.innerHTML = `
      <div style="background:#1a1f2e; border:1px solid #2d3548; border-radius:10px; padding:20px; margin-bottom:16px;">
        <h3 style="color:#e5e7eb; margin:0 0 14px;">☁️ 雲端同步</h3>
        <div style="display:grid; gap:10px;">
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#9ca3af;">GitHub Token：</span>
            <span style="color:${Storage.getToken() ? '#10b981' : '#ef4444'};">${token}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#9ca3af;">Gist ID：</span>
            <span style="color:${Storage.getGistId() ? '#10b981' : '#ef4444'};">${gistId}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#9ca3af;">最後同步：</span>
            <span style="color:#e5e7eb; font-size:12px;">${Utils.fmtDateTime(lastSync)}</span>
          </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
          <button id="btn-set-token" style="padding:8px 14px; background:#6366f1; color:#fff; border:none; border-radius:6px; cursor:pointer;">設定 Token</button>
          <button id="btn-set-gist" style="padding:8px 14px; background:#6366f1; color:#fff; border:none; border-radius:6px; cursor:pointer;">設定 Gist ID</button>
          <button id="btn-sync-now" style="padding:8px 14px; background:#10b981; color:#fff; border:none; border-radius:6px; cursor:pointer;">立即同步</button>
        </div>
      </div>
      <div style="background:#1a1f2e; border:1px solid #2d3548; border-radius:10px; padding:20px; margin-bottom:16px;">
        <h3 style="color:#e5e7eb; margin:0 0 14px;">📦 資料管理</h3>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button id="btn-export" style="padding:8px 14px; background:#3b82f6; color:#fff; border:none; border-radius:6px; cursor:pointer;">📤 匯出 JSON</button>
          <button id="btn-import" style="padding:8px 14px; background:#3b82f6; color:#fff; border:none; border-radius:6px; cursor:pointer;">📥 匯入 JSON</button>
          <button id="btn-reset" style="padding:8px 14px; background:#ef4444; color:#fff; border:none; border-radius:6px; cursor:pointer;">🗑️ 重置全部</button>
        </div>
      </div>
      <div style="color:#6b7280; font-size:12px; text-align:center;">
        投資組合管理 v${CONFIG.VERSION}
      </div>
    `;

    el.querySelector('#btn-set-token').onclick = () => {
      const t = prompt('請輸入 GitHub Personal Access Token（需要 gist 權限）:', Storage.getToken() || '');
      if (t) { Storage.setToken(t.trim()); this._toast('✅ Token 已儲存'); this._renderSettings(); }
    };
    el.querySelector('#btn-set-gist').onclick = () => {
      const g = prompt('請輸入 Gist ID（從 Gist URL 複製）:', Storage.getGistId() || '');
      if (g) { Storage.setGistId(g.trim()); this._toast('✅ Gist ID 已儲存'); this._renderSettings(); }
    };
    el.querySelector('#btn-sync-now').onclick = async () => {
      try { await Store.saveToCloud(); this._toast('✅ 同步成功'); }
      catch (err) { alert('❌ 同步失敗：' + err.message); }
    };
    el.querySelector('#btn-export').onclick = () => this._exportJson();
    el.querySelector('#btn-import').onclick = () => this._importJson();
    el.querySelector('#btn-reset').onclick = () => {
      if (confirm('⚠️ 確定要清除所有資料？此動作無法復原！')) {
        Store.dispatch({ type: 'RESET_ALL' });
        this._toast('🗑️ 已重置');
      }
    };
  },

  // ============================================================
  // 🔌 UI 事件綁定
  // ============================================================
  _bindUIEvents() {
    // Tab 切換
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.dataset.tab;
        document.getElementById('tab-' + tabId)?.classList.add('active');
        this._renderCurrentTab();
      });
    });
  },

  // ============================================================
  // ☁️ 同步狀態
  // ============================================================
  _updateSyncStatus() {
    const el = document.getElementById('sync-status');
    if (!el) return;
    if (Store.state.syncing) {
      el.textContent = '☁️ 同步中...';
      el.style.color = '#fbbf24';
    } else if (Store.state.lastError) {
      el.textContent = '⚠️ ' + Store.state.lastError.slice(0, 30);
      el.style.color = '#ef4444';
    } else if (Storage.getToken() && Storage.getGistId()) {
      el.textContent = '✅ 已同步';
      el.style.color = '#10b981';
    } else {
      el.textContent = '💾 本地模式';
      el.style.color = '#9ca3af';
    }
  },

  // ============================================================
  // 📤 匯出 / 匯入
  // ============================================================
  _exportJson() {
    const data = Store.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio_${Utils.today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this._toast('✅ 匯出完成');
  },

  _importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!confirm('⚠️ 匯入會覆蓋目前資料，確定？')) return;
        await Store.importData(data);
        this._toast('✅ 匯入完成');
      } catch (err) {
        alert('❌ 匯入失敗：' + err.message);
      }
    };
    input.click();
  },

  // ============================================================
  // 🛠️ 通用工具
  // ============================================================
  _showLoading(msg) {
    let el = document.getElementById('app-loading');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-loading';
      el.style.cssText = `
        position: fixed; inset: 0; background: rgba(15,20,32,0.9);
        display: flex; align-items: center; justify-content: center;
        z-index: 99999; color: #e5e7eb; font-size: 16px;
      `;
      document.body.appendChild(el);
    }
    el.textContent = msg;
  },
  _hideLoading() {
    const el = document.getElementById('app-loading');
    if (el) el.remove();
  },
  _showError(msg) {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: #ef4444; color: #fff; padding: 14px 24px; border-radius: 8px;
      z-index: 99999; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    `;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  },
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

// 全域曝露
window.App = App;

// 自動啟動
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.boot());
} else {
  App.boot();
}

console.log('[12-app.js] ✅ App 已載入');

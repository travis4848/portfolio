/* ============================================================
 * 12-app.js — 主程式進入點 (v3)
 * ============================================================ */
'use strict';

const App = {

  async boot() {
    console.log('═══════════════════════════════════════');
    console.log('🚀 投資組合管理 v' + (typeof CONFIG !== 'undefined' ? CONFIG.VERSION : '?'));
    console.log('═══════════════════════════════════════');

    const setLoadingText = txt => {
      const el = document.getElementById('loadingText');
      if (el) el.textContent = txt;
    };

    try {
      // 1. 初始化 Store
      setLoadingText('正在初始化資料...');
      try {
        await Store.init({ tryCloud: true });
      } catch (e) {
        console.warn('[App] Store 初始化警告:', e);
      }

      // 2. 啟動 UI
      setLoadingText('正在建立介面...');
      if (typeof UI !== 'undefined' && UI.init) {
        UI.init();
      } else {
        throw new Error('UI 模組未載入');
      }

      // 3. 顯示 App
      this._showApp();
      console.log('✅ 啟動完成');

      // 4. ⭐ 啟動即時報價（5 秒後抓一次，之後每 60 秒）
      this._initPriceFetcher();

    } catch (err) {
      console.error('❌ 啟動失敗:', err);
      setLoadingText('❌ 啟動失敗：' + err.message);
    }
  },

  _initPriceFetcher() {
    if (typeof PriceFetcher === 'undefined') {
      console.warn('[App] PriceFetcher 未載入，跳過自動報價');
      return;
    }

    // 啟動 5 秒後第一次抓
    setTimeout(() => {
      const stocks = Store.getStocks();
      if (stocks.length === 0) {
        console.log('[App] 無持股，跳過初始報價抓取');
        return;
      }
      console.log('[App] 🚀 啟動自動報價...');
      PriceFetcher.refreshAll().then(r => {
        if (r) {
          UI._lastRefreshTime = new Date().toISOString();
          UI.renderHoldings();
        }
      }).catch(e => console.error('[App] 初始報價失敗:', e));

      // 之後每 60 秒
      PriceFetcher.startAutoRefresh(60);
    }, 5000);
  },

  _showApp() {
    const loading = document.getElementById('loadingScreen');
    const app = document.getElementById('app');
    if (loading) {
      loading.classList.add('hide');
      setTimeout(() => loading.style.display = 'none', 300);
    }
    if (app) app.style.display = 'flex';
  }
};

window.App = App;
console.log('[12-app.js] ✅ App 已載入');

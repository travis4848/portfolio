/* ============================================================
 * 12-app.js — 主程式進入點
 * 依賴：所有 01~11 模組 + 13-ui.js
 * 對外：App.boot()
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
      // 1. 初始化 Store（含資料載入 + v1→v2 遷移）
      setLoadingText('正在初始化資料...');
      try {
        await Store.init({ tryCloud: true });
      } catch (e) {
        console.warn('[App] Store 初始化警告（繼續離線模式）:', e);
      }

      // 2. 訂閱 Store 變化（自動重新渲染）
      if (Store.subscribe) {
        Store.subscribe(() => {
          if (typeof UI !== 'undefined') {
            UI.renderCurrent();
            UI.renderSyncBadge();
          }
        });
      }

      // 3. 啟動 UI
      setLoadingText('正在建立介面...');
      if (typeof UI !== 'undefined' && UI.init) {
        UI.init();
      } else {
        throw new Error('UI 模組未載入');
      }

      // 4. 隱藏 loading、顯示 App
      this._showApp();

      console.log('✅ 啟動完成');
    } catch (err) {
      console.error('❌ 啟動失敗:', err);
      setLoadingText('❌ 啟動失敗：' + err.message);
    }
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

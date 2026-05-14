/* ============================================================
 * 📦 01-config.js - 全域配置
 * ============================================================
 * 用途：集中管理所有常數設定
 * 依賴：無
 * 對外：CONFIG（全域變數）
 * ============================================================ */
'use strict';

const CONFIG = {
  VERSION: '2.0.0',
  
  STORAGE_KEYS: {
    TOKEN: 'portfolio_token',
    GIST_ID: 'portfolio_gist_id',
    LOCAL_DATA: 'portfolio_local_data',
    LOCAL_HISTORY: 'portfolio_local_history',
    LAST_SYNC: 'portfolio_last_sync'
  },
  
  GIST_FILES: {
    MAIN: 'portfolio.json',
    HISTORY: 'history.json'
  },
  
  HISTORY: {
    DAILY_KEEP_DAYS: 90,      // 90 天內每日記錄
    WEEKLY_KEEP_DAYS: 365,    // 90~365 天每週記錄
    // 365 天以上每月記錄
  },
  
  PRICE_FETCH: {
    INTERVAL: 60000,          // 1 分鐘
    RETRY_DELAY: 5000,
    MAX_RETRY: 3
  },
  
  MARKET_HOURS: {
    TW_OPEN: { hour: 9, minute: 0 },
    TW_CLOSE: { hour: 13, minute: 30 },
    TW_FUTURES_OPEN: { hour: 8, minute: 45 },
    TW_FUTURES_CLOSE: { hour: 13, minute: 45 }
  }
};

// 全域曝露
window.CONFIG = CONFIG;

console.log('[01-config.js] ✅ CONFIG 已載入 v' + CONFIG.VERSION);

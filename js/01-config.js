/* ============================================================
 * 01-config.js — 全域設定 v3.0.0
 * ============================================================ */
'use strict';

const CONFIG = {
  VERSION: '3.0.0',
  APP_NAME: '投資組合管理',

  // ========== 儲存 ==========
  STORAGE_KEY: 'portfolio_v2',     // 保持原 key（v3 結構也存這裡）
  TOKEN_KEY: 'github_token',
  GIST_ID_KEY: 'gist_id',
  LAST_SYNC_KEY: 'last_sync',
  GIST_FILENAME: 'portfolio.json',

  // ========== 即時報價 ==========
  PRICE: {
    // Yahoo Finance + 公開 CORS Proxy
    YAHOO_BASE: 'https://query1.finance.yahoo.com/v8/finance/chart/',
    CORS_PROXIES: [
      'https://corsproxy.io/?',
      'https://api.allorigins.win/raw?url=',
      'https://cors.eu.org/'
    ],
    AUTO_REFRESH_SEC: 60,          // 自動刷新間隔（秒）
    CACHE_SEC: 30,                  // 快取時間（30 秒內不重抓）
    TIMEOUT_MS: 8000                // 單次抓取 timeout
  },

  // ========== 融資券設定（可在 UI 修改） ==========
  MARGIN: {
    MARGIN_RATE: 0.4,               // 融資自備款比例
    SHORT_RATE: 0.9,                // 融券保證金比例
    INTEREST_RATE: 0.0645,          // 融資年利率（國泰 6.45%）
    SHORT_FEE_RATE: 0.0008,         // 融券手續費率
    BROKER_NAME: '國泰證券'
  },

  // ========== 期貨設定 ==========
  FUTURES: {
    PRODUCTS: {
      'TXF': { name: '台指期',   multiplier: 200, margin: 207000, unit: '點' },
      'MXF': { name: '小台指',   multiplier: 50,  margin: 51750,  unit: '點' },
      'TMF': { name: '微型台指', multiplier: 10,  margin: 10350,  unit: '點' }
      // 個股期動態加入：股票代號-FUT，如 "2330-FUT"
    },
    STOCK_FUT_MULTIPLIER: 2000,     // 個股期 1 口 = 2000 股
    STOCK_FUT_MARGIN_RATE: 0.135    // 個股期保證金比例 13.5%
  },

  // ========== 做 T 自動辨識 ==========
  T_TRADE: {
    AUTO_DETECT: true,              // 自動辨識
    MAX_DAYS: 5,                    // N 天內買回視為做 T
    REDUCE_COST: true               // 自動降低原始成本
  },

  // ========== 手續費 / 稅率（台股） ==========
  FEE: {
    BROKER_FEE_RATE: 0.001425,      // 券商手續費 0.1425%
    BROKER_FEE_DISCOUNT: 0.28,      // 折扣（國泰約 2.8 折）
    MIN_FEE: 20,                     // 最低手續費 20 元
    TAX_RATE_STOCK: 0.003,           // 證交稅 0.3%（賣出）
    TAX_RATE_ETF: 0.001              // ETF 證交稅 0.1%
  },

  // ========== UI ==========
  UI: {
    DEFAULT_TAB: 'stocks',           // 改：預設打開「現股」
    DECIMAL_PLACES: 2,
    LOCALE: 'zh-TW',
    TOAST_DURATION_MS: 2500
  }
};

// 凍結部分（避免誤改），但允許 MARGIN 和 FUTURES 在執行時被使用者設定覆蓋
Object.freeze(CONFIG.PRICE);
Object.freeze(CONFIG.UI);
Object.freeze(CONFIG.FEE.PRODUCTS || {});

window.CONFIG = CONFIG;
console.log(`[01-config.js] ✅ CONFIG 已載入 v${CONFIG.VERSION}`);

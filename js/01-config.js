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
    // 沿用舊欄位（相容既有程式）
    MARGIN_RATE: 0.4,               // 融資自備款比例（舊名）
    SHORT_RATE: 0.9,                // 融券保證金比例（舊名）
    INTEREST_RATE: 0.0645,          // 融資年利率（國泰 6.45%）
    SHORT_FEE_RATE: 0.0008,         // 融券手續費率
    BROKER_NAME: '國泰證券',

    // 新增：結構化欄位（reducer 用）
    LONG: {
      OWN_FUND_RATE: 0.4,           // 自備款 40%
      LOAN_RATE: 0.6,               // 融資借 60%
      INTEREST_RATE: 0.0645,        // 融資利率
      MAINTENANCE_RATE: 1.30        // 維持率（低於 130% 警告）
    },
    SHORT: {
      DEPOSIT_RATE: 0.9,            // 保證金 90%
      FEE_RATE: 0.0008,             // 借券費 0.08%
      MAINTENANCE_RATE: 1.30
    }
  },

  // ========== 期貨設定 ==========
  FUTURES: {
    PRODUCTS: {
      // ── 指數期貨 ──
      'TXF': {
        name: '台指期（大台）',
        category: 'index',
        multiplier: 200,           // 一點 = $200
        pointValue: 200,           // 別名（給 reducer 用）
        margin: 207000,            // 原始保證金（最新公告）
        marginMaintain: 159000,    // 維持保證金
        tickSize: 1,
        unit: '點',
        feePerLot: 50,             // 單邊手續費
        taxRate: 0.00002,          // 期交稅 0.002%
        underlying: 'TWII'
      },
      'MXF': {
        name: '小台指（小台）',
        category: 'index',
        multiplier: 50,
        pointValue: 50,
        margin: 51750,
        marginMaintain: 39750,
        tickSize: 1,
        unit: '點',
        feePerLot: 30,
        taxRate: 0.00002,
        underlying: 'TWII'
      },
      'TMF': {
        name: '微型台指（微台）',  // ⭐
        category: 'index',
        multiplier: 10,
        pointValue: 10,
        margin: 10350,
        marginMaintain: 7950,
        tickSize: 1,
        unit: '點',
        feePerLot: 15,
        taxRate: 0.00002,
        underlying: 'TWII'
      }
      // 個股期/小型個股期：動態建立（用 STF / MTF 樣板，見下方）
    },

    // ── 個股期樣板（建立倉位時依股價算保證金）──
    STOCK_FUT_TEMPLATES: {
      'STF': {                       // 一般個股期
        name: '個股期貨',
        category: 'stock',
        contractSize: 2000,          // 1 口 = 2000 股
        marginRate: 0.135,           // 13.5%
        marginRateMaintain: 0.103,   // 10.3%
        feePerLot: 30,
        taxRate: 0.00002,
        dynamicMargin: true
      },
      'MTF': {                       // 小型個股期 ⭐
        name: '小型個股期貨',
        category: 'stock',
        contractSize: 100,           // 1 口 = 100 股
        marginRate: 0.135,
        marginRateMaintain: 0.103,
        feePerLot: 15,
        taxRate: 0.00002,
        dynamicMargin: true
      }
    },

    // ── 舊欄位（相容既有程式）──
    STOCK_FUT_MULTIPLIER: 2000,
    STOCK_FUT_MARGIN_RATE: 0.135,

    // 預設商品
    DEFAULT_PRODUCT: 'TXF',

    // Yahoo 報價代號對應（D3 用）
    YAHOO_SYMBOL: {
      'TXF': '%5ETWII',   // ^TWII 加權指數
      'MXF': '%5ETWII',
      'TMF': '%5ETWII'
    }
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
Object.freeze(CONFIG.FEE);
// MARGIN / FUTURES 故意不凍結（允許使用者在 UI 修改）
Object.freeze(CONFIG.FUTURES.PRODUCTS);
Object.freeze(CONFIG.FUTURES.STOCK_FUT_TEMPLATES);

window.CONFIG = CONFIG;
console.log(`[01-config.js] ✅ CONFIG 已載入 v${CONFIG.VERSION}`);

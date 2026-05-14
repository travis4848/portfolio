/* ============================================================
 * 📚 06-stockdb.js - 股票代號資料庫
 * ============================================================
 * 用途：股票代號 → 名稱、產業、市場、貨幣對照
 * 依賴：無
 * 對外：StockDB（全域變數）
 * ============================================================ */
'use strict';

const StockDB = {
  // 內建熱門台股清單（可後續擴充）
  stocks: [
    // 台股 - 半導體
    { symbol: '2330', name: '台積電', market: 'TW', industry: '半導體', currency: 'TWD' },
    { symbol: '2454', name: '聯發科', market: 'TW', industry: '半導體', currency: 'TWD' },
    { symbol: '2303', name: '聯電', market: 'TW', industry: '半導體', currency: 'TWD' },
    { symbol: '3711', name: '日月光投控', market: 'TW', industry: '半導體', currency: 'TWD' },
    { symbol: '2379', name: '瑞昱', market: 'TW', industry: '半導體', currency: 'TWD' },
    { symbol: '3034', name: '聯詠', market: 'TW', industry: '半導體', currency: 'TWD' },
    { symbol: '6669', name: '緯穎', market: 'TW', industry: 'AI伺服器', currency: 'TWD' },
    { symbol: '3231', name: '緯創', market: 'TW', industry: 'AI伺服器', currency: 'TWD' },
    { symbol: '2382', name: '廣達', market: 'TW', industry: 'AI伺服器', currency: 'TWD' },
    { symbol: '2317', name: '鴻海', market: 'TW', industry: '電子代工', currency: 'TWD' },
    
    // 台股 - 金融
    { symbol: '2881', name: '富邦金', market: 'TW', industry: '金融', currency: 'TWD' },
    { symbol: '2882', name: '國泰金', market: 'TW', industry: '金融', currency: 'TWD' },
    { symbol: '2884', name: '玉山金', market: 'TW', industry: '金融', currency: 'TWD' },
    { symbol: '2891', name: '中信金', market: 'TW', industry: '金融', currency: 'TWD' },
    { symbol: '2885', name: '元大金', market: 'TW', industry: '金融', currency: 'TWD' },
    
    // 台股 - 傳產 / 其他
    { symbol: '1301', name: '台塑', market: 'TW', industry: '塑化', currency: 'TWD' },
    { symbol: '1303', name: '南亞', market: 'TW', industry: '塑化', currency: 'TWD' },
    { symbol: '2412', name: '中華電', market: 'TW', industry: '電信', currency: 'TWD' },
    { symbol: '3008', name: '大立光', market: 'TW', industry: '光學', currency: 'TWD' },
    { symbol: '2002', name: '中鋼', market: 'TW', industry: '鋼鐵', currency: 'TWD' },
    
    // 台股 - ETF（流通量大）
    { symbol: '0050', name: '元大台灣50', market: 'TW', industry: 'ETF', currency: 'TWD', isETF: true },
    { symbol: '0056', name: '元大高股息', market: 'TW', industry: 'ETF', currency: 'TWD', isETF: true },
    { symbol: '00878', name: '國泰永續高股息', market: 'TW', industry: 'ETF', currency: 'TWD', isETF: true },
    { symbol: '00919', name: '群益台灣精選高息', market: 'TW', industry: 'ETF', currency: 'TWD', isETF: true },
    { symbol: '00929', name: '復華台灣科技優息', market: 'TW', industry: 'ETF', currency: 'TWD', isETF: true },
    { symbol: '00940', name: '元大台灣價值高息', market: 'TW', industry: 'ETF', currency: 'TWD', isETF: true },
    { symbol: '006208', name: '富邦台50', market: 'TW', industry: 'ETF', currency: 'TWD', isETF: true },
    
    // 美股 - 科技七雄 + 熱門
    { symbol: 'AAPL', name: 'Apple Inc.', market: 'US', industry: '科技', currency: 'USD' },
    { symbol: 'MSFT', name: 'Microsoft', market: 'US', industry: '科技', currency: 'USD' },
    { symbol: 'GOOGL', name: 'Alphabet', market: 'US', industry: '科技', currency: 'USD' },
    { symbol: 'AMZN', name: 'Amazon', market: 'US', industry: '電商', currency: 'USD' },
    { symbol: 'META', name: 'Meta Platforms', market: 'US', industry: '社群', currency: 'USD' },
    { symbol: 'NVDA', name: 'NVIDIA', market: 'US', industry: '半導體', currency: 'USD' },
    { symbol: 'TSLA', name: 'Tesla', market: 'US', industry: '電動車', currency: 'USD' },
    { symbol: 'AMD', name: 'AMD', market: 'US', industry: '半導體', currency: 'USD' },
    { symbol: 'TSM', name: 'TSMC ADR', market: 'US', industry: '半導體', currency: 'USD' },
    
    // 美股 - ETF
    { symbol: 'VOO', name: 'Vanguard S&P 500', market: 'US', industry: 'ETF', currency: 'USD', isETF: true },
    { symbol: 'QQQ', name: 'Invesco QQQ', market: 'US', industry: 'ETF', currency: 'USD', isETF: true },
    { symbol: 'SPY', name: 'SPDR S&P 500', market: 'US', industry: 'ETF', currency: 'USD', isETF: true },
    { symbol: 'VT', name: 'Vanguard Total World', market: 'US', industry: 'ETF', currency: 'USD', isETF: true }
  ],

  // 模糊搜尋（代號或名稱）
  search(query, limit = 10) {
    if (!query) return [];
    const q = String(query).toLowerCase().trim();
    if (!q) return [];
    
    // 1. 完全匹配代號
    const exact = this.stocks.filter(s => s.symbol.toLowerCase() === q);
    if (exact.length > 0) return exact.slice(0, limit);
    
    // 2. 開頭匹配代號
    const startSymbol = this.stocks.filter(s => 
      s.symbol.toLowerCase().startsWith(q) && !exact.includes(s)
    );
    
    // 3. 名稱包含
    const inName = this.stocks.filter(s => 
      s.name.toLowerCase().includes(q) && 
      !exact.includes(s) && !startSymbol.includes(s)
    );
    
    // 4. 代號包含（中間）
    const inSymbol = this.stocks.filter(s =>
      s.symbol.toLowerCase().includes(q) &&
      !exact.includes(s) && !startSymbol.includes(s) && !inName.includes(s)
    );
    
    return [...exact, ...startSymbol, ...inName, ...inSymbol].slice(0, limit);
  },

  // 依代號取得單一筆
  getBySymbol(symbol) {
    if (!symbol) return null;
    const s = String(symbol).toLowerCase();
    return this.stocks.find(x => x.symbol.toLowerCase() === s) || null;
  },

  // 新增到資料庫（用於使用者輸入新代號）
  addCustom(symbol, name, market = 'TW', currency = 'TWD') {
    if (!symbol) return null;
    const existing = this.getBySymbol(symbol);
    if (existing) return existing;
    const stock = { symbol, name: name || symbol, market, currency, industry: '其他', isCustom: true };
    this.stocks.push(stock);
    return stock;
  }
};

// 全域曝露
window.StockDB = StockDB;

console.log('[06-stockdb.js] ✅ StockDB 已載入（' + StockDB.stocks.length + ' 筆股票）');

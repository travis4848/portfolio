/* ============================================================
 * 💾 04-storage.js - 儲存層（LocalStorage + GitHub Gist）
 * ============================================================
 * 用途：
 *   1. LocalStorage：Token / GistId / 本地資料快取
 *   2. GitHub Gist API：雲端同步
 *   3. 自動觸發 v1→v2 遷移
 * 依賴：CONFIG, DataStructure, Migration
 * 對外：Storage（全域變數）
 * ============================================================ */
'use strict';

const Storage = {
  // ---------- LocalStorage ----------
  saveLocal(data) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.LOCAL_DATA, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('[Storage] saveLocal 失敗:', e);
      return false;
    }
  },

  loadLocal() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.LOCAL_DATA);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('[Storage] loadLocal 失敗:', e);
      return null;
    }
  },

  saveLocalHistory(history) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.LOCAL_HISTORY, JSON.stringify(history));
      return true;
    } catch (e) {
      console.error('[Storage] saveLocalHistory 失敗:', e);
      return false;
    }
  },

  loadLocalHistory() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.LOCAL_HISTORY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('[Storage] loadLocalHistory 失敗:', e);
      return null;
    }
  },

  getToken() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
  },

  getGistId() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.GIST_ID);
  },

  setToken(token) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, token);
  },

  setGistId(id) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.GIST_ID, id);
  },

  setLastSync(iso) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_SYNC, iso);
  },

  getLastSync() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_SYNC);
  },

  clearAll() {
    Object.values(CONFIG.STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  },

  // ---------- Gist API ----------
  async gistRequest(method, path = '', body = null) {
    const token = this.getToken();
    if (!token) throw new Error('尚未設定 Token');
    
    const url = `https://api.github.com${path}`;
    const opts = {
      method: method,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    };
    if (body) opts.body = JSON.stringify(body);
    
    const res = await fetch(url, opts);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Gist API ${res.status}: ${txt}`);
    }
    return res.json();
  },

  // 載入 Gist（同時取得主資料 + 歷史）
  async loadFromGist() {
    const gistId = this.getGistId();
    if (!gistId) throw new Error('尚未設定 Gist ID');
    
    const gist = await this.gistRequest('GET', `/gists/${gistId}`);
    const files = gist.files || {};
    
    // 主資料
    let portfolio = null;
    const mainFile = files[CONFIG.GIST_FILES.MAIN];
    if (mainFile && mainFile.content) {
      try {
        portfolio = JSON.parse(mainFile.content);
      } catch (e) {
        console.error('[Storage] 解析 portfolio.json 失敗:', e);
      }
    }
    
    // 歷史資料
    let history = null;
    const histFile = files[CONFIG.GIST_FILES.HISTORY];
    if (histFile && histFile.content) {
      try {
        history = JSON.parse(histFile.content);
      } catch (e) {
        console.error('[Storage] 解析 history.json 失敗:', e);
      }
    }
    
    // 自動遷移
    if (portfolio && Migration.isV1(portfolio)) {
      console.log('[Storage] 偵測到 v1 資料，自動升級...');
      portfolio = Migration.migrate(portfolio);
      // 升級後立即推回 Gist
      await this.saveToGist(portfolio, history || DataStructure.getDefaultHistory());
    }
    
    return {
      portfolio: portfolio || DataStructure.getDefaultPortfolio(),
      history: history || DataStructure.getDefaultHistory()
    };
  },

  // 儲存到 Gist（主資料 + 歷史）
  async saveToGist(portfolio, history) {
    const gistId = this.getGistId();
    if (!gistId) throw new Error('尚未設定 Gist ID');
    
    portfolio.lastUpdate = new Date().toISOString();
    portfolio.version = CONFIG.VERSION;
    if (history) history.version = CONFIG.VERSION;
    
    const files = {};
    files[CONFIG.GIST_FILES.MAIN] = {
      content: JSON.stringify(portfolio, null, 2)
    };
    if (history) {
      files[CONFIG.GIST_FILES.HISTORY] = {
        content: JSON.stringify(history, null, 2)
      };
    }
    
    await this.gistRequest('PATCH', `/gists/${gistId}`, { files });
    this.setLastSync(new Date().toISOString());
    return true;
  }
};

// 全域曝露
window.Storage = Storage;

console.log('[04-storage.js] ✅ Storage 已載入');
/* ============================================================
 * 💾 04-storage.js - 儲存層（LocalStorage + GitHub Gist）
 * ============================================================
 * 用途：
 *   1. LocalStorage：Token / GistId / 本地資料快取
 *   2. GitHub Gist API：雲端同步
 *   3. 自動觸發 v1→v2 遷移
 * 依賴：CONFIG, DataStructure, Migration
 * 對外：Storage（全域變數）
 * ============================================================ */
'use strict';

const Storage = {
  // ---------- LocalStorage ----------
  saveLocal(data) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.LOCAL_DATA, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('[Storage] saveLocal 失敗:', e);
      return false;
    }
  },

  loadLocal() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.LOCAL_DATA);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('[Storage] loadLocal 失敗:', e);
      return null;
    }
  },

  saveLocalHistory(history) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.LOCAL_HISTORY, JSON.stringify(history));
      return true;
    } catch (e) {
      console.error('[Storage] saveLocalHistory 失敗:', e);
      return false;
    }
  },

  loadLocalHistory() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.LOCAL_HISTORY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('[Storage] loadLocalHistory 失敗:', e);
      return null;
    }
  },

  getToken() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
  },

  getGistId() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.GIST_ID);
  },

  setToken(token) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, token);
  },

  setGistId(id) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.GIST_ID, id);
  },

  setLastSync(iso) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_SYNC, iso);
  },

  getLastSync() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_SYNC);
  },

  clearAll() {
    Object.values(CONFIG.STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  },

  // ---------- Gist API ----------
  async gistRequest(method, path = '', body = null) {
    const token = this.getToken();
    if (!token) throw new Error('尚未設定 Token');
    
    const url = `https://api.github.com${path}`;
    const opts = {
      method: method,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    };
    if (body) opts.body = JSON.stringify(body);
    
    const res = await fetch(url, opts);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Gist API ${res.status}: ${txt}`);
    }
    return res.json();
  },

  // 載入 Gist（同時取得主資料 + 歷史）
  async loadFromGist() {
    const gistId = this.getGistId();
    if (!gistId) throw new Error('尚未設定 Gist ID');
    
    const gist = await this.gistRequest('GET', `/gists/${gistId}`);
    const files = gist.files || {};
    
    // 主資料
    let portfolio = null;
    const mainFile = files[CONFIG.GIST_FILES.MAIN];
    if (mainFile && mainFile.content) {
      try {
        portfolio = JSON.parse(mainFile.content);
      } catch (e) {
        console.error('[Storage] 解析 portfolio.json 失敗:', e);
      }
    }
    
    // 歷史資料
    let history = null;
    const histFile = files[CONFIG.GIST_FILES.HISTORY];
    if (histFile && histFile.content) {
      try {
        history = JSON.parse(histFile.content);
      } catch (e) {
        console.error('[Storage] 解析 history.json 失敗:', e);
      }
    }
    
    // 自動遷移
    if (portfolio && Migration.isV1(portfolio)) {
      console.log('[Storage] 偵測到 v1 資料，自動升級...');
      portfolio = Migration.migrate(portfolio);
      // 升級後立即推回 Gist
      await this.saveToGist(portfolio, history || DataStructure.getDefaultHistory());
    }
    
    return {
      portfolio: portfolio || DataStructure.getDefaultPortfolio(),
      history: history || DataStructure.getDefaultHistory()
    };
  },

  // 儲存到 Gist（主資料 + 歷史）
  async saveToGist(portfolio, history) {
    const gistId = this.getGistId();
    if (!gistId) throw new Error('尚未設定 Gist ID');
    
    portfolio.lastUpdate = new Date().toISOString();
    portfolio.version = CONFIG.VERSION;
    if (history) history.version = CONFIG.VERSION;
    
    const files = {};
    files[CONFIG.GIST_FILES.MAIN] = {
      content: JSON.stringify(portfolio, null, 2)
    };
    if (history) {
      files[CONFIG.GIST_FILES.HISTORY] = {
        content: JSON.stringify(history, null, 2)
      };
    }
    
    await this.gistRequest('PATCH', `/gists/${gistId}`, { files });
    this.setLastSync(new Date().toISOString());
    return true;
  }
};

// 全域曝露
window.Storage = Storage;

console.log('[04-storage.js] ✅ Storage 已載入');

/* ============================================================
 * 💾 04-storage.js - 儲存層（localStorage + GitHub Gist）
 * ============================================================
 * 用途：
 *   1. localStorage 讀寫（portfolio + history）
 *   2. Token / Gist ID 管理
 *   3. GitHub Gist 雲端同步（讀取 / 寫入）
 * 依賴：CONFIG, Utils
 * 對外：Storage（全域變數）
 * ============================================================ */
'use strict';

const Storage = {
  // ============================================================
  // 🔑 Token / Gist ID 管理
  // ============================================================
  getToken() {
    try { return localStorage.getItem(CONFIG.STORAGE.TOKEN_KEY) || ''; }
    catch (e) { return ''; }
  },
  setToken(token) {
    try { localStorage.setItem(CONFIG.STORAGE.TOKEN_KEY, token || ''); return true; }
    catch (e) { console.error('[Storage] setToken 失敗:', e); return false; }
  },
  clearToken() {
    try { localStorage.removeItem(CONFIG.STORAGE.TOKEN_KEY); return true; }
    catch (e) { return false; }
  },
  getGistId() {
    try { return localStorage.getItem(CONFIG.STORAGE.GIST_ID_KEY) || ''; }
    catch (e) { return ''; }
  },
  setGistId(id) {
    try { localStorage.setItem(CONFIG.STORAGE.GIST_ID_KEY, id || ''); return true; }
    catch (e) { return false; }
  },
  getLastSync() {
    try { return localStorage.getItem(CONFIG.STORAGE.LAST_SYNC_KEY) || ''; }
    catch (e) { return ''; }
  },
  setLastSync(iso) {
    try { localStorage.setItem(CONFIG.STORAGE.LAST_SYNC_KEY, iso || new Date().toISOString()); return true; }
    catch (e) { return false; }
  },

  // ============================================================
  // 💾 localStorage：Portfolio
  // ============================================================
  loadLocal() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE.PORTFOLIO_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed || null;
    } catch (e) {
      console.error('[Storage] loadLocal 失敗:', e);
      return null;
    }
  },
  saveLocal(portfolio) {
    try {
      if (!portfolio) return false;
      localStorage.setItem(CONFIG.STORAGE.PORTFOLIO_KEY, JSON.stringify(portfolio));
      return true;
    } catch (e) {
      console.error('[Storage] saveLocal 失敗:', e);
      return false;
    }
  },
  clearLocal() {
    try { localStorage.removeItem(CONFIG.STORAGE.PORTFOLIO_KEY); return true; }
    catch (e) { return false; }
  },

  // ============================================================
  // 💾 localStorage：History（快照 + 交易紀錄）
  // ============================================================
  loadLocalHistory() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE.HISTORY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed || null;
    } catch (e) {
      console.error('[Storage] loadLocalHistory 失敗:', e);
      return null;
    }
  },
  saveLocalHistory(history) {
    try {
      if (!history) return false;
      localStorage.setItem(CONFIG.STORAGE.HISTORY_KEY, JSON.stringify(history));
      return true;
    } catch (e) {
      console.error('[Storage] saveLocalHistory 失敗:', e);
      return false;
    }
  },
  clearLocalHistory() {
    try { localStorage.removeItem(CONFIG.STORAGE.HISTORY_KEY); return true; }
    catch (e) { return false; }
  },

  // ============================================================
  // ☁️ GitHub Gist：讀取
  // ============================================================
  async loadFromGist() {
    const token = this.getToken();
    const gistId = this.getGistId();
    if (!token) throw new Error('未設定 GitHub Token');
    if (!gistId) throw new Error('未設定 Gist ID');

    const url = `${CONFIG.API.GITHUB_BASE}/gists/${gistId}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Gist 讀取失敗 (${resp.status}): ${txt.slice(0, 100)}`);
    }

    const data = await resp.json();
    const files = data.files || {};

    // 抓 portfolio.json
    let portfolio = null;
    if (files[CONFIG.API.PORTFOLIO_FILENAME]?.content) {
      try { portfolio = JSON.parse(files[CONFIG.API.PORTFOLIO_FILENAME].content); }
      catch (e) { console.error('[Storage] portfolio.json 解析失敗:', e); }
    }

    // 抓 history.json
    let history = null;
    if (files[CONFIG.API.HISTORY_FILENAME]?.content) {
      try { history = JSON.parse(files[CONFIG.API.HISTORY_FILENAME].content); }
      catch (e) { console.error('[Storage] history.json 解析失敗:', e); }
    }

    // 自動遷移舊版
    if (portfolio && typeof Migration !== 'undefined' && Migration.isV1?.(portfolio)) {
      console.log('[Storage] 偵測到 v1 格式，自動遷移...');
      portfolio = Migration.migrate(portfolio);
    }

    // 預設值
    if (!portfolio && typeof DataStructure !== 'undefined') {
      portfolio = DataStructure.getDefaultPortfolio();
    }
    if (!history && typeof DataStructure !== 'undefined') {
      history = DataStructure.getDefaultHistory();
    }

    // 同步寫入本地
    if (portfolio) this.saveLocal(portfolio);
    if (history) this.saveLocalHistory(history);
    this.setLastSync(new Date().toISOString());

    return { portfolio, history, raw: data };
  },

  // ============================================================
  // ☁️ GitHub Gist：寫入（PATCH）
  // ============================================================
  async saveToGist(portfolio, history) {
    const token = this.getToken();
    const gistId = this.getGistId();
    if (!token) throw new Error('未設定 GitHub Token');
    if (!gistId) throw new Error('未設定 Gist ID');

    const files = {};
    if (portfolio) {
      files[CONFIG.API.PORTFOLIO_FILENAME] = { content: JSON.stringify(portfolio, null, 2) };
    }
    if (history) {
      files[CONFIG.API.HISTORY_FILENAME] = { content: JSON.stringify(history, null, 2) };
    }

    const url = `${CONFIG.API.GITHUB_BASE}/gists/${gistId}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files })
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Gist 寫入失敗 (${resp.status}): ${txt.slice(0, 100)}`);
    }

    this.setLastSync(new Date().toISOString());
    return await resp.json();
  },

  // ============================================================
  // ☁️ GitHub Gist：建立新的（首次設定用）
  // ============================================================
  async createGist(portfolio, history, isPublic = false) {
    const token = this.getToken();
    if (!token) throw new Error('未設定 GitHub Token');

    const files = {};
    files[CONFIG.API.PORTFOLIO_FILENAME] = {
      content: JSON.stringify(portfolio || {}, null, 2)
    };
    files[CONFIG.API.HISTORY_FILENAME] = {
      content: JSON.stringify(history || {}, null, 2)
    };

    const url = `${CONFIG.API.GITHUB_BASE}/gists`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: '投資組合管理 v' + CONFIG.VERSION,
        public: isPublic,
        files
      })
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`建立 Gist 失敗 (${resp.status}): ${txt.slice(0, 100)}`);
    }

    const data = await resp.json();
    this.setGistId(data.id);
    this.setLastSync(new Date().toISOString());
    return data;
  }
};

// 全域曝露
window.Storage = Storage;

console.log('[04-storage.js] ✅ Storage 已載入');

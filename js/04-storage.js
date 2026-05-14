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

// ============================================================
// 🔧 取出 CONFIG 中的 key 名稱（容錯：兩種命名都支援）
// ============================================================
const _STORAGE_KEYS = (CONFIG.STORAGE_KEYS || CONFIG.STORAGE || {});
const KEY_PORTFOLIO = _STORAGE_KEYS.PORTFOLIO || 'portfolio_v2';
const KEY_HISTORY   = _STORAGE_KEYS.HISTORY   || 'portfolio_history_v2';
const KEY_TOKEN     = _STORAGE_KEYS.TOKEN     || _STORAGE_KEYS.TOKEN_KEY    || 'gh_token';
const KEY_GIST_ID   = _STORAGE_KEYS.GIST_ID   || _STORAGE_KEYS.GIST_ID_KEY  || 'gh_gist_id';
const KEY_LAST_SYNC = _STORAGE_KEYS.LAST_SYNC || _STORAGE_KEYS.LAST_SYNC_KEY|| 'last_sync_at';

const _API = (CONFIG.API || {});
const API_BASE = _API.GITHUB_BASE || _API.BASE || 'https://api.github.com';
const FILENAME_PORTFOLIO = _API.PORTFOLIO_FILENAME || _API.FILE_PORTFOLIO || 'portfolio.json';
const FILENAME_HISTORY   = _API.HISTORY_FILENAME   || _API.FILE_HISTORY   || 'history.json';

const Storage = {
  // ============================================================
  // 🔑 Token / Gist ID 管理
  // ============================================================
  getToken() {
    try { return localStorage.getItem(KEY_TOKEN) || ''; }
    catch (e) { return ''; }
  },
  setToken(token) {
    try { localStorage.setItem(KEY_TOKEN, token || ''); return true; }
    catch (e) { console.error('[Storage] setToken 失敗:', e); return false; }
  },
  clearToken() {
    try { localStorage.removeItem(KEY_TOKEN); return true; }
    catch (e) { return false; }
  },
  getGistId() {
    try { return localStorage.getItem(KEY_GIST_ID) || ''; }
    catch (e) { return ''; }
  },
  setGistId(id) {
    try { localStorage.setItem(KEY_GIST_ID, id || ''); return true; }
    catch (e) { return false; }
  },
  getLastSync() {
    try { return localStorage.getItem(KEY_LAST_SYNC) || ''; }
    catch (e) { return ''; }
  },
  setLastSync(iso) {
    try { localStorage.setItem(KEY_LAST_SYNC, iso || new Date().toISOString()); return true; }
    catch (e) { return false; }
  },

  // ============================================================
  // 💾 localStorage：Portfolio
  // ============================================================
  loadLocal() {
    try {
      const raw = localStorage.getItem(KEY_PORTFOLIO);
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
      localStorage.setItem(KEY_PORTFOLIO, JSON.stringify(portfolio));
      return true;
    } catch (e) {
      console.error('[Storage] saveLocal 失敗:', e);
      return false;
    }
  },
  clearLocal() {
    try { localStorage.removeItem(KEY_PORTFOLIO); return true; }
    catch (e) { return false; }
  },

  // ============================================================
  // 💾 localStorage：History（快照 + 交易紀錄）
  // ============================================================
  loadLocalHistory() {
    try {
      const raw = localStorage.getItem(KEY_HISTORY);
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
      localStorage.setItem(KEY_HISTORY, JSON.stringify(history));
      return true;
    } catch (e) {
      console.error('[Storage] saveLocalHistory 失敗:', e);
      return false;
    }
  },
  clearLocalHistory() {
    try { localStorage.removeItem(KEY_HISTORY); return true; }
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

    const url = `${API_BASE}/gists/${gistId}`;
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
    if (files[FILENAME_PORTFOLIO]?.content) {
      try { portfolio = JSON.parse(files[FILENAME_PORTFOLIO].content); }
      catch (e) { console.error('[Storage] portfolio.json 解析失敗:', e); }
    }

    // 抓 history.json
    let history = null;
    if (files[FILENAME_HISTORY]?.content) {
      try { history = JSON.parse(files[FILENAME_HISTORY].content); }
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
      files[FILENAME_PORTFOLIO] = { content: JSON.stringify(portfolio, null, 2) };
    }
    if (history) {
      files[FILENAME_HISTORY] = { content: JSON.stringify(history, null, 2) };
    }

    const url = `${API_BASE}/gists/${gistId}`;
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
    files[FILENAME_PORTFOLIO] = {
      content: JSON.stringify(portfolio || {}, null, 2)
    };
    files[FILENAME_HISTORY] = {
      content: JSON.stringify(history || {}, null, 2)
    };

    const url = `${API_BASE}/gists`;
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

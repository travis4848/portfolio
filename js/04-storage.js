/* ============================================================
 * 04-storage.js — v3 儲存層（相容 09-store.js）
 * ============================================================
 * 提供：
 *   - loadLocal() / saveLocal()           → portfolio
 *   - loadLocalHistory() / saveLocalHistory()  → history
 *   - loadFromGist() / saveToGist()       → 雲端
 * ============================================================ */
'use strict';

const Storage = {

  // ========== Token / Gist ID ==========
  getToken()      { return localStorage.getItem(CONFIG.TOKEN_KEY) || ''; },
  setToken(t)     { localStorage.setItem(CONFIG.TOKEN_KEY, t); },
  getGistId()     { return localStorage.getItem(CONFIG.GIST_ID_KEY) || ''; },
  setGistId(id)   { localStorage.setItem(CONFIG.GIST_ID_KEY, id); },
  getLastSync()   { return localStorage.getItem(CONFIG.LAST_SYNC_KEY) || ''; },
  setLastSync(t)  { localStorage.setItem(CONFIG.LAST_SYNC_KEY, t); },

  // ========== Portfolio（本地）==========
  loadLocal() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) {
        console.log('[Storage] 本地無 portfolio，建立預設');
        return DataStructure.getDefaultPortfolio();
      }
      const data = JSON.parse(raw);
      const ver = data.version || '1.0.0';

      if (!ver.startsWith('3.')) {
        console.log(`[Storage] portfolio 版本 ${ver}，自動遷移到 v3`);
        const migrated = DataStructure.migrate(data);
        this.saveLocal(migrated);
        return migrated;
      }
      return DataStructure._ensureV3(data);
    } catch (e) {
      console.error('[Storage] 載入 portfolio 失敗:', e);
      return DataStructure.getDefaultPortfolio();
    }
  },

  saveLocal(portfolio) {
    try {
      if (!portfolio) return false;
      portfolio.updatedAt = new Date().toISOString();
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(portfolio));
      return true;
    } catch (e) {
      console.error('[Storage] 儲存 portfolio 失敗:', e);
      return false;
    }
  },

  // ========== History（本地）==========
  loadLocalHistory() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY + '_history');
      if (!raw) return DataStructure.getDefaultHistory();
      const data = JSON.parse(raw);
      // 補欄位
      if (!Array.isArray(data.transactions)) data.transactions = [];
      if (!Array.isArray(data.snapshots)) data.snapshots = [];
      if (!data.version) data.version = '3.0.0';
      return data;
    } catch (e) {
      console.error('[Storage] 載入 history 失敗:', e);
      return DataStructure.getDefaultHistory();
    }
  },

  saveLocalHistory(history) {
    try {
      if (!history) return false;
      localStorage.setItem(CONFIG.STORAGE_KEY + '_history', JSON.stringify(history));
      return true;
    } catch (e) {
      console.error('[Storage] 儲存 history 失敗:', e);
      return false;
    }
  },

  // ========== Gist：載入 ==========
  async loadFromGist() {
    const token = this.getToken();
    const gistId = this.getGistId();
    if (!token || !gistId) {
      throw new Error('未設定 GitHub Token 或 Gist ID');
    }

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!res.ok) throw new Error(`Gist 讀取失敗 HTTP ${res.status}`);
    const gist = await res.json();

    let portfolio = null;
    let history = null;

    // 主檔 portfolio.json
    const portFile = gist.files[CONFIG.GIST_FILENAME] || gist.files['portfolio.json'];
    if (portFile && portFile.content) {
      portfolio = DataStructure.migrate(JSON.parse(portFile.content));
    }

    // 副檔 history.json（若存在）
    const histFile = gist.files['history.json'];
    if (histFile && histFile.content) {
      history = JSON.parse(histFile.content);
      if (!Array.isArray(history.transactions)) history.transactions = [];
      if (!Array.isArray(history.snapshots)) history.snapshots = [];
    } else {
      history = DataStructure.getDefaultHistory();
    }

    if (!portfolio) portfolio = DataStructure.getDefaultPortfolio();

    this.saveLocal(portfolio);
    this.saveLocalHistory(history);
    this.setLastSync(new Date().toISOString());

    console.log('[Storage] ☁️ 從 Gist 載入完成');
    return { portfolio, history };
  },

  // ========== Gist：儲存 ==========
  async saveToGist(portfolio, history) {
    const token = this.getToken();
    if (!token) throw new Error('未設定 GitHub Token');

    let gistId = this.getGistId();
    const body = {
      description: `投資組合 v${CONFIG.VERSION} - ${new Date().toLocaleString('zh-TW')}`,
      files: {
        [CONFIG.GIST_FILENAME]: {
          content: JSON.stringify(portfolio || {}, null, 2)
        },
        'history.json': {
          content: JSON.stringify(history || {}, null, 2)
        }
      }
    };

    let res;
    if (gistId) {
      res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    } else {
      body.public = false;
      res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gist 寫入失敗 HTTP ${res.status}: ${err}`);
    }

    const gist = await res.json();
    if (!gistId) {
      this.setGistId(gist.id);
      console.log('[Storage] 已建立新 Gist:', gist.id);
    }
    this.setLastSync(new Date().toISOString());
    console.log('[Storage] ☁️ 已推送到 Gist');
    return gist;
  }
  // ============================================================
  // 期貨權益數（單一帳戶）
  // ============================================================
  KEY_FUTURES_EQUITY: 'futures_equity',

  getFuturesEquity() {
    const v = localStorage.getItem(this.KEY_FUTURES_EQUITY);
    return v ? parseFloat(v) : 0;
  },

  setFuturesEquity(amount) {
    localStorage.setItem(this.KEY_FUTURES_EQUITY, String(amount || 0));
  },


};

window.Storage = Storage;
console.log('[04-storage.js] ✅ Storage 已載入（v3 陣列版相容）');

/* ============================================================
 * 04-storage.js — 儲存層 v3（本地 + GitHub Gist）
 * ============================================================ */
'use strict';

const Storage = {

  // ========== 本地 ==========
  loadLocal() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) {
        console.log('[Storage] 本地無資料，建立 v3 空結構');
        return DataStructure.createEmpty();
      }
      const data = JSON.parse(raw);
      const ver = data.version || '1.0.0';
      console.log(`[Storage] 偵測到 ${ver} 格式`);

      // 自動遷移
      if (!ver.startsWith('3.')) {
        console.log('[Storage] 自動遷移至 v3...');
        const migrated = DataStructure.migrate(data);
        this.saveLocal(migrated);
        return migrated;
      }

      // 已是 v3 但補欄位
      return DataStructure._ensureV3Fields(data);
    } catch (e) {
      console.error('[Storage] 載入本地失敗:', e);
      return DataStructure.createEmpty();
    }
  },

  saveLocal(data) {
    try {
      data.updatedAt = new Date().toISOString();
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('[Storage] 儲存本地失敗:', e);
      return false;
    }
  },

  // ========== Token / Gist ID ==========
  getToken() {
    return localStorage.getItem(CONFIG.TOKEN_KEY) || '';
  },
  setToken(t) {
    localStorage.setItem(CONFIG.TOKEN_KEY, t);
  },
  getGistId() {
    return localStorage.getItem(CONFIG.GIST_ID_KEY) || '';
  },
  setGistId(id) {
    localStorage.setItem(CONFIG.GIST_ID_KEY, id);
  },
  getLastSync() {
    return localStorage.getItem(CONFIG.LAST_SYNC_KEY) || '';
  },
  setLastSync(t) {
    localStorage.setItem(CONFIG.LAST_SYNC_KEY, t);
  },

  // ========== Gist 載入 ==========
  async loadFromGist() {
    const token = this.getToken();
    const gistId = this.getGistId();
    if (!token || !gistId) {
      console.log('[Storage] 無 Token 或 Gist ID，跳過雲端載入');
      return null;
    }

    try {
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const gist = await res.json();
      const file = gist.files[CONFIG.GIST_FILENAME];
      if (!file) {
        console.log('[Storage] Gist 中無 portfolio.json');
        return null;
      }

      const data = JSON.parse(file.content);
      const migrated = DataStructure.migrate(data);
      this.saveLocal(migrated);
      this.setLastSync(new Date().toISOString());
      console.log('[Storage] ☁️ 從 Gist 載入成功');
      return migrated;
    } catch (e) {
      console.error('[Storage] Gist 載入失敗:', e);
      throw e;
    }
  },

  // ========== Gist 儲存 ==========
  async saveToGist(data) {
    const token = this.getToken();
    if (!token) throw new Error('未設定 GitHub Token');

    let gistId = this.getGistId();
    const body = {
      description: `投資組合 v${CONFIG.VERSION} - ${new Date().toLocaleString('zh-TW')}`,
      files: {
        [CONFIG.GIST_FILENAME]: {
          content: JSON.stringify(data, null, 2)
        }
      }
    };

    try {
      let res;
      if (gistId) {
        // 更新
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
        // 建立
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
        throw new Error(`HTTP ${res.status}: ${err}`);
      }

      const gist = await res.json();
      if (!gistId) {
        this.setGistId(gist.id);
        console.log('[Storage] 建立新 Gist：', gist.id);
      }
      this.setLastSync(new Date().toISOString());
      console.log('[Storage] ☁️ 已推送至 Gist');
      return gist;
    } catch (e) {
      console.error('[Storage] Gist 儲存失敗:', e);
      throw e;
    }
  }
};

window.Storage = Storage;
console.log('[04-storage.js] ✅ Storage 已載入（v3 相容）');

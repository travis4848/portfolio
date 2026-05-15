/* ============================================================
 * 🛒 16-trade-modal.js - 交易下單 Modal 系統
 * ============================================================
 * 用途：
 *   - 集中管理所有交易 Modal（融資、融券、期貨、現股）
 *   - 提供即時試算、智慧自動完成、手續費計算
 * 依賴：CONFIG, Store, Storage, StockDB, UI（toast）
 * 對外：TradeModal（全域變數）
 * ============================================================ */
'use strict';

const TradeModal = {

  // ============================================================
  // 🔧 共用工具
  // ============================================================

  _toast(msg, type = 'success') {
    if (typeof UI !== 'undefined' && UI.toast) {
      UI.toast(msg, type);
    } else {
      console.log(`[Toast/${type}]`, msg);
    }
  },

  _fmt(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return Math.round(n).toLocaleString('zh-TW');
  },

  // ============================================================
  // 🔍 智慧搜尋（從 StockDB 模糊比對代號或名稱）
  // ============================================================
  searchStocks(keyword, limit = 8) {
    if (!keyword || typeof StockDB === 'undefined' || !StockDB.stocks) return [];

    const kw = String(keyword).trim().toUpperCase();
    if (!kw) return [];

    const all = StockDB.stocks;
    const exact = [];      // 代號完全相符（最優先）
    const startsCode = []; // 代號開頭符合
    const startsName = []; // 名稱開頭符合
    const includes = [];   // 名稱或代號包含

    for (const code in all) {
      const item = all[code];
      const symbolUpper = code.toUpperCase();
      const name = item.name || '';
      const nameUpper = name.toUpperCase();

      if (symbolUpper === kw) {
        exact.push({ symbol: code, name });
      } else if (symbolUpper.startsWith(kw)) {
        startsCode.push({ symbol: code, name });
      } else if (nameUpper.startsWith(kw) || name.startsWith(kw)) {
        startsName.push({ symbol: code, name });
      } else if (symbolUpper.includes(kw) || nameUpper.includes(kw) || name.includes(kw)) {
        includes.push({ symbol: code, name });
      }

      // 提早結束（效能優化）
      if (exact.length + startsCode.length + startsName.length + includes.length >= limit * 3) break;
    }

    // 合併、依優先序、限制數量
    return [...exact, ...startsCode, ...startsName, ...includes].slice(0, limit);
  },

  // ============================================================
  // ⚡ 抓即時報價（用 PriceFetcher）
  // ============================================================
  async fetchStockPrice(symbol) {
    if (!symbol) return null;
    const sym = String(symbol).trim().toUpperCase();

    if (typeof PriceFetcher !== 'undefined' && PriceFetcher.fetchOne) {
      try {
        const r = await PriceFetcher.fetchOne(sym, 'TW', { useCache: false });
        if (r && r.price != null && !isNaN(r.price)) return Number(r.price);
      } catch (err) {
        console.warn('[TradeModal] PriceFetcher 失敗:', err.message);
        return null;
      }
    }
    return null;
  },

  // ============================================================
  // 🎯 自動完成下拉選單（綁定到輸入框）
  // ============================================================
  _attachAutocomplete($input, onSelect) {
    // 建立 dropdown 容器
    const dropdown = document.createElement('div');
    dropdown.className = 'tm-autocomplete-dropdown';
    dropdown.style.cssText = `
      position: absolute;
      background: #1e293b;
      border: 1px solid #475569;
      border-radius: 6px;
      max-height: 240px;
      overflow-y: auto;
      z-index: 10000;
      display: none;
      min-width: 220px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;
    document.body.appendChild(dropdown);

    let activeIndex = -1;
    let currentItems = [];

    const positionDropdown = () => {
      const rect = $input.getBoundingClientRect();
      dropdown.style.left = `${rect.left + window.scrollX}px`;
      dropdown.style.top = `${rect.bottom + window.scrollY + 2}px`;
      dropdown.style.width = `${rect.width}px`;
    };

    const renderItems = (items) => {
      currentItems = items;
      activeIndex = -1;
      if (items.length === 0) {
        dropdown.style.display = 'none';
        return;
      }
      dropdown.innerHTML = items.map((it, i) => `
        <div class="tm-ac-item" data-idx="${i}" 
             style="padding:8px 12px; cursor:pointer; display:flex; gap:10px; border-bottom:1px solid #334155;">
          <strong style="color:#60a5fa; min-width:60px;">${it.symbol}</strong>
          <span style="color:#e2e8f0;">${it.name}</span>
        </div>
      `).join('');
      positionDropdown();
      dropdown.style.display = 'block';

      // 綁定點擊
      dropdown.querySelectorAll('.tm-ac-item').forEach(el => {
        el.addEventListener('mouseenter', () => setActive(Number(el.dataset.idx)));
        el.addEventListener('mousedown', (e) => {
          // 用 mousedown 而不是 click，避免 input blur 先觸發
          e.preventDefault();
          select(Number(el.dataset.idx));
        });
      });
    };

    const setActive = (idx) => {
      activeIndex = idx;
      dropdown.querySelectorAll('.tm-ac-item').forEach((el, i) => {
        el.style.background = (i === idx) ? '#334155' : 'transparent';
      });
    };

    const select = (idx) => {
      if (idx < 0 || idx >= currentItems.length) return;
      const item = currentItems[idx];
      dropdown.style.display = 'none';
      onSelect(item);
    };

    // input 事件
    let timer = null;
    $input.addEventListener('input', () => {
      clearTimeout(timer);
      const kw = $input.value.trim();
      if (!kw) {
        dropdown.style.display = 'none';
        return;
      }
      timer = setTimeout(() => {
        const items = TradeModal.searchStocks(kw, 8);
        renderItems(items);
      }, 100);
    });

    // 鍵盤操作
    $input.addEventListener('keydown', (e) => {
      if (dropdown.style.display === 'none') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(Math.min(activeIndex + 1, currentItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0) {
          e.preventDefault();
          select(activeIndex);
        }
      } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
      }
    });

    // blur 隱藏
    $input.addEventListener('blur', () => {
      setTimeout(() => { dropdown.style.display = 'none'; }, 150);
    });

    // 視窗滾動/resize 重新定位
    window.addEventListener('scroll', positionDropdown, true);
    window.addEventListener('resize', positionDropdown);

    // 回傳銷毀函式
    return () => {
      dropdown.remove();
      window.removeEventListener('scroll', positionDropdown, true);
      window.removeEventListener('resize', positionDropdown);
    };
  },

  // ============================================================
  // 通用：建立 Modal 殼
  // ============================================================
  _buildModal(id, title, bodyHtml, footerHtml) {
    const old = document.getElementById(id);
    if (old) old.remove();

    const wrapper = document.createElement('div');
    wrapper.className = 'modal-mask';
    wrapper.id = id;
    wrapper.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${title}</div>
          <button class="modal-close" data-close>✕</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-footer">${footerHtml}</div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const cleanups = [];

    wrapper.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal());
    });
    wrapper.addEventListener('click', (e) => {
      if (e.target === wrapper) closeModal();
    });
    const escHandler = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', escHandler);

    function closeModal() {
      cleanups.forEach(fn => { try { fn(); } catch (e) {} });
      document.removeEventListener('keydown', escHandler);
      wrapper.remove();
    }

    wrapper._addCleanup = (fn) => cleanups.push(fn);
    wrapper._close = closeModal;

    return wrapper;
  },

  // ============================================================
  // 💎 開啟「融資買進 / 融券賣出」Modal
  // ============================================================
  openMarginOpenModal({ defaultType = 'long', defaultSymbol = '' } = {}) {
    const today = new Date().toISOString().slice(0, 10);

    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">類型</label>
        <div style="display:flex; gap:20px; padding:6px 0;">
          <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
            <input type="radio" name="mtype" value="long" ${defaultType === 'long' ? 'checked' : ''}>
            <span class="up" style="font-weight:600;">融資買進</span>
          </label>
          <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
            <input type="radio" name="mtype" value="short" ${defaultType === 'short' ? 'checked' : ''}>
            <span class="down" style="font-weight:600;">融券賣出</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">股票代號 / 名稱 <span style="color:#ef4444;">*</span> 
          <span class="muted" style="font-size:11px; font-weight:normal;">（輸入代號或名稱，例：2330 或 台積）</span>
        </label>
        <input class="form-input" type="text" id="mtm-search" 
               placeholder="輸入代號或公司名稱..." autocomplete="off">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">股票代號</label>
          <input class="form-input" type="text" id="mtm-symbol" placeholder="自動帶入" 
                 style="text-transform:uppercase;" value="${defaultSymbol}">
        </div>
        <div class="form-group">
          <label class="form-label">股票名稱</label>
          <input class="form-input" type="text" id="mtm-name" placeholder="自動帶入">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">股數 <span style="color:#ef4444;">*</span></label>
          <input class="form-input" type="number" id="mtm-shares" placeholder="1000" min="0" step="1000">
        </div>
        <div class="form-group">
          <label class="form-label">價格 <span style="color:#ef4444;">*</span></label>
          <div style="display:flex; gap:4px;">
            <input class="form-input" type="number" id="mtm-price" placeholder="0.00" min="0" step="0.01" style="flex:1;">
            <button type="button" id="mtm-fetch-price" class="btn btn-warning" style="padding:0 10px; white-space:nowrap;" title="抓取即時報價">⚡</button>
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">日期</label>
          <input class="form-input" type="date" id="mtm-date" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">
            手續費
            <label style="font-weight:normal; font-size:12px; margin-left:8px; cursor:pointer;">
              <input type="checkbox" id="mtm-fee-manual" style="vertical-align:middle;"> 手動覆蓋
            </label>
          </label>
          <input class="form-input" type="number" id="mtm-fee" placeholder="自動計算" min="0" step="1" disabled>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">備註</label>
        <input class="form-input" type="text" id="mtm-note" placeholder="（選填）">
      </div>

      <div id="mtm-preview" style="background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.3); border-radius:8px; padding:12px; margin-top:8px;">
        <div style="font-weight:600; color:#a5b4fc; margin-bottom:8px;">💡 試算</div>
        <div id="mtm-preview-content" style="font-size:13px; line-height:1.8;">
          <span class="muted">請輸入股數與價格...</span>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" data-close>取消</button>
      <button class="btn btn-primary" id="mtm-submit">✅ 確認下單</button>
    `;

    const modal = this._buildModal('margin-open-modal', '💎 融資 / 融券 開倉', bodyHtml, footerHtml);

    const $ = sel => modal.querySelector(sel);
    const getType = () => $('input[name="mtype"]:checked').value;

    const $search = $('#mtm-search');
    const $symbol = $('#mtm-symbol');
    const $name = $('#mtm-name');
    const $shares = $('#mtm-shares');
    const $price = $('#mtm-price');
    const $date = $('#mtm-date');
    const $feeManual = $('#mtm-fee-manual');
    const $fee = $('#mtm-fee');
    const $note = $('#mtm-note');
    const $fetchPrice = $('#mtm-fetch-price');
    const $previewContent = $('#mtm-preview-content');
    const $submit = $('#mtm-submit');

    // ---------- 試算 ----------
    const updatePreview = () => {
      const type = getType();
      const shares = Number($shares.value) || 0;
      const price = Number($price.value) || 0;

      if (shares <= 0 || price <= 0) {
        $previewContent.innerHTML = '<span class="muted">請輸入股數與價格...</span>';
        return;
      }

      const subtotal = shares * price;
      const settings = (Store.getSettings && Store.getSettings()) || {};
      const discount = settings.brokerFeeDiscount ?? CONFIG?.BROKER_FEE_DISCOUNT ?? 0.28;
      const feeRate = CONFIG?.BROKER_FEE_RATE ?? 0.001425;
      const minFee = CONFIG?.BROKER_FEE_MIN ?? 20;
      const autoFee = Math.max(minFee, Math.round(subtotal * feeRate * discount));
      const fee = $feeManual.checked ? (Number($fee.value) || 0) : autoFee;
      if (!$feeManual.checked) $fee.value = autoFee;

      const cfg = (CONFIG.MARGIN && CONFIG.MARGIN[type === 'long' ? 'LONG' : 'SHORT']) || {};

      let html = '';
      if (type === 'long') {
        const loanRate = cfg.LOAN_RATE ?? 0.6;
        const loan = Math.floor(subtotal * loanRate);
        const selfPay = subtotal - loan + fee;
        const effectiveCost = (subtotal + fee) / shares;
        html = `
          <div>📊 成交金額：<strong>${this._fmt(subtotal)}</strong></div>
          <div>💰 融資金額：<strong class="up">${this._fmt(loan)}</strong> <span class="muted">(${(loanRate * 100).toFixed(0)}%)</span></div>
          <div>🧾 手續費：<strong>${this._fmt(fee)}</strong></div>
          <div>💵 自備款：<strong style="color:#fbbf24;">${this._fmt(selfPay)}</strong></div>
          <div>📈 實際成本：<strong>${effectiveCost.toFixed(2)} 元/股</strong></div>
        `;
      } else {
        const depositRate = cfg.DEPOSIT_RATE ?? 0.9;
        const shortFeeRate = cfg.FEE_RATE ?? 0.0008;
        const deposit = Math.floor(subtotal * depositRate);
        const shortFee = Math.round(subtotal * shortFeeRate);
        const totalCost = deposit + fee + shortFee;
        const effectiveCost = (subtotal - fee - shortFee) / shares;
        html = `
          <div>📊 成交金額：<strong>${this._fmt(subtotal)}</strong></div>
          <div>🔒 保證金：<strong style="color:#fbbf24;">${this._fmt(deposit)}</strong> <span class="muted">(${(depositRate * 100).toFixed(0)}%)</span></div>
          <div>🧾 手續費：<strong>${this._fmt(fee)}</strong></div>
          <div>💸 借券費：<strong>${this._fmt(shortFee)}</strong> <span class="muted">(${(shortFeeRate * 100).toFixed(2)}%)</span></div>
          <div>💵 應付總額：<strong class="down">${this._fmt(totalCost)}</strong></div>
          <div>📉 實際成本：<strong>${effectiveCost.toFixed(2)} 元/股</strong></div>
        `;
      }
      $previewContent.innerHTML = html;
    };

    // ---------- 自動完成 ----------
    const cleanupAC = this._attachAutocomplete($search, (item) => {
      $symbol.value = item.symbol;
      $name.value = item.name;
      $search.value = `${item.symbol}  ${item.name}`;
      // 自動 focus 到股數
      setTimeout(() => $shares.focus(), 50);
    });
    modal._addCleanup(cleanupAC);

    // 如果有 defaultSymbol，嘗試自動帶名稱
    if (defaultSymbol && typeof StockDB !== 'undefined' && StockDB.getStock) {
      const found = StockDB.getStock(defaultSymbol);
      if (found && found.name) {
        $name.value = found.name;
        $search.value = `${defaultSymbol}  ${found.name}`;
      }
    }

    // ---------- 事件 ----------
    modal.querySelectorAll('input[name="mtype"]').forEach(r => {
      r.addEventListener('change', updatePreview);
    });
    [$shares, $price, $fee].forEach(el => {
      el.addEventListener('input', updatePreview);
    });

    $feeManual.addEventListener('change', () => {
      $fee.disabled = !$feeManual.checked;
      if (!$feeManual.checked) updatePreview();
      else $fee.focus();
    });

    // ⚡ 抓即時報價
    $fetchPrice.addEventListener('click', async () => {
      const sym = ($symbol.value || '').trim().toUpperCase();
      if (!sym) {
        this._toast('請先選擇股票', 'warning');
        return;
      }
      $fetchPrice.disabled = true;
      $fetchPrice.textContent = '⏳';
      try {
        const p = await this.fetchStockPrice(sym);
        if (p != null) {
          $price.value = p;
          updatePreview();
          this._toast(`✅ 已帶入即時價：${p}`, 'success');
        } else {
          this._toast('抓取報價失敗（PriceFetcher 無回應）', 'warning');
        }
      } catch (err) {
        this._toast('查詢失敗：' + err.message, 'error');
      } finally {
        $fetchPrice.disabled = false;
        $fetchPrice.textContent = '⚡';
      }
    });

    // ---------- 提交 ----------
    $submit.addEventListener('click', () => {
      const type = getType();
      const symbol = ($symbol.value || '').trim().toUpperCase();
      const name = ($name.value || '').trim();
      const shares = Number($shares.value) || 0;
      const price = Number($price.value) || 0;
      const date = $date.value;
      const fee = Number($fee.value) || 0;
      const note = $note.value.trim();

      if (!symbol) { this._toast('請選擇股票', 'error'); $search.focus(); return; }
      if (shares <= 0) { this._toast('股數必須大於 0', 'error'); $shares.focus(); return; }
      if (price <= 0) { this._toast('價格必須大於 0', 'error'); $price.focus(); return; }
      if (!date) { this._toast('請選擇日期', 'error'); return; }

      $submit.disabled = true;
      $submit.textContent = '處理中...';

      try {
        Store.dispatch({
          type: 'MARGIN_BUY',
          payload: {
            symbol, name: name || symbol,
            type, shares, price, fee, date, note,
            market: 'TW'
          }
        });

        const action = type === 'long' ? '融資買進' : '融券賣出';
        this._toast(`✅ ${action} ${symbol} ${this._fmt(shares)} 股 @ ${price}`, 'success');
        modal._close();

        if (typeof UI !== 'undefined' && typeof UI.renderMargin === 'function') {
          UI.renderMargin();
        }
      } catch (err) {
        console.error('[TradeModal] MARGIN_BUY 失敗:', err);
        this._toast('下單失敗：' + err.message, 'error');
        $submit.disabled = false;
        $submit.textContent = '✅ 確認下單';
      }
    });

    updatePreview();
    setTimeout(() => $search.focus(), 100);
  }
};

window.TradeModal = TradeModal;
console.log('[16-trade-modal.js] ✅ TradeModal 已載入（含智慧搜尋）');

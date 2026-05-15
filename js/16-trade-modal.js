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

    const allStocks = [];
    const raw = StockDB.stocks;

    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (!item) continue;
        const symbol = String(item.symbol || item.code || item.id || '').trim();
        const name = String(item.name || '').trim();
        if (symbol) allStocks.push({ symbol, name });
      }
    } else if (typeof raw === 'object') {
      for (const key in raw) {
        const item = raw[key];
        if (!item) continue;
        let symbol = String(item.symbol || item.code || item.id || '').trim();
        if (!symbol) symbol = String(key).trim();
        const name = String(item.name || '').trim();
        if (symbol) allStocks.push({ symbol, name });
      }
    }

    const exact = [];
    const startsCode = [];
    const startsName = [];
    const includes = [];

    for (const item of allStocks) {
      const symbolUpper = item.symbol.toUpperCase();
      const name = item.name;
      const nameUpper = name.toUpperCase();

      if (symbolUpper === kw) {
        exact.push(item);
      } else if (symbolUpper.startsWith(kw)) {
        startsCode.push(item);
      } else if (nameUpper.startsWith(kw) || name.startsWith(kw)) {
        startsName.push(item);
      } else if (symbolUpper.includes(kw) || nameUpper.includes(kw) || name.includes(kw)) {
        includes.push(item);
      }

      if (exact.length + startsCode.length + startsName.length + includes.length >= limit * 3) break;
    }

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

      dropdown.querySelectorAll('.tm-ac-item').forEach(el => {
        el.addEventListener('mouseenter', () => setActive(Number(el.dataset.idx)));
        el.addEventListener('mousedown', (e) => {
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

    $input.addEventListener('blur', () => {
      setTimeout(() => { dropdown.style.display = 'none'; }, 150);
    });

    window.addEventListener('scroll', positionDropdown, true);
    window.addEventListener('resize', positionDropdown);

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
      setTimeout(() => $shares.focus(), 50);
    });
    modal._addCleanup(cleanupAC);

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
  },

  // ============================================================
  // 💰 開啟「融資 / 融券 平倉」Modal
  // ============================================================
  openMarginCloseModal(positionId) {
    const marginList = Store.getMargin() || [];
    const pos = marginList.find(p => p.id === positionId);
    if (!pos) {
      this._toast('❌ 找不到該部位', 'error');
      return;
    }

    // 計算目前持有股數 / 加權成本
    const lots = (pos.lots || []).filter(l => (l.remaining ?? l.shares ?? 0) > 0);
    let totalShares = 0;
    let totalCost = 0;
    lots.forEach(l => {
      const sh = l.remaining ?? l.shares ?? 0;
      const ec = l.effectiveCost ?? l.price ?? 0;
      totalShares += sh;
      totalCost += sh * ec;
    });

    if (totalShares <= 0) {
      this._toast('❌ 此部位已無剩餘股數', 'error');
      return;
    }

    const avgCost = totalCost / totalShares;
    const curPrice = pos.currentPrice || avgCost;
    const isLong = pos.type === 'long';
    const today = new Date().toISOString().slice(0, 10);

    const positionValue = totalShares * curPrice;
    const positionPL = isLong
      ? (positionValue - totalCost)
      : (totalCost - positionValue);
    const positionPLPct = totalCost > 0 ? (positionPL / totalCost) * 100 : 0;

    const typeLabel = isLong
      ? '<span class="up" style="font-weight:600;">💎 融資</span>'
      : '<span class="down" style="font-weight:600;">🩳 融券</span>';
    const closeAction = isLong ? '融資賣出' : '融券回補';

    const bodyHtml = `
      <!-- 部位資訊 -->
      <div style="background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.3); border-radius:8px; padding:14px; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:16px; font-weight:600;">
            ${pos.symbol} <span class="muted">${pos.name || ''}</span>
          </div>
          <div>${typeLabel}</div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; font-size:13px; line-height:1.7;">
          <div>持有股數：<strong>${this._fmt(totalShares)}</strong></div>
          <div>均價：<strong>${avgCost.toFixed(2)}</strong></div>
          <div>現價：<strong>${curPrice.toFixed(2)}</strong></div>
          <div>市值：<strong>${this._fmt(positionValue)}</strong></div>
          <div style="grid-column:1/-1;">
            未實現損益：
            <strong class="${positionPL >= 0 ? 'up' : 'down'}">
              ${positionPL >= 0 ? '+' : ''}${this._fmt(positionPL)}
              (${positionPLPct >= 0 ? '+' : ''}${positionPLPct.toFixed(2)}%)
            </strong>
          </div>
          ${isLong
            ? `<div style="grid-column:1/-1;">融資金額：<strong>${this._fmt(pos.loanAmount || 0)}</strong></div>`
            : `<div style="grid-column:1/-1;">保證金：<strong>${this._fmt(pos.depositAmount || 0)}</strong></div>`
          }
        </div>
      </div>

      <!-- 平倉股數 -->
      <div class="form-group">
        <label class="form-label">
          平倉股數 <span style="color:#ef4444;">*</span>
          <span class="muted" style="font-size:11px; font-weight:normal;">（最多 ${this._fmt(totalShares)} 股）</span>
        </label>
        <input class="form-input" type="number" id="mtc-shares" 
            placeholder="輸入平倉股數" min="1" max="${totalShares}" step="1000">
      </div>

      <!-- 平倉價格 -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">平倉價格 <span style="color:#ef4444;">*</span></label>
          <div style="display:flex; gap:4px;">
            <input class="form-input" type="number" id="mtc-price" 
                   placeholder="0.00" min="0" step="0.01" 
                   value="${curPrice.toFixed(2)}" style="flex:1;">
            <button type="button" id="mtc-fetch-price" class="btn btn-warning" 
                    style="padding:0 10px;" title="抓取即時報價">⚡</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">日期</label>
          <input class="form-input" type="date" id="mtc-date" value="${today}">
        </div>
      </div>

      <!-- 手續費 / 交易稅 -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">
            手續費
            <label style="font-weight:normal; font-size:12px; margin-left:8px; cursor:pointer;">
              <input type="checkbox" id="mtc-fee-manual" style="vertical-align:middle;"> 手動
            </label>
          </label>
          <input class="form-input" type="number" id="mtc-fee" placeholder="自動" min="0" step="1" disabled>
        </div>
        <div class="form-group">
          <label class="form-label">
            交易稅
            <label style="font-weight:normal; font-size:12px; margin-left:8px; cursor:pointer;">
              <input type="checkbox" id="mtc-tax-manual" style="vertical-align:middle;"> 手動
            </label>
          </label>
          <input class="form-input" type="number" id="mtc-tax" placeholder="自動" min="0" step="1" disabled>
        </div>
      </div>

      <!-- 備註 -->
      <div class="form-group">
        <label class="form-label">備註</label>
        <input class="form-input" type="text" id="mtc-note" placeholder="（選填）">
      </div>

      <!-- FIFO 試算 -->
      <div id="mtc-preview" style="background:rgba(34,197,94,0.06); border:1px solid rgba(34,197,94,0.3); border-radius:8px; padding:12px; margin-top:8px;">
        <div style="font-weight:600; color:#86efac; margin-bottom:8px;">💡 FIFO 試算</div>
        <div id="mtc-preview-content" style="font-size:13px; line-height:1.7;">
          <span class="muted">請輸入平倉股數...</span>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" data-close>取消</button>
      <button class="btn btn-danger" id="mtc-submit">💰 確認${closeAction}</button>
    `;

    const modal = this._buildModal('margin-close-modal', `💰 ${closeAction} 平倉`, bodyHtml, footerHtml);

    const $ = sel => modal.querySelector(sel);
    const $shares = $('#mtc-shares');
    const $price = $('#mtc-price');
    const $date = $('#mtc-date');
    const $feeManual = $('#mtc-fee-manual');
    const $fee = $('#mtc-fee');
    const $taxManual = $('#mtc-tax-manual');
    const $tax = $('#mtc-tax');
    const $note = $('#mtc-note');
    const $fetchPrice = $('#mtc-fetch-price');
    const $previewContent = $('#mtc-preview-content');
    const $submit = $('#mtc-submit');

    // ---------- 試算（核心！） ----------
    const updatePreview = () => {
      const closeShares = Number($shares.value) || 0;
      const closePrice = Number($price.value) || 0;

      if (closeShares <= 0 || closePrice <= 0) {
        $previewContent.innerHTML = '<span class="muted">請輸入平倉股數與價格...</span>';
        return;
      }

      if (closeShares > totalShares) {
        $previewContent.innerHTML = `<span class="down">❌ 平倉股數超過持有股數（${this._fmt(totalShares)}）</span>`;
        return;
      }

      const subtotal = closeShares * closePrice;

      const settings = (Store.getSettings && Store.getSettings()) || {};
      const discount = settings.brokerFeeDiscount ?? CONFIG?.BROKER_FEE_DISCOUNT ?? 0.28;
      const feeRate = CONFIG?.BROKER_FEE_RATE ?? 0.001425;
      const minFee = CONFIG?.BROKER_FEE_MIN ?? 20;
      const autoFee = Math.max(minFee, Math.round(subtotal * feeRate * discount));
      const fee = $feeManual.checked ? (Number($fee.value) || 0) : autoFee;
      if (!$feeManual.checked) $fee.value = autoFee;

      let autoTax = 0;
      if (isLong) {
        autoTax = Math.round(subtotal * (CONFIG?.TAX_RATE ?? 0.003));
      }
      const tax = $taxManual.checked ? (Number($tax.value) || 0) : autoTax;
      if (!$taxManual.checked) $tax.value = autoTax;

      // 🔄 FIFO 模擬
      let remainingToClose = closeShares;
      const closedLots = [];
      let totalLotCost = 0;
      let releasedLoan = 0;
      let releasedDeposit = 0;

      for (const lot of lots) {
        if (remainingToClose <= 0) break;
        const lotRemain = lot.remaining ?? lot.shares ?? 0;
        if (lotRemain <= 0) continue;

        const closeFromThis = Math.min(remainingToClose, lotRemain);
        const lotEC = lot.effectiveCost ?? lot.price ?? 0;
        const lotCostPart = closeFromThis * lotEC;
        totalLotCost += lotCostPart;

        if (isLong && lot.loanAmount) {
          releasedLoan += (lot.loanAmount * closeFromThis / lotRemain);
        }
        if (!isLong && lot.depositAmount) {
          releasedDeposit += (lot.depositAmount * closeFromThis / lotRemain);
        }

        closedLots.push({
          date: lot.date,
          shares: closeFromThis,
          price: lot.price,
          effectiveCost: lotEC
        });

        remainingToClose -= closeFromThis;
      }

      let realizedPL;
      if (isLong) {
        realizedPL = subtotal - totalLotCost - fee - tax;
      } else {
        realizedPL = totalLotCost - subtotal - fee - tax;
      }
      const realizedPLPct = totalLotCost > 0 ? (realizedPL / totalLotCost) * 100 : 0;

      let netCashIn = 0;
      if (isLong) {
        netCashIn = subtotal - fee - tax - releasedLoan;
      } else {
        netCashIn = releasedDeposit + (totalLotCost - subtotal - fee - tax);
      }

      let lotsHtml = closedLots.map(l => `
        <div style="margin-left:8px;">
          • ${l.date || '?'} 
          <strong>${this._fmt(l.shares)}</strong> 股 
          @ <strong>${l.price.toFixed(2)}</strong> 
          <span class="muted">(成本 ${l.effectiveCost.toFixed(2)})</span>
        </div>
      `).join('');

      let cashLabel, cashValue, cashColor;
      if (isLong) {
        cashLabel = '預估進帳';
        cashValue = netCashIn;
        cashColor = netCashIn >= 0 ? 'up' : 'down';
      } else {
        cashLabel = '預估進帳（含保證金退回）';
        cashValue = netCashIn;
        cashColor = netCashIn >= 0 ? 'up' : 'down';
      }

      $previewContent.innerHTML = `
        <div style="margin-bottom:6px;">將從以下批次結清（FIFO）：</div>
        ${lotsHtml}
        <hr style="border-color:rgba(255,255,255,0.1); margin:8px 0;">
        <div>📊 成交金額：<strong>${this._fmt(subtotal)}</strong></div>
        <div>💰 結清成本：<strong>${this._fmt(totalLotCost)}</strong></div>
        <div>🧾 手續費：<strong>${this._fmt(fee)}</strong>　
             ${isLong ? `交易稅：<strong>${this._fmt(tax)}</strong>` : '<span class="muted">融券免交易稅</span>'}</div>
        ${isLong
          ? `<div>🔓 釋放融資金：<strong>${this._fmt(releasedLoan)}</strong></div>`
          : `<div>🔓 退回保證金：<strong>${this._fmt(releasedDeposit)}</strong></div>`
        }
        <div>💵 ${cashLabel}：<strong class="${cashColor}">${this._fmt(cashValue)}</strong></div>
        <hr style="border-color:rgba(255,255,255,0.1); margin:8px 0;">
        <div style="font-size:14px;">
          🎯 已實現損益：
          <strong class="${realizedPL >= 0 ? 'up' : 'down'}">
            ${realizedPL >= 0 ? '+' : ''}${this._fmt(realizedPL)}
            (${realizedPLPct >= 0 ? '+' : ''}${realizedPLPct.toFixed(2)}%)
          </strong>
        </div>
      `;
    };

    // ---------- 事件 ----------
    [$shares, $price, $fee, $tax].forEach(el => {
      el.addEventListener('input', updatePreview);
    });

    $feeManual.addEventListener('change', () => {
      $fee.disabled = !$feeManual.checked;
      if (!$feeManual.checked) updatePreview();
      else $fee.focus();
    });

    $taxManual.addEventListener('change', () => {
      $tax.disabled = !$taxManual.checked;
      if (!$taxManual.checked) updatePreview();
      else $tax.focus();
    });

    $fetchPrice.addEventListener('click', async () => {
      $fetchPrice.disabled = true;
      $fetchPrice.textContent = '⏳';
      try {
        const p = await this.fetchStockPrice(pos.symbol);
        if (p != null) {
          $price.value = p;
          updatePreview();
          this._toast(`✅ 已帶入即時價：${p}`, 'success');
        } else {
          this._toast('抓取報價失敗', 'warning');
        }
      } catch (err) {
        this._toast('查詢失敗：' + err.message, 'error');
      } finally {
        $fetchPrice.disabled = false;
        $fetchPrice.textContent = '⚡';
      }
    });

    // ---------- 提交（🔑 關鍵修正） ----------
    $submit.addEventListener('click', () => {
      const closeShares = Number($shares.value) || 0;
      const closePrice = Number($price.value) || 0;
      const date = $date.value;
      const fee = Number($fee.value) || 0;
      const tax = Number($tax.value) || 0;
      const note = $note.value.trim();

      if (closeShares <= 0) { this._toast('請輸入平倉股數', 'error'); $shares.focus(); return; }
      if (closeShares > totalShares) { this._toast('平倉股數超過持有股數', 'error'); $shares.focus(); return; }
      if (closePrice <= 0) { this._toast('請輸入平倉價格', 'error'); $price.focus(); return; }
      if (!date) { this._toast('請選擇日期', 'error'); return; }

      $submit.disabled = true;
      $submit.textContent = '處理中...';

      try {
        const payload = {
          id: pos.id,                       // ✅ reducer 用的就是這個
          symbol: pos.symbol,
          name: pos.name || pos.symbol,
          type: (pos.type || 'long').toLowerCase(),
          shares: closeShares,
          price: closePrice,
          fee: fee || 0,
          tax: tax || 0,
          date: date,
          note: note || ''
        };

        console.log('[TradeModal] MARGIN_SELL payload:', payload);

        Store.dispatch({
          type: 'MARGIN_SELL',
          payload: payload
        });

        this._toast(`✅ ${closeAction} ${pos.symbol} ${this._fmt(closeShares)} 股 @ ${closePrice}`, 'success');
        modal._close();

        if (typeof UI !== 'undefined' && typeof UI.renderMargin === 'function') {
          UI.renderMargin();
        }
      } catch (err) {
        console.error('[TradeModal] MARGIN_SELL 失敗:', err);
        this._toast('平倉失敗：' + err.message, 'error');
        $submit.disabled = false;
        $submit.textContent = `💰 確認${closeAction}`;
      }
    });

    updatePreview();
    setTimeout(() => $shares.focus(), 100);
  },

  // ============================================================
  // 🎯 開啟「期貨開倉」Modal（含智慧搜尋）
  // ============================================================
  openFuturesOpenModal({ defaultSymbol = '', defaultDirection = 'long' } = {}) {
    if (typeof FuturesHelper === 'undefined') {
      this._toast('❌ 期貨合約資料未載入', 'error');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    // 結算月份建議
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = now.getMonth() + 1;
    const monthOptions = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(yyyy, mm - 1 + i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      monthOptions.push({ value: `${y}${m}`, label: `${y}/${m}` });
    }

    const bodyHtml = `
      <!-- 商品搜尋 -->
      <div class="form-group">
        <label class="form-label">期貨商品 <span style="color:#ef4444;">*</span>
          <span class="muted" style="font-size:11px; font-weight:normal;">
            （指數期：TXF、MXF；個股期：CDF台積、CEF鴻海，或輸入「2330」「台積」自動找）
          </span>
        </label>
        <input class="form-input" type="text" id="fut-search" 
               placeholder="輸入期貨代號、股票代號或名稱..." autocomplete="off">
      </div>

      <!-- 商品資訊（自動帶入） -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">代號</label>
          <input class="form-input" type="text" id="fut-symbol" placeholder="自動" 
                 style="text-transform:uppercase;" readonly>
        </div>
        <div class="form-group">
          <label class="form-label">名稱</label>
          <input class="form-input" type="text" id="fut-name" placeholder="自動" readonly>
        </div>
      </div>

      <!-- 方向 + 結算月 -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">方向 <span style="color:#ef4444;">*</span></label>
          <div style="display:flex; gap:16px; padding:6px 0;">
            <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
              <input type="radio" name="fdir" value="long" ${defaultDirection === 'long' ? 'checked' : ''}>
              <span class="up" style="font-weight:600;">📈 做多</span>
            </label>
            <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
              <input type="radio" name="fdir" value="short" ${defaultDirection === 'short' ? 'checked' : ''}>
              <span class="down" style="font-weight:600;">📉 做空</span>
            </label>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">結算月份</label>
          <select class="form-input" id="fut-expiry" style="cursor:pointer;">
            ${monthOptions.map((o, i) => `<option value="${o.value}" ${i === 0 ? 'selected' : ''}>${o.label}${i === 0 ? '（近月）' : ''}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- 口數 + 價格 -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">口數 <span style="color:#ef4444;">*</span></label>
          <input class="form-input" type="number" id="fut-lots" placeholder="1" min="1" step="1" value="1">
        </div>
        <div class="form-group">
          <label class="form-label">建倉價格 <span style="color:#ef4444;">*</span></label>
          <div style="display:flex; gap:4px;">
            <input class="form-input" type="number" id="fut-price" placeholder="0.00" min="0" step="0.01" style="flex:1;">
            <button type="button" id="fut-fetch-price" class="btn btn-warning" style="padding:0 10px;" title="抓取現貨報價（個股期）">⚡</button>
          </div>
        </div>
      </div>

      <!-- 進階：手動覆寫合約規格（個股期 / 自訂用） -->
      <details id="fut-advanced" style="margin:8px 0; padding:8px; background:rgba(255,255,255,0.03); border-radius:6px;">
        <summary style="cursor:pointer; color:#a5b4fc; font-size:12px;">⚙️ 進階：手動覆寫合約規格（個股期保證金）</summary>
        <div class="form-row" style="margin-top:8px;">
          <div class="form-group">
            <label class="form-label" style="font-size:12px;">契約乘數</label>
            <input class="form-input" type="number" id="fut-multi" placeholder="自動" min="0" step="1">
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size:12px;">原始保證金 (單口)</label>
            <input class="form-input" type="number" id="fut-margin" placeholder="自動" min="0" step="100">
          </div>
        </div>
      </details>

      <!-- 日期 + 手續費 -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">日期</label>
          <input class="form-input" type="date" id="fut-date" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">
            手續費
            <label style="font-weight:normal; font-size:12px; margin-left:8px; cursor:pointer;">
              <input type="checkbox" id="fut-fee-manual" style="vertical-align:middle;"> 手動
            </label>
          </label>
          <input class="form-input" type="number" id="fut-fee" placeholder="自動" min="0" step="1" disabled>
        </div>
      </div>

      <!-- 停損 / 停利 -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">停損 <span class="muted" style="font-size:11px;">（選填）</span></label>
          <input class="form-input" type="number" id="fut-sl" placeholder="例：17000" step="0.01">
        </div>
        <div class="form-group">
          <label class="form-label">停利 <span class="muted" style="font-size:11px;">（選填）</span></label>
          <input class="form-input" type="number" id="fut-tp" placeholder="例：18500" step="0.01">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">備註</label>
        <input class="form-input" type="text" id="fut-note" placeholder="（選填）策略名稱、進場理由...">
      </div>

      <!-- 試算 -->
      <div id="fut-preview" style="background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.3); border-radius:8px; padding:12px; margin-top:8px;">
        <div style="font-weight:600; color:#a5b4fc; margin-bottom:8px;">💡 試算 & 風險評估</div>
        <div id="fut-preview-content" style="font-size:13px; line-height:1.8;">
          <span class="muted">請先選擇商品...</span>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" data-close>取消</button>
      <button class="btn btn-primary" id="fut-submit">🎯 確認開倉</button>
    `;

    const modal = this._buildModal('futures-open-modal', '🎯 期貨開倉', bodyHtml, footerHtml);

    const $ = sel => modal.querySelector(sel);
    const $search = $('#fut-search');
    const $symbol = $('#fut-symbol');
    const $name = $('#fut-name');
    const $expiry = $('#fut-expiry');
    const $lots = $('#fut-lots');
    const $price = $('#fut-price');
    const $multi = $('#fut-multi');
    const $marginInput = $('#fut-margin');
    const $date = $('#fut-date');
    const $feeManual = $('#fut-fee-manual');
    const $fee = $('#fut-fee');
    const $sl = $('#fut-sl');
    const $tp = $('#fut-tp');
    const $note = $('#fut-note');
    const $fetchPrice = $('#fut-fetch-price');
    const $preview = $('#fut-preview-content');
    const $submit = $('#fut-submit');

    let currentContract = null;

    const getDir = () => modal.querySelector('input[name="fdir"]:checked').value;

    // ---------- 取得有效合約規格（含手動覆寫） ----------
    const getEffectiveContract = () => {
      if (!currentContract) return null;
      const c = { ...currentContract };
      const overrideMulti = Number($multi.value);
      const overrideMargin = Number($marginInput.value);
      if (overrideMulti > 0) c.multiplier = overrideMulti;
      if (overrideMargin > 0) {
        c.initialMargin = overrideMargin;
        c.maintenanceMargin = Math.ceil(overrideMargin * 0.77);
      }
      return c;
    };

    // ---------- 試算 ----------
    const updatePreview = () => {
      const c = getEffectiveContract();
      if (!c) {
        $preview.innerHTML = '<span class="muted">請先選擇商品...</span>';
        return;
      }

      const dir = getDir();
      const lots = Number($lots.value) || 0;
      const price = Number($price.value) || 0;

      if (lots <= 0 || price <= 0) {
        $preview.innerHTML = '<span class="muted">請輸入口數與建倉價...</span>';
        return;
      }

      const contractValue = price * c.multiplier * lots;

      // 個股期：用建倉價算保證金
      let requiredMargin, maintMargin;
      if (c.isStockFutures || c._isDynamic) {
        const tier = STOCK_FUTURES_MARGIN_TIERS.A;
        requiredMargin = Math.ceil(contractValue * tier.initial);
        maintMargin = Math.ceil(contractValue * tier.maintenance);
      } else {
        requiredMargin = c.initialMargin * lots;
        maintMargin = c.maintenanceMargin * lots;
      }

      const autoFee = c.feePerLot * lots * 2;
      const fee = $feeManual.checked ? (Number($fee.value) || 0) : autoFee;
      if (!$feeManual.checked) $fee.value = autoFee;
      const tax = Math.round(contractValue * c.taxRate * 2);
      const totalCost = fee + tax;

      const pnlPerPoint = c.multiplier * lots;
      const buffer = requiredMargin - maintMargin;
      const liquidPts = c.multiplier > 0 ? (buffer / c.multiplier) : 0;
      const liquidPrice = dir === 'long'
        ? (price - liquidPts).toFixed(2)
        : (price + liquidPts).toFixed(2);

      let slPnL = null, tpPnL = null;
      const slVal = Number($sl.value);
      const tpVal = Number($tp.value);
      if (slVal > 0) {
        slPnL = dir === 'long' ? (slVal - price) * pnlPerPoint - totalCost
                                : (price - slVal) * pnlPerPoint - totalCost;
      }
      if (tpVal > 0) {
        tpPnL = dir === 'long' ? (tpVal - price) * pnlPerPoint - totalCost
                                : (price - tpVal) * pnlPerPoint - totalCost;
      }

      const settings = (Store.getSettings && Store.getSettings()) || {};
      const availCapital = settings.availableCapital || 0;
      let warningHtml = '';
      if (availCapital > 0 && requiredMargin > availCapital) {
        warningHtml = `
          <div style="background:rgba(239,68,68,0.15); border:1px solid #ef4444; border-radius:6px; padding:8px; margin-top:8px;">
            ⚠️ <strong class="down">保證金不足！</strong> 需要 ${this._fmt(requiredMargin)}，可用資金僅 ${this._fmt(availCapital)}
          </div>
        `;
      }

      const tag = c.isStockFutures
        ? '<span style="background:rgba(34,197,94,0.2); color:#86efac; padding:2px 6px; border-radius:4px; font-size:11px;">個股期</span>'
        : (c.isCustom ? '<span style="background:rgba(168,85,247,0.2); color:#d8b4fe; padding:2px 6px; border-radius:4px; font-size:11px;">自訂</span>' : '');

      $preview.innerHTML = `
        <div style="margin-bottom:6px;">
          <strong>${c.symbol}</strong> ${c.name} ${tag}
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 16px;">
          <div>📦 契約乘數：<strong>${this._fmt(c.multiplier)} ${c.isStockFutures ? '股' : '元/點'}</strong></div>
          <div>💎 1 點/元價值：<strong>${this._fmt(pnlPerPoint)}</strong></div>
          <div>📊 契約總值：<strong>${this._fmt(contractValue)}</strong></div>
          <div>🔒 原始保證金：<strong style="color:#fbbf24;">${this._fmt(requiredMargin)}</strong></div>
          <div>🚨 維持保證金：<strong>${this._fmt(maintMargin)}</strong></div>
          <div>💥 預估強平價：<strong class="down">${liquidPrice}</strong> <span class="muted">(${liquidPts.toFixed(2)})</span></div>
          <div>🧾 手續費（雙邊）：<strong>${this._fmt(fee)}</strong></div>
          <div>💰 期交稅（雙邊）：<strong>${this._fmt(tax)}</strong></div>
        </div>
        ${(slVal > 0 || tpVal > 0) ? '<hr style="border-color:rgba(255,255,255,0.1); margin:8px 0;">' : ''}
        ${slVal > 0 ? `<div>🛑 停損 @ <strong>${slVal}</strong> → <strong class="${slPnL >= 0 ? 'up' : 'down'}">${slPnL >= 0 ? '+' : ''}${this._fmt(slPnL)}</strong></div>` : ''}
        ${tpVal > 0 ? `<div>🎯 停利 @ <strong>${tpVal}</strong> → <strong class="${tpPnL >= 0 ? 'up' : 'down'}">${tpPnL >= 0 ? '+' : ''}${this._fmt(tpPnL)}</strong></div>` : ''}
        ${(slVal > 0 && tpVal > 0 && slPnL && tpPnL) ? `
          <div style="margin-top:6px; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.1);">
            ⚖️ 風險報酬比：<strong>${Math.abs(tpPnL / slPnL).toFixed(2)}</strong>
          </div>
        ` : ''}
        ${warningHtml}
      `;
    };

    // ---------- 選定合約 ----------
    const selectContract = (contract) => {
      currentContract = contract;
      $symbol.value = contract.symbol;
      $name.value = contract.name;
      $search.value = `${contract.symbol}  ${contract.name}`;
      // 預填預設手續費
      $fee.value = contract.feePerLot * (Number($lots.value) || 1) * 2;
      // 重置進階覆寫
      $multi.value = '';
      $marginInput.value = '';
      $multi.placeholder = `自動 (${contract.multiplier})`;
      $marginInput.placeholder = `自動 (${this._fmt(contract.initialMargin)})`;
      // 個股期自動嘗試抓現價
      if (contract.isStockFutures) {
        setTimeout(() => $fetchPrice.click(), 100);
      } else {
        setTimeout(() => $price.focus(), 50);
      }
      updatePreview();
    };

    // ---------- 智慧搜尋 dropdown ----------
    const cleanupAC = this._attachFuturesAutocomplete($search, (item) => {
      selectContract(item);
    });
    modal._addCleanup(cleanupAC);

    // 預設帶入
    if (defaultSymbol) {
      const c = FuturesHelper.getContract(defaultSymbol);
      if (c) selectContract(c);
    }

    // ---------- 事件 ----------
    [$lots, $price, $fee, $sl, $tp, $multi, $marginInput].forEach(el => {
      el.addEventListener('input', updatePreview);
    });
    modal.querySelectorAll('input[name="fdir"]').forEach(r => {
      r.addEventListener('change', updatePreview);
    });
    $feeManual.addEventListener('change', () => {
      $fee.disabled = !$feeManual.checked;
      if (!$feeManual.checked) updatePreview();
      else $fee.focus();
    });

    // ⚡ 抓現貨價（個股期用）
    $fetchPrice.addEventListener('click', async () => {
      if (!currentContract) {
        this._toast('請先選擇商品', 'warning');
        return;
      }
      const querySym = currentContract.underlyingSymbol || currentContract.symbol;
      $fetchPrice.disabled = true;
      $fetchPrice.textContent = '⏳';
      try {
        const p = await this.fetchStockPrice(querySym);
        if (p != null) {
          $price.value = p;
          updatePreview();
          this._toast(`✅ 已帶入 ${querySym} 現價：${p}`, 'success');
        } else {
          this._toast('抓取報價失敗', 'warning');
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
      const c = getEffectiveContract();
      if (!c) { this._toast('請選擇商品', 'error'); $search.focus(); return; }

      const dir = getDir();
      const expiry = $expiry.value;
      const lots = Number($lots.value) || 0;
      const price = Number($price.value) || 0;
      const date = $date.value;
      const fee = Number($fee.value) || (c.feePerLot * lots * 2);
      const sl = Number($sl.value) || 0;
      const tp = Number($tp.value) || 0;
      const note = $note.value.trim();

      if (lots <= 0) { this._toast('口數必須大於 0', 'error'); $lots.focus(); return; }
      if (price <= 0) { this._toast('價格必須大於 0', 'error'); $price.focus(); return; }

      // 動態算保證金（個股期）
      const contractValue = price * c.multiplier * lots;
      let initialMargin, maintMargin;
      if (c.isStockFutures || c._isDynamic) {
        const tier = STOCK_FUTURES_MARGIN_TIERS.A;
        initialMargin = Math.ceil(contractValue * tier.initial);
        maintMargin = Math.ceil(contractValue * tier.maintenance);
      } else {
        initialMargin = c.initialMargin * lots;
        maintMargin = c.maintenanceMargin * lots;
      }

      $submit.disabled = true;
      $submit.textContent = '處理中...';

      try {
        const payload = {
          symbol: c.symbol,
          name: c.name,
          contractMonth: expiry,
          type: dir,
          lots: lots,
          price: price,
          multiplier: c.multiplier,
          initialMargin: initialMargin,
          maintenanceMargin: maintMargin,
          isStockFutures: !!c.isStockFutures,
          underlyingSymbol: c.underlyingSymbol || null,
          fee: fee,
          stopLoss: sl || null,
          takeProfit: tp || null,
          date: date,
          note: note,
          market: 'TW'
        };

        console.log('[TradeModal] FUTURES_OPEN payload:', payload);

        Store.dispatch({
          type: 'FUTURES_OPEN',
          payload: payload
        });

        const action = dir === 'long' ? '買進開倉' : '賣出開倉';
        this._toast(`✅ ${c.name} ${action} ${lots} 口 @ ${price}`, 'success');
        modal._close();

        if (typeof UI !== 'undefined' && typeof UI.renderFutures === 'function') {
          UI.renderFutures();
        }
      } catch (err) {
        console.error('[TradeModal] FUTURES_OPEN 失敗:', err);
        this._toast('開倉失敗：' + err.message, 'error');
        $submit.disabled = false;
        $submit.textContent = '🎯 確認開倉';
      }
    });

    setTimeout(() => $search.focus(), 100);
  },

  // ============================================================
  // 🎯 開啟「期貨平倉」Modal
  // ============================================================
  openFuturesCloseModal({ positionId } = {}) {
    if (!positionId) {
      this._toast('❌ 缺少持倉 ID', 'error');
      return;
    }

    // 取得持倉
    const futures = (Store.getFutures && Store.getFutures()) || [];
    const pos = futures.find(p => p.id === positionId);
    if (!pos) {
      this._toast('❌ 找不到該期貨部位', 'error');
      return;
    }

    const c = (typeof FuturesHelper !== 'undefined') ? FuturesHelper.getContract(pos.symbol) : null;
    const today = new Date().toISOString().slice(0, 10);
    const dirLabel = pos.type === 'long'
      ? '<span class="up">📈 多單</span>'
      : '<span class="down">📉 空單</span>';
    const closeAction = pos.type === 'long' ? '賣出平倉' : '買回平倉';

    const bodyHtml = `
      <!-- 持倉摘要 -->
      <div style="background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.3); border-radius:8px; padding:12px; margin-bottom:12px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; font-size:13px;">
          <div>📦 商品：<strong>${pos.symbol}</strong> ${pos.name || ''}</div>
          <div>🎯 方向：${dirLabel}</div>
          <div>📊 持有口數：<strong>${pos.lots}</strong> 口</div>
          <div>💵 建倉均價：<strong>${pos.avgPrice}</strong></div>
          <div>📅 結算月：<strong>${pos.contractMonth || '—'}</strong></div>
          <div>💎 現價：<strong id="fc-current-price">${pos.currentPrice || pos.avgPrice}</strong></div>
          <div>🔒 保證金：<strong>${this._fmt(pos.initialMargin || 0)}</strong></div>
          <div>📦 乘數：<strong>${pos.multiplier} ${pos.isStockFutures ? '股' : '元/點'}</strong></div>
        </div>
      </div>

      <!-- 平倉口數 + 價格 -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">
            平倉口數 <span style="color:#ef4444;">*</span>
            <button type="button" id="fc-all" class="btn btn-secondary" 
                    style="padding:2px 8px; font-size:11px; margin-left:6px;">全部</button>
          </label>
          <input class="form-input" type="number" id="fc-lots" 
                 min="1" max="${pos.lots}" step="1" value="${pos.lots}">
          <div class="muted" style="font-size:11px; margin-top:2px;">最多 ${pos.lots} 口</div>
        </div>
        <div class="form-group">
          <label class="form-label">平倉價格 <span style="color:#ef4444;">*</span></label>
          <div style="display:flex; gap:4px;">
            <input class="form-input" type="number" id="fc-price" 
                   placeholder="${pos.currentPrice || pos.avgPrice}" 
                   value="${pos.currentPrice || pos.avgPrice}" 
                   min="0" step="0.01" style="flex:1;">
            <button type="button" id="fc-fetch-price" class="btn btn-warning" 
                    style="padding:0 10px;" title="抓取現價">⚡</button>
          </div>
        </div>
      </div>

      <!-- 日期 + 手續費 -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">平倉日期</label>
          <input class="form-input" type="date" id="fc-date" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">
            手續費
            <label style="font-weight:normal; font-size:12px; margin-left:8px; cursor:pointer;">
              <input type="checkbox" id="fc-fee-manual" style="vertical-align:middle;"> 手動
            </label>
          </label>
          <input class="form-input" type="number" id="fc-fee" placeholder="自動" min="0" step="1" disabled>
        </div>
      </div>

      <!-- 備註 -->
      <div class="form-group">
        <label class="form-label">備註</label>
        <input class="form-input" type="text" id="fc-note" placeholder="（選填）平倉理由...">
      </div>

      <!-- 試算 -->
      <div id="fc-preview" style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.3); border-radius:8px; padding:12px; margin-top:8px;">
        <div style="font-weight:600; color:#86efac; margin-bottom:8px;">💡 平倉試算</div>
        <div id="fc-preview-content" style="font-size:13px; line-height:1.8;">
          <span class="muted">輸入平倉價格...</span>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" data-close>取消</button>
      <button class="btn btn-danger" id="fc-submit">🎯 確認${closeAction}</button>
    `;

    const modal = this._buildModal('futures-close-modal', `🎯 期貨平倉 - ${pos.symbol} ${pos.name || ''}`, bodyHtml, footerHtml);

    const $ = sel => modal.querySelector(sel);
    const $lots = $('#fc-lots');
    const $price = $('#fc-price');
    const $date = $('#fc-date');
    const $feeManual = $('#fc-fee-manual');
    const $fee = $('#fc-fee');
    const $note = $('#fc-note');
    const $allBtn = $('#fc-all');
    const $fetchPrice = $('#fc-fetch-price');
    const $preview = $('#fc-preview-content');
    const $submit = $('#fc-submit');

    // ---------- 試算 ----------
    const updatePreview = () => {
      const lots = Number($lots.value) || 0;
      const price = Number($price.value) || 0;

      if (lots <= 0 || price <= 0) {
        $preview.innerHTML = '<span class="muted">輸入平倉口數與價格...</span>';
        return;
      }
      if (lots > pos.lots) {
        $preview.innerHTML = `<span class="down">❌ 平倉口數超過持倉（最多 ${pos.lots} 口）</span>`;
        return;
      }

      const multiplier = pos.multiplier || 1;
      const pointDiff = pos.type === 'long' ? (price - pos.avgPrice) : (pos.avgPrice - price);
      const grossPnl = pointDiff * multiplier * lots;

      const contractValue = price * multiplier * lots;
      const taxRate = c ? c.taxRate : 0.00002;
      const tax = Math.round(contractValue * taxRate);

      const autoFee = c ? (c.feePerLot * lots) : (lots * 30);  // 平倉只算單邊
      const fee = $feeManual.checked ? (Number($fee.value) || 0) : autoFee;
      if (!$feeManual.checked) $fee.value = autoFee;

      const netPnl = grossPnl - fee - tax;
      const pnlClass = netPnl >= 0 ? 'up' : 'down';

      // 報酬率（對使用之保證金）
      const usedMargin = (pos.initialMargin || 0) * (lots / pos.lots);
      const returnRate = usedMargin > 0 ? (netPnl / usedMargin * 100) : 0;

      // 平倉比例
      const closeRatio = ((lots / pos.lots) * 100).toFixed(0);
      const remainingLots = pos.lots - lots;

      $preview.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 16px;">
          <div>📊 平倉口數：<strong>${lots} / ${pos.lots}</strong> (${closeRatio}%)</div>
          <div>📦 剩餘口數：<strong>${remainingLots}</strong></div>
          <div>📈 點數變動：<strong class="${pointDiff >= 0 ? 'up' : 'down'}">${pointDiff >= 0 ? '+' : ''}${pointDiff.toFixed(2)}</strong></div>
          <div>💎 1點價值：<strong>${this._fmt(multiplier * lots)}</strong></div>
          <div>💰 毛損益：<strong class="${grossPnl >= 0 ? 'up' : 'down'}">${grossPnl >= 0 ? '+' : ''}${this._fmt(grossPnl)}</strong></div>
          <div>🧾 手續費：<strong>${this._fmt(fee)}</strong></div>
          <div>💸 期交稅：<strong>${this._fmt(tax)}</strong></div>
          <div>🔓 釋出保證金：<strong>${this._fmt(usedMargin)}</strong></div>
        </div>
        <hr style="border-color:rgba(255,255,255,0.1); margin:8px 0;">
        <div style="display:flex; justify-content:space-between; font-size:15px;">
          <span>🎯 <strong>淨損益：</strong></span>
          <strong class="${pnlClass}" style="font-size:18px;">
            ${netPnl >= 0 ? '+' : ''}${this._fmt(netPnl)}
            <span style="font-size:13px;">(${returnRate >= 0 ? '+' : ''}${returnRate.toFixed(2)}%)</span>
          </strong>
        </div>
        ${remainingLots > 0 ? `
          <div style="margin-top:6px; padding:6px; background:rgba(251,191,36,0.1); border-radius:4px; font-size:12px;">
            ℹ️ 部分平倉：剩餘 <strong>${remainingLots} 口</strong>持倉繼續持有
          </div>
        ` : `
          <div style="margin-top:6px; padding:6px; background:rgba(34,197,94,0.1); border-radius:4px; font-size:12px;">
            ✅ 全部平倉：此部位將從持倉移除
          </div>
        `}
      `;
    };

    // ---------- 事件 ----------
    [$lots, $price, $fee].forEach(el => {
      el.addEventListener('input', updatePreview);
    });
    $feeManual.addEventListener('change', () => {
      $fee.disabled = !$feeManual.checked;
      if (!$feeManual.checked) updatePreview();
      else $fee.focus();
    });
    $allBtn.addEventListener('click', () => {
      $lots.value = pos.lots;
      updatePreview();
    });

    // ⚡ 抓現價
    $fetchPrice.addEventListener('click', async () => {
      const querySym = pos.isStockFutures && pos.underlyingSymbol
        ? pos.underlyingSymbol
        : pos.symbol;
      $fetchPrice.disabled = true;
      $fetchPrice.textContent = '⏳';
      try {
        const p = await this.fetchStockPrice(querySym);
        if (p != null) {
          $price.value = p;
          updatePreview();
          this._toast(`✅ 已帶入 ${querySym} 現價：${p}`, 'success');
        } else {
          this._toast('抓取報價失敗（指數期可能無法直接查詢，請手動輸入）', 'warning');
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
      const lots = Number($lots.value) || 0;
      const price = Number($price.value) || 0;
      const date = $date.value;
      const fee = Number($fee.value) || 0;
      const note = $note.value.trim();

      if (lots <= 0) { this._toast('平倉口數必須大於 0', 'error'); $lots.focus(); return; }
      if (lots > pos.lots) { this._toast(`平倉口數不能超過 ${pos.lots} 口`, 'error'); $lots.focus(); return; }
      if (price <= 0) { this._toast('價格必須大於 0', 'error'); $price.focus(); return; }

      $submit.disabled = true;
      $submit.textContent = '處理中...';

      try {
        const payload = {
          id: pos.id,
          lots: lots,
          price: price,
          fee: fee,
          date: date,
          note: note
        };

        console.log('[TradeModal] FUTURES_CLOSE payload:', payload);

        const result = Store.dispatch({
          type: 'FUTURES_CLOSE',
          payload: payload
        });

        const pnlText = result && result.netPnl != null
          ? (result.netPnl >= 0 ? `獲利 ${this._fmt(result.netPnl)}` : `虧損 ${this._fmt(result.netPnl)}`)
          : '完成';

        this._toast(`✅ ${pos.name || pos.symbol} 平倉 ${lots} 口 → ${pnlText}`,
                    result.netPnl >= 0 ? 'success' : 'warning');
        modal._close();

        if (typeof UI !== 'undefined' && typeof UI.renderFutures === 'function') {
          UI.renderFutures();
        }
      } catch (err) {
        console.error('[TradeModal] FUTURES_CLOSE 失敗:', err);
        this._toast('平倉失敗：' + err.message, 'error');
        $submit.disabled = false;
        $submit.textContent = `🎯 確認${closeAction}`;
      }
    });

    updatePreview();
    setTimeout(() => $price.focus(), 100);
  },


  // ============================================================
  // 🔍 期貨商品自動完成（指數期 + 個股期）
  // ============================================================
  _attachFuturesAutocomplete($input, onSelect) {
    const dropdown = document.createElement('div');
    dropdown.className = 'tm-autocomplete-dropdown';
    dropdown.style.cssText = `
      position: absolute; background: #1e293b; border: 1px solid #475569;
      border-radius: 6px; max-height: 300px; overflow-y: auto;
      z-index: 10000; display: none; min-width: 280px;
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
        dropdown.innerHTML = `<div style="padding:12px; color:#94a3b8; font-size:13px;">無結果</div>`;
        positionDropdown();
        dropdown.style.display = 'block';
        return;
      }
      dropdown.innerHTML = items.map((it, i) => {
        const tag = it.isStockFutures
          ? '<span style="background:rgba(34,197,94,0.2); color:#86efac; padding:1px 5px; border-radius:3px; font-size:10px;">個股</span>'
          : it.isCustom
            ? '<span style="background:rgba(168,85,247,0.2); color:#d8b4fe; padding:1px 5px; border-radius:3px; font-size:10px;">自訂</span>'
            : `<span style="background:rgba(99,102,241,0.2); color:#a5b4fc; padding:1px 5px; border-radius:3px; font-size:10px;">${(FUTURES_CATEGORY_LABELS[it.category] || '').slice(0, 4)}</span>`;
        return `
          <div class="tm-ac-item" data-idx="${i}" 
               style="padding:8px 12px; cursor:pointer; display:flex; gap:10px; align-items:center; border-bottom:1px solid #334155;">
            <strong style="color:#60a5fa; min-width:60px;">${it.symbol}</strong>
            <span style="color:#e2e8f0; flex:1;">${it.name}</span>
            ${tag}
          </div>
        `;
      }).join('');
      positionDropdown();
      dropdown.style.display = 'block';

      dropdown.querySelectorAll('.tm-ac-item').forEach(el => {
        el.addEventListener('mouseenter', () => setActive(Number(el.dataset.idx)));
        el.addEventListener('mousedown', (e) => {
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

    let timer = null;
    $input.addEventListener('input', () => {
      clearTimeout(timer);
      const kw = $input.value.trim();
      timer = setTimeout(() => {
        const items = FuturesHelper.searchContracts(kw, 12);
        renderItems(items);
      }, 100);
    });

    // focus 也顯示
    $input.addEventListener('focus', () => {
      const kw = $input.value.trim();
      const items = FuturesHelper.searchContracts(kw, 12);
      renderItems(items);
    });

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

    $input.addEventListener('blur', () => {
      setTimeout(() => { dropdown.style.display = 'none'; }, 150);
    });

    window.addEventListener('scroll', positionDropdown, true);
    window.addEventListener('resize', positionDropdown);

    return () => {
      dropdown.remove();
      window.removeEventListener('scroll', positionDropdown, true);
      window.removeEventListener('resize', positionDropdown);
    };
  }

};

window.TradeModal = TradeModal;
console.log('[16-trade-modal.js] ✅ TradeModal 已載入（含智慧搜尋）');

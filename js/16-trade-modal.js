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

  // 🔧 統一把 StockDB.stocks 轉成 [{symbol, name}, ...] 陣列
  const allStocks = [];
  const raw = StockDB.stocks;

  if (Array.isArray(raw)) {
    // 結構 A: 陣列
    for (const item of raw) {
      if (!item) continue;
      const symbol = String(item.symbol || item.code || item.id || '').trim();
      const name = String(item.name || '').trim();
      if (symbol) allStocks.push({ symbol, name });
    }
  } else if (typeof raw === 'object') {
    // 結構 B/C: 物件
    for (const key in raw) {
      const item = raw[key];
      if (!item) continue;
      
      // 優先用 item 內的 symbol/code 欄位，沒有才用 key
      let symbol = String(item.symbol || item.code || item.id || '').trim();
      if (!symbol) symbol = String(key).trim();
      
      const name = String(item.name || '').trim();
      if (symbol) allStocks.push({ symbol, name });
    }
  }

  // 🔍 模糊比對
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

    // 部位整體未實現損益
    const positionValue = totalShares * curPrice;
    const positionPL = isLong
      ? (positionValue - totalCost)
      : (totalCost - positionValue);
    const positionPLPct = totalCost > 0 ? (positionPL / totalCost) * 100 : 0;

    // 部位資訊區的標籤
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

      // 手續費（自動 = 成交金額 × 0.1425% × 折扣，最低 20）
      const settings = (Store.getSettings && Store.getSettings()) || {};
      const discount = settings.brokerFeeDiscount ?? CONFIG?.BROKER_FEE_DISCOUNT ?? 0.28;
      const feeRate = CONFIG?.BROKER_FEE_RATE ?? 0.001425;
      const minFee = CONFIG?.BROKER_FEE_MIN ?? 20;
      const autoFee = Math.max(minFee, Math.round(subtotal * feeRate * discount));
      const fee = $feeManual.checked ? (Number($fee.value) || 0) : autoFee;
      if (!$feeManual.checked) $fee.value = autoFee;

      // 交易稅（融資賣出 0.3%；融券回補不收交易稅）
      let autoTax = 0;
      if (isLong) {
        autoTax = Math.round(subtotal * (CONFIG?.TAX_RATE ?? 0.003));
      }
      const tax = $taxManual.checked ? (Number($tax.value) || 0) : autoTax;
      if (!$taxManual.checked) $tax.value = autoTax;

      // 🔄 FIFO 模擬：依 lot 順序逐張結清
      let remainingToClose = closeShares;
      const closedLots = [];
      let totalLotCost = 0;       // 結清部分的總成本（含當初手續費攤平）
      let releasedLoan = 0;       // 釋放的融資金
      let releasedDeposit = 0;    // 釋放的保證金

      for (const lot of lots) {
        if (remainingToClose <= 0) break;
        const lotRemain = lot.remaining ?? lot.shares ?? 0;
        if (lotRemain <= 0) continue;

        const closeFromThis = Math.min(remainingToClose, lotRemain);
        const lotEC = lot.effectiveCost ?? lot.price ?? 0;
        const lotCostPart = closeFromThis * lotEC;
        totalLotCost += lotCostPart;

        // 比例釋放融資金 / 保證金
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

      // 已實現損益計算
      // 融資（多單）：賣出收入 - 成本 - 手續費 - 交易稅
      // 融券（空單）：成本 - 回補成本 - 手續費（賣出收入 - 回補成本扣手續費）
      let realizedPL;
      if (isLong) {
        realizedPL = subtotal - totalLotCost - fee - tax;
      } else {
        realizedPL = totalLotCost - subtotal - fee - tax;
      }
      const realizedPLPct = totalLotCost > 0 ? (realizedPL / totalLotCost) * 100 : 0;

      // 退回自備款（融資）= 釋放的融資金 + 平倉淨收入 - 原本成本 + 損益
      // 簡化呈現：直接顯示「實際進帳金額」
      let netCashIn = 0;
      if (isLong) {
        // 融資賣出：拿到 (賣出 - 手續費 - 交易稅 - 釋放融資金)
        netCashIn = subtotal - fee - tax - releasedLoan;
      } else {
        // 融券回補：拿回保證金 + 損益（保證金原本就在我們這）
        // 進帳 = 釋放保證金 + (賣出收入 - 回補成本 - 手續費)
        // = 釋放保證金 + realizedPL（含當初借券費已扣）
        netCashIn = releasedDeposit + (totalLotCost - subtotal - fee - tax);
      }

      // ---- 渲染 ----
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

    // ⚡ 抓即時報價
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

    // ---------- 提交 ----------
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
        Store.dispatch({
          type: 'MARGIN_SELL',
          payload: {
            positionId: pos.id,
            symbol: pos.symbol,
            name: pos.name,
            type: pos.type,
            shares: closeShares,
            price: closePrice,
            fee,
            tax,
            date,
            note
          }
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

    // 初始
    updatePreview();
    setTimeout(() => $shares.focus(), 100);
  }

};

window.TradeModal = TradeModal;
console.log('[16-trade-modal.js] ✅ TradeModal 已載入（含智慧搜尋）');

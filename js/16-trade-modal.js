/* ============================================================
 * 🛒 16-trade-modal.js - 交易下單 Modal 系統
 * ============================================================
 * 用途：
 *   - 集中管理所有交易 Modal（融資、融券、期貨、現股）
 *   - 提供即時試算、自動查詢股票名稱、手續費計算
 * 依賴：CONFIG, Store, Storage, StockDB, UI（toast）
 * 對外：TradeModal（全域變數）
 * ============================================================ */
'use strict';

const TradeModal = {

  // ============================================================
  // 🔧 共用工具
  // ============================================================

  // toast 統一用 UI.toast（與專案一致）
  _toast(msg, type = 'success') {
    if (typeof UI !== 'undefined' && UI.toast) {
      UI.toast(msg, type);
    } else {
      console.log(`[Toast/${type}]`, msg);
    }
  },

  // 數字格式化
  _fmt(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return Math.round(n).toLocaleString('zh-TW');
  },

  // 🔍 查詢股票名稱（StockDB → portfolio → Yahoo API）
  async fetchStockName(symbol) {
    if (!symbol) return null;
    const sym = String(symbol).trim().toUpperCase();
    if (!sym) return null;

    // 1. 先從 StockDB 找
    if (typeof StockDB !== 'undefined' && StockDB.getStock) {
      const s = StockDB.getStock(sym);
      if (s && s.name) return s.name;
    }

    // 2. 從 portfolio 內現有資料找
    const portfolio = Store.getPortfolio();
    if (portfolio) {
      const local =
        (portfolio.stocks || []).find(s => String(s.symbol).toUpperCase() === sym) ||
        (portfolio.watchlist || []).find(w => String(w.symbol).toUpperCase() === sym) ||
        (portfolio.margin || []).find(m => String(m.symbol).toUpperCase() === sym);
      if (local && local.name) return local.name;
    }

    // 3. 從 Yahoo Finance Quote API 抓（透過 allorigins 代理避開 CORS）
    try {
      const yahooSymbol = sym.includes('.') ? sym : `${sym}.TW`;
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`;
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl);
      const data = await resp.json();
      const inner = JSON.parse(data.contents);
      const quote = inner?.quoteResponse?.result?.[0];
      if (quote && (quote.shortName || quote.longName)) {
        return quote.shortName || quote.longName;
      }
    } catch (err) {
      console.warn('[TradeModal] 查詢股票名稱失敗:', err.message);
    }
    return null;
  },

  // ⚡ 抓即時報價（優先用 PriceFetcher，沒有就走 Yahoo）
  async fetchStockPrice(symbol) {
    if (!symbol) return null;
    const sym = String(symbol).trim().toUpperCase();

    // 優先使用專案的 PriceFetcher（有快取）
    if (typeof PriceFetcher !== 'undefined' && PriceFetcher.fetchOne) {
      try {
        const r = await PriceFetcher.fetchOne(sym, 'TW', { useCache: false });
        if (r && r.price != null && !isNaN(r.price)) return Number(r.price);
      } catch (err) {
        console.warn('[TradeModal] PriceFetcher 失敗，改用 Yahoo:', err.message);
      }
    }

    // Fallback：Yahoo
    try {
      const yahooSymbol = sym.includes('.') ? sym : `${sym}.TW`;
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`;
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl);
      const data = await resp.json();
      const inner = JSON.parse(data.contents);
      const quote = inner?.quoteResponse?.result?.[0];
      const price = quote?.regularMarketPrice ?? quote?.postMarketPrice ?? null;
      return (price != null && !isNaN(price)) ? Number(price) : null;
    } catch (err) {
      console.warn('[TradeModal] 查詢股票報價失敗:', err.message);
      return null;
    }
  },

  // 通用：建立 Modal 殼（沿用專案的 .modal-mask / .modal 樣式）
  _buildModal(id, title, bodyHtml, footerHtml) {
    // 移除舊的（避免重複）
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

    // 關閉按鈕
    wrapper.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => wrapper.remove());
    });
    // 點背景關閉
    wrapper.addEventListener('click', (e) => {
      if (e.target === wrapper) wrapper.remove();
    });
    // ESC 關閉
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        wrapper.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

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

      <div class="form-row">
        <div class="form-group" style="flex:2;">
          <label class="form-label">股票代號 *</label>
          <input class="form-input" type="text" id="mtm-symbol" placeholder="例：2330" value="${defaultSymbol}" style="text-transform:uppercase;">
        </div>
        <div class="form-group" style="flex:1;">
          <label class="form-label">&nbsp;</label>
          <button type="button" id="mtm-lookup" class="btn btn-secondary" style="width:100%;">🔍 查詢</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">股票名稱</label>
        <input class="form-input" type="text" id="mtm-name" placeholder="（自動帶出，可手動修改）">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">股數 *</label>
          <input class="form-input" type="number" id="mtm-shares" placeholder="1000" min="0" step="1000">
        </div>
        <div class="form-group">
          <label class="form-label">價格 *</label>
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

      <!-- 試算區 -->
      <div id="mtm-preview" style="background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.3); border-radius:8px; padding:12px; margin-top:8px;">
        <div style="font-weight:600; color:#a5b4fc; margin-bottom:8px;">💡 試算</div>
        <div id="mtm-preview-content" style="font-size:13px; line-height:1.8;">
          請輸入股數與價格...
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" data-close>取消</button>
      <button class="btn btn-primary" id="mtm-submit">✅ 確認下單</button>
    `;

    const modal = this._buildModal('margin-open-modal', '💎 融資 / 融券 開倉', bodyHtml, footerHtml);

    // ---------- 元件參考 ----------
    const $ = sel => modal.querySelector(sel);
    const getType = () => $('input[name="mtype"]:checked').value;

    const $symbol = $('#mtm-symbol');
    const $name = $('#mtm-name');
    const $shares = $('#mtm-shares');
    const $price = $('#mtm-price');
    const $date = $('#mtm-date');
    const $feeManual = $('#mtm-fee-manual');
    const $fee = $('#mtm-fee');
    const $note = $('#mtm-note');
    const $lookup = $('#mtm-lookup');
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
      // 手續費折扣（從 settings 或 CONFIG 拿，預設 0.28）
      const settings = (Store.getSettings && Store.getSettings()) || {};
      const discount = settings.brokerFeeDiscount
                    ?? CONFIG?.BROKER_FEE_DISCOUNT
                    ?? 0.28;
      const feeRate = CONFIG?.BROKER_FEE_RATE ?? 0.001425;
      const minFee = CONFIG?.BROKER_FEE_MIN ?? 20;
      const autoFee = Math.max(minFee, Math.round(subtotal * feeRate * discount));
      const fee = $feeManual.checked ? (Number($fee.value) || 0) : autoFee;
      if (!$feeManual.checked) $fee.value = autoFee;

      // 融資 / 融券 設定（盡量從 CONFIG.MARGIN 讀）
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

    // ---------- 事件綁定 ----------
    modal.querySelectorAll('input[name="mtype"]').forEach(r => {
      r.addEventListener('change', updatePreview);
    });
    [$shares, $price, $fee].forEach(el => {
      el.addEventListener('input', updatePreview);
    });

    // 手續費手動切換
    $feeManual.addEventListener('change', () => {
      $fee.disabled = !$feeManual.checked;
      if (!$feeManual.checked) updatePreview();
      else $fee.focus();
    });

    // 🔍 查詢股票名稱
    const doLookup = async () => {
      const sym = $symbol.value.trim().toUpperCase();
      if (!sym) {
        this._toast('請先輸入股票代號', 'warning');
        return;
      }
      $lookup.disabled = true;
      $lookup.textContent = '⏳ 查詢中';
      try {
        const name = await this.fetchStockName(sym);
        if (name) {
          $name.value = name;
          this._toast(`✅ 已帶入：${name}`, 'success');
        } else {
          this._toast('找不到該代號，請手動輸入名稱', 'warning');
        }
      } catch (err) {
        this._toast('查詢失敗：' + err.message, 'error');
      } finally {
        $lookup.disabled = false;
        $lookup.textContent = '🔍 查詢';
      }
    };
    $lookup.addEventListener('click', doLookup);

    // ⚡ 抓即時報價
    $fetchPrice.addEventListener('click', async () => {
      const sym = $symbol.value.trim().toUpperCase();
      if (!sym) {
        this._toast('請先輸入股票代號', 'warning');
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
          this._toast('抓取報價失敗', 'warning');
        }
      } catch (err) {
        this._toast('查詢失敗：' + err.message, 'error');
      } finally {
        $fetchPrice.disabled = false;
        $fetchPrice.textContent = '⚡';
      }
    });

    // 代號 blur 時自動查詢名稱（如果名稱還空著）
    $symbol.addEventListener('blur', () => {
      const sym = $symbol.value.trim().toUpperCase();
      if (sym && !$name.value.trim()) {
        doLookup();
      }
    });

    // ---------- 提交 ----------
    $submit.addEventListener('click', () => {
      const type = getType();
      const symbol = $symbol.value.trim().toUpperCase();
      const name = $name.value.trim();
      const shares = Number($shares.value) || 0;
      const price = Number($price.value) || 0;
      const date = $date.value;
      const fee = Number($fee.value) || 0;
      const note = $note.value.trim();

      // 驗證
      if (!symbol) { this._toast('請輸入股票代號', 'error'); $symbol.focus(); return; }
      if (shares <= 0) { this._toast('股數必須大於 0', 'error'); $shares.focus(); return; }
      if (price <= 0) { this._toast('價格必須大於 0', 'error'); $price.focus(); return; }
      if (!date) { this._toast('請選擇日期', 'error'); return; }

      $submit.disabled = true;
      $submit.textContent = '處理中...';

      try {
        // dispatch（沿用你既有的 MARGIN_BUY action）
        Store.dispatch({
          type: 'MARGIN_BUY',
          payload: {
            symbol,
            name: name || symbol,
            type,            // 'long' or 'short'
            shares,
            price,
            fee,
            date,
            note,
            market: 'TW'
          }
        });

        const action = type === 'long' ? '融資買進' : '融券賣出';
        this._toast(`✅ ${action} ${symbol} ${this._fmt(shares)} 股 @ ${price}`, 'success');
        modal.remove();

        // 觸發 UI 重繪
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

    // 初始試算 + focus
    updatePreview();
    setTimeout(() => $symbol.focus(), 100);
  }
};

// 全域曝露
window.TradeModal = TradeModal;

console.log('[16-trade-modal.js] ✅ TradeModal 已載入');

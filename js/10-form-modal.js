/* ============================================================
 * 📝 10-form-modal.js - 買賣交易表單 Modal
 * ============================================================
 * 用途：開啟買入 / 賣出 modal，整合 Autocomplete + Calculator
 * 依賴：Utils, StockDB, Autocomplete, Calculator, Store
 * 對外：FormModal（全域變數）
 * ============================================================ */
'use strict';

const FormModal = {
  _modal: null,
  _cleanup: null,

  // 開啟交易表單
  // params:
  //   action: 'buy' | 'sell'
  //   category: 'stock'（先支援現股，融資/期貨之後擴充）
  //   prefill: { symbol, name } 預填資料
  open({ action = 'buy', category = 'stock', prefill = {} } = {}) {
    this.close(); // 關閉舊的

    const isBuy = action === 'buy';
    const title = isBuy ? '🛒 買入交易' : '💰 賣出交易';
    const btnLabel = isBuy ? '確認買入' : '確認賣出';
    const btnColor = isBuy ? '#10b981' : '#ef4444';

    // 建立 Modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; padding: 20px;
    `;

    overlay.innerHTML = `
      <div class="modal-box" style="
        background: #1a1f2e; border: 1px solid #2d3548; border-radius: 12px;
        width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6);
      ">
        <div style="padding: 20px; border-bottom: 1px solid #2d3548; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; color: #e5e7eb; font-size: 18px;">${title}</h3>
          <button class="modal-close" style="
            background: none; border: none; color: #9ca3af;
            font-size: 24px; cursor: pointer; padding: 0; line-height: 1;
          ">×</button>
        </div>
        <div style="padding: 20px;">
          <form id="trade-form" autocomplete="off">
            <div class="form-group" style="margin-bottom: 14px;">
              <label style="display: block; color: #9ca3af; font-size: 12px; margin-bottom: 6px;">股票代號 / 名稱 *</label>
              <input type="text" id="f-symbol" placeholder="例如：2330 或 台積電" required
                value="${prefill.symbol ? Utils.escapeHtml(prefill.symbol) + (prefill.name ? ' ' + Utils.escapeHtml(prefill.name) : '') : ''}"
                style="width: 100%; padding: 10px; background: #0f1420; border: 1px solid #2d3548;
                border-radius: 6px; color: #e5e7eb; font-size: 14px; box-sizing: border-box;">
              <div id="f-symbol-info" style="font-size: 11px; color: #6b7280; margin-top: 4px; min-height: 14px;"></div>
            </div>

            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div>
                <label style="display: block; color: #9ca3af; font-size: 12px; margin-bottom: 6px;">股數 *</label>
                <input type="number" id="f-shares" placeholder="1000" required min="1" step="1"
                  style="width: 100%; padding: 10px; background: #0f1420; border: 1px solid #2d3548;
                  border-radius: 6px; color: #e5e7eb; font-size: 14px; box-sizing: border-box;">
              </div>
              <div>
                <label style="display: block; color: #9ca3af; font-size: 12px; margin-bottom: 6px;">${isBuy ? '買入' : '賣出'}價格 *</label>
                <input type="number" id="f-price" placeholder="100.00" required min="0.01" step="0.01"
                  style="width: 100%; padding: 10px; background: #0f1420; border: 1px solid #2d3548;
                  border-radius: 6px; color: #e5e7eb; font-size: 14px; box-sizing: border-box;">
              </div>
            </div>

            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div>
                <label style="display: block; color: #9ca3af; font-size: 12px; margin-bottom: 6px;">手續費折扣</label>
                <select id="f-discount" style="width: 100%; padding: 10px; background: #0f1420;
                  border: 1px solid #2d3548; border-radius: 6px; color: #e5e7eb; font-size: 14px; box-sizing: border-box;">
                  <option value="1">原價（1 折）</option>
                  <option value="0.6">6 折</option>
                  <option value="0.38">3.8 折</option>
                  <option value="0.28" selected>2.8 折</option>
                  <option value="0.2">2 折</option>
                  <option value="0.1">1 折</option>
                </select>
              </div>
              <div>
                <label style="display: block; color: #9ca3af; font-size: 12px; margin-bottom: 6px;">日期</label>
                <input type="date" id="f-date" value="${Utils.today()}"
                  style="width: 100%; padding: 10px; background: #0f1420; border: 1px solid #2d3548;
                  border-radius: 6px; color: #e5e7eb; font-size: 14px; box-sizing: border-box;">
              </div>
            </div>

            <div style="margin-bottom: 14px;">
              <label style="display: flex; align-items: center; gap: 8px; color: #9ca3af; font-size: 13px; cursor: pointer;">
                <input type="checkbox" id="f-isETF" style="margin: 0;">
                <span>ETF（證交稅 0.1%）</span>
              </label>
              ${isBuy ? `
              <label style="display: flex; align-items: center; gap: 8px; color: #9ca3af; font-size: 13px; cursor: pointer; margin-top: 6px;">
                <input type="checkbox" id="f-isRegular" style="margin: 0;">
                <span>定期定額（手續費 1 元）</span>
              </label>
              ` : ''}
            </div>

            <div class="form-group" style="margin-bottom: 14px;">
              <label style="display: block; color: #9ca3af; font-size: 12px; margin-bottom: 6px;">備註</label>
              <input type="text" id="f-note" placeholder="（選填）"
                style="width: 100%; padding: 10px; background: #0f1420; border: 1px solid #2d3548;
                border-radius: 6px; color: #e5e7eb; font-size: 14px; box-sizing: border-box;">
            </div>

            <div id="f-preview" style="
              background: #0f1420; border: 1px solid #2d3548; border-radius: 8px;
              padding: 14px; margin-bottom: 16px; font-size: 13px;
            ">
              <div style="color: #6b7280; text-align: center;">請輸入股數和價格...</div>
            </div>

            <div style="display: flex; gap: 10px;">
              <button type="button" class="modal-cancel" style="
                flex: 1; padding: 12px; background: #2d3548; border: none; border-radius: 6px;
                color: #e5e7eb; font-size: 14px; cursor: pointer;
              ">取消</button>
              <button type="submit" style="
                flex: 2; padding: 12px; background: ${btnColor}; border: none; border-radius: 6px;
                color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
              ">${btnLabel}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._modal = overlay;

    // 取得元件
    const symbolInput = overlay.querySelector('#f-symbol');
    const sharesInput = overlay.querySelector('#f-shares');
    const priceInput = overlay.querySelector('#f-price');
    const discountSelect = overlay.querySelector('#f-discount');
    const isETFCheck = overlay.querySelector('#f-isETF');
    const isRegularCheck = overlay.querySelector('#f-isRegular');
    const symbolInfo = overlay.querySelector('#f-symbol-info');
    const preview = overlay.querySelector('#f-preview');
    const form = overlay.querySelector('#trade-form');

    // 自動完成
    let selectedStock = null;
    if (prefill.symbol) {
      selectedStock = StockDB.getBySymbol(prefill.symbol);
      if (selectedStock?.isETF) isETFCheck.checked = true;
    }

    const cleanupAC = Autocomplete.attach({
      input: symbolInput,
      onSelect: (stock) => {
        selectedStock = stock;
        symbolInfo.textContent = `✅ ${stock.symbol} ${stock.name} · ${stock.market === 'US' ? '美股' : '台股'} · ${stock.industry || ''}`;
        symbolInfo.style.color = '#10b981';
        if (stock.isETF) isETFCheck.checked = true;
        updatePreview();
      }
    });

    // 即時預覽
    const updatePreview = () => {
      const shares = Number(sharesInput.value) || 0;
      const price = Number(priceInput.value) || 0;
      if (shares <= 0 || price <= 0) {
        preview.innerHTML = `<div style="color:#6b7280; text-align:center;">請輸入股數和價格...</div>`;
        return;
      }

      const discount = Number(discountSelect.value);
      const isETF = isETFCheck.checked;
      const isRegular = isRegularCheck?.checked || false;

      const calc = isBuy
        ? Calculator.calcBuy({ shares, price, discount, isRegular, isETF })
        : Calculator.calcSell({ shares, price, discount, isRegular, isETF });

      preview.innerHTML = `
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; color: #d1d5db;">
          <span style="color:#9ca3af;">股票數量：</span>
          <span style="text-align:right;">${Utils.fmtNum(shares)} 股</span>
          <span style="color:#9ca3af;">單股價格：</span>
          <span style="text-align:right;">${Utils.fmtMoney(price)}</span>
          <span style="color:#9ca3af;">小計：</span>
          <span style="text-align:right;">${Utils.fmtMoney(calc.subtotal)}</span>
          <span style="color:#9ca3af;">手續費：</span>
          <span style="text-align:right; color:#fbbf24;">${Utils.fmtMoney(calc.fee)}</span>
          ${!isBuy ? `
          <span style="color:#9ca3af;">證交稅：</span>
          <span style="text-align:right; color:#fbbf24;">${Utils.fmtMoney(calc.tax)}</span>
          ` : ''}
          <span style="color:#e5e7eb; font-weight:600; border-top:1px solid #2d3548; padding-top:6px; margin-top:4px;">
            ${isBuy ? '總成本' : '淨收入'}：
          </span>
          <span style="text-align:right; color:${btnColor}; font-weight:700; font-size:15px; border-top:1px solid #2d3548; padding-top:6px; margin-top:4px;">
            ${Utils.fmtMoney(calc.total)}
          </span>
        </div>
      `;
    };

    sharesInput.addEventListener('input', updatePreview);
    priceInput.addEventListener('input', updatePreview);
    discountSelect.addEventListener('change', updatePreview);
    isETFCheck.addEventListener('change', updatePreview);
    if (isRegularCheck) isRegularCheck.addEventListener('change', updatePreview);

    // 提交
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleSubmit({
        action, category, isBuy,
        symbolInput, sharesInput, priceInput, discountSelect,
        isETFCheck, isRegularCheck, selectedStock,
        dateInput: overlay.querySelector('#f-date'),
        noteInput: overlay.querySelector('#f-note')
      });
    });

    // 關閉事件
    overlay.querySelector('.modal-close').addEventListener('click', () => this.close());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    this._cleanup = () => {
      try { cleanupAC(); } catch (e) {}
    };

    // 自動 focus
    setTimeout(() => {
      if (prefill.symbol) sharesInput.focus();
      else symbolInput.focus();
    }, 100);

    // 預先觸發預覽（如果有 prefill）
    if (prefill.symbol && symbolInfo) {
      const stock = StockDB.getBySymbol(prefill.symbol);
      if (stock) {
        symbolInfo.textContent = `✅ ${stock.symbol} ${stock.name} · ${stock.market === 'US' ? '美股' : '台股'} · ${stock.industry || ''}`;
        symbolInfo.style.color = '#10b981';
      }
    }
  },

  // 處理提交
  _handleSubmit({ action, category, isBuy, symbolInput, sharesInput, priceInput, discountSelect, isETFCheck, isRegularCheck, selectedStock, dateInput, noteInput }) {
    // 解析代號
    const parsed = Autocomplete.parseInput(symbolInput.value);
    if (!parsed || !parsed.symbol) {
      alert('⚠️ 請輸入有效的股票代號或名稱');
      return;
    }

    const shares = Number(sharesInput.value);
    const price = Number(priceInput.value);
    if (!shares || shares <= 0) { alert('⚠️ 請輸入有效股數'); return; }
    if (!price || price <= 0) { alert('⚠️ 請輸入有效價格'); return; }

    const discount = Number(discountSelect.value);
    const isETF = isETFCheck.checked;
    const isRegular = isRegularCheck?.checked || false;
    const stockInfo = selectedStock || parsed.stock;
    const market = stockInfo?.market || 'TW';

    // 計算
    const calc = isBuy
      ? Calculator.calcBuy({ shares, price, discount, isRegular, isETF, market })
      : Calculator.calcSell({ shares, price, discount, isRegular, isETF, market });

    // 確認
    const confirmMsg = `確認${isBuy ? '買入' : '賣出'}：\n\n` +
      `${parsed.symbol} ${parsed.name || ''}\n` +
      `${Utils.fmtNum(shares)} 股 × ${Utils.fmtMoney(price)}\n` +
      `手續費：${Utils.fmtMoney(calc.fee)}\n` +
      (isBuy ? '' : `證交稅：${Utils.fmtMoney(calc.tax)}\n`) +
      `${isBuy ? '總成本' : '淨收入'}：${Utils.fmtMoney(calc.total)}`;
    if (!confirm(confirmMsg)) return;

    // Dispatch
    try {
      if (isBuy) {
        Store.dispatch({
          type: 'STOCK_BUY',
          payload: {
            symbol: parsed.symbol,
            name: parsed.name || stockInfo?.name || parsed.symbol,
            market,
            shares, price,
            fee: calc.fee, tax: 0,
            total: calc.total,
            effectiveCost: calc.effectiveCost,
            date: dateInput.value,
            note: noteInput.value,
            isETF, discount, isRegular
          }
        });
      } else {
        Store.dispatch({
          type: 'STOCK_SELL',
          payload: {
            symbol: parsed.symbol,
            name: parsed.name,
            shares, price,
            fee: calc.fee, tax: calc.tax,
            total: calc.total,
            date: dateInput.value,
            note: noteInput.value,
            isETF
          }
        });
      }
      this.close();
      this._showToast(`✅ ${isBuy ? '買入' : '賣出'}成功`, '#10b981');
    } catch (err) {
      alert(`❌ 交易失敗：${err.message}`);
    }
  },

  // 關閉
  close() {
    if (this._cleanup) { try { this._cleanup(); } catch (e) {} this._cleanup = null; }
    if (this._modal && this._modal.parentNode) {
      this._modal.parentNode.removeChild(this._modal);
    }
    this._modal = null;
  },

  // Toast
  _showToast(msg, color = '#10b981') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
      background: ${color}; color: #fff; padding: 12px 24px;
      border-radius: 8px; font-weight: 600; z-index: 10001;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4); animation: fadeIn 0.2s;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
};

window.FormModal = FormModal;
console.log('[10-form-modal.js] ✅ FormModal 已載入');

/* ============================================================
 * 🔍 07-autocomplete.js - 自動完成 UI 元件
 * ============================================================
 * 用途：股票代號 / 名稱輸入時的下拉選單
 * 依賴：StockDB, Utils
 * 對外：Autocomplete（全域變數）
 * ============================================================ */
'use strict';

const Autocomplete = {
  // 將自動完成附加到 input
  // params.input：HTMLInputElement
  // params.onSelect(stockObj)：選中時的回呼
  // params.maxResults：最多顯示幾筆（預設 8）
  // 回傳：cleanup 函式（呼叫可移除事件 / DOM）
  attach({ input, onSelect, maxResults = 8 }) {
    if (!input) return () => {};
    
    // 建立下拉容器
    const dropdown = document.createElement('div');
    dropdown.className = 'ac-dropdown';
    dropdown.style.cssText = `
      position: absolute;
      background: #1a1f2e;
      border: 1px solid #2d3548;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      z-index: 10001;
      max-height: 320px;
      overflow-y: auto;
      display: none;
      min-width: 280px;
    `;
    document.body.appendChild(dropdown);
    
    let currentIndex = -1;
    let currentResults = [];
    let isOpen = false;
    
    const closeDropdown = () => {
      dropdown.style.display = 'none';
      isOpen = false;
      currentIndex = -1;
    };
    
    const positionDropdown = () => {
      const rect = input.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
      dropdown.style.left = `${rect.left + window.scrollX}px`;
      dropdown.style.width = `${Math.max(rect.width, 280)}px`;
    };
    
    const renderResults = (results, query) => {
      currentResults = results;
      currentIndex = -1;
      
      if (results.length === 0) {
        dropdown.innerHTML = `
          <div style="padding:14px; color:#9ca3af; text-align:center; font-size:13px;">
            <div style="margin-bottom:6px;">🔍 找不到「${Utils.escapeHtml(query)}」</div>
            <div style="font-size:11px; color:#6b7280;">直接輸入完整代號即可（例：1234）</div>
          </div>
        `;
        positionDropdown();
        dropdown.style.display = 'block';
        isOpen = true;
        return;
      }
      
      const html = results.map((s, i) => {
        const flag = s.market === 'US' ? '🇺🇸' : '🇹🇼';
        const etfBadge = s.isETF ? '<span style="background:#7c3aed; color:#fff; padding:1px 6px; border-radius:3px; font-size:10px; margin-left:6px;">ETF</span>' : '';
        return `
          <div class="ac-item" data-index="${i}" style="
            padding: 10px 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid #232a3d;
            transition: background 0.1s;
          ">
            <span style="font-size:16px;">${flag}</span>
            <div style="flex:1; min-width:0;">
              <div style="color:#e5e7eb; font-weight:600; font-size:14px;">
                ${Utils.escapeHtml(s.symbol)} ${etfBadge}
              </div>
              <div style="color:#9ca3af; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${Utils.escapeHtml(s.name)} · ${Utils.escapeHtml(s.industry || '其他')}
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      dropdown.innerHTML = html;
      positionDropdown();
      dropdown.style.display = 'block';
      isOpen = true;
      
      // 綁定點擊
      dropdown.querySelectorAll('.ac-item').forEach(el => {
        el.addEventListener('mouseenter', () => {
          highlightItem(parseInt(el.dataset.index));
        });
        el.addEventListener('mousedown', (e) => {
          e.preventDefault(); // 防止 input blur
        });
        el.addEventListener('click', () => {
          selectItem(parseInt(el.dataset.index));
        });
      });
    };
    
    const highlightItem = (idx) => {
      const items = dropdown.querySelectorAll('.ac-item');
      items.forEach((el, i) => {
        el.style.background = (i === idx) ? '#2d3548' : 'transparent';
      });
      currentIndex = idx;
    };
    
    const selectItem = (idx) => {
      const stock = currentResults[idx];
      if (!stock) return;
      input.value = `${stock.symbol} ${stock.name}`;
      closeDropdown();
      if (typeof onSelect === 'function') onSelect(stock);
    };
    
    const handleInput = Utils.debounce(() => {
      const q = input.value.trim();
      if (!q) {
        closeDropdown();
        return;
      }
      // 如果已包含「代號 名稱」格式（有空格），不再搜尋
      if (q.includes(' ') && /^[A-Za-z0-9]+\s/.test(q)) {
        closeDropdown();
        return;
      }
      const results = StockDB.search(q, maxResults);
      renderResults(results, q);
    }, 150);
    
    const handleKeydown = (e) => {
      if (!isOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (currentIndex + 1) % currentResults.length;
        highlightItem(next);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (currentIndex - 1 + currentResults.length) % currentResults.length;
        highlightItem(prev);
      } else if (e.key === 'Enter') {
        if (currentIndex >= 0) {
          e.preventDefault();
          selectItem(currentIndex);
        }
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    };
    
    const handleBlur = () => {
      // 延遲關閉，讓 click 有機會觸發
      setTimeout(closeDropdown, 200);
    };
    
    const handleScroll = () => {
      if (isOpen) positionDropdown();
    };
    
    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeydown);
    input.addEventListener('blur', handleBlur);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    
    // 回傳 cleanup
    return () => {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('keydown', handleKeydown);
      input.removeEventListener('blur', handleBlur);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
    };
  },

  // 解析輸入的「代號 名稱」格式
  // 回傳：{ symbol, name, stock } 或 null
  parseInput(value) {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    
    // 格式 1：「代號 名稱」
    const match = trimmed.match(/^([A-Za-z0-9]+)\s+(.+)$/);
    if (match) {
      const symbol = match[1].toUpperCase();
      const name = match[2].trim();
      const stock = StockDB.getBySymbol(symbol);
      return { symbol, name, stock };
    }
    
    // 格式 2：純代號（嘗試從 DB 找）
    const symbol = trimmed.toUpperCase();
    const stock = StockDB.getBySymbol(symbol);
    if (stock) {
      return { symbol: stock.symbol, name: stock.name, stock };
    }
    
    // 格式 3：純名稱搜尋
    const results = StockDB.search(trimmed, 1);
    if (results.length > 0) {
      return { symbol: results[0].symbol, name: results[0].name, stock: results[0] };
    }
    
    // 都找不到，當成自訂代號
    return { symbol, name: '', stock: null };
  }
};

// 全域曝露
window.Autocomplete = Autocomplete;

console.log('[07-autocomplete.js] ✅ Autocomplete 已載入');

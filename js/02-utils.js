/* ============================================================
 * 🛠️ 02-utils.js - 工具函式
 * ============================================================
 * 用途：通用工具函式（格式化、日期、ID、HTML escape...）
 * 依賴：無
 * 對外：Utils（全域變數）
 * ============================================================ */
'use strict';

const Utils = {
  // 產生唯一 ID
  uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  },

  // 今日日期 YYYY-MM-DD
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  // 數字格式化
  fmtNum(n, digits = 0) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return Number(n).toLocaleString('zh-TW', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  },

  // 金額格式化
  fmtMoney(n, currency = 'TWD') {
    if (n === null || n === undefined || isNaN(n)) return '-';
    const symbol = currency === 'TWD' ? 'NT$' : '$';
    return `${symbol}${this.fmtNum(n, 0)}`;
  },

  // 百分比
  fmtPct(n, digits = 2) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return `${Number(n).toFixed(digits)}%`;
  },

  // 日期時間
  fmtDateTime(iso) {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return d.toLocaleString('zh-TW', { hour12: false });
    } catch (e) {
      return '-';
    }
  },

  // 兩日期相差天數
  daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
  },

  // 深拷貝
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // 是否在台股盤中
  isTwMarketOpen() {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    const h = now.getHours();
    const m = now.getMinutes();
    const mins = h * 60 + m;
    return mins >= (9 * 60) && mins <= (13 * 60 + 30);
  },

  // 是否在台期盤中
  isTwFuturesOpen() {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    const h = now.getHours();
    const m = now.getMinutes();
    const mins = h * 60 + m;
    return mins >= (8 * 60 + 45) && mins <= (13 * 60 + 45);
  },

  // 防抖
  debounce(fn, wait = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  },

  // HTML escape
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

// 全域曝露
window.Utils = Utils;

console.log('[02-utils.js] ✅ Utils 已載入');

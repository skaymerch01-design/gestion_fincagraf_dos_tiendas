/**
 * Utility functions for currency and number formatting with comma for thousands
 * and point for decimals, as required (e.g. S/ 120,000.00, S/ 5,000.00, S/ 840.00)
 */

export const formatMoney = (val) => {
  if (val === null || val === undefined || val === '') return '0.00';
  let num = val;
  if (typeof val === 'string') {
    num = parseFloat(val.replace(/[^0-9.-]+/g, ''));
  }
  if (typeof num !== 'number' || isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatSoles = (val) => {
  if (val === null || val === undefined || val === '') return 'S/ 0.00';
  let num = val;
  if (typeof val === 'string') {
    num = parseFloat(val.replace(/[^0-9.-]+/g, ''));
  }
  if (typeof num !== 'number' || isNaN(num)) return 'S/ 0.00';
  return `S/ ${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export default {
  formatMoney,
  formatSoles,
};

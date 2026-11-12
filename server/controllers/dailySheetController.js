const { dbGet, dbAll, dbRun } = require('../config/db');
const { exportSnapshot } = require('../config/snapshotSync');

function getTodayStr() {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  } catch (_) {
    const now = new Date();
    const peruTime = new Date(now.getTime() - 5 * 3600 * 1000);
    return peruTime.toISOString().split('T')[0];
  }
}

function getMondayForDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = dt.getUTCDay(); // 0 is Sunday, 1 is Monday...
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().split('T')[0];
}

function getWeekDates(mondayStr) {
  const dates = [];
  const [y, m, d] = mondayStr.split('-').map(Number);
  for (let i = 0; i < 6; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0));
    dates.push(dt.toISOString().split('T')[0]);
  }
  return dates;
}

async function calculateDayNetCash(dStr, storeId = 1) {
  const incomeRows = await dbAll(
    `SELECT amount_paid, payment_type, initial_payment, initial_payment_type, final_payment, final_payment_type, efectivo_paid, status FROM daily_income_entries WHERE date_str = ? AND (store_id = ? OR store_id IS NULL)`,
    [dStr, storeId]
  );
  const dayIncomeEf = incomeRows.reduce((sum, r) => {
    const efPaid = parseFloat(r.efectivo_paid || 0);
    if (efPaid > 0) return sum + efPaid;
    if (r.final_payment_type && r.initial_payment_type) {
      let ef = 0;
      if ((r.initial_payment_type || '').toUpperCase() === 'EFECTIVO') ef += parseFloat(r.initial_payment || 0);
      if ((r.final_payment_type || '').toUpperCase() === 'EFECTIVO') ef += parseFloat(r.final_payment || 0);
      return sum + ef;
    }
    const pType = (r.payment_type || '').toUpperCase();
    return sum + (pType === 'EFECTIVO' ? parseFloat(r.amount_paid || 0) : 0);
  }, 0);

  const expenseRows = await dbAll(
    `SELECT amount, payment_type FROM daily_expense_entries WHERE date_str = ? AND (store_id = ? OR store_id IS NULL)`,
    [dStr, storeId]
  );
  const dayExpenseEf = expenseRows.reduce((sum, r) => {
    const pType = (r.payment_type || '').toUpperCase();
    return sum + (pType === 'EFECTIVO' ? parseFloat(r.amount || 0) : 0);
  }, 0);

  return { dayIncomeEf, dayExpenseEf, netCash: dayIncomeEf - dayExpenseEf };
}

const SYSTEM_APERTURA_DATE = '2026-11-02';
const SYSTEM_APERTURA_AMOUNT = 0.0;

function getNextMonday(mondayStr) {
  const [y, m, d] = mondayStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 7, 12, 0, 0));
  return dt.toISOString().split('T')[0];
}

// Recalculates the entire correlative cash chain for the given store
async function recalculateCashChain(referenceDateStr, storeId = 1) {
  // 1. Determine starting cash at SYSTEM_APERTURA_DATE
  let startingCash = SYSTEM_APERTURA_AMOUNT;
  const aperturaRow = await dbGet(`SELECT previous_cash FROM daily_cash_sheets WHERE date_str = ? AND (store_id = ? OR store_id IS NULL)`, [SYSTEM_APERTURA_DATE, storeId]);
  if (aperturaRow && aperturaRow.previous_cash !== null && aperturaRow.previous_cash !== undefined) {
    const val = parseFloat(aperturaRow.previous_cash);
    if (val >= 0) {
      startingCash = val;
    }
  }

  // 2. Query all daily income and expense entries in EFECTIVO for this store
  const incomeRows = await dbAll(
    `SELECT date_str, amount_paid, payment_type, initial_payment, initial_payment_type, final_payment, final_payment_type, efectivo_paid, status 
     FROM daily_income_entries 
     WHERE date_str >= ? AND (store_id = ? OR store_id IS NULL)`,
    [SYSTEM_APERTURA_DATE, storeId]
  );

  const expenseRows = await dbAll(
    `SELECT date_str, amount, payment_type 
     FROM daily_expense_entries 
     WHERE date_str >= ? AND (store_id = ? OR store_id IS NULL)`,
    [SYSTEM_APERTURA_DATE, storeId]
  );

  const netCashByDay = {};

  for (const r of incomeRows) {
    const dStr = r.date_str;
    if (!dStr) continue;
    if (!netCashByDay[dStr]) netCashByDay[dStr] = 0;
    
    const efPaid = parseFloat(r.efectivo_paid || 0);
    if (efPaid > 0) {
      netCashByDay[dStr] += efPaid;
    } else if (r.final_payment_type && r.initial_payment_type) {
      let ef = 0;
      if ((r.initial_payment_type || '').toUpperCase() === 'EFECTIVO') ef += parseFloat(r.initial_payment || 0);
      if ((r.final_payment_type || '').toUpperCase() === 'EFECTIVO') ef += parseFloat(r.final_payment || 0);
      netCashByDay[dStr] += ef;
    } else {
      const pType = (r.payment_type || '').toUpperCase();
      if (pType === 'EFECTIVO') {
        netCashByDay[dStr] += parseFloat(r.amount_paid || 0);
      }
    }
  }

  for (const r of expenseRows) {
    const dStr = r.date_str;
    if (!dStr) continue;
    if (!netCashByDay[dStr]) netCashByDay[dStr] = 0;
    const pType = (r.payment_type || '').toUpperCase();
    if (pType === 'EFECTIVO') {
      netCashByDay[dStr] -= parseFloat(r.amount || 0);
    }
  }

  // 3. Determine range of weeks to calculate
  const todayStr = getTodayStr();
  let maxDateStr = todayStr;
  if (referenceDateStr && referenceDateStr > maxDateStr) {
    maxDateStr = referenceDateStr;
  }
  for (const r of incomeRows) {
    if (r.date_str && r.date_str > maxDateStr) maxDateStr = r.date_str;
  }
  for (const r of expenseRows) {
    if (r.date_str && r.date_str > maxDateStr) maxDateStr = r.date_str;
  }

  // Add at least 14 days ahead to cover future days in current week or next
  const [my, mm, md] = maxDateStr.split('-').map(Number);
  const futureObj = new Date(Date.UTC(my, mm - 1, md + 14, 12, 0, 0));
  const targetEndStr = futureObj.toISOString().split('T')[0];
  const maxMondayStr = getMondayForDate(targetEndStr);

  // 4. Fetch existing daily_cash_sheets for this store
  const existingSheets = await dbAll(
    `SELECT id, date_str, previous_cash FROM daily_cash_sheets WHERE date_str >= ? AND (store_id = ? OR store_id IS NULL)`,
    [SYSTEM_APERTURA_DATE, storeId]
  );
  const sheetsMap = {};
  for (const s of existingSheets) {
    sheetsMap[s.date_str] = s;
  }

  let currentMonday = SYSTEM_APERTURA_DATE;
  let runningCash = startingCash;

  while (currentMonday <= maxMondayStr) {
    const weekDates = getWeekDates(currentMonday);

    // Monday
    const monDate = weekDates[0];
    const monExisting = sheetsMap[monDate];
    if (!monExisting) {
      await dbRun(`INSERT INTO daily_cash_sheets (date_str, previous_cash, store_id) VALUES (?, ?, ?)`, [monDate, runningCash, storeId]);
      sheetsMap[monDate] = { date_str: monDate, previous_cash: runningCash, store_id: storeId };
    } else if (Math.abs(parseFloat(monExisting.previous_cash || 0) - runningCash) > 0.001) {
      await dbRun(`UPDATE daily_cash_sheets SET previous_cash = ?, store_id = ? WHERE id = ?`, [runningCash, storeId, monExisting.id]);
      sheetsMap[monDate].previous_cash = runningCash;
    }

    // Tuesday to Saturday
    for (let i = 1; i < 6; i++) {
      const prevDate = weekDates[i - 1];
      const curDate = weekDates[i];
      const prevNet = netCashByDay[prevDate] || 0;
      runningCash += prevNet;

      const curExisting = sheetsMap[curDate];
      if (!curExisting) {
        await dbRun(`INSERT INTO daily_cash_sheets (date_str, previous_cash, store_id) VALUES (?, ?, ?)`, [curDate, runningCash, storeId]);
        sheetsMap[curDate] = { date_str: curDate, previous_cash: runningCash, store_id: storeId };
      } else if (Math.abs(parseFloat(curExisting.previous_cash || 0) - runningCash) > 0.001) {
        await dbRun(`UPDATE daily_cash_sheets SET previous_cash = ?, store_id = ? WHERE id = ?`, [runningCash, storeId, curExisting.id]);
        sheetsMap[curDate].previous_cash = runningCash;
      }
    }

    // Saturday closing cash flows to next Monday
    const satDate = weekDates[5];
    const satNet = netCashByDay[satDate] || 0;
    runningCash += satNet;

    currentMonday = getNextMonday(currentMonday);
  }

  return sheetsMap[referenceDateStr]?.previous_cash ?? runningCash;
}

// Keep syncWeekCashSheets as alias for backward compatibility
async function syncWeekCashSheets(referenceDateStr, storeId = 1) {
  return await recalculateCashChain(referenceDateStr, storeId);
}

exports.getDailySheet = async (req, res) => {
  try {
    const dateStr = req.query.date || getTodayStr();
    const storeId = parseInt(req.query.storeId || 1, 10);
    const mondayStr = getMondayForDate(dateStr);
    
    const is_first_day = (dateStr === SYSTEM_APERTURA_DATE);

    let sheet = await dbGet(`SELECT * FROM daily_cash_sheets WHERE date_str = ? AND (store_id = ? OR store_id IS NULL)`, [dateStr, storeId]);
    
    const needsSync = !sheet || req.query.forceSync === 'true';

    if (needsSync) {
      try {
        await recalculateCashChain(dateStr, storeId);
        sheet = await dbGet(`SELECT * FROM daily_cash_sheets WHERE date_str = ? AND (store_id = ? OR store_id IS NULL)`, [dateStr, storeId]);
      } catch (syncErr) {
        console.warn('recalculateCashChain non-fatal notice:', syncErr.message || syncErr);
      }
    }

    if (!sheet) {
      sheet = { date_str: dateStr, previous_cash: 0.0, store_id: storeId };
    }

    // 2. Fetch income entries
    const rawIncome = await dbAll(
      `SELECT i.*, u.full_name as registered_by_name, c.vendedor_name as contract_vendedor
       FROM daily_income_entries i
       LEFT JOIN users u ON i.registered_by = u.id
       LEFT JOIN contracts c ON i.contract_num = c.contract_code
       WHERE i.date_str = ? AND (i.store_id = ? OR i.store_id IS NULL)
       ORDER BY i.id ASC`,
      [dateStr, storeId]
    );

    // Fetch all related entries for contract codes present on this date to compute true cumulative balance
    const contractNums = [...new Set(rawIncome.map(r => r.contract_num).filter(c => c && c !== 'S/N' && c !== 'PRESTAMO' && c !== 'CAMBIO' && c !== 'OTROS' && c !== 'OTRO'))];
    let allEntriesMap = {};
    if (contractNums.length > 0) {
      const inPlaceholders = contractNums.map(() => '?').join(',');
      const related = await dbAll(
        `SELECT id, contract_num, total_amount, amount_paid, status, date_str 
         FROM daily_income_entries 
         WHERE contract_num IN (${inPlaceholders}) AND (status IS NULL OR status != 'ANULADO') AND (store_id = ? OR store_id IS NULL)
         ORDER BY date_str ASC, id ASC`,
        [...contractNums, storeId]
      );
      for (const e of related) {
        if (!allEntriesMap[e.contract_num]) allEntriesMap[e.contract_num] = [];
        allEntriesMap[e.contract_num].push(e);
      }
    }

    const processedIncome = rawIncome.map((row) => {
      const isAnulado = row.status === 'ANULADO';
      const paid = row.amount_paid || 0;
      let effectiveTotal = row.total_amount || 0;
      let cumulativePaid = paid;
      let isSecondary = false;
      let history = [];

      if (row.contract_num && allEntriesMap[row.contract_num]) {
        history = allEntriesMap[row.contract_num];
        const maxTotal = Math.max(...history.map(h => h.total_amount || 0), effectiveTotal);
        if (maxTotal > 0) effectiveTotal = maxTotal;

        const myIndex = history.findIndex(h => h.id === row.id);
        if (myIndex > 0) {
          isSecondary = true;
        }

        cumulativePaid = history
          .slice(0, myIndex >= 0 ? myIndex + 1 : history.length)
          .reduce((sum, h) => sum + (h.amount_paid || 0), 0);
      }

      const saldo = isAnulado ? 0 : (effectiveTotal > 0 ? Math.max(0, effectiveTotal - cumulativePaid) : 0);

      let resolvedStatus = row.status || 'ACTIVO';
      if (!isAnulado) {
        if (!isSecondary && history && history.length > 1) {
          // El contrato original de creación se mantiene en VERDE (ACTIVO) para siempre
          resolvedStatus = 'ACTIVO';
        } else if (resolvedStatus !== 'ENTREGADO' && resolvedStatus !== 'ENTREGADO CON SALDO' && resolvedStatus !== 'ENTREGADO (NO CANCELADO)') {
          if (effectiveTotal > 0 && saldo <= 0) {
            resolvedStatus = 'CANCELADO';
          }
        }
      }

      const isPrestamoOrCambio = row.entry_type === 'PRESTAMO' || row.entry_type === 'INTERCAMBIO' || row.entry_type === 'OTRO' || row.contract_num === 'PRESTAMO' || row.contract_num === 'CAMBIO' || row.contract_num === 'OTROS' || row.contract_num === 'OTRO';
      let finalVendedor = null;
      if (!isPrestamoOrCambio) {
        finalVendedor = row.vendedor_name || row.contract_vendedor || (row.registered_by_name && !/admin/i.test(row.registered_by_name) ? row.registered_by_name : '') || 'Carla';
        if (/carla/i.test(finalVendedor)) finalVendedor = 'Carla';
        else if (/jhon/i.test(finalVendedor)) finalVendedor = 'Jhon';
        else if (/jose luis/i.test(finalVendedor)) finalVendedor = 'Jose Luis';
        else if (/joshy/i.test(finalVendedor)) finalVendedor = 'Joshy';
        else if (/juan/i.test(finalVendedor)) finalVendedor = 'Juan';
      }

      // Breakdown for payment methods (handling initial deposit + final cancellation payment)
      let efectivo = 0, bcp = 0, bbva = 0, pos = 0, yape = 0;

      if ((row.efectivo_paid || 0) > 0 || (row.bcp_paid || 0) > 0 || (row.pos_paid || 0) > 0 || (row.yape_paid || 0) > 0) {
        efectivo = row.efectivo_paid || 0;
        bcp = row.bcp_paid || 0;
        bbva = row.bbva_paid || 0;
        pos = row.pos_paid || 0;
        yape = row.yape_paid || 0;
      } else if (row.final_payment_type && row.initial_payment_type) {
        // Split between initial deposit method and final payment method
        const initAmt = row.initial_payment || 0;
        const finAmt = row.final_payment || Math.max(0, paid - initAmt);

        const addMethod = (pType, amt) => {
          const t = (pType || '').toUpperCase();
          if (t === 'EFECTIVO') efectivo += amt;
          else if (t.includes('BCP')) bcp += amt;
          else if (t.includes('BBVA')) bbva += amt;
          else if (t.includes('POS') || t.includes('IZIPAY')) pos += amt;
          else if (t.includes('YAPE')) yape += amt;
        };

        addMethod(row.initial_payment_type, initAmt);
        addMethod(row.final_payment_type, finAmt);
      } else {
        // Single payment method
        const pType = (row.payment_type || '').toUpperCase();
        if (pType === 'EFECTIVO') efectivo = paid;
        else if (pType.includes('BCP') || pType.includes('DEPOSITO BCP')) bcp = paid;
        else if (pType.includes('BBVA') || pType.includes('DEPOSITO BBVA')) bbva = paid;
        else if (pType.includes('POS') || pType.includes('IZIPAY')) pos = paid;
        else if (pType.includes('YAPE')) yape = paid;
      }

      // Construct combined payment types display label
      const methods = [];
      if (efectivo > 0) methods.push(`EFECTIVO`);
      if (bcp > 0) methods.push(`BCP`);
      if (bbva > 0) methods.push(`BBVA`);
      if (pos > 0) methods.push(`POS`);
      if (yape > 0) methods.push(`YAPE`);

      const payment_type_display = methods.length > 0 ? methods.join(' + ') : row.payment_type;

      return {
        ...row,
        total_amount: effectiveTotal,
        vendedor_name: finalVendedor,
        status: resolvedStatus,
        is_secondary: isSecondary,
        saldo,
        efectivo,
        bcp,
        bbva,
        pos,
        yape,
        payment_type_display,
      };
    });

    // 3. Fetch expense entries
    const rawExpenses = await dbAll(
      `SELECT e.*, u.full_name as registered_by_name
       FROM daily_expense_entries e
       LEFT JOIN users u ON e.registered_by = u.id
       WHERE e.date_str = ? AND (e.store_id = ? OR e.store_id IS NULL)
       ORDER BY e.id ASC`,
      [dateStr, storeId]
    );

    const processedExpenses = rawExpenses.map((row) => {
      const amt = row.amount || 0;
      const pType = (row.payment_type || '').toUpperCase();

      return {
        ...row,
        expense_type: row.expense_type || 'General',
        efectivo: pType === 'EFECTIVO' ? amt : 0,
        bcp: (pType === 'DEPOSITO BCP' || pType === 'DPTO/BCP' || pType === 'BCP') ? amt : 0,
        bbva: (pType === 'DEPOSITO BBVA' || pType === 'DPTO/BBVA' || pType === 'BBVA') ? amt : 0,
        pos: (pType === 'POS' || pType === 'IZIPAY') ? amt : 0,
        yape: pType === 'YAPE' ? amt : 0,
      };
    });

    // 4. Summaries calculation (ingresos cobrados suman al 100% para cuadre con banco y caja)
    const incomeTotals = processedIncome.reduce(
      (acc, item) => {
        acc.efectivo += item.efectivo;
        acc.bcp += item.bcp;
        acc.bbva += item.bbva;
        acc.pos += item.pos;
        acc.yape += item.yape;
        acc.total += item.amount_paid || 0;
        return acc;
      },
      { efectivo: 0, bcp: 0, bbva: 0, pos: 0, yape: 0, total: 0 }
    );

    const expenseTotals = processedExpenses.reduce(
      (acc, item) => {
        acc.efectivo += item.efectivo;
        acc.bcp += item.bcp;
        acc.bbva += item.bbva;
        acc.pos += item.pos;
        acc.yape += item.yape;
        acc.total += item.amount;
        return acc;
      },
      { efectivo: 0, bcp: 0, bbva: 0, pos: 0, yape: 0, total: 0 }
    );

    const finalCashInHand = (sheet.previous_cash || 0) + incomeTotals.efectivo - expenseTotals.efectivo;

    return res.json({
      success: true,
      date_str: dateStr,
      previous_cash: sheet.previous_cash || 0,
      is_first_day,
      income_entries: processedIncome,
      expense_entries: processedExpenses,
      income_totals: incomeTotals,
      expense_totals: expenseTotals,
      final_cash_in_hand: finalCashInHand,
    });
  } catch (err) {
    console.error('Error fetching daily sheet:', err);
    return res.status(500).json({ success: false, error: 'Error al cargar planilla diaria.' });
  }
};

exports.updatePreviousCash = async (req, res) => {
  try {
    const { date_str, previous_cash, storeId } = req.body;
    const storeIdVal = parseInt(storeId || 1, 10);
    const dateVal = date_str || getTodayStr();
    const cashVal = parseFloat(previous_cash || 0);

    const existing = await dbGet(`SELECT id FROM daily_cash_sheets WHERE date_str = ? AND (store_id = ? OR store_id IS NULL)`, [dateVal, storeIdVal]);
    if (existing) {
      await dbRun(`UPDATE daily_cash_sheets SET previous_cash = ?, store_id = ? WHERE id = ?`, [cashVal, storeIdVal, existing.id]);
    } else {
      await dbRun(`INSERT INTO daily_cash_sheets (date_str, previous_cash, store_id) VALUES (?, ?, ?)`, [dateVal, cashVal, storeIdVal]);
    }

    // Cascade to all days of the week!
    await syncWeekCashSheets(dateVal, storeIdVal);
    await exportSnapshot(dbAll);

    return res.json({ success: true, message: 'Caja anterior actualizada.' });
  } catch (err) {
    console.error('Error updating previous cash:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar caja anterior.' });
  }
};

exports.lookupContract = async (req, res) => {
  try {
    const { contractNum } = req.params;
    if (!contractNum || contractNum.trim() === '') {
      return res.status(400).json({ success: false, error: 'Número de contrato no proporcionado.' });
    }

    const code = contractNum.trim();
    const entries = await dbAll(
      `SELECT * FROM daily_income_entries WHERE contract_num = ? AND (status IS NULL OR status != 'ANULADO') ORDER BY date_str ASC, id ASC`,
      [code]
    );

    const contractRow = await dbGet(`SELECT * FROM contracts WHERE contract_code = ?`, [code]);

    if (entries.length === 0 && !contractRow) {
      return res.json({ success: true, exists: false });
    }

    const initialEntry = entries[0];
    const maxEntriesTotal = entries.reduce((max, e) => Math.max(max, e.total_amount || 0), 0);
    const totalAmount = Math.max(maxEntriesTotal, contractRow ? (contractRow.total_amount || 0) : 0);

    let totalPaid = 0;
    entries.forEach(e => {
      totalPaid += (e.amount_paid || 0);
    });

    const balanceDue = Math.max(0, totalAmount - totalPaid);
    const isCancelled = balanceDue <= 0 && totalAmount > 0;

    let cleanClientName = initialEntry ? initialEntry.details : (contractRow ? contractRow.client_name : '');
    cleanClientName = cleanClientName.replace(/\s*\((?:CANCELACION|\d+°?\s*ADELANTO|ABONO)[^)]*\)/gi, '').trim();

    const originDate = initialEntry ? initialEntry.date_str : (contractRow ? contractRow.date_str : null);
    const originYear = originDate ? parseInt(originDate.slice(0, 4)) : null;
    const isPreviousYear = originYear ? (originYear < new Date().getFullYear()) : false;

    return res.json({
      success: true,
      exists: true,
      contract_num: code,
      client_name: cleanClientName,
      total_amount: totalAmount,
      total_paid: totalPaid,
      balance_due: balanceDue,
      status: isCancelled ? 'CANCELADO' : 'ACTIVO',
      payment_count: entries.length,
      initial_entry: initialEntry,
      entries_history: entries,
      origin_date: originDate,
      origin_year: originYear,
      is_previous_year: isPreviousYear
    });
  } catch (err) {
    console.error('Error looking up contract in daily sheet:', err);
    return res.status(500).json({ success: false, error: 'Error al buscar contrato.' });
  }
};

exports.addIncomeEntry = async (req, res) => {
  try {
    const { date_str, entry_type, contract_num, details, total_amount, amount_paid, payment_type, vendedor_name, storeId } = req.body;
    const storeIdVal = parseInt(storeId || 1, 10);

    if (!details || amount_paid === undefined || amount_paid === null || !payment_type) {
      return res.status(400).json({ success: false, error: 'Complete los detalles, el monto recibido y el tipo de pago.' });
    }

    const dateVal = date_str || getTodayStr();
    const numTotal = parseFloat(total_amount || 0);
    const numPaid = parseFloat(amount_paid || 0);
    const contractCode = contract_num && contract_num.trim() !== '' ? contract_num.trim() : (entry_type === 'PRESTAMO' ? 'PRESTAMO' : (entry_type === 'INTERCAMBIO' ? 'CAMBIO' : (entry_type === 'OTRO' ? 'OTROS' : 'S/N')));
    const entryTypeVal = entry_type || 'CONTRATO';
    const isNoSellerType = entryTypeVal === 'PRESTAMO' || entryTypeVal === 'INTERCAMBIO' || entryTypeVal === 'OTRO' || contractCode === 'PRESTAMO' || contractCode === 'CAMBIO' || contractCode === 'OTROS' || contractCode === 'OTRO';
    let cleanVendedor = null;
    if (!isNoSellerType) {
      cleanVendedor = vendedor_name && vendedor_name.trim() !== '' ? vendedor_name.trim() : null;
      if (!cleanVendedor && contractCode && contractCode !== 'S/N' && contractCode !== 'PRESTAMO' && contractCode !== 'CAMBIO' && contractCode !== 'OTROS' && contractCode !== 'OTRO') {
        const cRow = await dbGet(`SELECT vendedor_name FROM contracts WHERE contract_code = ? LIMIT 1`, [contractCode]);
        if (cRow && cRow.vendedor_name) cleanVendedor = cRow.vendedor_name;
      }
      if (!cleanVendedor && req.user && req.user.full_name && !/admin/i.test(req.user.full_name)) {
        cleanVendedor = req.user.full_name;
      }
      if (!cleanVendedor) cleanVendedor = 'Carla';
      if (/carla/i.test(cleanVendedor)) cleanVendedor = 'Carla';
      else if (/jhon/i.test(cleanVendedor)) cleanVendedor = 'Jhon';
      else if (/jose luis/i.test(cleanVendedor)) cleanVendedor = 'Jose Luis';
      else if (/joshy/i.test(cleanVendedor)) cleanVendedor = 'Joshy';
      else if (/juan/i.test(cleanVendedor)) cleanVendedor = 'Juan';
    }

    let initialStatus = 'ACTIVO';
    if (contractCode !== 'S/N' && contractCode !== 'PRESTAMO' && contractCode !== 'CAMBIO' && contractCode !== 'OTROS' && contractCode !== 'OTRO') {
      const sumRow = await dbGet(
        `SELECT SUM(amount_paid) as total, MAX(total_amount) as max_total FROM daily_income_entries WHERE contract_num = ? AND (status IS NULL OR status != 'ANULADO')`,
        [contractCode]
      );
      const prevPaid = sumRow ? (sumRow.total || 0) : 0;
      const grandTotalPaid = prevPaid + numPaid;
      const targetTotal = (sumRow && sumRow.max_total > 0) ? sumRow.max_total : numTotal;

      if (targetTotal > 0 && grandTotalPaid >= targetTotal) {
        initialStatus = 'CANCELADO Y ENTREGADO';
      }
    } else if (numTotal > 0 && numPaid >= numTotal) {
      initialStatus = 'CANCELADO Y ENTREGADO';
    }

    const result = await dbRun(
      `INSERT INTO daily_income_entries (date_str, entry_type, contract_num, details, total_amount, amount_paid, payment_type, initial_payment, initial_payment_type, status, vendedor_name, registered_by, store_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [dateVal, entryTypeVal, contractCode, details.trim(), numTotal, numPaid, payment_type, numPaid, payment_type, initialStatus, cleanVendedor, req.user ? req.user.id : null, storeIdVal]
    );

    // Los registros de planilla diaria se quedan únicamente en la planilla diaria (Punto 1)

    await syncWeekCashSheets(dateVal, storeIdVal);
    await exportSnapshot(dbAll);
    return res.status(201).json({ success: true, message: 'Ingreso agregado a la planilla.' });
  } catch (err) {
    console.error('Error adding income entry:', err);
    return res.status(500).json({ success: false, error: 'Error al agregar ingreso.' });
  }
};

exports.updateIncomeEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { entry_type, contract_num, details, total_amount, amount_paid, payment_type, status, date_str, vendedor_name } = req.body;

    const prevEntry = await dbGet(`SELECT * FROM daily_income_entries WHERE id = ?`, [id]);
    if (!prevEntry) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    }

    const numTotal = parseFloat(total_amount !== undefined && total_amount !== '' ? total_amount : (prevEntry.total_amount || 0));
    const numPaid = parseFloat(amount_paid !== undefined && amount_paid !== '' ? amount_paid : (prevEntry.amount_paid || 0));
    const contractCode = contract_num ? contract_num.trim() : (prevEntry.contract_num || 'S/N');
    const statusVal = status || prevEntry.status || 'ACTIVO';
    const targetDate = date_str && date_str.trim() !== '' ? date_str.trim() : prevEntry.date_str;
    const finalPayType = payment_type || prevEntry.payment_type || 'EFECTIVO';
    const isNoSellerType = (prevEntry.entry_type === 'PRESTAMO' || prevEntry.entry_type === 'INTERCAMBIO' || prevEntry.entry_type === 'OTRO' || contractCode === 'PRESTAMO' || contractCode === 'CAMBIO' || contractCode === 'OTROS' || contractCode === 'OTRO');
    let finalVendedor = null;
    if (!isNoSellerType) {
      finalVendedor = vendedor_name !== undefined ? (vendedor_name ? vendedor_name.trim() : null) : (prevEntry.vendedor_name || null);
      if (!finalVendedor && prevEntry.contract_num) {
        const cRow = await dbGet(`SELECT vendedor_name FROM contracts WHERE contract_code = ? LIMIT 1`, [prevEntry.contract_num]);
        if (cRow && cRow.vendedor_name) finalVendedor = cRow.vendedor_name;
      }
      if (!finalVendedor) finalVendedor = 'Carla';
      if (/carla/i.test(finalVendedor)) finalVendedor = 'Carla';
      else if (/jhon/i.test(finalVendedor)) finalVendedor = 'Jhon';
      else if (/jose luis/i.test(finalVendedor)) finalVendedor = 'Jose Luis';
      else if (/joshy/i.test(finalVendedor)) finalVendedor = 'Joshy';
      else if (/juan/i.test(finalVendedor)) finalVendedor = 'Juan';
    }

    // Recalculate payment breakdown
    let efectivoPaid = 0, bcpPaid = 0, bbvaPaid = 0, posPaid = 0, yapePaid = 0;
    const pType = finalPayType.toUpperCase();
    if (pType === 'EFECTIVO') efectivoPaid = numPaid;
    else if (pType.includes('BCP') || pType.includes('DPTO/BCP')) bcpPaid = numPaid;
    else if (pType.includes('BBVA') || pType.includes('DPTO/BBVA')) bbvaPaid = numPaid;
    else if (pType.includes('POS') || pType.includes('IZIPAY')) posPaid = numPaid;
    else if (pType.includes('YAPE')) yapePaid = numPaid;

    try {
      await dbRun(
        `UPDATE daily_income_entries 
         SET date_str = ?, entry_type = ?, contract_num = ?, details = ?, total_amount = ?, amount_paid = ?, payment_type = ?, initial_payment = ?, initial_payment_type = ?, status = ?,
             efectivo_paid = ?, bcp_paid = ?, bbva_paid = ?, pos_paid = ?, yape_paid = ?, vendedor_name = ?
         WHERE id = ?`,
        [
          targetDate,
          entry_type || prevEntry.entry_type || 'CONTRATO',
          contractCode,
          (details !== undefined ? details : prevEntry.details || '').trim(),
          numTotal,
          numPaid,
          finalPayType,
          numPaid,
          finalPayType,
          statusVal,
          efectivoPaid,
          bcpPaid,
          bbvaPaid,
          posPaid,
          yapePaid,
          finalVendedor,
          id
        ]
      );
    } catch (innerErr) {
      console.warn('Full update failed, using base fallback:', innerErr.message);
      await dbRun(
        `UPDATE daily_income_entries 
         SET date_str = ?, entry_type = ?, contract_num = ?, details = ?, total_amount = ?, amount_paid = ?, payment_type = ?, status = ?, vendedor_name = ?
         WHERE id = ?`,
        [
          targetDate,
          entry_type || prevEntry.entry_type || 'CONTRATO',
          contractCode,
          (details !== undefined ? details : prevEntry.details || '').trim(),
          numTotal,
          numPaid,
          finalPayType,
          statusVal,
          finalVendedor,
          id
        ]
      );
    }


    if (prevEntry.date_str) {
      await syncWeekCashSheets(prevEntry.date_str);
    }
    if (targetDate && targetDate !== prevEntry.date_str) {
      await syncWeekCashSheets(targetDate);
    }
    await exportSnapshot(dbAll);
    return res.json({ success: true, message: 'Fila de ingreso actualizada.', date_str: targetDate });
  } catch (err) {
    console.error('Error updating income entry:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar ingreso.' });
  }
};

exports.toggleAnularIncomeEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await dbGet(`SELECT * FROM daily_income_entries WHERE id = ?`, [id]);

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    }

    const newStatus = entry.status === 'ANULADO' ? 'ACTIVO' : 'ANULADO';

    await dbRun(`UPDATE daily_income_entries SET status = ? WHERE id = ?`, [newStatus, id]);
    await syncWeekCashSheets(entry.date_str);
    await exportSnapshot(dbAll);

    return res.json({
      success: true,
      message: newStatus === 'ANULADO' ? '¡Ingreso marcado como ANULADO (Fila en Rojo)!' : 'Ingreso reactivado a estado ACTIVO.',
      status: newStatus,
    });
  } catch (err) {
    console.error('Error toggling anular income:', err);
    return res.status(500).json({ success: false, error: 'Error al anular ingreso.' });
  }
};

exports.markAsFinalizedIncomeEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_type, cancellation_payment_amount, amount_paid, split_efectivo, split_bcp, split_pos, split_yape } = req.body || {};
    const entry = await dbGet(`SELECT * FROM daily_income_entries WHERE id = ?`, [id]);

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    }

    const initialPaid = entry.initial_payment || entry.amount_paid || 0;
    const initialType = (entry.initial_payment_type || entry.payment_type || 'EFECTIVO').toUpperCase();

    let efectivoVal = 0, bcpVal = 0, bbvaVal = 0, posVal = 0, yapeVal = 0;

    if (initialType === 'EFECTIVO') efectivoVal += initialPaid;
    else if (initialType.includes('BCP')) bcpVal += initialPaid;
    else if (initialType.includes('BBVA')) bbvaVal += initialPaid;
    else if (initialType.includes('POS') || initialType.includes('IZIPAY')) posVal += initialPaid;
    else if (initialType.includes('YAPE')) yapeVal += initialPaid;

    let finalPaymentAmt = 0;

    if (split_efectivo || split_bcp || split_pos || split_yape) {
      const sEf = parseFloat(split_efectivo || 0);
      const sBcp = parseFloat(split_bcp || 0);
      const sPos = parseFloat(split_pos || 0);
      const sYape = parseFloat(split_yape || 0);

      efectivoVal += sEf;
      bcpVal += sBcp;
      posVal += sPos;
      yapeVal += sYape;

      finalPaymentAmt = sEf + sBcp + sPos + sYape;
    } else {
      const pType = (payment_type || entry.payment_type || 'EFECTIVO').toUpperCase();
      const inputAmt = cancellation_payment_amount !== undefined ? cancellation_payment_amount : amount_paid;
      const remainingBalance = Math.max(0, (entry.total_amount || 0) - initialPaid);
      finalPaymentAmt = inputAmt !== undefined && inputAmt !== null && inputAmt !== '' ? parseFloat(inputAmt) : remainingBalance;

      if (pType === 'EFECTIVO') efectivoVal += finalPaymentAmt;
      else if (pType.includes('BCP')) bcpVal += finalPaymentAmt;
      else if (pType.includes('BBVA')) bbvaVal += finalPaymentAmt;
      else if (pType.includes('POS') || pType.includes('IZIPAY')) posVal += finalPaymentAmt;
      else if (pType.includes('YAPE')) yapeVal += finalPaymentAmt;
    }

    const totalFinalPaid = initialPaid + finalPaymentAmt;
    const finalMethod = payment_type || entry.payment_type || 'EFECTIVO';

    await dbRun(
      `UPDATE daily_income_entries 
       SET status = 'CANCELADO', 
           amount_paid = ?, 
           final_payment = ?, 
           final_payment_type = ?,
           efectivo_paid = ?,
           bcp_paid = ?,
           bbva_paid = ?,
           pos_paid = ?,
           yape_paid = ?
       WHERE id = ?`,
      [totalFinalPaid, finalPaymentAmt, finalMethod, efectivoVal, bcpVal, bbvaVal, posVal, yapeVal, id]
    );

    // Update all entries for this contract number in daily sheet to CANCELADO
    if (entry.contract_num && entry.contract_num !== 'S/N' && entry.contract_num !== 'PRESTAMO' && entry.contract_num !== 'CAMBIO') {
      await dbRun(
        `UPDATE daily_income_entries SET status = 'CANCELADO' WHERE contract_num = ? AND status != 'ANULADO'`,
        [entry.contract_num]
      );
    }

    await syncWeekCashSheets(entry.date_str);
    await exportSnapshot(dbAll);
    return res.json({
      success: true,
      message: '¡Cobro de saldo registrado! Contrato marcado como CANCELADO (Pendiente de Entrega).',
    });
  } catch (err) {
    console.error('Error finalizing income entry:', err);
    return res.status(500).json({ success: false, error: 'Error al registrar cobro de saldo.' });
  }
};

exports.markAsEntregadoIncomeEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await dbGet(`SELECT * FROM daily_income_entries WHERE id = ?`, [id]);

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    }

    const currentStatus = (entry.status || 'ACTIVO').toUpperCase();
    const isCancelado = currentStatus === 'CANCELADO' || currentStatus === 'CANCELADO Y ENTREGADO';
    const isEntregado = currentStatus === 'ENTREGADO' || currentStatus === 'ENTREGADO CON SALDO' || currentStatus === 'ENTREGADO (NO CANCELADO)' || currentStatus === 'CANCELADO Y ENTREGADO';

    let newStatus = '';
    if (isEntregado) {
      newStatus = isCancelado ? 'CANCELADO' : 'ACTIVO';
    } else {
      newStatus = isCancelado ? 'CANCELADO Y ENTREGADO' : 'ENTREGADO';
    }

    await dbRun(`UPDATE daily_income_entries SET status = ? WHERE id = ?`, [newStatus, id]);

    await exportSnapshot(dbAll);
    return res.json({
      success: true,
      message: isEntregado ? 'Estado de entrega retirado.' : (newStatus === 'CANCELADO Y ENTREGADO' ? '¡Marcado como ENTREGADO y CANCELADO!' : '¡Pedido marcado como ENTREGADO!'),
      status: newStatus
    });
  } catch (err) {
    console.error('Error marking entry as entregado:', err);
    return res.status(500).json({ success: false, error: 'Error al marcar como entregado.' });
  }
};

exports.toggleCanceladoIncomeEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await dbGet(`SELECT * FROM daily_income_entries WHERE id = ?`, [id]);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    }

    const currentStatus = (entry.status || 'ACTIVO').toUpperCase();
    const isCancelado = currentStatus === 'CANCELADO' || currentStatus === 'CANCELADO Y ENTREGADO';
    const isEntregado = currentStatus === 'ENTREGADO' || currentStatus === 'ENTREGADO CON SALDO' || currentStatus === 'ENTREGADO (NO CANCELADO)' || currentStatus === 'CANCELADO Y ENTREGADO';

    let newStatus = '';
    if (isCancelado) {
      newStatus = isEntregado ? 'ENTREGADO' : 'ACTIVO';
    } else {
      newStatus = isEntregado ? 'CANCELADO Y ENTREGADO' : 'CANCELADO';
    }

    await dbRun(`UPDATE daily_income_entries SET status = ? WHERE id = ?`, [newStatus, id]);

    await syncWeekCashSheets(entry.date_str);
    await exportSnapshot(dbAll);

    return res.json({
      success: true,
      message: (newStatus === 'CANCELADO' || newStatus === 'CANCELADO Y ENTREGADO')
        ? '¡Contrato marcado como CANCELADO!'
        : 'Estado de cancelación retirado.',
      status: newStatus
    });
  } catch (err) {
    console.error('Error toggling cancelado income:', err);
    return res.status(500).json({ success: false, error: 'Error al cambiar estado cancelado.' });
  }
};

exports.deleteIncomeEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await dbGet(`SELECT * FROM daily_income_entries WHERE id = ?`, [id]);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    }

    await dbRun(`DELETE FROM daily_income_entries WHERE id = ?`, [id]);
    await syncWeekCashSheets(entry.date_str);
    await exportSnapshot(dbAll);
    return res.json({ success: true, message: 'Registro eliminado de la planilla.' });
  } catch (err) {
    console.error('Error deleting income entry:', err);
    return res.status(500).json({ success: false, error: 'Error al eliminar ingreso.' });
  }
};

exports.addExpenseEntry = async (req, res) => {
  try {
    const { date_str, expense_type, details, amount, payment_type, staff_name, weekly_discount, staff_loan_id, storeId } = req.body;
    const storeIdVal = parseInt(storeId || 1, 10);

    if (!details || amount === undefined || amount === null || !payment_type) {
      return res.status(400).json({ success: false, error: 'Complete detalles, importe y tipo de pago.' });
    }

    const dateVal = date_str || getTodayStr();
    const numAmount = parseFloat(amount || 0);
    const expCategory = expense_type || 'Gasto Interno';
    const normCategory = expCategory.trim().toUpperCase();

    const expenseRes = await dbRun(
      `INSERT INTO daily_expense_entries (date_str, expense_type, details, amount, payment_type, staff_name, weekly_discount, registered_by, store_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dateVal,
        expCategory,
        details.trim(),
        numAmount,
        payment_type,
        staff_name ? staff_name.trim() : null,
        weekly_discount ? parseFloat(weekly_discount) : null,
        req.user ? req.user.id : null,
        storeIdVal
      ]
    );

    // Sync with Expenses table for Admin
    await dbRun(
      `INSERT INTO expenses (expense_date, category, amount, description, is_contract_related, registered_by, store_id)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [new Date().toISOString(), expCategory, numAmount, details.trim(), req.user ? req.user.id : null, storeIdVal]
    );

    // Dynamic handling for Staff Loans (Pestaña 6)
    if (normCategory.includes('PRESTAMO AL PERSONAL') || normCategory.includes('PRÉSTAMO AL PERSONAL')) {
      const finalStaffName = (staff_name || details).trim();
      const numWeekly = parseFloat(weekly_discount || 0);
      
      await dbRun(
        `INSERT INTO staff_loans (date_str, staff_name, total_amount, weekly_discount, amount_paid, balance_due, status, notes, expense_entry_id, created_by)
         VALUES (?, ?, ?, ?, 0.0, ?, 'ACTIVO', ?, ?, ?)`,
        [dateVal, finalStaffName, numAmount, numWeekly, numAmount, details.trim(), expenseRes.id, req.user.id]
      );
    } else if (normCategory.includes('DESCUENTO PRÉSTAMO') || normCategory.includes('DESCUENTO PRESTAMO')) {
      let targetLoan = null;
      if (staff_loan_id) {
        targetLoan = await dbGet(`SELECT * FROM staff_loans WHERE id = ?`, [staff_loan_id]);
      } else if (staff_name && staff_name.trim() !== '') {
        targetLoan = await dbGet(`SELECT * FROM staff_loans WHERE staff_name LIKE ? AND status = 'ACTIVO' ORDER BY id DESC LIMIT 1`, [`%${staff_name.trim()}%`]);
      }

      if (targetLoan) {
        await dbRun(
          `INSERT INTO staff_loan_payments (loan_id, date_str, amount, notes, registered_by)
           VALUES (?, ?, ?, ?, ?)`,
          [targetLoan.id, dateVal, numAmount, `Descuento en planilla vendedora (${dateVal})`, req.user.id]
        );

        const sumRow = await dbGet(
          `SELECT SUM(amount) as total FROM staff_loan_payments WHERE loan_id = ?`,
          [targetLoan.id]
        );
        const totalPaid = sumRow ? sumRow.total || 0 : 0;
        const newBalance = Math.max(0, targetLoan.total_amount - totalPaid);
        const newStatus = newBalance <= 0 ? 'LIQUIDADO' : 'ACTIVO';

        await dbRun(
          `UPDATE staff_loans SET amount_paid = ?, balance_due = ?, status = ? WHERE id = ?`,
          [totalPaid, newBalance, newStatus, targetLoan.id]
        );
      }
    }

    // Sync with Payment Schedule if it matches fixed services (LUZ, ALQUILER, AGUA, INTERNET, MANTENIMIENTO, etc.)
    const normalizedCat = expCategory.toUpperCase();
    const matchingSchedule = await dbGet(
      `SELECT id FROM payment_schedule 
       WHERE status != 'PAGADO' AND (
         UPPER(concept) LIKE ? OR UPPER(category) LIKE ? OR UPPER(concept) = ? OR UPPER(category) = ?
       ) ORDER BY id ASC LIMIT 1`,
      [`%${normalizedCat}%`, `%${normalizedCat}%`, normalizedCat, normalizedCat]
    );

    if (matchingSchedule) {
      await dbRun(
        `UPDATE payment_schedule 
         SET status = 'REGISTRADO_POR_VENDEDORA', 
             notes = ? 
         WHERE id = ?`,
        [`Registrado por Vendedora (S/ ${numAmount.toFixed(2)} en ${payment_type}) en planilla del ${dateVal}`, matchingSchedule.id]
      );
    }

    await syncWeekCashSheets(dateVal, storeIdVal);
    await exportSnapshot(dbAll);
    return res.status(201).json({ success: true, message: 'Egreso agregado a la planilla.' });
  } catch (err) {
    console.error('Error adding expense entry:', err);
    return res.status(500).json({ success: false, error: 'Error al agregar egreso: ' + err.message });
  }
};

exports.updateExpenseEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { expense_type, details, amount, payment_type, date_str } = req.body;

    const prevExp = await dbGet(`SELECT * FROM daily_expense_entries WHERE id = ?`, [id]);
    if (!prevExp) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    }

    const numAmount = parseFloat(amount !== undefined && amount !== '' ? amount : (prevExp.amount || 0));
    const targetDate = date_str && date_str.trim() !== '' ? date_str.trim() : prevExp.date_str;

    await dbRun(
      `UPDATE daily_expense_entries SET date_str = ?, expense_type = ?, details = ?, amount = ?, payment_type = ? WHERE id = ?`,
      [targetDate, expense_type || prevExp.expense_type || 'General', (details !== undefined ? details : prevExp.details || '').trim(), numAmount, payment_type || prevExp.payment_type, id]
    );

    if (prevExp.date_str) {
      await syncWeekCashSheets(prevExp.date_str);
    }
    if (targetDate && targetDate !== prevExp.date_str) {
      await syncWeekCashSheets(targetDate);
    }
    await exportSnapshot(dbAll);
    return res.json({ success: true, message: 'Fila de egreso actualizada.', date_str: targetDate });
  } catch (err) {
    console.error('Error updating expense entry:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar egreso.' });
  }
};

exports.deleteExpenseEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await dbGet(`SELECT * FROM daily_expense_entries WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Egreso no encontrado.' });
    }

    const typeUpper = (existing.expense_type || '').toUpperCase();

    // Si era préstamo al personal, limpiar el préstamo y pagos generados asociados
    if (typeUpper.includes('PRÉSTAMO AL PERSONAL') || typeUpper.includes('PRESTAMO AL PERSONAL')) {
      try {
        const associatedLoan = await dbGet(`SELECT id FROM staff_loans WHERE expense_entry_id = ?`, [id]);
        if (associatedLoan) {
          await dbRun(`DELETE FROM staff_loan_payments WHERE loan_id = ?`, [associatedLoan.id]);
          await dbRun(`DELETE FROM staff_loans WHERE id = ?`, [associatedLoan.id]);
        } else {
          const matchLoan = await dbGet(
            `SELECT id FROM staff_loans WHERE date_str = ? AND total_amount = ? AND status = 'ACTIVO' ORDER BY id DESC LIMIT 1`,
            [existing.date_str, existing.amount]
          );
          if (matchLoan) {
            await dbRun(`DELETE FROM staff_loan_payments WHERE loan_id = ?`, [matchLoan.id]);
            await dbRun(`DELETE FROM staff_loans WHERE id = ?`, [matchLoan.id]);
          }
        }
      } catch (errLoan) {
        console.warn('Error cleaning associated staff loan:', errLoan);
      }
    } else if (typeUpper.includes('DESCUENTO PRÉSTAMO') || typeUpper.includes('DESCUENTO PRESTAMO')) {
      try {
        const targetLoan = await dbGet(
          `SELECT id, total_amount FROM staff_loans WHERE staff_name LIKE ? ORDER BY id DESC LIMIT 1`,
          [`%${(existing.staff_name || existing.details || '').trim()}%`]
        );
        if (targetLoan) {
          const pRow = await dbGet(
            `SELECT id FROM staff_loan_payments WHERE loan_id = ? AND date_str = ? AND amount = ? ORDER BY id DESC LIMIT 1`,
            [targetLoan.id, existing.date_str, existing.amount]
          );
          if (pRow) {
            await dbRun(`DELETE FROM staff_loan_payments WHERE id = ?`, [pRow.id]);
            const sumRow = await dbGet(`SELECT SUM(amount) as total FROM staff_loan_payments WHERE loan_id = ?`, [targetLoan.id]);
            const totalPaid = sumRow ? sumRow.total || 0 : 0;
            const newBalance = Math.max(0, targetLoan.total_amount - totalPaid);
            const newStatus = newBalance <= 0 ? 'LIQUIDADO' : 'ACTIVO';
            await dbRun(`UPDATE staff_loans SET amount_paid = ?, balance_due = ?, status = ? WHERE id = ?`, [totalPaid, newBalance, newStatus, targetLoan.id]);
          }
        }
      } catch (errDesc) {
        console.warn('Error reverting loan discount:', errDesc);
      }
    }

    await dbRun(`DELETE FROM daily_expense_entries WHERE id = ?`, [id]);
    await syncWeekCashSheets(existing.date_str);

    try {
      const { dbAll } = require('../config/db');
      const { exportSnapshot } = require('../config/snapshotSync');
      await exportSnapshot(dbAll);
    } catch (e) {}

    return res.json({ success: true, message: 'Egreso eliminado de la planilla.' });
  } catch (err) {
    console.error('Error deleting expense entry:', err);
    return res.status(500).json({ success: false, error: 'Error al eliminar egreso: ' + (err.message || String(err)) });
  }
};

exports.getWeeklyReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let start = startDate;
    let end = endDate;

    if (!start || !end) {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMon);
      const saturday = new Date(monday);
      saturday.setDate(monday.getDate() + 5);

      start = monday.toISOString().split('T')[0];
      end = saturday.toISOString().split('T')[0];
    }

    // Synchronize week correlative cash sheets for this period
    try {
      await syncWeekCashSheets(start);
    } catch (syncErr) {
      console.warn('syncWeekCashSheets in getWeeklyReport note:', syncErr.message || syncErr);
    }

    let startSheet = await dbGet(`SELECT previous_cash FROM daily_cash_sheets WHERE date_str = ?`, [start]);
    if (!startSheet || parseFloat(startSheet.previous_cash || 0) === 3950 || parseFloat(startSheet.previous_cash || 0) === 4350) {
      try {
        await recalculateCashChain(start);
        startSheet = await dbGet(`SELECT previous_cash FROM daily_cash_sheets WHERE date_str = ?`, [start]);
      } catch (syncErr) {}
    }
    let initialCash = startSheet && startSheet.previous_cash !== null && startSheet.previous_cash !== undefined
      ? parseFloat(startSheet.previous_cash)
      : 0.0;

    if (start === SYSTEM_APERTURA_DATE && (initialCash === 400 || initialCash <= 0 || initialCash === 3950 || initialCash === 4350 || initialCash === 2750)) {
      initialCash = SYSTEM_APERTURA_AMOUNT;
    }

    let incomeRows = [];
    try {
      incomeRows = await dbAll(
        `SELECT i.id, i.date_str, i.payment_type, i.amount_paid, i.total_amount, i.vendedor_name, i.contract_num, i.entry_type, i.details, i.status as income_status,
                c.status as contract_status, c.vendedor_name as contract_vendedor
         FROM daily_income_entries i
         LEFT JOIN contracts c ON i.contract_num = c.contract_code
         WHERE i.date_str >= ? AND i.date_str <= ?
         ORDER BY i.date_str ASC, i.id ASC`,
        [start, end]
      );
    } catch (qErr) {
      console.warn('Weekly report join query note:', qErr.message);
      incomeRows = await dbAll(
        `SELECT id, date_str, payment_type, amount_paid, total_amount, vendedor_name, contract_num, entry_type, details, status as income_status
         FROM daily_income_entries 
         WHERE date_str >= ? AND date_str <= ?
         ORDER BY date_str ASC, i.id ASC`,
        [start, end]
      );
    }

    const expenseRows = await dbAll(
      `SELECT payment_type, amount FROM daily_expense_entries WHERE date_str >= ? AND date_str <= ?`,
      [start, end]
    );

    const breakdown = {
      EFECTIVO: { venta: 0, gasto: 0 },
      BCP: { venta: 0, gasto: 0 },
      YAPE: { venta: 0, gasto: 0 },
      POS: { venta: 0, gasto: 0 },
    };

    // Historial global de contratos para detectar con precisión COPIAS vs CONTRATOS ORIGINALES
    const contractCodes = [...new Set(
      incomeRows
        .map(r => (r.contract_num || '').trim())
        .filter(c => c && c !== 'S/N' && c !== 'PRESTAMO' && c !== 'CAMBIO')
    )];

    let allHistoryByContract = {};
    if (contractCodes.length > 0) {
      try {
        const inPlaceholders = contractCodes.map(() => '?').join(',');
        const related = await dbAll(
          `SELECT id, contract_num, date_str, total_amount, amount_paid, status 
           FROM daily_income_entries 
           WHERE contract_num IN (${inPlaceholders}) AND (status IS NULL OR status != 'ANULADO')
           ORDER BY date_str ASC, id ASC`,
          contractCodes
        );
        for (const e of related) {
          const code = (e.contract_num || '').trim();
          if (!allHistoryByContract[code]) allHistoryByContract[code] = [];
          allHistoryByContract[code].push(e);
        }
      } catch (histErr) {
        console.warn('History lookup note for weekly ranking:', histErr.message);
      }
    }

    // Ranking de vendedoras según las 5 reglas exactas de auditoría:
    // 1. Cambio / Intercambio (Celeste) = NO SUMA CONTRATOS
    // 2. Número de contrato copia (Naranja con COPIA) = NO SUMA CONTRATOS (ya se contó cuando se creó)
    // 3. Contratos anulados (Rojo) = NO SUMA NADA
    // 4. Contrato verde = SUMA (Contrato nuevo con saldo pendiente)
    // 5. Contrato naranja = SUMA (Contrato nuevo original cancelado/entregado al 100%)
    const defaultSellers = ['Carla', 'Jhon', 'Joshy', 'Juan', 'Jose Luis'];
    const sellersRankingMap = {};
    defaultSellers.forEach(name => {
      sellersRankingMap[name] = {
        seller_name: name,
        contracts_count: 0,
        total_ventas: 0,
        total_recaudado: 0,
      };
    });

    const seenContractsInWeek = new Set();

    incomeRows.forEach((row) => {
      const code = (row.contract_num || '').trim();
      const amt = parseFloat(row.amount_paid || 0);
      const pType = (row.payment_type || '').toUpperCase();
      const rawStatus = (row.income_status || row.status || '').toUpperCase();
      const contractStatus = (row.contract_status || '').toUpperCase();

      // Desglose de ingresos de caja y bancos de la semana: SIEMPRE SUMA los cobros reales (el egreso de devolución descuenta)
      if (pType === 'EFECTIVO') breakdown.EFECTIVO.venta += amt;
      else if (pType.includes('BCP')) breakdown.BCP.venta += amt;
      else if (pType.includes('YAPE')) breakdown.YAPE.venta += amt;
      else if (pType.includes('POS') || pType.includes('IZIPAY')) breakdown.POS.venta += amt;

      // REGLA 3: Contratos anulados color rojo = NO SUMA a contratos nuevos ni total ventas de las vendedoras
      const isAnulado = rawStatus === 'ANULADO' || contractStatus === 'ANULADO' || /\bANULADO\b/i.test(row.details || '');
      if (isAnulado) {
        return;
      }

      // Normalizar nombre de vendedora
      let seller = row.vendedor_name || row.contract_vendedor || 'Carla';
      if (/carla/i.test(seller)) seller = 'Carla';
      else if (/jhon/i.test(seller)) seller = 'Jhon';
      else if (/jose luis/i.test(seller)) seller = 'Jose Luis';
      else if (/joshy/i.test(seller)) seller = 'Joshy';
      else if (/juan/i.test(seller)) seller = 'Juan';

      if (!sellersRankingMap[seller]) {
        sellersRankingMap[seller] = {
          seller_name: seller,
          contracts_count: 0,
          total_ventas: 0,
          total_recaudado: 0,
        };
      }

      // REGLA 1: Cambio color celeste (intercambio / préstamo) = NO SUMA
      const isPrestamoOrCambio = (
        row.entry_type === 'INTERCAMBIO' ||
        row.entry_type === 'PRESTAMO' ||
        code === 'CAMBIO' ||
        code === 'PRESTAMO' ||
        code === 'S/N' ||
        /\b(CAMBIO|INTERCAMBIO|PRESTAMO)\b/i.test(row.details || '')
      );

      if (isPrestamoOrCambio) {
        return;
      }

      // REGLA 2: Número de contrato copia color naranja = NO SUMA
      const history = allHistoryByContract[code] || [];
      const firstEntry = history.length > 0 ? history[0] : null;

      const isExplicitCopyText = row.details && (
        (/\bCOPIA\b/i.test(row.details)) ||
        (/\bCANCELACI[OÓ]N\b/i.test(row.details) && !/\b1[°º]?\s*ADELANTO\b/i.test(row.details))
      );

      const isCreatedBeforeThisWeek = firstEntry ? (firstEntry.date_str < start) : false;
      const isSecondaryEntry = firstEntry ? (firstEntry.id !== row.id) : false;
      const isCopia = isCreatedBeforeThisWeek || isSecondaryEntry || Boolean(isExplicitCopyText);

      if (isCopia) {
        // Segundo abono o cancelación posterior: no suma contratos ni ventas nuevas, solo recaudado
        sellersRankingMap[seller].total_recaudado += amt;
        return;
      }

      // REGLA 4: Contrato color verde = SUMA (Nuevo con saldo)
      // REGLA 5: Contrato de color naranja = SUMA (Nuevo original 100% cancelado de inmediato)
      if (!seenContractsInWeek.has(code)) {
        seenContractsInWeek.add(code);
        sellersRankingMap[seller].contracts_count += 1;

        const rowTotal = parseFloat(row.total_amount || 0);
        const firstTotal = firstEntry ? parseFloat(firstEntry.total_amount || 0) : 0;
        const effectiveContractTotal = rowTotal > 0 ? rowTotal : (firstTotal > 0 ? firstTotal : amt);

        sellersRankingMap[seller].total_ventas += effectiveContractTotal;
      }
      sellersRankingMap[seller].total_recaudado += amt;
    });

    const sellersRanking = Object.values(sellersRankingMap)
      .filter(s => s.contracts_count > 0 || s.total_recaudado > 0 || ['Carla', 'Jhon'].includes(s.seller_name))
      .sort((a, b) => {
        if (b.contracts_count !== a.contracts_count) {
          return b.contracts_count - a.contracts_count;
        }
        if (b.total_ventas !== a.total_ventas) {
          return b.total_ventas - a.total_ventas;
        }
        return b.total_recaudado - a.total_recaudado;
      });

    expenseRows.forEach((row) => {
      const amt = row.amount || 0;
      const pType = (row.payment_type || '').toUpperCase();

      if (pType === 'EFECTIVO') breakdown.EFECTIVO.gasto += amt;
      else if (pType.includes('BCP')) breakdown.BCP.gasto += amt;
      else if (pType.includes('YAPE')) breakdown.YAPE.gasto += amt;
      else if (pType.includes('POS') || pType.includes('IZIPAY')) breakdown.POS.gasto += amt;
    });

    const totalVenta = breakdown.EFECTIVO.venta + breakdown.BCP.venta + breakdown.YAPE.venta + breakdown.POS.venta;
    const totalGasto = breakdown.EFECTIVO.gasto + breakdown.BCP.gasto + breakdown.YAPE.gasto + breakdown.POS.gasto;
    const totalGanancia = totalVenta - totalGasto;

    // Calcular diferencia (venta - gasto) por método de pago
    Object.keys(breakdown).forEach(k => {
      breakdown[k].diferencia = breakdown[k].venta - breakdown[k].gasto;
    });

    const finalCashInHand = initialCash + (breakdown.EFECTIVO.venta - breakdown.EFECTIVO.gasto);

    // Detalle completo y desglose diario (Lunes a Sábado) para reportes ejecutivos en PDF
    let detailedExpenses = [];
    try {
      const expRows = await dbAll(
        `SELECT id, date_str, expense_type, details, amount, payment_type
         FROM daily_expense_entries
         WHERE date_str >= ? AND date_str <= ?
         ORDER BY date_str ASC, id ASC`,
        [start, end]
      );
      detailedExpenses = expRows.map(r => ({
        id: r.id,
        date_str: r.date_str,
        category: r.expense_type || 'General',
        details: r.details || '-',
        amount: parseFloat(r.amount || 0),
        payment_type: r.payment_type || 'EFECTIVO'
      }));
    } catch (expErr) {
      console.warn('Error fetching detailedExpenses for weekly report:', expErr.message);
    }

    let detailedIncomes = [];
    try {
      const incRows = await dbAll(
        `SELECT i.id, i.date_str, i.contract_num, i.details, i.amount_paid, i.total_amount, i.payment_type, i.status,
                c.client_name, c.vendedor_name as contract_vendedor, u.full_name as registered_by_name
         FROM daily_income_entries i
         LEFT JOIN contracts c ON i.contract_num = c.contract_code
         LEFT JOIN users u ON i.registered_by = u.id
         WHERE i.date_str >= ? AND i.date_str <= ?
         ORDER BY i.date_str ASC, i.id ASC`,
        [start, end]
      );
      detailedIncomes = incRows.map(r => {
        let seller = r.contract_vendedor || (r.registered_by_name && !/admin/i.test(r.registered_by_name) ? r.registered_by_name : '') || 'Carla';
        if (/carla/i.test(seller)) seller = 'Carla';
        else if (/jhon/i.test(seller)) seller = 'Jhon';
        else if (/jose luis/i.test(seller)) seller = 'Jose Luis';
        else if (/joshy/i.test(seller)) seller = 'Joshy';
        else if (/juan/i.test(seller)) seller = 'Juan';

        const code = (r.contract_num || '').trim();
        const history = allHistoryByContract[code] || [];
        const firstEntry = history.length > 0 ? history[0] : null;

        const isPrestamoOrCambio = (
          r.entry_type === 'INTERCAMBIO' ||
          r.entry_type === 'PRESTAMO' ||
          code === 'CAMBIO' ||
          code === 'PRESTAMO' ||
          code === 'S/N' ||
          /\b(CAMBIO|INTERCAMBIO|PRESTAMO)\b/i.test(r.details || '')
        );

        const isExplicitCopyText = r.details && (
          (/\bCOPIA\b/i.test(r.details)) ||
          (/\bCANCELACI[OÓ]N\b/i.test(r.details) && !/\b1[°º]?\s*ADELANTO\b/i.test(r.details))
        );

        const isCreatedBeforeThisWeek = firstEntry ? (firstEntry.date_str < start) : false;
        const isSecondaryEntry = firstEntry ? (firstEntry.id !== r.id) : false;
        const isCopia = !isPrestamoOrCambio && code !== 'S/N' && (isCreatedBeforeThisWeek || isSecondaryEntry || Boolean(isExplicitCopyText));

        return {
          id: r.id,
          date_str: r.date_str,
          contract_num: r.contract_num || 'S/N',
          client_name: r.client_name || r.details || '-',
          details: r.details || 'Trabajo de Imprenta',
          amount_paid: parseFloat(r.amount_paid || 0),
          total_amount: parseFloat(r.total_amount || r.amount_paid || 0),
          payment_type: r.payment_type || 'EFECTIVO',
          vendedor_name: seller,
          is_copy: isCopia,
          is_prestamo_or_cambio: isPrestamoOrCambio,
        };
      });
    } catch (incErr) {
      console.warn('Error fetching detailedIncomes with join, using fallback:', incErr.message);
      try {
        const fallbackRows = await dbAll(
          `SELECT id, date_str, contract_num, details, amount_paid, total_amount, payment_type
           FROM daily_income_entries
           WHERE date_str >= ? AND date_str <= ?
           ORDER BY date_str ASC, id ASC`,
          [start, end]
        );
        detailedIncomes = fallbackRows.map(r => ({
          id: r.id,
          date_str: r.date_str,
          contract_num: r.contract_num || 'S/N',
          client_name: r.details || '-',
          details: r.details || 'Trabajo de Imprenta',
          amount_paid: parseFloat(r.amount_paid || 0),
          total_amount: parseFloat(r.total_amount || r.amount_paid || 0),
          payment_type: r.payment_type || 'EFECTIVO',
          vendedor_name: 'Vendedora'
        }));
      } catch (fErr) {
        console.warn('Fallback detailedIncomes query error:', fErr.message);
      }
    }

    const dayNames = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
    const startDateObj = new Date(start + 'T12:00:00Z');
    const dailyBreakdown = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(startDateObj);
      d.setDate(startDateObj.getDate() + i);
      const dStr = d.toISOString().split('T')[0];
      const dayName = dayNames[i];

      const dayInc = detailedIncomes.filter(r => r.date_str === dStr);
      const dayExp = detailedExpenses.filter(r => r.date_str === dStr);

      const incSum = dayInc.reduce((acc, r) => acc + (parseFloat(r.amount_paid) || 0), 0);
      const expSum = dayExp.reduce((acc, r) => acc + (parseFloat(r.amount) || 0), 0);

      dailyBreakdown.push({
        day_index: i,
        day_name: dayName,
        date_str: dStr,
        income: incSum,
        expense: expSum,
        balance: incSum - expSum
      });
    }

    return res.json({
      success: true,
      period: { startDate: start, endDate: end },
      initial_cash: initialCash,
      final_cash_in_hand: finalCashInHand,
      breakdown,
      totals: {
        total_venta: totalVenta,
        total_gasto: totalGasto,
        total_ganancia: totalGanancia,
      },
      sellers_ranking: sellersRanking,
      daily_breakdown: dailyBreakdown,
      detailed_expenses: detailedExpenses,
      detailed_incomes: detailedIncomes,
    });
  } catch (err) {
    console.error('Error fetching weekly report:', err);
    return res.status(500).json({ success: false, error: 'Error al generar reporte semanal.' });
  }
};

exports.searchContracts = async (req, res) => {
  try {
    const { query, storeId } = req.query;
    if (!query || query.trim() === '') {
      return res.json({ success: true, results: [] });
    }

    const rawQuery = query.trim();
    const q = `%${rawQuery}%`;
    const storeIdVal = storeId ? parseInt(storeId, 10) : 1;

    // Check if user is searching by numeric amount (e.g., "S/ 120", "s/120", "120.00", "120")
    const cleanAmountStr = rawQuery.replace(/S\/\s*/gi, '').trim();
    let numVal = null;
    if (/^\d+(\.\d+)?$/.test(cleanAmountStr)) {
      numVal = parseFloat(cleanAmountStr);
    }

    let incomeRows = [];
    if (numVal !== null) {
      const numQuery = `%${cleanAmountStr}%`;
      incomeRows = await dbAll(
        `SELECT id, date_str, contract_num, details, total_amount, amount_paid, payment_type, status
         FROM daily_income_entries
         WHERE (contract_num LIKE ? OR details LIKE ? OR CAST(total_amount AS TEXT) LIKE ? OR CAST(amount_paid AS TEXT) LIKE ? OR total_amount = ? OR amount_paid = ?)
           AND (store_id = ? OR store_id IS NULL)
         ORDER BY id DESC LIMIT 25`,
        [q, q, numQuery, numQuery, numVal, numVal, storeIdVal]
      );
    } else {
      incomeRows = await dbAll(
        `SELECT id, date_str, contract_num, details, total_amount, amount_paid, payment_type, status
         FROM daily_income_entries
         WHERE (contract_num LIKE ? OR details LIKE ?)
           AND (store_id = ? OR store_id IS NULL)
         ORDER BY id DESC LIMIT 25`,
        [q, q, storeIdVal]
      );
    }

    const resultsMap = new Map();

    incomeRows.forEach((r) => {
      const key = `${r.contract_num}_${r.date_str}`;
      resultsMap.set(key, {
        id: r.id,
        contract_num: r.contract_num,
        details: r.details,
        total_amount: r.total_amount,
        amount_paid: r.amount_paid,
        payment_type: r.payment_type,
        date_str: r.date_str,
        status: r.status || 'ACTIVO',
      });
    });

    return res.json({
      success: true,
      results: Array.from(resultsMap.values()),
    });
  } catch (err) {
    console.error('Error searching contracts:', err);
    return res.status(500).json({ success: false, error: 'Error al buscar contratos.' });
  }
};

exports.searchExpenses = async (req, res) => {
  try {
    const { query, storeId } = req.query;
    if (!query || query.trim() === '') {
      return res.json({ success: true, results: [] });
    }

    const rawQuery = query.trim();
    const q = `%${rawQuery}%`;
    const storeIdVal = storeId ? parseInt(storeId, 10) : 1;

    const cleanAmountStr = rawQuery.replace(/S\/\s*/gi, '').trim();
    let numVal = null;
    if (/^\d+(\.\d+)?$/.test(cleanAmountStr)) {
      numVal = parseFloat(cleanAmountStr);
    }

    let expenseRows = [];
    if (numVal !== null) {
      const numQuery = `%${cleanAmountStr}%`;
      expenseRows = await dbAll(
        `SELECT id, date_str, expense_type, details, amount, payment_type, audit_status
         FROM daily_expense_entries
         WHERE (expense_type LIKE ? OR details LIKE ? OR CAST(amount AS TEXT) LIKE ? OR amount = ?)
           AND (store_id = ? OR store_id IS NULL)
         ORDER BY id DESC LIMIT 25`,
        [q, q, numQuery, numVal, storeIdVal]
      );
    } else {
      expenseRows = await dbAll(
        `SELECT id, date_str, expense_type, details, amount, payment_type, audit_status
         FROM daily_expense_entries
         WHERE (expense_type LIKE ? OR details LIKE ?)
           AND (store_id = ? OR store_id IS NULL)
         ORDER BY id DESC LIMIT 25`,
        [q, q, storeIdVal]
      );
    }

    return res.json({
      success: true,
      results: expenseRows,
    });
  } catch (err) {
    console.error('Error searching expenses:', err);
    return res.status(500).json({ success: false, error: 'Error al buscar egresos.' });
  }
};

exports.getNextContractNum = async (req, res) => {
  try {
    const storeId = parseInt(req.query.storeId || 1, 10);
    // Calculado exclusivamente a partir de la planilla diaria de la tienda seleccionada
    const incomeRows = await dbAll(
      `SELECT contract_num FROM daily_income_entries WHERE (store_id = ? OR store_id IS NULL)`,
      [storeId]
    );

    let maxNum = 0;
    const existingNums = new Set();

    const processCode = (code) => {
      if (!code) return;
      const clean = code.toString().trim();
      if (/^\d+$/.test(clean)) {
        const val = parseInt(clean, 10);
        existingNums.add(val);
        if (val > maxNum) maxNum = val;
      }
    };

    incomeRows.forEach(r => processCode(r.contract_num));

    const nextNum = maxNum > 0 ? maxNum + 1 : 101;

    return res.json({
      success: true,
      highest_contract_num: maxNum,
      next_contract_num: nextNum,
      existing_contract_nums: Array.from(existingNums)
    });
  } catch (err) {
    console.error('Error fetching next contract number:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener número correlativo.' });
  }
};

exports.auditIncomeEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { audit_status, audit_note } = req.body;
    const statusVal = audit_status !== undefined ? (audit_status || 'PENDIENTE') : 'CONFORME';
    const noteVal = audit_note || '';

    await dbRun(
      `UPDATE daily_income_entries SET audit_status = ?, audit_note = ? WHERE id = ?`,
      [statusVal, noteVal, id]
    );

    await exportSnapshot(dbAll);
    return res.json({ success: true, message: 'Auditoría de ingreso actualizada.' });
  } catch (err) {
    console.error('Error auditing income entry:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar auditoría.' });
  }
};

exports.auditExpenseEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { audit_status, audit_note } = req.body;
    const statusVal = audit_status !== undefined ? (audit_status || 'PENDIENTE') : 'CONFORME';
    const noteVal = audit_note || '';

    await dbRun(
      `UPDATE daily_expense_entries SET audit_status = ?, audit_note = ? WHERE id = ?`,
      [statusVal, noteVal, id]
    );

    await exportSnapshot(dbAll);
    return res.json({ success: true, message: 'Auditoría de egreso actualizada.' });
  } catch (err) {
    console.error('Error auditing expense entry:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar auditoría.' });
  }
};

exports.recalculateCashChain = recalculateCashChain;
exports.syncWeekCashSheets = syncWeekCashSheets;

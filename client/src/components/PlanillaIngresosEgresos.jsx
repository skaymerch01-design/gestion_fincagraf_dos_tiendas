import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { formatMoney, formatSoles } from '../utils/format';
import { Plus, Trash2, ShieldAlert, BarChart3, Edit3, Ban, CheckCircle2, ChevronLeft, ChevronRight, X, Search, Calculator, Package, AlertTriangle, MessageSquare, ShieldCheck, DollarSign } from 'lucide-react';
import WeeklyReportView from './WeeklyReportView';
import PinkCalculator from './PinkCalculator';

export default function PlanillaIngresosEgresos({ readOnly = false, storeId = 1 }) {
  const [mainTab, setMainTab] = useState('ingresos'); // 'ingresos' | 'egresos'
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = previous week
  const [dayTab, setDayTab] = useState(0); // 0..5 (Mon..Sat), 6 = REPORTE SEMANAL
  const [isCalcOpen, setIsCalcOpen] = useState(false);

  // Contract / Ingresos Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Egresos Search State
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [expenseSearchResults, setExpenseSearchResults] = useState([]);
  const [isSearchingExpenses, setIsSearchingExpenses] = useState(false);
  const [showExpenseSearchDropdown, setShowExpenseSearchDropdown] = useState(false);

  const handleExpenseSearchChange = async (queryVal) => {
    setExpenseSearchQuery(queryVal);
    if (!queryVal || queryVal.trim().length < 1) {
      setExpenseSearchResults([]);
      setShowExpenseSearchDropdown(false);
      return;
    }

    setIsSearchingExpenses(true);
    try {
      const res = await apiFetch(`/daily-sheet/search-expenses?query=${encodeURIComponent(queryVal.trim())}&storeId=${storeId}`);
      if (res.success) {
        setExpenseSearchResults(res.results);
        setShowExpenseSearchDropdown(true);
      }
    } catch (err) {
      console.error('Error searching expenses:', err);
    } finally {
      setIsSearchingExpenses(false);
    }
  };

  const handleSelectExpenseSearchResult = (item) => {
    setShowExpenseSearchDropdown(false);
    setExpenseSearchQuery('');
    if (item.date_str) {
      navigateToDate(item.date_str, 'egresos');
    }
  };

  const navigateToDate = (targetDateStr, targetTab = 'ingresos') => {
    if (!targetDateStr) return;
    if (targetDateStr < '2026-09-28') targetDateStr = '2026-09-28';
    const parts = targetDateStr.split('-');
    if (parts.length !== 3) return;
    const [tYear, tMonth, tDay] = parts.map(Number);
    const targetDate = new Date(Date.UTC(tYear, tMonth - 1, tDay, 12, 0, 0));

    const now = new Date();
    const [cYear, cMonth, cDay] = [now.getFullYear(), now.getMonth(), now.getDate()];
    const currentMidday = new Date(Date.UTC(cYear, cMonth, cDay, 12, 0, 0));
    const currentDayOfWeek = currentMidday.getUTCDay();
    const currentDiffToMon = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const currentMonday = new Date(Date.UTC(cYear, cMonth, cDay + currentDiffToMon, 12, 0, 0));

    const targetDayOfWeek = targetDate.getUTCDay();
    const targetDiffToMon = targetDayOfWeek === 0 ? -6 : 1 - targetDayOfWeek;
    const targetMonday = new Date(Date.UTC(tYear, tMonth - 1, tDay + targetDiffToMon, 12, 0, 0));

    const diffMs = targetMonday.getTime() - currentMonday.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const calculatedWeekOffset = Math.round(diffDays / 7);

    let dayIdx = targetDayOfWeek === 0 ? 5 : targetDayOfWeek - 1;
    if (dayIdx > 5) dayIdx = 5;
    if (dayIdx < 0) dayIdx = 0;

    setWeekOffset(calculatedWeekOffset);
    setDayTab(dayIdx);
    setMainTab(targetTab);
  };

  const [highlightedEntryId, setHighlightedEntryId] = useState(null);
  const [jumpNotice, setJumpNotice] = useState(null);

  useEffect(() => {
    const handleJump = (e) => {
      const { category, transaction_type, raw_id, date, amount, code, details } = e.detail || {};
      if (category === 'INGRESO' || category === 'EGRESO' || category === 'BANCO') {
        let targetTab = 'ingresos';
        if (category === 'EGRESO') {
          targetTab = 'egresos';
        } else if (category === 'BANCO') {
          targetTab = (transaction_type === 'EGRESO') ? 'egresos' : 'ingresos';
        } else {
          targetTab = 'ingresos';
        }

        if (date) {
          navigateToDate(date, targetTab);
        } else {
          setMainTab(targetTab);
        }

        if (raw_id && category !== 'BANCO') {
          const entryKey = `${category.toLowerCase()}_${raw_id}`;
          setHighlightedEntryId(entryKey);
          setJumpNotice(`📍 Se localizó el monto de ${amount ? formatSoles(amount) : '-'} en ${targetTab.toUpperCase()} (${date || ''})`);
          setTimeout(() => {
            const elId = category === 'EGRESO' ? `expense-row-${raw_id}` : `income-row-${raw_id}`;
            const el = document.getElementById(elId);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 500);
          setTimeout(() => {
            setHighlightedEntryId(null);
            setJumpNotice(null);
          }, 8000);
        } else {
          setJumpNotice(`📍 Se abrió ${targetTab.toUpperCase()} para el ${date || ''} (Monto: ${amount ? formatSoles(amount) : '-'}) para registrarlo en planilla.`);
          setTimeout(() => setJumpNotice(null), 8000);
        }
      }
    };
    window.addEventListener('fincagraf_jump_to_item', handleJump);
    return () => window.removeEventListener('fincagraf_jump_to_item', handleJump);
  }, []);

  const handleSearchChange = async (queryVal) => {
    setSearchQuery(queryVal);
    if (!queryVal || queryVal.trim().length < 1) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await apiFetch(`/daily-sheet/search-contracts?query=${encodeURIComponent(queryVal.trim())}&storeId=${storeId}`);
      if (res.success) {
        setSearchResults(res.results);
        setShowSearchDropdown(true);
      }
    } catch (err) {
      console.error('Error searching contracts:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (item) => {
    setShowSearchDropdown(false);
    setSearchQuery('');
    if (item.date_str) {
      navigateToDate(item.date_str, 'ingresos');
    }
  };

  const getWeekDays = () => {
    const now = new Date();
    // Normalize to midday to prevent timezone spillover into next/previous day
    now.setHours(12, 0, 0, 0);
    now.setDate(now.getDate() + (weekOffset * 7));

    const dayOfWeek = now.getDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMon);

    const days = [];
    const dayNames = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const yearNum = d.getFullYear();
      const monthNum = String(d.getMonth() + 1).padStart(2, '0');
      const dayNum = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yearNum}-${monthNum}-${dayNum}`;
      days.push({
        name: `${dayNames[i]} ${dayNum}/${monthNum}`,
        dateStr,
        dayName: dayNames[i],
      });
    }

    return days;
  };

  const weekDays = getWeekDays();
  const SYSTEM_START_DATE = '2026-09-28';
  const isEarliestWeek = weekDays[0] && weekDays[0].dateStr <= SYSTEM_START_DATE;
  const selectedDateStr = dayTab < 6 ? weekDays[dayTab].dateStr : weekDays[0].dateStr;

  const [sheetData, setSheetData] = useState(null);
  const [sheetsCache, setSheetsCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [previousCash, setPreviousCash] = useState(0);
  const [isFirstDay, setIsFirstDay] = useState(false);
  const [cashInputVal, setCashInputVal] = useState('');
  const [savingCash, setSavingCash] = useState(false);
  const [isEditingCash, setIsEditingCash] = useState(false);

  const activeDateRef = useRef(selectedDateStr);
  useEffect(() => {
    activeDateRef.current = selectedDateStr;
  }, [selectedDateStr]);

  // Income Form State
  const [incEntryType, setIncEntryType] = useState('CONTRATO');
  const [incCont, setIncCont] = useState('');
  const [incVendedor, setIncVendedor] = useState('Carla');
  const [incDetails, setIncDetails] = useState('');
  const [incTotal, setIncTotal] = useState('');
  const [incAmount, setIncAmount] = useState('');
  const [incType, setIncType] = useState('YAPE');

  // Expense Form State
  const [expCategory, setExpCategory] = useState('Gasto de Contrato');
  const [expDetails, setExpDetails] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expType, setExpType] = useState('YAPE');

  // Staff Loans Form State
  const [expStaffName, setExpStaffName] = useState('');
  const [expWeeklyDiscount, setExpWeeklyDiscount] = useState('');
  const [expLoanId, setExpLoanId] = useState('');
  const [activeLoansList, setActiveLoansList] = useState([]);

  const fetchActiveLoans = async () => {
    try {
      const res = await apiFetch('/staff-loans?status=ACTIVO');
      if (res.success) {
        setActiveLoansList(res.loans || []);
      }
    } catch (err) {
      console.error('Error fetching active loans:', err);
    }
  };

  useEffect(() => {
    fetchActiveLoans();
  }, []);

  // Sellers List State (Carla, Jhon, Juan, Joshy, Jose Luis + Dinámico)
  const DEFAULT_SELLERS = ['Carla', 'Jhon', 'Juan', 'Joshy', 'Jose Luis'];
  const [sellersList, setSellersList] = useState(() => {
    try {
      const saved = localStorage.getItem('fincagraf_sellers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = [...DEFAULT_SELLERS];
          parsed.forEach((s) => {
            if (s && !merged.includes(s)) merged.push(s);
          });
          return merged;
        }
      }
    } catch (_) {}
    return DEFAULT_SELLERS;
  });

  const handleSellerSelect = (val, setter) => {
    if (val === '__NEW__') {
      const newName = window.prompt('Ingrese el nombre del nuevo vendedor/a:');
      if (newName && newName.trim() !== '') {
        const cleanName = newName.trim();
        const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        if (!sellersList.includes(formattedName)) {
          const updated = [...sellersList, formattedName];
          setSellersList(updated);
          try {
            localStorage.setItem('fincagraf_sellers', JSON.stringify(updated));
          } catch (_) {}
        }
        setter(formattedName);
      }
      return;
    }
    setter(val);
  };

  // Edit Modal State
  const [editingRow, setEditingRow] = useState(null);
  const [editCont, setEditCont] = useState('');
  const [editVendedor, setEditVendedor] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editTotal, setEditTotal] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editPayType, setEditPayType] = useState('YAPE');
  const [editExpCategory, setEditExpCategory] = useState('Gasto de Contrato');
  const [editDate, setEditDate] = useState('');

  // Finalize / Cancellation Modal State (Requerimiento 4)
  const [finalizingRow, setFinalizingRow] = useState(null);
  const [finalizePayType, setFinalizePayType] = useState('EFECTIVO');
  const [finalizeAmount, setFinalizeAmount] = useState('');

  // Admin Audit Modal State
  const [auditingRow, setAuditingRow] = useState(null); // { type: 'income' | 'expense', row }
  const [auditStatus, setAuditStatus] = useState('CONFORME');
  const [auditNote, setAuditNote] = useState('');

  const openAuditModal = (type, row) => {
    setAuditingRow({ type, row });
    setAuditStatus(row.audit_status || 'CONFORME');
    setAuditNote(row.audit_note || '');
  };

  const handleSaveAudit = async (e) => {
    if (e) e.preventDefault();
    if (!auditingRow) return;

    try {
      const rowId = auditingRow.row.id;
      const targetType = auditingRow.type;
      const finalStatus = auditStatus;
      const finalNote = finalStatus === 'OBSERVADO' ? auditNote : '';

      // Actualización optimista inmediata
      if (targetType === 'income') {
        setSheetData(prev => ({
          ...prev,
          income_entries: (prev.income_entries || []).map(r => r.id === rowId ? { ...r, audit_status: finalStatus, audit_note: finalNote } : r)
        }));
      } else {
        setSheetData(prev => ({
          ...prev,
          expense_entries: (prev.expense_entries || []).map(r => r.id === rowId ? { ...r, audit_status: finalStatus, audit_note: finalNote } : r)
        }));
      }

      setAuditingRow(null);

      const endpoint = targetType === 'income'
        ? `/daily-sheet/income/${rowId}/audit`
        : `/daily-sheet/expense/${rowId}/audit`;

      await apiFetch(endpoint, {
        method: 'PUT',
        body: {
          audit_status: finalStatus,
          audit_note: finalNote,
        },
      });
    } catch (err) {
      alert(err.message);
      fetchSheet();
    }
  };

  const handleQuickMarkConforme = async (type, target) => {
    try {
      const id = typeof target === 'object' ? target.id : target;
      const currentRow = typeof target === 'object'
        ? target
        : (type === 'income'
            ? (sheetData.income_entries || []).find(r => r.id === id)
            : (sheetData.expense_entries || []).find(r => r.id === id));

      const isCurrentlyConforme = currentRow && currentRow.audit_status === 'CONFORME';
      const newStatus = isCurrentlyConforme ? 'PENDIENTE' : 'CONFORME';

      // Actualización optimista inmediata en memoria (sin parpadeo ni reload)
      if (type === 'income') {
        setSheetData(prev => ({
          ...prev,
          income_entries: (prev.income_entries || []).map(r => r.id === id ? { ...r, audit_status: newStatus, audit_note: isCurrentlyConforme ? '' : (r.audit_note || '') } : r)
        }));
      } else {
        setSheetData(prev => ({
          ...prev,
          expense_entries: (prev.expense_entries || []).map(r => r.id === id ? { ...r, audit_status: newStatus, audit_note: isCurrentlyConforme ? '' : (r.audit_note || '') } : r)
        }));
      }

      const endpoint = type === 'income'
        ? `/daily-sheet/income/${id}/audit`
        : `/daily-sheet/expense/${id}/audit`;

      await apiFetch(endpoint, {
        method: 'PUT',
        body: {
          audit_status: newStatus,
          audit_note: isCurrentlyConforme ? '' : (currentRow?.audit_note || ''),
        },
      });
    } catch (err) {
      alert(err.message);
      fetchSheet();
    }
  };

  // Correlative Contract & Lookup State (Requerimiento 3 y Nueva Lógica de Cancelación)
  const [nextContractNum, setNextContractNum] = useState(null);
  const [highestContractNum, setHighestContractNum] = useState(0);
  const [lookupInfo, setLookupInfo] = useState(null);

  const fetchNextContractNum = async () => {
    try {
      const res = await apiFetch(`/daily-sheet/next-contract-num?storeId=${storeId}`);
      if (res.success) {
        setNextContractNum(res.next_contract_num);
        setHighestContractNum(res.highest_contract_num);
        if (incEntryType === 'CONTRATO' && !incCont) {
          setIncCont(String(res.next_contract_num));
        }
      }
    } catch (err) {
      console.error('Error fetching next contract number:', err);
    }
  };

  const handleContractNumberChange = async (val) => {
    setIncCont(val);
    if (!val || val.trim() === '' || incEntryType !== 'CONTRATO') {
      setLookupInfo(null);
      return;
    }

    try {
      const res = await apiFetch(`/daily-sheet/contract-lookup/${val.trim()}?storeId=${storeId}`);
      if (res.success && res.exists) {
        setLookupInfo(res);
        if (res.status === 'ACTIVO') {
          // Auto-fill client name, total, and balance due for final cancellation payment or next advance!
          const pCount = (res.entries_history || []).length;
          const abonoLabel = pCount === 1 ? 'CANCELACION' : (pCount > 1 ? `${pCount + 1}° ADELANTO` : '1° ADELANTO');
          setIncDetails(res.client_name ? `${res.client_name} (${abonoLabel})` : `CONTRATO ${val.trim()} (${abonoLabel})`);
          setIncTotal(String(res.total_amount));
          setIncAmount(String(res.balance_due));
        }
      } else {
        setLookupInfo(null);
      }
    } catch (err) {
      console.error('Error looking up contract number:', err);
    }
  };

  const openFinalizeModal = (row) => {
    if (readOnly) return;
    setFinalizingRow(row);
    setFinalizePayType('EFECTIVO');
    const remainingSaldo = row.saldo > 0 ? row.saldo : Math.max(0, (row.total_amount || 0) - (row.amount_paid || 0));
    setFinalizeAmount(remainingSaldo > 0 ? remainingSaldo : (row.total_amount || row.amount_paid));
  };

  const handleConfirmFinalize = async (e) => {
    e.preventDefault();
    if (!finalizingRow) return;

    try {
      await apiFetch(`/daily-sheet/income/${finalizingRow.id}/finalize`, {
        method: 'PUT',
        body: {
          payment_type: finalizePayType,
          cancellation_payment_amount: parseFloat(finalizeAmount || 0),
        },
      });

      setFinalizingRow(null);
      setSheetsCache({});
      fetchSheet();
    } catch (err) {
      alert(err.message);
    }
  };

  // Restringido estrictamente a las 10 categorías solicitadas (Incluye Préstamos Personales)
  const expenseCategories = [
    'Gasto de Contrato',
    'Pagar a Prestamista',
    'Pago Personal',
    'Pago Alquiler de la Tienda',
    'Pago Luz y Mantenimiento',
    'Pago Internet',
    'Adelanto al Personal',
    'Préstamo al Personal',
    'Descuento Préstamo Personal',
    'Gasto Interno',
  ];

  const [activePaymentAlerts, setActivePaymentAlerts] = useState([]);

  const fetchPaymentAlerts = async () => {
    try {
      const res = await apiFetch('/payment-schedule/alerts');
      if (res.success) {
        setActivePaymentAlerts(res.alerts || []);
      }
    } catch (err) {
      console.error('Error fetching payment alerts:', err);
    }
  };

  const fetchSheet = async (dateOrSilent = false, maybeSilent = false) => {
    if (dayTab === 6) return;

    let targetDate = selectedDateStr;
    let silent = false;

    if (typeof dateOrSilent === 'string') {
      targetDate = dateOrSilent;
      silent = !!maybeSilent;
    } else if (typeof dateOrSilent === 'boolean') {
      silent = dateOrSilent;
      targetDate = selectedDateStr;
    }

    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/daily-sheet?date=${targetDate}&storeId=${storeId}`);
      if (res.success) {
        // Cache this date's data
        setSheetsCache(prev => ({ ...prev, [res.date_str]: res }));

        // Only update visible sheet if user is still on this date
        if (res.date_str === activeDateRef.current) {
          setSheetData(res);
          setPreviousCash(res.previous_cash !== undefined ? res.previous_cash : 0);
          setIsFirstDay(!!res.is_first_day);
          if (res.is_first_day) {
            setCashInputVal(res.previous_cash > 0 ? String(res.previous_cash) : '');
          }
        }
      }
      fetchNextContractNum();
      fetchPaymentAlerts();
    } catch (err) {
      if (targetDate === activeDateRef.current) {
        setError(err.message);
      }
    } finally {
      if (!silent && targetDate === activeDateRef.current) {
        setLoading(false);
      }
    }
  };

  // Pre-carga en segundo plano de todos los días de la semana para cambio instantáneo (0ms)
  useEffect(() => {
    if (!weekDays || weekDays.length === 0) return;
    const prefetchWeekDays = async () => {
      for (let i = 0; i < 6; i++) {
        const dStr = weekDays[i].dateStr;
        if (!sheetsCache[dStr]) {
          try {
            const res = await apiFetch(`/daily-sheet?date=${dStr}&storeId=${storeId}`);
            if (res.success && res.date_str) {
              setSheetsCache(prev => ({ ...prev, [res.date_str]: res }));
            }
          } catch (_) {}
        }
      }
    };
    const timer = setTimeout(prefetchWeekDays, 150);
    return () => clearTimeout(timer);
  }, [weekOffset]);

  useEffect(() => {
    if (dayTab === 6) return;

    // Check if we already have this day in cache for instant display (0ms)
    if (sheetsCache[selectedDateStr]) {
      setSheetData(sheetsCache[selectedDateStr]);
      setPreviousCash(sheetsCache[selectedDateStr].previous_cash || 0);
      setLoading(false);
      // Re-fetch in background silently to ensure freshest data
      fetchSheet(selectedDateStr, true);
    } else {
      setSheetData(null);
      setLoading(true);
      fetchSheet(selectedDateStr, false);
    }
    fetchPaymentAlerts();
  }, [selectedDateStr, dayTab, weekOffset]);

  const handleAddIncome = async (e) => {
    e.preventDefault();
    if (readOnly) return;
    if (!incDetails || incAmount === '') return alert('Complete los detalles y el monto recibido.');

    let finalContractCode = incCont ? incCont.trim() : '';

    if (incEntryType === 'CONTRATO') {
      if (!finalContractCode && nextContractNum) {
        finalContractCode = String(nextContractNum);
      }
      if (/^\d+$/.test(finalContractCode) && nextContractNum && !lookupInfo?.exists) {
        const numVal = parseInt(finalContractCode, 10);
        if (numVal > nextContractNum) {
          return alert(`⚠️ El número de contrato debe ser correlativo sin saltarse números. El siguiente contrato correlativo es el N° ${nextContractNum}.`);
        }
      }
    } else if (incEntryType === 'PRESTAMO') {
      finalContractCode = 'PRESTAMO';
    } else if (incEntryType === 'INTERCAMBIO') {
      finalContractCode = 'CAMBIO';
    }

    const numTotal = parseFloat(incTotal || 0);
    const numPaid = parseFloat(incAmount || 0);

    // Optimistic instant UI insert (aparece en 0 milisegundos)
    const isNoSeller = incEntryType !== 'CONTRATO' || finalContractCode === 'PRESTAMO' || finalContractCode === 'CAMBIO' || finalContractCode === 'OTROS' || finalContractCode === 'OTRO';
    const chosenVendedor = isNoSeller ? null : (incVendedor ? incVendedor.trim() : 'Carla');
    const tempId = 'temp-' + Date.now();
    const optimisticRow = {
      id: tempId,
      date_str: selectedDateStr,
      entry_type: incEntryType,
      contract_num: finalContractCode || 'S/N',
      details: incDetails,
      total_amount: numTotal,
      amount_paid: numPaid,
      payment_type: incType,
      payment_type_display: incType,
      vendedor_name: chosenVendedor,
      status: 'ACTIVO',
      audit_status: 'PENDIENTE',
      saldo: numTotal > 0 ? Math.max(0, numTotal - numPaid) : 0,
      efectivo: incType === 'EFECTIVO' ? numPaid : 0,
      bcp: incType.includes('BCP') ? numPaid : 0,
      pos: incType.includes('POS') ? numPaid : 0,
      yape: incType.includes('YAPE') ? numPaid : 0,
    };

    setSheetData(prev => {
      const next = prev ? ({
        ...prev,
        income_entries: [...(prev.income_entries || []), optimisticRow]
      }) : prev;
      if (next) setSheetsCache(cache => ({ ...cache, [selectedDateStr]: next }));
      return next;
    });

    setIncCont('');
    setIncVendedor('Carla');
    setIncEntryType('CONTRATO');
    setIncDetails('');
    setIncTotal('');
    setIncAmount('');
    setLookupInfo(null);

    try {
      await apiFetch('/daily-sheet/income', {
        method: 'POST',
        body: {
          date_str: selectedDateStr,
          entry_type: incEntryType,
          contract_num: finalContractCode || 'S/N',
          details: optimisticRow.details,
          total_amount: numTotal,
          amount_paid: numPaid,
          payment_type: incType,
          vendedor_name: chosenVendedor,
          storeId,
        },
      });

      setSheetsCache({});
      fetchSheet(true);
    } catch (err) {
      alert(err.message);
      setSheetsCache({});
      fetchSheet(true);
    }
  };

  const handleMarkAsEntregado = async (id) => {
    if (readOnly) return;
    const targetRow = sheetData?.income_entries?.find(r => r.id === id);
    const isCurrentlyEntregado = targetRow?.status === 'ENTREGADO' || targetRow?.status === 'ENTREGADO CON SALDO' || targetRow?.status === 'ENTREGADO (NO CANCELADO)' || targetRow?.status === 'CANCELADO Y ENTREGADO';
    const hasSaldo = targetRow && Number(targetRow.saldo) > 0;
    const confirmMsg = isCurrentlyEntregado
      ? 'Desea retirar la marca de ENTREGADO de este producto?'
      : (hasSaldo 
          ? 'Confirmar entrega fisica del producto al cliente manteniendo su SALDO PENDIENTE por cobrar?' 
          : 'Confirmar que este producto ha sido ENTREGADO al cliente?');
    if (!window.confirm(confirmMsg)) return;
    try {
      await apiFetch(`/daily-sheet/income/${id}/entregado`, { method: 'PUT' });
      fetchSheet(true);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleCancelado = async (id) => {
    if (readOnly) return;
    const targetRow = sheetData?.income_entries?.find(r => r.id === id);
    const isCurrentlyCancelado = targetRow?.status === 'CANCELADO' || targetRow?.status === 'CANCELADO Y ENTREGADO';
    const confirmMsg = isCurrentlyCancelado
      ? 'Desea retirar el estado de CANCELADO de este contrato?'
      : 'Confirmar que este contrato ha sido CANCELADO por el cliente (pago completado)?';
    if (!window.confirm(confirmMsg)) return;
    try {
      await apiFetch(`/daily-sheet/income/${id}/cancelar`, { method: 'PUT' });
      fetchSheet(true);
    } catch (err) {
      alert(err.message);
    }
  };
  const handleToggleAnularIncome = async (id) => {
    if (readOnly) return;
    try {
      await apiFetch(`/daily-sheet/income/${id}/anular`, { method: 'PUT' });
      setSheetsCache({});
      fetchSheet(true);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteIncome = async (id) => {
    if (readOnly) return;
    if (!window.confirm('¿Eliminar esta fila de ingreso?')) return;

    // Optimistic remove
    setSheetData(prev => {
      const next = prev ? ({
        ...prev,
        income_entries: (prev.income_entries || []).filter(r => r.id !== id)
      }) : prev;
      if (next) setSheetsCache(cache => ({ ...cache, [selectedDateStr]: next }));
      return next;
    });

    try {
      await apiFetch(`/daily-sheet/income/${id}`, { method: 'DELETE' });
      setSheetsCache({});
      fetchSheet(true);
    } catch (err) {
      alert(err.message);
      setSheetsCache({});
      fetchSheet(true);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (readOnly) return;
    if (!expDetails || expAmount === '') return alert('Complete los detalles y el importe.');

    const numAmount = parseFloat(expAmount || 0);

    // Optimistic instant UI insert (aparece en 0 milisegundos)
    const tempExpId = 'temp-exp-' + Date.now();
    const optimisticExpRow = {
      id: tempExpId,
      date_str: selectedDateStr,
      expense_type: expCategory,
      details: expDetails,
      amount: numAmount,
      payment_type: expType,
      audit_status: 'PENDIENTE',
    };

    setSheetData(prev => {
      const next = prev ? ({
        ...prev,
        expense_entries: [...(prev.expense_entries || []), optimisticExpRow]
      }) : prev;
      if (next) setSheetsCache(cache => ({ ...cache, [selectedDateStr]: next }));
      return next;
    });

    const savedDetails = expDetails;
    const savedAmount = expAmount;
    const savedStaffName = expStaffName;
    const savedWeeklyDiscount = expWeeklyDiscount;
    const savedLoanId = expLoanId;
    const savedCategory = expCategory;
    const savedType = expType;

    setExpDetails('');
    setExpAmount('');
    setExpStaffName('');
    setExpWeeklyDiscount('');
    setExpLoanId('');

    try {
      await apiFetch('/daily-sheet/expense', {
        method: 'POST',
        body: {
          date_str: selectedDateStr,
          expense_type: savedCategory,
          details: savedDetails,
          amount: savedAmount,
          payment_type: savedType,
          staff_name: savedStaffName,
          weekly_discount: savedWeeklyDiscount,
          staff_loan_id: savedLoanId,
          storeId,
        },
      });

      setSheetsCache({});
      fetchSheet(true);
      fetchActiveLoans();
    } catch (err) {
      alert(err.message);
      setSheetsCache({});
      fetchSheet(true);
    }
  };

  const handleDeleteExpense = async (id, allowInReadOnly = false) => {
    if (readOnly && !allowInReadOnly) return;
    if (!window.confirm('¿Eliminar esta fila de egreso de la planilla?')) return;

    // Optimistic remove
    setSheetData(prev => {
      const next = prev ? ({
        ...prev,
        expense_entries: (prev.expense_entries || []).filter(r => r.id !== id)
      }) : prev;
      if (next) setSheetsCache(cache => ({ ...cache, [selectedDateStr]: next }));
      return next;
    });

    try {
      await apiFetch(`/daily-sheet/expense/${id}`, { method: 'DELETE' });
      setSheetsCache({});
      fetchSheet(true);
    } catch (err) {
      alert(err.message);
      setSheetsCache({});
      fetchSheet(true);
    }
  };

  const openEditModal = (type, row) => {
    if (readOnly) return;
    const initialDate = row.date_str || selectedDateStr;
    setEditingRow({ type, id: row.id, originalDate: initialDate });
    setEditDate(initialDate);
    if (type === 'income') {
      const isNotContrato = row.entry_type === 'PRESTAMO' || row.entry_type === 'INTERCAMBIO' || row.entry_type === 'OTRO' || row.contract_num === 'PRESTAMO' || row.contract_num === 'CAMBIO' || row.contract_num === 'OTROS' || row.contract_num === 'OTRO';
      setEditCont(row.contract_num || '');
      setEditVendedor(isNotContrato ? '' : ((row.vendedor_name && row.vendedor_name !== 'Vendedora') ? row.vendedor_name : 'Carla'));
      setEditDetails(row.details || '');
      setEditTotal(row.total_amount !== undefined && row.total_amount !== null ? row.total_amount : '');
      setEditAmount(row.amount_paid !== undefined && row.amount_paid !== null ? row.amount_paid : '');
      setEditPayType(row.payment_type || 'YAPE');
    } else {
      setEditExpCategory(row.expense_type || 'Gasto de Contrato');
      setEditDetails(row.details || '');
      setEditAmount(row.amount !== undefined && row.amount !== null ? row.amount : '');
      setEditPayType(row.payment_type || 'YAPE');
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingRow) return;

    try {
      if (editingRow.type === 'income') {
        const isNotContrato = editCont === 'PRESTAMO' || editCont === 'CAMBIO' || editCont === 'OTROS' || editCont === 'OTRO';
        await apiFetch(`/daily-sheet/income/${editingRow.id}`, {
          method: 'PUT',
          body: {
            contract_num: editCont,
            vendedor_name: isNotContrato ? null : (editVendedor || 'Carla'),
            details: editDetails,
            total_amount: editTotal,
            amount_paid: editAmount,
            payment_type: editPayType,
            date_str: editDate,
          },
        });
      } else {
        await apiFetch(`/daily-sheet/expense/${editingRow.id}`, {
          method: 'PUT',
          body: {
            expense_type: editExpCategory,
            details: editDetails,
            amount: editAmount,
            payment_type: editPayType,
            date_str: editDate,
          },
        });
      }
      const movedToOtherDate = editDate && editDate !== editingRow.originalDate;
      const targetDate = editDate || selectedDateStr;
      const rowType = editingRow.type;
      setEditingRow(null);
      setSheetsCache({});
      if (movedToOtherDate) {
        navigateToDate(targetDate, rowType === 'income' ? 'ingresos' : 'egresos');
      } else {
        fetchSheet(selectedDateStr, true);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveInitialCash = async (e) => {
    if (e) e.preventDefault();
    const val = parseFloat(cashInputVal || 0);
    setSavingCash(true);
    try {
      await apiFetch('/daily-sheet/cash', {
        method: 'POST',
        body: {
          date_str: selectedDateStr,
          previous_cash: val,
          storeId,
        },
      });
      setPreviousCash(val);
      setSheetData(prev => prev ? ({ ...prev, previous_cash: val }) : prev);
      setSheetsCache({
        [selectedDateStr]: {
          ...(sheetData || {}),
          previous_cash: val,
        }
      });
      setIsEditingCash(false);
      fetchSheet(selectedDateStr, true);
    } catch (err) {
      alert('Error al guardar caja inicial: ' + err.message);
    } finally {
      setSavingCash(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* CSS Animado para Alerta Parpadeante y Llamativa */}
      <style>{`
        @keyframes blinkNeonAlert {
          0% { box-shadow: 0 0 15px rgba(239, 68, 68, 0.8); border-color: #ef4444; }
          50% { box-shadow: 0 0 35px rgba(239, 68, 68, 1); border-color: #f87171; transform: scale(1.005); }
          100% { box-shadow: 0 0 15px rgba(239, 68, 68, 0.8); border-color: #ef4444; }
        }
      `}</style>

      {/* BANNER DE ALERTA DE PAGOS FIJOS VENCIDOS O PRÓXIMOS (Requerimiento 3 y 4) */}
      {activePaymentAlerts.length > 0 && (
        <div style={{
          animation: 'blinkNeonAlert 1.5s infinite ease-in-out',
          backgroundColor: '#450a0a',
          border: '3px solid #ef4444',
          borderRadius: '16px',
          padding: '1.1rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#fca5a5', fontWeight: '900', fontSize: '1.1rem' }}>
            <ShieldAlert size={26} color="#ef4444" />
            <span>🚨 ¡ALERTA DE PAGOS Y SERVICIOS FIJOS A REGISTRAR / PAGAR! ({activePaymentAlerts.length})</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {activePaymentAlerts.map((alt) => (
              <div
                key={alt.id}
                style={{
                  backgroundColor: alt.isVendedoraRegistered ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                  border: alt.isVendedoraRegistered ? '1.5px solid #f59e0b' : '1.5px solid #ef4444',
                  padding: '0.65rem 1rem',
                  borderRadius: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem'
                }}
              >
                <div>
                  <span style={{ fontWeight: '900', color: '#ffffff', fontSize: '0.95rem' }}>
                    📌 {alt.concept} ({formatSoles(alt.amount)})
                  </span>
                  <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: alt.diffDays < 0 ? '#f87171' : '#fbbf24', fontWeight: '800' }}>
                    {alt.isVendedoraRegistered 
                      ? '🔔 Egreso ya registrado en Caja — Pendiente de Aprobación por Administración' 
                      : (alt.diffDays < 0 ? `⚠️ VENCIDO (Hace ${Math.abs(alt.diffDays)} días) — Registra el Egreso o informa a Administración` : (alt.diffDays === 0 ? '⚠️ VENCE HOY' : `⏳ Vence en ${alt.diffDays} días (${alt.due_date})`))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Interactivo Calculadora Rosada */}
      <PinkCalculator isOpen={isCalcOpen} onClose={() => setIsCalcOpen(false)} />

      {/* ReadOnly Notice */}
      {readOnly && (
        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid #38bdf8', color: '#38bdf8', padding: '0.65rem 1rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldAlert size={18} />
          <strong>Modo Observador (Administrador):</strong> Estás viendo la planilla de la vendedora en tiempo real (Solo lectura).
        </div>
      )}

      {/* Week Selector Bar */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => {
              if (!isEarliestWeek) setWeekOffset(prev => prev - 1);
            }}
            disabled={isEarliestWeek}
            className="btn btn-secondary btn-sm"
            title={isEarliestWeek ? 'Inicio oficial del sistema (Lunes 28/09)' : 'Semana Anterior'}
            style={{
              opacity: isEarliestWeek ? 0.35 : 1,
              cursor: isEarliestWeek ? 'not-allowed' : 'pointer',
              filter: isEarliestWeek ? 'grayscale(1)' : 'none'
            }}
          >
            <ChevronLeft size={16} /> Semana Anterior
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="btn btn-primary btn-sm">
              Regresar a Semana Actual
            </button>
          )}
          <button onClick={() => setWeekOffset(prev => prev + 1)} className="btn btn-secondary btn-sm" title="Semana Siguiente">
            Semana Siguiente <ChevronRight size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#38bdf8' }}>
            🗓️ Semana Seleccionada: <span style={{ color: 'var(--text-main)' }}>{weekDays[0].name} al {weekDays[5].name}</span>
          </div>

          {/* Botón Icono de Calculadora (Solo Vendedora) */}
          {!readOnly && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsCalcOpen(prev => !prev);
              }}
              title="Calculadora Rosada"
              style={{
                background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                width: '38px',
                height: '38px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 15px rgba(236, 72, 153, 0.45)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.08)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(236, 72, 153, 0.65)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(236, 72, 153, 0.45)';
              }}
            >
              <Calculator size={20} color="#ffffff" />
            </button>
          )}
        </div>
      </div>

      {/* Aviso de Salto Directo a Monto */}
      {jumpNotice && (
        <div style={{
          padding: '0.65rem 1rem',
          backgroundColor: '#0284c7',
          border: '1.5px solid #38bdf8',
          color: '#ffffff',
          borderRadius: '8px',
          fontWeight: '900',
          fontSize: '0.86rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          boxShadow: '0 4px 15px rgba(2, 132, 199, 0.45)',
          animation: 'pulseObservation 2s infinite ease-in-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.1rem' }}>📍</span>
            <span>{jumpNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setJumpNotice(null)}
            style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', fontWeight: '900', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Main Tabs (INGRESOS | EGRESOS) */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border-color)' }}>
        <button
          onClick={() => setMainTab('ingresos')}
          style={{
            padding: '0.75rem 1.5rem',
            fontWeight: '800',
            fontSize: '1rem',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: mainTab === 'ingresos' ? '#16a34a' : 'var(--bg-card)',
            color: mainTab === 'ingresos' ? '#ffffff' : 'var(--text-muted)',
            transition: 'all 0.2s',
            boxShadow: mainTab === 'ingresos' ? 'var(--shadow-glow-green)' : 'none',
          }}
        >
          🟢 Pestaña 1: INGRESOS DE CONTRATOS
        </button>

        <button
          onClick={() => setMainTab('egresos')}
          style={{
            padding: '0.75rem 1.5rem',
            fontWeight: '800',
            fontSize: '1rem',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: mainTab === 'egresos' ? '#dc2626' : 'var(--bg-card)',
            color: mainTab === 'egresos' ? '#ffffff' : 'var(--text-muted)',
            transition: 'all 0.2s',
          }}
        >
          🔴 Pestaña 2: EGRESOS DE CAJA
        </button>

        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.35rem 0.95rem',
          borderRadius: '8px 8px 0 0',
          backgroundColor: storeId === 1 ? 'rgba(2, 132, 199, 0.25)' : 'rgba(139, 92, 246, 0.25)',
          border: storeId === 1 ? '1.5px solid #0284c7' : '1.5px solid #8b5cf6',
          borderBottom: 'none',
          color: storeId === 1 ? '#38bdf8' : '#c084fc',
          fontWeight: '900',
          fontSize: '0.88rem'
        }}>
          🏪 PLANILLA: {storeId === 1 ? '🏢 TIENDA 1' : '🏬 TIENDA 2'}
        </div>
      </div>

      {/* Days of the Week Navigation */}
      <div style={{
        display: 'flex',
        gap: '0.35rem',
        backgroundColor: 'var(--bg-card)',
        padding: '0.4rem',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        overflowX: 'auto',
        boxShadow: 'var(--shadow-3d)'
      }}>
        {weekDays.map((day, idx) => (
          <button
            key={idx}
            onClick={() => setDayTab(idx)}
            style={{
              padding: '0.55rem 1.1rem',
              fontWeight: '800',
              fontSize: '0.85rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: dayTab === idx ? (mainTab === 'ingresos' ? '#10b981' : '#ef4444') : 'transparent',
              color: dayTab === idx ? '#ffffff' : 'var(--text-muted)',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease',
              boxShadow: dayTab === idx ? '0 4px 12px rgba(0,0,0,0.25)' : 'none'
            }}
          >
            {day.name}
          </button>
        ))}

        <button
          onClick={() => setDayTab(6)}
          style={{
            padding: '0.55rem 1.25rem',
            fontWeight: '800',
            fontSize: '0.85rem',
            borderRadius: '8px',
            border: '1px solid #0284c7',
            cursor: 'pointer',
            backgroundColor: dayTab === 6 ? '#0284c7' : 'transparent',
            color: dayTab === 6 ? '#ffffff' : '#38bdf8',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <BarChart3 size={15} />
          REPORTE SEMANAL
        </button>
      </div>

      {/* RENDER TAB 6: REPORTE SEMANAL */}
      {dayTab === 6 ? (
        <WeeklyReportView startDate={weekDays[0].dateStr} endDate={weekDays[5].dateStr} />
      ) : (
        <>
          {/* Header Banner */}
          <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: mainTab === 'ingresos' ? '#22c55e' : '#ef4444', margin: 0 }}>
                PLANILLA DE {mainTab === 'ingresos' ? 'INGRESOS' : 'EGRESOS'} — {weekDays[dayTab].name} ({selectedDateStr})
              </h3>
            </div>

            {/* CAJA ANTERIOR (EN EFECTIVO) - Solo visible en Ingresos */}
            {mainTab === 'ingresos' && (
              <div style={{
                backgroundColor: '#facc15',
                color: '#000000',
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                fontWeight: '900',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                boxShadow: '0 4px 15px rgba(250, 204, 21, 0.3)'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CAJA ANTERIOR (EN EFECTIVO)</span>
                    <span style={{ fontSize: '0.65rem', backgroundColor: '#000000', color: '#facc15', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                      {isFirstDay ? '💡 Monto Inicial (1 sola vez)' : '🔒 Correlativo Automático'}
                    </span>
                  </div>

                  {isEditingCash ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: '900' }}>S/</span>
                      <input
                        type="number"
                        step="0.01"
                        value={cashInputVal}
                        onChange={(e) => setCashInputVal(e.target.value)}
                        placeholder="0.00"
                        style={{
                          width: '110px',
                          padding: '0.2rem 0.4rem',
                          fontWeight: '900',
                          fontSize: '1.1rem',
                          borderRadius: '6px',
                          border: '2px solid #000000',
                          background: '#ffffff',
                          color: '#000000'
                        }}
                        autoFocus
                      />
                      <button
                        onClick={handleSaveInitialCash}
                        disabled={savingCash}
                        style={{
                          backgroundColor: '#000000',
                          color: '#facc15',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.3rem 0.6rem',
                          fontWeight: '900',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        {savingCash ? '...' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => setIsEditingCash(false)}
                        style={{
                          backgroundColor: 'transparent',
                          color: '#000000',
                          border: '1px solid #000000',
                          borderRadius: '6px',
                          padding: '0.3rem 0.5rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.1rem' }}>
                      <div style={{ fontSize: '1.35rem', fontWeight: '900', lineHeight: '1.1' }}>
                        {sheetData && sheetData.date_str === selectedDateStr 
                          ? formatSoles(sheetData.previous_cash !== undefined ? sheetData.previous_cash : previousCash)
                          : 'S/ ...'}
                      </div>
                      {isFirstDay && !readOnly && (
                        <button
                          onClick={() => {
                            const cur = sheetData?.previous_cash !== undefined ? sheetData.previous_cash : previousCash;
                            setCashInputVal(cur > 0 ? String(cur) : '');
                            setIsEditingCash(true);
                          }}
                          title="Ingresar monto en efectivo inicial por única vez"
                          style={{
                            backgroundColor: '#000000',
                            color: '#facc15',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '0.25rem 0.55rem',
                            fontWeight: '900',
                            fontSize: '0.72rem',
                            cursor: 'pointer'
                          }}
                        >
                          ✏️ Ingresar Monto
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {loading && (!sheetData || sheetData.date_str !== selectedDateStr) && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600' }}>Cargando datos de {weekDays[dayTab].name}...</p>
            </div>
          )}
          {error && <p style={{ color: '#ef4444', textAlign: 'center' }}>{error}</p>}

          {sheetData && sheetData.date_str === selectedDateStr && (() => {
            const filteredIncomeEntries = (sheetData.income_entries || []).filter((row) => {
              if (!searchQuery || searchQuery.trim() === '') return true;
              const q = searchQuery.toLowerCase().trim();
              const cleanQ = q.replace(/s\/\s*/g, '');
              const contractCode = (row.contract_num || '').toString().toLowerCase();
              const details = (row.details || '').toLowerCase();
              const totalAmt = (row.total_amount || 0).toString();
              const paidAmt = (row.amount_paid || 0).toString();
              return contractCode.includes(q) || details.includes(q) || totalAmt.includes(cleanQ) || paidAmt.includes(cleanQ);
            });

            const filteredExpenseEntries = (sheetData.expense_entries || []).filter((row) => {
              if (!expenseSearchQuery || expenseSearchQuery.trim() === '') return true;
              const q = expenseSearchQuery.toLowerCase().trim();
              const cleanQ = q.replace(/s\/\s*/gi, '').trim();
              const cat = (row.expense_type || '').toLowerCase();
              const details = (row.details || '').toLowerCase();
              const amtStr = (row.amount || 0).toString();
              const amtFixed = (row.amount || 0).toFixed(2);
              const amtFormatted = formatMoney(row.amount || 0);
              const pType = (row.payment_type || '').toLowerCase();
              return cat.includes(q) || details.includes(q) || amtStr.includes(cleanQ) || amtFixed.includes(cleanQ) || amtFormatted.includes(cleanQ) || pType.includes(q);
            });

            return (
            <>
              {/* MAIN TAB 1: INGRESOS */}
              {mainTab === 'ingresos' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {/* BUSCADOR EXCLUSIVO PARA INGRESOS DE CONTRATOS */}
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-card)', border: '2px solid #22c55e', borderRadius: '12px', padding: '0.5rem 1rem', boxShadow: '0 4px 15px rgba(34, 197, 94, 0.2)' }}>
                      <Search size={18} color="#22c55e" style={{ marginRight: '0.55rem', flexShrink: 0 }} />
                      <input
                        type="text"
                        placeholder="🔍 Buscar Ingreso por N° de Contrato, Nombre de Cliente o Monto (Ej: 105, Pedro, S/ 120)..."
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onFocus={() => { if (searchResults.length > 0) setShowSearchDropdown(true); }}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-main)',
                          fontSize: '0.92rem',
                          fontWeight: '700',
                          outline: 'none'
                        }}
                      />
                      {isSearching && <span style={{ fontSize: '0.75rem', color: '#22c55e', whiteSpace: 'nowrap' }}>Buscando...</span>}
                      {searchQuery && (
                        <button
                          onClick={() => { setSearchQuery(''); setSearchResults([]); setShowSearchDropdown(false); }}
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem', marginLeft: '0.5rem' }}
                        >
                          Limpiar ✕
                        </button>
                      )}
                    </div>

                    {/* Dropdown de Resultados de Búsqueda de Ingresos */}
                    {showSearchDropdown && (
                      <div style={{
                        position: 'absolute',
                        top: '115%',
                        left: 0,
                        right: 0,
                        backgroundColor: '#0f172a',
                        border: '2px solid #22c55e',
                        borderRadius: '14px',
                        boxShadow: '0 15px 35px rgba(0, 0, 0, 0.8)',
                        zIndex: 1000,
                        maxHeight: '340px',
                        overflowY: 'auto',
                        padding: '0.5rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', borderBottom: '1px solid #1e293b', fontSize: '0.75rem', color: '#94a3b8', fontWeight: '800' }}>
                          <span>RESULTADOS DE BÚSQUEDA DE INGRESOS ({searchResults.length})</span>
                          <button onClick={() => setShowSearchDropdown(false)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>Cerrar ✕</button>
                        </div>
                        {searchResults.length === 0 ? (
                          <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                            No se encontraron ingresos o contratos con ese criterio.
                          </div>
                        ) : (
                          searchResults.map((item, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleSelectSearchResult(item)}
                              style={{
                                padding: '0.7rem 0.85rem',
                                borderBottom: '1px solid #1e293b',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'background-color 0.2s',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1e293b'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{ backgroundColor: '#16a34a', color: '#ffffff', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '900' }}>
                                    CONT N° {item.contract_num}
                                  </span>
                                  <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#ffffff' }}>
                                    {item.details}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                  📅 Fecha: <strong style={{ color: '#22c55e' }}>{item.date_str}</strong> | Tipo: {item.payment_type || 'CONTRATO'}
                                </div>
                              </div>

                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#22c55e' }}>
                                  {formatSoles(item.total_amount || item.amount_paid || 0)}
                                </div>
                                <span className={`badge ${item.status === 'CANCELADO' || item.status === 'CANCELADO Y ENTREGADO' ? 'badge-cancelled' : 'badge-active'}`} style={{ fontSize: '0.7rem' }}>
                                  {item.status}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  <div className="card" style={{ padding: '0', overflow: 'hidden', border: '2px solid #22c55e' }}>
                    <div className="table-container" style={{ border: 'none' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem', width: '100%' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#14532d', color: '#ffffff' }}>
                            <th style={{ backgroundColor: '#84cc16', color: '#000', textAlign: 'center', width: '82px' }}>CONT.</th>
                            <th style={{ backgroundColor: '#65a30d', color: '#fff', textAlign: 'center', width: '95px' }}>VEND.</th>
                            <th style={{ backgroundColor: '#84cc16', color: '#000', minWidth: '180px' }}>DETALLES</th>
                            <th style={{ backgroundColor: '#84cc16', color: '#000', textAlign: 'right', width: '110px' }}>TOTAL</th>
                            <th style={{ backgroundColor: '#84cc16', color: '#000', textAlign: 'right', width: '110px' }}>A CUENTA</th>
                            <th style={{ backgroundColor: '#4d7c0f', color: '#fff', textAlign: 'center', width: '110px' }}>TIPO PAGO</th>
                            <th style={{ backgroundColor: '#22c55e', color: '#000', textAlign: 'right', width: '100px' }}>EFECTIVO</th>
                            <th style={{ backgroundColor: '#0284c7', color: '#fff', textAlign: 'right', width: '100px' }}>DPTO/BCP</th>
                            <th style={{ backgroundColor: '#0d9488', color: '#fff', textAlign: 'right', width: '95px' }}>POS</th>
                            <th style={{ backgroundColor: '#a855f7', color: '#fff', textAlign: 'right', width: '95px' }}>YAPE</th>
                            <th style={{ backgroundColor: '#84cc16', color: '#000', textAlign: 'right', width: '110px' }}>SALDO</th>
                            <th style={{ backgroundColor: '#0284c7', color: '#fff', textAlign: 'center', width: readOnly ? '160px' : '130px' }}>
                              {readOnly ? 'AUDITORÍA DE CONTROL' : 'ACCIONES'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredIncomeEntries.length === 0 ? (
                            <tr>
                              <td colSpan={12} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                                {sheetData.income_entries.length === 0
                                  ? `Sin ingresos registrados para el ${weekDays[dayTab].name}.`
                                  : 'No se encontraron ingresos con ese criterio de búsqueda.'}
                              </td>
                            </tr>
                          ) : (
                            filteredIncomeEntries.map((row) => {
                            const isAnulado = row.status === 'ANULADO';
                            const isPrestamoOrCambio = row.entry_type === 'PRESTAMO' || row.entry_type === 'INTERCAMBIO' || row.contract_num === 'PRESTAMO' || row.contract_num === 'CAMBIO';
                            const isOtroIngreso = row.entry_type === 'OTRO' || row.entry_type === 'OTRO_INGRESO' || row.contract_num === 'OTROS' || row.contract_num === 'OTRO';
                            // Un registro es COPIA sólo si es secundario (2do abono / cancelación posterior) o si explícitamente se registró como copia sin ser el primer adelanto
                            const isExplicitCopyText = row.details && (
                              (/\bCOPIA\b/i.test(row.details)) ||
                              (/\bCANCELACI[OÓ]N\b/i.test(row.details) && !/\b1[°º]?\s*ADELANTO\b/i.test(row.details))
                            );
                            const isCopia = !isPrestamoOrCambio && !isOtroIngreso && row.contract_num !== 'S/N' && (Boolean(row.is_secondary) || Boolean(isExplicitCopyText));

                            const isEntregado = !isAnulado && (
                              row.status === 'ENTREGADO' || 
                              row.status === 'CANCELADO Y ENTREGADO' || 
                              row.status === 'ENTREGADO CON SALDO' || 
                              row.status === 'ENTREGADO (NO CANCELADO)'
                            );
                            const isCancelado = !isAnulado && (
                              row.status === 'CANCELADO' || 
                              row.status === 'CANCELADO Y ENTREGADO' ||
                              (isCopia && Number(row.saldo) <= 0 && Number(row.total_amount) > 0)
                            );

                            const isAuditConforme = row.audit_status === 'CONFORME';
                            const isAuditObservado = row.audit_status === 'OBSERVADO';

                            // Sistema de 5 Colores:
                            // 1. Verde (contrato nuevo original)
                            // 2. Celeste (préstamo o cambio)
                            // 3. Rojo (contrato anulado)
                            // 4. Naranja (contrato entregado y cancelado, o copia/recojo posterior)
                            // 5. Morado (otro ingreso)
                            let contBg = '#10b981'; // 1. Verde (contrato nuevo original)
                            let contTextColor = '#ffffff';

                            if (isAnulado) {
                              contBg = '#ef4444'; // 3. Rojo (contrato anulado)
                              contTextColor = '#ffffff';
                            } else if (isEntregado || isCancelado || isCopia) {
                              contBg = '#ea580c'; // 4. Naranja (contrato entregado, cancelado o copia/recojo)
                              contTextColor = '#ffffff';
                            } else if (isOtroIngreso) {
                              contBg = '#8b5cf6'; // 5. Morado / Púrpura eléctrico (otro ingreso)
                              contTextColor = '#ffffff';
                            } else if (isPrestamoOrCambio) {
                              contBg = '#0284c7'; // 2. Celeste (préstamo o cambio)
                              contTextColor = '#ffffff';
                            }

                            let rowStyle = { borderBottom: '1px solid var(--border-color)', transition: 'all 0.2s ease' };
                            if (isAuditObservado) {
                              rowStyle.backgroundColor = 'rgba(239, 68, 68, 0.25)';
                              rowStyle.borderLeft = '6px solid #ef4444';
                            } else if (isAuditConforme) {
                              rowStyle.backgroundColor = 'rgba(16, 185, 129, 0.18)';
                              rowStyle.borderLeft = '6px solid #10b981';
                            } else if (isAnulado) {
                              rowStyle.backgroundColor = 'rgba(239, 68, 68, 0.15)'; // Fondo rojo
                            } else if (isEntregado || isCancelado || isCopia) {
                              rowStyle.backgroundColor = 'rgba(234, 88, 12, 0.15)'; // Fondo naranja
                            } else if (isOtroIngreso) {
                              rowStyle.backgroundColor = 'rgba(139, 92, 246, 0.14)'; // Fondo morado
                              rowStyle.borderLeft = '4px solid #8b5cf6';
                            } else if (isPrestamoOrCambio) {
                              rowStyle.backgroundColor = 'rgba(2, 132, 199, 0.12)'; // Fondo celeste
                            } else {
                              rowStyle.backgroundColor = 'rgba(16, 185, 129, 0.10)'; // Fondo verde (contrato nuevo)
                            }

                            const isHighlighted = highlightedEntryId === `ingreso_${row.id}`;
                            if (isHighlighted) {
                              rowStyle.outline = '3px solid #eab308';
                              rowStyle.boxShadow = '0 0 25px rgba(234, 179, 8, 0.9)';
                              rowStyle.backgroundColor = 'rgba(234, 179, 8, 0.35)';
                            }

                            return (
                              <tr key={row.id} id={`income-row-${row.id}`} style={rowStyle}>
                                <td style={{ textAlign: 'center', fontWeight: '900', color: contTextColor, backgroundColor: contBg, padding: '0.35rem 0.4rem', borderRadius: '4px', textShadow: contTextColor === '#ffffff' ? '0 1px 3px rgba(0,0,0,0.5)' : 'none' }}>
                                  <div style={{ fontSize: '0.92rem', lineHeight: '1.1' }}>
                                    {row.contract_num}
                                  </div>
                                  {isCopia && (
                                    <div style={{ marginTop: '0.2rem' }}>
                                      <span
                                        title="Copia / Cancelación de contrato anterior"
                                        style={{
                                          display: 'inline-block',
                                          fontSize: '0.62rem',
                                          fontWeight: '900',
                                          letterSpacing: '0.6px',
                                          padding: '0.08rem 0.35rem',
                                          borderRadius: '3px',
                                          backgroundColor: 'rgba(0, 0, 0, 0.35)',
                                          color: '#ffffff',
                                          border: '1px solid rgba(255, 255, 255, 0.45)',
                                          textTransform: 'uppercase',
                                          boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                        }}
                                      >
                                        COPIA
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td style={{ textAlign: 'center', padding: '0.4rem 0.25rem' }}>
                                  {(!isPrestamoOrCambio && !isOtroIngreso && row.vendedor_name) ? (
                                    <span style={{ 
                                      display: 'inline-block',
                                      padding: '0.15rem 0.45rem', 
                                      borderRadius: '12px', 
                                      fontSize: '0.74rem', 
                                      fontWeight: '700',
                                      backgroundColor: 'rgba(56, 189, 248, 0.12)',
                                      color: '#38bdf8',
                                      border: '1px solid rgba(56, 189, 248, 0.25)',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {row.vendedor_name !== 'Vendedora' ? row.vendedor_name : 'Carla'}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#64748b', fontSize: '0.85rem' }}>-</span>
                                  )}
                                </td>
                                <td style={{ fontWeight: '600', textDecoration: isAnulado ? 'line-through' : 'none' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    <span>{row.details}</span>
                                    {isAnulado && <span className="badge badge-anulado" style={{ backgroundColor: '#ef4444', color: '#ffffff', fontWeight: '900' }}>ANULADO</span>}
                                    {!isAnulado && isCancelado && (
                                      <span className="badge" style={{ backgroundColor: '#ea580c', color: '#ffffff', fontWeight: '900', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <CheckCircle2 size={11} /> CANCELADO
                                      </span>
                                    )}
                                    {!isAnulado && isEntregado && (
                                      <span className="badge" style={{ backgroundColor: '#ea580c', color: '#ffffff', fontWeight: '900', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <Package size={11} /> ENTREGADO
                                      </span>
                                    )}
                                    
                                    {isAuditConforme && (
                                      <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.25)', color: '#34d399', border: '1px solid #10b981', padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                        <CheckCircle2 size={12} /> CONFORME
                                      </span>
                                    )}
                                    {isAuditObservado && (
                                      <span style={{ backgroundColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5', border: '1px solid #ef4444', padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                        <AlertTriangle size={12} /> OBSERVADO
                                      </span>
                                    )}
                                  </div>

                                  {/* Nota de Auditoría del Administrador */}
                                  {isAuditObservado && row.audit_note && (
                                    <div style={{ marginTop: '0.4rem', backgroundColor: '#450a0a', border: '1.5px solid #ef4444', color: '#fca5a5', padding: '0.45rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#ef4444', marginBottom: '0.15rem', fontWeight: '900' }}>
                                        <MessageSquare size={14} /> NOTA DE AUDITORÍA (ADMINISTRADOR):
                                      </div>
                                      <div>"{row.audit_note}"</div>
                                    </div>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                                  {Number(row.total_amount) > 0 ? formatSoles(row.total_amount) : '-'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: '700', color: isAnulado ? '#ef4444' : '#34d399', whiteSpace: 'nowrap' }}>
                                  {formatSoles(row.amount_paid || 0)}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className="badge badge-active" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{row.payment_type_display || row.payment_type}</span>
                                </td>
                                <td style={{ textAlign: 'right', color: Number(row.efectivo) > 0 ? '#34d399' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {Number(row.efectivo) > 0 ? formatSoles(row.efectivo) : 'S/ -'}
                                </td>
                                <td style={{ textAlign: 'right', color: Number(row.bcp) > 0 ? '#38bdf8' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {Number(row.bcp) > 0 ? formatSoles(row.bcp) : 'S/ -'}
                                </td>
                                <td style={{ textAlign: 'right', color: Number(row.pos) > 0 ? '#2dd4bf' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {Number(row.pos) > 0 ? formatSoles(row.pos) : 'S/ -'}
                                </td>
                                <td style={{ textAlign: 'right', color: Number(row.yape) > 0 ? '#c084fc' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {Number(row.yape) > 0 ? formatSoles(row.yape) : 'S/ -'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: '800', color: isAnulado ? '#ef4444' : (Number(row.saldo) > 0 ? '#fbbf24' : '#34d399'), whiteSpace: 'nowrap' }}>
                                  {isAnulado ? 'ANULADO' : (Number(row.saldo) > 0 ? formatSoles(row.saldo) : 'S/ 0.00')}
                                </td>

                                {/* Audit / Actions Column */}
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                    {readOnly ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleQuickMarkConforme('income', row)}
                                          className="btn btn-sm"
                                          style={{
                                            backgroundColor: isAuditConforme ? '#10b981' : 'rgba(16, 185, 129, 0.25)',
                                            color: '#ffffff',
                                            border: '1px solid #10b981',
                                            padding: '0.2rem 0.45rem',
                                            fontSize: '0.72rem',
                                            fontWeight: '900'
                                          }}
                                          title={isAuditConforme ? "Clic para REVERTIR conformidad (Volver a pendiente)" : "Marcar como TODO CONFORME (Verde)"}
                                        >
                                          <CheckCircle2 size={12} /> {isAuditConforme ? '✅ Conforme' : 'Conforme'}
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => openAuditModal('income', row)}
                                          className="btn btn-sm"
                                          style={{
                                            backgroundColor: isAuditObservado ? '#ef4444' : 'rgba(239, 68, 68, 0.25)',
                                            color: '#ffffff',
                                            border: '1px solid #ef4444',
                                            padding: '0.2rem 0.45rem',
                                            fontSize: '0.72rem',
                                            fontWeight: '900'
                                          }}
                                          title="Observar e Insertar Nota (Rojo)"
                                        >
                                          <AlertTriangle size={12} /> Observar
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                                                                {/* 1. EDITAR */}
                                        <button 
                                          type="button"
                                          onClick={() => openEditModal('income', row)} 
                                          className="btn btn-secondary btn-sm" 
                                          style={{ padding: '0.2rem 0.35rem' }} 
                                          title="Editar datos de la fila"
                                        >
                                          <Edit3 size={13} color="#38bdf8" />
                                        </button>

                                        {/* 2. ENTREGADO */}
                                        <button 
                                          type="button"
                                          onClick={() => handleMarkAsEntregado(row.id)} 
                                          className="btn btn-sm" 
                                          style={{ 
                                            padding: '0.2rem 0.45rem', 
                                            backgroundColor: isEntregado ? '#ea580c' : 'rgba(234, 88, 12, 0.12)', 
                                            border: '1px solid #ea580c', 
                                            color: isEntregado ? '#ffffff' : '#fb923c', 
                                            fontWeight: '800', 
                                            display: 'inline-flex', 
                                            alignItems: 'center', 
                                            gap: '0.2rem', 
                                            fontSize: '0.72rem' 
                                          }} 
                                          title={isEntregado ? "Producto marcado como ENTREGADO (clic para desmarcar)" : "Marcar como ENTREGADO (el cliente solo recoge el producto)"}
                                        >
                                          {isEntregado ? <CheckCircle2 size={12} /> : <Package size={12} />} Entregado
                                        </button>

                                        {/* 3. CANCELADO */}
                                        <button 
                                          type="button"
                                          onClick={() => handleToggleCancelado(row.id)} 
                                          className="btn btn-sm" 
                                          style={{ 
                                            padding: '0.2rem 0.45rem', 
                                            backgroundColor: isCancelado ? '#ea580c' : 'rgba(234, 88, 12, 0.12)', 
                                            border: '1px solid #ea580c', 
                                            color: isCancelado ? '#ffffff' : '#fb923c', 
                                            fontWeight: '800', 
                                            display: 'inline-flex', 
                                            alignItems: 'center', 
                                            gap: '0.2rem', 
                                            fontSize: '0.72rem' 
                                          }} 
                                          title={isCancelado ? "Contrato marcado como CANCELADO (clic para desmarcar)" : "Marcar como CANCELADO (el cliente cancela el pago)"}
                                        >
                                          {isCancelado ? <CheckCircle2 size={12} /> : <DollarSign size={12} />} Cancelado
                                        </button>

                                        {/* 4. ANULAR */}
                                        <button 
                                          type="button"
                                          onClick={() => handleToggleAnularIncome(row.id)} 
                                          className={isAnulado ? 'btn btn-success btn-sm' : 'btn btn-danger btn-sm'} 
                                          style={{ padding: '0.2rem 0.35rem' }} 
                                          title={isAnulado ? 'Reactivar fila' : 'Anular fila'}
                                        >
                                          <Ban size={13} />
                                        </button>

                                        {/* 5. ELIMINAR */}
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteIncome(row.id)}
                                          className="btn btn-danger btn-sm"
                                          style={{ padding: '0.2rem 0.35rem', backgroundColor: '#dc2626', borderColor: '#b91c1c' }}
                                          title="Eliminar fila de la planilla"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}

                        {/* Fast Row Adder for Income */}
                        {!readOnly && (
                          <>
                            {lookupInfo && lookupInfo.exists && (
                              <tr style={{ backgroundColor: lookupInfo.status === 'CANCELADO' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)' }}>
                                <td colSpan="12" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: '800', color: lookupInfo.status === 'CANCELADO' ? '#ef4444' : '#38bdf8' }}>
                                  {lookupInfo.status === 'CANCELADO' ? (
                                    <>⚠️ Contrato N° {lookupInfo.contract_num} ({lookupInfo.client_name}) ya fue CANCELADO anteriormente.</>
                                  ) : (
                                    <>💡 Contrato N° {lookupInfo.contract_num} Encontrado — Cliente: <strong>{lookupInfo.client_name}</strong> | Total: <strong>{formatSoles(lookupInfo.total_amount || 0)}</strong> | Saldo pendiente por cancelar hoy: <strong style={{ color: '#22c55e', fontSize: '0.9rem' }}>{formatSoles(lookupInfo.balance_due || 0)}</strong></>
                                  )}
                                </td>
                              </tr>
                            )}
                            <tr style={{ backgroundColor: 'var(--bg-main)', borderTop: '2px solid #84cc16' }}>
                              <td style={{ padding: '0.4rem' }}>
                                <input
                                  type="text"
                                  placeholder="N° Cont"
                                  className="form-input"
                                  style={{ padding: '0.3rem', fontSize: '0.8rem', textAlign: 'center', width: '100%' }}
                                  value={incCont}
                                  onChange={(e) => handleContractNumberChange(e.target.value)}
                                />
                              </td>
                              <td style={{ padding: '0.4rem' }}>
                                <select
                                  className="form-select"
                                  style={{ 
                                    padding: '0.25rem 0.35rem', 
                                    fontSize: '0.78rem', 
                                    width: '100%', 
                                    backgroundColor: incEntryType !== 'CONTRATO' ? 'rgba(255,255,255,0.03)' : '#0f172a', 
                                    borderColor: incEntryType !== 'CONTRATO' ? '#334155' : (incVendedor ? '#38bdf8' : '#334155'), 
                                    color: incEntryType !== 'CONTRATO' ? '#64748b' : (incVendedor ? '#38bdf8' : '#94a3b8'), 
                                    fontWeight: incVendedor && incEntryType === 'CONTRATO' ? '700' : 'normal',
                                    cursor: incEntryType !== 'CONTRATO' ? 'not-allowed' : 'pointer',
                                    opacity: incEntryType !== 'CONTRATO' ? 0.6 : 1
                                  }}
                                  disabled={incEntryType !== 'CONTRATO'}
                                  value={incEntryType !== 'CONTRATO' ? '' : incVendedor}
                                  onChange={(e) => handleSellerSelect(e.target.value, setIncVendedor)}
                                  title={incEntryType !== 'CONTRATO' ? 'No aplica vendedor para préstamos o cambios' : 'Seleccione el Vendedor/a'}
                                >
                                  <option value="">{incEntryType !== 'CONTRATO' ? '— (No aplica) —' : 'Vendedor/a'}</option>
                                  {incEntryType === 'CONTRATO' && sellersList.map((s, idx) => (
                                    <option key={idx} value={s}>{s}</option>
                                  ))}
                                  {incEntryType === 'CONTRATO' && <option value="__NEW__" style={{ color: '#38bdf8', fontWeight: 'bold' }}>+ Nuevo...</option>}
                                </select>
                              </td>
                              <td style={{ padding: '0.4rem' }}>
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                  <select
                                    className="form-select"
                                    style={{ padding: '0.2rem', fontSize: '0.75rem', width: '110px' }}
                                    value={incEntryType}
                                    onChange={(e) => {
                                      const newType = e.target.value;
                                      setIncEntryType(newType);
                                      if (newType !== 'CONTRATO') {
                                        setLookupInfo(null);
                                        setIncVendedor('');
                                        if (newType === 'PRESTAMO' && (!incCont || /^\d+$/.test(incCont))) {
                                          setIncCont('PRESTAMO');
                                        } else if (newType === 'INTERCAMBIO' && (!incCont || /^\d+$/.test(incCont))) {
                                          setIncCont('CAMBIO');
                                        } else if (newType === 'OTRO' && (!incCont || /^\d+$/.test(incCont))) {
                                          setIncCont('OTROS');
                                        }
                                      } else {
                                        setIncVendedor('Carla');
                                        if (incCont === 'PRESTAMO' || incCont === 'CAMBIO' || incCont === 'OTROS' || incCont === 'OTRO') {
                                          setIncCont(nextContractNum || '');
                                        }
                                      }
                                    }}
                                  >
                                    <option value="CONTRATO">Contrato</option>
                                    <option value="PRESTAMO">Préstamo</option>
                                    <option value="INTERCAMBIO">Cambio/Transf</option>
                                    <option value="OTRO" style={{ color: '#c084fc', fontWeight: 'bold' }}>Otro Ingreso</option>
                                  </select>
                                  <input
                                    type="text"
                                    placeholder="Detalles (Ej: cred, préstamo Pedro)"
                                    className="form-input"
                                    style={{ padding: '0.3rem', fontSize: '0.8rem', flex: 1 }}
                                    value={incDetails}
                                    onChange={(e) => setIncDetails(e.target.value)}
                                  />
                                </div>
                              </td>
                              <td style={{ padding: '0.4rem' }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="Total S/"
                                  className="form-input"
                                  style={{ padding: '0.3rem', fontSize: '0.8rem', textAlign: 'right' }}
                                  value={incTotal}
                                  onChange={(e) => setIncTotal(e.target.value)}
                                />
                              </td>
                              <td style={{ padding: '0.4rem' }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="A cuenta S/"
                                  className="form-input"
                                  style={{ padding: '0.3rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: 'bold' }}
                                  value={incAmount}
                                  onChange={(e) => setIncAmount(e.target.value)}
                                />
                              </td>
                            <td style={{ padding: '0.4rem' }}>
                              <select
                                className="form-select"
                                style={{ padding: '0.3rem', fontSize: '0.78rem' }}
                                value={incType}
                                onChange={(e) => setIncType(e.target.value)}
                              >
                                <option value="YAPE">YAPE</option>
                                <option value="EFECTIVO">EFECTIVO</option>
                                <option value="DPTO/BCP">DPTO/BCP</option>
                                <option value="POS">POS</option>
                              </select>
                            </td>
                            <td colSpan="5" style={{ padding: '0.4rem', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                              Desglose y Saldo automáticos
                            </td>
                            <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                              <button onClick={handleAddIncome} className="btn btn-success btn-sm" style={{ padding: '0.3rem 0.6rem' }}>
                                <Plus size={14} /> Agregar
                              </button>
                            </td>
                          </tr>
                        </>
                      )}

                        {/* Income Totals Footer (Rediseñado Atractivo con Divisiones Verticales y Profundidad 3D) */}
                        <tr style={{ backgroundColor: '#0b0f19', fontWeight: '900', borderTop: '2px solid #84cc16', boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.6)' }}>
                          <td colSpan="3" style={{ textAlign: 'right', color: '#84cc16', padding: '0.85rem 1rem', fontSize: '0.95rem', borderRight: '1px solid #1e293b', textShadow: '0 0 10px rgba(132, 204, 22, 0.4)' }}>
                            TOTALES INGRESOS:
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)', padding: '0.85rem 0.5rem', fontSize: '0.95rem', whiteSpace: 'nowrap', borderRight: '1px solid #1e293b' }}>
                            -
                          </td>
                          <td style={{ textAlign: 'right', color: '#34d399', padding: '0.85rem 0.5rem', fontSize: '1.1rem', whiteSpace: 'nowrap', borderRight: '1px solid #1e293b', textShadow: '0 0 10px rgba(52, 211, 153, 0.4)' }}>
                            {formatSoles(sheetData.income_totals.total)}
                          </td>
                          <td style={{ borderRight: '1px solid #1e293b' }}></td>
                          <td style={{ textAlign: 'right', color: '#34d399', padding: '0.85rem 0.5rem', fontSize: '1rem', whiteSpace: 'nowrap', borderRight: '1px solid #1e293b' }}>
                            {formatSoles(sheetData.income_totals.efectivo)}
                          </td>
                          <td style={{ textAlign: 'right', color: '#38bdf8', padding: '0.85rem 0.5rem', fontSize: '1rem', whiteSpace: 'nowrap', borderRight: '1px solid #1e293b' }}>
                            {formatSoles(sheetData.income_totals.bcp)}
                          </td>
                          <td style={{ textAlign: 'right', color: '#2dd4bf', padding: '0.85rem 0.5rem', fontSize: '1rem', whiteSpace: 'nowrap', borderRight: '1px solid #1e293b' }}>
                            {formatSoles(sheetData.income_totals.pos)}
                          </td>
                          <td style={{ textAlign: 'right', color: '#c084fc', padding: '0.85rem 0.5rem', fontSize: '1rem', whiteSpace: 'nowrap', borderRight: '1px solid #1e293b' }}>
                            {formatSoles(sheetData.income_totals.yape)}
                          </td>
                          <td colSpan={readOnly ? 1 : 2}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              )}

              {/* MAIN TAB 2: EGRESOS */}
              {mainTab === 'egresos' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {/* BUSCADOR EXCLUSIVO PARA EGRESOS DE CAJA */}
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-card)', border: '2px solid #ef4444', borderRadius: '12px', padding: '0.5rem 1rem', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.2)' }}>
                      <Search size={18} color="#ef4444" style={{ marginRight: '0.55rem', flexShrink: 0 }} />
                      <input
                        type="text"
                        placeholder="🔍 Buscar Egreso por Categoría, Descripción o Monto (Ej: Luz, Alcohol, S/ 60, 250)..."
                        value={expenseSearchQuery}
                        onChange={(e) => handleExpenseSearchChange(e.target.value)}
                        onFocus={() => { if (expenseSearchResults.length > 0) setShowExpenseSearchDropdown(true); }}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-main)',
                          fontSize: '0.92rem',
                          fontWeight: '700',
                          outline: 'none'
                        }}
                      />
                      {isSearchingExpenses && <span style={{ fontSize: '0.75rem', color: '#ef4444', whiteSpace: 'nowrap' }}>Buscando...</span>}
                      {expenseSearchQuery && (
                        <button
                          onClick={() => { setExpenseSearchQuery(''); setExpenseSearchResults([]); setShowExpenseSearchDropdown(false); }}
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem', marginLeft: '0.5rem' }}
                        >
                          Limpiar ✕
                        </button>
                      )}
                    </div>

                    {/* Dropdown de Resultados de Búsqueda de Egresos */}
                    {showExpenseSearchDropdown && (
                      <div style={{
                        position: 'absolute',
                        top: '115%',
                        left: 0,
                        right: 0,
                        backgroundColor: '#0f172a',
                        border: '2px solid #ef4444',
                        borderRadius: '14px',
                        boxShadow: '0 15px 35px rgba(0, 0, 0, 0.8)',
                        zIndex: 1000,
                        maxHeight: '340px',
                        overflowY: 'auto',
                        padding: '0.5rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', borderBottom: '1px solid #1e293b', fontSize: '0.75rem', color: '#94a3b8', fontWeight: '800' }}>
                          <span>RESULTADOS DE BÚSQUEDA DE EGRESOS ({expenseSearchResults.length})</span>
                          <button onClick={() => setShowExpenseSearchDropdown(false)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>Cerrar ✕</button>
                        </div>
                        {expenseSearchResults.length === 0 ? (
                          <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                            No se encontraron egresos con ese criterio de búsqueda.
                          </div>
                        ) : (
                          expenseSearchResults.map((item, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleSelectExpenseSearchResult(item)}
                              style={{
                                padding: '0.7rem 0.85rem',
                                borderBottom: '1px solid #1e293b',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'background-color 0.2s',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1e293b'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span className="badge badge-pending" style={{ fontSize: '0.78rem' }}>
                                    {item.expense_type}
                                  </span>
                                  <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#ffffff' }}>
                                    {item.details}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                  📅 Fecha: <strong style={{ color: '#ef4444' }}>{item.date_str}</strong> | Tipo Pago: {item.payment_type || 'EFECTIVO'}
                                </div>
                              </div>

                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.98rem', fontWeight: '900', color: '#f87171' }}>
                                  {formatSoles(item.amount || 0)}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  <div className="card" style={{ padding: '0', overflow: 'hidden', border: '2px solid #ef4444' }}>
                    <div className="table-container" style={{ border: 'none' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem', width: '100%' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#7f1d1d', color: '#ffffff' }}>
                            <th style={{ backgroundColor: '#991b1b', color: '#fff', width: '180px' }}>TIPO DE GASTO</th>
                            <th style={{ backgroundColor: '#991b1b', color: '#fff', minWidth: '180px' }}>DETALLES DEL EGRESO</th>
                            <th style={{ backgroundColor: '#991b1b', color: '#fff', textAlign: 'right', width: '110px' }}>IMPORTE S/</th>
                            <th style={{ backgroundColor: '#7f1d1d', color: '#fff', textAlign: 'center', width: '120px' }}>TIPO PAGO</th>
                            <th style={{ backgroundColor: '#0e7490', color: '#fff', textAlign: 'right', width: '100px' }}>EFECTIVO</th>
                            <th style={{ backgroundColor: '#0284c7', color: '#fff', textAlign: 'right', width: '100px' }}>DEPOSITO BCP</th>
                            <th style={{ backgroundColor: '#0d9488', color: '#fff', textAlign: 'right', width: '95px' }}>POS</th>
                            <th style={{ backgroundColor: '#a855f7', color: '#fff', textAlign: 'right', width: '95px' }}>YAPE</th>
                            <th style={{ backgroundColor: '#0284c7', color: '#fff', textAlign: 'center', width: readOnly ? '160px' : '90px' }}>
                              {readOnly ? 'AUDITORÍA DE CONTROL' : 'ACCIONES'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredExpenseEntries.length === 0 ? (
                            <tr>
                              <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                                {sheetData.expense_entries.length === 0
                                  ? `Sin egresos registrados para el ${weekDays[dayTab].name}.`
                                  : 'No se encontraron egresos con ese criterio de búsqueda.'}
                              </td>
                            </tr>
                          ) : (
                            filteredExpenseEntries.map((row) => {
                            const isAuditConforme = row.audit_status === 'CONFORME';
                            const isAuditObservado = row.audit_status === 'OBSERVADO';
                            const isPrestamoOrDescuento = (row.expense_type || '').toUpperCase().includes('PRÉSTAMO') || (row.expense_type || '').toUpperCase().includes('PRESTAMO');

                            let rowStyle = { borderBottom: '1px solid var(--border-color)', transition: 'all 0.2s ease' };
                            if (isAuditObservado) {
                              rowStyle.backgroundColor = 'rgba(239, 68, 68, 0.25)';
                              rowStyle.borderLeft = '6px solid #ef4444';
                            } else if (isAuditConforme) {
                              rowStyle.backgroundColor = 'rgba(16, 185, 129, 0.18)';
                              rowStyle.borderLeft = '6px solid #10b981';
                            }

                            const isHighlighted = highlightedEntryId === `egreso_${row.id}`;
                            if (isHighlighted) {
                              rowStyle.outline = '3px solid #eab308';
                              rowStyle.boxShadow = '0 0 25px rgba(234, 179, 8, 0.9)';
                              rowStyle.backgroundColor = 'rgba(234, 179, 8, 0.35)';
                            }

                            return (
                              <tr key={row.id} id={`expense-row-${row.id}`} style={rowStyle}>
                                <td>
                                  <span className="badge badge-pending" style={{ fontSize: '0.72rem' }}>
                                    {row.expense_type || 'General'}
                                  </span>
                                </td>
                                <td style={{ fontWeight: '600' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    <span>{row.details}</span>
                                    {isAuditConforme && (
                                      <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.25)', color: '#34d399', border: '1px solid #10b981', padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                        <CheckCircle2 size={12} /> CONFORME
                                      </span>
                                    )}
                                    {isAuditObservado && (
                                      <span style={{ backgroundColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5', border: '1px solid #ef4444', padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                        <AlertTriangle size={12} /> OBSERVADO
                                      </span>
                                    )}
                                  </div>

                                  {/* Nota de Auditoría del Administrador */}
                                  {isAuditObservado && row.audit_note && (
                                    <div style={{ marginTop: '0.4rem', backgroundColor: '#450a0a', border: '1.5px solid #ef4444', color: '#fca5a5', padding: '0.45rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#ef4444', marginBottom: '0.15rem', fontWeight: '900' }}>
                                        <MessageSquare size={14} /> NOTA DE AUDITORÍA (ADMINISTRADOR):
                                      </div>
                                      <div>"{row.audit_note}"</div>
                                    </div>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: '700', color: '#f87171', whiteSpace: 'nowrap' }}>{formatSoles(row.amount)}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>{row.payment_type}</span>
                                </td>
                                <td style={{ textAlign: 'right', color: row.efectivo > 0 ? '#f87171' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {row.efectivo > 0 ? formatSoles(row.efectivo) : 'S/ -'}
                                </td>
                                <td style={{ textAlign: 'right', color: row.bcp > 0 ? '#38bdf8' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {row.bcp > 0 ? formatSoles(row.bcp) : 'S/ -'}
                                </td>
                                <td style={{ textAlign: 'right', color: row.pos > 0 ? '#2dd4bf' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {row.pos > 0 ? formatSoles(row.pos) : 'S/ -'}
                                </td>
                                <td style={{ textAlign: 'right', color: row.yape > 0 ? '#c084fc' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {row.yape > 0 ? formatSoles(row.yape) : 'S/ -'}
                                </td>

                                {/* Audit / Actions Column */}
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                    {readOnly ? (
                                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center', alignItems: 'center' }}>
                                        <button
                                          type="button"
                                          onClick={() => handleQuickMarkConforme('expense', row)}
                                          className="btn btn-sm"
                                          style={{
                                            backgroundColor: isAuditConforme ? '#10b981' : 'rgba(16, 185, 129, 0.25)',
                                            color: '#ffffff',
                                            border: '1px solid #10b981',
                                            padding: '0.2rem 0.45rem',
                                            fontSize: '0.72rem',
                                            fontWeight: '900'
                                          }}
                                          title={isAuditConforme ? "Clic para REVERTIR conformidad (Volver a pendiente)" : "Marcar Egreso como TODO CONFORME (Verde)"}
                                        >
                                          <CheckCircle2 size={12} /> {isAuditConforme ? '✅ Conforme' : 'Conforme'}
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => openAuditModal('expense', row)}
                                          className="btn btn-sm"
                                          style={{
                                            backgroundColor: isAuditObservado ? '#ef4444' : 'rgba(239, 68, 68, 0.25)',
                                            color: '#ffffff',
                                            border: '1px solid #ef4444',
                                            padding: '0.2rem 0.45rem',
                                            fontSize: '0.72rem',
                                            fontWeight: '900'
                                          }}
                                          title="Observar Egreso e Insertar Nota (Rojo)"
                                        >
                                          <AlertTriangle size={12} /> Observar
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleDeleteExpense(row.id, true)}
                                          className="btn btn-danger btn-sm"
                                          style={{ padding: '0.2rem 0.35rem' }}
                                          title="Eliminar Egreso"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center', alignItems: 'center' }}>
                                        <button onClick={() => openEditModal('expense', row)} className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.35rem' }} title="Editar">
                                          <Edit3 size={13} color="#38bdf8" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteExpense(row.id)}
                                          className="btn btn-danger btn-sm"
                                          style={{ padding: '0.2rem 0.35rem' }}
                                          title="Eliminar Egreso"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}

                        {/* Fast Row Adder for Expense */}
                        {!readOnly && (
                          <>
                            {expCategory === 'Préstamo al Personal' && (
                              <tr style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', borderTop: '2px solid #f59e0b' }}>
                                <td colSpan="9" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', color: '#fbbf24', fontWeight: '800' }}>
                                  💡 <strong>NUEVO PRÉSTAMO AL PERSONAL (Pestaña 6):</strong> Ingrese el nombre del colaborador y la cuota semanal acordada. El dinero prestado se registrará en Egresos y creará un control activo en la Pestaña 6.
                                </td>
                              </tr>
                            )}
                            {expCategory === 'Descuento Préstamo Personal' && (
                              <tr style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', borderTop: '2px solid #10b981' }}>
                                <td colSpan="9" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', color: '#34d399', fontWeight: '800' }}>
                                  💡 <strong>DESCUENTO DE CUOTA SEMANAL (Pestaña 6):</strong> Seleccione al colaborador para aplicar el descuento a su saldo adeudado.
                                </td>
                              </tr>
                            )}
                            <tr style={{ backgroundColor: 'var(--bg-main)', borderTop: '2px solid #ef4444' }}>
                              <td style={{ padding: '0.4rem' }}>
                                <select
                                  className="form-select"
                                  style={{ padding: '0.3rem', fontSize: '0.78rem' }}
                                  value={expCategory}
                                  onChange={(e) => {
                                    const cat = e.target.value;
                                    setExpCategory(cat);
                                    if (cat !== 'Préstamo al Personal' && cat !== 'Descuento Préstamo Personal') {
                                      setExpStaffName('');
                                      setExpWeeklyDiscount('');
                                      setExpLoanId('');
                                    }
                                  }}
                                >
                                  {expenseCategories.map((cat, i) => (
                                    <option key={i} value={cat}>{cat}</option>
                                  ))}
                                </select>
                              </td>

                              <td style={{ padding: '0.4rem' }}>
                                {expCategory === 'Descuento Préstamo Personal' ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <select
                                      className="form-select"
                                      style={{ padding: '0.3rem', fontSize: '0.78rem', borderColor: '#10b981', color: '#34d399', fontWeight: 'bold' }}
                                      value={expLoanId}
                                      onChange={(e) => {
                                        const loanId = e.target.value;
                                        setExpLoanId(loanId);
                                        const selectedLoan = activeLoansList.find((l) => String(l.id) === String(loanId));
                                        if (selectedLoan) {
                                          setExpStaffName(selectedLoan.staff_name);
                                          setExpDetails(`Descuento cuota préstamo a ${selectedLoan.staff_name}`);
                                          setExpAmount(String(selectedLoan.weekly_discount > 0 ? selectedLoan.weekly_discount : selectedLoan.balance_due));
                                        }
                                      }}
                                    >
                                      <option value="">-- Seleccionar Colaborador --</option>
                                      {activeLoansList.map((loan) => (
                                        <option key={loan.id} value={loan.id}>
                                          👤 {loan.staff_name} (Saldo: {formatSoles(loan.balance_due)} | Cuota: {formatSoles(loan.weekly_discount)})
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="text"
                                      placeholder="Detalle o nota"
                                      className="form-input"
                                      style={{ padding: '0.25rem', fontSize: '0.75rem' }}
                                      value={expDetails}
                                      onChange={(e) => setExpDetails(e.target.value)}
                                    />
                                  </div>
                                ) : expCategory === 'Préstamo al Personal' ? (
                                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <input
                                      type="text"
                                      placeholder="Colaborador (Ej: Juan)"
                                      className="form-input"
                                      style={{ padding: '0.3rem', fontSize: '0.78rem', width: '120px', borderColor: '#f59e0b', color: '#fbbf24', fontWeight: 'bold' }}
                                      value={expStaffName}
                                      onChange={(e) => {
                                        setExpStaffName(e.target.value);
                                        if (!expDetails) setExpDetails(`Préstamo a ${e.target.value}`);
                                      }}
                                    />
                                    <input
                                      type="text"
                                      placeholder="Motivo (Ej: salud)"
                                      className="form-input"
                                      style={{ padding: '0.3rem', fontSize: '0.78rem', flex: 1 }}
                                      value={expDetails}
                                      onChange={(e) => setExpDetails(e.target.value)}
                                    />
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    placeholder="Detalles (Ej: viruta, taxi, pago luz)"
                                    className="form-input"
                                    style={{ padding: '0.3rem', fontSize: '0.8rem' }}
                                    value={expDetails}
                                    onChange={(e) => setExpDetails(e.target.value)}
                                  />
                                )}
                              </td>

                              <td style={{ padding: '0.4rem' }}>
                                {expCategory === 'Préstamo al Personal' ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <input
                                      type="number"
                                      step="0.01"
                                      placeholder="Total S/"
                                      className="form-input"
                                      style={{ padding: '0.25rem', fontSize: '0.8rem', textAlign: 'right', color: '#f87171', fontWeight: 'bold' }}
                                      value={expAmount}
                                      onChange={(e) => setExpAmount(e.target.value)}
                                      title="Monto total prestado"
                                    />
                                    <input
                                      type="number"
                                      step="0.01"
                                      placeholder="Cuota/sem"
                                      className="form-input"
                                      style={{ padding: '0.25rem', fontSize: '0.75rem', textAlign: 'right', color: '#fbbf24', borderColor: '#f59e0b' }}
                                      value={expWeeklyDiscount}
                                      onChange={(e) => setExpWeeklyDiscount(e.target.value)}
                                      title="Descuento semanal acordado S/"
                                    />
                                  </div>
                                ) : (
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Importe S/"
                                    className="form-input"
                                    style={{ padding: '0.3rem', fontSize: '0.8rem', textAlign: 'right', color: '#f87171', fontWeight: 'bold' }}
                                    value={expAmount}
                                    onChange={(e) => setExpAmount(e.target.value)}
                                  />
                                )}
                              </td>

                              <td style={{ padding: '0.4rem' }}>
                                <select
                                  className="form-select"
                                  style={{ padding: '0.3rem', fontSize: '0.78rem' }}
                                  value={expType}
                                  onChange={(e) => setExpType(e.target.value)}
                                >
                                  <option value="YAPE">YAPE</option>
                                  <option value="EFECTIVO">EFECTIVO</option>
                                  <option value="DEPOSITO BCP">DEPOSITO BCP</option>
                                  <option value="POS">POS</option>
                                </select>
                              </td>

                              <td colSpan="4" style={{ padding: '0.4rem', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                Desglose automático por método
                              </td>

                              <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                                <button onClick={handleAddExpense} className="btn btn-danger btn-sm" style={{ padding: '0.3rem 0.6rem' }}>
                                  <Plus size={14} /> Agregar
                                </button>
                              </td>
                            </tr>
                          </>
                        )}

                        {/* Expense Totals Footer */}
                        <tr style={{ backgroundColor: '#000000', fontWeight: '900', borderTop: '2px solid #ef4444' }}>
                          <td colSpan="2" style={{ textAlign: 'right', color: '#ef4444', padding: '0.85rem 1rem', fontSize: '0.95rem' }}>
                            TOTALES EGRESOS:
                          </td>
                          <td style={{ textAlign: 'right', color: '#f87171', padding: '0.85rem 0.5rem', fontSize: '1.1rem', whiteSpace: 'nowrap' }}>
                            {formatSoles(sheetData.expense_totals.total)}
                          </td>
                          <td></td>
                          <td style={{ textAlign: 'right', color: '#f87171', padding: '0.85rem 0.5rem', fontSize: '1rem', whiteSpace: 'nowrap' }}>
                            {formatSoles(sheetData.expense_totals.efectivo)}
                          </td>
                          <td style={{ textAlign: 'right', color: '#38bdf8', padding: '0.85rem 0.5rem', fontSize: '1rem', whiteSpace: 'nowrap' }}>
                            {formatSoles(sheetData.expense_totals.bcp)}
                          </td>
                          <td style={{ textAlign: 'right', color: '#2dd4bf', padding: '0.85rem 0.5rem', fontSize: '1rem', whiteSpace: 'nowrap' }}>
                            {formatSoles(sheetData.expense_totals.pos)}
                          </td>
                          <td style={{ textAlign: 'right', color: '#c084fc', padding: '0.85rem 0.5rem', fontSize: '1rem', whiteSpace: 'nowrap' }}>
                            {formatSoles(sheetData.expense_totals.yape)}
                          </td>
                          {!readOnly && <td></td>}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              )}

              {/* CUADRE Y RESUMEN GENERAL (SOLO VISIBLE EN INGRESOS) */}
              {mainTab === 'ingresos' && (
                <div className="card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid #38bdf8', padding: '1.1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '800' }}>
                      CUADRE DE EFECTIVO DEL DÍA ({weekDays[dayTab].name}):
                    </span>
                    <span style={{ fontSize: '1.25rem', fontWeight: '900', color: '#34d399' }}>
                      SALDO DISPONIBLE EN CAJA (EN EFECTIVO): {formatSoles(sheetData.final_cash_in_hand)}
                    </span>
                  </div>
                </div>
              )}
            </>
            );
          })()}
        </>
      )}

      {/* EDIT MODAL */}
      {editingRow && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 300,
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', backgroundColor: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Edit3 size={18} /> Editar {editingRow.type === 'income' ? 'Ingreso' : 'Egreso'}
              </h3>
              <button onClick={() => setEditingRow(null)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="form-group" style={{ marginBottom: '1rem', padding: '0.65rem 0.75rem', backgroundColor: 'rgba(56, 189, 248, 0.08)', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label className="form-label" style={{ margin: 0, color: '#38bdf8', fontWeight: '800', fontSize: '0.85rem' }}>
                    📅 Día / Fecha de la Planilla
                  </label>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    (Puedes moverlo a otro día)
                  </span>
                </div>
                <input 
                  type="date" 
                  className="form-input" 
                  value={editDate} 
                  onChange={(e) => setEditDate(e.target.value)} 
                  required 
                  style={{ fontWeight: '700', color: '#f8fafc', padding: '0.4rem 0.6rem' }}
                />
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {weekDays.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setEditDate(d.dateStr)}
                      style={{
                        fontSize: '0.72rem',
                        padding: '0.2rem 0.45rem',
                        borderRadius: '4px',
                        border: editDate === d.dateStr ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.12)',
                        backgroundColor: editDate === d.dateStr ? '#0284c7' : 'rgba(255,255,255,0.05)',
                        color: editDate === d.dateStr ? '#ffffff' : '#94a3b8',
                        cursor: 'pointer',
                        fontWeight: editDate === d.dateStr ? '800' : '500',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              </div>

              {editingRow.type === 'income' ? (
                <>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">N° Contrato</label>
                      <input type="text" className="form-input" value={editCont} onChange={(e) => setEditCont(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Vendedor / Vendedora</label>
                      <select
                        className="form-select"
                        value={(editCont === 'PRESTAMO' || editCont === 'CAMBIO' || editCont === 'OTROS' || editCont === 'OTRO') ? '' : editVendedor}
                        onChange={(e) => handleSellerSelect(e.target.value, setEditVendedor)}
                        disabled={editCont === 'PRESTAMO' || editCont === 'CAMBIO' || editCont === 'OTROS' || editCont === 'OTRO'}
                        style={{ 
                          color: (editCont === 'PRESTAMO' || editCont === 'CAMBIO' || editCont === 'OTROS' || editCont === 'OTRO') ? '#64748b' : (editVendedor ? '#38bdf8' : '#94a3b8'), 
                          fontWeight: (editVendedor && editCont !== 'PRESTAMO' && editCont !== 'CAMBIO' && editCont !== 'OTROS' && editCont !== 'OTRO') ? '700' : 'normal',
                          backgroundColor: (editCont === 'PRESTAMO' || editCont === 'CAMBIO' || editCont === 'OTROS' || editCont === 'OTRO') ? 'rgba(255,255,255,0.03)' : undefined,
                          cursor: (editCont === 'PRESTAMO' || editCont === 'CAMBIO' || editCont === 'OTROS' || editCont === 'OTRO') ? 'not-allowed' : 'pointer'
                        }}
                      >
                        <option value="">{(editCont === 'PRESTAMO' || editCont === 'CAMBIO' || editCont === 'OTROS' || editCont === 'OTRO') ? '— (No aplica) —' : '(Sin asignar)'}</option>
                        {editCont !== 'PRESTAMO' && editCont !== 'CAMBIO' && editCont !== 'OTROS' && editCont !== 'OTRO' && sellersList.map((s, idx) => (
                          <option key={idx} value={s}>{s}</option>
                        ))}
                        {editCont !== 'PRESTAMO' && editCont !== 'CAMBIO' && editCont !== 'OTROS' && editCont !== 'OTRO' && (
                          <option value="__NEW__" style={{ color: '#38bdf8', fontWeight: 'bold' }}>+ Agregar nuevo...</option>
                        )}
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Detalles / Cliente</label>
                    <input type="text" className="form-input" value={editDetails} onChange={(e) => setEditDetails(e.target.value)} required />
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Monto Total S/</label>
                      <input type="number" step="0.01" className="form-input" value={editTotal} onChange={(e) => setEditTotal(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">A cuenta S/</label>
                      <input type="number" step="0.01" className="form-input" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo de Pago</label>
                    <select className="form-select" value={editPayType} onChange={(e) => setEditPayType(e.target.value)}>
                      <option value="YAPE">YAPE</option>
                      <option value="EFECTIVO">EFECTIVO</option>
                      <option value="DPTO/BCP">DPTO/BCP</option>
                      <option value="POS">POS</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Tipo de Gasto</label>
                    <select className="form-select" value={editExpCategory} onChange={(e) => setEditExpCategory(e.target.value)}>
                      {expenseCategories.map((cat, i) => (
                        <option key={i} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Detalles del Egreso</label>
                    <input type="text" className="form-input" value={editDetails} onChange={(e) => setEditDetails(e.target.value)} required />
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Importe S/</label>
                      <input type="number" step="0.01" className="form-input" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Tipo de Pago</label>
                      <select className="form-select" value={editPayType} onChange={(e) => setEditPayType(e.target.value)}>
                        <option value="YAPE">YAPE</option>
                        <option value="EFECTIVO">EFECTIVO</option>
                        <option value="DEPOSITO BCP">DEPOSITO BCP</option>
                        <option value="POS">POS</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={() => setEditingRow(null)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FINALIZE / CANCELATION MODAL (Requerimiento 4) */}
      {finalizingRow && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 300,
          padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', backgroundColor: 'var(--bg-card)', border: '2px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.15rem', color: '#10b981', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '900' }}>
                <CheckCircle2 size={20} /> Registrar Cobro de Saldo / Cancelación
              </h3>
              <button onClick={() => setFinalizingRow(null)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div style={{ backgroundColor: 'var(--bg-main)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Contrato N°:</span>
                <strong style={{ color: '#84cc16' }}>{finalizingRow.contract_num} ({finalizingRow.details})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Precio Total del Trabajo:</span>
                <strong>{formatSoles(finalizingRow.total_amount || 0)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Adelanto Inicial Dejado:</span>
                <strong style={{ color: '#38bdf8' }}>{formatSoles(finalizingRow.amount_paid || 0)} ({finalizingRow.payment_type})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: '0.4rem', marginTop: '0.4rem' }}>
                <span style={{ fontWeight: '800', color: '#fbbf24' }}>SALDO RESTANTE A COBRAR:</span>
                <strong style={{ fontSize: '1.05rem', color: '#fbbf24', fontWeight: '900' }}>{formatSoles(finalizingRow.saldo || 0)}</strong>
              </div>
            </div>

            <form onSubmit={handleConfirmFinalize}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '800' }}>¿Cómo Cancela el Saldo Restante?</label>
                <select 
                  className="form-select" 
                  style={{ fontSize: '0.95rem', padding: '0.75rem', fontWeight: '700' }}
                  value={finalizePayType} 
                  onChange={(e) => setFinalizePayType(e.target.value)}
                >
                  <option value="EFECTIVO">💵 EFECTIVO</option>
                  <option value="DPTO/BCP">🏦 DEPOSITO BCP</option>
                  <option value="DPTO/BBVA">🏦 DEPOSITO BBVA</option>
                  <option value="POS">💳 POS / TARJETA</option>
                  <option value="YAPE">📱 YAPE</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '800' }}>Monto del Saldo a Cobrar S/ (Auto-completado):</label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="form-input" 
                  style={{ fontSize: '1.2rem', fontWeight: '900', color: '#10b981', backgroundColor: 'var(--bg-main)' }}
                  value={finalizeAmount} 
                  onChange={(e) => setFinalizeAmount(e.target.value)} 
                  required 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setFinalizingRow(null)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-success" style={{ fontWeight: '900' }}>
                  <CheckCircle2 size={16} /> Confirmar Pago de Saldo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* AUDIT MODAL (ADMINISTRADOR) */}
      {auditingRow && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '520px',
            backgroundColor: '#0f172a',
            border: auditStatus === 'CONFORME' ? '3px solid #10b981' : '3px solid #ef4444',
            borderRadius: '16px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', color: auditStatus === 'CONFORME' ? '#10b981' : '#ef4444', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '900' }}>
                {auditStatus === 'CONFORME' ? <ShieldCheck size={22} /> : <AlertTriangle size={22} />}
                Auditoría de Control ({auditingRow.type === 'income' ? 'Ingreso / Contrato' : 'Egreso / Gasto'})
              </h3>
              <button onClick={() => setAuditingRow(null)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div style={{ backgroundColor: '#1e293b', padding: '0.9rem', borderRadius: '10px', border: '1px solid #334155', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#94a3b8' }}>{auditingRow.type === 'income' ? 'N° Contrato / Código:' : 'Concepto:'}</span>
                <strong style={{ color: '#38bdf8' }}>{auditingRow.row.contract_num || auditingRow.row.expense_type}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#94a3b8' }}>Detalles:</span>
                <strong style={{ color: '#ffffff' }}>{auditingRow.row.details}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Monto Registrado:</span>
                <strong style={{ color: '#22c55e', fontSize: '1.05rem' }}>
                  {formatSoles(auditingRow.row.amount_paid || auditingRow.row.amount || 0)} ({auditingRow.row.payment_type_display || auditingRow.row.payment_type})
                </strong>
              </div>
            </div>

            <form onSubmit={handleSaveAudit}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: '800', color: '#ffffff', marginBottom: '0.5rem', display: 'block' }}>
                  Estado de Auditoría:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={() => setAuditStatus('CONFORME')}
                    style={{
                      padding: '0.65rem 0.5rem',
                      borderRadius: '10px',
                      border: auditStatus === 'CONFORME' ? '3px solid #10b981' : '1px solid #334155',
                      backgroundColor: auditStatus === 'CONFORME' ? 'rgba(16, 185, 129, 0.25)' : '#1e293b',
                      color: auditStatus === 'CONFORME' ? '#34d399' : '#94a3b8',
                      fontWeight: '900',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    <CheckCircle2 size={16} /> ✅ CONFORME
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditStatus('OBSERVADO')}
                    style={{
                      padding: '0.65rem 0.5rem',
                      borderRadius: '10px',
                      border: auditStatus === 'OBSERVADO' ? '3px solid #ef4444' : '1px solid #334155',
                      backgroundColor: auditStatus === 'OBSERVADO' ? 'rgba(239, 68, 68, 0.25)' : '#1e293b',
                      color: auditStatus === 'OBSERVADO' ? '#fca5a5' : '#94a3b8',
                      fontWeight: '900',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    <AlertTriangle size={16} /> ⚠️ OBSERVAR
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditStatus('PENDIENTE')}
                    style={{
                      padding: '0.65rem 0.5rem',
                      borderRadius: '10px',
                      border: auditStatus === 'PENDIENTE' ? '3px solid #64748b' : '1px solid #334155',
                      backgroundColor: auditStatus === 'PENDIENTE' ? 'rgba(100, 116, 139, 0.3)' : '#1e293b',
                      color: auditStatus === 'PENDIENTE' ? '#f1f5f9' : '#94a3b8',
                      fontWeight: '900',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    ⚪ REVERTIR
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" style={{ fontWeight: '800', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                  <MessageSquare size={16} color="#38bdf8" /> Nota / Mensaje de Corrección para la Vendedora:
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    color: '#ffffff',
                    border: '1.5px solid #334155',
                    borderRadius: '10px',
                    padding: '0.75rem',
                    fontSize: '0.9rem',
                    fontWeight: '600'
                  }}
                  placeholder="Ej: Corregir método de pago: En la cuenta BCP solo figuran S/ 100 en lugar de S/ 120."
                  value={auditNote}
                  onChange={(e) => setAuditNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setAuditingRow(null)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className={auditStatus === 'CONFORME' ? 'btn btn-success' : 'btn btn-danger'} style={{ fontWeight: '900', padding: '0.65rem 1.25rem' }}>
                  💾 Guardar Auditoría y Enviar Nota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

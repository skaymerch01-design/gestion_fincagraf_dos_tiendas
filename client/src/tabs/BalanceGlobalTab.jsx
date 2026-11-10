import React, { useState, useEffect, useMemo, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { formatSoles } from '../utils/format';
import {
  Layers,
  Search,
  CheckCircle2,
  RefreshCw,
  Plus,
  Edit3,
  X,
  Save,
  Clock,
  Package,
  ChevronLeft,
  ChevronRight,
  Calendar,
  FileText,
  PieChart,
  TrendingUp,
  CreditCard,
  DollarSign,
  UserCheck,
  Trash2,
  RotateCcw,
  Ban
} from 'lucide-react';

const MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

const YEAR_OPTIONS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

function formatToYMD(dateVal) {
  if (!dateVal) return '';
  if (typeof dateVal === 'string') {
    if (dateVal.includes('T')) return dateVal.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}/.test(dateVal)) return dateVal.substring(0, 10);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateVal.trim())) {
      const [d, m, y] = dateVal.trim().split('/');
      return `${y}-${m}-${d}`;
    }
    return dateVal.trim();
  }
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (_) {
    return String(dateVal);
  }
}

export default function BalanceGlobalTab({ readOnly = false }) {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth()); // 0 to 11
  const [activeSubTab, setActiveSubTab] = useState('list'); // 'list' | 'monthly_report' | 'annual_report'

  const [contracts, setContracts] = useState([]);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [annualReport, setAnnualReport] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const handleJump = (e) => {
      const { category, code } = e.detail || {};
      if (category === 'CONTRATO') {
        if (code) {
          setSearch(String(code));
        }
        setActiveSubTab('list');
      }
    };
    window.addEventListener('fincagraf_jump_to_item', handleJump);
    return () => window.removeEventListener('fincagraf_jump_to_item', handleJump);
  }, []);

  // Modal / Form State for Adding or Editing Contract Row
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState(null);

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

  // Payments History & Addition State (Punto 3)
  const [contractPaymentsList, setContractPaymentsList] = useState([]);
  const [newPayDate, setNewPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [newPayAmount, setNewPayAmount] = useState('');
  const [newPayType, setNewPayType] = useState('EFECTIVO');
  const [newPayNotes, setNewPayNotes] = useState('');
  const [addingPayment, setAddingPayment] = useState(false);

  // Drag-to-Scroll (Manito) State & Ref (Punto 2)
  const tableContainerRef = React.useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    if (['INPUT', 'BUTTON', 'SELECT', 'A', 'SVG', 'PATH'].includes(e.target.tagName)) return;
    if (e.target.closest && e.target.closest('button, select, input, a')) return;
    if (!tableContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - tableContainerRef.current.offsetLeft);
    setScrollLeft(tableContainerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !tableContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - tableContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    tableContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleAddPayment = async () => {
    if (!editingContract || !newPayAmount || parseFloat(newPayAmount) <= 0) return;
    setAddingPayment(true);
    try {
      const res = await apiFetch(`/contracts/${editingContract.id}/payments`, {
        method: 'POST',
        body: {
          amount: parseFloat(newPayAmount),
          payment_date: newPayDate,
          payment_type: newPayType,
          notes: newPayNotes,
        }
      });
      if (res.success) {
        setContractPaymentsList(res.payments || []);
        // Field 6 (initial_payment) se mantiene estático; no sobreescribir con total_paid
        setNewPayAmount('');
        setNewPayNotes('');

        // Sincronizar fecha de cancelación con la fecha del abono que liquidó el saldo
        if (res.balance_due <= 0) {
          const effectiveCancel = res.cancellation_date || newPayDate || formatToYMD(new Date());
          setFormCancellationDate(effectiveCancel);
          if (!formDeliveryDate) {
            setFormDeliveryDate(effectiveCancel);
          }
        }

        setContracts(prev => prev.map(c => c.id === editingContract.id ? {
          ...c,
          total_paid: res.total_paid,
          balance_due: res.balance_due,
          status: res.status,
          cancellation_date: res.balance_due <= 0 ? (res.cancellation_date || newPayDate) : c.cancellation_date
        } : c));
        fetchGlobalData(true);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!editingContract || !window.confirm('¿Seguro que deseas eliminar este abono?')) return;
    try {
      const res = await apiFetch(`/contracts/${editingContract.id}/payments/${paymentId}`, {
        method: 'DELETE'
      });
      if (res.success) {
        setContractPaymentsList(res.payments || []);
        // Field 6 (initial_payment) se mantiene estático; no sobreescribir con total_paid
        setContracts(prev => prev.map(c => c.id === editingContract.id ? {
          ...c,
          total_paid: res.total_paid,
          balance_due: res.balance_due,
          status: res.status
        } : c));
        fetchGlobalData(true);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const [formContractNum, setFormContractNum] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formCancellationDate, setFormCancellationDate] = useState('');
  const [formDeliveryDate, setFormDeliveryDate] = useState('');
  const [formVendedor, setFormVendedor] = useState('');
  const [formClient, setFormClient] = useState('');
  const [formItems, setFormItems] = useState([{ quantity: '1', description: '', amount: '' }]);
  const [formTotal, setFormTotal] = useState('');
  const [formInitialPay, setFormInitialPay] = useState('');
  const [formPaymentStatus, setFormPaymentStatus] = useState('SIN PAGO');
  const [formPaymentType, setFormPaymentType] = useState('EFECTIVO');
  const [formOrderStatus, setFormOrderStatus] = useState('PRODUCCION');
  const [formObservations, setFormObservations] = useState('');

  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupFeedback, setLookupFeedback] = useState(null);

  const handlePaymentStatusChange = (newStatus) => {
    setFormPaymentStatus(newStatus);
    if (newStatus === 'SIN PAGO') {
      setFormInitialPay('0.00');
    } else if (newStatus === 'CANCELADO') {
      const tot = formTotal && parseFloat(formTotal) > 0 ? formTotal : (itemsSumTotal > 0 ? String(itemsSumTotal.toFixed(2)) : '0');
      setFormInitialPay(tot);
    }
  };

  const handleInitialPayChange = (val) => {
    setFormInitialPay(val);
    const num = parseFloat(val) || 0;
    const tot = parseFloat(formTotal) || itemsSumTotal || 0;
    if (num <= 0) {
      setFormPaymentStatus('SIN PAGO');
    } else if (tot > 0 && num >= tot) {
      setFormPaymentStatus('CANCELADO');
    } else {
      setFormPaymentStatus('PENDIENTE DE SALDO');
    }
  };

  const handleAddItem = () => {
    setFormItems(prev => [...prev, { quantity: '1', description: '', amount: '' }]);
  };

  const handleRemoveItem = (index) => {
    if (formItems.length <= 1) return;
    setFormItems(prev => {
      const updated = prev.filter((_, idx) => idx !== index);
      const sum = updated.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);
      if (sum > 0) setFormTotal(String(sum.toFixed(2)));
      return updated;
    });
  };

  const handleItemChange = (index, field, value) => {
    setFormItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'amount') {
        const sum = updated.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);
        if (sum > 0) setFormTotal(String(sum.toFixed(2)));
      }
      return updated;
    });
  };

  const itemsSumTotal = formItems.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);

  const fetchGlobalData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      if (activeSubTab === 'list') {
        let query = `?year=${selectedYear}&month=${selectedMonth}&`;
        if (search) query += `search=${encodeURIComponent(search)}&`;
        if (statusFilter) query += `status=${statusFilter}&`;

        const [contractsRes, reportRes] = await Promise.all([
          apiFetch(`/contracts${query}`),
          apiFetch(`/contracts/monthly-report?year=${selectedYear}&month=${selectedMonth}`)
        ]);

        if (contractsRes.success) setContracts(contractsRes.contracts);
        if (reportRes.success) setMonthlyReport(reportRes);
      } else if (activeSubTab === 'monthly_report') {
        const reportRes = await apiFetch(`/contracts/monthly-report?year=${selectedYear}&month=${selectedMonth}`);
        if (reportRes.success) setMonthlyReport(reportRes);
      } else if (activeSubTab === 'annual_report') {
        const reportRes = await apiFetch(`/contracts/annual-report?year=${selectedYear}`);
        if (reportRes.success) setAnnualReport(reportRes);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalData();
  }, [selectedYear, selectedMonth, activeSubTab, statusFilter]);

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonth(prev => prev + 1);
    }
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth());
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchGlobalData();
  };

  const handleContractCodeChange = async (codeVal) => {
    setFormContractNum(codeVal);
    if (!codeVal || codeVal.trim() === '') {
      setLookupFeedback(null);
      return;
    }

    setIsLookingUp(true);
    try {
      const res = await apiFetch(`/contracts/lookup-code/${encodeURIComponent(codeVal.trim())}`);
      if (res.success && res.exists) {
        setLookupFeedback({
          type: 'exists',
          msg: `ℹ️ El Contrato N° ${codeVal.trim()} ya se encuentra registrado en Balance Global.`
        });
      } else {
        setLookupFeedback(null);
      }
    } catch (err) {
      console.error('Error looking up contract in Balance Global:', err);
    } finally {
      setIsLookingUp(false);
    }
  };

  const openCreateModal = () => {
    setEditingContract(null);
    setFormContractNum('');
    const today = new Date();
    const modalDate = (selectedYear === today.getFullYear() && selectedMonth === today.getMonth())
      ? today.toISOString().split('T')[0]
      : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    setFormDate(modalDate);
    setFormCancellationDate('');
    setFormDeliveryDate('');
    setFormVendedor('');
    setFormClient('');
    setFormItems([{ quantity: '1', description: '', amount: '' }]);
    setFormTotal('');
    setFormInitialPay('');
    setFormPaymentStatus('SIN PAGO');
    setFormPaymentType('EFECTIVO');
    setFormOrderStatus('PRODUCCION');
    setFormObservations('');
    setLookupFeedback(null);
    setContractPaymentsList([]);
    setNewPayAmount('');
    setNewPayNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = async (contract) => {
    setEditingContract(contract);
    setFormContractNum(contract.contract_code || '');
    setFormDate(contract.date ? formatToYMD(contract.date) : (contract.date_str ? formatToYMD(contract.date_str) : new Date().toISOString().split('T')[0]));
    setFormCancellationDate(contract.cancellation_date ? formatToYMD(contract.cancellation_date) : '');
    setFormDeliveryDate(contract.delivery_date ? formatToYMD(contract.delivery_date) : '');
    setFormVendedor(contract.vendedor_name || '');
    setFormClient(contract.client_name === '-' ? '' : contract.client_name || '');
    
    let initialStatus = 'PENDIENTE DE SALDO';
    if (contract.payment_status === 'ANULADO' || contract.status === 'ANULADO') {
      initialStatus = 'ANULADO';
    } else if (contract.payment_status === 'CANCELADO' || contract.status === 'CANCELADO' || (contract.balance_due <= 0 && parseFloat(contract.total_amount || 0) > 0)) {
      initialStatus = 'CANCELADO';
    } else if (contract.payment_status === 'SIN PAGO' || contract.status === 'SIN PAGO' || parseFloat(contract.total_paid || 0) <= 0) {
      initialStatus = 'SIN PAGO';
    }
    setFormPaymentStatus(initialStatus);

    let loadedItems = [];
    if (contract.items && Array.isArray(contract.items) && contract.items.length > 0) {
      loadedItems = contract.items.map(it => ({
        quantity: it.quantity ? String(it.quantity) : '1',
        description: it.description || '',
        amount: it.amount ? String(it.amount) : ''
      }));
    } else {
      loadedItems = [{
        quantity: contract.quantity || '1',
        description: contract.description === '-' ? '' : (contract.description || ''),
        amount: contract.total_amount ? String(contract.total_amount) : ''
      }];
    }
    setFormItems(loadedItems);
    setFormTotal(contract.total_amount ? String(contract.total_amount) : '');
    const origInitial = contract.initial_payment !== undefined && contract.initial_payment !== null ? String(contract.initial_payment) : (contract.total_paid ? String(contract.total_paid) : '');
    setFormInitialPay(origInitial);
    setFormPaymentType(contract.payment_type || contract.payment_type_display || 'EFECTIVO');
    setFormOrderStatus(contract.order_status || 'PRODUCCION');
    setFormObservations(contract.observations || '');
    setLookupFeedback(null);
    setContractPaymentsList([]);
    setNewPayDate(new Date().toISOString().split('T')[0]);
    setNewPayAmount('');
    setNewPayNotes('');
    setIsModalOpen(true);

    if (contract.id) {
      try {
        const res = await apiFetch(`/contracts/${contract.id}`);
        if (res.success) {
          const list = res.payments || (res.contract && res.contract.payments) || [];
          setContractPaymentsList(list);
          const payDates = list.map(p => formatToYMD(p.payment_date)).filter(Boolean);
          const lastPayDate = payDates.length > 0 ? payDates[payDates.length - 1] : null;

          if (res.contract) {
            if (res.contract.initial_payment !== undefined && res.contract.initial_payment !== null) {
              setFormInitialPay(String(res.contract.initial_payment));
            } else if (list.length > 0 && list[0].amount) {
              setFormInitialPay(String(list[0].amount));
            }
            if (parseFloat(res.contract.total_paid || 0) <= 0) {
              setFormPaymentStatus('SIN PAGO');
            }

            const currentCancel = res.contract.cancellation_date ? formatToYMD(res.contract.cancellation_date) : '';
            const isFullyPaid = parseFloat(res.contract.balance_due || 0) <= 0 && parseFloat(res.contract.total_amount || 0) > 0;
            const todayStr = formatToYMD(new Date());

            if (isFullyPaid) {
              if (!currentCancel || (currentCancel === todayStr && lastPayDate && lastPayDate < todayStr)) {
                setFormCancellationDate(lastPayDate || formatToYMD(res.contract.date_str) || todayStr);
              } else {
                setFormCancellationDate(currentCancel);
              }
            } else {
              setFormCancellationDate(currentCancel);
            }

            if (res.contract.delivery_date) {
              setFormDeliveryDate(formatToYMD(res.contract.delivery_date));
            } else if (isFullyPaid) {
              setFormDeliveryDate(lastPayDate || formatToYMD(res.contract.date_str) || '');
            }
          }
        }
      } catch (e) {
        console.error('Error loading contract payments:', e);
      }
    }
  };

  const handleSaveContract = async (e) => {
    e.preventDefault();
    if (!formContractNum.trim()) return alert('Ingrese el N° de Contrato.');

    const combinedDesc = formItems
      .filter(it => it.description && it.description.trim())
      .map(it => `${it.quantity || 1} x ${it.description.trim()}${parseFloat(it.amount) > 0 ? ` (S/ ${parseFloat(it.amount).toFixed(2)})` : ''}`)
      .join(' | ') || 'TRABAJO DE IMPRENTA';

    const totalQty = formItems.reduce((acc, it) => acc + (parseInt(it.quantity) || 1), 0);

    const calculatedTotal = formTotal && parseFloat(formTotal) > 0
      ? formTotal
      : (itemsSumTotal > 0 ? String(itemsSumTotal.toFixed(2)) : '0');

    const abonosSum = contractPaymentsList.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
    const initialDeposit = parseFloat(formInitialPay) || 0;
    const totalPaidCalc = contractPaymentsList.length > 0 ? abonosSum : initialDeposit;
    const numericTotal = parseFloat(calculatedTotal || 0);
    const balanceCalc = Math.max(0, numericTotal - totalPaidCalc);

    const autoStatus = balanceCalc <= 0 && numericTotal > 0 ? 'CANCELADO' : 'ACTIVO';
    const autoPaymentStatus = balanceCalc <= 0 && numericTotal > 0 ? 'CANCELADO' : (totalPaidCalc <= 0 ? 'SIN PAGO' : 'PENDIENTE DE SALDO');
    const autoOrderStatus = balanceCalc <= 0 && numericTotal > 0 ? 'ENTREGADO / CANCELADO' : formOrderStatus;

    const payDates = contractPaymentsList.map(p => formatToYMD(p.payment_date)).filter(Boolean);
    const latestPaymentDate = payDates.length > 0 ? payDates[payDates.length - 1] : null;
    const fallbackDate = latestPaymentDate || formDate || formatToYMD(new Date());

    const autoCancelDate = balanceCalc <= 0 && numericTotal > 0 ? (formCancellationDate || fallbackDate) : null;
    const autoDeliveryDate = autoOrderStatus === 'ENTREGADO / CANCELADO' ? (formDeliveryDate || autoCancelDate || fallbackDate) : null;

    try {
      if (editingContract && editingContract.id) {
        // Actualización optimista inmediata en la UI (0ms sin parpadeos ni carga lenta)
        setContracts(prev => prev.map(c => {
          if (c.id === editingContract.id) {
            return {
              ...c,
              contract_code: formContractNum,
              date_str: formDate,
              date: formDate,
              client_name: formClient,
              vendedor_name: formVendedor,
              quantity: String(totalQty),
              description: combinedDesc,
              items: formItems,
              total_amount: numericTotal,
              initial_payment: initialDeposit,
              total_paid: totalPaidCalc,
              balance_due: balanceCalc,
              status: autoStatus,
              payment_status: autoPaymentStatus,
              order_status: autoOrderStatus,
              cancellation_date: autoCancelDate,
              delivery_date: autoDeliveryDate,
              payment_type: formPaymentType,
              observations: formObservations,
            };
          }
          return c;
        }));

        setIsModalOpen(false);

        await apiFetch(`/contracts/${editingContract.id}`, {
          method: 'PUT',
          body: {
            contract_code: formContractNum,
            date_str: formDate,
            client_name: formClient,
            vendedor_name: formVendedor,
            quantity: String(totalQty),
            description: combinedDesc,
            items: formItems,
            total_amount: calculatedTotal,
            initial_payment: formInitialPay,
            status: autoStatus,
            cancellation_date: autoCancelDate,
            delivery_date: autoDeliveryDate,
            payment_type: formPaymentType,
            order_status: autoOrderStatus,
            observations: formObservations,
          }
        });
      } else {
        await apiFetch('/contracts', {
          method: 'POST',
          body: {
            contract_code: formContractNum,
            date_str: formDate,
            client_name: formClient,
            vendedor_name: formVendedor,
            quantity: String(totalQty),
            description: combinedDesc,
            items: formItems,
            total_amount: calculatedTotal,
            initial_payment: formInitialPay,
            status: autoStatus,
            cancellation_date: autoCancelDate,
            delivery_date: autoDeliveryDate,
            payment_type: formPaymentType,
            order_status: autoOrderStatus,
            observations: formObservations,
          }
        });
        setIsModalOpen(false);
      }

      if (formDate) {
        const parts = formDate.split('-');
        if (parts.length >= 2) {
          const newY = parseInt(parts[0]);
          const newM = parseInt(parts[1]) - 1;
          if (newY !== selectedYear || newM !== selectedMonth) {
            setSelectedYear(newY);
            setSelectedMonth(newM);
            return;
          }
        }
      }

      fetchGlobalData(true);
    } catch (err) {
      alert(err.message);
      fetchGlobalData(true);
    }
  };

  // Cambio rápido del Estado del Pedido desde la tabla
  const handleOrderStatusChange = async (contractId, newStatus) => {
    setContracts(prev => prev.map(c => c.id === contractId ? { ...c, order_status: newStatus } : c));
    try {
      await apiFetch(`/contracts/${contractId}/order-status`, {
        method: 'PUT',
        body: { order_status: newStatus }
      });
      fetchGlobalData(true);
    } catch (err) {
      alert('Error al actualizar estado del pedido: ' + err.message);
      fetchGlobalData(true);
    }
  };

  // Botón de Cancelado (Liquidar a saldo 0)
  const handleLiquidateContract = async (contract) => {
    const isAlreadyPaid = contract.payment_status === 'CANCELADO' || contract.balance_due <= 0;
    if (isAlreadyPaid) {
      handleRevertLiquidation(contract);
      return;
    }

    const confirmMsg = `¿Desea liquidar y marcar como CANCELADO el contrato N° ${contract.contract_code} (${contract.client_name})?\n\nSaldo actual pendiente: S/ ${contract.balance_due.toFixed(2)}\nAl confirmar, el saldo pasará a S/ 0.00.\n\n(💡 Si te confundes, podrás regresar a como estaba antes usando el botón naranja de retorno).`;

    if (!window.confirm(confirmMsg)) return;

    // Actualización local inmediata
    setContracts(prev => prev.map(c => c.id === contract.id ? {
      ...c,
      balance_due: 0,
      payment_status: 'CANCELADO',
      status: 'CANCELADO',
      cancellation_date: formatToYMD(new Date())
    } : c));

    try {
      await apiFetch(`/contracts/${contract.id}/liquidate`, { method: 'PUT' });
      fetchGlobalData(true);
    } catch (err) {
      alert('Error al liquidar contrato: ' + err.message);
      fetchGlobalData(true);
    }
  };

  // Botón para Regresar / Revertir Liquidación (Restaurar saldo original y estado Pendiente)
  const handleRevertLiquidation = async (contract) => {
    const confirmMsg = `↩️ ¿Desea REGRESAR el contrato N° ${contract.contract_code} (${contract.client_name}) a PENDIENTE?\n\nEsta acción revertirá la liquidación y restaurará el saldo original por cobrar.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await apiFetch(`/contracts/${contract.id}/revert-liquidation`, { method: 'PUT' });
      if (res.success) {
        setContracts(prev => prev.map(c => c.id === contract.id ? {
          ...c,
          balance_due: res.balance_due,
          status: res.status,
          payment_status: res.balance_due <= 0 ? 'CANCELADO' : (c.total_paid <= 0 ? 'SIN PAGO' : 'PENDIENTE DE SALDO'),
          cancellation_date: null
        } : c));
      }
      fetchGlobalData(true);
    } catch (err) {
      alert('Error al revertir liquidación: ' + err.message);
      fetchGlobalData(true);
    }
  };

  // Botón de Anular / Reactivar Contrato
  const handleToggleAnular = async (contract) => {
    const isAnulado = contract.payment_status === 'ANULADO' || contract.status === 'ANULADO';
    const confirmMsg = isAnulado
      ? `¿Desea REACTIVAR el Contrato N° ${contract.contract_code} (${contract.client_name}) y devolverlo a estado activo?`
      : `🚫 ¿Está seguro de ANULAR el Contrato N° ${contract.contract_code} (${contract.client_name})?\n\nAl anularlo, el contrato se marcará como ANULADO en el Balance Global.`;

    if (!window.confirm(confirmMsg)) return;

    // Actualización local inmediata (0ms de espera)
    const nextStatus = isAnulado ? (contract.balance_due <= 0 ? 'CANCELADO' : 'ACTIVO') : 'ANULADO';
    const nextPaymentStatus = isAnulado ? (contract.balance_due <= 0 ? 'CANCELADO' : (contract.total_paid <= 0 ? 'SIN PAGO' : 'PENDIENTE DE SALDO')) : 'ANULADO';
    const nextOrderStatus = isAnulado ? (contract.balance_due <= 0 ? 'ENTREGADO / CANCELADO' : 'PRODUCCION') : 'ANULADO';

    setContracts(prev => prev.map(c => c.id === contract.id ? {
      ...c,
      status: nextStatus,
      payment_status: nextPaymentStatus,
      order_status: nextOrderStatus
    } : c));

    try {
      const res = await apiFetch(`/contracts/${contract.id}/anular`, { method: 'PUT' });
      if (res.success) {
        fetchGlobalData(true);
      }
    } catch (err) {
      alert('Error al anular/reactivar contrato: ' + err.message);
      fetchGlobalData(true);
    }
  };

  // Botón de Borrar (Eliminar permanentemente)
  const handleDeleteContract = async (contract) => {
    const confirmMsg = `⚠️ ¿Está seguro de eliminar permanentemente el contrato N° ${contract.contract_code} (${contract.client_name})?\n\nEsta fila se quitará del Balance Global.`;
    if (!window.confirm(confirmMsg)) return;

    setContracts(prev => prev.filter(c => c.id !== contract.id));

    try {
      await apiFetch(`/contracts/${contract.id}`, { method: 'DELETE' });
      fetchGlobalData(true);
    } catch (err) {
      alert('Error al eliminar contrato: ' + err.message);
      fetchGlobalData(true);
    }
  };

  // Summary Totals for List View (excluye contratos anulados para cuadrar con el resumen gerencial)
  const listTotals = contracts.reduce((acc, curr) => {
    const isAnulado = curr.payment_status === 'ANULADO' || curr.status === 'ANULADO' || curr.order_status === 'ANULADO';
    if (isAnulado) return acc;

    acc.totalAmount += (curr.total_amount || 0);
    acc.totalPaid += (curr.total_paid || 0);
    acc.balanceDue += (curr.balance_due || 0);
    return acc;
  }, { totalAmount: 0, totalPaid: 0, balanceDue: 0 });

  // Agrupar contratos por semanas dentro del mes seleccionado
  const weeklyGroups = useMemo(() => {
    if (!contracts || contracts.length === 0) return [];

    const groupsMap = new Map();

    contracts.forEach((row) => {
      const dateStr = formatToYMD(row.date);
      let weekKey = 'SIN_FECHA';
      let weekLabel = 'Contratos sin fecha asignada';
      let sortKey = '0000-00-00';

      if (dateStr && dateStr.includes('-')) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d, 12, 0, 0);
        const dow = dateObj.getDay();
        const diffToMon = dow === 0 ? -6 : 1 - dow;
        const mon = new Date(dateObj);
        mon.setDate(dateObj.getDate() + diffToMon);
        const sat = new Date(mon);
        sat.setDate(mon.getDate() + 5);

        const pad = (n) => String(n).padStart(2, '0');
        const monStr = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
        const satStr = `${sat.getFullYear()}-${pad(sat.getMonth() + 1)}-${pad(sat.getDate())}`;
        weekKey = monStr;
        sortKey = monStr;
        weekLabel = `SEMANA: LUNES ${pad(mon.getDate())}/${pad(mon.getMonth() + 1)} AL SÁBADO ${pad(sat.getDate())}/${pad(sat.getMonth() + 1)}`;
      }

      if (!groupsMap.has(weekKey)) {
        groupsMap.set(weekKey, {
          key: weekKey,
          sortKey,
          label: weekLabel,
          items: [],
          totalAmount: 0,
          totalPaid: 0,
          totalBalance: 0
        });
      }

      const g = groupsMap.get(weekKey);
      g.items.push(row);
      const isAnulado = row.payment_status === 'ANULADO' || row.status === 'ANULADO' || row.order_status === 'ANULADO';
      if (!isAnulado) {
        g.totalAmount += parseFloat(row.total_amount) || 0;
        g.totalPaid += parseFloat(row.total_paid) || 0;
        g.totalBalance += parseFloat(row.balance_due) || 0;
        g.validCount = (g.validCount || 0) + 1;
      }
    });

    const result = Array.from(groupsMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    // Ordenar contratos dentro de cada semana de menor a mayor (correlativo ascendente: 2201, 2202, 2203...)
    result.forEach(g => {
      g.items.sort((a, b) => {
        const numA = parseInt(String(a.contract_code || a.id).replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.contract_code || b.id).replace(/\D/g, ''), 10) || 0;
        if (numA !== numB) return numA - numB;
        return String(a.contract_code || a.id).localeCompare(String(b.contract_code || b.id));
      });
    });

    return result;
  }, [contracts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Header & Temporal Navigation Bar */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', border: '1px solid #334155' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
            <Layers size={24} color="#10b981" />
            3. Balance Global de Contratos (Planilla Mensual y Anual)
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.2rem', margin: 0 }}>
            Organización automática mes a mes y año a año con sincronización en tiempo real.
          </p>
        </div>

        {/* Month Navigation Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #3b82f6', padding: '0.2rem' }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0.35rem 0.6rem', border: 'none', background: 'transparent', color: '#60a5fa' }}
              title="Mes Anterior"
            >
              <ChevronLeft size={18} />
            </button>

            <select
              className="form-select"
              style={{ width: 'auto', backgroundColor: 'transparent', color: '#ffffff', fontWeight: '900', fontSize: '0.85rem', border: 'none', padding: '0.35rem 0.5rem', cursor: 'pointer' }}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            >
              {MONTH_NAMES.map((mName, idx) => (
                <option key={idx} value={idx} style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                  {mName}
                </option>
              ))}
            </select>

            <select
              className="form-select"
              style={{ width: 'auto', backgroundColor: 'transparent', color: '#ffffff', fontWeight: '900', fontSize: '0.85rem', border: 'none', padding: '0.35rem 0.5rem', cursor: 'pointer' }}
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              {YEAR_OPTIONS.map(y => (
                <option key={y} value={y} style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                  {y}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleNextMonth}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0.35rem 0.6rem', border: 'none', background: 'transparent', color: '#60a5fa' }}
              title="Mes Siguiente"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleCurrentMonth}
            className="btn btn-secondary btn-sm"
            style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}
          >
            <Calendar size={14} color="#34d399" /> Mes Actual
          </button>

          {!readOnly && (
            <button
              type="button"
              onClick={openCreateModal}
              className="btn btn-success btn-sm"
              style={{ fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}
            >
              <Plus size={16} /> + Nuevo Contrato
            </button>
          )}

          <button
            type="button"
            onClick={fetchGlobalData}
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.4rem 0.6rem' }}
            title="Actualizar Datos"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 2. Sub-tab Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #1e293b', paddingBottom: '0.2rem' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('list')}
          style={{
            padding: '0.65rem 1.25rem',
            borderRadius: '8px 8px 0 0',
            fontWeight: '900',
            fontSize: '0.85rem',
            cursor: 'pointer',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s',
            backgroundColor: activeSubTab === 'list' ? '#0284c7' : '#0f172a',
            color: activeSubTab === 'list' ? '#ffffff' : '#94a3b8',
          }}
        >
          <FileText size={16} /> 📑 LISTA DE CONTRATOS ({MONTH_NAMES[selectedMonth]} {selectedYear})
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('monthly_report')}
          style={{
            padding: '0.65rem 1.25rem',
            borderRadius: '8px 8px 0 0',
            fontWeight: '900',
            fontSize: '0.85rem',
            cursor: 'pointer',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s',
            backgroundColor: activeSubTab === 'monthly_report' ? '#0284c7' : '#0f172a',
            color: activeSubTab === 'monthly_report' ? '#ffffff' : '#94a3b8',
          }}
        >
          <PieChart size={16} /> 📊 REPORTE MENSUAL
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('annual_report')}
          style={{
            padding: '0.65rem 1.25rem',
            borderRadius: '8px 8px 0 0',
            fontWeight: '900',
            fontSize: '0.85rem',
            cursor: 'pointer',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s',
            backgroundColor: activeSubTab === 'annual_report' ? '#0284c7' : '#0f172a',
            color: activeSubTab === 'annual_report' ? '#ffffff' : '#94a3b8',
          }}
        >
          <TrendingUp size={16} /> 📈 REPORTE ANUAL ({selectedYear})
        </button>
      </div>

      {loading && <p style={{ color: '#94a3b8', padding: '1rem' }}>Cargando datos de Balance Global...</p>}
      {error && <p style={{ color: '#ef4444', padding: '1rem' }}>{error}</p>}

      {/* 3. SUB-TAB 1: LISTA DE CONTRATOS (14 COLUMNAS) */}
      {!loading && !error && activeSubTab === 'list' && (
        <>
          {/* Monthly Metric Cards Banner */}
          {monthlyReport && monthlyReport.summary && (
            <div className="grid-4">
              <div className="card" style={{ borderLeft: '4px solid #38bdf8' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
                  Contratos {MONTH_NAMES[selectedMonth]} {selectedYear}
                </span>
                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#f8fafc', marginTop: '0.2rem' }}>
                  {monthlyReport.summary.total_contracts}
                </div>
              </div>

              <div className="card" style={{ borderLeft: '4px solid #0284c7' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
                  Monto Total Contratado
                </span>
                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#38bdf8', marginTop: '0.2rem' }}>
                  {formatSoles(monthlyReport.summary.total_contract_value)}
                </div>
              </div>

              <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
                  Recaudado / A Cuenta
                </span>
                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#34d399', marginTop: '0.2rem' }}>
                  {formatSoles(monthlyReport.summary.total_collected)}
                </div>
              </div>

              <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
                  Saldo Pendiente por Cobrar
                </span>
                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fbbf24', marginTop: '0.2rem' }}>
                  {formatSoles(monthlyReport.summary.total_pending)}
                </div>
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <form onSubmit={handleSearchSubmit} className="card" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
              <input
                type="text"
                placeholder="🔍 Buscar en este mes por N° de contrato, cliente, vendedor o descripción..."
                className="form-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              className="form-select"
              style={{ width: 'auto' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Todos los Estados de Pago</option>
              <option value="SIN_PAGO">⚪ Sin Pago (S/ 0.00)</option>
              <option value="ACTIVO">🟡 Con Adelanto (Pendiente Saldo)</option>
              <option value="CANCELADO">🟢 Cancelados (100% Pagados)</option>
              <option value="ANULADO">🔴 Anulados</option>
            </select>

            <button type="submit" className="btn btn-primary">
              <Search size={16} /> Buscar
            </button>
          </form>

          {/* Spreadsheet Table (14 Columns) */}
          <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1.5px solid #1e293b' }}>
            {/* Helper bar explaining the hand drag feature and fixed scrollbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.85rem', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b', fontSize: '0.78rem', color: '#94a3b8' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                🖐️ <strong>Mover tabla con la manito:</strong> Clic sostenido y arrastre para deslizar horizontalmente, o use la barra inferior fija visible.
              </span>
              <span style={{ color: '#38bdf8', fontWeight: '800' }}>
                {contracts.length} contratos
              </span>
            </div>

            <div
              ref={tableContainerRef}
              onMouseDown={handleMouseDown}
              onMouseLeave={handleMouseLeave}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
              className="table-container"
              style={{
                border: 'none',
                overflowX: 'auto',
                overflowY: 'auto',
                maxHeight: '68vh',
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: isDragging ? 'none' : 'auto'
              }}
            >
              <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%', whiteSpace: 'nowrap' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.6rem', textAlign: 'center', width: '95px' }}>FECHA CONTRATO</th>
                    <th style={{ backgroundColor: '#0284c7', color: '#ffffff', padding: '0.75rem 0.6rem', textAlign: 'center', width: '80px', fontWeight: '900' }}>N° CONT</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.6rem', textAlign: 'left', width: '110px' }}>VEND.</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.8rem', textAlign: 'left', minWidth: '150px' }}>CLIENTE</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.5rem', textAlign: 'center', width: '60px' }}>CANT.</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.8rem', textAlign: 'left', minWidth: '180px' }}>DESCRIPCION</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.6rem', textAlign: 'right', width: '95px' }}>TOTAL</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.6rem', textAlign: 'center', width: '175px' }}>ESTADO DEL PEDIDO</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.6rem', textAlign: 'right', width: '110px' }}>TOTAL / A. CTA.</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.6rem', textAlign: 'right', width: '95px' }}>SALDO</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.6rem', textAlign: 'center', width: '130px' }}>ESTADO DEL PAGO</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.6rem', textAlign: 'center', width: '170px' }}>MEDIO DE PAGO</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.6rem', textAlign: 'center', width: '115px' }}>FECHA CANCELACIÓN</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.6rem', textAlign: 'center', width: '115px' }}>FECHA ENTREGA</th>
                    <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.8rem', textAlign: 'left', minWidth: '160px' }}>OBSERVACION OCURRENCIAS</th>
                    {!readOnly && <th style={{ backgroundColor: '#0f172a', padding: '0.75rem 0.5rem', textAlign: 'center', width: '115px' }}>ACCIONES</th>}
                  </tr>
                </thead>
                <tbody>
                  {contracts.length === 0 ? (
                    <tr>
                      <td colSpan={readOnly ? 15 : 16} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                        No se encontraron contratos para {MONTH_NAMES[selectedMonth]} {selectedYear}.
                      </td>
                    </tr>
                  ) : (
                    weeklyGroups.map((group, groupIdx) => (
                      <React.Fragment key={group.key}>
                        {/* SEPARADOR DE SEMANA VISUALMENTE ORDENADO */}
                        <tr style={{ backgroundColor: '#091322', borderTop: '2px solid #0284c7', borderBottom: '1.5px solid #1e293b' }}>
                          <td colSpan={readOnly ? 15 : 16} style={{ padding: '0.65rem 0.85rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span style={{ fontSize: '1.1rem' }}>📅</span>
                                <span style={{ fontWeight: '900', fontSize: '0.88rem', color: '#38bdf8', letterSpacing: '0.5px' }}>
                                  {group.label}
                                </span>
                                <span style={{ backgroundColor: '#1e293b', color: '#cbd5e1', fontSize: '0.74rem', padding: '0.15rem 0.55rem', borderRadius: '4px', fontWeight: '800', border: '1px solid #334155' }}>
                                  {group.validCount !== undefined ? group.validCount : group.items.length} {(group.validCount !== undefined ? group.validCount : group.items.length) === 1 ? 'Contrato' : 'Contratos'}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.8rem' }}>
                                <div>
                                  <span style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: '700' }}>TOTAL VENDIDO: </span>
                                  <span style={{ fontWeight: '900', color: '#f8fafc', fontSize: '0.86rem' }}>{formatSoles(group.totalAmount)}</span>
                                </div>
                                <div>
                                  <span style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: '700' }}>COBRADO: </span>
                                  <span style={{ fontWeight: '900', color: '#34d399', fontSize: '0.86rem' }}>{formatSoles(group.totalPaid)}</span>
                                </div>
                                <div>
                                  <span style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: '700' }}>SALDO PENDIENTE: </span>
                                  <span style={{ fontWeight: '900', color: group.totalBalance > 0 ? '#fbbf24' : '#94a3b8', fontSize: '0.86rem' }}>{formatSoles(group.totalBalance)}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {group.items.map((row) => {
                      const isAnulado = row.payment_status === 'ANULADO' || row.status === 'ANULADO' || row.order_status === 'ANULADO';
                      const isFullyPaid = !isAnulado && (row.payment_status === 'CANCELADO' || (row.balance_due <= 0 && row.total_amount > 0));

                      let rowStyle = { borderBottom: '1px solid #1e293b', transition: 'background-color 0.2s' };
                      if (isAnulado) {
                        rowStyle.backgroundColor = 'rgba(239, 68, 68, 0.18)';
                      } else if (isFullyPaid) {
                        rowStyle.backgroundColor = 'rgba(16, 185, 129, 0.12)';
                      }

                      return (
                        <tr key={row.id} style={rowStyle}>
                          {/* 1. FECHA CONTRATO */}
                          <td style={{
                            textAlign: 'center',
                            fontWeight: '700',
                            color: isAnulado ? '#f87171' : '#94a3b8',
                            textDecoration: isAnulado ? 'line-through' : 'none'
                          }}>
                            {row.date || '-'}
                          </td>

                          {/* 2. N° CONT */}
                          <td style={{
                            textAlign: 'center',
                            fontWeight: '900',
                            color: '#ffffff',
                            backgroundColor: isAnulado ? '#dc2626' : (isFullyPaid ? '#059669' : '#0284c7'),
                            borderRadius: '4px',
                            padding: '0.35rem',
                            boxShadow: isAnulado ? '0 0 10px rgba(220, 38, 38, 0.55)' : 'none',
                            transition: 'background-color 0.2s ease'
                          }}>
                            {row.contract_code}
                          </td>

                          {/* 3. VEND. */}
                          <td style={{
                            fontWeight: '800',
                            color: isAnulado ? '#f87171' : '#38bdf8',
                            textDecoration: isAnulado ? 'line-through' : 'none'
                          }}>
                            {row.vendedor_name || 'Vendedora'}
                          </td>

                          {/* 4. CLIENTE */}
                          <td style={{
                            fontWeight: '700',
                            color: isAnulado ? '#fca5a5' : '#ffffff',
                            textDecoration: isAnulado ? 'line-through' : 'none'
                          }}>
                            {row.client_name}
                          </td>

                          {/* 5. CANT. */}
                          <td style={{
                            textAlign: 'center',
                            fontWeight: '800',
                            color: isAnulado ? '#f87171' : '#ffffff',
                            textDecoration: isAnulado ? 'line-through' : 'none'
                          }}>
                            {row.items && Array.isArray(row.items) && row.items.length > 1 ? (
                              <span title={row.items.map(it => `${it.quantity || 1}x ${it.description || ''}`).join(' | ')}>
                                {row.quantity || row.items.reduce((acc, it) => acc + (parseInt(it.quantity) || 1), 0)}
                              </span>
                            ) : (
                              row.quantity || '1'
                            )}
                          </td>

                          {/* 6. DESCRIPCION */}
                          <td style={{
                            fontWeight: '600',
                            color: isAnulado ? '#fca5a5' : '#e2e8f0',
                            minWidth: '180px',
                            textDecoration: isAnulado ? 'line-through' : 'none'
                          }}>
                            {row.items && Array.isArray(row.items) && row.items.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                {row.items.map((it, idx) => (
                                  <div key={idx} style={{ fontSize: '0.8rem', whiteSpace: 'normal', lineHeight: '1.25' }}>
                                    <span style={{ fontWeight: '800', color: isAnulado ? '#f87171' : '#38bdf8' }}>{it.quantity || 1}x</span> {it.description}
                                    {parseFloat(it.amount) > 0 ? (
                                      <span style={{ color: isAnulado ? '#ef4444' : '#94a3b8', fontSize: '0.75rem', marginLeft: '4px' }}>
                                        ({formatSoles(it.amount)})
                                      </span>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              row.description
                            )}
                          </td>

                          {/* 7. TOTAL */}
                          <td style={{
                            textAlign: 'right',
                            fontWeight: '900',
                            color: isAnulado ? '#ef4444' : '#ffffff',
                            textDecoration: isAnulado ? 'line-through' : 'none',
                            fontSize: isAnulado ? '0.92rem' : 'inherit'
                          }}>
                            {isAnulado ? 'S/ 0.00' : formatSoles(row.total_amount)}
                          </td>

                          {/* 8. ESTADO DEL PEDIDO (SELECT INTERACTIVO O BADGE ROJO ANULADO) */}
                          <td style={{ textAlign: 'center', padding: '0.35rem 0.4rem' }}>
                            {isAnulado ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                  backgroundColor: 'rgba(239, 68, 68, 0.25)',
                                  color: '#f87171',
                                  border: '1.5px solid #ef4444',
                                  padding: '0.28rem 0.65rem',
                                  borderRadius: '6px',
                                  fontSize: '0.74rem',
                                  fontWeight: '900',
                                  textDecoration: 'line-through',
                                  letterSpacing: '0.5px',
                                  boxShadow: '0 0 8px rgba(239, 68, 68, 0.3)'
                                }}
                                title="Pedido Anulado"
                              >
                                🚫 ANULADO
                              </span>
                            ) : (
                              <select
                                className="form-select"
                                disabled={readOnly}
                                value={
                                  row.order_status === 'ENTREGADO' || row.order_status === 'ENTREGADO / CANCELADO'
                                    ? 'ENTREGADO / CANCELADO'
                                    : row.order_status === 'PEDIDO EN TIENDA' || row.order_status === 'CANCELADO (POR ENTREGAR)'
                                    ? 'PEDIDO EN TIENDA'
                                    : 'PRODUCCION'
                                }
                                onChange={(e) => handleOrderStatusChange(row.id, e.target.value)}
                                style={{
                                  width: 'auto',
                                  padding: '0.3rem 0.55rem',
                                  fontSize: '0.74rem',
                                  fontWeight: '900',
                                  borderRadius: '6px',
                                  cursor: readOnly ? 'default' : 'pointer',
                                  border: '1.5px solid',
                                  backgroundColor:
                                    (row.order_status === 'ENTREGADO / CANCELADO' || row.order_status === 'ENTREGADO')
                                      ? 'rgba(16, 185, 129, 0.2)'
                                      : (row.order_status === 'PEDIDO EN TIENDA' || row.order_status === 'CANCELADO (POR ENTREGAR)')
                                      ? 'rgba(245, 158, 11, 0.2)'
                                      : 'rgba(2, 132, 199, 0.2)',
                                  color:
                                    (row.order_status === 'ENTREGADO / CANCELADO' || row.order_status === 'ENTREGADO')
                                      ? '#34d399'
                                      : (row.order_status === 'PEDIDO EN TIENDA' || row.order_status === 'CANCELADO (POR ENTREGAR)')
                                      ? '#fbbf24'
                                      : '#38bdf8',
                                  borderColor:
                                    (row.order_status === 'ENTREGADO / CANCELADO' || row.order_status === 'ENTREGADO')
                                      ? '#10b981'
                                      : (row.order_status === 'PEDIDO EN TIENDA' || row.order_status === 'CANCELADO (POR ENTREGAR)')
                                      ? '#f59e0b'
                                      : '#0284c7'
                                }}
                              >
                                <option value="PRODUCCION" style={{ backgroundColor: '#0f172a', color: '#38bdf8' }}>⚙️ PRODUCCION</option>
                                <option value="PEDIDO EN TIENDA" style={{ backgroundColor: '#0f172a', color: '#fbbf24' }}>🏬 PEDIDO EN TIENDA</option>
                                <option value="ENTREGADO / CANCELADO" style={{ backgroundColor: '#0f172a', color: '#34d399' }}>✅ ENTREGADO / CANCELADO</option>
                              </select>
                            )}
                          </td>

                          {/* 9. TOTAL / A. CTA. (Muestra S/ 0.00 tachado en rojo si está anulado) */}
                          <td style={{ textAlign: 'right', fontWeight: '800' }}>
                            {isAnulado ? (
                              <div>
                                <div style={{ color: '#ef4444', textDecoration: 'line-through', fontWeight: '900', fontSize: '0.92rem' }}>
                                  S/ 0.00
                                </div>
                                {row.total_paid > 0 && (
                                  <div style={{ fontSize: '0.68rem', color: '#f87171', textDecoration: 'line-through', opacity: 0.85, marginTop: '2px' }}>
                                    (Antes {formatSoles(row.total_paid)})
                                  </div>
                                )}
                              </div>
                            ) : (
                              <>
                                <div style={{ color: '#34d399' }}>{formatSoles(row.total_paid)}</div>
                                {row.payments && row.payments.length > 1 && (
                                  <div style={{ marginTop: '2px' }}>
                                    <span
                                      title={row.payments.map((p, i) => `Abono ${i + 1}: ${formatSoles(p.amount)} (${formatToYMD(p.payment_date) || '-'} - ${p.payment_type || 'EFECTIVO'})`).join('\n')}
                                      style={{
                                        display: 'inline-block',
                                        fontSize: '0.67rem',
                                        backgroundColor: 'rgba(56, 189, 248, 0.15)',
                                        color: '#38bdf8',
                                        border: '1px solid #0284c7',
                                        borderRadius: '4px',
                                        padding: '1px 5px',
                                        cursor: 'help'
                                      }}
                                    >
                                      📌 {row.payments.length} abonos
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                          </td>

                          {/* 10. SALDO */}
                          <td style={{
                            textAlign: 'right',
                            fontWeight: '900',
                            color: isAnulado ? '#ef4444' : (row.balance_due > 0 ? '#fbbf24' : '#34d399'),
                            textDecoration: isAnulado ? 'line-through' : 'none',
                            fontSize: isAnulado ? '0.92rem' : 'inherit'
                          }}>
                            {isAnulado ? 'S/ 0.00' : formatSoles(row.balance_due)}
                          </td>

                          {/* 11. ESTADO DEL PAGO */}
                          <td style={{ textAlign: 'center' }}>
                            {isAnulado ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  backgroundColor: 'rgba(239, 68, 68, 0.25)',
                                  color: '#f87171',
                                  border: '1.5px solid #ef4444',
                                  padding: '0.22rem 0.6rem',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: '900',
                                  letterSpacing: '0.5px'
                                }}
                              >
                                ANULADO
                              </span>
                            ) : isFullyPaid ? (
                              <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.25)', color: '#34d399', border: '1px solid #10b981', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '900' }}>
                                CANCELADO
                              </span>
                            ) : (row.payment_status === 'SIN PAGO' || row.total_paid <= 0) ? (
                              <span style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1.5px solid #ef4444', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '900' }}>
                                ⚪ SIN PAGO
                              </span>
                            ) : (
                              <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.25)', color: '#fbbf24', border: '1px solid #f59e0b', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '900' }}>
                                PENDIENTE SALDO
                              </span>
                            )}
                          </td>

                          {/* 12. MEDIO DE PAGO */}
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              backgroundColor: isAnulado ? 'rgba(239, 68, 68, 0.15)' : '#1e293b',
                              border: isAnulado ? '1px solid #ef4444' : '1px solid #334155',
                              color: isAnulado ? '#f87171' : '#c084fc',
                              textDecoration: isAnulado ? 'line-through' : 'none',
                              padding: '0.25rem 0.65rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: '800',
                              display: 'inline-block'
                            }}>
                              💳 {row.payment_type_display}
                            </span>
                          </td>

                          {/* 13. FECHA CANCELACIÓN (Saldo S/ 0.00) */}
                          <td style={{ textAlign: 'center', fontSize: '0.78rem' }}>
                            {isAnulado ? (
                              <span style={{ color: '#ef4444', fontWeight: '800', textDecoration: 'line-through', opacity: 0.85 }}>
                                🚫 Anulado
                              </span>
                            ) : isFullyPaid && (row.cancellation_date || row.payment_date) ? (
                              <span style={{ color: '#34d399', fontWeight: '800', backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: '0.2rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                ✅ {row.cancellation_date || row.payment_date}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.74rem' }}>
                                ⏳ Pendiente
                              </span>
                            )}
                          </td>

                          {/* 14. FECHA ENTREGA FÍSICA */}
                          <td style={{ textAlign: 'center', fontSize: '0.78rem' }}>
                            {isAnulado ? (
                              <span style={{ color: '#ef4444', fontWeight: '800', textDecoration: 'line-through', opacity: 0.85 }}>
                                - Anulado -
                              </span>
                            ) : (row.order_status === 'ENTREGADO / CANCELADO' || row.order_status === 'ENTREGADO') ? (
                              <span style={{ color: '#38bdf8', fontWeight: '800', backgroundColor: 'rgba(56, 189, 248, 0.15)', padding: '0.2rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                                📦 {row.delivery_date || row.cancellation_date || row.payment_date || row.date}
                              </span>
                            ) : (
                              <span style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.74rem' }}>
                                - Por entregar -
                              </span>
                            )}
                          </td>

                          {/* 15. OBSERVACION / OCURRENCIAS */}
                          <td style={{
                            color: isAnulado ? '#f87171' : (row.observations ? '#fbbf24' : '#64748b'),
                            fontStyle: row.observations ? 'normal' : 'italic',
                            textDecoration: isAnulado ? 'line-through' : 'none'
                          }}>
                            {row.observations || (isAnulado ? '🚫 Contrato Anulado' : '- Sin observaciones -')}
                          </td>

                          {/* 16. ACCIONES: EDITAR, CANCELADO, BORRAR */}
                          {!readOnly && (
                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '0.35rem 0.5rem' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                {/* Botón Editar */}
                                <button
                                  type="button"
                                  onClick={() => openEditModal(row)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '0.25rem 0.45rem', backgroundColor: '#1e293b', borderColor: '#38bdf8' }}
                                  title="Editar datos del contrato"
                                >
                                  <Edit3 size={14} color="#38bdf8" />
                                </button>

                                {/* Botón Cancelado o Revertir Liquidación (Autorregresar) */}
                                {!isAnulado && (
                                  isFullyPaid ? (
                                    <button
                                      type="button"
                                      onClick={() => handleRevertLiquidation(row)}
                                      className="btn btn-secondary btn-sm"
                                      style={{
                                        padding: '0.25rem 0.45rem',
                                        backgroundColor: 'rgba(245, 158, 11, 0.2)',
                                        borderColor: '#f59e0b',
                                        color: '#fbbf24'
                                      }}
                                      title="Regresar / Revertir a PENDIENTE (Deshacer liquidación y restaurar saldo)"
                                    >
                                      <RotateCcw size={14} color="#fbbf24" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleLiquidateContract(row)}
                                      className="btn btn-secondary btn-sm"
                                      style={{
                                        padding: '0.25rem 0.45rem',
                                        backgroundColor: '#1e293b',
                                        borderColor: '#10b981',
                                        color: '#10b981'
                                      }}
                                      title="Marcar como CANCELADO (Liquidar saldo a S/ 0)"
                                    >
                                      <CheckCircle2 size={14} color="#10b981" />
                                    </button>
                                  )
                                )}

                                {/* Botón Anular / Reactivar */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleAnular(row)}
                                  className="btn btn-secondary btn-sm"
                                  style={{
                                    padding: '0.25rem 0.45rem',
                                    backgroundColor: isAnulado ? 'rgba(56, 189, 248, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                    borderColor: isAnulado ? '#38bdf8' : '#ef4444',
                                    color: isAnulado ? '#38bdf8' : '#ef4444'
                                  }}
                                  title={isAnulado ? 'Reactivar Contrato (Deshacer anulación)' : 'Anular Contrato'}
                                >
                                  <Ban size={14} color={isAnulado ? '#38bdf8' : '#ef4444'} />
                                </button>

                                {/* Botón Borrar */}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteContract(row)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '0.25rem 0.45rem', backgroundColor: '#1e293b', borderColor: '#ef4444' }}
                                  title="Eliminar contrato permanentemente"
                                >
                                  <Trash2 size={14} color="#ef4444" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))
              )}
                </tbody>

                {/* Footers with Totals */}
                {contracts.length > 0 && (
                  <tfoot>
                    <tr style={{ backgroundColor: '#0f172a', fontWeight: '900', borderTop: '2px solid #38bdf8' }}>
                      <td colSpan="6" style={{ textAlign: 'right', padding: '0.75rem', color: '#38bdf8', fontSize: '0.9rem' }}>
                        TOTALES DE {MONTH_NAMES[selectedMonth]}:
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.75rem', color: '#ffffff', fontSize: '0.95rem' }}>
                        {formatSoles(listTotals.totalAmount)}
                      </td>
                      <td></td>
                      <td style={{ textAlign: 'right', padding: '0.75rem', color: '#34d399', fontSize: '0.95rem' }}>
                        {formatSoles(listTotals.totalPaid)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.75rem', color: '#fbbf24', fontSize: '0.95rem' }}>
                        {formatSoles(listTotals.balanceDue)}
                      </td>
                      <td colSpan={readOnly ? 4 : 5}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* 4. SUB-TAB 2: REPORTE MENSUAL */}
      {!loading && !error && activeSubTab === 'monthly_report' && monthlyReport && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Summary Cards */}
          <div className="grid-4">
            <div className="card" style={{ borderLeft: '4px solid #38bdf8' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
                N° de Contratos ({monthlyReport.month_label})
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#f8fafc', marginTop: '0.2rem' }}>
                {monthlyReport.summary.total_contracts}
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #0284c7' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
                Monto Total Facturado
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#38bdf8', marginTop: '0.2rem' }}>
                {formatSoles(monthlyReport.summary.total_contract_value)}
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
                Total Recaudado / Cobrado
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#34d399', marginTop: '0.2rem' }}>
                {formatSoles(monthlyReport.summary.total_collected)}
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
                % Cumplimiento de Cobro
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#fbbf24', marginTop: '0.2rem' }}>
                {monthlyReport.summary.payment_rate}%
              </div>
            </div>
          </div>

          <div className="grid-2">
            {/* Section A: Medios de Pago Breakdown */}
            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <CreditCard size={18} color="#c084fc" /> Recaudación por Medio de Pago
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {Object.keys(monthlyReport.by_payment_method).length === 0 ? (
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Sin transacciones en este mes.</p>
                ) : (
                  Object.entries(monthlyReport.by_payment_method).map(([method, data]) => {
                    const pct = monthlyReport.summary.total_collected > 0
                      ? ((data.total / monthlyReport.summary.total_collected) * 100).toFixed(1)
                      : 0;

                    return (
                      <div key={method} style={{ backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '8px', border: '1px solid #1e293b' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: '800', color: '#c084fc', fontSize: '0.85rem' }}>
                            💳 {method}
                          </span>
                          <span style={{ fontWeight: '900', color: '#34d399', fontSize: '0.9rem' }}>
                            {formatSoles(data.total)} ({pct}%)
                          </span>
                        </div>
                        <div style={{ height: '6px', backgroundColor: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#c084fc', borderRadius: '3px' }}></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Section B: Estado de Pedidos Breakdown */}
            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Package size={18} color="#38bdf8" /> Estado Operativo de Pedidos
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {Object.entries(monthlyReport.by_order_status).map(([status, count]) => {
                  let badgeBg = '#0284c7';
                  let badgeText = '#ffffff';
                  if (status === 'ENTREGADO') { badgeBg = '#10b981'; }
                  else if (status === 'CANCELADO (POR ENTREGAR)') { badgeBg = '#f59e0b'; badgeText = '#000000'; }
                  else if (status === 'ANULADO') { badgeBg = '#ef4444'; }

                  return (
                    <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '8px', border: '1px solid #1e293b' }}>
                      <span className="badge" style={{ backgroundColor: badgeBg, color: badgeText, fontWeight: '900', fontSize: '0.78rem' }}>
                        {status}
                      </span>
                      <span style={{ fontWeight: '900', color: '#ffffff', fontSize: '1.1rem' }}>
                        {count} {count === 1 ? 'Contrato' : 'Contratos'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section C: Breakdown por Vendedor */}
          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <UserCheck size={18} color="#34d399" /> Rendimiento de Vendedores ({monthlyReport.month_label})
            </h3>
            <div className="table-container" style={{ border: '1px solid #1e293b' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>VENDEDOR / VENDEDORA</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>CONTRATOS</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>TOTAL CONTRATADO</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>TOTAL RECAUDADO</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>SALDO PENDIENTE</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(monthlyReport.by_vendedor).length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>
                        Sin datos de vendedores este mes.
                      </td>
                    </tr>
                  ) : (
                    Object.entries(monthlyReport.by_vendedor).map(([vName, vData]) => (
                      <tr key={vName} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ fontWeight: '800', color: '#38bdf8', padding: '0.75rem' }}>{vName}</td>
                        <td style={{ textAlign: 'center', fontWeight: '800', color: '#ffffff', padding: '0.75rem' }}>{vData.count}</td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: '#ffffff', padding: '0.75rem' }}>{formatSoles(vData.total_amount)}</td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: '#34d399', padding: '0.75rem' }}>{formatSoles(vData.total_paid)}</td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: vData.balance_due > 0 ? '#fbbf24' : '#34d399', padding: '0.75rem' }}>{formatSoles(vData.balance_due)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. SUB-TAB 3: REPORTE ANUAL */}
      {!loading && !error && activeSubTab === 'annual_report' && annualReport && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Annual KPI Cards */}
          <div className="grid-4">
            <div className="card" style={{ borderLeft: '4px solid #38bdf8' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
                Total Contratos Año {annualReport.year}
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#f8fafc', marginTop: '0.2rem' }}>
                {annualReport.annualSummary.total_contracts}
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #0284c7' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
                Monto Total Facturado Anual
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#38bdf8', marginTop: '0.2rem' }}>
                {formatSoles(annualReport.annualSummary.total_amount)}
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
                Total Recaudado Año {annualReport.year}
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#34d399', marginTop: '0.2rem' }}>
                {formatSoles(annualReport.annualSummary.total_collected)}
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
                Saldo Pendiente Anual
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#fbbf24', marginTop: '0.2rem' }}>
                {formatSoles(annualReport.annualSummary.total_pending)}
              </div>
            </div>
          </div>

          {/* 12-Month Comparative Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1.5px solid #1e293b' }}>
            <div style={{ padding: '1rem 1.25rem', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '900', color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingUp size={20} /> Comparative Mes a Mes del Año {annualReport.year}
              </h3>
            </div>

            <div className="table-container" style={{ border: 'none' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>MES</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>N° CONTRATOS</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>TOTAL CONTRATADO</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>RECAUDADO / A CTA.</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>SALDO PENDIENTE</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>% CUMPLIMIENTO</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {annualReport.monthlyBreakdown.map((m) => {
                    const isSelected = m.month_index === selectedMonth;
                    return (
                      <tr
                        key={m.month_index}
                        style={{
                          borderBottom: '1px solid #1e293b',
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                          transition: 'background-color 0.2s'
                        }}
                      >
                        <td style={{ fontWeight: '900', color: isSelected ? '#38bdf8' : '#ffffff', padding: '0.75rem 1rem' }}>
                          {m.month_name.toUpperCase()} {isSelected && <span style={{ fontSize: '0.72rem', backgroundColor: '#0284c7', color: '#fff', padding: '0.15rem 0.4rem', borderRadius: '4px', marginLeft: '0.4rem' }}>ACTUAL</span>}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: '800', color: '#ffffff', padding: '0.75rem 1rem' }}>
                          {m.total_contracts}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: '#ffffff', padding: '0.75rem 1rem' }}>
                          {formatSoles(m.total_amount)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: '#34d399', padding: '0.75rem 1rem' }}>
                          {formatSoles(m.total_collected)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: m.total_pending > 0 ? '#fbbf24' : '#34d399', padding: '0.75rem 1rem' }}>
                          {formatSoles(m.total_pending)}
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.75rem 1rem' }}>
                          <span style={{ fontWeight: '900', color: m.payment_rate >= 80 ? '#34d399' : m.payment_rate >= 50 ? '#fbbf24' : '#f87171' }}>
                            {m.payment_rate}%
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.75rem 1rem' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMonth(m.month_index);
                              setActiveSubTab('list');
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', fontWeight: '800' }}
                          >
                            Ver Lista
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr style={{ backgroundColor: '#0f172a', fontWeight: '900', borderTop: '2px solid #38bdf8' }}>
                    <td style={{ padding: '0.85rem 1rem', color: '#38bdf8', fontSize: '0.9rem' }}>
                      TOTAL ANUAL {annualReport.year}:
                    </td>
                    <td style={{ textAlign: 'center', padding: '0.85rem 1rem', color: '#ffffff', fontSize: '0.95rem' }}>
                      {annualReport.annualSummary.total_contracts}
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.85rem 1rem', color: '#ffffff', fontSize: '0.95rem' }}>
                      {formatSoles(annualReport.annualSummary.total_amount)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.85rem 1rem', color: '#34d399', fontSize: '0.95rem' }}>
                      {formatSoles(annualReport.annualSummary.total_collected)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.85rem 1rem', color: '#fbbf24', fontSize: '0.95rem' }}>
                      {formatSoles(annualReport.annualSummary.total_pending)}
                    </td>
                    <td style={{ textAlign: 'center', padding: '0.85rem 1rem', color: '#34d399', fontSize: '0.95rem' }}>
                      {annualReport.annualSummary.payment_rate}%
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL PARA AGREGAR O EDITAR CONTRATO EN BALANCE GLOBAL */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#0f172a', border: '2px solid #38bdf8', boxShadow: '0 20px 50px rgba(0,0,0,0.85)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Layers size={22} />
                  {editingContract ? `Editar Contrato N° ${editingContract.contract_code}` : 'Agregar Nuevo Registro a Balance Global'}
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Registro y fiel detalle de contrato con múltiples productos o servicios
                </span>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveContract} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* N° Contrato y Fecha */}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '800', color: '#38bdf8' }}>
                    1. N° de Contrato:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 205"
                    className="form-input"
                    style={{ fontWeight: '900', fontSize: '1rem', color: '#ffffff', borderColor: '#38bdf8' }}
                    value={formContractNum}
                    onChange={(e) => handleContractCodeChange(e.target.value)}
                    required
                  />
                  {isLookingUp && <span style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '0.2rem' }}>Buscando sincronización...</span>}
                  {lookupFeedback && (
                    <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', fontWeight: '700', color: lookupFeedback.type === 'found' ? '#34d399' : '#38bdf8' }}>
                      {lookupFeedback.msg}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>
                    Fecha del Contrato / Registro:
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ fontWeight: '700', color: '#ffffff' }}
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Vendedor y Cliente */}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>
                    2. Vendedor / Vendedora:
                  </label>
                  <select
                    className="form-select"
                    value={formVendedor}
                    onChange={(e) => handleSellerSelect(e.target.value, setFormVendedor)}
                    style={{ color: formVendedor ? '#38bdf8' : '#94a3b8', fontWeight: formVendedor ? '700' : 'normal' }}
                  >
                    <option value="">(Seleccione Vendedor/a)</option>
                    {sellersList.map((s, idx) => (
                      <option key={idx} value={s}>{s}</option>
                    ))}
                    <option value="__NEW__" style={{ color: '#38bdf8', fontWeight: 'bold' }}>+ Agregar nuevo...</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>
                    3. Nombre de Cliente:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Empresa Fincagraf / Juan Pérez"
                    className="form-input"
                    value={formClient}
                    onChange={(e) => setFormClient(e.target.value)}
                  />
                </div>
              </div>

              {/* 4. SECCIÓN ÍTEMS DEL CONTRATO (DETALLE FIEL DE PRODUCTOS / SERVICIOS) */}
              <div style={{ backgroundColor: '#1e293b', padding: '0.85rem', borderRadius: '8px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontWeight: '800', color: '#38bdf8', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                    <Package size={17} /> 4. Ítems del Contrato (Productos o Servicios):
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#38bdf8', backgroundColor: '#0f172a', padding: '0.2rem 0.55rem', borderRadius: '4px', border: '1px solid #334155' }}>
                    {formItems.length} {formItems.length === 1 ? 'producto / servicio' : 'productos / servicios'}
                  </span>
                </div>

                {/* Encabezado de columnas de ítems */}
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.74rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', paddingLeft: '2px' }}>
                  <div style={{ width: '80px', textAlign: 'center' }}>Cant.</div>
                  <div style={{ flex: 1 }}>Descripción del Trabajo / Producto / Servicio</div>
                  <div style={{ width: '120px', textAlign: 'right' }}>Monto (S/)</div>
                  {formItems.length > 1 && <div style={{ width: '36px' }}></div>}
                </div>

                {/* Lista de filas de ítems */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {formItems.map((item, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {/* Cantidad */}
                      <div style={{ width: '80px' }}>
                        <input
                          type="text"
                          placeholder="Ej: 100"
                          className="form-input"
                          style={{ textAlign: 'center', padding: '0.45rem', fontSize: '0.85rem', fontWeight: '700' }}
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                          title="Cantidad del producto o servicio"
                        />
                      </div>

                      {/* Descripción */}
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          placeholder={`Ítem #${index + 1}: Ej. Polos sublimados 100% algodón / Tarjetas personales`}
                          className="form-input"
                          style={{ padding: '0.45rem 0.65rem', fontSize: '0.85rem' }}
                          value={item.description}
                          onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        />
                      </div>

                      {/* Subtotal del ítem */}
                      <div style={{ width: '120px' }}>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Ej: 150.00"
                          className="form-input"
                          style={{ textAlign: 'right', padding: '0.45rem 0.65rem', fontSize: '0.85rem', fontWeight: '700' }}
                          value={item.amount}
                          onChange={(e) => handleItemChange(index, 'amount', e.target.value)}
                          title="Monto o subtotal de este ítem (S/)"
                        />
                      </div>

                      {/* Botón eliminar ítem */}
                      {formItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.45rem', border: '1px solid #ef4444', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}
                          title="Quitar este ítem"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Botón agregar ítem + Total suma rápida */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem', paddingTop: '0.4rem', borderTop: '1px dashed #334155' }}>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.78rem', fontWeight: '800', color: '#38bdf8', borderColor: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <Plus size={15} /> + Agregar otro ítem / producto
                  </button>

                  <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                    Suma total de ítems: <strong style={{ color: '#34d399', fontSize: '0.9rem' }}>{formatSoles(itemsSumTotal)}</strong>
                  </span>
                </div>
              </div>

              {/* Montos y Adelantos */}
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>
                    5. Monto Total (S/):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ej: 240.00"
                    className="form-input"
                    style={{ fontWeight: '900', color: '#38bdf8' }}
                    value={formTotal}
                    onChange={(e) => setFormTotal(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>
                    6. Primer Adelanto (S/):
                  </label>
                  {editingContract ? (
                    <div>
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        style={{ fontWeight: '900', color: '#94a3b8', fontSize: '0.95rem', backgroundColor: '#0f172a', borderColor: '#334155', cursor: 'not-allowed' }}
                        value={formInitialPay}
                        readOnly
                        disabled
                        title="Primer adelanto registrado al crear el contrato (inmutable)"
                      />
                      <span style={{ fontSize: '0.72rem', color: '#38bdf8', marginTop: '0.25rem', display: 'block' }}>
                        🔒 Primer adelanto estático. Para registrar abonos adicionales, usa el módulo de Abonos abajo.
                      </span>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Ej: 80.00"
                        className="form-input"
                        style={{ fontWeight: '900', color: '#34d399', fontSize: '0.95rem', borderColor: '#34d399' }}
                        value={formInitialPay}
                        onChange={(e) => handleInitialPayChange(e.target.value)}
                        title="Primer adelanto o monto pagado al crear el contrato"
                      />
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem', display: 'block' }}>
                        💡 Si el cliente aún no depositó nada, ingresa 0.00
                      </span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>
                    Saldo por Cobrar (S/):
                  </label>
                  {(() => {
                    const abonosSum = contractPaymentsList.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
                    const initialDeposit = parseFloat(formInitialPay) || 0;
                    const totalPaidAccum = contractPaymentsList.length > 0 ? abonosSum : initialDeposit;
                    const numericTotal = parseFloat(formTotal || 0);
                    const pendingSaldo = Math.max(0, numericTotal - totalPaidAccum);
                    const isFullyPaid = pendingSaldo <= 0 && numericTotal > 0;
                    return (
                      <div style={{ padding: '0.55rem', borderRadius: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', fontWeight: '900', color: isFullyPaid ? '#34d399' : '#fbbf24', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{formatSoles(pendingSaldo)}</span>
                        {isFullyPaid && (
                          <span style={{ fontSize: '0.74rem', backgroundColor: 'rgba(16, 185, 129, 0.25)', color: '#34d399', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #10b981' }}>
                            ✓ CANCELADO
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* SECCIÓN HISTORIAL Y REGISTRO DE ADELANTOS / ABONOS (Punto 3) */}
              {editingContract && (
                <div style={{ backgroundColor: '#1e293b', padding: '0.9rem', borderRadius: '8px', border: '1.5px solid #0284c7', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '800', color: '#38bdf8', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Calendar size={17} /> Historial de Adelantos y Pagos Registrados:
                    </span>
                    {(() => {
                      const abonosSum = contractPaymentsList.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
                      const initialDeposit = parseFloat(formInitialPay) || 0;
                      const totalPaidAccum = contractPaymentsList.length > 0 ? abonosSum : initialDeposit;
                      return (
                        <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                          Pagos registrados: <strong style={{ color: '#38bdf8', fontSize: '0.9rem' }}>
                            {formatSoles(abonosSum)}
                          </strong> | Total Pagado: <strong style={{ color: '#34d399', fontSize: '0.9rem' }}>
                            {formatSoles(totalPaidAccum)}
                          </strong>
                        </span>
                      );
                    })()}
                  </div>

                  {/* Tabla / Lista de Abonos */}
                  {contractPaymentsList.length === 0 ? (
                    <div style={{ padding: '0.75rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
                      No hay abonos registrados para este contrato.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', maxHeight: '180px', border: '1px solid #334155', borderRadius: '6px' }}>
                      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', backgroundColor: '#0f172a' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#1e293b', color: '#94a3b8', textAlign: 'left', borderBottom: '1px solid #334155' }}>
                            <th style={{ padding: '0.45rem 0.65rem' }}>Fecha</th>
                            <th style={{ padding: '0.45rem 0.65rem' }}>Monto</th>
                            <th style={{ padding: '0.45rem 0.65rem' }}>Medio</th>
                            <th style={{ padding: '0.45rem 0.65rem' }}>Nota / Ocurrencia</th>
                            <th style={{ padding: '0.45rem 0.65rem', textAlign: 'center', width: '60px' }}>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contractPaymentsList.map((p, idx) => (
                            <tr key={p.id || idx} style={{ borderBottom: '1px solid #1e293b' }}>
                              <td style={{ padding: '0.45rem 0.65rem', color: '#f8fafc', fontWeight: '700' }}>
                                {formatToYMD(p.payment_date) || p.payment_date || '-'}
                              </td>
                              <td style={{ padding: '0.45rem 0.65rem', color: '#34d399', fontWeight: '900' }}>
                                {formatSoles(p.amount || 0)}
                              </td>
                              <td style={{ padding: '0.45rem 0.65rem', color: '#38bdf8' }}>
                                {p.payment_type || 'EFECTIVO'}
                              </td>
                              <td style={{ padding: '0.45rem 0.65rem', color: '#cbd5e1' }}>
                                {p.notes || '-'}
                              </td>
                              <td style={{ padding: '0.45rem 0.65rem', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePayment(p.id)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '0.25rem 0.45rem', border: '1px solid #ef4444', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}
                                  title="Eliminar este abono"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Formulario para agregar nuevo adelanto o abono con fecha */}
                  <div style={{ backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '6px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#38bdf8', marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Plus size={15} /> REGISTRAR NUEVO ADELANTO O ABONO (CON FECHA EXACTA):
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Fecha de abono:</span>
                        <input
                          type="date"
                          className="form-input"
                          style={{ width: '140px', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                          value={newPayDate}
                          onChange={(e) => setNewPayDate(e.target.value)}
                          title="Fecha en la que el cliente entregó el dinero"
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Monto a cuenta:</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Ej: 350.00"
                          className="form-input"
                          style={{ width: '115px', padding: '0.35rem 0.5rem', fontSize: '0.8rem', fontWeight: '800' }}
                          value={newPayAmount}
                          onChange={(e) => setNewPayAmount(e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Medio de pago:</span>
                        <select
                          className="form-select"
                          style={{ width: '125px', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                          value={newPayType}
                          onChange={(e) => setNewPayType(e.target.value)}
                        >
                          <option value="EFECTIVO">💵 EFECTIVO</option>
                          <option value="YAPE">📱 YAPE</option>
                          <option value="TRANSFERENCIA">🏦 TRANSF.</option>
                          <option value="POS">💳 POS</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, minWidth: '140px' }}>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Nota / Ocurrencia (opcional):</span>
                        <input
                          type="text"
                          placeholder="Ej: 2do adelanto entregado en tienda"
                          className="form-input"
                          style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                          value={newPayNotes}
                          onChange={(e) => setNewPayNotes(e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', paddingTop: '1rem' }}>
                        <button
                          type="button"
                          onClick={handleAddPayment}
                          disabled={addingPayment || !newPayAmount || parseFloat(newPayAmount) <= 0}
                          className="btn btn-primary btn-sm"
                          style={{ padding: '0.45rem 0.85rem', fontWeight: '900', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                        >
                          {addingPayment ? 'Guardando...' : '+ Guardar Abono'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Si es nuevo contrato, permitir seleccionar Medio de Pago del Adelanto Inicial */}
              {!editingContract && (
                <div className="form-group" style={{ maxWidth: '300px' }}>
                  <label className="form-label" style={{ fontWeight: '800', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CreditCard size={16} /> 7. Medio de Pago (Adelanto Inicial):
                  </label>
                  <select
                    className="form-select"
                    value={formPaymentType}
                    onChange={(e) => setFormPaymentType(e.target.value)}
                    style={{ fontWeight: '800', backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#3b82f6' }}
                  >
                    <option value="EFECTIVO">💵 EFECTIVO</option>
                    <option value="YAPE">📱 YAPE</option>
                    <option value="TRANSFERENCIA">🏦 TRANSFERENCIA</option>
                    <option value="POS">💳 POS</option>
                  </select>
                </div>
              )}

              {/* 8. FECHA DE CANCELACIÓN Y FECHA DE ENTREGA (EDITABLES Y VISIBLES) */}
              <div style={{ backgroundColor: '#1e293b', padding: '0.85rem', borderRadius: '8px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Calendar size={16} /> 8. Fechas de Cierre del Contrato (Cancelación y Entrega):
                </span>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '800', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <CheckCircle2 size={15} /> Fecha de Cancelación (Pago al 100%):
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      style={{ fontWeight: '800', color: '#ffffff', borderColor: '#10b981' }}
                      value={formCancellationDate}
                      onChange={(e) => setFormCancellationDate(e.target.value)}
                      title="Fecha exacta en la que se completó el pago total del contrato"
                    />
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem', display: 'block' }}>
                      💡 Sincronizada automáticamente con el último abono registrado ({contractPaymentsList.length > 0 ? (formatToYMD(contractPaymentsList[contractPaymentsList.length - 1].payment_date) || formDate) : formDate}). Puedes editarla si necesitas ajustarla.
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '800', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Package size={15} /> Fecha de Entrega Física:
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      style={{ fontWeight: '800', color: '#ffffff', borderColor: '#38bdf8' }}
                      value={formDeliveryDate}
                      onChange={(e) => setFormDeliveryDate(e.target.value)}
                      title="Fecha en la que el trabajo terminado fue entregado físicamente al cliente"
                    />
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem', display: 'block' }}>
                      💡 Fecha de entrega del trabajo al cliente en tienda o despacho.
                    </span>
                  </div>
                </div>
              </div>

              {/* Observaciones */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>
                  9. Observaciones / Ocurrencias:
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Ej: Entrega pactada para el viernes. Cliente canceló adelanto por Yape."
                  value={formObservations}
                  onChange={(e) => setFormObservations(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-success" style={{ fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Save size={16} /> Guardar Fila en Balance Global
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

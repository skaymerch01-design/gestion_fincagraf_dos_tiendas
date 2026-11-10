import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { formatSoles } from '../utils/format';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Edit3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Landmark,
  Save,
  X,
  PieChart,
  BarChart3,
  Percent
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend
);

const MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

const YEAR_OPTIONS = [2026, 2027, 2028, 2029, 2030];

export default function SunatTab() {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(Math.max(2026, currentDate.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth()); // 0 to 11
  const [activeSubTab, setActiveSubTab] = useState('purchases'); // 'purchases' | 'sales' | 'sunat_payment'

  const [invoices, setInvoices] = useState([]);
  const [annualStats, setAnnualStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal / Form State
  const [showModal, setShowModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);

  const [formType, setFormType] = useState('COMPRA'); // 'COMPRA' or 'VENTA'
  const [formDocNumber, setFormDocNumber] = useState('');
  const [formIssueDate, setFormIssueDate] = useState('');
  const [formEntityName, setFormEntityName] = useState('');
  const [formRucDni, setFormRucDni] = useState('');
  const [formTotal, setFormTotal] = useState('');
  const [formSubtotal, setFormSubtotal] = useState('');
  const [formIgv, setFormIgv] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // Configurable Rates for SUNAT Tax Calculation
  const [rentaRate, setRentaRate] = useState(1.5); // Default 1.5%
  const [igvRate, setIgvRate] = useState(4.0); // Default 4%
  const [editingRenta, setEditingRenta] = useState(false);
  const [editingIgv, setEditingIgv] = useState(false);

  const fetchSunatData = async () => {
    setLoading(true);
    setError(null);
    try {
      const monthStr = String(selectedMonth + 1).padStart(2, '0');
      const periodStr = `${selectedYear}-${monthStr}`;

      const [invoicesRes, statsRes] = await Promise.all([
        apiFetch(`/sunat/invoices?period=${periodStr}`),
        apiFetch(`/sunat/stats?year=${selectedYear}`),
      ]);

      if (invoicesRes.success) setInvoices(invoicesRes.invoices);
      if (statsRes.success) setAnnualStats(statsRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSunatData();
  }, [selectedYear, selectedMonth]);

  const isPastYear = selectedYear < new Date().getFullYear();

  const handlePrevMonth = () => {
    if (selectedYear <= 2026 && selectedMonth === 0) return;
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

  // Auto calculate Subtotal and IGV (18%) when Total is entered
  const handleTotalChange = (val) => {
    setFormTotal(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      const sub = Math.round((num / 1.18) * 100) / 100;
      const igv = Math.round((num - sub) * 100) / 100;
      setFormSubtotal(sub.toFixed(2));
      setFormIgv(igv.toFixed(2));
    } else {
      setFormSubtotal('');
      setFormIgv('');
    }
  };

  const openCreateModal = (typeTarget) => {
    setEditingInvoice(null);
    setFormType(typeTarget);
    setFormDocNumber('');

    const defaultDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    setFormIssueDate(defaultDate);
    setFormEntityName('');
    setFormRucDni('');
    setFormTotal('');
    setFormSubtotal('');
    setFormIgv('');
    setFormNotes('');
    setShowModal(true);
  };

  const openEditModal = (inv) => {
    setEditingInvoice(inv);
    setFormType(inv.type);
    setFormDocNumber(inv.doc_number || '');
    setFormIssueDate((inv.issue_date || '').substring(0, 10));
    setFormEntityName(inv.customer_supplier_name || '');
    setFormRucDni(inv.ruc_dni || '');
    setFormTotal(inv.total ? String(inv.total) : '');
    setFormSubtotal(inv.subtotal ? String(inv.subtotal) : '');
    setFormIgv(inv.igv ? String(inv.igv) : '');
    setFormNotes(inv.notes || '');
    setShowModal(true);
  };

  const handleSaveInvoice = async (e) => {
    e.preventDefault();
    if (!formDocNumber.trim()) return alert('Ingrese el N° de Autorización.');
    if (!formRucDni.trim()) return alert('Ingrese el RUC (11 dígitos).');
    if (formRucDni.length !== 11) return alert('El RUC debe tener exactamente 11 dígitos.');
    if (!formEntityName.trim()) return alert('Ingrese la Razón Social.');

    setSubmitting(true);
    try {
      const activePeriod = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
      const cleanIssueDate = (formIssueDate || '').substring(0, 10);

      if (editingInvoice) {
        await apiFetch(`/sunat/invoices/${editingInvoice.id}`, {
          method: 'PUT',
          body: {
            period: editingInvoice.period || activePeriod,
            type: formType,
            doc_type: 'FACTURA',
            doc_number: formDocNumber,
            issue_date: cleanIssueDate,
            customer_supplier_name: formEntityName,
            ruc_dni: formRucDni,
            total: formTotal,
            notes: formNotes,
          },
        });
      } else {
        await apiFetch('/sunat/invoices', {
          method: 'POST',
          body: {
            period: activePeriod,
            type: formType,
            doc_type: 'FACTURA',
            doc_number: formDocNumber,
            issue_date: cleanIssueDate,
            customer_supplier_name: formEntityName,
            ruc_dni: formRucDni,
            total: formTotal,
            notes: formNotes,
          },
        });
      }

      setShowModal(false);
      fetchSunatData();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este comprobante de la lista?')) return;
    try {
      await apiFetch(`/sunat/invoices/${id}`, { method: 'DELETE' });
      fetchSunatData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Filter Invoices for current month view
  const purchaseInvoices = invoices.filter(inv => inv.type === 'COMPRA');
  const salesInvoices = invoices.filter(inv => inv.type === 'VENTA');

  // Calculate totals for purchases
  const purchaseTotals = purchaseInvoices.reduce((acc, inv) => {
    acc.subtotal += inv.subtotal || 0;
    acc.igv += inv.igv || 0;
    acc.total += inv.total || 0;
    return acc;
  }, { subtotal: 0, igv: 0, total: 0 });

  // Calculate totals for sales
  const salesTotals = salesInvoices.reduce((acc, inv) => {
    acc.subtotal += inv.subtotal || 0;
    acc.igv += inv.igv || 0;
    acc.total += inv.total || 0;
    return acc;
  }, { subtotal: 0, igv: 0, total: 0 });

  // Calculations for Pago SUNAT (Matching user image layout)
  const resultSubtotal = salesTotals.subtotal - purchaseTotals.subtotal;
  const resultIgv = salesTotals.igv - purchaseTotals.igv;
  const resultTotal = salesTotals.total - purchaseTotals.total;

  const rentaAmount = Math.round((salesTotals.total * (rentaRate / 100)) * 100) / 100;
  const igvAmount = Math.round((Math.max(0, resultTotal) * (igvRate / 100)) * 100) / 100;
  const totalSunatPagar = Math.round((rentaAmount + igvAmount) * 100) / 100;

  // Chart Data for Annual Report
  const monthLabelsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
  const chartSales = monthLabelsShort.map((_, idx) => {
    const periodStr = `${selectedYear}-${String(idx + 1).padStart(2, '0')}`;
    const item = annualStats?.monthlyData?.find(d => d.period === periodStr);
    return item ? item.sales_total : 0;
  });
  const chartPurchases = monthLabelsShort.map((_, idx) => {
    const periodStr = `${selectedYear}-${String(idx + 1).padStart(2, '0')}`;
    const item = annualStats?.monthlyData?.find(d => d.period === periodStr);
    return item ? item.purchases_total : 0;
  });
  const chartTaxPagar = monthLabelsShort.map((_, idx) => {
    const periodStr = `${selectedYear}-${String(idx + 1).padStart(2, '0')}`;
    const item = annualStats?.monthlyData?.find(d => d.period === periodStr);
    if (!item) return 0;
    const sTotal = item.sales_total || 0;
    const pTotal = item.purchases_total || 0;
    const rTotal = Math.max(0, sTotal - pTotal);
    const rVal = sTotal * (rentaRate / 100);
    const iVal = rTotal * (igvRate / 100);
    return Math.round((rVal + iVal) * 100) / 100;
  });

  const chartData = {
    labels: monthLabelsShort,
    datasets: [
      {
        type: 'bar',
        label: 'Ventas Totales (S/)',
        backgroundColor: '#10b981',
        data: chartSales,
        borderRadius: 4,
      },
      {
        type: 'bar',
        label: 'Compras Totales (S/)',
        backgroundColor: '#ef4444',
        data: chartPurchases,
        borderRadius: 4,
      },
      {
        type: 'line',
        label: 'Impuesto SUNAT a Pagar (S/)',
        borderColor: '#fbbf24',
        backgroundColor: '#fbbf24',
        borderWidth: 3,
        pointRadius: 5,
        pointBackgroundColor: '#fbbf24',
        data: chartTaxPagar,
      }
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    devicePixelRatio: typeof window !== 'undefined' ? (window.devicePixelRatio || 2) : 2,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#ffffff',
          font: { family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', size: 14, weight: 'bold' },
          padding: 16,
          usePointStyle: true,
          boxWidth: 12,
          boxHeight: 12,
        },
      },
      title: {
        display: true,
        text: `📈 Gráfico Comparativo Anual SUNAT - Año ${selectedYear}`,
        color: '#38bdf8',
        font: { family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', size: 17, weight: '900' },
        padding: { bottom: 15 },
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(15, 23, 42, 0.96)',
        titleColor: '#38bdf8',
        bodyColor: '#ffffff',
        titleFont: { family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', size: 16, weight: '900' },
        bodyFont: { family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', size: 15, weight: 'bold' },
        padding: 14,
        boxPadding: 8,
        borderColor: '#0284c7',
        borderWidth: 2,
        cornerRadius: 10,
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) label += ': ';
            if (context.parsed.y !== null && context.parsed.y !== undefined) {
              label += 'S/ ' + context.parsed.y.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            return ' ' + label;
          }
        }
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#ffffff',
          font: { family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', size: 13, weight: 'bold' },
          padding: 8
        },
        grid: { color: 'rgba(51, 65, 85, 0.4)' }
      },
      y: {
        ticks: {
          color: '#ffffff',
          font: { family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', size: 13, weight: 'bold' },
          padding: 8,
          callback: (val) => `S/ ${val.toLocaleString('es-PE')}`
        },
        grid: { color: 'rgba(51, 65, 85, 0.4)' }
      },
    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Header & Temporal Navigation Bar */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', border: '1px solid #334155' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
            <FileSpreadsheet size={24} color="#34d399" />
            5. Facturas Compras / Ventas y Pago SUNAT
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.2rem', margin: 0 }}>
            Gestión mensual de comprobantes de Compras, Ventas y Cálculo automático de impuestos SUNAT.
          </p>
        </div>

        {/* Month & Year Navigation Controls */}
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

          <button
            type="button"
            onClick={fetchSunatData}
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.4rem 0.6rem' }}
            title="Actualizar Datos"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 2. Sub-tab Navigation Tabs */}
      {isPastYear && (
        <div style={{
          backgroundColor: 'rgba(234, 179, 8, 0.12)',
          border: '1.5px solid #eab308',
          borderRadius: '10px',
          padding: '0.65rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          color: '#fef08a',
          fontSize: '0.85rem',
          fontWeight: '800'
        }}>
          <span style={{ fontSize: '1.2rem' }}>🔒</span>
          <span>MODO HISTÓRICO SUNAT (AÑO {selectedYear} CERRADO - SOLO CONSULTA)</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #1e293b', paddingBottom: '0.2rem' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('purchases')}
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
            backgroundColor: activeSubTab === 'purchases' ? '#ef4444' : '#0f172a',
            color: activeSubTab === 'purchases' ? '#ffffff' : '#94a3b8',
          }}
        >
          <ShoppingBag size={16} /> 🛒 1. COMPRAS ({MONTH_NAMES[selectedMonth]} {selectedYear})
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('sales')}
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
            backgroundColor: activeSubTab === 'sales' ? '#10b981' : '#0f172a',
            color: activeSubTab === 'sales' ? '#ffffff' : '#94a3b8',
          }}
        >
          <TrendingUp size={16} /> 📈 2. VENTAS ({MONTH_NAMES[selectedMonth]} {selectedYear})
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('sunat_payment')}
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
            backgroundColor: activeSubTab === 'sunat_payment' ? '#0284c7' : '#0f172a',
            color: activeSubTab === 'sunat_payment' ? '#ffffff' : '#94a3b8',
          }}
        >
          <Landmark size={16} /> 🏛️ 3. PAGO SUNAT
        </button>
      </div>

      {loading && <p style={{ color: '#94a3b8', padding: '1rem' }}>Cargando información tributaria...</p>}
      {error && <p style={{ color: '#ef4444', padding: '1rem' }}>{error}</p>}

      {/* 3. SUB-TAB 1: COMPRAS */}
      {!loading && !error && activeSubTab === 'purchases' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '900', color: '#f87171', margin: 0 }}>
              🛒 Registro de Facturas de COMPRAS ({MONTH_NAMES[selectedMonth]} {selectedYear})
            </h3>
            {!isPastYear && (
              <button
                type="button"
                onClick={() => openCreateModal('COMPRA')}
              className="btn btn-danger"
              style={{ fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Plus size={18} /> + Registrar Factura de Compra
              </button>
            )}
          </div>

          {/* Table of Purchases */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1.5px solid #1e293b' }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'center', width: '100px' }}>FECHA</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', width: '140px', color: '#f87171', fontWeight: '900' }}>N° AUTORIZACIÓN</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', width: '130px' }}>RUC</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>RAZÓN SOCIAL / PROVEEDOR</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', width: '110px' }}>SUB TOTAL</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', width: '100px' }}>IGV (18%)</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', width: '120px' }}>TOTAL S/</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', width: '90px' }}>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseInvoices.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                        No hay facturas de compra registradas en {MONTH_NAMES[selectedMonth]} {selectedYear}. Haz clic en "+ Registrar Factura de Compra".
                      </td>
                    </tr>
                  ) : (
                    purchaseInvoices.map((inv) => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ textAlign: 'center', fontWeight: '700', color: '#94a3b8' }}>
                          {(inv.issue_date || '').substring(0, 10)}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: '900', color: '#ffffff', backgroundColor: 'rgba(239, 68, 68, 0.2)', padding: '0.35rem', borderRadius: '4px' }}>
                          {inv.doc_number}
                        </td>
                        <td style={{ fontWeight: '800', color: '#38bdf8' }}>{inv.ruc_dni || '-'}</td>
                        <td style={{ fontWeight: '700', color: '#ffffff' }}>{inv.customer_supplier_name}</td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: '#cbd5e1' }}>{formatSoles(inv.subtotal)}</td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: '#fbbf24' }}>{formatSoles(inv.igv)}</td>
                        <td style={{ textAlign: 'right', fontWeight: '900', color: '#f87171' }}>{formatSoles(inv.total)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                            <button onClick={() => openEditModal(inv)} className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.4rem' }} title="Editar">
                              <Edit3 size={14} color="#38bdf8" />
                            </button>
                            <button onClick={() => handleDelete(inv.id)} className="btn btn-danger btn-sm" style={{ padding: '0.2rem 0.4rem' }} title="Eliminar">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {purchaseInvoices.length > 0 && (
                  <tfoot>
                    <tr style={{ backgroundColor: '#0f172a', fontWeight: '900', borderTop: '2px solid #ef4444' }}>
                      <td colSpan="4" style={{ textAlign: 'right', padding: '0.75rem', color: '#ef4444', fontSize: '0.9rem' }}>
                        TOTAL COMPRAS DE {MONTH_NAMES[selectedMonth]}:
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.75rem', color: '#cbd5e1', fontSize: '0.95rem' }}>
                        {formatSoles(purchaseTotals.subtotal)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.75rem', color: '#fbbf24', fontSize: '0.95rem' }}>
                        {formatSoles(purchaseTotals.igv)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.75rem', color: '#f87171', fontSize: '0.95rem' }}>
                        {formatSoles(purchaseTotals.total)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. SUB-TAB 2: VENTAS */}
      {!loading && !error && activeSubTab === 'sales' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '900', color: '#34d399', margin: 0 }}>
              📈 Registro de Facturas de VENTAS ({MONTH_NAMES[selectedMonth]} {selectedYear})
            </h3>
            {!isPastYear && (
              <button
                type="button"
                onClick={() => openCreateModal('VENTA')}
              className="btn btn-success"
              style={{ fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Plus size={18} /> + Registrar Factura de Venta
              </button>
            )}
          </div>

          {/* Table of Sales */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1.5px solid #1e293b' }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'center', width: '100px' }}>FECHA</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', width: '140px', color: '#34d399', fontWeight: '900' }}>N° AUTORIZACIÓN</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', width: '130px' }}>RUC</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>RAZÓN SOCIAL / CLIENTE</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', width: '110px' }}>SUB TOTAL</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', width: '100px' }}>IGV (18%)</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', width: '120px' }}>TOTAL S/</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', width: '90px' }}>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {salesInvoices.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                        No hay facturas de venta registradas en {MONTH_NAMES[selectedMonth]} {selectedYear}. Haz clic en "+ Registrar Factura de Venta".
                      </td>
                    </tr>
                  ) : (
                    salesInvoices.map((inv) => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ textAlign: 'center', fontWeight: '700', color: '#94a3b8' }}>
                          {(inv.issue_date || '').substring(0, 10)}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: '900', color: '#ffffff', backgroundColor: 'rgba(16, 185, 129, 0.2)', padding: '0.35rem', borderRadius: '4px' }}>
                          {inv.doc_number}
                        </td>
                        <td style={{ fontWeight: '800', color: '#38bdf8' }}>{inv.ruc_dni || '-'}</td>
                        <td style={{ fontWeight: '700', color: '#ffffff' }}>{inv.customer_supplier_name}</td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: '#cbd5e1' }}>{formatSoles(inv.subtotal)}</td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: '#fbbf24' }}>{formatSoles(inv.igv)}</td>
                        <td style={{ textAlign: 'right', fontWeight: '900', color: '#34d399' }}>{formatSoles(inv.total)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                            <button onClick={() => openEditModal(inv)} className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.4rem' }} title="Editar">
                              <Edit3 size={14} color="#38bdf8" />
                            </button>
                            <button onClick={() => handleDelete(inv.id)} className="btn btn-danger btn-sm" style={{ padding: '0.2rem 0.4rem' }} title="Eliminar">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {salesInvoices.length > 0 && (
                  <tfoot>
                    <tr style={{ backgroundColor: '#0f172a', fontWeight: '900', borderTop: '2px solid #10b981' }}>
                      <td colSpan="4" style={{ textAlign: 'right', padding: '0.75rem', color: '#34d399', fontSize: '0.9rem' }}>
                        TOTAL VENTAS DE {MONTH_NAMES[selectedMonth]}:
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.75rem', color: '#cbd5e1', fontSize: '0.95rem' }}>
                        {formatSoles(salesTotals.subtotal)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.75rem', color: '#fbbf24', fontSize: '0.95rem' }}>
                        {formatSoles(salesTotals.igv)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.75rem', color: '#34d399', fontSize: '0.95rem' }}>
                        {formatSoles(salesTotals.total)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. SUB-TAB 3: PAGO SUNAT (Matches User Screenshot & Requested Color Fixes) */}
      {!loading && !error && activeSubTab === 'sunat_payment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Main Calculation Tables matching User's Excel Screenshot */}
          <div className="grid-2" style={{ alignItems: 'flex-start' }}>
            {/* Table 1: Resumen Mensual (VENTAS, COMPRAS, RESULTADO) */}
            <div className="card" style={{ padding: 0, overflow: 'hidden', border: '2px solid #0284c7' }}>
              <div style={{ backgroundColor: '#0284c7', padding: '0.75rem 1rem', color: '#ffffff', fontWeight: '900', fontSize: '1.05rem', textAlign: 'center', letterSpacing: '1px' }}>
                {MONTH_NAMES[selectedMonth]} {selectedYear}
              </div>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>CONCEPTO</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>SUB TOTAL</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>IGV (18%)</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Row 1: VENTAS */}
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: '900', color: '#34d399' }}>VENTAS</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: '#ffffff' }}>{formatSoles(salesTotals.subtotal)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: '#ffffff' }}>{formatSoles(salesTotals.igv)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '900', color: '#34d399' }}>{formatSoles(salesTotals.total)}</td>
                  </tr>
                  {/* Row 2: COMPRAS */}
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: '900', color: '#f87171' }}>COMPRAS</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: '#ffffff' }}>{formatSoles(purchaseTotals.subtotal)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: '#ffffff' }}>{formatSoles(purchaseTotals.igv)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '900', color: '#f87171' }}>{formatSoles(purchaseTotals.total)}</td>
                  </tr>
                  {/* Row 3: RESULTADO (Fixed Colors for High Contrast) */}
                  <tr style={{ backgroundColor: '#1e293b', borderTop: '2px solid #f59e0b', fontWeight: '900' }}>
                    <td style={{ padding: '0.85rem 1rem', color: '#fbbf24', fontSize: '0.95rem' }}>RESULTADO</td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#ffffff', fontSize: '0.95rem' }}>{formatSoles(resultSubtotal)}</td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#fbbf24', fontSize: '0.95rem' }}>{formatSoles(resultIgv)}</td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontSize: '1.1rem', backgroundColor: '#f59e0b', color: '#000000', borderRadius: '4px' }}>
                      {formatSoles(resultTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Table 2: Impuestos Finales a Pagar (FINAL MES) */}
            <div className="card" style={{ padding: 0, overflow: 'hidden', border: '2px solid #10b981' }}>
              <div style={{ backgroundColor: '#10b981', padding: '0.75rem 1rem', color: '#ffffff', fontWeight: '900', fontSize: '1.05rem', textAlign: 'center', letterSpacing: '1px' }}>
                FINAL {MONTH_NAMES[selectedMonth]} {selectedYear}
              </div>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>IMPUESTO SUNAT</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>TASA / PORCENTAJE</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>MONTO A PAGAR</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Row 1: RENTA (With Edit Percentage Button) */}
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: '900', color: '#38bdf8' }}>RENTA</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      {editingRenta ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <input
                            type="number"
                            step="0.1"
                            style={{ width: '65px', padding: '0.2rem', borderRadius: '4px', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #38bdf8', fontWeight: '900', textAlign: 'center' }}
                            value={rentaRate}
                            onChange={(e) => setRentaRate(parseFloat(e.target.value) || 0)}
                          />
                          <span style={{ color: '#fff', fontWeight: 'bold' }}>%</span>
                          <button onClick={() => setEditingRenta(false)} className="btn btn-success btn-sm" style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem' }}>OK</button>
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: '900', color: '#ffffff', backgroundColor: '#0f172a', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #334155' }}>
                            {rentaRate.toFixed(2)}%
                          </span>
                          <button onClick={() => setEditingRenta(true)} className="btn btn-secondary btn-sm" style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem', color: '#38bdf8' }} title="Editar Porcentaje Renta">
                            ✏️ Editar %
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '900', color: '#ffffff', fontSize: '1rem' }}>
                      {formatSoles(rentaAmount)}
                    </td>
                  </tr>

                  {/* Row 2: IGV (With Edit Percentage Button) */}
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: '900', color: '#fbbf24' }}>IGV</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      {editingIgv ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <input
                            type="number"
                            step="0.1"
                            style={{ width: '65px', padding: '0.2rem', borderRadius: '4px', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #fbbf24', fontWeight: '900', textAlign: 'center' }}
                            value={igvRate}
                            onChange={(e) => setIgvRate(parseFloat(e.target.value) || 0)}
                          />
                          <span style={{ color: '#fff', fontWeight: 'bold' }}>%</span>
                          <button onClick={() => setEditingIgv(false)} className="btn btn-success btn-sm" style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem' }}>OK</button>
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: '900', color: '#ffffff', backgroundColor: '#0f172a', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #334155' }}>
                            {igvRate.toFixed(2)}%
                          </span>
                          <button onClick={() => setEditingIgv(true)} className="btn btn-secondary btn-sm" style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem', color: '#fbbf24' }} title="Editar Porcentaje IGV">
                            ✏️ Editar %
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '900', color: '#ffffff', fontSize: '1rem' }}>
                      {formatSoles(igvAmount)}
                    </td>
                  </tr>

                  {/* Row 3: TOTAL A PAGAR (Fixed High Contrast Red Accent) */}
                  <tr style={{ backgroundColor: '#dc2626', color: '#ffffff', fontWeight: '900' }}>
                    <td style={{ padding: '0.9rem 1rem', fontSize: '1.05rem', color: '#ffffff' }}>TOTAL A PAGAR</td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'center', color: '#ffffff', fontWeight: '900' }}>SUNAT</td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right', fontWeight: '900', color: '#ffffff', fontSize: '1.3rem' }}>
                      {formatSoles(totalSunatPagar)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Reporte Consolidado Anual de Impuestos SUNAT (Interactive Chart + Comparative Table) */}
          {annualStats && (
            <div className="card" style={{ padding: '1.25rem', backgroundColor: '#0f172a', border: '1.5px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BarChart3 size={22} color="#38bdf8" /> Reporte Consolidado Anual de Impuestos SUNAT ({annualStats.year})
                </h3>
              </div>

              {/* Chart Component */}
              <div style={{ height: '370px', width: '100%', backgroundColor: '#1e293b', padding: '1rem', borderRadius: '12px', border: '1px solid #334155' }}>
                <Bar data={chartData} options={chartOptions} />
              </div>

              {/* Annual Summary Table */}
              <div className="table-container" style={{ border: '1px solid #1e293b', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>MES</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#34d399' }}>VENTAS (SUBTOTAL)</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#f87171' }}>COMPRAS (SUBTOTAL)</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>DIFERENCIAL</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#fbbf24' }}>IGV ({igvRate}%)</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#38bdf8' }}>RENTA ({rentaRate}%)</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#f87171' }}>TOTAL SUNAT S/</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTH_NAMES.map((mName, index) => {
                      const periodStr = `${annualStats.year}-${String(index + 1).padStart(2, '0')}`;
                      const mData = annualStats.monthlyData?.find(d => d.period === periodStr) || { sales_total: 0, sales_igv: 0, purchases_total: 0, purchases_igv: 0 };

                      const salesSub = Math.round((mData.sales_total / 1.18) * 100) / 100;
                      const purchasesSub = Math.round((mData.purchases_total / 1.18) * 100) / 100;
                      const diffSub = salesSub - purchasesSub;

                      const mResultTotal = mData.sales_total - mData.purchases_total;
                      const iVal = Math.round((Math.max(0, mResultTotal) * (igvRate / 100)) * 100) / 100;
                      const rVal = Math.round((mData.sales_total * (rentaRate / 100)) * 100) / 100;
                      const totalPayable = Math.round((iVal + rVal) * 100) / 100;

                      const isSelected = index === selectedMonth;

                      return (
                        <tr
                          key={index}
                          style={{
                            borderBottom: '1px solid #1e293b',
                            backgroundColor: isSelected ? 'rgba(52, 211, 153, 0.12)' : 'transparent',
                          }}
                        >
                          <td style={{ fontWeight: '900', color: isSelected ? '#34d399' : '#ffffff', padding: '0.75rem 1rem' }}>
                            {mName} {isSelected && <span style={{ fontSize: '0.7rem', backgroundColor: '#10b981', color: '#fff', padding: '0.1rem 0.35rem', borderRadius: '4px', marginLeft: '0.3rem' }}>ACTUAL</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '800', color: '#34d399', padding: '0.75rem 1rem' }}>{formatSoles(salesSub)}</td>
                          <td style={{ textAlign: 'right', fontWeight: '800', color: '#f87171', padding: '0.75rem 1rem' }}>{formatSoles(purchasesSub)}</td>
                          <td style={{ textAlign: 'right', fontWeight: '800', color: '#ffffff', padding: '0.75rem 1rem' }}>{formatSoles(diffSub)}</td>
                          <td style={{ textAlign: 'right', fontWeight: '800', color: '#fbbf24', padding: '0.75rem 1rem' }}>{formatSoles(iVal)}</td>
                          <td style={{ textAlign: 'right', fontWeight: '800', color: '#38bdf8', padding: '0.75rem 1rem' }}>{formatSoles(rVal)}</td>
                          <td style={{ textAlign: 'right', fontWeight: '900', color: '#f87171', padding: '0.75rem 1rem' }}>{formatSoles(totalPayable)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. MODAL CREAR / EDITAR COMPROBANTE SUNAT (Optimized Compact 2-Column Layout) */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.82)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '650px',
            maxHeight: '90vh',
            overflowY: 'auto',
            backgroundColor: '#0f172a',
            border: `2px solid ${formType === 'COMPRA' ? '#ef4444' : '#10b981'}`,
            boxShadow: '0 25px 50px rgba(0,0,0,0.95)',
            padding: '1.25rem 1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '900', color: formType === 'COMPRA' ? '#f87171' : '#34d399', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileSpreadsheet size={20} />
                {editingInvoice ? `Editar Comprobante N° ${editingInvoice.doc_number}` : `Registrar Nueva Factura de ${formType}`}
              </h3>
              <button onClick={() => setShowModal(false)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {/* Indicador de Periodo Tributario Activo */}
              <div style={{
                backgroundColor: 'rgba(2, 132, 199, 0.14)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '8px',
                padding: '0.45rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                  📅 Se contabilizará en el periodo: <strong style={{ color: '#38bdf8', fontSize: '0.85rem' }}>{MONTH_NAMES[selectedMonth]} {selectedYear}</strong>
                </span>
                <span style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: '800' }}>
                  ✓ Acepta facturas de meses anteriores
                </span>
              </div>

              {/* Row 1: Tipo Operación & N° Autorización */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group" style={{ margin: 0, gap: '0.2rem' }}>
                  <label className="form-label" style={{ fontWeight: '800', color: '#ffffff', fontSize: '0.8rem' }}>
                    Tipo de Operación:
                  </label>
                  <select className="form-select" value={formType} onChange={(e) => setFormType(e.target.value)}>
                    <option value="COMPRA">🛒 COMPRA (Gasto / Crédito Fiscal)</option>
                    <option value="VENTA">📈 VENTA (Ingreso / Débito Fiscal)</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0, gap: '0.2rem' }}>
                  <label className="form-label" style={{ fontWeight: '800', color: '#38bdf8', fontSize: '0.8rem' }}>
                    1. N° de Autorización:
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={formDocNumber}
                    onChange={(e) => setFormDocNumber(e.target.value)}
                    placeholder="Ej: F001-00001742"
                    required
                  />
                </div>
              </div>

              {/* Row 2: Fecha & RUC (Strict 11 Digits max) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group" style={{ margin: 0, gap: '0.2rem' }}>
                  <label className="form-label" style={{ fontWeight: '800', color: '#ffffff', fontSize: '0.8rem' }}>
                    2. Fecha de la {formType === 'COMPRA' ? 'Compra' : 'Venta'}:
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={formIssueDate}
                    onChange={(e) => setFormIssueDate(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                    * Si es de un mes anterior, se computará en {MONTH_NAMES[selectedMonth]} {selectedYear}.
                  </span>
                </div>

                <div className="form-group" style={{ margin: 0, gap: '0.2rem' }}>
                  <label className="form-label" style={{ fontWeight: '800', color: '#38bdf8', fontSize: '0.8rem' }}>
                    3. RUC (Máx 11 dígitos):
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    maxLength={11}
                    value={formRucDni}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (val.length <= 11) setFormRucDni(val);
                    }}
                    placeholder="Ej: 20601234567"
                    required
                  />
                  {formRucDni.length > 0 && (
                    <span style={{ fontSize: '0.7rem', color: formRucDni.length === 11 ? '#34d399' : '#fbbf24', marginTop: '0.1rem' }}>
                      {formRucDni.length}/11 dígitos {formRucDni.length === 11 ? '✓ (Completo)' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Row 3: Razón Social */}
              <div className="form-group" style={{ margin: 0, gap: '0.2rem' }}>
                <label className="form-label" style={{ fontWeight: '800', color: '#ffffff', fontSize: '0.8rem' }}>
                  4. Razón Social / Nombre:
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={formEntityName}
                  onChange={(e) => setFormEntityName(e.target.value)}
                  placeholder="Ej: Empresa Fincagraf S.A.C."
                  required
                />
              </div>

              {/* Row 4: Total, Subtotal, IGV */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
                <div className="form-group" style={{ margin: 0, gap: '0.2rem' }}>
                  <label className="form-label" style={{ fontWeight: '900', color: '#34d399', fontSize: '0.8rem' }}>
                    5. MONTO TOTAL (S/):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    style={{ fontWeight: '900', fontSize: '0.95rem', color: '#ffffff', borderColor: '#34d399' }}
                    value={formTotal}
                    onChange={(e) => handleTotalChange(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0, gap: '0.2rem' }}>
                  <label className="form-label" style={{ fontWeight: '800', color: '#94a3b8', fontSize: '0.8rem' }}>
                    SUB TOTAL (S/):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={formSubtotal}
                    readOnly
                    placeholder="Auto"
                  />
                </div>

                <div className="form-group" style={{ margin: 0, gap: '0.2rem' }}>
                  <label className="form-label" style={{ fontWeight: '800', color: '#fbbf24', fontSize: '0.8rem' }}>
                    IGV 18% (S/):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={formIgv}
                    readOnly
                    placeholder="Auto"
                  />
                </div>
              </div>

              {/* Action Buttons Right Below Row 4 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-success btn-sm" disabled={submitting} style={{ fontWeight: '900', padding: '0.5rem 1rem' }}>
                  <Save size={16} /> {submitting ? 'Guardando...' : 'Guardar Comprobante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

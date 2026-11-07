import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../utils/api';
import { formatSoles, formatMoney } from '../utils/format';
import { generateExecutivePDF, generateWeeklyDailySheetPDF, MONTH_NAMES } from '../utils/pdfGenerator';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Award, Layers, Trophy, Wallet, FileText, Printer, Calendar, X, CheckCircle2 } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Inline Chart.js Plugin to render monetary values on top of 3D bar pillars (Imagen 5 style)
const valueLabelsPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      meta.data.forEach((bar, index) => {
        const value = dataset.data[index];
        if (value !== undefined && value !== null && value > 0) {
          ctx.save();
          ctx.font = '900 13px system-ui, -apple-system, Segoe UI, sans-serif';
          ctx.fillStyle = datasetIndex === 0 ? '#38bdf8' : '#fb923c';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.shadowBlur = 0;
          ctx.fillText(formatSoles(value), bar.x, bar.y - 6);
          ctx.restore();
        }
      });
    });
  }
};

export default function WeeklyReportView({ startDate, endDate }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Estados de exportación de PDF
  const [exportingWeekly, setExportingWeekly] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [modalPeriodType, setModalPeriodType] = useState('weekly');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [exportingModal, setExportingModal] = useState(false);

  // Semanas calculadas para el mes y año seleccionado (Lunes a Sábado)
  const availableWeeks = useMemo(() => {
    const weeks = [];
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const seenMondays = new Set();

    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const curMon = new Date(now);
    curMon.setDate(now.getDate() + diffToMon);
    const curSat = new Date(curMon);
    curSat.setDate(curMon.getDate() + 5);
    const curMonStr = curMon.toISOString().split('T')[0];
    const curSatStr = curSat.toISOString().split('T')[0];

    weeks.push({
      id: 'current',
      label: `⭐ Semana en curso (${curMonStr} al ${curSatStr})`,
      startDate: curMonStr,
      endDate: curSatStr
    });

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(selectedYear, selectedMonth, day, 12, 0, 0);
      const dow = d.getDay();
      const dDiff = dow === 0 ? -6 : 1 - dow;
      const mon = new Date(d);
      mon.setDate(d.getDate() + dDiff);
      const monStr = mon.toISOString().split('T')[0];

      if (!seenMondays.has(monStr)) {
        seenMondays.add(monStr);
        const sat = new Date(mon);
        sat.setDate(mon.getDate() + 5);
        const satStr = sat.toISOString().split('T')[0];
        weeks.push({
          id: monStr,
          label: `Semana ${weeks.length} (${monStr} al ${satStr})`,
          startDate: monStr,
          endDate: satStr
        });
      }
    }
    return weeks;
  }, [selectedYear, selectedMonth]);

  const safeFetch = async (url) => {
    try {
      const res = await apiFetch(url);
      return res;
    } catch (e) {
      console.warn('safeFetch failed:', url, e.message);
      return null;
    }
  };

  const handleDownloadCurrentWeekPDF = async () => {
    setExportingWeekly(true);
    try {
      const activeStart = startDate || (reportData?.week_start) || new Date().toISOString().split('T')[0];
      const activeEnd = endDate || (reportData?.week_end) || activeStart;

      generateWeeklyDailySheetPDF({
        startDate: activeStart,
        endDate: activeEnd,
        periodTitle: `Semana: ${activeStart} al ${activeEnd}`,
        adminName: 'Administrador / Auditor',
        dailyData: reportData,
        expensesData: reportData?.detailed_expenses || []
      });
    } catch (err) {
      console.error('Error generating weekly PDF:', err);
      alert('Error al generar PDF Semanal: ' + err.message);
    } finally {
      setExportingWeekly(false);
    }
  };

  const handleModalExportPDF = async () => {
    setExportingModal(true);
    try {
      const monthStr = String(selectedMonth + 1).padStart(2, '0');
      const periodStr = `${selectedYear}-${monthStr}`;
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

      let periodTitle = `Reporte Financiero`;

      if (modalPeriodType === 'weekly') {
        const chosenWeek = availableWeeks[selectedWeekIndex] || availableWeeks[0];
        const res = await safeFetch(`/daily-sheet/weekly-report?startDate=${chosenWeek.startDate}&endDate=${chosenWeek.endDate}`);
        generateWeeklyDailySheetPDF({
          startDate: chosenWeek.startDate,
          endDate: chosenWeek.endDate,
          periodTitle: `Semana: ${chosenWeek.startDate} al ${chosenWeek.endDate}`,
          adminName: 'Administrador / Auditor',
          dailyData: res || reportData,
          expensesData: res?.detailed_expenses || reportData?.detailed_expenses || []
        });
        setShowExportModal(false);
        return;
      } else if (modalPeriodType === 'monthly') {
        periodTitle = `Mes de ${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
      } else if (modalPeriodType === 'annual') {
        periodTitle = `Año Completo ${selectedYear}`;
      }

      let expensesRes = null;
      let scheduleRes = null;
      let bankRes = null;
      let contractsRes = null;
      let contractsMonthlyReport = null;
      let contractsAnnualReport = null;
      let sunatStatsRes = null;
      let sunatInvoicesRes = null;
      let staffLoansRes = null;

      if (modalPeriodType === 'monthly') {
        const monthStart = `${selectedYear}-${monthStr}-01`;
        const monthEnd = `${selectedYear}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;
        const [cMonthRep, exps, bank, contrs, sInvoices, loans, sched] = await Promise.all([
          safeFetch(`/contracts/monthly-report?year=${selectedYear}&month=${selectedMonth}`),
          safeFetch(`/expenses?startDate=${monthStart}&endDate=${monthEnd}`),
          safeFetch(`/bank-reconciliation?startDate=${monthStart}&endDate=${monthEnd}`),
          safeFetch(`/contracts?year=${selectedYear}&month=${selectedMonth}`),
          safeFetch(`/sunat/invoices?period=${periodStr}`),
          safeFetch(`/staff-loans?year=${selectedYear}&month=${selectedMonth}`),
          safeFetch(`/payment-schedule`)
        ]);
        contractsMonthlyReport = cMonthRep;
        expensesRes = exps;
        bankRes = bank;
        contractsRes = contrs;
        sunatInvoicesRes = sInvoices;
        staffLoansRes = loans;
        scheduleRes = sched;
      } else if (modalPeriodType === 'annual') {
        const yearStart = `${selectedYear}-01-01`;
        const yearEnd = `${selectedYear}-12-31`;
        const [cAnnualRep, exps, contrs, sStats, loans, sched] = await Promise.all([
          safeFetch(`/contracts/annual-report?year=${selectedYear}`),
          safeFetch(`/expenses?startDate=${yearStart}&endDate=${yearEnd}`),
          safeFetch(`/contracts?year=${selectedYear}`),
          safeFetch(`/sunat/stats?year=${selectedYear}`),
          safeFetch(`/staff-loans?year=${selectedYear}`),
          safeFetch(`/payment-schedule`)
        ]);
        contractsAnnualReport = cAnnualRep;
        expensesRes = exps;
        contractsRes = contrs;
        sunatStatsRes = sStats;
        staffLoansRes = loans;
        scheduleRes = sched;
      }

      let sunatData = null;
      if (sunatInvoicesRes?.invoices) {
        const salesInvoices = (sunatInvoicesRes.invoices || []).filter(i => i.type === 'VENTA');
        const purchasesInvoices = (sunatInvoicesRes.invoices || []).filter(i => i.type === 'COMPRA');

        const salesSubtotal = salesInvoices.reduce((sum, i) => sum + (i.subtotal || 0), 0);
        const salesIgv = salesInvoices.reduce((sum, i) => sum + (i.igv || 0), 0);
        const salesTotal = salesInvoices.reduce((sum, i) => sum + (i.total || 0), 0);

        const purchasesSubtotal = purchasesInvoices.reduce((sum, i) => sum + (i.subtotal || 0), 0);
        const purchasesIgv = purchasesInvoices.reduce((sum, i) => sum + (i.igv || 0), 0);
        const purchasesTotal = purchasesInvoices.reduce((sum, i) => sum + (i.total || 0), 0);

        const rentaRate = 1.5;
        const igvRate = 4.0;
        const rentaAmount = Math.round((salesTotal * (rentaRate / 100)) * 100) / 100;
        const igvAmount = Math.round((Math.max(0, salesTotal - purchasesTotal) * (igvRate / 100)) * 100) / 100;
        const taxPagar = Math.round((rentaAmount + igvAmount) * 100) / 100;

        sunatData = {
          salesSubtotal,
          salesIgv,
          salesTotal,
          purchasesSubtotal,
          purchasesIgv,
          purchasesTotal,
          rentaRate,
          igvRate,
          rentaAmount,
          igvAmount,
          taxPagar
        };
      }

      generateExecutivePDF({
        periodType: modalPeriodType,
        periodTitle,
        selectedYear,
        selectedMonth,
        adminName: 'Administrador / Auditor',
        dailyData: dailySheetRes || reportData,
        expensesData: expensesRes?.expenses || [],
        scheduleData: scheduleRes?.schedules || [],
        bankData: bankRes?.entries || [],
        contractsData: contractsRes?.contracts || [],
        contractsMonthlyReport,
        contractsAnnualReport,
        sunatData,
        sunatStats: sunatStatsRes,
        staffLoansData: staffLoansRes?.loans || []
      });

      setShowExportModal(false);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Error al generar PDF: ' + err.message);
    } finally {
      setExportingModal(false);
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      let query = '';
      if (startDate && endDate) {
        query = `?startDate=${startDate}&endDate=${endDate}`;
      }
      const res = await apiFetch(`/daily-sheet/weekly-report${query}`);
      if (res.success) {
        setReportData(res);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate]);

  if (loading) return <p style={{ color: '#94a3b8', padding: '2rem', textAlign: 'center', fontWeight: '800' }}>⚡ Cargando reporte semanal 3D...</p>;
  if (error) return <p style={{ color: '#ef4444', padding: '2rem', textAlign: 'center', fontWeight: '800' }}>{error}</p>;
  if (!reportData) return null;

  const { breakdown, totals, sellers_ranking = [] } = reportData;
  const initialCash = typeof reportData.initial_cash === 'number' ? reportData.initial_cash : (parseFloat(reportData.initial_cash) || 0);
  const efectivoDiferencia = (breakdown.EFECTIVO?.venta || 0) - (breakdown.EFECTIVO?.gasto || 0);
  const finalCashInHand = typeof reportData.final_cash_in_hand === 'number'
    ? reportData.final_cash_in_hand
    : (initialCash + efectivoDiferencia);

  const topSeller = sellers_ranking.length > 0 && sellers_ranking[0].contracts_count > 0 ? sellers_ranking[0] : null;
  const totalWeeklyContracts = sellers_ranking.reduce((acc, curr) => acc + (curr.contracts_count || 0), 0);

  const bancarioVenta = (breakdown.BCP?.venta || 0) + (breakdown.YAPE?.venta || 0) + (breakdown.POS?.venta || 0);
  const bancarioGasto = (breakdown.BCP?.gasto || 0) + (breakdown.YAPE?.gasto || 0) + (breakdown.POS?.gasto || 0);

  // Chart dataset with glowing 3D hover resplandor pillar styling (Imagen 5 style)
  const chartData = {
    labels: ['EFECTIVO', 'BCP', 'YAPE', 'POS'],
    datasets: [
      {
        label: 'VENTA (INGRESOS)',
        data: [
          breakdown.EFECTIVO.venta,
          breakdown.BCP.venta,
          breakdown.YAPE.venta,
          breakdown.POS.venta,
        ],
        backgroundColor: 'rgba(2, 132, 199, 0.85)',
        borderColor: '#38bdf8',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
        hoverBackgroundColor: '#0284c7',
        hoverBorderColor: '#ffffff',
        hoverBorderWidth: 3,
        hoverShadowColor: '#38bdf8'
      },
      {
        label: 'GASTO (EGRESOS)',
        data: [
          breakdown.EFECTIVO.gasto,
          breakdown.BCP.gasto,
          breakdown.YAPE.gasto,
          breakdown.POS.gasto,
        ],
        backgroundColor: 'rgba(234, 88, 12, 0.85)',
        borderColor: '#fb923c',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
        hoverBackgroundColor: '#ea580c',
        hoverBorderColor: '#ffffff',
        hoverBorderWidth: 3,
        hoverShadowColor: '#fb923c'
      },
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
    layout: {
      padding: {
        top: 28,
        bottom: 10
      }
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#ffffff',
          font: { family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', size: 14, weight: '900' },
          padding: 16,
          usePointStyle: true,
          pointStyle: 'rectRounded'
        },
      },
      title: {
        display: true,
        text: `📊 REPORTE COMPARATIVO SEMANAL (VENTA VS GASTO)`,
        color: '#38bdf8',
        font: { size: 16, weight: '900', family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
        padding: { bottom: 15 },
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(15, 23, 42, 0.96)',
        titleColor: '#38bdf8',
        bodyColor: '#ffffff',
        titleFont: { size: 16, weight: '900', family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
        bodyFont: { size: 15, weight: 'bold', family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
        padding: 14,
        boxPadding: 8,
        borderColor: '#38bdf8',
        borderWidth: 2,
        cornerRadius: 10,
        displayColors: true,
        callbacks: {
          label: function(context) {
            return ` ${context.dataset.label}: S/ ${context.parsed.y.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: { color: '#ffffff', font: { weight: '900', size: 13, family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }, padding: 8 },
        grid: { display: false }
      },
      y: {
        ticks: { 
          color: '#ffffff',
          font: { weight: '800', size: 13, family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
          padding: 8,
          callback: (val) => `S/ ${val.toLocaleString('es-PE')}`
        },
        grid: { color: 'rgba(255, 255, 255, 0.12)' }
      },
    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '0.5rem' }}>
      
      {/* BARRA SUPERIOR DE ACCIONES Y DESCARGA DE REPORTES PDF */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.8) 100%)',
        padding: '0.9rem 1.25rem',
        borderRadius: '14px',
        border: '1px solid #1e293b',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.25)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '8px', borderRadius: '10px' }}>
            <BarChart3 size={22} color="#38bdf8" />
          </div>
          <div>
            <div style={{ fontWeight: '900', color: '#f8fafc', fontSize: '1rem', letterSpacing: '0.5px' }}>
              REPORTE FINANCIERO Y AUDITORÍA
            </div>
            <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
              Descarga en formato horizontal (Landscape) con gráficos HD y conciliaciones completas
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Botón 1: Descarga directa de la semana actual */}
          <button
            type="button"
            onClick={handleDownloadCurrentWeekPDF}
            disabled={exportingWeekly}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              padding: '0.65rem 1.15rem',
              borderRadius: '10px',
              fontWeight: '800',
              fontSize: '0.86rem',
              cursor: exportingWeekly ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
              transition: 'all 0.2s ease',
              opacity: exportingWeekly ? 0.7 : 1
            }}
            onMouseEnter={(e) => { if (!exportingWeekly) e.currentTarget.style.backgroundColor = '#0369a1'; }}
            onMouseLeave={(e) => { if (!exportingWeekly) e.currentTarget.style.backgroundColor = '#0284c7'; }}
          >
            <FileText size={16} />
            {exportingWeekly ? 'Generando PDF Semanal...' : '📄 Descargar PDF Reporte Semanal'}
          </button>

          {/* Botón 2: Modal para Mensual / Anual / Semanal */}
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              padding: '0.65rem 1.15rem',
              borderRadius: '10px',
              fontWeight: '800',
              fontSize: '0.86rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#334155'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#1e293b'; }}
          >
            <Printer size={16} color="#38bdf8" />
            📊 Descargar Mensual / Anual (Solo Gráficos)
          </button>
        </div>
      </div>

      {/* 3D Interactive Animated Metric Stat Cards */}
      <div className="grid-4">
        {/* Metric 1: Total Ventas */}
        <div 
          className="card stat-card-3d" 
          style={{ 
            borderLeft: '5px solid #0284c7', 
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(2, 132, 199, 0.25) 100%)',
            borderRadius: '14px',
            padding: '1.25rem',
            boxShadow: '0 10px 25px -5px rgba(2, 132, 199, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
            e.currentTarget.style.boxShadow = '0 18px 35px -5px rgba(2, 132, 199, 0.5), 0 0 20px rgba(56, 189, 248, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(2, 132, 199, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.05em' }}>
                TOTAL VENTAS SEMANA
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#38bdf8', marginTop: '0.2rem', textShadow: '0 2px 10px rgba(56, 189, 248, 0.4)' }}>
                {formatSoles(totals.total_venta)}
              </div>
            </div>
            <div style={{ background: 'rgba(2, 132, 199, 0.25)', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={28} color="#38bdf8" />
            </div>
          </div>
        </div>

        {/* Metric 2: Total Gastos */}
        <div 
          className="card stat-card-3d" 
          style={{ 
            borderLeft: '5px solid #ea580c', 
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(234, 88, 12, 0.25) 100%)',
            borderRadius: '14px',
            padding: '1.25rem',
            boxShadow: '0 10px 25px -5px rgba(234, 88, 12, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
            e.currentTarget.style.boxShadow = '0 18px 35px -5px rgba(234, 88, 12, 0.5), 0 0 20px rgba(251, 146, 60, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(234, 88, 12, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.05em' }}>
                TOTAL GASTOS SEMANA
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#fb923c', marginTop: '0.2rem', textShadow: '0 2px 10px rgba(251, 146, 60, 0.4)' }}>
                {formatSoles(totals.total_gasto)}
              </div>
            </div>
            <div style={{ background: 'rgba(234, 88, 12, 0.25)', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingDown size={28} color="#fb923c" />
            </div>
          </div>
        </div>

        {/* Metric 3: Total Ganancia Neta */}
        <div 
          className="card stat-card-3d" 
          style={{ 
            borderLeft: '5px solid #10b981', 
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(16, 185, 129, 0.25) 100%)',
            borderRadius: '14px',
            padding: '1.25rem',
            boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
            e.currentTarget.style.boxShadow = '0 18px 35px -5px rgba(16, 185, 129, 0.5), 0 0 20px rgba(52, 211, 153, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(16, 185, 129, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.05em' }}>
                GANANCIA OPERATIVA
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: totals.total_ganancia >= 0 ? '#34d399' : '#ef4444', marginTop: '0.2rem', textShadow: '0 2px 10px rgba(52, 211, 153, 0.4)' }}>
                {formatSoles(totals.total_ganancia)}
              </div>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.25)', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Award size={28} color="#34d399" />
            </div>
          </div>
        </div>

        {/* Metric 4: Saldo Total en Caja Física */}
        <div 
          className="card stat-card-3d" 
          style={{ 
            borderLeft: '5px solid #eab308', 
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(234, 179, 8, 0.22) 100%)',
            borderRadius: '14px',
            padding: '1.25rem',
            boxShadow: '0 10px 25px -5px rgba(234, 179, 8, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
            e.currentTarget.style.boxShadow = '0 18px 35px -5px rgba(234, 179, 8, 0.5), 0 0 20px rgba(250, 204, 21, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(234, 179, 8, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: '#facc15', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.05em' }}>
                TOTAL EN CAJA FÍSICA
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#facc15', marginTop: '0.2rem', textShadow: '0 2px 10px rgba(250, 204, 21, 0.4)' }}>
                {formatSoles(finalCashInHand)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem', fontWeight: '700' }}>
                Inicio {formatSoles(initialCash)} | Flujo {efectivoDiferencia >= 0 ? '+' : ''}{formatSoles(efectivoDiferencia)}
              </div>
            </div>
            <div style={{ background: 'rgba(234, 179, 8, 0.25)', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={28} color="#facc15" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: 3D Depth Comparative Table & Interactive Resplandor Chart */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        
        {/* Table Separating EFECTIVO vs BANCARIO (Imagen 2 Rediseño) */}
        <div className="card" style={{ padding: '0', overflow: 'hidden', border: '2px solid #0284c7', borderRadius: '14px', boxShadow: '0 15px 35px rgba(0, 0, 0, 0.5)' }}>
          <div style={{ background: 'linear-gradient(90deg, #0284c7 0%, #0369a1 100%)', color: '#fff', padding: '0.95rem 1.25rem', fontWeight: '900', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem', letterSpacing: '0.03em' }}>
            <Layers size={20} /> TABLA COMPARATIVA SEMANAL
          </div>
          <div className="table-container" style={{ border: 'none' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.92rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f172a' }}>
                  <th style={{ color: '#ffffff', padding: '0.9rem 1rem', fontWeight: '900', borderBottom: '2px solid #1e293b' }}>Método de pago</th>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', padding: '0.9rem 1rem', textAlign: 'right', fontWeight: '900', borderBottom: '2px solid #0369a1' }}>Venta</th>
                  <th style={{ backgroundColor: '#ea580c', color: '#ffffff', padding: '0.9rem 1rem', textAlign: 'right', fontWeight: '900', borderBottom: '2px solid #c2410c' }}>Gasto</th>
                  <th style={{ backgroundColor: '#065f46', color: '#34d399', padding: '0.9rem 1rem', textAlign: 'right', fontWeight: '900', borderBottom: '2px solid #047857' }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {/* SECCIÓN 1: EFECTIVO (CAJA FÍSICA) */}
                <tr style={{ backgroundColor: 'rgba(34, 197, 94, 0.12)', borderBottom: '1px solid #1e293b' }}>
                  <td colSpan="4" style={{ fontWeight: '900', color: '#22c55e', padding: '0.5rem 1rem', fontSize: '0.8rem', letterSpacing: '0.05em' }}>
                    💵 1. OPERACIONES EN EFECTIVO (CAJA FÍSICA)
                  </td>
                </tr>

                {/* 1.1 Caja Inicial Apertura Lunes */}
                <tr style={{ borderBottom: '1px solid #1e293b', backgroundColor: 'rgba(234, 179, 8, 0.08)' }}>
                  <td style={{ fontWeight: '800', color: '#facc15', padding: '0.75rem 1rem' }}>
                    🟡 (+) CAJA DE INICIO (APERTURA LUNES)
                  </td>
                  <td style={{ textAlign: 'right', color: '#facc15', fontWeight: '900', padding: '0.75rem 1rem' }}>
                    {formatSoles(initialCash)}
                  </td>
                  <td style={{ textAlign: 'right', color: '#64748b', fontWeight: '700', padding: '0.75rem 1rem' }}>
                    -
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '900', padding: '0.75rem 1rem', color: '#facc15' }}>
                    {formatSoles(initialCash)}
                  </td>
                </tr>

                {/* 1.2 Movimientos de la Semana en Efectivo */}
                <tr style={{ borderBottom: '1px solid #1e293b', transition: 'background-color 0.2s' }}>
                  <td style={{ fontWeight: '800', color: '#ffffff', padding: '0.75rem 1rem' }}>
                    EFECTIVO (MOVIMIENTOS DE LA SEMANA)
                  </td>
                  <td style={{ textAlign: 'right', color: '#38bdf8', fontWeight: '900', padding: '0.75rem 1rem' }}>
                    {formatSoles(breakdown.EFECTIVO.venta)}
                  </td>
                  <td style={{ textAlign: 'right', color: '#fb923c', fontWeight: '900', padding: '0.75rem 1rem' }}>
                    {formatSoles(breakdown.EFECTIVO.gasto)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '900', padding: '0.75rem 1rem', color: efectivoDiferencia >= 0 ? '#34d399' : '#ef4444' }}>
                    {formatSoles(efectivoDiferencia)}
                  </td>
                </tr>

                {/* 1.3 Total Saldo en Caja Física */}
                <tr style={{ backgroundColor: 'rgba(16, 185, 129, 0.18)', borderTop: '2px solid #10b981', borderBottom: '2px solid #10b981', fontWeight: '900' }}>
                  <td style={{ color: '#34d399', padding: '0.8rem 1rem', fontSize: '0.92rem' }}>
                    💰 TOTAL DISPONIBLE EN CAJA FÍSICA (Inicio + Flujo)
                  </td>
                  <td style={{ textAlign: 'right', color: '#38bdf8', padding: '0.8rem 1rem', fontSize: '0.95rem' }}>
                    {formatSoles(initialCash + breakdown.EFECTIVO.venta)}
                  </td>
                  <td style={{ textAlign: 'right', color: '#fb923c', padding: '0.8rem 1rem', fontSize: '0.95rem' }}>
                    {formatSoles(breakdown.EFECTIVO.gasto)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '0.8rem 1rem', fontSize: '1.05rem', color: '#34d399', fontWeight: '900', textShadow: '0 0 10px rgba(52, 211, 153, 0.4)' }}>
                    {formatSoles(finalCashInHand)}
                  </td>
                </tr>

                {/* SECCIÓN 2: PAGOS BANCARIOS Y DIGITALES */}
                <tr style={{ backgroundColor: 'rgba(56, 189, 248, 0.12)', borderBottom: '1px solid #1e293b', borderTop: '2px solid #0284c7' }}>
                  <td colSpan="4" style={{ fontWeight: '900', color: '#38bdf8', padding: '0.5rem 1rem', fontSize: '0.8rem', letterSpacing: '0.05em' }}>
                    🏦 2. PAGOS BANCARIOS Y DIGITALES (TRANSFERENCIAS / POS)
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #1e293b', transition: 'background-color 0.2s' }}>
                  <td style={{ fontWeight: '800', color: '#ffffff', padding: '0.75rem 1rem' }}>BCP</td>
                  <td style={{ textAlign: 'right', color: '#38bdf8', fontWeight: '900', padding: '0.75rem 1rem' }}>{formatSoles(breakdown.BCP.venta)}</td>
                  <td style={{ textAlign: 'right', color: '#fb923c', fontWeight: '900', padding: '0.75rem 1rem' }}>{formatSoles(breakdown.BCP.gasto)}</td>
                  <td style={{ textAlign: 'right', fontWeight: '900', padding: '0.75rem 1rem', color: (breakdown.BCP.venta - breakdown.BCP.gasto) >= 0 ? '#34d399' : '#ef4444' }}>{formatSoles(breakdown.BCP.venta - breakdown.BCP.gasto)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #1e293b', transition: 'background-color 0.2s' }}>
                  <td style={{ fontWeight: '800', color: '#ffffff', padding: '0.75rem 1rem' }}>YAPE</td>
                  <td style={{ textAlign: 'right', color: '#38bdf8', fontWeight: '900', padding: '0.75rem 1rem' }}>{formatSoles(breakdown.YAPE.venta)}</td>
                  <td style={{ textAlign: 'right', color: '#fb923c', fontWeight: '900', padding: '0.75rem 1rem' }}>{formatSoles(breakdown.YAPE.gasto)}</td>
                  <td style={{ textAlign: 'right', fontWeight: '900', padding: '0.75rem 1rem', color: (breakdown.YAPE.venta - breakdown.YAPE.gasto) >= 0 ? '#34d399' : '#ef4444' }}>{formatSoles(breakdown.YAPE.venta - breakdown.YAPE.gasto)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #1e293b', transition: 'background-color 0.2s' }}>
                  <td style={{ fontWeight: '800', color: '#ffffff', padding: '0.75rem 1rem' }}>POS</td>
                  <td style={{ textAlign: 'right', color: '#38bdf8', fontWeight: '900', padding: '0.75rem 1rem' }}>{formatSoles(breakdown.POS.venta)}</td>
                  <td style={{ textAlign: 'right', color: '#fb923c', fontWeight: '900', padding: '0.75rem 1rem' }}>{formatSoles(breakdown.POS.gasto)}</td>
                  <td style={{ textAlign: 'right', fontWeight: '900', padding: '0.75rem 1rem', color: (breakdown.POS.venta - breakdown.POS.gasto) >= 0 ? '#34d399' : '#ef4444' }}>{formatSoles(breakdown.POS.venta - breakdown.POS.gasto)}</td>
                </tr>
                <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderTop: '1px dashed #38bdf8', borderBottom: '2px solid #0284c7', fontWeight: '900' }}>
                  <td style={{ color: '#38bdf8', padding: '0.7rem 1rem', fontSize: '0.88rem' }}>SUBTOTAL BANCARIO</td>
                  <td style={{ textAlign: 'right', color: '#38bdf8', padding: '0.7rem 1rem', fontSize: '0.95rem' }}>{formatSoles(bancarioVenta)}</td>
                  <td style={{ textAlign: 'right', color: '#fb923c', padding: '0.7rem 1rem', fontSize: '0.95rem' }}>{formatSoles(bancarioGasto)}</td>
                  <td style={{ textAlign: 'right', padding: '0.7rem 1rem', fontSize: '0.95rem', color: (bancarioVenta - bancarioGasto) >= 0 ? '#34d399' : '#ef4444', fontWeight: '900' }}>{formatSoles(bancarioVenta - bancarioGasto)}</td>
                </tr>

                {/* TOTAL ROW */}
                <tr style={{ backgroundColor: '#0f172a', borderTop: '2px solid #0284c7', fontWeight: '900' }}>
                  <td style={{ color: '#ffffff', fontSize: '1.02rem', padding: '0.85rem 1rem' }}>TOTAL OPERACIONES DE LA SEMANA</td>
                  <td style={{ textAlign: 'right', color: '#38bdf8', fontSize: '1.05rem', padding: '0.85rem 1rem' }}>{formatSoles(totals.total_venta)}</td>
                  <td style={{ textAlign: 'right', color: '#fb923c', fontSize: '1.05rem', padding: '0.85rem 1rem' }}>{formatSoles(totals.total_gasto)}</td>
                  <td style={{ textAlign: 'right', fontSize: '1.05rem', padding: '0.85rem 1rem', color: totals.total_ganancia >= 0 ? '#34d399' : '#ef4444', fontWeight: '900' }}>{formatSoles(totals.total_ganancia)}</td>
                </tr>

                {/* TOTAL GANANCIA ROW */}
                <tr style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', borderTop: '2px solid #10b981', fontWeight: '900' }}>
                  <td colSpan="3" style={{ color: '#34d399', fontSize: '1.02rem', padding: '0.85rem 1rem' }}>
                    Ganancia Operativa Neta de la Semana (Venta - Gasto)
                  </td>
                  <td style={{ textAlign: 'right', color: totals.total_ganancia >= 0 ? '#34d399' : '#ef4444', fontSize: '1.25rem', padding: '0.85rem 1rem' }}>
                    {formatSoles(totals.total_ganancia)}
                  </td>
                </tr>

                {/* RESUMEN CAJA FÍSICA FINAL ROW */}
                <tr style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', borderTop: '2px solid #eab308', fontWeight: '900' }}>
                  <td colSpan="3" style={{ color: '#facc15', fontSize: '1.02rem', padding: '0.85rem 1rem' }}>
                    💵 Saldo Real Total en Caja Física (Caja Inicio {formatSoles(initialCash)} + Flujo Neto {formatSoles(efectivoDiferencia)})
                  </td>
                  <td style={{ textAlign: 'right', color: '#facc15', fontSize: '1.25rem', padding: '0.85rem 1rem', textShadow: '0 0 10px rgba(250, 204, 21, 0.4)' }}>
                    {formatSoles(finalCashInHand)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>


        {/* 3D Interactive Chart Card with Resplandor Hover Effect */}
        <div 
          className="card" 
          style={{ 
            backgroundColor: '#0f172a', 
            border: '2px solid #1e293b', 
            borderRadius: '14px',
            height: '380px', 
            padding: '1.25rem', 
            boxShadow: '0 15px 35px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.15)' 
          }}
        >
          <Bar data={chartData} options={chartOptions} plugins={[valueLabelsPlugin]} />
        </div>

      </div>

      {/* SECCIÓN RANKING DE VENDEDORES DE LA SEMANA */}
      <div className="card" style={{ 
        border: '2px solid #eab308', 
        borderRadius: '14px', 
        padding: '0', 
        overflow: 'hidden', 
        boxShadow: '0 15px 35px rgba(234, 179, 8, 0.15)',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.8) 100%)'
      }}>
        {/* Header Bar */}
        <div style={{ 
          background: 'linear-gradient(90deg, #ca8a04 0%, #a16207 100%)', 
          color: '#ffffff', 
          padding: '0.95rem 1.25rem', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: '900', fontSize: '1.05rem', letterSpacing: '0.03em' }}>
            <Trophy size={22} color="#fef08a" />
            <span>🏆 RANKING SEMANAL DE VENDEDORES (QUIÉN HIZO MÁS CONTRATOS)</span>
          </div>
          <div style={{ fontSize: '0.82rem', fontWeight: '800', backgroundColor: 'rgba(0, 0, 0, 0.3)', padding: '0.25rem 0.65rem', borderRadius: '20px', color: '#fef08a' }}>
            Total contratos de la semana: {totalWeeklyContracts}
          </div>
        </div>

        {/* Top Seller Card Callout (si hay contratos) */}
        {topSeller && (
          <div style={{ 
            margin: '1.25rem 1.25rem 0.5rem 1.25rem', 
            padding: '1rem 1.25rem', 
            background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(15, 23, 42, 0.6) 100%)', 
            border: '1.5px solid #eab308', 
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ 
                width: '52px', 
                height: '52px', 
                borderRadius: '50%', 
                backgroundColor: '#eab308', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 0 15px rgba(234, 179, 8, 0.6)',
                fontSize: '1.8rem'
              }}>
                🥇
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#fef08a', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.05em' }}>
                  LÍDER DE VENTAS DE LA SEMANA
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#ffffff' }}>
                  {topSeller.seller_name}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', padding: '0.4rem 0.8rem', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: '700' }}>Contratos Cerrados</span>
                <span style={{ fontSize: '1.3rem', fontWeight: '900', color: '#fef08a' }}>{topSeller.contracts_count}</span>
              </div>
              <div style={{ textAlign: 'center', padding: '0.4rem 0.8rem', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: '700' }}>Total Contratado</span>
                <span style={{ fontSize: '1.15rem', fontWeight: '900', color: '#38bdf8' }}>{formatSoles(topSeller.total_ventas)}</span>
              </div>
              <div style={{ textAlign: 'center', padding: '0.4rem 0.8rem', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: '700' }}>Total Recaudado</span>
                <span style={{ fontSize: '1.15rem', fontWeight: '900', color: '#34d399' }}>{formatSoles(topSeller.total_recaudado)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Ranking Table */}
        <div className="table-container" style={{ border: 'none', padding: '1rem 1.25rem 1.25rem 1.25rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a' }}>
                <th style={{ color: '#ffffff', padding: '0.75rem 1rem', width: '80px', textAlign: 'center', fontWeight: '900', borderBottom: '2px solid #1e293b' }}>PUESTO</th>
                <th style={{ color: '#ffffff', padding: '0.75rem 1rem', fontWeight: '900', borderBottom: '2px solid #1e293b' }}>VENDEDOR / VENDEDORA</th>
                <th style={{ color: '#fef08a', padding: '0.75rem 1rem', textAlign: 'center', width: '180px', fontWeight: '900', borderBottom: '2px solid #1e293b' }}>CONTRATOS CERRADOS</th>
                <th style={{ color: '#38bdf8', padding: '0.75rem 1rem', textAlign: 'right', width: '160px', fontWeight: '900', borderBottom: '2px solid #1e293b' }}>TOTAL CONTRATADO</th>
                <th style={{ color: '#34d399', padding: '0.75rem 1rem', textAlign: 'right', width: '160px', fontWeight: '900', borderBottom: '2px solid #1e293b' }}>TOTAL RECAUDADO</th>
                <th style={{ color: '#fbbf24', padding: '0.75rem 1rem', textAlign: 'center', width: '130px', fontWeight: '900', borderBottom: '2px solid #1e293b' }}>% EFECTIVIDAD</th>
              </tr>
            </thead>
            <tbody>
              {sellers_ranking.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem', fontWeight: '600' }}>
                    Sin contratos ni movimientos registrados para esta semana.
                  </td>
                </tr>
              ) : (
                sellers_ranking.map((s, index) => {
                  let medal = `${index + 1}°`;
                  let rowBg = 'transparent';
                  let medalColor = '#94a3b8';
                  if (index === 0 && s.contracts_count > 0) {
                    medal = '🥇 1°';
                    medalColor = '#eab308';
                    rowBg = 'rgba(234, 179, 8, 0.08)';
                  } else if (index === 1 && s.contracts_count > 0) {
                    medal = '🥈 2°';
                    medalColor = '#cbd5e1';
                    rowBg = 'rgba(203, 213, 225, 0.05)';
                  } else if (index === 2 && s.contracts_count > 0) {
                    medal = '🥉 3°';
                    medalColor = '#d97706';
                    rowBg = 'rgba(217, 119, 6, 0.05)';
                  }

                  return (
                    <tr key={s.seller_name} style={{ backgroundColor: rowBg, borderBottom: '1px solid #1e293b', transition: 'background-color 0.2s' }}>
                      <td style={{ textAlign: 'center', fontWeight: '900', fontSize: '1rem', color: medalColor, padding: '0.75rem 1rem' }}>
                        {medal}
                      </td>
                      <td style={{ fontWeight: '800', color: '#ffffff', padding: '0.75rem 1rem', fontSize: '0.95rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ 
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: index === 0 ? '#eab308' : '#38bdf8'
                          }}></span>
                          {s.seller_name}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.75rem 1rem' }}>
                        <span style={{ 
                          display: 'inline-block',
                          padding: '0.25rem 0.75rem', 
                          borderRadius: '20px', 
                          fontSize: '0.9rem', 
                          fontWeight: '900',
                          backgroundColor: s.contracts_count > 0 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                          color: s.contracts_count > 0 ? '#fef08a' : '#94a3b8',
                          border: s.contracts_count > 0 ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid rgba(148, 163, 184, 0.2)'
                        }}>
                          {s.contracts_count} {s.contracts_count === 1 ? 'contrato' : 'contratos'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', color: '#38bdf8', fontWeight: '800', padding: '0.75rem 1rem' }}>
                        {formatSoles(s.total_ventas)}
                      </td>
                      <td style={{ textAlign: 'right', color: '#34d399', fontWeight: '900', padding: '0.75rem 1rem' }}>
                        {formatSoles(s.total_recaudado)}
                      </td>
                      <td style={{ textAlign: 'center', color: '#fbbf24', fontWeight: '900', padding: '0.75rem 1rem' }}>
                        {s.total_ventas > 0 ? Math.min(100, (s.total_recaudado / s.total_ventas) * 100).toFixed(1) : (s.total_recaudado > 0 ? '100.0' : '0.0')}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* MODAL DE DESCARGA DE REPORTES EJECUTIVOS (SEMANAL / MENSUAL / ANUAL) */}
      {showExportModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            padding: '1.75rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            maxHeight: '92vh',
            overflowY: 'auto'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ background: 'rgba(2, 132, 199, 0.2)', padding: '8px', borderRadius: '10px' }}>
                  <FileText size={22} color="#38bdf8" />
                </div>
                <div>
                  <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.15rem', fontWeight: '900' }}>
                    Descargar Reporte PDF (Horizontal)
                  </h3>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.78rem', marginTop: '0.15rem' }}>
                    Formato horizontal (Landscape) de alta definición gerencial
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '8px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Selector de Frecuencia */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                1. Seleccione la Frecuencia del Reporte:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setModalPeriodType('weekly')}
                  style={{
                    padding: '0.75rem 0.5rem',
                    borderRadius: '10px',
                    border: modalPeriodType === 'weekly' ? '2px solid #0284c7' : '1px solid #334155',
                    backgroundColor: modalPeriodType === 'weekly' ? 'rgba(2, 132, 199, 0.25)' : '#1e293b',
                    color: modalPeriodType === 'weekly' ? '#38bdf8' : '#cbd5e1',
                    fontWeight: '800',
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <span>📅 SEMANAL</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '500' }}>Todo Detallado</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalPeriodType('monthly')}
                  style={{
                    padding: '0.75rem 0.5rem',
                    borderRadius: '10px',
                    border: modalPeriodType === 'monthly' ? '2px solid #10b981' : '1px solid #334155',
                    backgroundColor: modalPeriodType === 'monthly' ? 'rgba(16, 185, 129, 0.25)' : '#1e293b',
                    color: modalPeriodType === 'monthly' ? '#34d399' : '#cbd5e1',
                    fontWeight: '800',
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <span>📊 MENSUAL</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '500' }}>Solo Gráficos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalPeriodType('annual')}
                  style={{
                    padding: '0.75rem 0.5rem',
                    borderRadius: '10px',
                    border: modalPeriodType === 'annual' ? '2px solid #f59e0b' : '1px solid #334155',
                    backgroundColor: modalPeriodType === 'annual' ? 'rgba(245, 158, 11, 0.25)' : '#1e293b',
                    color: modalPeriodType === 'annual' ? '#fbbf24' : '#cbd5e1',
                    fontWeight: '800',
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <span>📈 ANUAL</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '500' }}>12 Meses Gráficos</span>
                </button>
              </div>
            </div>

            {/* Selectores de Periodo */}
            <div style={{ display: 'grid', gridTemplateColumns: modalPeriodType === 'annual' ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
              {modalPeriodType !== 'annual' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: '#94a3b8', marginBottom: '0.35rem' }}>
                    Mes Auditado:
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(parseInt(e.target.value));
                      setSelectedWeekIndex(0);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '8px',
                      backgroundColor: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid #334155',
                      fontWeight: '700',
                      fontSize: '0.86rem'
                    }}
                  >
                    {MONTH_NAMES.map((m, idx) => (
                      <option key={m} value={idx}>{m}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Año Auditado:
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(parseInt(e.target.value));
                    setSelectedWeekIndex(0);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '8px',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    fontWeight: '700',
                    fontSize: '0.86rem'
                  }}
                >
                  {[2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selector de Semana en caso de SEMANAL */}
            {modalPeriodType === 'weekly' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Semana a Exportar (Lunes a Sábado):
                </label>
                <select
                  value={selectedWeekIndex}
                  onChange={(e) => setSelectedWeekIndex(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '8px',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    fontWeight: '700',
                    fontSize: '0.84rem'
                  }}
                >
                  {availableWeeks.map((w, idx) => (
                    <option key={w.id + idx} value={idx}>{w.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Tarjeta Informativa de Estilo y Contenido */}
            <div style={{
              backgroundColor: 'rgba(2, 132, 199, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem'
            }}>
              <CheckCircle2 size={18} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#38bdf8' }}>
                  FORMATO HORIZONTAL (LANDSCAPE) A4 LISTO
                </div>
                <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: '0.2rem', lineHeight: '1.35' }}>
                  {modalPeriodType === 'weekly' && 'Incluye Planilla Diaria, Estado de Cuenta bancario, Balance Global ultra-ancho, Facturas SUNAT, Préstamos y Cronograma.'}
                  {modalPeriodType === 'monthly' && 'Resumen Ejecutivo: Solo gráficos y números totales consolidados (Balance General del mes sin listados kilométricos).'}
                  {modalPeriodType === 'annual' && 'Consolidado Anual: Evolución de 12 meses (Ene-Dic), Gráfico 3 Pilares y Gran Balance Financiero Anual.'}
                </div>
              </div>
            </div>

            {/* Botones de Acción */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                style={{
                  padding: '0.65rem 1.15rem',
                  borderRadius: '10px',
                  backgroundColor: '#334155',
                  color: '#e2e8f0',
                  border: 'none',
                  fontWeight: '700',
                  fontSize: '0.86rem',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleModalExportPDF}
                disabled={exportingModal}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.65rem 1.25rem',
                  borderRadius: '10px',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: '800',
                  fontSize: '0.86rem',
                  cursor: exportingModal ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(5, 150, 105, 0.4)',
                  opacity: exportingModal ? 0.7 : 1
                }}
              >
                <Printer size={16} />
                {exportingModal ? 'Generando Reporte PDF...' : '🖨️ Descargar Reporte PDF Ahora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

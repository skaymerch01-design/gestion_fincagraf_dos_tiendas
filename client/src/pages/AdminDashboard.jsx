import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../utils/api';
import {
  Eye,
  ShoppingBag,
  Clock,
  Landmark,
  Layers,
  FileSpreadsheet,
  Download,
  HardDrive,
  Shield,
  FileText,
  Lock,
  CheckCircle2,
  Calendar,
  X,
  Printer,
  HandCoins,
  Calculator,
  KeyRound,
  EyeOff,
  Upload
} from 'lucide-react';

import PlanillaIngresosEgresos from '../components/PlanillaIngresosEgresos';
import CronogramaPagosTab from '../tabs/CronogramaPagosTab';
import EstadoCuentaTab from '../tabs/EstadoCuentaTab';
import BalanceGlobalTab from '../tabs/BalanceGlobalTab';
import SunatTab from '../tabs/SunatTab';
import PrestamosPersonalesTab from '../tabs/PrestamosPersonalesTab';
import PinkCalculator from '../components/PinkCalculator';
import PendingObservationsBanner from '../components/PendingObservationsBanner';
import { generateExecutivePDF, checkReportUnlockStatus } from '../utils/pdfGenerator';

const MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

const YEAR_OPTIONS = [2026, 2027, 2028, 2029, 2030];

export default function AdminDashboard() {
  const currentDate = new Date();
  const [activeTab, setActiveTab] = useState(0); // 0 = Planilla Sincronizada (En Vivo), 1..6 = Admin Tabs
  const [selectedStoreId, setSelectedStoreId] = useState(1); // 1 = Tienda 1, 2 = Tienda 2
  const [backupStatus, setBackupStatus] = useState(null);
  const [isCalcOpen, setIsCalcOpen] = useState(false);

  useEffect(() => {
    const handleJump = (e) => {
      const { category } = e.detail || {};
      if (category === 'CONTRATO') {
        setActiveTab(3); // Balance Global
      } else if (category === 'BANCO') {
        setActiveTab(2); // Estado de Cuenta
      } else {
        setActiveTab(0); // Planilla Diaria
      }
    };
    window.addEventListener('fincagraf_jump_to_item', handleJump);
    return () => window.removeEventListener('fincagraf_jump_to_item', handleJump);
  }, []);

  // Users, Name & Password Management Modal State
  const [showUserModal, setShowUserModal] = useState(false);
  const [userList, setUserList] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [confirmPasswordVal, setConfirmPasswordVal] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [updatingPass, setUpdatingPass] = useState(false);

  const applySelectedUser = (uId, list = userList) => {
    setSelectedUserId(uId);
    const u = list.find(x => String(x.id) === String(uId));
    if (u) {
      setEditFullName(u.full_name || '');
      setEditUsername(u.username || '');
    }
    setNewPasswordVal('');
    setConfirmPasswordVal('');
  };

  const fetchUsersList = async () => {
    try {
      const res = await apiFetch('/admin/users');
      if (res.success) {
        // Only show the first 2 accounts (admin + main vendedora account), not the generic 3rd account
        const list = (res.users || []).slice(0, 2);
        setUserList(list);
        if (list.length > 0) {
          const current = list.find(x => String(x.id) === String(selectedUserId)) || list[0];
          applySelectedUser(current.id, list);
        }
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const handleOpenUserModal = () => {
    setShowUserModal(true);
    fetchUsersList();
  };

  const handleAdminUpdateUser = async (e) => {
    e.preventDefault();
    if (!selectedUserId) return alert('Seleccione una cuenta a modificar.');
    if (!editFullName.trim()) return alert('El Nombre Completo no puede estar vacío.');
    if (!editUsername.trim()) return alert('El Nombre de Usuario no puede estar vacío.');

    if (newPasswordVal.trim()) {
      if (newPasswordVal.trim().length < 4) {
        return alert('La nueva contraseña debe tener al menos 4 caracteres.');
      }
      if (newPasswordVal !== confirmPasswordVal) {
        return alert('Las contraseñas no coinciden.');
      }
    }

    setUpdatingPass(true);
    try {
      const body = {
        full_name: editFullName.trim(),
        username: editUsername.trim().toLowerCase()
      };
      if (newPasswordVal.trim()) {
        body.newPassword = newPasswordVal.trim();
      }

      const res = await apiFetch(`/admin/users/${selectedUserId}/reset-password`, {
        method: 'PUT',
        body
      });

      if (res.success) {
        alert(res.message || 'Datos de la cuenta actualizados con éxito.');
        setNewPasswordVal('');
        setConfirmPasswordVal('');
        setShowUserModal(false);
        fetchUsersList();
      } else {
        alert(res.error || 'Error al actualizar cuenta.');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdatingPass(false);
    }
  };

  // PDF Export Modal State
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfPeriodType, setPdfPeriodType] = useState('weekly'); // 'weekly' | 'monthly' | 'annual'
  const [selectedYear, setSelectedYear] = useState(Math.max(2026, currentDate.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth()); // 0 to 11
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Semanas calculadas para el mes y año seleccionado (Lunes a Sábado)
  const availableWeeks = useMemo(() => {
    const weeks = [];
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const seenMondays = new Set();

    // Semana activa en curso
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

  const fetchBackupStatus = async () => {
    try {
      const res = await apiFetch('/backup/status');
      if (res.success) {
        setBackupStatus(res);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchBackupStatus();
  }, []);

  const handleDownloadBackup = async () => {
    const token = localStorage.getItem('fincagraf_token');
    if (!token) return alert('Debe iniciar sesión para descargar la copia de seguridad.');
    try {
      const res = await fetch(`/api/backup/download?token=${encodeURIComponent(token)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        let msg = 'Error al descargar la copia de seguridad.';
        try {
          const errData = await res.json();
          if (errData && errData.error) msg = errData.error;
        } catch (_) {}
        return alert(msg);
      }
      const disposition = res.headers.get('content-disposition');
      let downloadFilename = `fincagraf_backup_${new Date().toISOString().split('T')[0]}.json`;
      if (disposition && disposition.includes('filename=')) {
        const matches = /filename="?([^"]+)"?/.exec(disposition);
        if (matches && matches[1]) downloadFilename = matches[1];
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert('Error en la descarga: ' + err.message);
    }
  };

  const [restoringBackup, setRestoringBackup] = useState(false);
  const handleRestoreBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm(`¿Desea restaurar la base de datos con el archivo "${file.name}"? Los datos actuales serán reemplazados por los de esta copia.`)) {
      e.target.value = '';
      return;
    }

    setRestoringBackup(true);
    const formData = new FormData();
    formData.append('backup_file', file);

    try {
      const res = await apiFetch('/backup/restore', {
        method: 'POST',
        body: formData,
        timeout: 60000,
      });

      if (res.success) {
        alert(res.message || 'Copia de seguridad restaurada correctamente.');
        window.location.reload();
      } else {
        alert(res.error || 'Error al restaurar copia.');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setRestoringBackup(false);
      e.target.value = '';
    }
  };

  const tabs = [
    { id: 0, name: 'Planilla Vendedora (En Vivo)', icon: Eye, color: '#22c55e' },
    { id: 1, name: '1. Cronograma de Pago', icon: Clock, color: '#a855f7' },
    { id: 2, name: '2. Estado de Cuenta', icon: Landmark, color: '#38bdf8' },
    { id: 3, name: '3. Balance Global', icon: Layers, color: '#10b981' },
    { id: 4, name: '4. Facturas Compras / Ventas', icon: FileSpreadsheet, color: '#34d399' },
    { id: 5, name: '5. Préstamos Personales', icon: HandCoins, color: '#f59e0b' },
  ];

  // Check Unlock status for selected period type
  const unlockStatus = checkReportUnlockStatus(pdfPeriodType, selectedYear, selectedMonth);

  // Handle Generating Executive PDF Report
  const handleExportPDF = async () => {
    if (!unlockStatus.isUnlocked) {
      return alert(`🔒 Este reporte estará disponible para descarga 1 día después de terminar el periodo (${unlockStatus.unlockDateStr}).`);
    }

    setExporting(true);
    try {
      const monthStr = String(selectedMonth + 1).padStart(2, '0');
      const periodStr = `${selectedYear}-${monthStr}`;
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

      let periodTitle = `Semana Actual Auditada`;
      let weeklyStartDate = '';
      let weeklyEndDate = '';

      if (pdfPeriodType === 'weekly') {
        const chosenWeek = availableWeeks[selectedWeekIndex] || availableWeeks[0];
        weeklyStartDate = chosenWeek.startDate;
        weeklyEndDate = chosenWeek.endDate;
        periodTitle = `Semana Auditada: ${chosenWeek.startDate} al ${chosenWeek.endDate}`;
      } else if (pdfPeriodType === 'monthly') {
        periodTitle = `Mes de ${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
      } else if (pdfPeriodType === 'annual') {
        periodTitle = `Año Completo ${selectedYear}`;
      }

      // 1. Fetch data across tabs tailored to periodType
      let dailySheetRes = null;
      let expensesRes = null;
      let scheduleRes = null;
      let bankRes = null;
      let contractsRes = null;
      let contractsMonthlyReport = null;
      let contractsAnnualReport = null;
      let sunatStatsRes = null;
      let sunatInvoicesRes = null;
      let staffLoansRes = null;

      if (pdfPeriodType === 'weekly') {
        const [dSheet, exps, bank, contrs, sInvoices, loans, sched] = await Promise.all([
          apiFetch(`/daily-sheet/weekly-report?startDate=${weeklyStartDate}&endDate=${weeklyEndDate}`),
          apiFetch(`/expenses?startDate=${weeklyStartDate}&endDate=${weeklyEndDate}`),
          apiFetch(`/bank-reconciliation?startDate=${weeklyStartDate}&endDate=${weeklyEndDate}`),
          apiFetch(`/contracts?startDate=${weeklyStartDate}&endDate=${weeklyEndDate}`),
          apiFetch(`/sunat/invoices?period=${periodStr}`),
          apiFetch(`/staff-loans`),
          apiFetch(`/payment-schedule`)
        ]);
        dailySheetRes = dSheet;
        expensesRes = exps;
        bankRes = bank;
        contractsRes = contrs;
        sunatInvoicesRes = sInvoices;
        staffLoansRes = loans;
        scheduleRes = sched;
      } else if (pdfPeriodType === 'monthly') {
        const monthStart = `${selectedYear}-${monthStr}-01`;
        const monthEnd = `${selectedYear}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;
        const [cMonthRep, exps, bank, contrs, sInvoices, loans, sched] = await Promise.all([
          apiFetch(`/contracts/monthly-report?year=${selectedYear}&month=${selectedMonth}`),
          apiFetch(`/expenses?startDate=${monthStart}&endDate=${monthEnd}`),
          apiFetch(`/bank-reconciliation?startDate=${monthStart}&endDate=${monthEnd}`),
          apiFetch(`/contracts?year=${selectedYear}&month=${selectedMonth}`),
          apiFetch(`/sunat/invoices?period=${periodStr}`),
          apiFetch(`/staff-loans?year=${selectedYear}&month=${selectedMonth}`),
          apiFetch(`/payment-schedule`)
        ]);
        contractsMonthlyReport = cMonthRep;
        expensesRes = exps;
        bankRes = bank;
        contractsRes = contrs;
        sunatInvoicesRes = sInvoices;
        staffLoansRes = loans;
        scheduleRes = sched;
      } else if (pdfPeriodType === 'annual') {
        const yearStart = `${selectedYear}-01-01`;
        const yearEnd = `${selectedYear}-12-31`;
        const [cAnnualRep, exps, contrs, sStats, loans, sched] = await Promise.all([
          apiFetch(`/contracts/annual-report?year=${selectedYear}`),
          apiFetch(`/expenses?startDate=${yearStart}&endDate=${yearEnd}`),
          apiFetch(`/contracts?year=${selectedYear}`),
          apiFetch(`/sunat/stats?year=${selectedYear}`),
          apiFetch(`/staff-loans?year=${selectedYear}`),
          apiFetch(`/payment-schedule`)
        ]);
        contractsAnnualReport = cAnnualRep;
        expensesRes = exps;
        contractsRes = contrs;
        sunatStatsRes = sStats;
        staffLoansRes = loans;
        scheduleRes = sched;
      }

      // Calculate detailed SUNAT stats
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

      // Generate PDF
      generateExecutivePDF({
        periodType: pdfPeriodType,
        periodTitle,
        selectedYear,
        selectedMonth,
        adminName: 'Administrador Principal',
        dailyData: dailySheetRes,
        expensesData: expensesRes?.expenses || [],
        scheduleData: scheduleRes?.schedules || [],
        bankData: bankRes?.entries || [],
        contractsData: contractsRes?.contracts || [],
        contractsMonthlyReport,
        contractsAnnualReport,
        sunatData,
        sunatStats: sunatStatsRes,
        sunatInvoices: sunatInvoicesRes?.invoices || [],
        staffLoansData: staffLoansRes?.loans || []
      });

      setShowPdfModal(false);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Error al recopilar información para el PDF: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ width: '95%', maxWidth: '1800px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Calculadora Rosada Flotante (Global para Administrador) */}
      <PinkCalculator isOpen={isCalcOpen} onClose={() => setIsCalcOpen(false)} />

      {/* Top Admin Header */}
      <div className="card" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        gap: '1rem',
        backgroundColor: 'var(--bg-card)',
        padding: '0.65rem 1.25rem'
      }}>
        {/* Title + subtitle compact inline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
          <Shield size={22} color="#38bdf8" />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#38bdf8', whiteSpace: 'nowrap' }}>
              Panel Principal de Administración
            </span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
              (Auditoría en vivo + Gestión Gerencial)
            </span>
          </div>
        </div>

        {/* Action Buttons Header - ALL in one row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'nowrap' }}>
          {/* Botón Icono Calculadora Rosada */}
          <button
            onClick={() => setIsCalcOpen(!isCalcOpen)}
            style={{
              background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: isCalcOpen ? '0 0 20px rgba(236, 72, 153, 0.9)' : '0 4px 15px rgba(236, 72, 153, 0.4)',
              flexShrink: 0
            }}
            title="Calculadora Rosada (Global)"
          >
            <Calculator size={18} color="#ffffff" />
          </button>

          {/* Botón Gestión de Claves y Seguridad */}
          <button
            onClick={handleOpenUserModal}
            className="btn"
            style={{
              backgroundColor: '#1e293b',
              color: '#38bdf8',
              border: '1.5px solid #38bdf8',
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.75rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.82rem',
              whiteSpace: 'nowrap'
            }}
            title="Cambiar o recuperar contraseñas"
          >
            <KeyRound size={15} color="#38bdf8" /> 🔑 Claves y Seguridad
          </button>

          {/* Executive PDF Report Export Button */}
          <button
            onClick={() => setShowPdfModal(true)}
            className="btn btn-primary"
            style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
          >
            <FileText size={15} color="#ffffff" /> 📄 Exportar Reporte PDF (Jefe)
          </button>

          {/* Database Backup Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#0f172a', padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1.5px solid #334155', whiteSpace: 'nowrap' }}>
            <HardDrive size={15} color="#10b981" />
            <span style={{ fontSize: '0.75rem', color: '#f8fafc', fontWeight: '800' }}>
              {backupStatus ? `BD: ${backupStatus.dbSizeMB} MB` : 'BD: Nube (Activa)'}
            </span>
            <span style={{ fontSize: '0.68rem', color: '#34d399', fontWeight: '700' }}>🟢 Nube</span>
            <button onClick={handleDownloadBackup} className="btn btn-secondary btn-sm" title="Descargar Copia de Respaldo" style={{ fontWeight: '800', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
              <Download size={12} /> Descargar DB
            </button>
            <label
              className="btn btn-secondary btn-sm"
              style={{
                fontWeight: '800',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                cursor: restoringBackup ? 'not-allowed' : 'pointer',
                opacity: restoringBackup ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                margin: 0
              }}
              title="Restaurar base de datos desde un archivo (.db o .json)"
            >
              <Upload size={12} color="#38bdf8" /> {restoringBackup ? 'Restaurando...' : 'Restaurar DB'}
              <input
                type="file"
                accept=".db,.sqlite,.json"
                onChange={handleRestoreBackup}
                disabled={restoringBackup}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Banner de Observaciones Pendientes y Descargos para el Administrador */}
      <PendingObservationsBanner isAdmin={true} />

      {/* Modern High-End Tabs Navigation Bar */}
      <div style={{
        display: 'flex',
        gap: '0.65rem',
        overflowX: 'auto',
        padding: '0.5rem',
        backgroundColor: '#0f172a',
        borderRadius: '16px',
        border: '1.5px solid #1e293b',
        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)'
      }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.55rem',
                padding: '0.75rem 1.25rem',
                fontWeight: isActive ? '900' : '700',
                fontSize: '0.92rem',
                borderRadius: '12px',
                border: isActive ? '1.5px solid #38bdf8' : '1px solid #334155',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                backgroundColor: isActive ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : '#1e293b',
                background: isActive ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : '#1e293b',
                color: isActive ? '#ffffff' : '#cbd5e1',
                boxShadow: isActive ? '0 4px 18px rgba(2, 132, 199, 0.45)' : 'none',
                transform: isActive ? 'translateY(-1px)' : 'none',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={19} color={isActive ? '#ffffff' : tab.color} />
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* SELECTOR DE TIENDA ACTIVA (Para que el Administrador seleccione qué tienda llenar o consultar) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.85rem',
        backgroundColor: '#0b1329',
        border: selectedStoreId === 1 ? '2.5px solid #0284c7' : '2.5px solid #8b5cf6',
        borderRadius: '14px',
        padding: '0.75rem 1.25rem',
        boxShadow: selectedStoreId === 1 ? '0 6px 25px rgba(2, 132, 199, 0.35)' : '0 6px 25px rgba(139, 92, 246, 0.35)',
        transition: 'all 0.3s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <div style={{
            fontSize: '0.92rem',
            fontWeight: '900',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            letterSpacing: '0.04em'
          }}>
            🏪 SELECCIONAR TIENDA A GESTIONAR / LLENAR:
          </div>
          <span style={{
            fontSize: '0.82rem',
            fontWeight: '900',
            padding: '0.25rem 0.75rem',
            borderRadius: '6px',
            backgroundColor: selectedStoreId === 1 ? 'rgba(34, 197, 94, 0.18)' : 'rgba(168, 85, 247, 0.18)',
            color: selectedStoreId === 1 ? '#4ade80' : '#c084fc',
            border: selectedStoreId === 1 ? '1.5px solid #22c55e' : '1.5px solid #a855f7'
          }}>
            {selectedStoreId === 1 ? '🟢 Viendo y Editando: TIENDA 1' : '🟣 Viendo y Editando: TIENDA 2'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setSelectedStoreId(1)}
            style={{
              padding: '0.6rem 1.4rem',
              borderRadius: '10px',
              border: selectedStoreId === 1 ? '2px solid #38bdf8' : '1.5px solid #334155',
              backgroundColor: selectedStoreId === 1 ? '#0284c7' : '#1e293b',
              color: '#ffffff',
              fontWeight: '900',
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: selectedStoreId === 1 ? '0 0 18px rgba(2, 132, 199, 0.7)' : 'none',
              transform: selectedStoreId === 1 ? 'scale(1.04)' : 'scale(1)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            🏢 TIENDA 1
          </button>

          <button
            type="button"
            onClick={() => setSelectedStoreId(2)}
            style={{
              padding: '0.6rem 1.4rem',
              borderRadius: '10px',
              border: selectedStoreId === 2 ? '2px solid #c084fc' : '1.5px solid #334155',
              backgroundColor: selectedStoreId === 2 ? '#7e22ce' : '#1e293b',
              color: '#ffffff',
              fontWeight: '900',
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: selectedStoreId === 2 ? '0 0 18px rgba(126, 34, 206, 0.7)' : 'none',
              transform: selectedStoreId === 2 ? 'scale(1.04)' : 'scale(1)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            🏬 TIENDA 2
          </button>
        </div>
      </div>

      {/* Render Selected View */}
      <div style={{ minHeight: '500px' }}>
        {activeTab === 0 && <PlanillaIngresosEgresos key={selectedStoreId} storeId={selectedStoreId} readOnly={false} />}
        {activeTab === 1 && <CronogramaPagosTab storeId={selectedStoreId} />}
        {activeTab === 2 && <EstadoCuentaTab storeId={selectedStoreId} />}
        {activeTab === 3 && <BalanceGlobalTab storeId={selectedStoreId} />}
        {activeTab === 4 && <SunatTab />}
        {activeTab === 5 && <PrestamosPersonalesTab />}
      </div>

      {/* MODAL EXPORTAR REPORTE EJECUTIVO PDF PARA GERENCIA */}
      {showPdfModal && (
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
            maxWidth: '620px',
            backgroundColor: '#0f172a',
            border: '2px solid #38bdf8',
            boxShadow: '0 25px 50px rgba(0,0,0,0.95)',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={22} /> Generar Reporte Ejecutivo PDF (Para el Jefe / Gerencia)
              </h3>
              <button onClick={() => setShowPdfModal(false)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Type Selection Tabs */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#ffffff', marginBottom: '0.5rem', display: 'block' }}>
                  1. Seleccione la Frecuencia del Reporte Financiero:
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setPdfPeriodType('weekly')}
                    style={{
                      padding: '0.75rem 0.5rem',
                      borderRadius: '8px',
                      border: pdfPeriodType === 'weekly' ? '2px solid #38bdf8' : '1px solid #334155',
                      backgroundColor: pdfPeriodType === 'weekly' ? '#0284c7' : '#1e293b',
                      color: '#ffffff',
                      fontWeight: '900',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <span>📅 SEMANAL</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 'normal', color: '#cbd5e1' }}>Cualquier Semana</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPdfPeriodType('monthly')}
                    style={{
                      padding: '0.75rem 0.5rem',
                      borderRadius: '8px',
                      border: pdfPeriodType === 'monthly' ? '2px solid #10b981' : '1px solid #334155',
                      backgroundColor: pdfPeriodType === 'monthly' ? '#059669' : '#1e293b',
                      color: '#ffffff',
                      fontWeight: '900',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <span>📊 MENSUAL</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 'normal', color: '#cbd5e1' }}>1 Día pos-cierre</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPdfPeriodType('annual')}
                    style={{
                      padding: '0.75rem 0.5rem',
                      borderRadius: '8px',
                      border: pdfPeriodType === 'annual' ? '2px solid #f59e0b' : '1px solid #334155',
                      backgroundColor: pdfPeriodType === 'annual' ? '#d97706' : '#1e293b',
                      color: '#ffffff',
                      fontWeight: '900',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <span>📈 ANUAL</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 'normal', color: '#cbd5e1' }}>1 Día pos-año</span>
                  </button>
                </div>
              </div>

              {/* Period Selectors */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: pdfPeriodType === 'annual' ? '1fr' : '1fr 1fr',
                gap: '0.75rem',
                backgroundColor: '#1e293b',
                padding: '1rem',
                borderRadius: '8px'
              }}>
                {pdfPeriodType !== 'annual' && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ color: '#ffffff', fontWeight: '800' }}>Mes Auditado:</label>
                    <select
                      className="form-select"
                      value={selectedMonth}
                      onChange={(e) => {
                        setSelectedMonth(parseInt(e.target.value));
                        setSelectedWeekIndex(0);
                      }}
                    >
                      {MONTH_NAMES.map((mName, idx) => (
                        <option key={idx} value={idx}>{mName}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ color: '#ffffff', fontWeight: '800' }}>Año Auditado:</label>
                  <select
                    className="form-select"
                    value={selectedYear}
                    onChange={(e) => {
                      setSelectedYear(parseInt(e.target.value));
                      setSelectedWeekIndex(0);
                    }}
                  >
                    {YEAR_OPTIONS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                {pdfPeriodType === 'weekly' && (
                  <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                    <label className="form-label" style={{ color: '#38bdf8', fontWeight: '800' }}>
                      Semana a Exportar (Lunes a Sábado):
                    </label>
                    <select
                      className="form-select"
                      value={selectedWeekIndex}
                      onChange={(e) => setSelectedWeekIndex(parseInt(e.target.value))}
                      style={{ border: '2px solid #0284c7', backgroundColor: '#0f172a' }}
                    >
                      {availableWeeks.map((w, idx) => (
                        <option key={w.id || idx} value={idx}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Unlock Status Badge Rule */}
              <div style={{
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                backgroundColor: unlockStatus.isUnlocked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1.5px solid ${unlockStatus.isUnlocked ? '#10b981' : '#ef4444'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <CheckCircle2 size={22} color="#34d399" />
                <div>
                  <div style={{ color: '#34d399', fontWeight: '900', fontSize: '0.85rem' }}>
                    🟢 {unlockStatus.isPreliminary ? 'REPORTE PRELIMINAR / AVANCE AL CORTE DISPONIBLE' : 'REPORTE CONSOLIDADO AUDITADO DISPONIBLE'}
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>
                    {unlockStatus.isPreliminary
                      ? `Periodo en curso con corte en tiempo real. ${unlockStatus.unlockDateStr}`
                      : `El periodo ${pdfPeriodType === 'weekly' ? 'semanal' : pdfPeriodType === 'monthly' ? 'mensual' : 'anual'} está cerrado y listo para generar el PDF consolidado con gráficos en alta definición.`}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowPdfModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExportPDF}
                  disabled={!unlockStatus.isUnlocked || exporting}
                  className="btn btn-success"
                  style={{ fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.25rem' }}
                >
                  <Printer size={16} />
                  {exporting ? 'Generando PDF...' : '📄 Descargar Reporte PDF Ahora'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTIÓN DE SEGURIDAD Y CAMBIO DE CONTRASEÑAS */}
      {showUserModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '520px', backgroundColor: '#0f172a', border: '2px solid #38bdf8', padding: '1.5rem', boxShadow: '0 25px 50px rgba(0,0,0,0.95)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '900', color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <KeyRound size={22} /> Cambio y Recuperación de Contraseñas
              </h3>
              <button onClick={() => setShowUserModal(false)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            {/* Default Access Reminder Banner */}
            <div style={{ backgroundColor: '#1e293b', border: '1px solid #3b82f6', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
              <div style={{ color: '#93c5fd', fontWeight: '900', marginBottom: '0.2rem' }}>💡 ACCESOS ACTIVOS DEL SISTEMA:</div>
              <div style={{ color: '#cbd5e1' }}>• <strong>Administrador:</strong> Usuario actual en BD</div>
              <div style={{ color: '#cbd5e1' }}>• <strong>Vendedora (Carla):</strong> Usuario actual en BD</div>
            </div>

            <form onSubmit={handleAdminUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ color: '#ffffff', fontWeight: '800' }}>Seleccione la Cuenta a Modificar:</label>
                <select
                  className="form-select"
                  value={selectedUserId}
                  onChange={(e) => applySelectedUser(e.target.value)}
                  style={{ fontWeight: 'bold' }}
                >
                  {userList.map((u) => (
                    <option key={u.id} value={u.id}>
                      👤 {u.full_name} ({u.username}) — Rol: {u.role.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nombre Completo y Usuario */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ color: '#ffffff', fontWeight: '800' }}>Nombre Completo / Titular:</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: Vendedora Principal"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ color: '#ffffff', fontWeight: '800' }}>Usuario (para Login):</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: vendedora"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Sección Contraseña Opcional */}
              <div style={{ borderTop: '1px solid #1e293b', paddingTop: '0.65rem', marginTop: '0.2rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '700', marginBottom: '0.65rem' }}>
                  🔑 Cambio de Contraseña <span style={{ color: '#64748b', fontWeight: 'normal' }}>(Opcional — deje en blanco si solo cambia nombre o usuario):</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ color: '#cbd5e1', fontWeight: '700', fontSize: '0.8rem' }}>Nueva Contraseña:</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showNewPass ? 'text' : 'password'}
                        className="form-input"
                        style={{ paddingRight: '2.5rem' }}
                        placeholder="Dejar vacío para no cambiar..."
                        value={newPasswordVal}
                        onChange={(e) => setNewPasswordVal(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        style={{
                          position: 'absolute',
                          right: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: showNewPass ? '#38bdf8' : '#94a3b8',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title={showNewPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showNewPass ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ color: '#cbd5e1', fontWeight: '700', fontSize: '0.8rem' }}>Confirmar Contraseña:</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showConfirmPass ? 'text' : 'password'}
                        className="form-input"
                        style={{ paddingRight: '2.5rem' }}
                        placeholder="Repita nueva contraseña..."
                        value={confirmPasswordVal}
                        onChange={(e) => setConfirmPasswordVal(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                        style={{
                          position: 'absolute',
                          right: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: showConfirmPass ? '#38bdf8' : '#94a3b8',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title={showConfirmPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showConfirmPass ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowUserModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={updatingPass} className="btn btn-primary" style={{ fontWeight: '900' }}>
                  {updatingPass ? 'Guardando...' : '💾 Guardar Cambios de Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { formatSoles } from '../utils/format';
import {
  Landmark,
  Plus,
  PlusCircle,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  X,
  Upload,
  MessageSquare,
  ZoomIn,
  RotateCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Zap,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  Trash2,
  Grid,
  List,
  Move,
  Save,
  FileText,
  Download,
  Search,
  Minimize2,
  Maximize2,
  FileSpreadsheet,
  Pin,
  Bell,
  Send,
  Check,
  Ban
} from 'lucide-react';

// ─── Utilidades de Formato de Fecha ──────────────────────────────────────────
export const formatDateDisplay = (dateVal) => {
  if (!dateVal) return '—';
  const clean = String(dateVal).split('T')[0].trim();
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    if (parts[2].length === 4) {
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
    }
  }
  return clean;
};

export const formatDateInput = (dateVal) => {
  if (!dateVal) return '';
  const clean = String(dateVal).split('T')[0].trim();
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }
  return clean;
};

const getLocalDateStr = (dateInput = new Date()) => {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function EstadoCuentaTab() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid');

  // Bank Weekly Opening State (Saldo Inicial de Banco)
  const [bankOpening, setBankOpening] = useState(0);
  const [bankOpeningNotes, setBankOpeningNotes] = useState('');
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [openingInput, setOpeningInput] = useState('');
  const [openingNotesInput, setOpeningNotesInput] = useState('');
  const [savingOpening, setSavingOpening] = useState(false); // 'grid' (2 Columnas) o 'table'

  // Batch Upload Modal State
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchFiles, setBatchFiles] = useState([]);
  const [uploadingBatch, setUploadingBatch] = useState(false);

  // Fast Split-Screen Carousel Fill Modal State (Por Capturas)
  const [showFillModal, setShowFillModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [editingFillId, setEditingFillId] = useState(null);

  // Image Drag / Pan State for Hand Grab Motion (Manito interactiva)
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Single Edit Modal State
  const [editingItem, setEditingItem] = useState(null);

  // Audit Modal State (Para poner nota a la vendedora)
  const [auditingItem, setAuditingItem] = useState(null);
  const [auditStatus, setAuditStatus] = useState('VERIFICADO');
  const [auditNote, setAuditNote] = useState('');

  // Notify Vendedora Modal State (Stick de Notas con Alarma)
  const [notifyModalItem, setNotifyModalItem] = useState(null);
  const [notifyNote, setNotifyNote] = useState('');
  const [sendingNotify, setSendingNotify] = useState(false);
  const [notifyOnSave, setNotifyOnSave] = useState(false);

  const openNotifyVendedoraModal = (item) => {
    setNotifyModalItem(item);
    const isIngreso = item.transaction_type === 'INGRESO';
    const amountStr = Number(item.amount || 0).toFixed(2);
    const bName = item.bank_name || 'BANCO';
    const detailPart = item.notes ? ` (${item.notes})` : (item.reference_code ? ` (Ref: ${item.reference_code})` : '');
    
    const defaultMsg = isIngreso
      ? `Por favor registrar este ingreso de S/ ${amountStr} [${bName}${detailPart}] en tu Planilla Diaria de Ingresos.`
      : `Por favor registrar este gasto/egreso de S/ ${amountStr} [${bName}${detailPart}] en tu Planilla Diaria de Egresos.`;
    setNotifyNote(defaultMsg);
  };

  const handleSendNotifyVendedora = async (e) => {
    if (e) e.preventDefault();
    if (!notifyModalItem) return;
    if (!notifyNote.trim()) {
      return alert('Debe ingresar un mensaje o indicación para la vendedora.');
    }
    setSendingNotify(true);
    try {
      const targetId = notifyModalItem.id;
      const cleanNote = notifyNote.trim();

      // Actualización optimista inmediata
      setEntries(prev => prev.map(it => it.id === targetId ? { ...it, status: 'OBSERVADO', audit_note: cleanNote } : it));
      setNotifyModalItem(null);

      await apiFetch(`/bank-reconciliation/${targetId}/verify`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'OBSERVADO',
          audit_note: cleanNote,
        }),
      });
      alert('📌 ¡Alarma y Stick de Nota enviados a la vendedora con éxito!');
    } catch (err) {
      alert('Error al enviar aviso a la vendedora: ' + err.message);
    } finally {
      setSendingNotify(false);
    }
  };

  // Form Fields State (para agregar/editar movimientos)
  const [paymentType, setPaymentType] = useState('TRANSFERENCIA'); // TRANSFERENCIA, YAPE, POS
  const [transactionType, setTransactionType] = useState('INGRESO'); // INGRESO, EGRESO
  const [amount, setAmount] = useState('');
  const [conceptNote, setConceptNote] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [transactionDate, setTransactionDate] = useState(getLocalDateStr());
  const [submitting, setSubmitting] = useState(false);
  const [inlineForms, setInlineForms] = useState({});
  const [savingInlineId, setSavingInlineId] = useState(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);

  // Llenado Directo Inline (Opción A - Registro sin Modales)
  const handleInlineChange = (id, field, value) => {
    setInlineForms(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }));
  };

  const handleSaveInlineRow = async (item) => {
    const form = inlineForms[item.id] || {};
    const rawAmount = form.amount !== undefined ? form.amount : (item.amount > 0 ? String(item.amount) : '');
    const numAmount = parseFloat(rawAmount || 0);

    if (isNaN(numAmount) || numAmount <= 0) {
      return alert('⚠️ Ingrese un monto válido mayor a 0 S/.');
    }

    setSavingInlineId(item.id);

    const payload = {
      bank_name: form.bank_name || item.bank_name || 'TRANSFERENCIA',
      transaction_type: form.transaction_type || item.transaction_type || 'INGRESO',
      amount: numAmount,
      notes: form.notes !== undefined ? (form.notes !== null ? String(form.notes).trim() : '') : (item.notes && !item.notes.startsWith('Captura #') ? item.notes : ''),
      date: form.date || item.date || startDate,
      status: item.status && item.status !== 'ANULADO' ? item.status : 'PENDIENTE'
    };

    try {
      const res = await apiFetch(`/bank-reconciliation/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      if (res.success && res.entry) {
        // Update local entries array in React state immediately for instant UI persistence!
        setEntries(prevEntries =>
          prevEntries.map(e => e.id === item.id ? { ...e, ...res.entry } : e)
        );
      }

      // Clear draft for this item now that entries state is updated with saved data
      setInlineForms(prev => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });

      setSaveSuccessMsg(`🎉 ¡Movimiento #${item.id} (S/ ${numAmount.toFixed(2)}) guardado exitosamente!`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);

      fetchBankEntries();
    } catch (err) {
      alert('Error al guardar movimiento: ' + err.message);
    } finally {
      setSavingInlineId(null);
    }
  };

  // Focus ref for rapid typing & wheel zoom container ref
  const amountInputRef = useRef(null);
  const fillImageContainerRef = useRef(null);

  // Fullscreen Image Viewer
  const [viewImage, setViewImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Requerimiento 1: Rueda del mouse (Scroll Wheel) funciona como Zoom
  useEffect(() => {
    const el = fillImageContainerRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoom((prev) => Math.min(prev + 0.18, 4.0));
      } else {
        setZoom((prev) => Math.max(prev - 0.18, 0.4));
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [showFillModal, currentImageIndex]);

  // Drag / Pan Handlers for Interactive Image Moving
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPanPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const resetImageTransform = () => {
    setZoom(1);
    setRotation(0);
    setPanPosition({ x: 0, y: 0 });
  };

  // Helper para distinguir colores según el Tipo de Pago
  const getPaymentTypeBadgeStyle = (bankName) => {
    const name = (bankName || '').toUpperCase();
    if (name.includes('YAPE') || name.includes('PLIN')) {
      return { backgroundColor: '#7c3aed', color: '#ffffff' }; // Morado Yape
    } else if (name.includes('POS') || name.includes('TARJETA') || name.includes('IZIPAY')) {
      return { backgroundColor: '#d97706', color: '#ffffff' }; // Naranja / Ámbar POS
    } else if (name.includes('RETIRO') || name.includes('EFECTIVO')) {
      return { backgroundColor: '#059669', color: '#ffffff' }; // Verde Esmeralda Retiro Efectivo
    } else {
      return { backgroundColor: '#0284c7', color: '#ffffff' }; // Azul Transferencia
    }
  };

  // Calculate Week Days (Monday to Saturday)
  const getWeekDays = () => {
    const now = new Date();
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
      const dateStr = getLocalDateStr(d);
      const dayNum = String(d.getDate()).padStart(2, '0');
      const monthNum = String(d.getMonth() + 1).padStart(2, '0');
      days.push({
        name: `${dayNames[i]} ${dayNum}/${monthNum}`,
        dateStr,
      });
    }
    return days;
  };

  const weekDays = getWeekDays();
  const isEarliestWeek = weekDays[0] && weekDays[0].dateStr <= '2026-09-28';
  const startDate = weekDays[0].dateStr;
  const endDate = weekDays[5].dateStr;

  // Estado para el botón flotante "Volver Arriba" (Scroll to Top)
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 250);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchBankEntries = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/bank-reconciliation?startDate=${startDate}&endDate=${endDate}`);
      if (res.success) {
        setEntries(res.entries);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchWeeklyOpening = async (targetStartDate = startDate) => {
    try {
      const res = await apiFetch(`/bank-reconciliation/opening?weekStart=${targetStartDate}`);
      if (res && res.success && res.opening) {
        setBankOpening(parseFloat(res.opening.opening_balance) || 0);
        setBankOpeningNotes(res.opening.notes || '');
      } else {
        setBankOpening(0);
        setBankOpeningNotes('');
      }
    } catch (err) {
      console.error('Error fetching weekly opening:', err);
      setBankOpening(0);
    }
  };

  const handleSaveOpening = async (e) => {
    if (e) e.preventDefault();
    setSavingOpening(true);
    try {
      const val = parseFloat(openingInput) || 0;
      const res = await apiFetch('/bank-reconciliation/opening', {
        method: 'POST',
        body: JSON.stringify({
          week_start: startDate,
          opening_balance: val,
          notes: openingNotesInput
        })
      });
      if (res && res.success) {
        setBankOpening(val);
        setBankOpeningNotes(openingNotesInput);
        setShowOpeningModal(false);
      } else {
        alert('Error al guardar apertura: ' + (res?.error || 'Desconocido'));
      }
    } catch (err) {
      console.error('Error saving bank opening:', err);
      alert('Error de conexión al guardar apertura de banco.');
    } finally {
      setSavingOpening(false);
    }
  };

  const openOpeningModal = () => {
    setOpeningInput(bankOpening > 0 ? String(bankOpening) : '');
    setOpeningNotesInput(bankOpeningNotes || '');
    setShowOpeningModal(true);
  };

  useEffect(() => {
    setEntries([]);
    fetchBankEntries(true);
    fetchWeeklyOpening(startDate);
  }, [weekOffset]);

  // Extract list of unique image URLs for the current week
  const uniqueImages = Array.from(new Set(entries.map(e => e.image_url).filter(Boolean)));

  // State for quick adding movements directly inside capture cards
  const [newMovementForm, setNewMovementForm] = useState({});

  // Floating Daily Sheet Drawer State (Comparador en Vivo con Planilla Diaria)
  const [showSheetDrawer, setShowSheetDrawer] = useState(false);
  const [drawerMinimized, setDrawerMinimized] = useState(false);
  const [drawerDateStr, setDrawerDateStr] = useState(startDate);
  const [drawerActiveTab, setDrawerActiveTab] = useState('incomes'); // 'incomes' | 'expenses'
  const [drawerSearch, setDrawerSearch] = useState('');
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerCache, setDrawerCache] = useState({});
  const [drawerAuditObservationRow, setDrawerAuditObservationRow] = useState(null);

  // Navegación por Semanas dentro de la Planilla Flotante
  const [drawerWeekOffset, setDrawerWeekOffset] = useState(0);

  const getDrawerWeekDays = () => {
    const now = new Date();
    now.setDate(now.getDate() + ((weekOffset + drawerWeekOffset) * 7));

    const dayOfWeek = now.getDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMon);

    const days = [];
    const dayNames = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = getLocalDateStr(d);
      const dayNum = String(d.getDate()).padStart(2, '0');
      const monthNum = String(d.getMonth() + 1).padStart(2, '0');
      days.push({
        name: `${dayNames[i]} ${dayNum}/${monthNum}`,
        dateStr,
      });
    }
    return days;
  };

  const drawerWeekDays = getDrawerWeekDays();

  // Arrastre libre de la Ventana Flotante (Draggable a cualquier lado)
  const [drawerPosition, setDrawerPosition] = useState(() => {
    const initialX = typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 510) : 800;
    const initialY = typeof window !== 'undefined' ? 90 : 90;
    return { x: initialX, y: initialY };
  });
  const [isDraggingDrawer, setIsDraggingDrawer] = useState(false);
  const drawerDragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });

  const handleDrawerHeaderMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    e.preventDefault();
    setIsDraggingDrawer(true);
    drawerDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: drawerPosition.x,
      posY: drawerPosition.y
    };
  };

  useEffect(() => {
    if (!isDraggingDrawer) return;

    const handleMouseMove = (e) => {
      const dx = e.clientX - drawerDragRef.current.startX;
      const dy = e.clientY - drawerDragRef.current.startY;
      const drawerW = drawerMinimized ? 340 : 480;
      const newX = Math.max(10, Math.min(window.innerWidth - drawerW - 10, drawerDragRef.current.posX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 60, drawerDragRef.current.posY + dy));
      setDrawerPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDraggingDrawer(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingDrawer, drawerMinimized]);

  // Mantener fecha de planilla alineada cuando cambia la semana del drawer
  useEffect(() => {
    if (drawerWeekDays && drawerWeekDays.length > 0) {
      if (!drawerWeekDays.some(d => d.dateStr === drawerDateStr)) {
        const firstDay = drawerWeekDays[0].dateStr;
        setDrawerDateStr(firstDay);
        fetchDrawerSheet(firstDay);
      }
    }
  }, [drawerWeekOffset, weekOffset]);

  const fetchDrawerSheet = async (dateStr, force = false) => {
    if (!dateStr) return;
    setDrawerDateStr(dateStr);
    if (!force && drawerCache[dateStr]) {
      return;
    }
    setDrawerLoading(true);
    try {
      const res = await apiFetch(`/daily-sheet?date=${dateStr}`);
      if (res.success) {
        setDrawerCache(prev => ({
          ...prev,
          [dateStr]: res
        }));
      }
    } catch (err) {
      console.error('Error fetching daily sheet for drawer:', err);
    } finally {
      setDrawerLoading(false);
    }
  };

  useEffect(() => {
    if (showSheetDrawer && drawerDateStr) {
      if (!drawerCache[drawerDateStr]) {
        fetchDrawerSheet(drawerDateStr);
      }
    }
  }, [showSheetDrawer, drawerDateStr]);

  const handleDrawerQuickAudit = async (type, item) => {
    const isCurrentlyConforme = item.audit_status === 'CONFORME';
    const newStatus = isCurrentlyConforme ? 'PENDIENTE' : 'CONFORME';
    const targetDate = drawerDateStr;

    // Actualización optimista inmediata en memoria (0ms)
    setDrawerCache(prev => {
      const currentSheet = prev[targetDate];
      if (!currentSheet) return prev;
      if (type === 'income') {
        return {
          ...prev,
          [targetDate]: {
            ...currentSheet,
            income_entries: (currentSheet.income_entries || []).map(r =>
              r.id === item.id ? { ...r, audit_status: newStatus, audit_note: isCurrentlyConforme ? '' : (r.audit_note || '') } : r
            )
          }
        };
      } else {
        return {
          ...prev,
          [targetDate]: {
            ...currentSheet,
            expense_entries: (currentSheet.expense_entries || []).map(r =>
              r.id === item.id ? { ...r, audit_status: newStatus, audit_note: isCurrentlyConforme ? '' : (r.audit_note || '') } : r
            )
          }
        };
      }
    });

    try {
      const endpoint = type === 'income'
        ? `/daily-sheet/income/${item.id}/audit`
        : `/daily-sheet/expense/${item.id}/audit`;
      await apiFetch(endpoint, {
        method: 'PUT',
        body: JSON.stringify({
          audit_status: newStatus,
          audit_note: isCurrentlyConforme ? '' : (item.audit_note || '')
        })
      });
    } catch (err) {
      alert('Error al actualizar auditoría: ' + err.message);
      fetchDrawerSheet(targetDate, true);
    }
  };

  const handleSaveDrawerObservation = async (e) => {
    e.preventDefault();
    if (!drawerAuditObservationRow) return;
    const { type, row, note } = drawerAuditObservationRow;
    const targetDate = drawerDateStr;

    // Actualización optimista inmediata
    setDrawerCache(prev => {
      const currentSheet = prev[targetDate];
      if (!currentSheet) return prev;
      if (type === 'income') {
        return {
          ...prev,
          [targetDate]: {
            ...currentSheet,
            income_entries: (currentSheet.income_entries || []).map(r =>
              r.id === row.id ? { ...r, audit_status: 'OBSERVADO', audit_note: note || '' } : r
            )
          }
        };
      } else {
        return {
          ...prev,
          [targetDate]: {
            ...currentSheet,
            expense_entries: (currentSheet.expense_entries || []).map(r =>
              r.id === row.id ? { ...r, audit_status: 'OBSERVADO', audit_note: note || '' } : r
            )
          }
        };
      }
    });

    setDrawerAuditObservationRow(null);

    try {
      const endpoint = type === 'income'
        ? `/daily-sheet/income/${row.id}/audit`
        : `/daily-sheet/expense/${row.id}/audit`;
      await apiFetch(endpoint, {
        method: 'PUT',
        body: JSON.stringify({
          audit_status: 'OBSERVADO',
          audit_note: note || ''
        })
      });
    } catch (err) {
      alert('Error al enviar observación: ' + err.message);
      fetchDrawerSheet(targetDate, true);
    }
  };

  // Helper para comprimir imágenes antes de subir (reduce de 5MB a ~200KB en base64)
  const compressImageFile = (file) => {
    return new Promise((resolve) => {
      if (!file || !file.type || !file.type.startsWith('image/')) return resolve(file);
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => {
        img.onload = () => {
          const maxWidth = 1600;
          const maxHeight = 1600;
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) {
              resolve(new File([blob], (file.name || 'captura').replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg' }));
            } else {
              resolve(file);
            }
          }, 'image/jpeg', 0.82);
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

  // Eliminar una captura completa y todos sus movimientos asociados
  const handleDeleteCapture = async (imgUrl) => {
    if (!window.confirm('¿Está seguro de eliminar esta captura y TODOS los movimientos asociados a ella?')) return;
    try {
      setEntries(prev => prev.filter(e => e.image_url !== imgUrl));
      await apiFetch('/bank-reconciliation/delete-capture', {
        method: 'POST',
        body: JSON.stringify({ image_url: imgUrl }),
      });
    } catch (err) {
      alert('Error al eliminar captura: ' + err.message);
      fetchBankEntries(false);
    }
  };

  // Re-adjuntar o cambiar foto de una captura (guarda como Base64 permanente)
  const handleReplaceCaptureImage = async (oldImgUrl, file) => {
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      const formData = new FormData();
      formData.append('old_image_url', oldImgUrl);
      formData.append('voucher_image', compressed);

      const res = await apiFetch('/bank-reconciliation/replace-image', {
        method: 'PUT',
        body: formData,
      });
      if (res.success) {
        await fetchBankEntries();
      }
    } catch (err) {
      alert('Error al re-adjuntar imagen: ' + err.message);
    }
  };

  // Abrir formulario para añadir un nuevo movimiento dentro de la tarjeta de la captura
  const handleOpenAddMovement = (captureId) => {
    setNewMovementForm(prev => ({
      ...prev,
      [captureId]: {
        amount: '',
        bank_name: 'TRANSFERENCIA',
        transaction_type: 'INGRESO',
        date: formatDateInput(startDate) || getLocalDateStr(),
        notes: '',
        open: true
      }
    }));
  };

  // Guardar un nuevo movimiento dentro de una captura existente (Instantáneo 0ms)
  const handleSaveNewMovement = async (captureId, imgUrl) => {
    const form = newMovementForm[captureId];
    if (!form) return;
    const numAmt = parseFloat(form.amount || 0);
    if (isNaN(numAmt) || numAmt <= 0) {
      return alert('Ingrese un monto válido mayor a 0 S/.');
    }

    const selectedDate = formatDateInput(form.date) || formatDateInput(startDate) || getLocalDateStr();
    const placeholder = entries.find(e => e.image_url === imgUrl && e.amount <= 0 && e.status !== 'ANULADO');
    const targetId = placeholder ? placeholder.id : null;
    const tempId = targetId || ('temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5));

    const optimisticMovement = {
      id: tempId,
      bank_name: form.bank_name || 'TRANSFERENCIA',
      transaction_type: form.transaction_type || 'INGRESO',
      amount: numAmt,
      notes: form.notes ? form.notes.trim() : null,
      image_url: imgUrl,
      date: selectedDate,
      status: 'PENDIENTE',
      audit_note: '',
    };

    // Actualización optimista inmediata en 0ms
    if (targetId) {
      setEntries(prev => prev.map(e => e.id === targetId ? { ...e, ...optimisticMovement } : e));
    } else {
      setEntries(prev => [...prev, optimisticMovement]);
    }

    // Cerrar el formulario de inmediato
    setNewMovementForm(prev => ({
      ...prev,
      [captureId]: { ...prev[captureId], open: false, amount: '', notes: '' }
    }));

    // Guardado en segundo plano sin bloquear ni descargar capturas pesadas
    (async () => {
      try {
        let res;
        if (targetId) {
          res = await apiFetch(`/bank-reconciliation/${targetId}`, {
            method: 'PUT',
            body: JSON.stringify(optimisticMovement),
          });
        } else {
          res = await apiFetch('/bank-reconciliation', {
            method: 'POST',
            body: JSON.stringify(optimisticMovement),
          });
        }
        if (res && res.entry) {
          setEntries(prev => prev.map(e => e.id === tempId ? { ...e, ...res.entry } : e));
        }
      } catch (err) {
        console.error('Error saving movement in background:', err);
        setEntries(prev => prev.filter(e => e.id !== tempId));
        alert('❌ Error al guardar movimiento: ' + (err.message || String(err)));
      }
    })();
  };

  // Carga Masiva de Capturas de la Semana
  const handleBatchFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setBatchFiles(files);
    }
  };

  const handleUploadBatch = async (e) => {
    e.preventDefault();
    if (batchFiles.length === 0) return alert('Seleccione al menos una imagen/captura.');

    setUploadingBatch(true);
    try {
      const compressedFiles = await Promise.all(batchFiles.map(f => compressImageFile(f)));
      const formData = new FormData();
      formData.append('date_str', startDate);
      compressedFiles.forEach((file) => {
        formData.append('voucher_images', file);
      });

      await apiFetch('/bank-reconciliation/batch', {
        method: 'POST',
        body: formData,
      });

      setShowBatchModal(false);
      setBatchFiles([]);
      await fetchBankEntries();
      
      // Abre automáticamente el llenador rápido
      setCurrentImageIndex(0);
      resetImageTransform();
      setShowFillModal(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploadingBatch(false);
    }
  };

  // Seleccionar e Iniciar Llenado de una Captura Específica
  const selectImageIndex = (idx, customEntries = null) => {
    const currentEntries = customEntries || entries;
    if (uniqueImages.length === 0) return;
    
    const validIdx = Math.max(0, Math.min(idx, uniqueImages.length - 1));
    setCurrentImageIndex(validIdx);
    resetImageTransform();

    const targetImgUrl = uniqueImages[validIdx];
    if (targetImgUrl) {
      const existingEntry = currentEntries.find(e => e.image_url === targetImgUrl);
      const zeroPlaceholder = currentEntries.find(e => e.image_url === targetImgUrl && e.amount <= 0);
      const defaultDate = (existingEntry && existingEntry.date) ? formatDateInput(existingEntry.date) : (formatDateInput(startDate) || getLocalDateStr());

      if (zeroPlaceholder) {
        setEditingFillId(zeroPlaceholder.id);
        setPaymentType(zeroPlaceholder.bank_name || 'TRANSFERENCIA');
        setTransactionType(zeroPlaceholder.transaction_type || 'INGRESO');
        setAmount('');
        setConceptNote(zeroPlaceholder.notes && !zeroPlaceholder.notes.startsWith('Captura #') ? zeroPlaceholder.notes : '');
        setTransactionDate(formatDateInput(zeroPlaceholder.date) || defaultDate);
      } else {
        setEditingFillId(null);
        setPaymentType('TRANSFERENCIA');
        setTransactionType('INGRESO');
        setAmount('');
        setConceptNote('');
        setTransactionDate(defaultDate);
      }
    }
    setTimeout(() => amountInputRef.current?.focus(), 150);
  };

  // Abrir Modal de Llenado Rápido por Capturas
  const startContinuousFill = (imgIndex = 0) => {
    if (uniqueImages.length === 0) {
      return alert('No hay capturas cargadas para esta semana. Primero carga un lote de capturas.');
    }
    selectImageIndex(imgIndex);
    setShowFillModal(true);
  };

  // Abrir Llenador Rápido desde cualquier botón de Tarjeta / Tabla
  const openFillModalForImage = (imgUrl, item) => {
    const idx = uniqueImages.indexOf(imgUrl);
    if (idx !== -1) {
      selectImageIndex(idx);
      setShowFillModal(true);
    } else if (item) {
      openEditModal(item);
    }
  };

  // Agregar o Actualizar Movimiento a la Captura Actual (Instantáneo 0ms)
  const handleAddMovementToImage = async (e) => {
    e.preventDefault();
    const currentImgUrl = uniqueImages[currentImageIndex];
    if (!currentImgUrl) return;

    const numAmount = parseFloat(amount || 0);
    if (isNaN(numAmount) || numAmount <= 0) {
      return alert('Ingrese un monto válido mayor a 0 S/.');
    }

    const selectedDate = formatDateInput(transactionDate) || formatDateInput(startDate) || getLocalDateStr();
    const zeroPlaceholder = !editingFillId ? entries.find(e => e.image_url === currentImgUrl && e.amount <= 0 && e.status !== 'ANULADO') : null;
    const targetId = editingFillId || (zeroPlaceholder ? zeroPlaceholder.id : null);
    const tempId = targetId || ('temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5));

    const isNotify = notifyOnSave;
    const autoNote = isNotify
      ? (transactionType === 'INGRESO'
          ? `Por favor registrar este ingreso de S/ ${numAmount.toFixed(2)} [${paymentType}${conceptNote ? ` - ${conceptNote}` : ''}] en tu Planilla Diaria de Ingresos.`
          : `Por favor registrar este gasto/egreso de S/ ${numAmount.toFixed(2)} [${paymentType}${conceptNote ? ` - ${conceptNote}` : ''}] en tu Planilla Diaria de Egresos.`)
      : '';

    const optimisticMovement = {
      id: tempId,
      bank_name: paymentType,
      transaction_type: transactionType,
      amount: numAmount,
      notes: conceptNote ? conceptNote.trim() : null,
      image_url: currentImgUrl,
      date: selectedDate,
      status: isNotify ? 'OBSERVADO' : 'PENDIENTE',
      audit_note: autoNote,
    };

    // 1. ACTUALIZACIÓN INMEDIATA EN PANTALLA (0ms)
    if (targetId) {
      setEntries(prev => prev.map(item => item.id === targetId ? { ...item, ...optimisticMovement } : item));
    } else {
      setEntries(prev => [...prev, optimisticMovement]);
    }

    // 2. Limpieza de campos y foco inmediato en el input de Monto
    setEditingFillId(null);
    setAmount('');
    setConceptNote('');
    setNotifyOnSave(false);
    setTimeout(() => amountInputRef.current?.focus(), 10);

    // 3. Envío en segundo plano al servidor (sin re-descargar los 20MB de capturas)
    (async () => {
      try {
        let serverRes;
        if (targetId) {
          serverRes = await apiFetch(`/bank-reconciliation/${targetId}`, {
            method: 'PUT',
            body: JSON.stringify({
              bank_name: paymentType,
              transaction_type: transactionType,
              amount: numAmount,
              notes: conceptNote ? conceptNote.trim() : null,
              image_url: currentImgUrl,
              date: selectedDate,
              status: isNotify ? 'OBSERVADO' : 'PENDIENTE',
              audit_note: autoNote,
            }),
          });
        } else {
          serverRes = await apiFetch('/bank-reconciliation', {
            method: 'POST',
            body: JSON.stringify({
              bank_name: paymentType,
              transaction_type: transactionType,
              amount: numAmount,
              notes: conceptNote ? conceptNote.trim() : null,
              image_url: currentImgUrl,
              date: selectedDate,
              status: isNotify ? 'OBSERVADO' : 'PENDIENTE',
              audit_note: autoNote,
            }),
          });
        }

        if (serverRes && serverRes.entry) {
          setEntries(prev => prev.map(item => item.id === tempId ? { ...item, ...serverRes.entry } : item));
        }
      } catch (err) {
        console.error('Error saving movement in background:', err);
        setEntries(prev => prev.filter(item => item.id !== tempId));
        alert('❌ Error al registrar movimiento: ' + (err.message || String(err)));
      }
    })();
  };

  // Eliminar Movimiento
  const handleDeleteItem = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar este movimiento bancario?')) return;

    try {
      setEntries(prev => prev.filter(e => e.id !== id));
      await apiFetch(`/bank-reconciliation/${id}`, { method: 'DELETE' });
    } catch (err) {
      alert(err.message);
      fetchBankEntries(false);
    }
  };

  // Abrir Modal de Auditoría Posterior (Aprobar o Enviar Mensaje de Descuadre)
  const openAuditModal = (item) => {
    setAuditingItem(item);
    setAuditStatus(item.status || 'VERIFICADO');
    setAuditNote(item.audit_note || '');
  };

  const handleSaveAudit = async (e) => {
    e.preventDefault();
    if (!auditingItem) return;

    try {
      const targetId = auditingItem.id;
      const targetStatus = auditStatus;
      const targetNote = targetStatus === 'OBSERVADO' ? auditNote : '';

      // Actualización optimista inmediata en memoria (sin reload, sin scroll al inicio)
      setEntries(prev => prev.map(it => it.id === targetId ? { ...it, status: targetStatus, audit_note: targetNote } : it));
      setAuditingItem(null);

      await apiFetch(`/bank-reconciliation/${targetId}/verify`, {
        method: 'PUT',
        body: JSON.stringify({
          status: targetStatus,
          audit_note: targetNote,
        }),
      });
    } catch (err) {
      alert(err.message);
      fetchBankEntries(false);
    }
  };

  // Requerimiento 3: Aprobar con opción de DESACTIVAR (Toggle) con actualización interna sin scroll al inicio
  const handleToggleApprove = async (item) => {
    try {
      const isCurrentlyApproved = item.status === 'VERIFICADO';
      const newStatus = isCurrentlyApproved ? 'PENDIENTE' : 'VERIFICADO';

      // Actualización optimista inmediata en memoria (no recarga la página ni regresa al inicio)
      setEntries(prev => prev.map(e => e.id === item.id ? { ...e, status: newStatus } : e));

      await apiFetch(`/bank-reconciliation/${item.id}/verify`, {
        method: 'PUT',
        body: JSON.stringify({
          status: newStatus,
          audit_note: isCurrentlyApproved ? item.audit_note : ''
        }),
      });
    } catch (err) {
      // Revertir en caso de error
      setEntries(prev => prev.map(e => e.id === item.id ? { ...e, status: item.status } : e));
      alert(err.message);
    }
  };

  // Alternar estado ANULADO / DEVUELTO (para que no sume en Estado de Cuenta)
  const handleToggleAnular = async (item) => {
    try {
      const isCurrentlyAnulado = item.status === 'ANULADO';
      const newStatus = isCurrentlyAnulado ? 'PENDIENTE' : 'ANULADO';

      // Actualización optimista inmediata en memoria (sin scroll ni recargas bruscas)
      setEntries(prev => prev.map(e => e.id === item.id ? { ...e, status: newStatus } : e));

      await apiFetch(`/bank-reconciliation/${item.id}/anular`, {
        method: 'PUT'
      });
    } catch (err) {
      // Revertir en caso de error
      setEntries(prev => prev.map(e => e.id === item.id ? { ...e, status: item.status } : e));
      alert('Error al cambiar estado anulado: ' + err.message);
    }
  };

  // Descargar todas las capturas de la semana en formato ZIP
  const handleDownloadImagesZip = async () => {
    const token = localStorage.getItem('fincagraf_token');
    if (!token) return alert('Debe iniciar sesión para descargar las capturas.');
    try {
      const downloadUrl = `/api/bank-reconciliation/download-zip?startDate=${startDate}&endDate=${endDate}&token=${encodeURIComponent(token)}`;
      const res = await fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        let errMsg = 'No hay capturas disponibles para descargar en esta semana.';
        try {
          const data = await res.json();
          if (data && data.error) errMsg = data.error;
        } catch (_) {}
        return alert(errMsg);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `capturas_${startDate}_al_${endDate}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert('Error al descargar ZIP de capturas: ' + err.message);
    }
  };

  // Abrir Modal de Edición Individual
  const openEditModal = (item) => {
    setEditingItem(item);
    setPaymentType(item.bank_name || 'TRANSFERENCIA');
    setTransactionType(item.transaction_type || 'INGRESO');
    setAmount(item.amount > 0 ? String(item.amount) : '');
    setConceptNote(item.notes && !item.notes.startsWith('Captura #') ? item.notes : '');
    setReferenceCode(item.reference_code || '');
    setTransactionDate(formatDateInput(item.date) || formatDateInput(startDate) || getLocalDateStr());
  };

  const handleSaveEditItem = async (e) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      await apiFetch(`/bank-reconciliation/${editingItem.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          bank_name: paymentType,
          transaction_type: transactionType,
          amount: parseFloat(amount || 0),
          notes: conceptNote,
          reference_code: referenceCode,
          date: formatDateInput(transactionDate) || formatDateInput(startDate) || getLocalDateStr(),
        }),
      });

      setEditingItem(null);
      fetchBankEntries();
    } catch (err) {
      alert(err.message);
    }
  };

  const currentImgUrl = uniqueImages[currentImageIndex];
  const currentImageEntries = entries.filter(e => e.image_url === currentImgUrl && e.amount > 0);

  // Totales Globales de la Semana Seleccionada (excluyendo ANULADO / DEVUELTO)
  const validWeeklyEntries = entries.filter(e => parseFloat(e.amount || 0) > 0 && e.status !== 'ANULADO');
  const weeklyTotalIngresos = validWeeklyEntries
    .filter(e => (e.transaction_type || '').toUpperCase() === 'INGRESO')
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const weeklyTotalEgresos = validWeeklyEntries
    .filter(e => (e.transaction_type || '').toUpperCase() === 'EGRESO')
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const weeklyNetBalance = weeklyTotalIngresos - weeklyTotalEgresos;
  const bankFinalBalance = bankOpening + weeklyTotalIngresos - weeklyTotalEgresos;

  const weeklyYape = validWeeklyEntries
    .filter(e => (e.transaction_type || '').toUpperCase() === 'INGRESO' && /yape|plin/i.test(e.bank_name || ''))
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const weeklyPos = validWeeklyEntries
    .filter(e => (e.transaction_type || '').toUpperCase() === 'INGRESO' && /pos|tarjeta|izipay/i.test(e.bank_name || ''))
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const weeklyBcp = validWeeklyEntries
    .filter(e => {
      if ((e.transaction_type || '').toUpperCase() !== 'INGRESO') return false;
      const bank = (e.bank_name || '').toUpperCase();
      if (/yape|plin/i.test(bank)) return false;
      if (/pos|tarjeta|izipay/i.test(bank)) return false;
      return true; // Cualquier otro ingreso bancario (TRANSFERENCIA, BCP, ABONO, DEPOSITO)
    })
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const weeklyTransferencias = weeklyBcp;

  const weeklyEgresoYape = validWeeklyEntries
    .filter(e => (e.transaction_type || '').toUpperCase() === 'EGRESO' && /yape|plin/i.test(e.bank_name || ''))
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const weeklyEgresoPos = validWeeklyEntries
    .filter(e => (e.transaction_type || '').toUpperCase() === 'EGRESO' && /pos|tarjeta|izipay/i.test(e.bank_name || ''))
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const weeklyEgresoBcp = validWeeklyEntries
    .filter(e => {
      if ((e.transaction_type || '').toUpperCase() !== 'EGRESO') return false;
      const bank = (e.bank_name || '').toUpperCase();
      if (/yape|plin/i.test(bank)) return false;
      if (/pos|tarjeta|izipay/i.test(bank)) return false;
      return true; // Cualquier otro egreso bancario (TRANSFERENCIA, BCP, RETIRO, ITF, GASTOS)
    })
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const weeklyAnuladosCount = entries.filter(e => parseFloat(e.amount || 0) > 0 && e.status === 'ANULADO').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Selector de Semanas e Historial */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1.1rem 1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Landmark size={22} color="#38bdf8" />
            4. Estado de Cuenta y Conciliación Bancaria (Por Semanas)
          </h2>
          <div style={{ fontSize: '0.85rem', color: '#38bdf8', marginTop: '0.2rem', fontWeight: '800' }}>
            🗓️ Semana Seleccionada: <span style={{ color: '#ffffff' }}>{weekDays[0].name} al {weekDays[5].name}</span>
          </div>
        </div>

        {/* Navegación por Semanas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
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
              Semana Actual
            </button>
          )}
          <button onClick={() => setWeekOffset(prev => prev + 1)} className="btn btn-secondary btn-sm" title="Semana Siguiente">
            Semana Siguiente <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Botones Principales, Google Drive Config y Conmutador de Vista (2 Columnas vs Tabla) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowBatchModal(true)}
            className="btn btn-primary"
            style={{ padding: '0.75rem 1.25rem', fontWeight: '900', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(2, 132, 199, 0.4)' }}
          >
            <FolderPlus size={20} /> 1. Cargar Lote de Capturas de la Semana
          </button>

          {uniqueImages.length > 0 && (
            <button
              onClick={() => startContinuousFill(0)}
              className="btn btn-success"
              style={{ padding: '0.75rem 1.25rem', fontWeight: '900', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)' }}
            >
              <Zap size={20} /> 2. Registro Rápido Continuo ({uniqueImages.length} Capturas)
            </button>
          )}

          {uniqueImages.length > 0 && (
            <button
              onClick={handleDownloadImagesZip}
              className="btn btn-secondary"
              style={{ padding: '0.75rem 1.25rem', fontWeight: '900', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.45rem', backgroundColor: '#1e293b', border: '1.5px solid #10b981', color: '#34d399' }}
              title="Descargar todas las capturas de esta semana en archivo ZIP a tu PC"
            >
              <Download size={19} color="#34d399" /> 📥 Descargar Capturas (.ZIP)
            </button>
          )}

          {/* Botón Ventana Flotante: Planilla Diaria de la Vendedora (En Vivo) */}
          <button
            onClick={() => {
              setShowSheetDrawer(prev => !prev);
              setDrawerMinimized(false);
            }}
            className="btn btn-secondary"
            style={{
              padding: '0.75rem 1.25rem',
              fontWeight: '900',
              fontSize: '0.92rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: showSheetDrawer ? 'rgba(2, 132, 199, 0.35)' : '#1e293b',
              border: showSheetDrawer ? '2px solid #38bdf8' : '1.5px solid #0284c7',
              color: '#38bdf8',
              boxShadow: showSheetDrawer ? '0 0 16px rgba(2, 132, 199, 0.55)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Abrir ventana flotante para comparar con la planilla de la vendedora en tiempo real"
          >
            <FileSpreadsheet size={19} color="#38bdf8" />
            📋 Planilla Diaria (En Vivo)
            {showSheetDrawer && (
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
            )}
          </button>
        </div>

        {/* Botón Vista Cuadros por Captura (Solo Icono sin texto) */}
        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#0f172a', padding: '0.3rem', borderRadius: '10px', border: '1px solid #1e293b' }}>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className="btn btn-primary btn-sm"
            style={{ fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.45rem 0.65rem' }}
            title="Vista por Capturas"
          >
            <Grid size={17} />
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {saveSuccessMsg && (
        <div style={{
          backgroundColor: '#065f46',
          color: '#34d399',
          border: '2px solid #10b981',
          padding: '0.85rem 1.25rem',
          borderRadius: '12px',
          fontWeight: '900',
          fontSize: '1.05rem',
          textAlign: 'center',
          boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
        }}>
          {saveSuccessMsg}
        </div>
      )}

      {/* BANNER RESUMEN SEMANAL DE TOTALES (SUPERIOR) */}
      {!loading && !error && entries.length > 0 && (
        <div style={{
          backgroundColor: '#0b1329',
          border: '2px solid #0284c7',
          borderRadius: '14px',
          padding: '0.85rem 1.25rem',
          boxShadow: '0 8px 25px rgba(0,0,0,0.45)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          {/* Título y Periodo */}
          <div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '800' }}>
              📊 RESUMEN GLOBAL DE LA SEMANA
            </div>
            <div style={{ fontSize: '1rem', fontWeight: '900', color: '#ffffff' }}>
              {weekDays[0].name} al {weekDays[5].name}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.74rem', backgroundColor: '#1e293b', color: '#38bdf8', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: '800' }}>
                📸 {uniqueImages.length} Capturas
              </span>
              <span style={{ fontSize: '0.74rem', backgroundColor: '#1e293b', color: '#94a3b8', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: '800' }}>
                📋 {validWeeklyEntries.length} Movimientos Activos
              </span>
              {weeklyAnuladosCount > 0 && (
                <span style={{ fontSize: '0.74rem', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid #ef4444', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Ban size={11} /> {weeklyAnuladosCount} Devuelto / Anulado (No suma)
                </span>
              )}
            </div>
          </div>

          {/* Tarjetas de Totales */}
          <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 1. APERTURA BANCO */}
            <div style={{
              backgroundColor: 'rgba(99, 102, 241, 0.12)',
              border: '1.5px solid #6366f1',
              borderRadius: '10px',
              padding: '0.55rem 0.9rem',
              textAlign: 'right',
              minWidth: '150px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.72rem', color: '#c7d2fe', fontWeight: '800', textTransform: 'uppercase' }}>
                  🏦 Apertura Banco
                </span>
                <button
                  type="button"
                  onClick={openOpeningModal}
                  style={{
                    border: 'none',
                    backgroundColor: 'rgba(99, 102, 241, 0.25)',
                    color: '#a5b4fc',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    padding: '0.1rem 0.35rem',
                    borderRadius: '4px',
                    fontWeight: '800'
                  }}
                  title="Editar o definir saldo inicial en banco"
                >
                  ✏️ Apertura
                </button>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#a5b4fc', lineHeight: '1.2' }}>
                {formatSoles(bankOpening)}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                {bankOpeningNotes ? bankOpeningNotes : 'Saldo inicial de la semana'}
              </div>
            </div>

            {/* 2. TOTAL INGRESOS */}
            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1.5px solid #10b981',
              borderRadius: '10px',
              padding: '0.55rem 0.9rem',
              textAlign: 'right',
              minWidth: '150px'
            }}>
              <div style={{ fontSize: '0.72rem', color: '#a7f3d0', fontWeight: '800', textTransform: 'uppercase' }}>
                🟢 Total Ingresos
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#34d399', lineHeight: '1.2' }}>
                {formatSoles(weeklyTotalIngresos)}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                Yape: <strong style={{ color: '#c084fc' }}>{formatSoles(weeklyYape)}</strong> | BCP: <strong style={{ color: '#38bdf8' }}>{formatSoles(weeklyBcp)}</strong> | POS: <strong style={{ color: '#f59e0b' }}>{formatSoles(weeklyPos)}</strong>
              </div>
            </div>

            {/* TOTAL EGRESOS */}
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1.5px solid #ef4444',
              borderRadius: '10px',
              padding: '0.55rem 0.9rem',
              textAlign: 'right',
              minWidth: '140px'
            }}>
              <div style={{ fontSize: '0.72rem', color: '#fca5a5', fontWeight: '800', textTransform: 'uppercase' }}>
                🔴 Total Egresos
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#f87171', lineHeight: '1.2' }}>
                {formatSoles(weeklyTotalEgresos)}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                Yape: <strong style={{ color: '#c084fc' }}>{formatSoles(weeklyEgresoYape)}</strong> | BCP: <strong style={{ color: '#38bdf8' }}>{formatSoles(weeklyEgresoBcp)}</strong> | POS: <strong style={{ color: '#f59e0b' }}>{formatSoles(weeklyEgresoPos)}</strong>
              </div>
            </div>

            {/* 4. SALDO FINAL EN BANCO */}
            <div style={{
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1.5px solid #0284c7',
              borderRadius: '10px',
              padding: '0.55rem 0.9rem',
              textAlign: 'right',
              minWidth: '150px'
            }}>
              <div style={{ fontSize: '0.72rem', color: '#bae6fd', fontWeight: '800', textTransform: 'uppercase' }}>
                💰 Saldo Final en Banco
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '900', color: bankFinalBalance >= 0 ? '#38bdf8' : '#ef4444', lineHeight: '1.2' }}>
                {formatSoles(bankFinalBalance)}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                Apertura + Ingresos - Egresos
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>⚡ Cargando capturas de la semana...</p>}
      {error && <p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</p>}

      {/* VISTA 1: VISTA EN CUADROS AGRUPADOS POR CAPTURA (1 CAPTURA = 1 SOLO CUADRO CON TODOS SUS MOVIMIENTOS) */}
      {!loading && !error && viewMode === 'grid' && (() => {
        // Agrupar entradas por captura
        const groupedCaptures = [];
        uniqueImages.forEach((imgUrl, captureIdx) => {
          const captureEntries = entries.filter(e => e.image_url === imgUrl);
          groupedCaptures.push({
            id: `capture-${captureIdx}`,
            captureIndex: captureIdx,
            image_url: imgUrl,
            entries: captureEntries,
            isManual: false
          });
        });

        const manualEntries = entries.filter(e => !e.image_url);
        if (manualEntries.length > 0) {
          groupedCaptures.push({
            id: 'manual-capture',
            captureIndex: uniqueImages.length,
            image_url: null,
            entries: manualEntries,
            isManual: true
          });
        }

        if (groupedCaptures.length === 0) {
          return (
            <div className="card" style={{ textAlign: 'center', color: '#94a3b8', padding: '3.5rem 2rem', fontWeight: '700', borderRadius: '16px', border: '1px dashed #334155', backgroundColor: 'rgba(15, 23, 42, 0.6)' }}>
              <FolderPlus size={44} style={{ color: '#475569', marginBottom: '1rem' }} />
              <div style={{ fontSize: '1.15rem', color: '#cbd5e1', marginBottom: '0.4rem' }}>
                No hay capturas ni movimientos bancarios registrados para esta semana
              </div>
              <div style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1.25rem' }}>
                Semana: {weekDays[0].name} al {weekDays[5].name}
              </div>
              <button
                onClick={() => setShowBatchModal(true)}
                className="btn btn-primary"
                style={{ padding: '0.65rem 1.25rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <FolderPlus size={18} /> 1. Cargar Lote de Capturas de la Semana
              </button>
            </div>
          );
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {groupedCaptures.map((capture) => {
              const displayEntries = capture.entries.filter(e => parseFloat(e.amount || 0) > 0);
              const validEntries = displayEntries.filter(e => e.status !== 'ANULADO');
              const anuladosCount = displayEntries.filter(e => e.status === 'ANULADO').length;
              const totalIngresos = validEntries
                .filter(e => (e.transaction_type || '').toUpperCase() === 'INGRESO')
                .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
              const totalEgresos = validEntries
                .filter(e => (e.transaction_type || '').toUpperCase() === 'EGRESO')
                .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
              const netBalance = totalIngresos - totalEgresos;

              const allApproved = validEntries.length > 0 && validEntries.every(e => e.status === 'VERIFICADO');
              const hasObservados = capture.entries.some(e => e.status === 'OBSERVADO');
              const isQuickAddOpen = newMovementForm[capture.id]?.open;

              return (
                <div
                  key={capture.id}
                  className="card"
                  style={{
                    backgroundColor: '#0f172a',
                    border: allApproved ? '2px solid #10b981' : (hasObservados ? '2px solid #ef4444' : '2px solid #0284c7'),
                    borderTop: allApproved ? '4px solid #10b981' : (hasObservados ? '4px solid #ef4444' : '4px solid #0284c7'),
                    borderRadius: '14px',
                    padding: '0.85rem 1.1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.45)'
                  }}
                >
                  {/* Header de la Captura: Título, Totales, Acciones */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.65rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '900', color: '#ffffff', backgroundColor: capture.isManual ? '#475569' : '#0284c7', padding: '0.25rem 0.75rem', borderRadius: '7px', fontSize: '0.95rem', letterSpacing: '0.03em' }}>
                        {capture.isManual ? '📝 MANUALES' : `📸 CAPTURA #${capture.captureIndex + 1}`}
                      </span>

                      <span style={{ backgroundColor: '#1e293b', color: '#38bdf8', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '800', border: '1px solid #334155' }}>
                        📋 {validEntries.length} {validEntries.length === 1 ? 'Movimiento' : 'Movimientos'}
                      </span>

                      {totalIngresos > 0 && (
                        <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid #10b981', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '900' }}>
                          🟢 Ingresos: {formatSoles(totalIngresos)}
                        </span>
                      )}

                      {totalEgresos > 0 && (
                        <span style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid #ef4444', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '900' }}>
                          🔴 Egresos: {formatSoles(totalEgresos)}
                        </span>
                      )}

                      {validEntries.length > 0 && (
                        <span style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid #0284c7', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '900' }}>
                          💰 Balance: {formatSoles(netBalance)}
                        </span>
                      )}

                      {anuladosCount > 0 && (
                        <span style={{ backgroundColor: 'rgba(239, 68, 68, 0.25)', color: '#f87171', border: '1px solid #ef4444', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Ban size={12} /> {anuladosCount} {anuladosCount === 1 ? 'Devuelto / Anulado' : 'Devueltos / Anulados'}
                        </span>
                      )}

                      {allApproved && (
                        <span style={{ backgroundColor: '#10b981', color: '#ffffff', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '900' }}>
                          ✅ CONFORME
                        </span>
                      )}

                      {hasObservados && (
                        <span style={{ backgroundColor: '#ef4444', color: '#ffffff', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '900' }}>
                          ⚠️ DESCUADRE
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      {!capture.isManual && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCapture(capture.image_url)}
                          className="btn btn-danger btn-sm"
                          style={{ padding: '0.35rem 0.65rem', fontWeight: '900', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                          title="Eliminar Captura Completa y todos sus movimientos"
                        >
                          <Trash2 size={14} /> Eliminar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Cuerpo: Miniatura a la izquierda y Detalle de movimientos a la derecha */}
                  <div style={{ display: 'grid', gridTemplateColumns: capture.isManual ? '1fr' : 'minmax(140px, 175px) 1fr', gap: '1rem', alignItems: 'start' }}>
                    
                    {/* Miniatura de la Captura (Solo si tiene imagen) */}
                    {!capture.isManual && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                        <div
                          onClick={() => setViewImage(capture.image_url)}
                          style={{
                            position: 'relative',
                            cursor: 'pointer',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            border: '1.5px solid #0284c7',
                            width: '100%',
                            height: '190px',
                            backgroundColor: '#020617',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                            transition: 'transform 0.2s ease'
                          }}
                          title="Clic para ver Voucher a pantalla completa con zoom"
                        >
                          <img
                            src={capture.image_url}
                            alt="Voucher"
                            style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#020617' }}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.style.display = 'none';
                              if (e.target.parentNode) {
                                const placeholder = document.createElement('div');
                                placeholder.style.color = '#ef4444';
                                placeholder.style.textAlign = 'center';
                                placeholder.style.padding = '0.75rem';
                                placeholder.style.fontWeight = 'bold';
                                placeholder.style.fontSize = '0.72rem';
                                placeholder.innerHTML = '⚠️ Captura no encontrada<br/><span style="color:#38bdf8;font-size:0.68rem;text-decoration:underline;">Re-adjuntar Foto</span>';
                                e.target.parentNode.appendChild(placeholder);
                              }
                            }}
                          />
                          <div style={{
                            position: 'absolute',
                            bottom: 0, left: 0, right: 0,
                            backgroundColor: 'rgba(2, 132, 199, 0.9)',
                            color: '#ffffff',
                            fontSize: '0.72rem',
                            fontWeight: '900',
                            textAlign: 'center',
                            padding: '3px 0'
                          }}>
                            🔍 Zoom Captura
                          </div>
                        </div>

                        {/* Botón Cambiar / Re-adjuntar Foto */}
                        <label style={{
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          color: '#38bdf8',
                          fontWeight: '800',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.28rem 0.65rem',
                          backgroundColor: 'rgba(2, 132, 199, 0.15)',
                          borderRadius: '6px',
                          border: '1px dashed #0284c7',
                          textAlign: 'center',
                          width: '100%',
                          justifyContent: 'center'
                        }}>
                          <Upload size={12} /> Re-adjuntar Foto
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                handleReplaceCaptureImage(capture.image_url, e.target.files[0]);
                              }
                            }}
                          />
                        </label>
                      </div>
                    )}

                    {/* Lista de Movimientos de la Captura */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '340px', overflowY: 'auto', paddingRight: '0.35rem' }}>
                      {displayEntries.length === 0 ? (
                        <div style={{ backgroundColor: '#1e293b', padding: '1.25rem', borderRadius: '10px', textAlign: 'center', color: '#94a3b8', border: '1.5px dashed #334155' }}>
                          <p style={{ margin: '0 0 0.5rem 0', fontWeight: '800', color: '#fbbf24', fontSize: '0.88rem' }}>
                            ⚠️ Esta captura aún no tiene montos registrados.
                          </p>
                          <button
                            type="button"
                            onClick={() => openFillModalForImage(capture.image_url)}
                            className="btn btn-primary btn-sm"
                            style={{ fontWeight: '900', padding: '0.45rem 1rem', fontSize: '0.82rem' }}
                          >
                            <Plus size={15} /> ➕ Añadir Movimientos a esta Captura
                          </button>
                        </div>
                      ) : (
                        displayEntries.map((item, mIdx) => {
                          const isAnulado = item.status === 'ANULADO';
                          const isIngreso = (item.transaction_type || '').toUpperCase() === 'INGRESO';
                          const isVerificado = item.status === 'VERIFICADO';
                          const isObservado = item.status === 'OBSERVADO';
                          const badgeStyle = getPaymentTypeBadgeStyle(item.bank_name);

                          return (
                            <div
                              key={item.id}
                              style={{
                                backgroundColor: isAnulado
                                  ? 'rgba(239, 68, 68, 0.12)'
                                  : (isIngreso ? 'rgba(6, 78, 59, 0.28)' : 'rgba(127, 29, 29, 0.28)'),
                                border: isAnulado
                                  ? '1.5px solid rgba(239, 68, 68, 0.45)'
                                  : (isIngreso ? '1.5px solid rgba(16, 185, 129, 0.45)' : '1.5px solid rgba(239, 68, 68, 0.45)'),
                                borderLeft: isAnulado
                                  ? '4px solid #ef4444'
                                  : (isIngreso ? '4px solid #10b981' : '4px solid #ef4444'),
                                borderRadius: '8px',
                                padding: '0.45rem 0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '0.5rem',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                                opacity: isAnulado ? 0.78 : 1
                              }}
                            >
                              {/* Datos del Movimiento */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: '900', color: '#94a3b8', fontSize: '0.8rem' }}>
                                  #{mIdx + 1}
                                </span>

                                <span style={{
                                  backgroundColor: isAnulado ? '#64748b' : (isIngreso ? '#10b981' : '#ef4444'),
                                  color: '#ffffff',
                                  fontWeight: '900',
                                  fontSize: '0.72rem',
                                  padding: '0.18rem 0.45rem',
                                  borderRadius: '4px'
                                }}>
                                  {isIngreso ? '💵 INGRESO' : '💸 EGRESO'}
                                </span>

                                <span className="badge" style={{ ...badgeStyle, fontSize: '0.72rem', padding: '0.18rem 0.45rem', fontWeight: '800' }}>
                                  {item.bank_name || 'TRANSFERENCIA'}
                                </span>

                                <span style={{ 
                                  fontSize: '1.05rem', 
                                  fontWeight: '900', 
                                  color: isAnulado ? '#f87171' : (isIngreso ? '#34d399' : '#f87171'),
                                  textDecoration: isAnulado ? 'line-through' : 'none'
                                }}>
                                  {formatSoles(item.amount || 0)}
                                </span>

                                <span style={{ color: '#38bdf8', fontSize: '0.78rem', fontWeight: '800', backgroundColor: '#0f172a', padding: '0.18rem 0.45rem', borderRadius: '4px', border: '1px solid #1e293b' }}>
                                  📅 {formatDateDisplay(item.date)}
                                </span>

                                <span style={{ color: '#ffffff', fontSize: '0.82rem', fontWeight: '800', backgroundColor: '#0f172a', padding: '0.2rem 0.55rem', borderRadius: '4px', border: '1px solid #334155' }}>
                                  {item.notes && !item.notes.startsWith('Captura #') ? item.notes : '(Sin concepto)'}
                                </span>

                                {isAnulado && (
                                  <span style={{ backgroundColor: '#ef4444', color: '#ffffff', border: '1px solid #b91c1c', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <Ban size={11} /> 🚫 ANULADO / DEVUELTO (No suma)
                                  </span>
                                )}

                                {!isAnulado && isVerificado && (
                                  <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid #10b981', padding: '0.12rem 0.45rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '900' }}>
                                    ✅ Conforme
                                  </span>
                                )}
                                {!isAnulado && isObservado && (
                                  <span style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid #ef4444', padding: '0.12rem 0.45rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '900' }}>
                                    ⚠️ {item.audit_note ? `Observado: "${item.audit_note}"` : 'Observado'}
                                  </span>
                                )}
                              </div>

                              {/* Acciones del Movimiento */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleApprove(item)}
                                  className="btn btn-sm"
                                  style={{
                                    backgroundColor: isVerificado ? '#10b981' : 'rgba(16, 185, 129, 0.2)',
                                    color: '#ffffff',
                                    border: '1.5px solid #10b981',
                                    padding: '0.25rem 0.6rem',
                                    fontSize: '0.75rem',
                                    fontWeight: '900',
                                    opacity: isAnulado ? 0.4 : 1,
                                    cursor: isAnulado ? 'not-allowed' : 'pointer'
                                  }}
                                  disabled={isAnulado}
                                  title={isAnulado ? 'Movimiento anulado no puede aprobarse' : (isVerificado ? 'Clic para desactivar aprobación' : 'Aprobar este movimiento')}
                                >
                                  {isVerificado ? '✅ Conforme' : 'Aprobar'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleAnular(item)}
                                  className="btn btn-sm"
                                  style={{
                                    backgroundColor: isAnulado ? '#ef4444' : 'rgba(239, 68, 68, 0.15)',
                                    color: isAnulado ? '#ffffff' : '#f87171',
                                    border: isAnulado ? '1.5px solid #dc2626' : '1.5px solid rgba(239, 68, 68, 0.45)',
                                    padding: '0.25rem 0.55rem',
                                    fontSize: '0.75rem',
                                    fontWeight: '900',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                  }}
                                  title={isAnulado ? 'Movimiento ANULADO Y DEVUELTO (clic para reactivar)' : 'Marcar como ANULADO Y DEVUELTO (no sumará en Estado de Cuenta)'}
                                >
                                  <Ban size={12} /> {isAnulado ? 'Anulado (Reactivar)' : 'Anular / Devuelto'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openEditModal(item)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                                  title="Editar este movimiento"
                                >
                                  <Edit3 size={13} />
                                </button>

                                {!isVerificado && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="btn btn-danger btn-sm"
                                    style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                                    title="Eliminar este movimiento"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}

                      {/* Formulario / Botón para Añadir Movimiento a esta misma Captura */}
                      {!capture.isManual && (
                        <div style={{ marginTop: '0.4rem' }}>
                          {isQuickAddOpen ? (
                            <div style={{
                              backgroundColor: 'rgba(15, 23, 42, 0.95)',
                              border: '1.5px dashed #0284c7',
                              borderRadius: '10px',
                              padding: '0.85rem 1rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.65rem'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: '900', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <PlusCircle size={16} /> Añadir Movimiento a esta Captura:
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setNewMovementForm(prev => ({ ...prev, [capture.id]: { ...prev[capture.id], open: false } }))}
                                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}
                                >
                                  ✕
                                </button>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
                                <div>
                                  <label style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: '900', display: 'block', marginBottom: '2px' }}>
                                    Monto (S/):
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="form-input"
                                    style={{ fontSize: '1.1rem', fontWeight: '900', color: '#22c55e', padding: '0.35rem 0.5rem', backgroundColor: '#020617', borderColor: '#0284c7' }}
                                    placeholder="0.00"
                                    value={newMovementForm[capture.id]?.amount || ''}
                                    onChange={(e) => setNewMovementForm(prev => ({
                                      ...prev,
                                      [capture.id]: { ...(prev[capture.id] || {}), amount: e.target.value }
                                    }))}
                                  />
                                </div>

                                <div>
                                  <label style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: '800', display: 'block', marginBottom: '2px' }}>
                                    Tipo Pago:
                                  </label>
                                  <select
                                    className="form-select"
                                    style={{ fontSize: '0.8rem', padding: '0.38rem', backgroundColor: '#020617', fontWeight: '800' }}
                                    value={newMovementForm[capture.id]?.bank_name || 'TRANSFERENCIA'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setNewMovementForm(prev => ({
                                        ...prev,
                                        [capture.id]: {
                                          ...(prev[capture.id] || {}),
                                          bank_name: val,
                                          ...(val === 'RETIRO EN EFECTIVO' ? { transaction_type: 'EGRESO' } : {})
                                        }
                                      }));
                                    }}
                                  >
                                    <option value="TRANSFERENCIA">🏦 TRANSF.</option>
                                    <option value="YAPE">📱 YAPE/PLIN</option>
                                    <option value="POS">💳 POS</option>
                                    <option value="RETIRO EN EFECTIVO">💵 RETIRO EFECTIVO</option>
                                  </select>
                                </div>

                                <div>
                                  <label style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: '800', display: 'block', marginBottom: '2px' }}>
                                    Movimiento:
                                  </label>
                                  <select
                                    className="form-select"
                                    style={{ fontSize: '0.8rem', padding: '0.38rem', backgroundColor: '#020617', fontWeight: '800' }}
                                    value={newMovementForm[capture.id]?.transaction_type || 'INGRESO'}
                                    onChange={(e) => setNewMovementForm(prev => ({
                                      ...prev,
                                      [capture.id]: { ...(prev[capture.id] || {}), transaction_type: e.target.value }
                                    }))}
                                  >
                                    <option value="INGRESO">🟢 INGRESO</option>
                                    <option value="EGRESO">🔴 EGRESO</option>
                                  </select>
                                </div>

                                <div>
                                  <label style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: '800', display: 'block', marginBottom: '2px' }}>
                                    Fecha Abono:
                                  </label>
                                  <input
                                    type="date"
                                    className="form-input"
                                    style={{ fontSize: '0.8rem', padding: '0.38rem', backgroundColor: '#020617', color: '#38bdf8', fontWeight: '800' }}
                                    value={formatDateInput(newMovementForm[capture.id]?.date || startDate)}
                                    onChange={(e) => setNewMovementForm(prev => ({
                                      ...prev,
                                      [capture.id]: { ...(prev[capture.id] || {}), date: e.target.value }
                                    }))}
                                  />
                                </div>
                              </div>

                              <div>
                                <label style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: '800', display: 'block', marginBottom: '2px' }}>
                                  Concepto / Detalle:
                                </label>
                                <input
                                  type="text"
                                  className="form-input"
                                  style={{ fontSize: '0.85rem', padding: '0.35rem 0.5rem', backgroundColor: '#020617' }}
                                  placeholder="Ej: Impuesto, Pago luz, Yape cliente..."
                                  value={newMovementForm[capture.id]?.notes || ''}
                                  onChange={(e) => setNewMovementForm(prev => ({
                                    ...prev,
                                    [capture.id]: { ...(prev[capture.id] || {}), notes: e.target.value }
                                  }))}
                                  onKeyDown={(e) => e.key === 'Enter' && handleSaveNewMovement(capture.id, capture.image_url)}
                                />
                              </div>

                              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                                <button
                                  type="button"
                                  onClick={() => setNewMovementForm(prev => ({ ...prev, [capture.id]: { ...prev[capture.id], open: false } }))}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.82rem' }}
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveNewMovement(capture.id, capture.image_url)}
                                  className="btn btn-primary btn-sm"
                                  style={{ padding: '0.35rem 1.1rem', fontSize: '0.85rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                >
                                  <Save size={14} /> Guardar Movimiento
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenAddMovement(capture.id)}
                              className="btn btn-secondary btn-sm"
                              style={{
                                width: '100%',
                                padding: '0.55rem',
                                fontSize: '0.85rem',
                                fontWeight: '900',
                                border: '1.5px dashed #0284c7',
                                color: '#38bdf8',
                                backgroundColor: 'rgba(2, 132, 199, 0.08)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.45rem',
                                borderRadius: '8px',
                                cursor: 'pointer'
                              }}
                            >
                              <PlusCircle size={16} /> ➕ Añadir otro movimiento a esta captura
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* VISTA 2: VISTA TABLA LISTA (CON LLENADO DIRECTO INLINE) */}
      {!loading && !error && viewMode === 'table' && (
        <div className="card" style={{ padding: '0', overflow: 'hidden', border: '2px solid #0284c7' }}>
          <div className="table-container" style={{ border: 'none' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', width: '40px', textAlign: 'center' }}>N°</th>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', width: '80px', textAlign: 'center' }}>CAPTURA</th>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', width: '120px', textAlign: 'center' }}>FECHA ABONO</th>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', width: '130px' }}>TIPO PAGO</th>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', width: '120px', textAlign: 'center' }}>MOVIMIENTO</th>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', width: '110px', textAlign: 'right' }}>MONTO S/</th>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', minWidth: '180px' }}>CONCEPTO / DETALLE</th>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', minWidth: '160px' }}>AUDITORÍA & NOTA</th>
                  <th style={{ backgroundColor: '#0369a1', color: '#ffffff', textAlign: 'center', width: '220px' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', color: '#94a3b8', padding: '3.5rem 2rem', fontWeight: '700' }}>
                      <FolderPlus size={40} style={{ color: '#475569', marginBottom: '0.75rem' }} />
                      <div style={{ fontSize: '1.1rem', color: '#cbd5e1', marginBottom: '0.4rem' }}>
                        No hay capturas ni movimientos bancarios registrados para esta semana
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.25rem' }}>
                        Semana: {weekDays[0].name} al {weekDays[5].name}
                      </div>
                      <button
                        onClick={() => setShowBatchModal(true)}
                        className="btn btn-primary btn-sm"
                        style={{ padding: '0.55rem 1.15rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                      >
                        <FolderPlus size={16} /> 1. Cargar Lote de Capturas de la Semana
                      </button>
                    </td>
                  </tr>
                ) : (
                  entries.map((item, idx) => {
                    const isAnulado = item.status === 'ANULADO';
                    const isObservado = item.status === 'OBSERVADO';
                    const isVerificado = item.status === 'VERIFICADO';
                    const isIngreso = item.transaction_type === 'INGRESO';
                    const isPendienteLlenado = item.amount <= 0 && !isAnulado;

                    let rowStyle = { borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' };
                    if (isAnulado) rowStyle.backgroundColor = 'rgba(239, 68, 68, 0.18)';
                    else if (isObservado) rowStyle.backgroundColor = 'rgba(239, 68, 68, 0.25)';
                    else if (isVerificado) rowStyle.backgroundColor = 'rgba(16, 185, 129, 0.16)';
                    else if (isPendienteLlenado) rowStyle.backgroundColor = 'rgba(245, 158, 11, 0.15)';

                    return (
                      <tr key={item.id} style={rowStyle}>
                        <td style={{ textAlign: 'center', fontWeight: '900', color: '#38bdf8' }}>
                          #{idx + 1}
                        </td>

                        {/* Thumbnail Captura */}
                        <td style={{ textAlign: 'center', padding: '0.4rem' }}>
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt="Voucher"
                              onClick={() => setViewImage(item.image_url)}
                              style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '6px', border: '1.5px solid #0284c7', cursor: 'pointer' }}
                              title="Ver Captura"
                            />
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>—</span>
                          )}
                        </td>

                        {/* Fecha Abono Inline */}
                        <td style={{ textAlign: 'center', padding: '0.4rem' }}>
                          <input
                            type="date"
                            className="form-input"
                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.35rem', backgroundColor: '#0f172a', color: '#38bdf8', fontWeight: '800', width: '115px' }}
                            value={inlineForms[item.id]?.date || item.date || startDate}
                            onChange={(e) => handleInlineChange(item.id, 'date', e.target.value)}
                            disabled={isVerificado}
                          />
                        </td>

                        {/* Tipo Pago Inline */}
                        <td style={{ padding: '0.4rem' }}>
                          <select
                            className="form-select"
                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.35rem', backgroundColor: '#0f172a', fontWeight: '800' }}
                            value={inlineForms[item.id]?.bank_name || item.bank_name || 'TRANSFERENCIA'}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleInlineChange(item.id, 'bank_name', val);
                              if (val === 'RETIRO EN EFECTIVO') {
                                handleInlineChange(item.id, 'transaction_type', 'EGRESO');
                              }
                            }}
                            disabled={isVerificado}
                          >
                            <option value="TRANSFERENCIA">🏦 TRANSF.</option>
                            <option value="YAPE">📱 YAPE/PLIN</option>
                            <option value="POS">💳 POS</option>
                            <option value="RETIRO EN EFECTIVO">💵 RETIRO EFECTIVO</option>
                          </select>
                        </td>

                        {/* Movimiento Inline */}
                        <td style={{ textAlign: 'center', padding: '0.4rem' }}>
                          <select
                            className="form-select"
                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.35rem', backgroundColor: '#0f172a', fontWeight: '800' }}
                            value={inlineForms[item.id]?.transaction_type || item.transaction_type || 'INGRESO'}
                            onChange={(e) => handleInlineChange(item.id, 'transaction_type', e.target.value)}
                            disabled={isVerificado}
                          >
                            <option value="INGRESO">🟢 INGRESO</option>
                            <option value="EGRESO">🔴 EGRESO</option>
                          </select>
                        </td>

                        {/* Monto S/ Inline */}
                        <td style={{ padding: '0.4rem' }}>
                          <input
                            type="number"
                            step="0.01"
                            className="form-input"
                            style={{ fontSize: '1rem', fontWeight: '900', color: '#34d399', padding: '0.25rem 0.4rem', backgroundColor: '#0f172a', textAlign: 'right', width: '100px' }}
                            placeholder="0.00"
                            value={inlineForms[item.id]?.amount !== undefined ? inlineForms[item.id]?.amount : (item.amount > 0 ? String(item.amount) : '')}
                            onChange={(e) => handleInlineChange(item.id, 'amount', e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveInlineRow(item)}
                            disabled={isVerificado}
                          />
                        </td>

                        {/* Concepto / Detalle Inline */}
                        <td style={{ padding: '0.4rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{ fontSize: '0.82rem', padding: '0.25rem 0.45rem', backgroundColor: '#0f172a', width: '100%' }}
                            placeholder="Ej: Yape Roy Pac"
                            value={inlineForms[item.id]?.notes !== undefined ? inlineForms[item.id]?.notes : (item.notes && !item.notes.startsWith('Captura #') ? item.notes : '')}
                            onChange={(e) => handleInlineChange(item.id, 'notes', e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveInlineRow(item)}
                            disabled={isVerificado}
                          />
                        </td>

                        {/* Auditoría Badges & Nota */}
                        <td style={{ padding: '0.4rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                            {isAnulado && <span className="badge" style={{ backgroundColor: '#ef4444', color: '#fff', fontWeight: '900', fontSize: '0.72rem' }}>🚫 ANULADO / DEVUELTO</span>}
                            {!isAnulado && isVerificado && <span className="badge" style={{ backgroundColor: '#10b981', color: '#fff', fontWeight: '900', fontSize: '0.72rem' }}>✅ APROBADO</span>}
                            {!isAnulado && isObservado && <span className="badge" style={{ backgroundColor: '#ef4444', color: '#fff', fontWeight: '900', fontSize: '0.72rem' }}>⚠️ DESCUADRE</span>}
                            {!isAnulado && isPendienteLlenado && <span className="badge" style={{ backgroundColor: '#f59e0b', color: '#000', fontWeight: '900', fontSize: '0.72rem' }}>⏳ PENDIENTE</span>}
                          </div>

                          {item.audit_note && (
                            <div style={{ marginTop: '0.25rem', backgroundColor: '#450a0a', border: '1px solid #ef4444', color: '#fca5a5', padding: '0.25rem 0.45rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>
                              <MessageSquare size={11} style={{ display: 'inline', marginRight: '3px' }} />
                              "{item.audit_note}"
                            </div>
                          )}
                        </td>

                        {/* ACCIONES */}
                        <td style={{ textAlign: 'center', padding: '0.4rem' }}>
                          <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            
                            {!isVerificado && (
                              <button
                                type="button"
                                onClick={() => handleSaveInlineRow(item)}
                                className="btn btn-primary btn-sm"
                                style={{ padding: '0.25rem 0.45rem', fontSize: '0.72rem', fontWeight: '900' }}
                                title="Guardar Cambios Inline"
                              >
                                <Save size={12} /> 💾 Guardar
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleToggleApprove(item)}
                              className="btn btn-sm"
                              style={{
                                backgroundColor: isVerificado ? '#10b981' : 'rgba(16, 185, 129, 0.25)',
                                color: '#ffffff',
                                border: '1px solid #10b981',
                                padding: '0.25rem 0.45rem',
                                fontSize: '0.72rem',
                                fontWeight: '900',
                                opacity: isAnulado ? 0.4 : 1,
                                cursor: isAnulado ? 'not-allowed' : 'pointer'
                              }}
                              disabled={isAnulado}
                              title={isAnulado ? 'Movimiento anulado no puede aprobarse' : (isVerificado ? 'Clic para DESACTIVAR Aprobación' : 'Aprobar Movimiento como TODO CONFORME')}
                            >
                              <CheckCircle2 size={12} /> {isVerificado ? '✅ Aprobado' : 'Aprobar'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleAnular(item)}
                              className="btn btn-sm"
                              style={{
                                backgroundColor: isAnulado ? '#ef4444' : 'rgba(239, 68, 68, 0.15)',
                                color: isAnulado ? '#ffffff' : '#f87171',
                                border: isAnulado ? '1px solid #dc2626' : '1px solid rgba(239, 68, 68, 0.45)',
                                padding: '0.25rem 0.45rem',
                                fontSize: '0.72rem',
                                fontWeight: '900',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem'
                              }}
                              title={isAnulado ? 'Movimiento ANULADO Y DEVUELTO (clic para reactivar)' : 'Marcar como ANULADO Y DEVUELTO (no sumará en Estado de Cuenta)'}
                            >
                              <Ban size={11} /> {isAnulado ? 'Anulado (Reactivar)' : 'Anular / Devuelto'}
                            </button>

                            {!isVerificado && (
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                className="btn btn-danger btn-sm"
                                style={{ padding: '0.25rem 0.45rem', fontSize: '0.72rem', fontWeight: '900' }}
                                title="Eliminar Movimiento"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BARRA FIJA FLOTANTE INFERIOR (STICKY BOTTOM BAR - Siempre Visible al bajar) */}
      {!loading && !error && entries.length > 0 && (
        <div style={{
          position: 'sticky',
          bottom: '0px',
          left: 0,
          right: 0,
          zIndex: 80,
          backgroundColor: '#0a0f1d',
          borderTop: '2.5px solid #38bdf8',
          boxShadow: '0 -8px 30px rgba(0, 0, 0, 0.85)',
          padding: '0.65rem 1.25rem',
          borderRadius: '12px 12px 0 0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.85rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '900', color: '#38bdf8', backgroundColor: '#0f172a', border: '1px solid #1e293b', padding: '0.25rem 0.6rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              📊 TOTALES DE LA SEMANA:
            </span>
            <span style={{ fontSize: '0.8rem', color: '#f1f5f9', fontWeight: '800' }}>
              {weekDays[0].name} al {weekDays[5].name}
            </span>
            <span style={{ fontSize: '0.74rem', backgroundColor: '#1e293b', color: '#94a3b8', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: '800' }}>
              📸 {uniqueImages.length} Capturas | 📋 {validWeeklyEntries.length} Movs
            </span>
            {weeklyAnuladosCount > 0 && (
              <span style={{ fontSize: '0.74rem', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid #ef4444', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                <Ban size={11} /> {weeklyAnuladosCount} Devuelto/Anulado (No suma)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
            {/* Apertura Banco */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', backgroundColor: 'rgba(99, 102, 241, 0.15)', border: '1.5px solid #6366f1', padding: '0.3rem 0.75rem', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '900', color: '#c7d2fe' }}>APERTURA:</span>
              <span style={{ fontSize: '1.15rem', fontWeight: '900', color: '#a5b4fc' }}>
                {formatSoles(bankOpening)}
              </span>
            </div>

            {/* Ingresos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1.5px solid #10b981', padding: '0.3rem 0.75rem', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '900', color: '#a7f3d0' }}>INGRESOS:</span>
              <span style={{ fontSize: '1.15rem', fontWeight: '900', color: '#34d399' }}>
                {formatSoles(weeklyTotalIngresos)}
              </span>
            </div>

            {/* Egresos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1.5px solid #ef4444', padding: '0.3rem 0.75rem', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '900', color: '#fca5a5' }}>EGRESOS:</span>
              <span style={{ fontSize: '1.15rem', fontWeight: '900', color: '#f87171' }}>
                {formatSoles(weeklyTotalEgresos)}
              </span>
            </div>

            {/* Saldo Final Banco */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', backgroundColor: 'rgba(56, 189, 248, 0.15)', border: '1.5px solid #0284c7', padding: '0.3rem 0.75rem', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '900', color: '#bae6fd' }}>SALDO BANCO:</span>
              <span style={{ fontSize: '1.15rem', fontWeight: '900', color: bankFinalBalance >= 0 ? '#38bdf8' : '#ef4444' }}>
                {formatSoles(bankFinalBalance)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL APERTURA DE BANCO DE LA SEMANA */}
      {showOpeningModal && (
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
          <div className="card" style={{ width: '100%', maxWidth: '480px', backgroundColor: '#0f172a', border: '2px solid #6366f1', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', color: '#a5b4fc', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '900' }}>
                🏦 Apertura de Banco de la Semana
              </h3>
              <button type="button" onClick={() => setShowOpeningModal(false)} className="btn-close-neon" title="Cerrar">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOpening} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ backgroundColor: '#1e293b', padding: '0.65rem 0.85rem', borderRadius: '8px', fontSize: '0.82rem', color: '#cbd5e1' }}>
                📅 <strong>Semana:</strong> {startDate} al {endDate}
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>
                  Saldo Inicial en Banco (S/):
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ej: 5250.00"
                  className="form-input"
                  style={{ fontSize: '1.15rem', fontWeight: '900', color: '#38bdf8', borderColor: '#6366f1' }}
                  value={openingInput}
                  onChange={(e) => setOpeningInput(e.target.value)}
                  autoFocus
                  required
                />
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                  💡 Ingrese el saldo con el que amaneció la cuenta bancaria BCP al inicio de esta semana.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>
                  Notas / Observación (Opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ej: Saldo de banca móvil BCP al Lunes 8:00 AM"
                  className="form-input"
                  value={openingNotesInput}
                  onChange={(e) => setOpeningNotesInput(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowOpeningModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={savingOpening} className="btn btn-primary" style={{ fontWeight: '900', backgroundColor: '#6366f1', borderColor: '#6366f1' }}>
                  {savingOpening ? 'Guardando...' : '💾 Guardar Apertura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: CARGA MASIVA DE CAPTURAS DE LA SEMANA */}
      {showBatchModal && (
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
          <div className="card" style={{ width: '100%', maxWidth: '560px', backgroundColor: '#0f172a', border: '3px solid #0284c7', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '900' }}>
                <FolderPlus size={22} /> Cargar Lote de Capturas de la Semana
              </h3>
              <button type="button" onClick={() => setShowBatchModal(false)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUploadBatch}>
              <div style={{
                backgroundColor: '#1e293b',
                border: '2px dashed #0284c7',
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
                marginBottom: '1.25rem',
                cursor: 'pointer'
              }}>
                <Upload size={48} color="#38bdf8" style={{ marginBottom: '0.85rem' }} />
                <label style={{ cursor: 'pointer', display: 'block' }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#ffffff', display: 'block' }}>
                    📁 Selecciona o Arrastra Varias Capturas de la Semana
                  </span>
                  <span style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.4rem', display: 'block' }}>
                    Puedes seleccionar 5, 10, 20 o más imágenes simultáneamente.
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleBatchFileSelect}
                    style={{ display: 'none' }}
                  />
                </label>

                {batchFiles.length > 0 && (
                  <div style={{ marginTop: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', color: '#34d399', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '900', fontSize: '0.9rem' }}>
                    ✅ {batchFiles.length} capturas seleccionadas para subir.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setShowBatchModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontWeight: '900', padding: '0.65rem 1.5rem' }} disabled={uploadingBatch || batchFiles.length === 0}>
                  {uploadingBatch ? 'Subiendo lote...' : `🚀 Subir ${batchFiles.length} Capturas e Iniciar Llenado`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: LLENADO RÁPIDO MULTI-MOVIMIENTO (CON ZOOM DE RUEDA DE MOUSE) */}
      {showFillModal && currentImgUrl && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '0.75rem'
        }}>
          <div className="card" style={{
            width: '98vw',
            maxWidth: '1600px',
            height: '96vh',
            backgroundColor: '#0f172a',
            border: '3px solid #10b981',
            borderRadius: '20px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 60px rgba(0,0,0,0.95)',
            overflow: 'hidden'
          }}>
            
            {/* Header de la Captura Actual y Carrusel */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1e293b', paddingBottom: '0.85rem', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', color: '#10b981', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '900' }}>
                  <Zap size={24} /> LLENADO MULTI-MOVIMIENTO — CAPTURA #{currentImageIndex + 1} DE #{uniqueImages.length}
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowSheetDrawer(true);
                    setDrawerMinimized(false);
                    const targetDate = formatDateInput(transactionDate) || formatDateInput(startDate);
                    if (targetDate && targetDate !== drawerDateStr) {
                      fetchDrawerSheet(targetDate);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    backgroundColor: showSheetDrawer ? 'rgba(2, 132, 199, 0.35)' : '#1e293b',
                    color: '#38bdf8',
                    border: '1.5px solid #0284c7',
                    padding: '0.45rem 0.95rem',
                    borderRadius: '10px',
                    fontWeight: '900',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    boxShadow: showSheetDrawer ? '0 0 14px rgba(2, 132, 199, 0.6)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                  title="Abrir comparador en vivo con la planilla diaria de la vendedora"
                >
                  <FileSpreadsheet size={16} /> 📋 Planilla Diaria (En Vivo)
                  {showSheetDrawer && (
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
                  )}
                </button>

                {/* Botón Cerrar */}
                <button 
                  type="button" 
                  onClick={() => setShowFillModal(false)} 
                  className="btn-close-neon"
                  title="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Carrusel de Selección de Capturas (#1, #2, #3...) */}
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.65rem', marginBottom: '0.85rem', borderBottom: '1px solid #1e293b' }}>
              {uniqueImages.map((img, idx) => {
                const isSelected = idx === currentImageIndex;
                const movCount = entries.filter(e => e.image_url === img && e.amount > 0).length;
                return (
                  <button
                    key={img}
                    type="button"
                    onClick={() => selectImageIndex(idx)}
                    style={{
                      padding: '0.45rem 0.95rem',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid #10b981' : '1px solid #334155',
                      backgroundColor: isSelected ? '#10b981' : (movCount > 0 ? 'rgba(16, 185, 129, 0.2)' : '#1e293b'),
                      color: isSelected ? '#ffffff' : (movCount > 0 ? '#34d399' : '#94a3b8'),
                      fontWeight: '900',
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Captura #{idx + 1} {movCount > 0 ? `(${movCount} movs)` : '(vacía)'}
                  </button>
                );
              })}
            </div>

            {/* Split View GIGANTE: Izquierda 0.85fr (Captura Celular) / Derecha 1.35fr (Formulario y Tabla Amplia) */}
            <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.35fr', gap: '1.25rem', flex: 1, overflowY: 'auto' }}>
              
              {/* LADO IZQUIERDO: VISUALIZADOR GIGANTE DE CAPTURA CON MANITO Y RUEDA DE MOUSE */}
              <div style={{
                backgroundColor: '#070a13',
                borderRadius: '14px',
                border: '2px solid #0284c7',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
                height: '100%',
                minHeight: '500px',
                overflow: 'hidden'
              }}>
                {/* Controles de Zoom, Rotación y Panning */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.65rem', zIndex: 10, flexWrap: 'wrap', width: '100%', justifyContent: 'center' }}>
                  <button type="button" onClick={() => setZoom(prev => Math.min(prev + 0.3, 4.0))} className="btn btn-secondary btn-sm"><ZoomIn size={14} /> Zoom +</button>
                  <button type="button" onClick={() => setZoom(prev => Math.max(prev - 0.3, 0.4))} className="btn btn-secondary btn-sm">Zoom -</button>
                  <button type="button" onClick={resetImageTransform} className="btn btn-secondary btn-sm">Reiniciar Vista (100%)</button>
                  <button type="button" onClick={() => setRotation(prev => (prev + 90) % 360)} className="btn btn-secondary btn-sm"><RotateCw size={14} /> Rotar 90°</button>
                  <button type="button" onClick={() => setViewImage(currentImgUrl)} className="btn btn-primary btn-sm"><Eye size={14} /> Pantalla Completa</button>
                  <span style={{ fontSize: '0.78rem', color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: '800', marginLeft: 'auto' }}>
                    <Move size={14} /> 🖱️ Usa la Rueda del Mouse para Zoom | ✋ Arrastra para Mover
                  </span>
                </div>

                {/* Área de Visualización con Zoom por Rueda de Mouse + Drag */}
                <div
                  ref={fillImageContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{
                    flex: 1,
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#020617',
                    borderRadius: '10px',
                    padding: '0.5rem',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    position: 'relative'
                  }}
                >
                  <img
                    src={currentImgUrl}
                    alt={`Captura #${currentImageIndex + 1}`}
                    draggable={false}
                    style={{
                      maxHeight: '74vh',
                      maxWidth: '100%',
                      width: 'auto',
                      objectFit: 'contain',
                      transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                      transition: isDragging ? 'none' : 'transform 0.15s ease',
                      borderRadius: '8px',
                      pointerEvents: 'none'
                    }}
                  />
                </div>
              </div>

              {/* LADO DERECHO: AGREGAR MOVIMIENTO Y TABLA DE MOVIMIENTOS DE ESTA CAPTURA */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
                
                <form onSubmit={handleAddMovementToImage} style={{ backgroundColor: '#1e293b', padding: '1.15rem', borderRadius: '14px', border: '1.5px solid #334155', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #334155', paddingBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#38bdf8' }}>
                      {editingFillId ? '✏️ Modificar Movimiento' : '➕ Ingresar Movimiento'} de esta Imagen (Captura #{currentImageIndex + 1})
                    </span>
                    {editingFillId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFillId(null);
                          setAmount('');
                          setConceptNote('');
                          setTimeout(() => amountInputRef.current?.focus(), 100);
                        }}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', color: '#34d399' }}
                      >
                        ➕ Agregar Nuevo
                      </button>
                    )}
                  </div>

                  {/* Fecha de Abono / Ingreso */}
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: '900', color: '#38bdf8', fontSize: '0.88rem' }}>📅 Fecha Abono / Ingreso:</label>
                    <input
                      type="date"
                      className="form-input"
                      style={{ fontSize: '0.95rem', padding: '0.6rem', fontWeight: '900', backgroundColor: '#0f172a', color: '#38bdf8', borderColor: '#0284c7' }}
                      value={formatDateInput(transactionDate)}
                      onChange={(e) => setTransactionDate(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                    {/* 1. Tipo de Pago */}
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: '800', color: '#ffffff', fontSize: '0.88rem' }}>1. Tipo Pago:</label>
                      <select
                        className="form-select"
                        style={{ fontSize: '1rem', padding: '0.65rem', fontWeight: '800', backgroundColor: '#0f172a' }}
                        value={paymentType}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPaymentType(val);
                          if (val === 'RETIRO EN EFECTIVO') {
                            setTransactionType('EGRESO');
                          }
                        }}
                      >
                        <option value="TRANSFERENCIA">🏦 TRANSFERENCIA</option>
                        <option value="YAPE">📱 YAPE / PLIN</option>
                        <option value="POS">💳 POS / TARJETA</option>
                        <option value="RETIRO EN EFECTIVO">💵 RETIRO EN EFECTIVO</option>
                      </select>
                    </div>

                    {/* 2. Movimiento — Selectivo Manual (INGRESO o EGRESO) */}
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: '800', color: '#ffffff', fontSize: '0.88rem' }}>2. Movimiento:</label>
                      <div style={{ display: 'flex', gap: '0.5rem', height: '44px' }}>
                        <button
                          type="button"
                          onClick={() => setTransactionType('INGRESO')}
                          style={{
                            flex: 1,
                            borderRadius: '8px',
                            fontWeight: '900',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: transactionType === 'INGRESO' ? '#10b981' : '#0f172a',
                            color: transactionType === 'INGRESO' ? '#ffffff' : '#94a3b8',
                            border: transactionType === 'INGRESO' ? '2px solid #34d399' : '1.5px solid #1e293b',
                            boxShadow: transactionType === 'INGRESO' ? '0 0 10px rgba(16,185,129,0.4)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          🟢 INGRESO
                        </button>
                        <button
                          type="button"
                          onClick={() => setTransactionType('EGRESO')}
                          style={{
                            flex: 1,
                            borderRadius: '8px',
                            fontWeight: '900',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: transactionType === 'EGRESO' ? '#ef4444' : '#0f172a',
                            color: transactionType === 'EGRESO' ? '#ffffff' : '#94a3b8',
                            border: transactionType === 'EGRESO' ? '2px solid #f87171' : '1.5px solid #1e293b',
                            boxShadow: transactionType === 'EGRESO' ? '0 0 10px rgba(239,68,68,0.4)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          🔴 EGRESO
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 3. Monto S/ y 4. Concepto */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '0.85rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: '900', color: '#38bdf8', fontSize: '0.88rem' }}>3. Monto (S/):</label>
                      <input
                        ref={amountInputRef}
                        type="number"
                        step="0.01"
                        className="form-input"
                        style={{ fontSize: '1.35rem', fontWeight: '900', color: '#22c55e', padding: '0.65rem', backgroundColor: '#0f172a' }}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Ej: 15.00"
                        required
                      />
                      {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowSheetDrawer(true);
                            setDrawerMinimized(false);
                            setDrawerSearch(amount.trim());
                            const targetDate = formatDateInput(transactionDate) || formatDateInput(startDate);
                            if (targetDate && targetDate !== drawerDateStr) {
                              fetchDrawerSheet(targetDate);
                            }
                          }}
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            color: '#38bdf8',
                            background: 'rgba(2, 132, 199, 0.25)',
                            border: '1px solid #0284c7',
                            borderRadius: '6px',
                            padding: '0.25rem 0.5rem',
                            cursor: 'pointer',
                            marginTop: '0.35rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            width: 'fit-content'
                          }}
                          title="Buscar este monto en la planilla de la vendedora"
                        >
                          <Search size={12} /> Comparar S/ {amount} en Planilla
                        </button>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: '800', color: '#ffffff', fontSize: '0.88rem' }}>4. Concepto / Nombre:</label>
                      <input
                        type="text"
                        className="form-input"
                        style={{ fontSize: '1rem', padding: '0.65rem', backgroundColor: '#0f172a' }}
                        value={conceptNote}
                        onChange={(e) => setConceptNote(e.target.value)}
                        placeholder="Ej: Yape Roy Pac"
                      />
                    </div>
                  </div>

                  {/* Checkbox Avisar a Vendedora */}
                  <div style={{ margin: '0.4rem 0 0.85rem 0', display: 'flex', alignItems: 'center', gap: '0.55rem', backgroundColor: 'rgba(234, 179, 8, 0.12)', border: '1.5px dashed #eab308', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                    <input
                      type="checkbox"
                      id="notifyVendedoraCheck"
                      checked={notifyOnSave}
                      onChange={(e) => setNotifyOnSave(e.target.checked)}
                      style={{ width: '17px', height: '17px', accentColor: '#eab308', cursor: 'pointer' }}
                    />
                    <label htmlFor="notifyVendedoraCheck" style={{ fontSize: '0.82rem', fontWeight: '800', color: '#fef08a', cursor: 'pointer', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Pin size={14} color="#eab308" />
                      <span>Avisar de inmediato a la vendedora en su Stick de Notas (para llenar en Planilla Diaria)</span>
                    </label>
                  </div>

                  {/* Botón Agregar / Actualizar Movimiento */}
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ fontWeight: '900', padding: '0.75rem', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)' }}
                  >
                    <Plus size={20} /> {editingFillId ? '💾 Actualizar Movimiento' : '➕ Guardar Movimiento'}
                  </button>
                </form>

                {/* MINI TABLA DE MOVIMIENTOS REGISTRADOS PARA ESTA CAPTURA */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a', borderRadius: '14px', border: '1.5px solid #1e293b', padding: '0.85rem', overflow: 'hidden', minHeight: '180px' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: '900', color: '#10b981', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>📋 Movimientos Registrados en Captura #{currentImageIndex + 1} ({currentImageEntries.length})</span>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {currentImageEntries.length === 0 ? (
                      <p style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem', fontStyle: 'italic' }}>
                        Aún no se han agregado movimientos para esta imagen. Completa el formulario de arriba para ingresar el primero.
                      </p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#1e293b', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                            <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left' }}>FECHA</th>
                            <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left' }}>TIPO</th>
                            <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>MOV.</th>
                            <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>MONTO</th>
                            <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left' }}>CONCEPTO</th>
                            <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>ACCION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentImageEntries.map((m) => {
                            const badgeStyle = getPaymentTypeBadgeStyle(m.bank_name);
                            return (
                              <tr key={m.id} style={{ borderBottom: '1px solid #1e293b' }}>
                                <td style={{ padding: '0.4rem 0.5rem', color: '#38bdf8', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                  📅 {formatDateDisplay(m.date)}
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem' }}>
                                  <span className="badge" style={{ ...badgeStyle, fontSize: '0.72rem', padding: '0.2rem 0.45rem' }}>{m.bank_name}</span>
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                                  <span style={{ color: m.transaction_type === 'INGRESO' ? '#34d399' : '#f87171', fontWeight: '900' }}>
                                    {m.transaction_type}
                                  </span>
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: '900', color: '#ffffff' }}>
                                  {formatSoles(m.amount)}
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem', color: '#cbd5e1' }}>{m.notes || '—'}</td>
                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => openNotifyVendedoraModal(m)}
                                    style={{
                                      backgroundColor: m.status === 'OBSERVADO' ? '#d97706' : 'rgba(234, 179, 8, 0.2)',
                                      color: m.status === 'OBSERVADO' ? '#ffffff' : '#facc15',
                                      border: '1px solid #eab308',
                                      borderRadius: '4px',
                                      padding: '0.2rem 0.45rem',
                                      fontSize: '0.72rem',
                                      fontWeight: '800',
                                      marginRight: '0.3rem',
                                      cursor: 'pointer'
                                    }}
                                    title="Avisar a la vendedora en Stick de Notas para llenar en Planilla Diaria"
                                  >
                                    📌 {m.status === 'OBSERVADO' ? 'Avisado' : 'Avisar'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingFillId(m.id);
                                      setPaymentType(m.bank_name || 'TRANSFERENCIA');
                                      setTransactionType(m.transaction_type || 'INGRESO');
                                      setAmount(String(m.amount));
                                      setConceptNote(m.notes || '');
                                      setTransactionDate(formatDateInput(m.date) || formatDateInput(startDate) || getLocalDateStr());
                                      setTimeout(() => amountInputRef.current?.focus(), 100);
                                    }}
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.72rem', marginRight: '0.3rem' }}
                                    title="Editar este movimiento"
                                  >
                                    <Edit3 size={12} color="#38bdf8" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(m.id)}
                                    className="btn btn-danger btn-sm"
                                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.72rem' }}
                                    title="Eliminar"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* BOTONES DE NAVEGACIÓN ENTRE CAPTURAS */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: 'auto' }}>
                  <button
                    type="button"
                    disabled={currentImageIndex === 0}
                    onClick={() => selectImageIndex(currentImageIndex - 1)}
                    className="btn btn-secondary btn-sm"
                    style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem' }}
                  >
                    <ArrowLeft size={16} /> Captura Anterior
                  </button>

                  {currentImageIndex < uniqueImages.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => selectImageIndex(currentImageIndex + 1)}
                      className="btn btn-success"
                      style={{ fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.35rem' }}
                    >
                      <span>Pasar a Captura #{currentImageIndex + 2}</span>
                      <ArrowRight size={18} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowFillModal(false)}
                      className="btn btn-primary"
                      style={{ fontWeight: '900', padding: '0.6rem 1.35rem' }}
                    >
                      🎉 Finalizar Llenado de la Semana
                    </button>
                  )}
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* MODAL 3: AUDITORÍA POSTERIOR CON NOTA A VENDEDORA */}
      {auditingItem && (
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
          <div className="card" style={{ width: '100%', maxWidth: '520px', backgroundColor: '#0f172a', border: auditStatus === 'VERIFICADO' ? '3px solid #10b981' : '3px solid #ef4444', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', color: auditStatus === 'VERIFICADO' ? '#10b981' : '#ef4444', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '900' }}>
                <AlertTriangle size={22} /> Auditoría de Control Bancario
              </h3>
              <button onClick={() => setAuditingItem(null)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAudit}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: '800', color: '#ffffff', marginBottom: '0.5rem', display: 'block' }}>
                  Resultado de la Auditoría:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={() => setAuditStatus('VERIFICADO')}
                    style={{
                      padding: '0.65rem 0.45rem',
                      borderRadius: '10px',
                      border: auditStatus === 'VERIFICADO' ? '3px solid #10b981' : '1px solid #334155',
                      backgroundColor: auditStatus === 'VERIFICADO' ? 'rgba(16, 185, 129, 0.25)' : '#1e293b',
                      color: auditStatus === 'VERIFICADO' ? '#34d399' : '#94a3b8',
                      fontWeight: '900',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <CheckCircle2 size={16} /> ✅ CONFORME
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditStatus('OBSERVADO')}
                    style={{
                      padding: '0.65rem 0.45rem',
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
                      gap: '0.35rem'
                    }}
                  >
                    <AlertTriangle size={16} /> 🔴 OBSERVADO
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditStatus('PENDIENTE')}
                    style={{
                      padding: '0.65rem 0.45rem',
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
                      gap: '0.35rem'
                    }}
                  >
                    ⚪ REVERTIR
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" style={{ fontWeight: '800', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                  <MessageSquare size={16} color="#38bdf8" /> Mensaje / Explicación Solicitada a la Vendedora:
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
                  placeholder="Ej: Explicar de qué cliente o contrato proviene esta captura de S/ 150 del día 08/10."
                  value={auditNote}
                  onChange={(e) => setAuditNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setAuditingItem(null)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className={auditStatus === 'VERIFICADO' ? 'btn btn-success' : 'btn btn-danger'} style={{ fontWeight: '900', padding: '0.65rem 1.25rem' }}>
                  💾 Guardar Auditoría
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: EDICIÓN DE MOVIMIENTO INDIVIDUAL */}
      {editingItem && (
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
          <div className="card" style={{ width: '100%', maxWidth: editingItem.image_url ? '960px' : '500px', backgroundColor: '#0f172a', border: '3px solid #38bdf8', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '900' }}>
                <Edit3 size={20} /> Editar Movimiento Bancario
              </h3>
              <button type="button" onClick={() => setEditingItem(null)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: editingItem.image_url ? '1fr 1fr' : '1fr', gap: '1.25rem' }}>
              {editingItem.image_url && (
                <div style={{ backgroundColor: '#070a13', borderRadius: '12px', border: '1.5px solid #0284c7', padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <img
                    src={editingItem.image_url}
                    alt="Voucher Voucher"
                    style={{ maxHeight: '420px', maxWidth: '100%', objectFit: 'contain', borderRadius: '8px' }}
                  />
                  <button type="button" onClick={() => setViewImage(editingItem.image_url)} className="btn btn-secondary btn-sm" style={{ marginTop: '0.75rem', fontWeight: '800' }}>
                    <Eye size={14} /> Pantalla Completa
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveEditItem} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '800', color: '#38bdf8' }}>📅 Fecha de Abono / Ingreso:</label>
                  <input type="date" className="form-input" value={formatDateInput(transactionDate)} onChange={(e) => setTransactionDate(e.target.value)} required />
                </div>

                <div className="form-group">
                  <label className="form-label">Tipo de Pago:</label>
                  <select
                    className="form-select"
                    value={paymentType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPaymentType(val);
                      if (val === 'RETIRO EN EFECTIVO') {
                        setTransactionType('EGRESO');
                      }
                    }}
                  >
                    <option value="TRANSFERENCIA">🏦 TRANSFERENCIA</option>
                    <option value="YAPE">📱 YAPE / PLIN</option>
                    <option value="POS">💳 POS / TARJETA</option>
                    <option value="RETIRO EN EFECTIVO">💵 RETIRO EN EFECTIVO</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Movimiento (Selectivo):</label>
                  <div style={{ display: 'flex', gap: '0.5rem', height: '42px' }}>
                    <button
                      type="button"
                      onClick={() => setTransactionType('INGRESO')}
                      style={{
                        flex: 1,
                        borderRadius: '8px',
                        fontWeight: '900',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: transactionType === 'INGRESO' ? '#10b981' : '#0f172a',
                        color: transactionType === 'INGRESO' ? '#ffffff' : '#94a3b8',
                        border: transactionType === 'INGRESO' ? '2px solid #34d399' : '1.5px solid #1e293b',
                        boxShadow: transactionType === 'INGRESO' ? '0 0 10px rgba(16,185,129,0.4)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      🟢 INGRESO
                    </button>
                    <button
                      type="button"
                      onClick={() => setTransactionType('EGRESO')}
                      style={{
                        flex: 1,
                        borderRadius: '8px',
                        fontWeight: '900',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: transactionType === 'EGRESO' ? '#ef4444' : '#0f172a',
                        color: transactionType === 'EGRESO' ? '#ffffff' : '#94a3b8',
                        border: transactionType === 'EGRESO' ? '2px solid #f87171' : '1.5px solid #1e293b',
                        boxShadow: transactionType === 'EGRESO' ? '0 0 10px rgba(239,68,68,0.4)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      🔴 EGRESO
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Monto (S/):</label>
                  <input type="number" step="0.01" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ej: 15.00" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Concepto / Nombre:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={conceptNote}
                    onChange={(e) => setConceptNote(e.target.value)}
                    placeholder="Ej: Yape Roy Pac"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setEditingItem(null)} className="btn btn-secondary">Cancelar</button>
                  <button type="submit" className="btn btn-primary" style={{ fontWeight: '900' }}>💾 Guardar Cambios</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* VENTANA FLOTANTE: COMPARADOR EN VIVO CON LA PLANILLA DIARIA DE LA VENDEDORA */}
      {showSheetDrawer && (
        <div style={{
          position: 'fixed',
          left: `${drawerPosition.x}px`,
          top: `${drawerPosition.y}px`,
          width: drawerMinimized ? '340px' : '480px',
          maxWidth: 'calc(100vw - 30px)',
          height: drawerMinimized ? '50px' : '640px',
          maxHeight: 'calc(100vh - 80px)',
          backgroundColor: '#0b1329',
          backgroundImage: 'linear-gradient(to bottom, #0f172a, #0b1329)',
          border: '2px solid #0284c7',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.95), 0 0 25px rgba(2, 132, 199, 0.4)',
          zIndex: 100050,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: isDraggingDrawer ? 'none' : 'height 0.2s ease, width 0.2s ease'
        }}>
          {/* Header de la Ventana Flotante (Draggable a cualquier lado) */}
          <div
            onMouseDown={handleDrawerHeaderMouseDown}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.65rem 1rem',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              userSelect: 'none',
              cursor: isDraggingDrawer ? 'grabbing' : 'grab',
              borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}
            title="✋ Arrastra desde esta barra para mover la ventana a cualquier lugar"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '900', fontSize: '0.92rem' }}>
              <Move size={15} style={{ opacity: 0.85 }} />
              <FileSpreadsheet size={18} />
              <span>Planilla Diaria (En Vivo)</span>
              <span style={{ fontSize: '0.72rem', backgroundColor: '#0f172a', color: '#38bdf8', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: '800' }}>
                {formatDateDisplay(drawerDateStr)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                onClick={() => fetchDrawerSheet(drawerDateStr, true)}
                title="Recargar datos de planilla"
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
              >
                <RotateCw size={15} />
              </button>
              <button
                type="button"
                onClick={() => setDrawerMinimized(prev => !prev)}
                title={drawerMinimized ? "Expandir" : "Minimizar"}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
              >
                {drawerMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
              </button>
              <button
                type="button"
                onClick={() => setShowSheetDrawer(false)}
                title="Cerrar ventana flotante"
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Cuerpo de la Ventana Flotante (Solo visible si no está minimizada) */}
          {!drawerMinimized && (() => {
            const currentSheetData = drawerCache[drawerDateStr] || { income_entries: [], expense_entries: [] };
            const rawList = drawerActiveTab === 'incomes' ? (currentSheetData.income_entries || []) : (currentSheetData.expense_entries || []);

            const filteredEntries = rawList.filter(item => {
              if (!drawerSearch.trim()) return true;
              const q = drawerSearch.trim().toLowerCase();
              const cleanNum = q.replace(/s\/\s*/gi, '');
              const num = parseFloat(cleanNum);
              const itemAmt = drawerActiveTab === 'incomes' ? parseFloat(item.amount_paid || 0) : parseFloat(item.amount || 0);
              const totalAmt = parseFloat(item.total_amount || 0);

              if (!isNaN(num) && (Math.abs(itemAmt - num) < 0.01 || Math.abs(totalAmt - num) < 0.01)) {
                return true;
              }

              if (drawerActiveTab === 'incomes') {
                const contractMatch = String(item.contract_num || '').toLowerCase().includes(q);
                const clientMatch = String(item.client_name || '').toLowerCase().includes(q);
                const detailsMatch = String(item.details || '').toLowerCase().includes(q);
                const paymentMatch = String(item.payment_type_display || item.payment_type || '').toLowerCase().includes(q);
                const noteMatch = String(item.notes || '').toLowerCase().includes(q);
                return contractMatch || clientMatch || detailsMatch || paymentMatch || noteMatch;
              } else {
                const descMatch = String(item.details || item.description || '').toLowerCase().includes(q);
                const typeMatch = String(item.expense_type || '').toLowerCase().includes(q);
                const staffMatch = String(item.staff_name || '').toLowerCase().includes(q);
                const paymentMatch = String(item.payment_type || '').toLowerCase().includes(q);
                return descMatch || typeMatch || staffMatch || paymentMatch;
              }
            });

            return (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '0.75rem', gap: '0.65rem', overflow: 'hidden' }}>
                
                {/* SELECTOR DE SEMANA (ANTERIOR / SIGUIENTE) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.25rem 0.5rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <button
                    type="button"
                    onClick={() => setDrawerWeekOffset(prev => prev - 1)}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.74rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    title="Ver Semana Anterior"
                  >
                    <ChevronLeft size={13} /> Sem. Ant.
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: '900' }}>
                      🗓️ {drawerWeekDays[0].name.split(' ')[1]} al {drawerWeekDays[5].name.split(' ')[1]}
                    </span>
                    {drawerWeekOffset !== 0 && (
                      <button
                        type="button"
                        onClick={() => setDrawerWeekOffset(0)}
                        style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: '#0284c7', color: '#ffffff', border: 'none', cursor: 'pointer', fontWeight: '800' }}
                        title="Volver a la semana del Estado de Cuenta"
                      >
                        Sem. Actual
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setDrawerWeekOffset(prev => prev + 1)}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.74rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    title="Ver Semana Siguiente"
                  >
                    Sem. Sig. <ChevronRight size={13} />
                  </button>
                </div>

                {/* SELECTOR DE DÍAS (LUNES A SÁBADO) */}
                <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                  {drawerWeekDays.map(d => {
                    const isSelected = d.dateStr === drawerDateStr;
                    const parts = d.name.split(' ');
                    const shortLabel = parts[0].substring(0, 3) + ' ' + (parts[1] || '');
                    return (
                      <button
                        key={d.dateStr}
                        type="button"
                        onClick={() => fetchDrawerSheet(d.dateStr)}
                        style={{
                          flex: '0 0 auto',
                          padding: '0.35rem 0.65rem',
                          borderRadius: '7px',
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          cursor: 'pointer',
                          border: isSelected ? '1.5px solid #38bdf8' : '1px solid #334155',
                          backgroundColor: isSelected ? '#0284c7' : '#1e293b',
                          color: isSelected ? '#ffffff' : '#94a3b8',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {shortLabel}
                      </button>
                    );
                  })}
                </div>

                {/* BUSCADOR RÁPIDO */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input
                      type="text"
                      placeholder="Buscar por monto (ej: 120), contrato, cliente..."
                      value={drawerSearch}
                      onChange={(e) => setDrawerSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.45rem 1.8rem 0.45rem 2rem',
                        fontSize: '0.82rem',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        outline: 'none'
                      }}
                    />
                    {drawerSearch && (
                      <button
                        type="button"
                        onClick={() => setDrawerSearch('')}
                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
                    <button
                      type="button"
                      onClick={() => setDrawerSearch(amount.trim())}
                      style={{
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        fontWeight: '800',
                        backgroundColor: 'rgba(2, 132, 199, 0.25)',
                        color: '#38bdf8',
                        border: '1px solid #0284c7',
                        borderRadius: '7px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                      title="Filtrar por monto actual del voucher"
                    >
                      🎯 {formatSoles(amount)}
                    </button>
                  )}
                </div>

                {/* PESTAÑAS: INGRESOS / EGRESOS */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setDrawerActiveTab('incomes')}
                    style={{
                      padding: '0.45rem',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: '900',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      backgroundColor: drawerActiveTab === 'incomes' ? 'rgba(16, 185, 129, 0.25)' : '#1e293b',
                      color: drawerActiveTab === 'incomes' ? '#34d399' : '#94a3b8',
                      border: drawerActiveTab === 'incomes' ? '1.5px solid #10b981' : '1px solid #334155'
                    }}
                  >
                    🟢 Ingresos ({currentSheetData?.income_entries?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerActiveTab('expenses')}
                    style={{
                      padding: '0.45rem',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: '900',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      backgroundColor: drawerActiveTab === 'expenses' ? 'rgba(239, 68, 68, 0.25)' : '#1e293b',
                      color: drawerActiveTab === 'expenses' ? '#f87171' : '#94a3b8',
                      border: drawerActiveTab === 'expenses' ? '1.5px solid #ef4444' : '1px solid #334155'
                    }}
                  >
                    🔴 Egresos ({currentSheetData?.expense_entries?.length || 0})
                  </button>
                </div>

                {/* LISTA DE REGISTROS SCROLLABLE */}
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.2rem' }}>
                  {drawerLoading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                      ⚡ Cargando planilla de este día...
                    </div>
                  ) : filteredEntries.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic' }}>
                      {drawerSearch ? 'No se encontraron resultados con esa búsqueda.' : 'No hay registros en la planilla para este día.'}
                    </div>
                  ) : (
                    filteredEntries.map(item => {
                      const isIncome = drawerActiveTab === 'incomes';
                      const isConforme = item.audit_status === 'CONFORME';
                      const isObservado = item.audit_status === 'OBSERVADO';
                      const itemAmt = isIncome ? parseFloat(item.amount_paid || 0) : parseFloat(item.amount || 0);
                      const isMatch = amount && !isNaN(parseFloat(amount)) && Math.abs(itemAmt - parseFloat(amount)) < 0.01;

                      return (
                        <div
                          key={item.id}
                          style={{
                            backgroundColor: isMatch ? 'rgba(245, 158, 11, 0.1)' : '#0f172a',
                            border: isMatch ? '2px solid #f59e0b' : (isConforme ? '1.5px solid #10b981' : (isObservado ? '1.5px solid #ef4444' : '1px solid #334155')),
                            borderRadius: '10px',
                            padding: '0.65rem 0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.4rem',
                            boxShadow: isMatch ? '0 0 14px rgba(245, 158, 11, 0.35)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {isMatch && (
                            <div style={{ fontSize: '0.72rem', fontWeight: '900', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              ⭐ ¡Coincide con Monto Actual: {formatSoles(itemAmt)}!
                            </div>
                          )}

                          {/* Header de la fila */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {isIncome ? (
                                <span style={{ fontSize: '0.8rem', fontWeight: '900', color: '#38bdf8', backgroundColor: '#1e293b', padding: '0.15rem 0.45rem', borderRadius: '5px' }}>
                                  Contrato #{item.contract_num || 'S/N'}
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#f87171', backgroundColor: '#1e293b', padding: '0.15rem 0.45rem', borderRadius: '5px' }}>
                                  {item.expense_type || 'Gasto'}
                                </span>
                              )}

                              {/* Tipo de Pago Badge */}
                              <span style={{
                                fontSize: '0.7rem',
                                fontWeight: '800',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                backgroundColor: (item.payment_type || item.payment_type_display || '').toUpperCase().includes('BCP') ? '#0284c7' :
                                  (item.payment_type || item.payment_type_display || '').toUpperCase().includes('YAPE') ? '#7c3aed' :
                                  (item.payment_type || item.payment_type_display || '').toUpperCase().includes('EFECTIVO') ? '#10b981' : '#475569',
                                color: '#ffffff'
                              }}>
                                {item.payment_type_display || item.payment_type}
                              </span>

                              {item.vendedor_name && (
                                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                  👤 {item.vendedor_name}
                                </span>
                              )}
                            </div>

                            {/* Monto */}
                            <span style={{ fontSize: '1.05rem', fontWeight: '900', color: isIncome ? '#34d399' : '#f87171' }}>
                              {formatSoles(itemAmt)}
                            </span>
                          </div>

                          {/* Detalle / Cliente / Concepto de Gasto */}
                          <div style={{ fontSize: '0.85rem', color: '#e2e8f0', lineHeight: '1.35' }}>
                            {isIncome ? (
                              <>
                                <strong style={{ color: '#ffffff' }}>{item.client_name || 'Cliente S/N'}</strong>
                                {item.details && <span style={{ color: '#94a3b8' }}> — {item.details}</span>}
                              </>
                            ) : (
                              <div>
                                <strong style={{ color: '#ffffff', fontSize: '0.88rem' }}>
                                  {item.details || item.description || '(Sin detalle especificado)'}
                                </strong>
                                {item.staff_name && (
                                  <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '0.15rem' }}>
                                    👤 Personal: <strong>{item.staff_name}</strong>
                                    {item.weekly_discount && item.weekly_discount > 0 && (
                                      <span style={{ color: '#fbbf24', marginLeft: '0.4rem' }}>
                                        (Desc. Semanal: {formatSoles(item.weekly_discount)})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Info extra para Ingresos (Total y Saldo) */}
                          {isIncome && item.total_amount > 0 && (
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', gap: '0.75rem' }}>
                              <span>Total: <strong style={{ color: '#f1f5f9' }}>{formatSoles(item.total_amount)}</strong></span>
                              <span>Saldo: <strong style={{ color: item.saldo > 0 ? '#fbbf24' : '#34d399' }}>{formatSoles(item.saldo || 0)}</strong></span>
                              {item.status && <span style={{ color: '#38bdf8' }}>({item.status})</span>}
                            </div>
                          )}

                          {/* Observación previa si existe */}
                          {isObservado && item.audit_note && (
                            <div style={{ fontSize: '0.73rem', color: '#fca5a5', backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '0.3rem 0.5rem', borderRadius: '5px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                              ⚠️ <strong>Nota:</strong> {item.audit_note}
                            </div>
                          )}

                          {/* Barra de Acciones de Auditoría (Conforme Reversible + Observar) */}
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.2rem', alignItems: 'center' }}>
                            {/* Botón Conforme Reversible */}
                            <button
                              type="button"
                              onClick={() => handleDrawerQuickAudit(isIncome ? 'income' : 'expense', item)}
                              style={{
                                padding: '0.3rem 0.65rem',
                                fontSize: '0.75rem',
                                fontWeight: '900',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                backgroundColor: isConforme ? '#10b981' : 'rgba(16, 185, 129, 0.15)',
                                color: isConforme ? '#ffffff' : '#34d399',
                                border: isConforme ? '1.5px solid #059669' : '1px solid #10b981',
                                transition: 'all 0.15s ease'
                              }}
                              title={isConforme ? 'Hacer clic para deshacer conformidad (volver a Pendiente)' : 'Marcar como conforme'}
                            >
                              <CheckCircle2 size={13} /> {isConforme ? '✅ Conforme (Clic para deshacer)' : 'Conforme'}
                            </button>

                            {/* Botón Observar */}
                            <button
                              type="button"
                              onClick={() => setDrawerAuditObservationRow({
                                type: isIncome ? 'income' : 'expense',
                                row: item,
                                note: item.audit_note || ''
                              })}
                              style={{
                                padding: '0.3rem 0.55rem',
                                fontSize: '0.75rem',
                                fontWeight: '800',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                backgroundColor: isObservado ? '#ef4444' : 'rgba(239, 68, 68, 0.15)',
                                color: isObservado ? '#ffffff' : '#f87171',
                                border: isObservado ? '1.5px solid #dc2626' : '1px solid #ef4444',
                                transition: 'all 0.15s ease'
                              }}
                              title="Dejar nota de observación para la vendedora"
                            >
                              <AlertTriangle size={13} /> {isObservado ? 'Observado' : 'Observar'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* MODAL DE OBSERVACIÓN DE REGISTRO DE PLANILLA */}
      {drawerAuditObservationRow && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          zIndex: 100150,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div style={{
            width: '420px',
            maxWidth: '95vw',
            backgroundColor: '#0f172a',
            border: '2px solid #ef4444',
            borderRadius: '14px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.9)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ color: '#ef4444', margin: 0, fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={18} /> Observar Registro de Planilla
              </h4>
              <button
                type="button"
                onClick={() => setDrawerAuditObservationRow(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
              <strong>
                {drawerAuditObservationRow.type === 'income'
                  ? `Contrato #${drawerAuditObservationRow.row.contract_num || 'S/N'} — ${drawerAuditObservationRow.row.client_name || ''} (${drawerAuditObservationRow.row.details || ''})`
                  : `${drawerAuditObservationRow.row.expense_type || 'Gasto'} — ${drawerAuditObservationRow.row.details || drawerAuditObservationRow.row.description || ''}`}
              </strong>
              <div style={{ color: '#38bdf8', marginTop: '0.2rem' }}>
                Monto: {formatSoles(drawerAuditObservationRow.type === 'income' ? drawerAuditObservationRow.row.amount_paid : drawerAuditObservationRow.row.amount)}
              </div>
            </div>

            <form onSubmit={handleSaveDrawerObservation} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <textarea
                rows={3}
                className="form-input"
                placeholder="Escribe la observación (ej: Falta voucher en banco, monto no coincide...)"
                value={drawerAuditObservationRow.note}
                onChange={(e) => setDrawerAuditObservationRow(prev => ({ ...prev, note: e.target.value }))}
                required
                style={{ width: '100%', fontSize: '0.88rem', padding: '0.6rem', backgroundColor: '#1e293b', color: '#ffffff' }}
                autoFocus
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setDrawerAuditObservationRow(null)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-danger btn-sm"
                  style={{ fontWeight: '900' }}
                >
                  ⚠️ Guardar Observación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visor de Imagen a Pantalla Completa */}
      {viewImage && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '1rem'
        }}>
          <div style={{ alignSelf: 'flex-end', marginBottom: '0.5rem', marginRight: '1.5rem' }}>
            <button onClick={() => setViewImage(null)} className="btn btn-danger btn-sm" style={{ fontWeight: '900' }}>
              <X size={18} /> Cerrar Visor
            </button>
          </div>
          <img
            src={viewImage}
            alt="Voucher Bancario"
            style={{ maxWidth: '92vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '12px', border: '3px solid #38bdf8', boxShadow: '0 20px 50px rgba(0,0,0,0.9)' }}
          />
        </div>
      )}

      {/* MODAL: Avisar a Vendedora para llenar en Planilla Diaria */}
      {notifyModalItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.78)',
          backdropFilter: 'blur(4px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            border: '2px solid #eab308',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            padding: '1.4rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.4rem' }}>📌</span>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#fef08a' }}>
                  Avisar a Vendedora para llenar en Planilla Diaria
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setNotifyModalItem(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.2rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Ficha Resumen del Movimiento de Banco */}
            <div style={{
              backgroundColor: '#0f172a',
              borderRadius: '10px',
              border: '1.5px solid #334155',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  padding: '0.15rem 0.5rem',
                  borderRadius: '4px',
                  fontWeight: '900',
                  fontSize: '0.72rem',
                  backgroundColor: notifyModalItem.transaction_type === 'INGRESO' ? '#10b981' : '#ef4444',
                  color: '#ffffff'
                }}>
                  {notifyModalItem.transaction_type === 'INGRESO' ? '💵 INGRESO BANCARIO' : '💸 EGRESO BANCARIO'}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: '800' }}>
                  📅 {formatDateDisplay(notifyModalItem.date)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '0.9rem', color: '#f8fafc', fontWeight: '800' }}>
                  {notifyModalItem.bank_name || 'TRANSFERENCIA'} {notifyModalItem.reference_code ? `(Ref: ${notifyModalItem.reference_code})` : ''}
                </span>
                <span style={{ fontSize: '1.35rem', fontWeight: '900', color: notifyModalItem.transaction_type === 'INGRESO' ? '#34d399' : '#f87171' }}>
                  {formatSoles(notifyModalItem.amount || 0)}
                </span>
              </div>

              {notifyModalItem.notes && (
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  <strong>Concepto:</strong> {notifyModalItem.notes}
                </div>
              )}
            </div>

            {/* Botones de Plantilla de 1-Clic */}
            <div>
              <label style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: '800', display: 'block', marginBottom: '0.35rem' }}>
                Plantillas rápidas de 1 clic:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    const amtStr = Number(notifyModalItem.amount || 0).toFixed(2);
                    const bName = notifyModalItem.bank_name || 'BANCO';
                    setNotifyNote(`Por favor registrar este ingreso de S/ ${amtStr} [${bName}${notifyModalItem.notes ? ` - ${notifyModalItem.notes}` : ''}] en tu Planilla Diaria de Ingresos.`);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '0.4rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid #16a34a',
                    backgroundColor: 'rgba(22, 163, 74, 0.15)',
                    color: '#86efac',
                    fontSize: '0.76rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  🟢 <strong>Registrar en Ingresos:</strong> "Por favor registrar este ingreso en tu Planilla Diaria de Ingresos."
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const amtStr = Number(notifyModalItem.amount || 0).toFixed(2);
                    const bName = notifyModalItem.bank_name || 'BANCO';
                    setNotifyNote(`Por favor registrar este egreso de S/ ${amtStr} [${bName}${notifyModalItem.notes ? ` - ${notifyModalItem.notes}` : ''}] en tu Planilla Diaria de Egresos.`);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '0.4rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid #dc2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.15)',
                    color: '#fca5a5',
                    fontSize: '0.76rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  🔴 <strong>Registrar en Egresos:</strong> "Por favor registrar este gasto/egreso en tu Planilla Diaria de Egresos."
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const amtStr = Number(notifyModalItem.amount || 0).toFixed(2);
                    const bName = notifyModalItem.bank_name || 'BANCO';
                    setNotifyNote(`Por favor aclarar o justificar a qué cliente o contrato corresponde este monto de S/ ${amtStr} (${bName}).`);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '0.4rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid #d97706',
                    backgroundColor: 'rgba(217, 119, 6, 0.15)',
                    color: '#fde68a',
                    fontSize: '0.76rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  ⚠️ <strong>Aclarar cliente/concepto:</strong> "Por favor aclarar a qué contrato corresponde este monto."
                </button>
              </div>
            </div>

            {/* Mensaje de la Nota */}
            <form onSubmit={handleSendNotifyVendedora} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: '#fef08a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem' }}>
                  <MessageSquare size={13} /> Mensaje para el Stick de Nota (Alarma):
                </label>
                <textarea
                  rows={3}
                  className="form-input"
                  value={notifyNote}
                  onChange={(e) => setNotifyNote(e.target.value)}
                  placeholder="Escribe la indicación para la vendedora..."
                  required
                  style={{ width: '100%', fontSize: '0.84rem', padding: '0.55rem', backgroundColor: '#0f172a', color: '#ffffff' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setNotifyModalItem(null)}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.8rem' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sendingNotify || !notifyNote.trim()}
                  className="btn btn-primary btn-sm"
                  style={{
                    backgroundColor: '#eab308',
                    color: '#000000',
                    fontWeight: '900',
                    border: 'none',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 1rem',
                    cursor: 'pointer'
                  }}
                >
                  {sendingNotify ? 'Enviando Alarma...' : '📌 Enviar Stick de Nota a Vendedora'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

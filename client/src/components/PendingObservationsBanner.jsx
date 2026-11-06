import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { formatSoles } from '../utils/format';
import {
  AlertTriangle,
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  ShieldAlert,
  RefreshCw,
  Pin,
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  PlusCircle,
  RotateCcw,
  Trash2,
  Edit3,
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Calendar,
  ExternalLink,
  DollarSign,
  GripVertical,
  Minimize2,
  List,
  LayoutGrid,
  CheckCheck
} from 'lucide-react';

export default function PendingObservationsBanner({ isAdmin = false, currentUserName = '' }) {
  // Detect if current logged-in user is Administrator (via prop or token payload)
  const isActualAdmin = Boolean(
    isAdmin ||
    (() => {
      try {
        const tok = localStorage.getItem('fincagraf_token');
        if (!tok) return false;
        const payload = JSON.parse(atob(tok.split('.')[1]));
        const r = (payload?.role || '').toLowerCase();
        return r === 'admin' || r === 'administrador';
      } catch (_) {
        return false;
      }
    })()
  );
  const [observations, setObservations] = useState([]);
  const [counts, setCounts] = useState({ total: 0, pending: 0, resolved: 0 });
  const [loading, setLoading] = useState(false);
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'PENDING' | 'RESOLVED'
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('fincagraf_sticks_view_mode') || 'list';
    } catch (_) {
      return 'list';
    }
  });

  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('fincagraf_sticks_view_mode', mode);
    } catch (_) {}
  };

  // Audio mute state
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('fincagraf_sticky_audio_muted') === 'true';
  });

  // Floating widget position and minimization state (starts at bottom: 110px so it NEVER covers cash balance)
  const [widgetPos, setWidgetPos] = useState(() => {
    try {
      const saved = localStorage.getItem('fincagraf_sticky_widget_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.bottom === 'number' && typeof parsed.right === 'number') {
          return parsed;
        }
      }
    } catch (_) {}
    return { bottom: 110, right: 24 };
  });

  const [isMinimized, setIsMinimized] = useState(() => {
    try {
      return localStorage.getItem('fincagraf_sticky_widget_minimized') === 'true';
    } catch (_) {
      return false;
    }
  });

  const [isDraggingWidget, setIsDraggingWidget] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, startBottom: 110, startRight: 24, hasMoved: false });

  const handleWidgetMouseDown = (e) => {
    if (e.button !== 0 || e.target.closest('.no-drag')) return;
    setIsDraggingWidget(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startBottom: widgetPos.bottom !== undefined ? widgetPos.bottom : 110,
      startRight: widgetPos.right !== undefined ? widgetPos.right : 24,
      hasMoved: false
    };
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isDraggingWidget) return;
      const deltaX = dragStartRef.current.startX - e.clientX;
      const deltaY = dragStartRef.current.startY - e.clientY;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        dragStartRef.current.hasMoved = true;
      }
      const newBottom = Math.max(15, Math.min(window.innerHeight - 70, dragStartRef.current.startBottom + deltaY));
      const newRight = Math.max(15, Math.min(window.innerWidth - 160, dragStartRef.current.startRight + deltaX));
      setWidgetPos({ bottom: newBottom, right: newRight });
    };

    const onMouseUp = () => {
      if (isDraggingWidget) {
        setIsDraggingWidget(false);
        try {
          localStorage.setItem('fincagraf_sticky_widget_pos', JSON.stringify(widgetPos));
        } catch (_) {}
      }
    };

    if (isDraggingWidget) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingWidget, widgetPos]);

  const toggleMinimizeWidget = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsMinimized(prev => {
      const next = !prev;
      try {
        localStorage.setItem('fincagraf_sticky_widget_minimized', next ? 'true' : 'false');
      } catch (_) {}
      return next;
    });
  };

  // Vendedora justification form state
  const [justifyingId, setJustifyingId] = useState(null);
  const [justificationText, setJustificationText] = useState('');
  const [sendingJustification, setSendingJustification] = useState(false);

  // Admin edit note form state (reemplaza Re-observar por Editar)
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [sendingEditNote, setSendingEditNote] = useState(false);

  // Admin new sticky note state
  const [showNewNoteForm, setShowNewNoteForm] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [sendingNewNote, setSendingNewNote] = useState(false);

  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const prevPendingCountRef = useRef(0);
  const prevResolvedCountRef = useRef(0);

  // Sound chime synthesizer (Web Audio API - zero dependencies)
  const playSound = (type = 'alarm') => {
    if (isMuted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === 'alarm') {
        // High-low alarm chime: 2 pulses
        const now = ctx.currentTime;
        [0, 0.22].forEach((delay) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, now + delay);
          osc.frequency.exponentialRampToValueAtTime(1320, now + delay + 0.12);
          gain.gain.setValueAtTime(0.25, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.18);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + delay);
          osc.stop(now + delay + 0.2);
        });
      } else if (type === 'success') {
        // Tri-tone cheerful ascending chord
        const now = ctx.currentTime;
        const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const delay = idx * 0.08;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + delay);
          gain.gain.setValueAtTime(0.2, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + delay);
          osc.stop(now + delay + 0.3);
        });
      }
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  };

  const toggleSound = () => {
    const nextVal = !isMuted;
    setIsMuted(nextVal);
    localStorage.setItem('fincagraf_sticky_audio_muted', nextVal ? 'true' : 'false');
    if (!nextVal) {
      playSound('success');
    }
  };

  const formatDatePretty = (dateStr) => {
    if (!dateStr) return 'Sin fecha';
    try {
      const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        const [y, m, d] = clean.split('-');
        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const dayName = dayNames[dateObj.getDay()] || '';
        return `${dayName} ${d}/${m}/${y}`;
      }
      return clean;
    } catch (_) {
      return String(dateStr);
    }
  };

  const handleJumpToItem = (item) => {
    setIsOpenModal(false);
    window.dispatchEvent(
      new CustomEvent('fincagraf_jump_to_item', {
        detail: {
          category: item.category,
          transaction_type: item.transaction_type,
          raw_id: item.raw_id,
          date: item.date,
          amount: item.amount,
          title: item.title,
          code: item.code,
          details: item.details
        }
      })
    );
  };

  const fetchObservations = async (silent = true) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch('/pending-observations');
      if (res.success) {
        const items = res.items || [];
        const pendingCount = res.pendingCount ?? items.filter((it) => it.status === 'PENDIENTE').length;
        const resolvedCount = res.resolvedCount ?? items.filter((it) => it.status === 'ARREGLADO').length;

        setObservations(items);
        setCounts({
          total: items.length,
          pending: pendingCount,
          resolved: resolvedCount
        });

        // Trigger alarm sound on new items or status changes
        if (!isAdmin && pendingCount > prevPendingCountRef.current && pendingCount > 0) {
          playSound('alarm');
        } else if (isAdmin && resolvedCount > prevResolvedCountRef.current && resolvedCount > 0) {
          playSound('success');
        }

        prevPendingCountRef.current = pendingCount;
        prevResolvedCountRef.current = resolvedCount;
      }
    } catch (err) {
      console.error('Error fetching observations:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchObservations(true);
    const interval = setInterval(() => {
      fetchObservations(true);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Vendedora sends justification/solution
  const handleSendJustification = async (item) => {
    if (!justificationText.trim()) {
      return alert('Por favor, escribe un descargo o explica cómo lo corregiste antes de enviar.');
    }
    setSendingJustification(true);
    try {
      const res = await apiFetch('/justify-observation', {
        method: 'POST',
        body: {
          category: item.category,
          raw_id: item.raw_id,
          justification: justificationText.trim()
        }
      });
      if (res.success) {
        setFeedbackMsg(`✅ Descargo enviado con éxito. La nota pasa a Administración para visto bueno.`);
        setJustifyingId(null);
        setJustificationText('');
        playSound('success');
        await fetchObservations(true);
        setTimeout(() => setFeedbackMsg(null), 5000);
      }
    } catch (err) {
      alert('Error al enviar corrección: ' + err.message);
    } finally {
      setSendingJustification(false);
    }
  };

  // Admin approves & clears note
  const handleResolveByAdmin = async (item) => {
    if (!window.confirm(`¿Aprobar y retirar definitivamente la observación de ${item.title}?`)) return;
    try {
      const res = await apiFetch('/resolve-observation', {
        method: 'POST',
        body: {
          category: item.category,
          raw_id: item.raw_id
        }
      });
      if (res.success) {
        setFeedbackMsg(`✅ Observación aprobada y retirada del stick de notas.`);
        playSound('success');
        await fetchObservations(true);
        setTimeout(() => setFeedbackMsg(null), 4000);
      }
    } catch (err) {
      alert('Error al aprobar observación: ' + err.message);
    }
  };

  // Admin approves ALL resolved notes at once
  const handleResolveAllResolved = async () => {
    const resolvedItems = observations.filter(o => o.status === 'ARREGLADO');
    if (resolvedItems.length === 0) return;
    if (!window.confirm(`¿Aprobar y dar Visto Bueno a todas las ${resolvedItems.length} notas corregidas por la vendedora?`)) return;

    setLoading(true);
    let okCount = 0;
    for (const it of resolvedItems) {
      try {
        const res = await apiFetch('/resolve-observation', {
          method: 'POST',
          body: { category: it.category, raw_id: it.raw_id }
        });
        if (res.success) okCount++;
      } catch (_) {}
    }
    setFeedbackMsg(`✅ Se otorgó Visto Bueno a ${okCount} notas resueltas.`);
    playSound('success');
    await fetchObservations(false);
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  // Admin edits note / observation instruction directly
  const handleSaveEditByAdmin = async (item) => {
    if (!editingNoteText.trim()) {
      return alert('Por favor escribe la indicación antes de guardar.');
    }
    setSendingEditNote(true);
    try {
      const res = await apiFetch('/update-observation', {
        method: 'POST',
        body: {
          category: item.category,
          raw_id: item.raw_id,
          new_note: editingNoteText.trim()
        }
      });
      if (res.success) {
        setFeedbackMsg(`✏️ Nota actualizada correctamente.`);
        setEditingNoteId(null);
        setEditingNoteText('');
        await fetchObservations(true);
        setTimeout(() => setFeedbackMsg(null), 4000);
      }
    } catch (err) {
      alert('Error al actualizar nota: ' + err.message);
    } finally {
      setSendingEditNote(false);
    }
  };

  // Admin deletes note / observation permanently
  const handleDeleteByAdmin = async (item) => {
    if (!window.confirm(`¿Estás seguro de ELIMINAR permanentemente esta nota / observación?\n\n• ${item.title}`)) return;
    try {
      const res = await apiFetch('/delete-observation', {
        method: 'POST',
        body: {
          category: item.category,
          raw_id: item.raw_id
        }
      });
      if (res.success) {
        setFeedbackMsg(`🗑️ Stick de nota eliminado permanentemente.`);
        playSound('success');
        await fetchObservations(true);
        setTimeout(() => setFeedbackMsg(null), 4000);
      }
    } catch (err) {
      alert('Error al eliminar observación: ' + err.message);
    }
  };

  // Admin creates direct sticky note
  const handleCreateStickyNote = async (e) => {
    e.preventDefault();
    if (!newNoteContent.trim()) {
      return alert('El contenido de la nota no puede estar vacío.');
    }
    setSendingNewNote(true);
    try {
      const res = await apiFetch('/sticky-notes', {
        method: 'POST',
        body: {
          title: newNoteTitle.trim() || 'Nota de Administración',
          content: newNoteContent.trim()
        }
      });
      if (res.success) {
        setFeedbackMsg(`📌 Stick de Nota enviado a la vendedora con éxito.`);
        setShowNewNoteForm(false);
        setNewNoteTitle('');
        setNewNoteContent('');
        playSound('success');
        await fetchObservations(true);
        setTimeout(() => setFeedbackMsg(null), 5000);
      }
    } catch (err) {
      alert('Error al crear nota: ' + err.message);
    } finally {
      setSendingNewNote(false);
    }
  };

  // Filter items according to active tab
  const filteredItems = observations.filter((item) => {
    if (activeTab === 'PENDING') return item.status === 'PENDIENTE';
    if (activeTab === 'RESOLVED') return item.status === 'ARREGLADO';
    return true;
  });

  const hasPending = counts.pending > 0;
  const hasResolved = counts.resolved > 0;

  return (
    <>
      <style>{`
        @keyframes stickyPulseAlarm {
          0% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 14px rgba(239, 68, 68, 0);
            transform: scale(1.03);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
            transform: scale(1);
          }
        }

        @keyframes stickyBellRing {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(14deg); }
          30% { transform: rotate(-14deg); }
          45% { transform: rotate(10deg); }
          60% { transform: rotate(-10deg); }
          75% { transform: rotate(4deg); }
        }

        @keyframes paperPinWiggle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }

        .sticky-alarm-glow {
          animation: stickyPulseAlarm 2s infinite ease-in-out;
        }

        .sticky-bell-shake {
          display: inline-block;
          animation: stickyBellRing 1.8s infinite ease-in-out;
        }

        .sticky-postit-paper {
          background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%);
          color: #1c1917;
          border-radius: 4px 4px 18px 4px;
          box-shadow: 0 12px 24px -6px rgba(0, 0, 0, 0.45), 0 6px 12px -3px rgba(0,0,0,0.3);
          position: relative;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .sticky-postit-paper:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 28px -6px rgba(0, 0, 0, 0.55), 0 8px 16px -4px rgba(0,0,0,0.35);
        }

        .sticky-tape {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          width: 90px;
          height: 24px;
          background: rgba(254, 240, 138, 0.55);
          backdrop-filter: blur(2px);
          border-left: 2px dashed rgba(202, 138, 4, 0.35);
          border-right: 2px dashed rgba(202, 138, 4, 0.35);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
      `}</style>

      {/* =========================================================================
          1. TOP INLINE DASHBOARD BANNER
          Visible when there are observations OR when admin wants to create a note
      ========================================================================= */}
      {observations.length > 0 ? (
        <div
          style={{
            marginBottom: '1.25rem',
            borderRadius: '12px',
            padding: '0.85rem 1.25rem',
            backgroundColor: hasPending && !isAdmin ? '#380a0a' : '#141e2e',
            border: `2px solid ${hasPending && !isAdmin ? '#ef4444' : hasResolved ? '#10b981' : '#3b82f6'}`,
            boxShadow: hasPending && !isAdmin ? '0 0 20px rgba(239, 68, 68, 0.4)' : '0 4px 14px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: hasPending && !isAdmin ? '#7f1d1d' : '#064e3b',
                  color: '#ffffff'
                }}
                className={hasPending ? 'sticky-alarm-glow' : ''}
              >
                {hasPending ? <BellRing size={20} className="sticky-bell-shake" color="#fca5a5" /> : <Pin size={20} color="#6ee7b7" />}
              </div>

              <div>
                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '900', color: hasPending && !isAdmin ? '#fca5a5' : '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {isAdmin ? (
                    hasResolved ? (
                      <>🔔 {counts.resolved} OBSERVACIÓN{counts.resolved > 1 ? 'ES' : ''} ARREGLADA{counts.resolved > 1 ? 'S' : ''} POR VENDEDORA (LISTA{counts.resolved > 1 ? 'S' : ''} PARA VISTO BUENO)</>
                    ) : (
                      <>📌 TABLERO DE STICKS DE NOTAS ({counts.total} NOTA{counts.total > 1 ? 'S' : ''} EN SEGUIMIENTO)</>
                    )
                  ) : hasPending ? (
                    <>🚨 ¡ALARMA: TIENES {counts.pending} OBSERVACIÓN{counts.pending > 1 ? 'ES' : ''} PENDIENTE{counts.pending > 1 ? 'S' : ''} DE RESOLVER!</>
                  ) : (
                    <>⏳ {counts.resolved} OBSERVACIÓN{counts.resolved > 1 ? 'ES' : ''} EN REVISIÓN POR ADMINISTRACIÓN</>
                  )}
                </h4>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                  {isAdmin
                    ? 'Revisa el descargo o corrección de la vendedora para dar el visto bueno o editar.'
                    : hasPending
                    ? 'Debes atender cada stick de nota y dar clic en "Ya lo arreglé / Enviar a Administración".'
                    : 'Tus respuestas fueron enviadas. Desaparecerán una vez que Administración dé el visto bueno.'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={toggleSound}
                title={isMuted ? 'Activar sonido de alarma' : 'Silenciar sonido de alarma'}
                style={{
                  padding: '0.4rem 0.65rem',
                  borderRadius: '7px',
                  border: '1px solid #475569',
                  backgroundColor: isMuted ? '#1e293b' : '#0f766e',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer'
                }}
              >
                {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                <span>{isMuted ? 'Silenciado' : 'Sonido ON'}</span>
              </button>

              <button
                type="button"
                onClick={() => fetchObservations(false)}
                disabled={loading}
                title="Actualizar notas"
                style={{
                  padding: '0.4rem 0.65rem',
                  borderRadius: '7px',
                  border: '1px solid #475569',
                  backgroundColor: '#1e293b',
                  color: '#cbd5e1',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Actualizar</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowNewNoteForm(true);
                    setIsOpenModal(true);
                  }}
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: '7px',
                    border: 'none',
                    backgroundColor: '#eab308',
                    color: '#000000',
                    fontSize: '0.8rem',
                    fontWeight: '900',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: 'pointer'
                  }}
                >
                  <PlusCircle size={15} />
                  <span>+ Nueva Nota Adhesiva</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsOpenModal(true)}
                style={{
                  padding: '0.42rem 0.95rem',
                  borderRadius: '7px',
                  border: 'none',
                  backgroundColor: hasPending && !isAdmin ? '#ef4444' : '#3b82f6',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: '900',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                }}
              >
                <Pin size={16} />
                <span>Abrir Sticks de Notas ({counts.total})</span>
              </button>
            </div>
          </div>
        </div>
      ) : isAdmin ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.85rem' }}>
          <button
            type="button"
            onClick={() => {
              setShowNewNoteForm(true);
              setIsOpenModal(true);
            }}
            style={{
              padding: '0.38rem 0.85rem',
              borderRadius: '8px',
              border: '1px dashed #eab308',
              backgroundColor: 'rgba(234, 179, 8, 0.1)',
              color: '#facc15',
              fontSize: '0.78rem',
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer'
            }}
          >
            <Pin size={15} />
            <span>+ Dejar Stick de Nota a Vendedora</span>
          </button>
        </div>
      ) : null}

      {/* =========================================================================
          2. FLOATING STICKY NOTE WIDGET BUTTON (DRAGGABLE & POSITIONABLE)
          Always floating above the bottom bar without covering the cash balance
      ========================================================================= */}
      <div
        onMouseDown={handleWidgetMouseDown}
        style={{
          position: 'fixed',
          bottom: `${widgetPos.bottom}px`,
          right: `${widgetPos.right}px`,
          zIndex: 9990,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '6px',
          cursor: isDraggingWidget ? 'grabbing' : 'grab',
          userSelect: 'none'
        }}
      >
        {isMinimized ? (
          // Compact Minimized Circle (Takes zero screen space, completely unobtrusive)
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              className="no-drag"
              onClick={toggleMinimizeWidget}
              title="Expandir Stick de Notas"
              style={{
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.2rem 0.4rem',
                fontSize: '0.68rem',
                fontWeight: '800',
                cursor: 'pointer'
              }}
            >
              +
            </button>
            <button
              type="button"
              onClick={() => {
                if (!dragStartRef.current.hasMoved) setIsOpenModal(true);
              }}
              className={hasPending ? 'sticky-alarm-glow' : ''}
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                backgroundColor: hasPending && !isAdmin ? '#ef4444' : hasResolved && isAdmin ? '#10b981' : '#fef08a',
                color: hasPending && !isAdmin ? '#ffffff' : hasResolved && isAdmin ? '#ffffff' : '#1c1917',
                border: '2.5px solid #d97706',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                position: 'relative',
                cursor: isDraggingWidget ? 'grabbing' : 'grab'
              }}
              title="Abrir Stick de Notas (Arrastra para mover a donde gustes)"
            >
              <span>📌</span>
              {counts.total > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    backgroundColor: '#b91c1c',
                    color: '#ffffff',
                    borderRadius: '9999px',
                    padding: '0.1rem 0.4rem',
                    fontSize: '0.7rem',
                    fontWeight: '900',
                    border: '1.5px solid #ffffff'
                  }}
                >
                  {counts.total}
                </span>
              )}
            </button>
          </div>
        ) : (
          // Full Badge (Positioned at bottom: 110px so it NEVER covers SALDO DISPONIBLE EN CAJA)
          <div
            className={hasPending ? 'sticky-alarm-glow' : ''}
            style={{
              backgroundColor: hasPending && !isAdmin ? '#ef4444' : hasResolved && isAdmin ? '#10b981' : '#fef08a',
              color: hasPending && !isAdmin ? '#ffffff' : hasResolved && isAdmin ? '#ffffff' : '#1c1917',
              border: '2.5px solid #d97706',
              borderRadius: '16px',
              padding: '0.55rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              transform: 'rotate(-1.5deg)',
              transition: isDraggingWidget ? 'none' : 'box-shadow 0.2s ease',
              position: 'relative'
            }}
            title="Stick de Notas (Arrastra para mover a donde gustes)"
          >
            <div
              style={{
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
                opacity: 0.6,
                padding: '0.1rem'
              }}
              title="Arrastra para mover"
            >
              <GripVertical size={16} />
            </div>

            <div
              onClick={() => {
                if (!dragStartRef.current.hasMoved) setIsOpenModal(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
            >
              <span style={{ fontSize: '1.25rem' }}>📌</span>
              <div style={{ textAlign: 'left', lineHeight: 1.15 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Stick de Notas
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: '900' }}>
                  {counts.pending > 0 ? (
                    <span style={{ color: hasPending && !isAdmin ? '#fee2e2' : '#b91c1c' }}>
                      🚨 {counts.pending} pendiente{counts.pending > 1 ? 's' : ''}
                    </span>
                  ) : counts.resolved > 0 ? (
                    <span>✅ {counts.resolved} en revisión</span>
                  ) : (
                    <span style={{ color: '#78350f' }}>0 observaciones</span>
                  )}
                </div>
              </div>

              {counts.total > 0 && (
                <span
                  style={{
                    backgroundColor: '#b91c1c',
                    color: '#ffffff',
                    borderRadius: '9999px',
                    padding: '0.12rem 0.45rem',
                    fontSize: '0.72rem',
                    fontWeight: '900'
                  }}
                >
                  {counts.total}
                </span>
              )}
            </div>

            <button
              type="button"
              className="no-drag"
              onClick={toggleMinimizeWidget}
              title="Minimizar Stick de Notas a botón redondo"
              style={{
                marginLeft: '0.2rem',
                background: 'rgba(0,0,0,0.15)',
                border: 'none',
                borderRadius: '6px',
                padding: '0.15rem 0.35rem',
                color: hasPending && !isAdmin ? '#ffffff' : '#1c1917',
                cursor: 'pointer',
                fontSize: '0.68rem',
                fontWeight: '900',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Minimize2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          3. FULL STICKY NOTES BOARD MODAL / POPUP
      ========================================================================= */}
      {isOpenModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '2px solid #475569',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '920px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1rem 1.4rem',
                backgroundColor: '#0f172a',
                borderBottom: '1px solid #334155',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{ fontSize: '1.6rem' }}>📌</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Tablero de Sticks de Notas
                    {counts.pending > 0 && (
                      <span
                        style={{
                          backgroundColor: '#ef4444',
                          color: '#ffffff',
                          fontSize: '0.72rem',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '9999px',
                          fontWeight: '900'
                        }}
                      >
                        {counts.pending} PENDIENTE{counts.pending > 1 ? 'S' : ''}
                      </span>
                    )}
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                    {isAdmin
                      ? 'Revisa justificaciones de la vendedora, aprueba notas o deja nuevas observaciones.'
                      : 'Resuelve las observaciones enviadas por Administración para retirar la alarma.'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={toggleSound}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    backgroundColor: '#1e293b',
                    color: '#e2e8f0',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  <span>{isMuted ? 'Mudo' : 'Alarma ON'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => fetchObservations(false)}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    backgroundColor: '#1e293b',
                    color: '#e2e8f0',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  <span>Actualizar</span>
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowNewNoteForm(!showNewNoteForm)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#eab308',
                      color: '#000000',
                      fontSize: '0.75rem',
                      fontWeight: '900',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <PlusCircle size={14} />
                    <span>{showNewNoteForm ? 'Ocultar Formulario' : '+ Nueva Nota'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsOpenModal(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '0.35rem',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Cerrar ventana"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Sub-Header Tabs, Bulk Actions & View Mode Selector */}
            <div
              style={{
                padding: '0.6rem 1.4rem',
                backgroundColor: '#1e293b',
                borderBottom: '1px solid #334155',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap'
              }}
            >
              {/* Left: Filter Tabs */}
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('ALL')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: activeTab === 'ALL' ? '900' : '600',
                    backgroundColor: activeTab === 'ALL' ? '#3b82f6' : '#334155',
                    color: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  Todas ({counts.total})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('PENDING')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: activeTab === 'PENDING' ? '900' : '600',
                    backgroundColor: activeTab === 'PENDING' ? '#ef4444' : '#334155',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <span>🚨 Pendientes de Corrección</span>
                  <span style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                    {counts.pending}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('RESOLVED')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: activeTab === 'RESOLVED' ? '900' : '600',
                    backgroundColor: activeTab === 'RESOLVED' ? '#10b981' : '#334155',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <span>✅ Arregladas / En Espera de Visto Bueno</span>
                  <span style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                    {counts.resolved}
                  </span>
                </button>
              </div>

              {/* Right: View Mode Toggle & Bulk Approval Button */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {isActualAdmin && counts.resolved > 0 && (
                  <button
                    type="button"
                    onClick={handleResolveAllResolved}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#16a34a',
                      color: '#ffffff',
                      fontSize: '0.76rem',
                      fontWeight: '900',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      boxShadow: '0 2px 6px rgba(22, 163, 74, 0.4)'
                    }}
                    title="Aprobar en lote todas las notas corregidas"
                  >
                    <CheckCheck size={14} />
                    <span>Visto Bueno a Todas ({counts.resolved})</span>
                  </button>
                )}

                {/* View Mode Toggle: Lista Fichas vs Cuadrícula */}
                <div style={{ display: 'flex', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #334155', padding: '0.15rem' }}>
                  <button
                    type="button"
                    onClick={() => handleSetViewMode('list')}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: '4px',
                      border: 'none',
                      fontSize: '0.75rem',
                      fontWeight: viewMode === 'list' ? '900' : '600',
                      backgroundColor: viewMode === 'list' ? '#0284c7' : 'transparent',
                      color: viewMode === 'list' ? '#ffffff' : '#94a3b8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                    title="Ver notas en formato de lista amplia ejecutiva (Recomendado: botones siempre visibles)"
                  >
                    <List size={14} />
                    <span>Fichas / Lista</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetViewMode('grid')}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: '4px',
                      border: 'none',
                      fontSize: '0.75rem',
                      fontWeight: viewMode === 'grid' ? '900' : '600',
                      backgroundColor: viewMode === 'grid' ? '#0284c7' : 'transparent',
                      color: viewMode === 'grid' ? '#ffffff' : '#94a3b8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                    title="Ver notas en formato de tarjetas / post-its"
                  >
                    <LayoutGrid size={14} />
                    <span>Cuadrícula</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Notification Alert Box */}
            {feedbackMsg && (
              <div
                style={{
                  margin: '0.75rem 1.4rem 0 1.4rem',
                  padding: '0.65rem 1rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  border: '1.5px solid #10b981',
                  borderRadius: '8px',
                  color: '#34d399',
                  fontSize: '0.85rem',
                  fontWeight: '800'
                }}
              >
                {feedbackMsg}
              </div>
            )}

            {/* Admin: Create New Sticky Note Section */}
            {isAdmin && showNewNoteForm && (
              <form
                onSubmit={handleCreateStickyNote}
                style={{
                  margin: '0.85rem 1.4rem 0 1.4rem',
                  padding: '1rem',
                  backgroundColor: '#0f172a',
                  border: '2px dashed #eab308',
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#facc15', fontWeight: '900', fontSize: '0.9rem' }}>
                  <Pin size={16} /> Redactar nuevo Stick de Nota para la Vendedora:
                </div>
                <input
                  type="text"
                  placeholder="Título o Motivo (Ej: Falta comprobante de depósito, Revisar medidas...)"
                  className="form-input"
                  style={{ fontSize: '0.85rem', padding: '0.5rem' }}
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                />
                <textarea
                  rows={2}
                  placeholder="Escribe el mensaje o indicación detallada que debe resolver la vendedora..."
                  className="form-input"
                  style={{ fontSize: '0.85rem', padding: '0.5rem' }}
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  required
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowNewNoteForm(false)}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.78rem' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={sendingNewNote || !newNoteContent.trim()}
                    className="btn btn-primary btn-sm"
                    style={{
                      backgroundColor: '#eab308',
                      color: '#000000',
                      fontWeight: '900',
                      border: 'none',
                      fontSize: '0.78rem'
                    }}
                  >
                    {sendingNewNote ? 'Enviando Nota...' : '📌 Pegar Stick de Nota'}
                  </button>
                </div>
              </form>
            )}

            {/* Corkboard / Post-it Body: Modo Lista Fichas o Modo Cuadrícula */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: viewMode === 'list' ? '1.25rem 1.4rem 3rem 1.4rem' : '1.5rem 1.4rem 3rem 1.4rem',
                backgroundColor: '#0b1120',
                display: viewMode === 'list' ? 'flex' : 'grid',
                flexDirection: viewMode === 'list' ? 'column' : undefined,
                gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(320px, 1fr))' : undefined,
                gap: viewMode === 'list' ? '1rem' : '1.5rem',
                alignItems: viewMode === 'grid' ? 'stretch' : undefined
              }}
            >
              {filteredItems.length === 0 ? (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    padding: '3rem 1rem',
                    color: '#94a3b8'
                  }}
                >
                  <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✨</div>
                  <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem', fontWeight: '800' }}>
                    ¡No hay notas u observaciones en este filtro!
                  </h4>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem' }}>
                    {activeTab === 'PENDING'
                      ? 'Excelente, todo está al día y no hay observaciones pendientes por corregir.'
                      : 'El tablero se encuentra completamente limpio.'}
                  </p>
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const isPending = item.status === 'PENDIENTE';
                  const isResolved = item.status === 'ARREGLADO';
                  const isJustifying = justifyingId === item.id;
                  const isEditingNote = editingNoteId === item.id;

                  // Category badge colors
                  let catColor = '#b45309';
                  let catBg = '#fef3c7';
                  if (item.category === 'CONTRATO') {
                    catColor = '#0369a1';
                    catBg = '#e0f2fe';
                  } else if (item.category === 'INGRESO') {
                    catColor = '#047857';
                    catBg = '#d1fae5';
                  } else if (item.category === 'EGRESO') {
                    catColor = '#b45309';
                    catBg = '#fef3c7';
                  } else if (item.category === 'BANCO') {
                    catColor = '#6d28d9';
                    catBg = '#ede9fe';
                  } else if (item.category === 'NOTA_RAPIDA') {
                    catColor = '#be123c';
                    catBg = '#ffe4e6';
                  }

                  // -------------------------------------------------------------
                  // VISTA 1: MODO FICHAS / LISTA EJECUTIVA (BOTONES SIEMPRE VISIBLES)
                  // -------------------------------------------------------------
                  if (viewMode === 'list') {
                    return (
                      <div
                        key={item.id}
                        style={{
                          backgroundColor: '#1e293b',
                          borderRadius: '12px',
                          border: `1.5px solid ${isPending ? '#ef4444' : '#334155'}`,
                          borderLeft: `6px solid ${isPending ? '#ef4444' : '#10b981'}`,
                          padding: '1.1rem 1.25rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
                          position: 'relative'
                        }}
                      >
                        {/* Cabecera de la Ficha: Info a la izquierda y Botones de Acción a la derecha */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                            borderBottom: '1px solid #334155',
                            paddingBottom: '0.65rem'
                          }}
                        >
                          {/* Izquierda: Badges, Título, Fecha y Monto */}
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.55rem' }}>
                            <span
                              style={{
                                backgroundColor: catBg,
                                color: catColor,
                                fontSize: '0.72rem',
                                fontWeight: '900',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '4px',
                                letterSpacing: '0.5px'
                              }}
                            >
                              {item.category}
                            </span>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: '900',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '4px',
                                backgroundColor: isPending ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                color: isPending ? '#f87171' : '#34d399',
                                border: `1px solid ${isPending ? '#ef4444' : '#10b981'}`
                              }}
                            >
                              {isPending ? '🚨 PENDIENTE' : '✅ ARREGLADO'}
                            </span>
                            <span style={{ fontWeight: '900', fontSize: '1.02rem', color: '#f8fafc' }}>
                              {item.title}
                            </span>
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                backgroundColor: '#0f172a',
                                padding: '0.22rem 0.6rem',
                                borderRadius: '6px',
                                border: '1px solid #334155',
                                color: '#94a3b8',
                                fontSize: '0.78rem'
                              }}
                            >
                              <Calendar size={13} color="#38bdf8" />
                              <span style={{ color: '#f8fafc', fontWeight: '800' }}>{formatDatePretty(item.date)}</span>
                            </div>
                            {item.amount != null && (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  backgroundColor: '#0f172a',
                                  padding: '0.22rem 0.65rem',
                                  borderRadius: '6px',
                                  border: '1px solid #d97706'
                                }}
                              >
                                <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: '800' }}>MONTO:</span>
                                <span style={{ fontWeight: '900', color: '#fbbf24', fontSize: '0.98rem' }}>
                                  {formatSoles(item.amount)}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Derecha: BARRA DE BOTONES DE ACCIÓN (VISTO BUENO, EDITAR, ELIMINAR, IR A PLANILLA) */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            {item.category !== 'NOTA_RAPIDA' && (
                              <button
                                type="button"
                                onClick={() => handleJumpToItem(item)}
                                style={{
                                  padding: '0.42rem 0.75rem',
                                  backgroundColor: '#0f172a',
                                  border: '1px solid #0284c7',
                                  color: '#38bdf8',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  fontWeight: '800',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem'
                                }}
                                title="Ir al lugar de este monto en la Planilla"
                              >
                                <ExternalLink size={13} />
                                <span>Ir a Planilla</span>
                              </button>
                            )}

                            {/* ADMINISTRADOR ACTIONS */}
                            {isActualAdmin && !isEditingNote && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleResolveByAdmin(item)}
                                  style={{
                                    padding: '0.45rem 0.85rem',
                                    backgroundColor: '#16a34a',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.76rem',
                                    fontWeight: '900',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.4)'
                                  }}
                                  title="Aprobar y dar Visto Bueno para retirar la nota definitivamente"
                                >
                                  <CheckCircle2 size={15} />
                                  <span>Visto Bueno</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingNoteId(item.id);
                                    setEditingNoteText(item.note || '');
                                  }}
                                  style={{
                                    padding: '0.45rem 0.75rem',
                                    backgroundColor: '#0284c7',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.76rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem'
                                  }}
                                  title="Editar indicación u observación de esta nota"
                                >
                                  <Edit3 size={14} />
                                  <span>Editar</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteByAdmin(item)}
                                  style={{
                                    padding: '0.45rem 0.75rem',
                                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                    color: '#f87171',
                                    border: '1.5px solid #ef4444',
                                    borderRadius: '6px',
                                    fontSize: '0.76rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem'
                                  }}
                                  title="Eliminar esta nota permanentemente"
                                >
                                  <Trash2 size={14} />
                                  <span>Eliminar</span>
                                </button>
                              </>
                            )}

                            {/* VENDEDORA ACTIONS */}
                            {!isActualAdmin && isPending && !isJustifying && (
                              <button
                                type="button"
                                onClick={() => {
                                  setJustifyingId(item.id);
                                  setJustificationText('');
                                }}
                                style={{
                                  padding: '0.45rem 0.85rem',
                                  backgroundColor: '#dc2626',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: '900',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem'
                                }}
                              >
                                <Send size={13} />
                                <span>✍️ Ya lo arreglé / Responder</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Fila de Detalles: Personal, Cliente, Detalle */}
                        {(item.vendedor || item.client || item.details) && (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '1.25rem',
                              fontSize: '0.8rem',
                              color: '#cbd5e1',
                              backgroundColor: '#0f172a',
                              padding: '0.45rem 0.85rem',
                              borderRadius: '6px',
                              border: '1px solid #1e293b'
                            }}
                          >
                            {item.vendedor && item.vendedor !== 'Vendedora' && (
                              <div>👤 <strong>Personal/Vendedora:</strong> <span style={{ color: '#38bdf8' }}>{item.vendedor}</span></div>
                            )}
                            {item.client && item.client !== '-' && (
                              <div>👥 <strong>Cliente:</strong> <span style={{ color: '#f8fafc' }}>{item.client}</span></div>
                            )}
                            {item.details && (
                              <div>📋 <strong>Detalle:</strong> <span style={{ color: '#94a3b8' }}>{item.details}</span></div>
                            )}
                          </div>
                        )}

                        {/* Cajas de Indicación de Administración y Respuesta de Vendedora */}
                        <div style={{ display: 'grid', gridTemplateColumns: item.response ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr', gap: '0.75rem' }}>
                          {/* Indicación de Administración */}
                          <div
                            style={{
                              backgroundColor: 'rgba(245, 158, 11, 0.08)',
                              border: '1.5px solid rgba(245, 158, 11, 0.35)',
                              borderLeft: '4px solid #f59e0b',
                              padding: '0.7rem 0.9rem',
                              borderRadius: '6px',
                              fontSize: '0.84rem',
                              color: '#fef3c7'
                            }}
                          >
                            <div style={{ fontWeight: '900', fontSize: '0.74rem', color: '#fbbf24', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <MessageSquare size={13} /> INDICACIÓN / OBSERVACIÓN (ADMINISTRACIÓN):
                            </div>
                            <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.35' }}>
                              "{item.note || 'Sin nota explicativa'}"
                            </div>
                          </div>

                          {/* Respuesta de Vendedora (si ya respondió) */}
                          {item.response && (
                            <div
                              style={{
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                border: '1.5px solid rgba(16, 185, 129, 0.35)',
                                borderLeft: '4px solid #10b981',
                                padding: '0.7rem 0.9rem',
                                borderRadius: '6px',
                                fontSize: '0.84rem',
                                color: '#dcfce7'
                              }}
                            >
                              <div style={{ fontWeight: '900', fontSize: '0.74rem', color: '#34d399', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <CheckCircle2 size={13} /> RESPUESTA / SOLUCIÓN DE VENDEDORA:
                              </div>
                              <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.35', fontWeight: '700' }}>
                                "{item.response}"
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Formulario de Justificación para Vendedora */}
                        {!isActualAdmin && isPending && isJustifying && (
                          <div style={{ backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid #16a34a', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            <label style={{ fontSize: '0.76rem', fontWeight: '800', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <Send size={13} /> Explica qué corregiste o tu descargo para Administración:
                            </label>
                            <textarea
                              rows={2}
                              placeholder="Explica qué corregiste o tu descargo..."
                              style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.82rem', padding: '0.5rem', backgroundColor: '#1e293b', color: '#f8fafc', borderRadius: '6px', border: '1px solid #334155', resize: 'vertical', fontFamily: 'inherit' }}
                              value={justificationText}
                              onChange={(e) => setJustificationText(e.target.value)}
                              autoFocus
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                              <button type="button" onClick={() => setJustifyingId(null)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
                                Cancelar
                              </button>
                              <button type="button" onClick={() => handleSendJustification(item)} disabled={sendingJustification || !justificationText.trim()} className="btn btn-success btn-sm" style={{ fontWeight: '900', fontSize: '0.75rem' }}>
                                {sendingJustification ? 'Enviando...' : '✅ Enviar a Administración'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Formulario de Edición para Administrador */}
                        {isActualAdmin && isEditingNote && (
                          <div style={{ backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid #0284c7', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            <label style={{ fontSize: '0.76rem', fontWeight: '800', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <Edit3 size={13} /> Editar indicación u observación para la vendedora:
                            </label>
                            <textarea
                              rows={3}
                              placeholder="Escribe la indicación..."
                              style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.82rem', padding: '0.5rem', backgroundColor: '#1e293b', color: '#f8fafc', borderRadius: '6px', border: '1px solid #334155', resize: 'vertical', fontFamily: 'inherit' }}
                              value={editingNoteText}
                              onChange={(e) => setEditingNoteText(e.target.value)}
                              autoFocus
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                              <button type="button" onClick={() => setEditingNoteId(null)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
                                Cancelar
                              </button>
                              <button type="button" onClick={() => handleSaveEditByAdmin(item)} disabled={sendingEditNote || !editingNoteText.trim()} className="btn btn-primary btn-sm" style={{ fontWeight: '900', fontSize: '0.75rem', backgroundColor: '#0284c7' }}>
                                {sendingEditNote ? 'Guardando...' : '💾 Guardar Cambios'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // -------------------------------------------------------------
                  // VISTA 2: MODO CUADRÍCULA / POST-IT (CON BOTONES SUPERIORES PARA NUNCA OCULTARSE)
                  // -------------------------------------------------------------
                  return (
                    <div
                      key={item.id}
                      className="sticky-postit-paper"
                      style={{
                        padding: '1.25rem 1.15rem 1.1rem 1.15rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        height: '100%',
                        boxSizing: 'border-box',
                        position: 'relative',
                        zIndex: isEditingNote || isJustifying ? 20 : 1,
                        boxShadow: isEditingNote
                          ? '0 20px 40px -5px rgba(0, 0, 0, 0.7), 0 0 0 3px #0284c7'
                          : undefined
                      }}
                    >
                      {/* Pushpin at top center */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '-14px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          fontSize: '1.5rem',
                          filter: 'drop-shadow(0 3px 2px rgba(0,0,0,0.3))',
                          zIndex: 2,
                          userSelect: 'none'
                        }}
                      >
                        📌
                      </div>

                      {/* Header inside Sticky Note */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                          <span
                            style={{
                              backgroundColor: catBg,
                              color: catColor,
                              fontSize: '0.68rem',
                              fontWeight: '900',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '4px',
                              letterSpacing: '0.5px'
                            }}
                          >
                            {item.category}
                          </span>

                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: '800',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              backgroundColor: isPending ? '#fee2e2' : '#dcfce7',
                              color: isPending ? '#b91c1c' : '#15803d',
                              border: `1px solid ${isPending ? '#f87171' : '#86efac'}`
                            }}
                          >
                            {isPending ? '🚨 PENDIENTE' : '✅ ARREGLADO'}
                          </span>
                        </div>

                        {/* Title */}
                        <div style={{ fontWeight: '900', fontSize: '0.94rem', color: '#0f172a', lineHeight: 1.25, marginBottom: '0.35rem' }}>
                          {item.title}
                        </div>

                        {/* FECHA Y MONTO EN CAJA DESTACADA */}
                        <div
                          style={{
                            backgroundColor: '#ffffff',
                            border: '1.5px solid #d97706',
                            borderRadius: '8px',
                            padding: '0.45rem 0.65rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            marginBottom: '0.55rem',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.06)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#78350f', fontWeight: '800', fontSize: '0.8rem' }}>
                            <Calendar size={14} color="#d97706" />
                            <span>{formatDatePretty(item.date)}</span>
                          </div>

                          {item.amount != null ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span style={{ fontSize: '0.7rem', color: '#92400e', fontWeight: '800' }}>MONTO:</span>
                              <span style={{ fontWeight: '900', fontSize: '1.05rem', color: '#b45309' }}>
                                {formatSoles(item.amount)}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>-</span>
                          )}
                        </div>

                        {/* BOTONES DE ACCIÓN PRINCIPALES EN LA PARTE SUPERIOR (SIEMPRE VISIBLES) */}
                        {isActualAdmin && !isEditingNote && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1.2fr 1fr 1fr',
                              gap: '0.35rem',
                              alignItems: 'center',
                              marginBottom: '0.65rem'
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleResolveByAdmin(item)}
                              style={{
                                padding: '0.45rem 0.35rem',
                                backgroundColor: '#16a34a',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '0.74rem',
                                fontWeight: '900',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.25rem',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                                whiteSpace: 'nowrap'
                              }}
                              title="Aprobar y retirar definitivamente esta nota"
                            >
                              <CheckCircle2 size={13} />
                              <span>Visto Bueno</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(item.id);
                                setEditingNoteText(item.note || '');
                              }}
                              style={{
                                padding: '0.45rem 0.5rem',
                                backgroundColor: '#0284c7',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '0.74rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.25rem',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                                whiteSpace: 'nowrap'
                              }}
                              title="Editar indicación u observación de esta nota"
                            >
                              <Edit3 size={13} />
                              <span>Editar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteByAdmin(item)}
                              style={{
                                padding: '0.45rem 0.5rem',
                                backgroundColor: '#dc2626',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '0.74rem',
                                fontWeight: '900',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.25rem',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                                whiteSpace: 'nowrap'
                              }}
                              title="Eliminar permanentemente este stick de nota"
                            >
                              <Trash2 size={13} />
                              <span>Eliminar</span>
                            </button>
                          </div>
                        )}

                        {/* Detalles descriptivos */}
                        <div style={{ fontSize: '0.76rem', color: '#334155', marginBottom: '0.55rem', fontWeight: '600', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          {item.vendedor && item.vendedor !== 'Vendedora' && (
                            <div>👤 <strong>Personal/Vendedora:</strong> {item.vendedor}</div>
                          )}
                          {item.client && item.client !== '-' && (
                            <div>👥 <strong>Cliente:</strong> {item.client}</div>
                          )}
                          {item.details && (
                            <div>📋 <strong>Detalle:</strong> {item.details}</div>
                          )}
                        </div>

                        {/* Botón: Ir directo al lugar de este monto en el sistema */}
                        {item.category !== 'NOTA_RAPIDA' && (
                          <button
                            type="button"
                            onClick={() => handleJumpToItem(item)}
                            style={{
                              width: '100%',
                              padding: '0.42rem 0.65rem',
                              marginBottom: '0.65rem',
                              backgroundColor: item.category === 'BANCO' && item.transaction_type === 'INGRESO' ? '#16a34a' : '#0284c7',
                              color: '#ffffff',
                              borderRadius: '7px',
                              border: 'none',
                              fontSize: '0.76rem',
                              fontWeight: '900',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.4rem',
                              cursor: 'pointer',
                              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
                              transition: 'all 0.15s ease'
                            }}
                            title="Ir directamente al registro y fecha de este monto en el sistema"
                          >
                            <ExternalLink size={14} />
                            <span>
                              {item.category === 'BANCO' && item.transaction_type === 'INGRESO'
                                ? '📍 Ir a registrar este INGRESO en Planilla Diaria ➔'
                                : item.category === 'BANCO' && item.transaction_type === 'EGRESO'
                                ? '📍 Ir a registrar este EGRESO en Planilla Diaria ➔'
                                : '📍 Ir al lugar de este monto en el sistema ➔'}
                            </span>
                          </button>
                        )}

                        {/* Observation Message Box */}
                        <div
                          style={{
                            backgroundColor: '#fffbeb',
                            borderLeft: '3.5px solid #d97706',
                            padding: '0.55rem 0.7rem',
                            borderRadius: '0 6px 6px 0',
                            fontSize: '0.82rem',
                            color: '#78350f',
                            lineHeight: 1.35,
                            whiteSpace: 'pre-wrap',
                            marginBottom: '0.65rem'
                          }}
                        >
                          <div style={{ fontWeight: '900', fontSize: '0.7rem', color: '#b45309', marginBottom: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <MessageSquare size={12} /> INDICACIÓN / OBSERVACIÓN:
                          </div>
                          "{item.note || 'Sin nota explicativa'}"
                        </div>

                        {/* If already responded / resolved by vendedora */}
                        {item.response && (
                          <div
                            style={{
                              backgroundColor: '#f0fdf4',
                              borderLeft: '3.5px solid #16a34a',
                              padding: '0.55rem 0.7rem',
                              borderRadius: '0 6px 6px 0',
                              fontSize: '0.82rem',
                              color: '#14532d',
                              lineHeight: 1.35,
                              whiteSpace: 'pre-wrap',
                              marginBottom: '0.65rem'
                            }}
                          >
                            <div style={{ fontWeight: '900', fontSize: '0.7rem', color: '#15803d', marginBottom: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <CheckCircle2 size={12} /> RESPUESTA / SOLUCIÓN DE VENDEDORA:
                            </div>
                            "{item.response}"
                          </div>
                        )}
                      </div>

                      {/* Bottom Actions Area (para Vendedora o si Admin está editando) */}
                      <div
                        style={{
                          borderTop: '1.5px dashed rgba(180, 83, 9, 0.45)',
                          paddingTop: '0.65rem',
                          marginTop: 'auto',
                          flexShrink: 0
                        }}
                      >
                        {/* VENDEDORA VIEW */}
                        {!isActualAdmin && (
                          <div>
                            {isPending && !isJustifying && (
                              <button
                                type="button"
                                onClick={() => {
                                  setJustifyingId(item.id);
                                  setJustificationText('');
                                }}
                                style={{
                                  width: '100%',
                                  padding: '0.45rem',
                                  backgroundColor: '#dc2626',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '0.8rem',
                                  fontWeight: '900',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.4rem'
                                }}
                              >
                                <Send size={13} />
                                <span>✍️ Ya lo arreglé / Responder</span>
                              </button>
                            )}

                            {isPending && isJustifying && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.2rem' }}>
                                <label style={{ fontSize: '0.74rem', fontWeight: '800', color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  <Send size={12} /> Explica qué corregiste o tu descargo:
                                </label>
                                <textarea
                                  rows={2}
                                  placeholder="Explica qué corregiste o tu descargo..."
                                  style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    fontSize: '0.8rem',
                                    padding: '0.45rem',
                                    backgroundColor: '#ffffff',
                                    color: '#0f172a',
                                    borderRadius: '6px',
                                    border: '1.5px solid #16a34a',
                                    resize: 'vertical',
                                    minHeight: '55px',
                                    fontFamily: 'inherit',
                                    lineHeight: 1.35
                                  }}
                                  value={justificationText}
                                  onChange={(e) => setJustificationText(e.target.value)}
                                  autoFocus
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => setJustifyingId(null)}
                                    style={{
                                      padding: '0.25rem 0.55rem',
                                      fontSize: '0.74rem',
                                      borderRadius: '4px',
                                      border: '1px solid #94a3b8',
                                      backgroundColor: '#ffffff',
                                      color: '#475569',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSendJustification(item)}
                                    disabled={sendingJustification || !justificationText.trim()}
                                    style={{
                                      padding: '0.25rem 0.75rem',
                                      fontSize: '0.74rem',
                                      fontWeight: '900',
                                      borderRadius: '4px',
                                      border: 'none',
                                      backgroundColor: '#16a34a',
                                      color: '#ffffff',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {sendingJustification ? 'Enviando...' : '✅ Enviar a Administración'}
                                  </button>
                                </div>
                              </div>
                            )}

                            {isResolved && (
                              <div
                                style={{
                                  textAlign: 'center',
                                  fontSize: '0.75rem',
                                  fontWeight: '800',
                                  color: '#15803d',
                                  padding: '0.35rem',
                                  backgroundColor: 'rgba(22, 163, 74, 0.15)',
                                  borderRadius: '6px'
                                }}
                              >
                                ⏳ Esperando visto bueno de Administración...
                              </div>
                            )}
                          </div>
                        )}

                        {/* ADMIN EDITING FORM */}
                        {isActualAdmin && isEditingNote && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.2rem' }}>
                            <label style={{ fontSize: '0.74rem', fontWeight: '800', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Edit3 size={13} /> Editar indicación u observación:
                            </label>
                            <textarea
                              rows={3}
                              placeholder="Escribe la indicación..."
                              style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                fontSize: '0.8rem',
                                padding: '0.45rem',
                                backgroundColor: '#ffffff',
                                color: '#0f172a',
                                borderRadius: '6px',
                                border: '1.5px solid #0284c7',
                                resize: 'vertical',
                                minHeight: '65px',
                                fontFamily: 'inherit',
                                lineHeight: 1.35
                              }}
                              value={editingNoteText}
                              onChange={(e) => setEditingNoteText(e.target.value)}
                              autoFocus
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '0.15rem' }}>
                              <button
                                type="button"
                                onClick={() => setEditingNoteId(null)}
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.74rem',
                                  borderRadius: '4px',
                                  border: '1px solid #94a3b8',
                                  backgroundColor: '#ffffff',
                                  color: '#475569',
                                  cursor: 'pointer',
                                  fontWeight: '700'
                                }}
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditByAdmin(item)}
                                disabled={sendingEditNote || !editingNoteText.trim()}
                                style={{
                                  padding: '0.35rem 0.85rem',
                                  fontSize: '0.74rem',
                                  fontWeight: '900',
                                  borderRadius: '4px',
                                  border: 'none',
                                  backgroundColor: sendingEditNote ? '#94a3b8' : '#0284c7',
                                  color: '#ffffff',
                                  cursor: sendingEditNote ? 'not-allowed' : 'pointer',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                                }}
                              >
                                {sendingEditNote ? 'Guardando...' : '💾 Guardar Cambios'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer info */}
            <div
              style={{
                padding: '0.75rem 1.4rem',
                backgroundColor: '#0f172a',
                borderTop: '1px solid #334155',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                fontSize: '0.78rem',
                color: '#94a3b8'
              }}
            >
              <span>
                💡 Las notas persisten hasta que Administración otorgue el <strong>Visto Bueno</strong>.
              </span>
              <button
                type="button"
                onClick={() => setIsOpenModal(false)}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.76rem', padding: '0.3rem 0.85rem' }}
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

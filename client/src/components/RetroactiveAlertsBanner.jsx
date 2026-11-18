import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { formatSoles } from '../utils/format';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  X,
  Clock,
  User,
  Calendar,
  Layers,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  ExternalLink
} from 'lucide-react';

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

export const formatDateTimeDisplay = (timestamp) => {
  if (!timestamp) return '—';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return String(timestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
  } catch (_) {
    return String(timestamp);
  }
};

export default function RetroactiveAlertsBanner({ storeId = null }) {
  const [alerts, setAlerts] = useState([]);
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [activeTab, setActiveTab] = useState('UNREAD'); // 'UNREAD' | 'ALL'
  const [resolvingId, setResolvingId] = useState(null);
  const [resolvingAll, setResolvingAll] = useState(false);

  const fetchAlerts = async () => {
    try {
      const q = storeId ? `?store_id=${storeId}&include_resolved=true` : '?include_resolved=true';
      const res = await apiFetch(`/daily-sheet/retroactive-alerts${q}`);
      if (res && res.success) {
        setAlerts(res.alerts || []);
      }
    } catch (err) {
      // Background quiet polling
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 25000);
    return () => clearInterval(interval);
  }, [storeId]);

  const handleResolveAlert = async (id) => {
    setResolvingId(id);
    try {
      const res = await apiFetch(`/daily-sheet/retroactive-alerts/${id}/resolve`, {
        method: 'PUT'
      });
      if (res && res.success) {
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_resolved: 1 } : a));
      }
    } catch (err) {
      alert('Error al marcar alerta como revisada: ' + err.message);
    } finally {
      setResolvingId(null);
    }
  };

  const handleResolveAll = async () => {
    if (!window.confirm('¿Marcar todas las alertas de semanas pasadas como revisadas?')) return;
    setResolvingAll(true);
    try {
      const res = await apiFetch(`/daily-sheet/retroactive-alerts/resolve-all`, {
        method: 'PUT',
        body: { store_id: storeId }
      });
      if (res && res.success) {
        setAlerts(prev => prev.map(a => ({ ...a, is_resolved: 1 })));
      }
    } catch (err) {
      alert('Error al marcar todas como revisadas: ' + err.message);
    } finally {
      setResolvingAll(false);
    }
  };

  const unreadAlerts = alerts.filter(a => !a.is_resolved && !a.is_read);
  const unreadCount = unreadAlerts.length;
  const displayedAlerts = activeTab === 'UNREAD' ? unreadAlerts : alerts;

  return (
    <>
      {/* BANNER SUPERIOR DE ALERTA PRIORITARIA EN ADMIN DASHBOARD */}
      {unreadCount > 0 && (
        <div style={{
          backgroundColor: '#451a03',
          background: 'linear-gradient(90deg, #7c2d12 0%, #9a3412 50%, #7c2d12 100%)',
          border: '2px solid #ea580c',
          borderRadius: '12px',
          padding: '0.75rem 1.25rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(234, 88, 12, 0.4), inset 0 0 15px rgba(251, 146, 60, 0.2)',
          animation: 'pulseGlow 2.5s infinite alternate',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              backgroundColor: '#ef4444',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px #ef4444',
              flexShrink: 0
            }}>
              <Bell size={20} color="#ffffff" style={{ animation: 'ring 1.5s infinite ease-in-out' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#ffedd5', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🚨 ALERTA DE AUDITORÍA:</span>
                <span style={{ backgroundColor: '#ef4444', color: '#ffffff', padding: '0.1rem 0.55rem', borderRadius: '12px', fontSize: '0.82rem' }}>
                  {unreadCount} {unreadCount === 1 ? 'cambio extemporáneo detectado' : 'cambios extemporáneos detectados'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#fed7aa', marginTop: '2px' }}>
                La vendedora realizó registros o modificaciones en la <strong>Planilla Diaria de semanas anteriores</strong>.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              type="button"
              onClick={() => setIsOpenModal(true)}
              style={{
                backgroundColor: '#f97316',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 1.15rem',
                borderRadius: '8px',
                fontWeight: '900',
                fontSize: '0.86rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                transition: 'all 0.15s ease'
              }}
            >
              <ShieldAlert size={16} /> 🔍 Ver Detalle de Modificaciones ({unreadCount})
            </button>
          </div>
        </div>
      )}

      {/* MODAL DETALLADO DE AUDITORÍA DE MODIFICACIONES PASADAS */}
      {isOpenModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#0f172a',
            border: '2px solid #f97316',
            borderRadius: '18px',
            width: '100%',
            maxWidth: '960px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px rgba(0,0,0,0.9), 0 0 30px rgba(249, 115, 22, 0.3)',
            overflow: 'hidden'
          }}>
            {/* Header del Modal */}
            <div style={{
              padding: '1.1rem 1.4rem',
              backgroundColor: '#1e293b',
              borderBottom: '1.5px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{ fontSize: '1.4rem' }}>🚨</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#ffedd5' }}>
                    Auditoría: Modificaciones Realizadas en Semanas Anteriores
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                    Historial de ventas o egresos registrados/modificados extemporáneamente por la vendedora
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResolveAll}
                    disabled={resolvingAll}
                    className="btn btn-secondary btn-sm"
                    style={{ fontWeight: '800', fontSize: '0.8rem', color: '#34d399', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <CheckCircle2 size={15} /> {resolvingAll ? 'Procesando...' : '✓ Marcar Todo como Revisado'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpenModal(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    borderRadius: '6px'
                  }}
                  title="Cerrar ventana"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Pestañas: Pendientes / Historial Completo */}
            <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', backgroundColor: '#090d16', padding: '0.5rem 1.4rem 0 1.4rem', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setActiveTab('UNREAD')}
                style={{
                  padding: '0.55rem 1.2rem',
                  fontSize: '0.85rem',
                  fontWeight: '900',
                  border: 'none',
                  borderBottom: activeTab === 'UNREAD' ? '3px solid #f97316' : '3px solid transparent',
                  backgroundColor: 'transparent',
                  color: activeTab === 'UNREAD' ? '#fb923c' : '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem'
                }}
              >
                <span>⚠️ Pendientes de Revisión</span>
                <span style={{ backgroundColor: unreadCount > 0 ? '#ef4444' : '#334155', color: '#ffffff', padding: '0.1rem 0.5rem', borderRadius: '10px', fontSize: '0.75rem' }}>
                  {unreadCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                style={{
                  padding: '0.55rem 1.2rem',
                  fontSize: '0.85rem',
                  fontWeight: '900',
                  border: 'none',
                  borderBottom: activeTab === 'ALL' ? '3px solid #38bdf8' : '3px solid transparent',
                  backgroundColor: 'transparent',
                  color: activeTab === 'ALL' ? '#38bdf8' : '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem'
                }}
              >
                <span>📜 Historial Completo</span>
                <span style={{ backgroundColor: '#334155', color: '#ffffff', padding: '0.1rem 0.5rem', borderRadius: '10px', fontSize: '0.75rem' }}>
                  {alerts.length}
                </span>
              </button>
            </div>

            {/* Lista de Alertas */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {displayedAlerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#64748b' }}>
                  <CheckCircle2 size={48} color="#10b981" style={{ marginBottom: '0.75rem', opacity: 0.8 }} />
                  <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#94a3b8' }}>
                    {activeTab === 'UNREAD' ? '¡Todo al día! No hay modificaciones extemporáneas pendientes de revisión.' : 'No se registran eventos de auditoría retroactiva.'}
                  </div>
                  <div style={{ fontSize: '0.82rem', marginTop: '0.4rem' }}>
                    El sistema supervisa continuamente cualquier registro o cambio realizado en planillas de semanas anteriores.
                  </div>
                </div>
              ) : (
                displayedAlerts.map(alertItem => {
                  const isUnread = !alertItem.is_resolved && !alertItem.is_read;
                  const isIngreso = alertItem.entry_type === 'INGRESO';
                  
                  let actionBadge = { label: alertItem.action_type, color: '#38bdf8', bg: 'rgba(2, 132, 199, 0.2)', border: '#0284c7' };
                  if (alertItem.action_type === 'CREAR') {
                    actionBadge = { label: '➕ REGISTRO EXTEMPORÁNEO', color: '#34d399', bg: 'rgba(16, 185, 129, 0.2)', border: '#10b981' };
                  } else if (alertItem.action_type === 'MODIFICAR') {
                    actionBadge = { label: '✏️ MODIFICACIÓN DE DATOS / MONTO', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)', border: '#f59e0b' };
                  } else if (alertItem.action_type === 'ANULAR') {
                    actionBadge = { label: '🚫 REGISTRO ANULADO', color: '#f87171', bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444' };
                  } else if (alertItem.action_type === 'REACTIVAR') {
                    actionBadge = { label: '🔄 REGISTRO REACTIVADO', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.2)', border: '#38bdf8' };
                  } else if (alertItem.action_type === 'ELIMINAR') {
                    actionBadge = { label: '🗑️ REGISTRO ELIMINADO', color: '#f87171', bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444' };
                  }

                  const sheetDate = alertItem.sheet_date;
                  const weekStart = alertItem.week_start || alertItem.week_monday;
                  const userName = alertItem.user_name || alertItem.modified_by || 'Vendedora';
                  const prevAmount = alertItem.prev_amount !== undefined ? alertItem.prev_amount : alertItem.previous_amount;

                  return (
                    <div
                      key={alertItem.id}
                      style={{
                        backgroundColor: isUnread ? '#1e293b' : '#090e1a',
                        border: isUnread ? '1.5px solid #f97316' : '1px solid #1e293b',
                        borderRadius: '12px',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem',
                        boxShadow: isUnread ? '0 4px 14px rgba(249, 115, 22, 0.15)' : 'none',
                        position: 'relative'
                      }}
                    >
                      {/* Fila 1: Badges y Fecha de Modificación */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {/* Badge Tienda */}
                          {alertItem.store_id && (
                            <span style={{ fontSize: '0.72rem', fontWeight: '900', padding: '0.15rem 0.5rem', borderRadius: '6px', backgroundColor: alertItem.store_id === 2 ? '#6366f1' : '#0284c7', color: '#ffffff' }}>
                              🏪 {alertItem.store_id === 2 ? 'TIENDA 2' : 'TIENDA 1'}
                            </span>
                          )}

                          {/* Tipo: Ingreso / Egreso */}
                          <span style={{ fontSize: '0.72rem', fontWeight: '900', padding: '0.15rem 0.5rem', borderRadius: '6px', backgroundColor: isIngreso ? '#10b981' : '#ef4444', color: '#ffffff' }}>
                            {isIngreso ? '💵 INGRESO' : '💸 EGRESO'}
                          </span>

                          {/* Acción */}
                          <span style={{ fontSize: '0.72rem', fontWeight: '900', padding: '0.15rem 0.55rem', borderRadius: '6px', backgroundColor: actionBadge.bg, color: actionBadge.color, border: `1px solid ${actionBadge.border}` }}>
                            {actionBadge.label}
                          </span>

                          {isUnread && (
                            <span style={{ fontSize: '0.68rem', fontWeight: '900', padding: '0.1rem 0.45rem', borderRadius: '4px', backgroundColor: '#ea580c', color: '#ffffff' }}>
                              NUEVO / SIN REVISAR
                            </span>
                          )}
                        </div>

                        {/* Fecha exacta en que se modificó */}
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Clock size={13} color="#f97316" />
                          <span>Registrado/Modificado: <strong>{formatDateTimeDisplay(alertItem.created_at)}</strong></span>
                        </div>
                      </div>

                      {/* Fila 2: Planilla Afectada y Usuario */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem', backgroundColor: '#0b1329', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #1e293b' }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', fontWeight: '700' }}>
                            📅 Planilla Afectada (Semana Pasada):
                          </span>
                          <span style={{ fontSize: '0.9rem', fontWeight: '900', color: '#38bdf8' }}>
                            {formatDateDisplay(sheetDate)}
                            {weekStart && (
                              <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: '600', marginLeft: '0.4rem' }}>
                                (Semana del {formatDateDisplay(weekStart)})
                              </span>
                            )}
                          </span>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', fontWeight: '700' }}>
                            👤 Realizado Por:
                          </span>
                          <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#e2e8f0' }}>
                            {userName}
                          </span>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', fontWeight: '700' }}>
                            📄 Contrato / Concepto:
                          </span>
                          <span style={{ fontSize: '0.9rem', fontWeight: '900', color: '#f1f5f9' }}>
                            {alertItem.contract_or_concept || '—'}
                          </span>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', fontWeight: '700' }}>
                            💰 Monto:
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {prevAmount !== null && prevAmount !== undefined && Number(prevAmount) !== Number(alertItem.amount) ? (
                              <span style={{ fontSize: '0.85rem', color: '#94a3b8', textDecoration: 'line-through' }}>
                                {formatSoles(prevAmount)}
                              </span>
                            ) : null}
                            <span style={{ fontSize: '1.05rem', fontWeight: '900', color: isIngreso ? '#34d399' : '#f87171' }}>
                              {formatSoles(alertItem.amount || 0)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Fila 3: Detalle de la modificación y Botón Revisado */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
                        <div style={{ fontSize: '0.82rem', color: '#cbd5e1', flex: 1 }}>
                          <strong>Detalle:</strong> {alertItem.details}
                        </div>

                        <div>
                          {isUnread ? (
                            <button
                              type="button"
                              onClick={() => handleResolveAlert(alertItem.id)}
                              disabled={resolvingId === alertItem.id}
                              style={{
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.78rem',
                                fontWeight: '900',
                                borderRadius: '6px',
                                backgroundColor: '#10b981',
                                color: '#ffffff',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)'
                              }}
                            >
                              <CheckCircle2 size={14} /> {resolvingId === alertItem.id ? 'Guardando...' : '✓ Marcar como Revisado'}
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <CheckCircle2 size={14} /> Revisado {alertItem.resolved_by ? `por ${alertItem.resolved_by}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '0.85rem 1.4rem', backgroundColor: '#1e293b', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsOpenModal(false)}
                className="btn btn-secondary"
                style={{ fontWeight: '800' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

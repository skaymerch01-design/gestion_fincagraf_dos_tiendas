import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { Clock, Plus, CheckCircle2, Trash2, Calendar, AlertTriangle, Check, ShieldAlert, X } from 'lucide-react';

export default function CronogramaPagosTab() {
  const [schedules, setSchedules] = useState([]);
  const [stats, setStats] = useState({ total_pending: 0, total_paid: 0 });
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [serviceCategory, setServiceCategory] = useState('LUZ');
  const [customConcept, setCustomConcept] = useState('');
  const [dueDay, setDueDay] = useState('5');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchSchedules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/payment-schedule');
      if (res.success) {
        setSchedules(res.schedules);
        setStats(res.stats);
        setActiveAlerts(res.activeAlerts || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    // Calcular la fecha de vencimiento próxima para el mes actual o siguiente
    const now = new Date();
    const targetDay = parseInt(dueDay || '5', 10);
    let targetMonth = now.getMonth();
    let targetYear = now.getFullYear();

    if (now.getDate() > targetDay) {
      targetMonth += 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }
    }

    const calculatedDueDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    const finalConceptName = serviceCategory === 'OTRO' ? customConcept.trim() : serviceCategory;

    try {
      await apiFetch('/payment-schedule', {
        method: 'POST',
        body: JSON.stringify({
          concept: finalConceptName,
          category: serviceCategory,
          due_date: calculatedDueDate,
          amount,
          notes: notes ? `Día ${targetDay} de cada mes - ${notes.trim()}` : `Día ${targetDay} de cada mes`,
        }),
      });
      setShowModal(false);
      setCustomConcept('');
      setAmount('');
      setNotes('');
      fetchSchedules();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAsPaid = async (id) => {
    if (!window.confirm('¿Confirmar que este pago/servicio ha sido realizado y desactivar su alerta?')) return;
    try {
      await apiFetch(`/payment-schedule/${id}/pay`, {
        method: 'PUT',
      });
      fetchSchedules();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este pago del cronograma?')) return;
    try {
      await apiFetch(`/payment-schedule/${id}`, {
        method: 'DELETE',
      });
      fetchSchedules();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* CSS Animado para Alerta Parpadeante y Llamativa */}
      <style>{`
        @keyframes blinkNeonAlert {
          0% { box-shadow: 0 0 15px rgba(239, 68, 68, 0.8); border-color: #ef4444; }
          50% { box-shadow: 0 0 35px rgba(239, 68, 68, 1); border-color: #f87171; transform: scale(1.005); }
          100% { box-shadow: 0 0 15px rgba(239, 68, 68, 0.8); border-color: #ef4444; }
        }
      `}</style>

      {/* Header */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Clock size={24} color="#38bdf8" />
            2. Cronograma de Pagos Fijos de la Empresa
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.25rem', margin: 0 }}>
            Control y alertas mensuales de servicios fijos (Alquiler de local, Luz, Agua, Internet, Mantenimiento, etc.).
          </p>
        </div>

        <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ fontWeight: '900', padding: '0.7rem 1.25rem' }}>
          <Plus size={18} /> Programar Nuevo Servicio Fijo
        </button>
      </div>

      {/* BANNER DE ALERTA PARPADEANTE LLAMATIVA 5 DÍAS ANTES / REGISTRADO POR VENDEDORA (Requerimiento 3 y 4) */}
      {activeAlerts.length > 0 && (
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
            <span>🚨 ¡ALERTA DE PAGOS PRÓXIMOS Y REGISTROS EN CAJA! ({activeAlerts.length})</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {activeAlerts.map((alt) => (
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
                    📌 {alt.concept} (S/ {alt.amount.toFixed(2)})
                  </span>
                  <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: alt.diffDays < 0 ? '#f87171' : '#fbbf24', fontWeight: '800' }}>
                    {alt.isVendedoraRegistered 
                      ? '🔔 Vendedora ya registró el egreso en Caja — Pendiente tu aprobación' 
                      : (alt.diffDays < 0 ? `⚠️ VENCIDO (Hace ${Math.abs(alt.diffDays)} días)` : (alt.diffDays === 0 ? '⚠️ VENCE HOY' : `⏳ Vence en ${alt.diffDays} días (${alt.due_date})`))}
                  </span>
                </div>

                <button
                  onClick={() => handleMarkAsPaid(alt.id)}
                  className="btn btn-success btn-sm"
                  style={{ fontWeight: '900', padding: '0.4rem 0.85rem' }}
                >
                  <CheckCircle2 size={15} /> Aprobar y Desactivar Alerta
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cards de Resumen */}
      <div className="grid-2">
        <div className="card" style={{ borderLeft: '5px solid #f59e0b', backgroundColor: '#0f172a' }}>
          <span style={{ fontSize: '0.82rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
            Total Pendiente de Pago
          </span>
          <div style={{ fontSize: '1.85rem', fontWeight: '900', color: '#fbbf24', marginTop: '0.2rem' }}>
            S/ {stats.total_pending.toFixed(2)}
          </div>
        </div>

        <div className="card" style={{ borderLeft: '5px solid #10b981', backgroundColor: '#0f172a' }}>
          <span style={{ fontSize: '0.82rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
            Total Pagado
          </span>
          <div style={{ fontSize: '1.85rem', fontWeight: '900', color: '#34d399', marginTop: '0.2rem' }}>
            S/ {stats.total_paid.toFixed(2)}
          </div>
        </div>
      </div>

      {loading && <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>⚡ Cargando cronograma de pagos...</p>}
      {error && <p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</p>}

      {/* Tabla Unificada (Sin duplicar Concepto/Categoría) */}
      {!loading && !error && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '2px solid #0284c7' }}>
          <div className="table-container" style={{ border: 'none' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', minWidth: '180px' }}>SERVICIO FIJO A PAGAR</th>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', width: '220px', textAlign: 'center' }}>VENCIMIENTO MENSUAL</th>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', textAlign: 'right', width: '130px' }}>MONTO S/</th>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', minWidth: '220px' }}>ESTADO DE AUDITORÍA</th>
                  <th style={{ backgroundColor: '#0284c7', color: '#ffffff', textAlign: 'center', width: '140px' }}>FECHA DE CONFIRMACIÓN</th>
                  <th style={{ backgroundColor: '#0369a1', color: '#ffffff', textAlign: 'center', width: '200px' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: '#94a3b8', padding: '2.5rem', fontWeight: '700' }}>
                      No hay pagos programados. Haz clic en "Programar Nuevo Servicio Fijo" para agregar uno.
                    </td>
                  </tr>
                ) : (
                  schedules.map((sch) => {
                    const isPaid = sch.status === 'PAGADO';
                    const isRegisteredByVendedora = sch.status === 'REGISTRADO_POR_VENDEDORA';

                    let rowBg = 'transparent';
                    if (isPaid) rowBg = 'rgba(16, 185, 129, 0.12)';
                    else if (isRegisteredByVendedora) rowBg = 'rgba(245, 158, 11, 0.2)';

                    return (
                      <tr key={sch.id} style={{ backgroundColor: rowBg, borderBottom: '1px solid #1e293b' }}>
                        {/* 1. SERVICIO FIJO UNIFICADO (Sin duplicidad) */}
                        <td style={{ fontWeight: '900', color: '#ffffff' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span className="badge" style={{ backgroundColor: '#0284c7', color: '#ffffff', fontWeight: '900', fontSize: '0.8rem' }}>
                              {sch.concept || sch.category}
                            </span>
                          </div>
                          {sch.notes && <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.2rem', fontWeight: '600' }}>{sch.notes}</div>}
                        </td>

                        {/* 2. VENCIMIENTO MENSUAL */}
                        <td style={{ textAlign: 'center', fontWeight: '800', color: '#38bdf8' }}>
                          📅 {sch.due_date}
                        </td>

                        {/* 3. MONTO */}
                        <td style={{ textAlign: 'right', fontWeight: '900', fontSize: '1.1rem', color: isPaid ? '#34d399' : '#fbbf24' }}>
                          S/ {sch.amount.toFixed(2)}
                        </td>

                        {/* 4. ESTADO DE AUDITORÍA */}
                        <td>
                          {isPaid ? (
                            <span className="badge" style={{ backgroundColor: '#10b981', color: '#ffffff', fontWeight: '900', fontSize: '0.8rem' }}>
                              ✅ PAGADO / ALERTA CERRADA
                            </span>
                          ) : isRegisteredByVendedora ? (
                            <span className="badge" style={{ backgroundColor: '#f59e0b', color: '#000000', fontWeight: '900', fontSize: '0.8rem' }}>
                              🔔 REGISTRADO EN CAJA POR VENDEDORA
                            </span>
                          ) : (
                            <span className="badge" style={{ backgroundColor: '#ef4444', color: '#ffffff', fontWeight: '900', fontSize: '0.8rem' }}>
                              ⏳ PENDIENTE DE PAGO
                            </span>
                          )}
                        </td>

                        {/* 5. FECHA CONFIRMACIÓN */}
                        <td style={{ textAlign: 'center' }}>
                          {sch.payment_date ? (
                            <span style={{ color: '#34d399', fontWeight: '800' }}>
                              {new Date(sch.payment_date).toLocaleDateString('es-PE')}
                            </span>
                          ) : (
                            <span style={{ color: '#64748b' }}>—</span>
                          )}
                        </td>

                        {/* 6. ACCIONES */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                            {!isPaid && (
                              <button
                                onClick={() => handleMarkAsPaid(sch.id)}
                                className="btn btn-success btn-sm"
                                style={{ fontWeight: '900', fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                                title="Aprobar Pago y Desactivar Alerta"
                              >
                                <CheckCircle2 size={14} /> Aprobar Pago
                              </button>
                            )}

                            <button
                              onClick={() => handleDelete(sch.id)}
                              className="btn btn-danger btn-sm"
                              style={{ padding: '0.3rem 0.55rem' }}
                              title="Eliminar del Cronograma"
                            >
                              <Trash2 size={13} />
                            </button>
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

      {/* MODAL CREAR SERVICIO FIJO DEL CRONOGRAMA */}
      {showModal && (
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
          <div className="card" style={{ width: '100%', maxWidth: '520px', backgroundColor: '#0f172a', border: '3px solid #0284c7', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '900' }}>
                <Clock size={22} /> Programar Servicio Fijo Mensual
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              
              {/* 1. SERVICIO FIJO (Sin duplicidad) */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>1. Servicio Fijo Mensual:</label>
                <select
                  className="form-select"
                  style={{ backgroundColor: '#1e293b', fontSize: '1rem', fontWeight: '800' }}
                  value={serviceCategory}
                  onChange={(e) => setServiceCategory(e.target.value)}
                >
                  <option value="ALQUILER DE LOCAL">🏠 ALQUILER DE LOCAL</option>
                  <option value="LUZ">💡 LUZ / ENERGÍA ELÉCTRICA</option>
                  <option value="AGUA">💧 AGUA POTABLE</option>
                  <option value="INTERNET">🌐 INTERNET / FIBRA</option>
                  <option value="MANTENIMIENTO">🛠️ MANTENIMIENTO DE TIENDA</option>
                  <option value="TELÉFONO / CELULAR">📱 TELÉFONO / CELULAR</option>
                  <option value="OTRO">➕ OTRO SERVICIO PERSONALIZADO</option>
                </select>
              </div>

              {serviceCategory === 'OTRO' && (
                <div className="form-group">
                  <label className="form-label">Nombre del Servicio Personalizado:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={customConcept}
                    onChange={(e) => setCustomConcept(e.target.value)}
                    placeholder="Ej: Seguridad Privada"
                    required
                  />
                </div>
              )}

              {/* 2. DÍA DE VENCIMIENTO DE CADA MES */}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>2. Día de Vencimiento de Cada Mes:</label>
                  <select
                    className="form-select"
                    style={{ backgroundColor: '#1e293b', fontSize: '1rem', fontWeight: '800' }}
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>Día {day} de cada mes</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>3. Monto Fijo Mensual (S/):</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    style={{ backgroundColor: '#1e293b', fontSize: '1.2rem', fontWeight: '900', color: '#22c55e' }}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Ej: 100.00"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '800', color: '#ffffff' }}>4. Notas o N° Suministro (Opcional):</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ backgroundColor: '#1e293b' }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: Suministro Luz #123456"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontWeight: '900', padding: '0.65rem 1.5rem' }} disabled={submitting}>
                  {submitting ? 'Guardando...' : '💾 Guardar Servicio Fijo'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}

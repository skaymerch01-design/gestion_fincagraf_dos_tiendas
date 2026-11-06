import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import {
  HandCoins,
  Plus,
  Trash2,
  Search,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  User,
  History,
  AlertCircle,
  X,
  FileText
} from 'lucide-react';

export default function PrestamosPersonalesTab() {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVO' | 'LIQUIDADO'
  const [searchQuery, setSearchQuery] = useState('');

  // New Loan Modal State
  const [showNewModal, setShowNewModal] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newTotalAmount, setNewTotalAmount] = useState('');
  const [newWeeklyDiscount, setNewWeeklyDiscount] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newDateStr, setNewDateStr] = useState(new Date().toISOString().split('T')[0]);

  // Payment / Discount Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedLoanForPayment, setSelectedLoanForPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Payment History Modal State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [loanDetail, setLoanDetail] = useState(null);
  const [paymentsHistory, setPaymentsHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchLoans = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = '/staff-loans';
      const params = [];
      if (statusFilter !== 'ALL') {
        params.push(`status=${encodeURIComponent(statusFilter)}`);
      }
      if (searchQuery.trim() !== '') {
        params.push(`search=${encodeURIComponent(searchQuery.trim())}`);
      }
      if (params.length > 0) {
        url += '?' + params.join('&');
      }

      const res = await apiFetch(url);
      if (res.success) {
        setLoans(res.loans || []);
      } else {
        setError(res.error || 'Error al cargar los préstamos.');
      }
    } catch (err) {
      console.error('Error fetching staff loans:', err);
      setError(err.message || 'Error al cargar préstamos al personal.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoans();
  }, [statusFilter, searchQuery]);

  const handleCreateLoan = async (e) => {
    e.preventDefault();
    if (!newStaffName.trim()) {
      return alert('Ingrese el nombre del colaborador.');
    }
    const amt = parseFloat(newTotalAmount);
    if (isNaN(amt) || amt <= 0) {
      return alert('Ingrese un monto prestado válido mayor a 0.');
    }

    try {
      const res = await apiFetch('/staff-loans', {
        method: 'POST',
        body: {
          date_str: newDateStr,
          staff_name: newStaffName.trim(),
          total_amount: amt,
          weekly_discount: parseFloat(newWeeklyDiscount || 0),
          notes: newNotes.trim()
        }
      });

      if (res.success) {
        setShowNewModal(false);
        setNewStaffName('');
        setNewTotalAmount('');
        setNewWeeklyDiscount('');
        setNewNotes('');
        fetchLoans();
      } else {
        alert(res.error || 'Error al crear préstamo.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const openPaymentModal = (loan) => {
    setSelectedLoanForPayment(loan);
    setPaymentAmount(loan.weekly_discount > 0 ? loan.weekly_discount : loan.balance_due);
    setPaymentNotes('Descuento de cuota semanal');
    setShowPaymentModal(true);
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    if (!selectedLoanForPayment) return;

    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      return alert('Ingrese un monto válido a descontar.');
    }

    try {
      const res = await apiFetch(`/staff-loans/${selectedLoanForPayment.id}/payments`, {
        method: 'POST',
        body: {
          amount: amt,
          notes: paymentNotes,
          date_str: new Date().toISOString().split('T')[0]
        }
      });

      if (res.success) {
        setShowPaymentModal(false);
        setSelectedLoanForPayment(null);
        setPaymentAmount('');
        setPaymentNotes('');
        fetchLoans();
      } else {
        alert(res.error || 'Error al registrar descuento.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const openHistoryModal = async (loan) => {
    setShowHistoryModal(true);
    setLoanDetail(loan);
    setLoadingHistory(true);
    try {
      const res = await apiFetch(`/staff-loans/${loan.id}`);
      if (res.success) {
        setLoanDetail(res.loan);
        setPaymentsHistory(res.payments || []);
      }
    } catch (err) {
      console.error('Error fetching loan history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDeleteLoan = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar este préstamo? Se eliminarán también todos los registros de cuotas descontadas.')) {
      return;
    }

    try {
      const res = await apiFetch(`/staff-loans/${id}`, { method: 'DELETE' });
      if (res.success) {
        fetchLoans();
      } else {
        alert(res.error || 'Error al eliminar préstamo.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Metric Summaries
  const totalPrestado = loans.reduce((acc, l) => acc + (l.total_amount || 0), 0);
  const totalCobrado = loans.reduce((acc, l) => acc + (l.amount_paid || 0), 0);
  const totalSaldoPendiente = loans.reduce((acc, l) => acc + (l.balance_due || 0), 0);
  const countActivos = loans.filter((l) => l.status === 'ACTIVO').length;
  const countLiquidados = loans.filter((l) => l.status === 'LIQUIDADO').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Header Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ backgroundColor: '#1e293b', border: '1.5px solid #3b82f6', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#93c5fd' }}>TOTAL PRESTADO</span>
            <HandCoins size={22} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#ffffff', marginTop: '0.4rem' }}>
            S/ {totalPrestado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.2rem' }}>Monto total desembolsado</div>
        </div>

        <div className="card" style={{ backgroundColor: '#1e293b', border: '1.5px solid #10b981', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#6ee7b7' }}>TOTAL COBRADO</span>
            <CheckCircle2 size={22} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#34d399', marginTop: '0.4rem' }}>
            S/ {totalCobrado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.2rem' }}>Cuotas descontadas acumuladas</div>
        </div>

        <div className="card" style={{ backgroundColor: '#1e293b', border: '1.5px solid #f59e0b', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#fde68a' }}>SALDO PENDIENTE</span>
            <Clock size={22} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#fbbf24', marginTop: '0.4rem' }}>
            S/ {totalSaldoPendiente.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.2rem' }}>Por recuperar del personal</div>
        </div>

        <div className="card" style={{ backgroundColor: '#1e293b', border: '1.5px solid #a855f7', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#e9d5ff' }}>ESTADO DE PRÉSTAMOS</span>
            <User size={22} color="#a855f7" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem' }}>
            <div>
              <span style={{ fontSize: '1.4rem', fontWeight: '900', color: '#f59e0b' }}>{countActivos}</span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.2rem' }}>Activos</span>
            </div>
            <div style={{ height: '24px', width: '1px', backgroundColor: '#334155' }} />
            <div>
              <span style={{ fontSize: '1.4rem', fontWeight: '900', color: '#34d399' }}>{countLiquidados}</span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.2rem' }}>Saldados</span>
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.2rem' }}>Total colaboradores: {loans.length}</div>
        </div>
      </div>

      {/* Control Bar (Search + Filter + New Loan Button) */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '0.85rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="🔍 Buscar por colaborador o nota..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.4rem', fontSize: '0.9rem' }}
            />
          </div>

          <div style={{ display: 'flex', backgroundColor: '#0f172a', padding: '0.25rem', borderRadius: '8px', border: '1px solid #334155' }}>
            <button
              onClick={() => setStatusFilter('ALL')}
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: '800',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: statusFilter === 'ALL' ? '#38bdf8' : 'transparent',
                color: statusFilter === 'ALL' ? '#0f172a' : '#94a3b8'
              }}
            >
              Todos ({loans.length})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVO')}
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: '800',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: statusFilter === 'ACTIVO' ? '#f59e0b' : 'transparent',
                color: statusFilter === 'ACTIVO' ? '#0f172a' : '#94a3b8'
              }}
            >
              Activos ({loans.filter(l => l.status === 'ACTIVO').length})
            </button>
            <button
              onClick={() => setStatusFilter('LIQUIDADO')}
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: '800',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: statusFilter === 'LIQUIDADO' ? '#10b981' : 'transparent',
                color: statusFilter === 'LIQUIDADO' ? '#ffffff' : '#94a3b8'
              }}
            >
              Liquidados ({loans.filter(l => l.status === 'LIQUIDADO').length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr style={{ backgroundColor: '#0f172a' }}>
                <th style={{ width: '90px' }}>FECHA</th>
                <th>COLABORADOR (PERSONAL)</th>
                <th style={{ textAlign: 'right' }}>PRESTADO</th>
                <th style={{ textAlign: 'right' }}>CUOTA SEMANAL</th>
                <th style={{ textAlign: 'right' }}>COBRADO</th>
                <th style={{ textAlign: 'right' }}>SALDO PENDIENTE</th>
                <th style={{ width: '140px', textAlign: 'center' }}>PROGRESO</th>
                <th style={{ textAlign: 'center', width: '110px' }}>ESTADO</th>
                <th style={{ textAlign: 'center', width: '160px' }}>AUDITORÍA</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                    Cargando préstamos al personal...
                  </td>
                </tr>
              ) : loans.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                    No se encontraron préstamos registrados.
                  </td>
                </tr>
              ) : (
                loans.map((loan) => {
                  const pct = loan.total_amount > 0 ? Math.min(100, Math.round((loan.amount_paid / loan.total_amount) * 100)) : 0;
                  const isLiquidated = loan.status === 'LIQUIDADO';

                  return (
                    <tr key={loan.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: '700' }}>
                        {loan.date_str}
                      </td>
                      <td>
                        <div style={{ fontWeight: '900', color: '#ffffff', fontSize: '0.95rem' }}>
                          👤 {loan.staff_name}
                        </div>
                        {loan.notes && (
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                            {loan.notes}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '800', color: '#ffffff' }}>
                        S/ {(loan.total_amount || 0).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '800', color: '#fbbf24' }}>
                        {loan.weekly_discount > 0 ? `S/ ${loan.weekly_discount.toFixed(2)}` : 'S/ -'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '800', color: '#34d399' }}>
                        S/ {(loan.amount_paid || 0).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '900', color: isLiquidated ? '#34d399' : '#f87171' }}>
                        S/ {(loan.balance_due || 0).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' }}>
                          <div style={{ width: '100%', backgroundColor: '#334155', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${pct}%`,
                                backgroundColor: isLiquidated ? '#10b981' : pct > 50 ? '#38bdf8' : '#f59e0b',
                                height: '100%',
                                transition: 'width 0.4s ease'
                              }}
                            />
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: '900', color: isLiquidated ? '#34d399' : '#cbd5e1' }}>
                            {pct}% Pagado
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isLiquidated ? (
                          <span className="badge" style={{ backgroundColor: '#10b981', color: '#ffffff', fontWeight: '900', padding: '0.25rem 0.6rem' }}>
                            LIQUIDADO
                          </span>
                        ) : (
                          <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.25)', border: '1px solid #f59e0b', color: '#fbbf24', fontWeight: '900', padding: '0.25rem 0.6rem' }}>
                            ACTIVO
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <button
                            onClick={() => openHistoryModal(loan)}
                            className="btn btn-sm btn-secondary"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                            title="Ver Historial de Descuentos y Pagos"
                          >
                            <History size={14} color="#38bdf8" /> Pagos / Historial
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

      {/* MODAL: REGISTRAR NUEVO PRÉSTAMO MANUAL */}
      {showNewModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', backgroundColor: '#0f172a', border: '2px solid #38bdf8', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HandCoins size={20} /> Registrar Nuevo Préstamo al Personal
              </h3>
              <button onClick={() => setShowNewModal(false)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateLoan} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ color: '#ffffff', fontWeight: '800' }}>Fecha del Préstamo:</label>
                <input
                  type="date"
                  className="form-input"
                  value={newDateStr}
                  onChange={(e) => setNewDateStr(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ color: '#ffffff', fontWeight: '800' }}>Nombre Completo del Personal / Colaborador:</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej: Juan Pérez / María Vendedora"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ color: '#ffffff', fontWeight: '800' }}>Monto Otorgado (S/):</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="Ej: 500.00"
                    value={newTotalAmount}
                    onChange={(e) => setNewTotalAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ color: '#ffffff', fontWeight: '800' }}>Descuento Semanal (S/):</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="Ej: 75.00"
                    value={newWeeklyDiscount}
                    onChange={(e) => setNewWeeklyDiscount(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ color: '#ffffff', fontWeight: '800' }}>Motivo / Observaciones (Opcional):</label>
                <textarea
                  className="form-input"
                  rows="2"
                  placeholder="Ej: Préstamo para salud o gastos personales"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowNewModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontWeight: '900' }}>
                  Guardar Préstamo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ABONAR / DESCONTAR CUOTA MANUAL */}
      {showPaymentModal && selectedLoanForPayment && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '450px', backgroundColor: '#0f172a', border: '2px solid #10b981', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#10b981', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={20} /> Descontar Cuota de Préstamo
              </h3>
              <button onClick={() => setShowPaymentModal(false)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddPayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ backgroundColor: '#1e293b', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Colaborador:</div>
                <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#ffffff' }}>👤 {selectedLoanForPayment.staff_name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.82rem' }}>
                  <span>Deuda Inicial: <strong style={{ color: '#ffffff' }}>S/ {selectedLoanForPayment.total_amount.toFixed(2)}</strong></span>
                  <span>Saldo Actual: <strong style={{ color: '#f87171' }}>S/ {selectedLoanForPayment.balance_due.toFixed(2)}</strong></span>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ color: '#ffffff', fontWeight: '800' }}>Monto de la Cuota a Descontar (S/):</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ color: '#ffffff', fontWeight: '800' }}>Nota / Detalle del Descuento:</label>
                <input
                  type="text"
                  className="form-input"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowPaymentModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-success" style={{ fontWeight: '900' }}>
                  Aplicar Descuento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: HISTORIAL DE PAGOS / DESCUENTOS DE UN PRÉSTAMO */}
      {showHistoryModal && loanDetail && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '600px', backgroundColor: '#0f172a', border: '2px solid #a855f7', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#c084fc', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History size={20} /> Historial de Descuentos — {loanDetail.staff_name}
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                  Préstamo de S/ {loanDetail.total_amount.toFixed(2)} del {loanDetail.date_str}
                </div>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="btn-close-neon" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr style={{ backgroundColor: '#1e293b' }}>
                    <th style={{ width: '100px' }}>FECHA</th>
                    <th style={{ textAlign: 'right' }}>MONTO (S/)</th>
                    <th>DETALLE</th>
                    <th>REGISTRADO POR</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                        Cargando historial de pagos...
                      </td>
                    </tr>
                  ) : paymentsHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                        Aún no registra descuentos ni cuotas abonadas.
                      </td>
                    </tr>
                  ) : (
                    paymentsHistory.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>{p.date_str}</td>
                        <td style={{ textAlign: 'right', fontWeight: '900', color: '#34d399' }}>
                          S/ {p.amount.toFixed(2)}
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>{p.notes}</td>
                        <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{p.registered_by_name || 'Sistema'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #1e293b' }}>
              <div style={{ fontSize: '0.85rem' }}>
                Saldo Restante: <strong style={{ color: loanDetail.balance_due <= 0 ? '#34d399' : '#f87171', fontWeight: '900' }}>S/ {loanDetail.balance_due.toFixed(2)}</strong>
              </div>
              <button type="button" onClick={() => setShowHistoryModal(false)} className="btn btn-secondary">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

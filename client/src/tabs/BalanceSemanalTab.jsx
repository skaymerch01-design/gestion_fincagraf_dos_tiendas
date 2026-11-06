import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { Calendar, DollarSign, TrendingUp, TrendingDown, Plus, MessageSquare } from 'lucide-react';

export default function BalanceSemanalTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Form for admin adjustment note
  const [noteText, setNoteText] = useState('');
  const [noteAmount, setNoteAmount] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  const fetchBalance = async () => {
    setLoading(true);
    setError(null);
    try {
      let query = '';
      if (startDate && endDate) {
        query = `?startDate=${startDate}&endDate=${endDate}`;
      }
      const res = await apiFetch(`/weekly-balance${query}`);
      if (res.success) {
        setData(res);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, []);

  const handleAddAdjustment = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    setSubmittingNote(true);
    try {
      await apiFetch('/weekly-balance/adjustment', {
        method: 'POST',
        body: {
          week_identifier: data?.period?.weekTag || 'GENERAL',
          admin_note: noteText,
          adjustment_amount: noteAmount || 0,
        },
      });
      setNoteText('');
      setNoteAmount('');
      fetchBalance();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmittingNote(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Date Filter Header */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={22} color="#38bdf8" />
            1. Balance Semanal de Operaciones
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Auditoría de ingresos y egresos diarios. Permite hacer notas sin alterar registros de la vendedora.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input
            type="date"
            className="form-input"
            style={{ width: 'auto' }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span style={{ color: '#94a3b8' }}>a</span>
          <input
            type="date"
            className="form-input"
            style={{ width: 'auto' }}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <button onClick={fetchBalance} className="btn btn-primary">
            Filtrar
          </button>
        </div>
      </div>

      {loading && <p style={{ color: '#94a3b8' }}>Cargando datos del balance semanal...</p>}
      {error && <p style={{ color: '#ef4444' }}>{error}</p>}

      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid-3">
            <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>
                Total Ingresos (Cobros)
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#34d399', marginTop: '0.25rem' }}>
                S/ {data.summary.total_income.toFixed(2)}
              </div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Cobros de contratos en el periodo</span>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>
                Total Egresos (Caja)
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f87171', marginTop: '0.25rem' }}>
                S/ {data.summary.total_expenses.toFixed(2)}
              </div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Gastos registrados por la vendedora</span>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #0284c7' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>
                Balance Neto Semanal
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: data.summary.net_balance >= 0 ? '#38bdf8' : '#f87171', marginTop: '0.25rem' }}>
                S/ {data.summary.net_balance.toFixed(2)}
              </div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Diferencia (Ingresos - Egresos)</span>
            </div>
          </div>

          {/* Admin Adjustment Note Form */}
          <div className="card" style={{ backgroundColor: '#1e293b', border: '1px solid #3b82f6' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#60a5fa', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageSquare size={18} />
              Agregar Nota o Ajuste de Auditoría (Solo visible para Administrador)
            </h3>
            <form onSubmit={handleAddAdjustment} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Ejemplo: Se verificó cuadre de caja del martes. Faltaron S/ 5 en comprobante."
                className="form-input"
                style={{ flex: 1, minWidth: '250px' }}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                required
              />
              <input
                type="number"
                step="0.01"
                placeholder="Ajuste S/ (Opcional)"
                className="form-input"
                style={{ width: '160px' }}
                value={noteAmount}
                onChange={(e) => setNoteAmount(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={submittingNote}>
                {submittingNote ? 'Guardando...' : 'Guardar Nota de Auditoría'}
              </button>
            </form>

            {data.admin_adjustments && data.admin_adjustments.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8' }}>Notas guardadas:</span>
                {data.admin_adjustments.map((adj) => (
                  <div key={adj.id} style={{ backgroundColor: '#0f172a', padding: '0.6rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>📌 {adj.admin_note}</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Por: {adj.admin_name || 'Admin'} ({new Date(adj.created_at).toLocaleDateString('es-PE')})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tables Side by Side or Stacked */}
          <div className="grid-2">
            {/* Income Table */}
            <div className="card">
              <h3 style={{ fontSize: '1rem', color: '#34d399', marginBottom: '0.75rem' }}>📥 Ingresos Registrados (Cobros)</h3>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Contrato</th>
                      <th>Cliente</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.income.length === 0 ? (
                      <tr><td colSpan="4" style={{ textAlign: 'center', color: '#94a3b8' }}>Sin ingresos en este rango</td></tr>
                    ) : (
                      data.income.map((item) => (
                        <tr key={item.id}>
                          <td>{new Date(item.date).toLocaleDateString('es-PE')}</td>
                          <td><strong style={{ color: '#38bdf8' }}>{item.contract_code}</strong></td>
                          <td>{item.client_name}</td>
                          <td><strong style={{ color: '#34d399' }}>S/ {item.amount.toFixed(2)}</strong></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expenses Table */}
            <div className="card">
              <h3 style={{ fontSize: '1rem', color: '#f87171', marginBottom: '0.75rem' }}>📤 Egresos Registrados (Caja Diaria)</h3>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Categoría</th>
                      <th>Descripción</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.length === 0 ? (
                      <tr><td colSpan="4" style={{ textAlign: 'center', color: '#94a3b8' }}>Sin egresos en este rango</td></tr>
                    ) : (
                      data.expenses.map((item) => (
                        <tr key={item.id}>
                          <td>{new Date(item.date).toLocaleDateString('es-PE')}</td>
                          <td><span className="badge badge-pending">{item.category}</span></td>
                          <td>{item.description}</td>
                          <td><strong style={{ color: '#f87171' }}>S/ {item.amount.toFixed(2)}</strong></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

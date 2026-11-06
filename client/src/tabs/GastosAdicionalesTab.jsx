import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { formatSoles } from '../utils/format';
import { ShoppingBag, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Calendar, Sparkles } from 'lucide-react';

export default function GastosAdicionalesTab() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filtro por Semana (Semana Offset: 0 = actual, -1 = semana anterior, +1 = semana siguiente)
  const [weekOffset, setWeekOffset] = useState(0);

  // Filtros de Categoría y Ordenamiento
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('fecha_desc'); // fecha_desc | fecha_asc | monto_desc | monto_asc | categoria_asc

  // Categorías de egresos adicionales (ESTRICTAMENTE SIN GASTO DE CONTRATO)
  const nonContractCategories = [
    'Pagar a Prestamista',
    'Pago Personal',
    'Pago Alquiler de la Tienda',
    'Pago Luz y Mantenimiento',
    'Pago Internet',
    'Adelanto al Personal',
    'Préstamo al Personal',
    'Gasto Interno',
  ];

  // Colores distintivos para cada categoría
  const categoryStyles = {
    'PAGAR A PRESTAMISTA': { bg: 'rgba(147, 51, 234, 0.25)', color: '#c084fc', border: '1.5px solid #a855f7' },
    'PAGO PERSONAL': { bg: 'rgba(59, 130, 246, 0.25)', color: '#60a5fa', border: '1.5px solid #3b82f6' },
    'PAGO ALQUILER DE LA TIENDA': { bg: 'rgba(245, 158, 11, 0.25)', color: '#fbbf24', border: '1.5px solid #f59e0b' },
    'PAGO LUZ Y MANTENIMIENTO': { bg: 'rgba(234, 179, 8, 0.25)', color: '#fde047', border: '1.5px solid #eab308' },
    'PAGO INTERNET': { bg: 'rgba(6, 182, 212, 0.25)', color: '#22d3ee', border: '1.5px solid #06b6d4' },
    'ADELANTO AL PERSONAL': { bg: 'rgba(20, 184, 166, 0.25)', color: '#2dd4bf', border: '1.5px solid #14b8a6' },
    'PRÉSTAMO AL PERSONAL': { bg: 'rgba(99, 102, 241, 0.25)', color: '#818cf8', border: '1.5px solid #6366f1' },
    'GASTO INTERNO': { bg: 'rgba(244, 63, 94, 0.25)', color: '#fb7185', border: '1.5px solid #f43f5e' },
  };

  const getCategoryBadge = (categoryName) => {
    const catUpper = (categoryName || '').toUpperCase().trim();
    let style = { bg: 'rgba(217, 70, 239, 0.25)', color: '#e879f9', border: '1.5px solid #d946ef' }; // Default

    if (catUpper.includes('PRESTAMISTA')) style = categoryStyles['PAGAR A PRESTAMISTA'];
    else if (catUpper.includes('PAGO PERSONAL')) style = categoryStyles['PAGO PERSONAL'];
    else if (catUpper.includes('ALQUILER')) style = categoryStyles['PAGO ALQUILER DE LA TIENDA'];
    else if (catUpper.includes('LUZ') || catUpper.includes('MANTENIMIENTO')) style = categoryStyles['PAGO LUZ Y MANTENIMIENTO'];
    else if (catUpper.includes('INTERNET')) style = categoryStyles['PAGO INTERNET'];
    else if (catUpper.includes('ADELANTO')) style = categoryStyles['ADELANTO AL PERSONAL'];
    else if (catUpper.includes('PRÉSTAMO') || catUpper.includes('PRESTAMO')) style = categoryStyles['PRÉSTAMO AL PERSONAL'];
    else if (catUpper.includes('INTERNO')) style = categoryStyles['GASTO INTERNO'];

    return (
      <span
        style={{
          backgroundColor: style.bg,
          color: style.color,
          border: style.border,
          padding: '0.35rem 0.85rem',
          borderRadius: '8px',
          fontSize: '0.82rem',
          fontWeight: '900',
          display: 'inline-block',
          letterSpacing: '0.3px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        }}
      >
        {categoryName}
      </span>
    );
  };

  // Cálculo del Rango de Fechas por Semana (Lunes a Domingo)
  const getWeekRange = (offset) => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const dayOfWeek = now.getDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMon + offset * 7);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const formatIso = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const formatShort = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    return {
      startDate: formatIso(monday),
      endDate: formatIso(sunday),
      displayText: `Semana del ${formatShort(monday)} al ${formatShort(sunday)}`,
    };
  };

  const weekRange = getWeekRange(weekOffset);
  const isEarliestWeek = weekRange.startDate <= '2026-09-28';

  const fetchNonContractExpenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/additional-expenses?startDate=${weekRange.startDate}&endDate=${weekRange.endDate}`);
      if (res.success) {
        // Filtrar estrictamente cualquier gasto con la categoría "Gasto de Contrato"
        const filtered = (res.expenses || []).filter(
          (exp) => !((exp.category || '').toUpperCase().includes('CONTRATO'))
        );
        setExpenses(filtered);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNonContractExpenses();
  }, [weekOffset]);

  // Lista de egresos procesada con Filtro de Categoría y Ordenamiento
  const processedExpenses = expenses
    .filter((exp) => {
      if (selectedCategory !== 'ALL' && exp.category !== selectedCategory) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortOrder === 'fecha_desc') return new Date(b.expense_date) - new Date(a.expense_date);
      if (sortOrder === 'fecha_asc') return new Date(a.expense_date) - new Date(b.expense_date);
      if (sortOrder === 'monto_desc') return (b.amount || 0) - (a.amount || 0);
      if (sortOrder === 'monto_asc') return (a.amount || 0) - (b.amount || 0);
      if (sortOrder === 'categoria_asc') return (a.category || '').localeCompare(b.category || '');
      return 0;
    });

  const totalFilteredAmount = processedExpenses.reduce((sum, item) => sum + (item.amount || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header Con Navegador por Semanas */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <ShoppingBag size={24} color="#f59e0b" />
            1. Gastos Adicionales de la Empresa (Egresos Generales)
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.25rem', margin: 0 }}>
            Visualización y control semanal de egresos <strong>exclusivamente adicionales</strong> (no asociados a contrato).
          </p>
        </div>

        {/* CONTROLES DE FILTRO POR SEMANA (Requerimiento 4) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              if (!isEarliestWeek) setWeekOffset((prev) => prev - 1);
            }}
            disabled={isEarliestWeek}
            className="btn btn-secondary btn-sm"
            style={{
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.55rem 0.85rem',
              opacity: isEarliestWeek ? 0.35 : 1,
              cursor: isEarliestWeek ? 'not-allowed' : 'pointer',
              filter: isEarliestWeek ? 'grayscale(1)' : 'none'
            }}
            title={isEarliestWeek ? 'Inicio oficial del sistema (Lunes 28/09)' : 'Ver semana anterior'}
          >
            <ChevronLeft size={18} /> Semana Anterior
          </button>

          <div
            style={{
              backgroundColor: '#0f172a',
              border: '2px solid #38bdf8',
              borderRadius: '10px',
              padding: '0.5rem 1rem',
              color: '#38bdf8',
              fontWeight: '900',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 2px 10px rgba(56, 189, 248, 0.2)',
            }}
          >
            <Calendar size={18} color="#38bdf8" />
            <span>{weekRange.displayText}</span>
            {weekOffset === 0 && (
              <span style={{ backgroundColor: '#0284c7', color: '#ffffff', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', marginLeft: '0.3rem' }}>
                ACTUAL
              </span>
            )}
          </div>

          <button
            onClick={() => setWeekOffset((prev) => prev + 1)}
            className="btn btn-secondary btn-sm"
            style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.55rem 0.85rem' }}
            title="Ver semana siguiente"
          >
            Semana Siguiente <ChevronRight size={18} />
          </button>

          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="btn btn-primary btn-sm"
              style={{ fontWeight: '800', padding: '0.55rem 0.85rem' }}
            >
              Ir a Semana Actual
            </button>
          )}
        </div>
      </div>

      {/* BARRA DE FILTROS SECUNDARIA: CATEGORÍAS & ORDENAMIENTO (Requerimientos 1, 2 y 3) */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', backgroundColor: '#0f172a' }}>
        
        {/* Filtro de Categoría (Sin Gasto de Contrato) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: '280px' }}>
          <Filter size={18} color="#a855f7" />
          <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#cbd5e1' }}>Filtrar por Categoría:</span>
          <select
            className="form-input"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ fontWeight: '800', backgroundColor: '#1e293b', borderColor: '#a855f7', color: '#f8fafc', flex: 1 }}
          >
            <option value="ALL">✨ TODAS LAS CATEGORÍAS (SIN GASTOS DE CONTRATO)</option>
            {nonContractCategories.map((cat) => (
              <option key={cat} value={cat}>
                📌 {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro de Ordenamiento */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: '280px' }}>
          <ArrowUpDown size={18} color="#38bdf8" />
          <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#cbd5e1' }}>Ordenar por:</span>
          <select
            className="form-input"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            style={{ fontWeight: '800', backgroundColor: '#1e293b', borderColor: '#38bdf8', color: '#f8fafc', flex: 1 }}
          >
            <option value="fecha_desc">📅 Fecha: Más Recientes Primero</option>
            <option value="fecha_asc">⏳ Fecha: Más Antiguos Primero</option>
            <option value="monto_desc">💰 Monto: Mayor a Menor</option>
            <option value="monto_asc">💸 Monto: Menor a Mayor</option>
            <option value="categoria_asc">🔤 Categoría: A - Z</option>
          </select>
        </div>
      </div>

      {/* Tarjeta Métricas de la Semana */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1e293b', borderLeft: '5px solid #f59e0b' }}>
        <div>
          <span style={{ fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' }}>
            Total Gastos Adicionales Filtrados ({weekRange.displayText})
          </span>
          <div style={{ fontSize: '2rem', fontWeight: '900', color: '#fbbf24', marginTop: '0.2rem' }}>
            {formatSoles(totalFilteredAmount)}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.9rem', color: '#cbd5e1' }}>
          Registros mostrados: <strong style={{ color: '#38bdf8', fontSize: '1.1rem' }}>{processedExpenses.length}</strong> de {expenses.length}
        </div>
      </div>

      {loading && <p style={{ color: '#94a3b8', textAlign: 'center', padding: '1.5rem' }}>Cargando gastos adicionales de la semana...</p>}
      {error && <p style={{ color: '#ef4444', textAlign: 'center' }}>{error}</p>}

      {/* Tabla Principal */}
      {!loading && !error && (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>FECHA</th>
                  <th>CATEGORÍA (COLOR ÚNICO)</th>
                  <th>DESCRIPCIÓN DEL GASTO</th>
                  <th>REGISTRADO POR</th>
                  <th>MONTO</th>
                  <th>TIPO DE EGRESO</th>
                </tr>
              </thead>
              <tbody>
                {processedExpenses.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: '#94a3b8', padding: '2.5rem' }}>
                      🚫 No hay gastos adicionales registrados en esta semana o con los criterios seleccionados.
                    </td>
                  </tr>
                ) : (
                  processedExpenses.map((exp) => (
                    <tr key={exp.id}>
                      <td style={{ fontWeight: '900', color: '#94a3b8' }}>#{exp.id}</td>
                      <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {new Date(exp.expense_date).toLocaleDateString('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        {getCategoryBadge(exp.category)}
                      </td>
                      <td style={{ fontWeight: '700', color: '#ffffff' }}>{exp.description}</td>
                      <td style={{ fontWeight: '600', color: '#cbd5e1' }}>{exp.registered_by_name || 'Vendedora Tienda'}</td>
                      <td>
                        <strong style={{ color: '#f87171', fontSize: '1.05rem', fontWeight: '900' }}>
                          {formatSoles(exp.amount || 0)}
                        </strong>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', color: '#38bdf8', backgroundColor: '#0f172a', border: '1px solid #1e293b', padding: '0.25rem 0.6rem', borderRadius: '6px', fontWeight: '700' }}>
                          Gasto Tienda / General
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

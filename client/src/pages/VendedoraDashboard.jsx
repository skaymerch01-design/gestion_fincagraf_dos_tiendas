import React, { useState, useEffect } from 'react';
import { Layers, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PlanillaIngresosEgresos from '../components/PlanillaIngresosEgresos';
import BalanceGlobalTab from '../tabs/BalanceGlobalTab';
import PendingObservationsBanner from '../components/PendingObservationsBanner';

export default function VendedoraDashboard() {
  const { user } = useAuth();
  const storeId = user?.store_id || 1;
  const [activeTab, setActiveTab] = useState(0); // 0 = Planilla Diaria, 1 = Balance Global

  useEffect(() => {
    const handleJump = (e) => {
      const { category } = e.detail || {};
      if (category === 'CONTRATO') {
        setActiveTab(1); // Balance Global
      } else {
        setActiveTab(0); // Planilla Diaria (EGRESO, INGRESO, BANCO)
      }
    };
    window.addEventListener('fincagraf_jump_to_item', handleJump);
    return () => window.removeEventListener('fincagraf_jump_to_item', handleJump);
  }, []);

  return (
    <div style={{ width: '95%', maxWidth: '1800px', margin: '0 auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Alerta Persistente de Observaciones Acumulables (No se borra hasta subsanar) */}
      <PendingObservationsBanner isAdmin={false} />

      {/* Indicador de Tienda Activa */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#0f172a',
        padding: '0.65rem 1.25rem',
        borderRadius: '12px',
        border: storeId === 2 ? '2px solid #a855f7' : '2px solid #22c55e',
        boxShadow: storeId === 2 ? '0 0 16px rgba(168, 85, 247, 0.25)' : '0 0 16px rgba(34, 197, 94, 0.25)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ fontSize: '1.35rem' }}>🏬</span>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: storeId === 2 ? '#c084fc' : '#4ade80', letterSpacing: '0.04em' }}>
              TIENDA {storeId} — PLANILLA OPERATIVA
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Sesión iniciada: <strong style={{ color: '#ffffff' }}>{user?.full_name || user?.username}</strong>
            </div>
          </div>
        </div>
        <div style={{
          backgroundColor: storeId === 2 ? 'rgba(168, 85, 247, 0.15)' : 'rgba(34, 197, 94, 0.15)',
          color: storeId === 2 ? '#d8b4fe' : '#86efac',
          border: storeId === 2 ? '1px solid #a855f7' : '1px solid #22c55e',
          padding: '0.35rem 0.85rem',
          borderRadius: '20px',
          fontSize: '0.78rem',
          fontWeight: '800'
        }}>
          ● Modo Vendedora (Tienda {storeId})
        </div>
      </div>

      {/* Vendedora Tabs Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        backgroundColor: '#0f172a',
        padding: '0.45rem',
        borderRadius: '12px',
        border: '1.5px solid #1e293b',
        boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
        width: 'fit-content'
      }}>
        <button
          onClick={() => setActiveTab(0)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.25rem',
            borderRadius: '9px',
            border: activeTab === 0 ? '1.5px solid #22c55e' : '1px solid transparent',
            backgroundColor: activeTab === 0 ? '#15803d' : 'transparent',
            color: activeTab === 0 ? '#ffffff' : '#94a3b8',
            fontWeight: '800',
            fontSize: '0.88rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: activeTab === 0 ? '0 4px 12px rgba(34, 197, 94, 0.35)' : 'none'
          }}
        >
          <FileSpreadsheet size={17} color={activeTab === 0 ? '#ffffff' : '#22c55e'} />
          Planilla Diaria de Ingresos y Egresos
        </button>

        <button
          onClick={() => setActiveTab(1)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.25rem',
            borderRadius: '9px',
            border: activeTab === 1 ? '1.5px solid #38bdf8' : '1px solid transparent',
            backgroundColor: activeTab === 1 ? '#0284c7' : 'transparent',
            color: activeTab === 1 ? '#ffffff' : '#94a3b8',
            fontWeight: '800',
            fontSize: '0.88rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: activeTab === 1 ? '0 4px 12px rgba(56, 189, 248, 0.35)' : 'none'
          }}
        >
          <Layers size={17} color={activeTab === 1 ? '#ffffff' : '#38bdf8'} />
          Balance Global (Solo Lectura)
        </button>
      </div>

      {/* Render Active Tab */}
      <div>
        {activeTab === 0 && <PlanillaIngresosEgresos key={storeId} storeId={storeId} readOnly={false} />}
        {activeTab === 1 && <BalanceGlobalTab storeId={storeId} readOnly={true} />}
      </div>
    </div>
  );
}

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

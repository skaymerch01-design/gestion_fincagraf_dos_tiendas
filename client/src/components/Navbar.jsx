import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, User, Shield, Sun, Moon } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(localStorage.getItem('fincagraf_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fincagraf_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <nav style={{
      backgroundColor: '#000000',
      borderBottom: '3px solid #22c55e',
      padding: '0.9rem 2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: '0 4px 25px rgba(0, 0, 0, 0.8)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <img
          src="/logo.png"
          alt="FINCAGRAF"
          style={{ height: '62px', objectFit: 'contain' }}
        />
        <div className="nav-sync-badge" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', backgroundColor: '#111827', padding: '0.35rem 0.85rem', borderRadius: '16px', border: '1px solid #1f2937' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block', boxShadow: '0 0 10px #22c55e' }}></span>
          <span style={{ fontSize: '0.78rem', color: '#84cc16', fontWeight: '800', letterSpacing: '0.04em' }}>PLANILLA EN VIVO</span>
        </div>
      </div>

      {/* Prominent Header Title Banner */}
      <div style={{ textAlign: 'center' }}>
        <h1 className="nav-title" style={{
          fontSize: '1.5rem',
          fontWeight: '900',
          color: '#ffffff',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          margin: 0,
          lineHeight: 1.1,
          textShadow: '0 2px 12px rgba(34, 197, 94, 0.4)'
        }}>
          PLANILLA DIARIA DE INGRESOS Y EGRESOS
        </h1>
        <div style={{ fontSize: '0.75rem', color: '#84cc16', fontWeight: '800', letterSpacing: '0.06em', marginTop: '2px' }}>
          FINCAGRAF — CONTROL Y GESTIÓN FINANCIERA EN TIEMPO REAL
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#111827',
              padding: '0.45rem 0.95rem',
              borderRadius: '20px',
              border: '1px solid #374151'
            }}>
              {user.role === 'administrador' ? (
                <Shield size={18} color="#38bdf8" />
              ) : (
                <User size={18} color="#84cc16" />
              )}
              <div style={{ textAlign: 'left', lineHeight: '1.2' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '800', color: '#ffffff' }}>
                  {user.full_name}
                </div>
                <div style={{ fontSize: '0.72rem', color: user.role === 'administrador' ? '#38bdf8' : (user.store_id === 2 ? '#c084fc' : '#84cc16'), textTransform: 'capitalize', fontWeight: '800' }}>
                  Rol: {user.role} {user.role !== 'administrador' ? `· 🏬 Tienda ${user.store_id || 1}` : '· Acceso Total'}
                </div>
              </div>
            </div>

            <button onClick={logout} className="btn btn-secondary btn-sm" title="Cerrar sesión" style={{ backgroundColor: '#1f2937', color: '#f3f4f6' }}>
              <LogOut size={16} />
              <span>Salir</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

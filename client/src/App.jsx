import React, { Component } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import VendedoraDashboard from './pages/VendedoraDashboard';
import AdminDashboard from './pages/AdminDashboard';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#ffffff', backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: '#ef4444', fontSize: '1.5rem', marginBottom: '1rem' }}>⚠️ Ocurrió un inconveniente temporal en la pantalla</h2>
          <p style={{ color: '#94a3b8', maxWidth: '500px', marginBottom: '1.5rem' }}>
            {this.state.error?.message || 'Error inesperado de ejecución.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🔄 Recargar Pantalla
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: '#38bdf8' }}>
        <h2>Cargando Gestión Fincagraf...</h2>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div>
      {user.role === 'administrador' ? <AdminDashboard /> : <VendedoraDashboard />}
    </div>
  );
}

function AppShell() {
  const { user } = useAuth();
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a' }}>
      {user && <Navbar />}
      <MainContent />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}

import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 280);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      title="Subir al inicio"
      aria-label="Subir al inicio"
      style={{
        position: 'fixed',
        bottom: '26px',
        right: '26px',
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        backgroundColor: '#0284c7',
        color: '#ffffff',
        border: '2px solid #38bdf8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 6px 22px rgba(2, 132, 199, 0.65)',
        cursor: 'pointer',
        zIndex: 99999,
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        padding: 0
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px) scale(1.08)';
        e.currentTarget.style.backgroundColor = '#0369a1';
        e.currentTarget.style.boxShadow = '0 10px 28px rgba(56, 189, 248, 0.8)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.backgroundColor = '#0284c7';
        e.currentTarget.style.boxShadow = '0 6px 22px rgba(2, 132, 199, 0.65)';
      }}
    >
      <ArrowUp size={24} strokeWidth={2.8} />
    </button>
  );
}

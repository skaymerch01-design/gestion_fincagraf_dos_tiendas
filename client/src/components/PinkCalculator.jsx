import React, { useState, useEffect } from 'react';
import { Calculator, X, Copy, Check, GripHorizontal } from 'lucide-react';

export default function PinkCalculator({ isOpen, onClose }) {
  const [currentInput, setCurrentInput] = useState('0');
  const [storedValue, setStoredValue] = useState(null);
  const [operator, setOperator] = useState(null);
  const [historyText, setHistoryText] = useState('');
  const [resetOnNext, setResetOnNext] = useState(false);
  const [copied, setCopied] = useState(false);

  // Drag State
  const [position, setPosition] = useState({ x: null, y: null });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const calculate = (a, b, op) => {
    try {
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '×': case '*': return a * b;
        case '÷': case '/': return b !== 0 ? a / b : 0;
        default: return b;
      }
    } catch {
      return b;
    }
  };

  const safeFormat = (val) => {
    if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return '0';
    const rounded = Math.round(val * 1000000) / 1000000;
    return String(rounded);
  };

  const handleDigit = (digit) => {
    if (resetOnNext) {
      setCurrentInput(String(digit));
      setResetOnNext(false);
    } else if (currentInput === '0') {
      setCurrentInput(String(digit));
    } else {
      setCurrentInput(currentInput + String(digit));
    }
  };

  const handleDecimal = () => {
    if (resetOnNext) {
      setCurrentInput('0.');
      setResetOnNext(false);
    } else if (!currentInput.includes('.')) {
      setCurrentInput(currentInput + '.');
    }
  };

  const handleOp = (opSymbol) => {
    const num = parseFloat(currentInput);
    if (isNaN(num)) return;

    if (storedValue !== null && operator && !resetOnNext) {
      const res = calculate(storedValue, num, operator);
      const formatted = safeFormat(res);
      setStoredValue(parseFloat(formatted));
      setCurrentInput(formatted);
      setHistoryText(`${formatted} ${opSymbol}`);
    } else {
      setStoredValue(num);
      setHistoryText(`${num} ${opSymbol}`);
    }
    setOperator(opSymbol);
    setResetOnNext(true);
  };

  const handleIgv = () => {
    const num = parseFloat(currentInput);
    if (isNaN(num)) return;
    const res = num * 1.18;
    const formatted = safeFormat(res);
    setHistoryText(`${num} + 18% IGV =`);
    setCurrentInput(formatted);
    setStoredValue(null);
    setOperator(null);
    setResetOnNext(true);
  };

  const handleEquals = () => {
    if (storedValue === null || !operator) return;
    const num = parseFloat(currentInput);
    if (isNaN(num)) return;

    const res = calculate(storedValue, num, operator);
    const formatted = safeFormat(res);
    setHistoryText(`${storedValue} ${operator} ${num} =`);
    setCurrentInput(formatted);
    setStoredValue(null);
    setOperator(null);
    setResetOnNext(true);
  };

  const handleClear = () => {
    setCurrentInput('0');
    setStoredValue(null);
    setOperator(null);
    setHistoryText('');
    setResetOnNext(false);
  };

  const handleDelete = () => {
    if (resetOnNext) return;
    if (currentInput && currentInput.length > 1) {
      setCurrentInput(currentInput.slice(0, -1));
    } else {
      setCurrentInput('0');
    }
  };

  const handlePercent = () => {
    const num = parseFloat(currentInput);
    if (!isNaN(num)) {
      setCurrentInput(safeFormat(num / 100));
    }
  };

  const handleCopy = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentInput);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = currentInput;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error al copiar:', err);
    }
  };

  // Keyboard Event Listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      try {
        const activeTag = document.activeElement?.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;

        if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
        else if (e.key === '.') handleDecimal();
        else if (e.key === '+') handleOp('+');
        else if (e.key === '-') handleOp('-');
        else if (e.key === '*') handleOp('×');
        else if (e.key === '/') { e.preventDefault(); handleOp('÷'); }
        else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); handleEquals(); }
        else if (e.key === 'Backspace') handleDelete();
        else if (e.key === 'Escape') {
          if (onClose) onClose();
        }
      } catch (err) {
        console.error('Key error:', err);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentInput, storedValue, operator, resetOnNext]);

  // Dragging mousemove/mouseup listener
  const handleMouseDownHeader = (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    setIsDragging(true);

    const calcElement = e.currentTarget.closest('[data-drag-container]');
    if (calcElement) {
      const rect = calcElement.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      const maxX = window.innerWidth - 340;
      const maxY = window.innerHeight - 520;
      const boundedX = Math.max(10, Math.min(newX, maxX));
      const boundedY = Math.max(10, Math.min(newY, maxY));

      setPosition({ x: boundedX, y: boundedY });
    };

    const handleMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  if (!isOpen) return null;

  const stylePosition = position.x !== null && position.y !== null
    ? { top: `${position.y}px`, left: `${position.x}px`, bottom: 'auto', right: 'auto' }
    : { bottom: '24px', right: '24px' };

  // Helper para efecto 3D táctil de presionado en botones
  const handlePressDown = (e) => {
    e.currentTarget.style.transform = 'translateY(2px)';
    e.currentTarget.style.borderBottomWidth = '1.5px';
  };
  const handlePressUp = (e) => {
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.borderBottomWidth = '4px';
  };

  return (
    <div
      data-drag-container
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        ...stylePosition,
        zIndex: 999999,
        userSelect: isDragging ? 'none' : 'auto'
      }}
    >
      <div style={{
        width: '335px',
        // Fondo en rosado pastel cremoso suave
        background: 'linear-gradient(160deg, #fff5f8 0%, #fce7f3 45%, #fbcfe8 100%)',
        borderRadius: '24px',
        padding: '1.25rem',
        border: '3px solid #f472b6',
        boxShadow: isDragging 
          ? '0 30px 60px rgba(219, 39, 119, 0.45), 0 0 35px rgba(244, 114, 182, 0.6)'
          : '0 20px 45px rgba(219, 39, 119, 0.3), 0 0 25px rgba(244, 114, 182, 0.35)',
        color: '#831843',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        transition: isDragging ? 'none' : 'box-shadow 0.2s ease'
      }}>
        
        {/* Header - Movible con Arrastre */}
        <div 
          onMouseDown={handleMouseDownHeader}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            marginBottom: '0.85rem',
            cursor: isDragging ? 'grabbing' : 'grab',
            padding: '0.2rem 0',
            borderBottom: '1.5px solid #f9a8d4',
            paddingBottom: '0.65rem'
          }}
          title="Mantén presionado para mover la calculadora"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#9d174d', fontWeight: '900', fontSize: '0.95rem', letterSpacing: '0.04em' }}>
            <GripHorizontal size={18} color="#be185d" style={{ opacity: 0.8 }} />
            <Calculator size={20} color="#db2777" />
            <span>CALCULADORA</span>
          </div>
          <button 
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (onClose) onClose(); }}
            className="btn-close-neon"
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Display Screen en blanco níveo pastel con profundidad interna */}
        <div style={{
          backgroundColor: '#ffffff',
          background: 'linear-gradient(180deg, #ffffff 0%, #fff1f5 100%)',
          borderRadius: '16px',
          padding: '0.85rem',
          textAlign: 'right',
          marginBottom: '0.85rem',
          border: '2px solid #f472b6',
          boxShadow: 'inset 0 3px 6px rgba(190, 24, 93, 0.08), 0 4px 12px rgba(244, 114, 182, 0.22)'
        }}>
          <div style={{ fontSize: '0.78rem', color: '#db2777', minHeight: '1.2rem', fontWeight: '800' }}>
            {historyText || ' '}
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: '900', color: '#831843', wordBreak: 'break-all', letterSpacing: '-0.02em' }}>
            {currentInput || '0'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.35rem' }}>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                background: 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)',
                border: 'none',
                color: '#ffffff',
                padding: '0.25rem 0.65rem',
                borderRadius: '8px',
                fontSize: '0.74rem',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                boxShadow: '0 2px 6px rgba(236, 72, 153, 0.35)'
              }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? '¡Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>

        {/* Botón Rápido +18% IGV con profundidad 3D */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleIgv(); }}
          onMouseDown={handlePressDown}
          onMouseUp={handlePressUp}
          style={{
            width: '100%',
            marginBottom: '0.75rem',
            background: 'linear-gradient(135deg, #f472b6 0%, #ec4899 50%, #db2777 100%)',
            color: '#ffffff',
            border: '1px solid #f9a8d4',
            borderBottom: '4px solid #9d174d',
            borderRadius: '14px',
            padding: '0.7rem',
            fontWeight: '900',
            fontSize: '0.92rem',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(219, 39, 119, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            letterSpacing: '0.03em',
            transition: 'all 0.1s ease'
          }}
          title="Calcular Total con 18% de IGV (Ej: 150 + 18% = 177.00)"
        >
          ✨ CALCULAR +18% IGV
        </button>

        {/* Keypad Grid en Rosado Pastel con Profundidad 3D Biselada */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.55rem' }}>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleClear(); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleSpecial} title="Limpiar (C)">C</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleSpecial} title="Borrar (⌫)">⌫</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePercent(); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleOperator}>%</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOp('÷'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleOperator}>÷</button>

          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDigit('7'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleNumber}>7</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDigit('8'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleNumber}>8</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDigit('9'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleNumber}>9</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOp('×'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleOperator}>×</button>

          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDigit('4'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleNumber}>4</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDigit('5'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleNumber}>5</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDigit('6'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleNumber}>6</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOp('-'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleOperator}>-</button>

          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDigit('1'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleNumber}>1</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDigit('2'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleNumber}>2</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDigit('3'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleNumber}>3</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOp('+'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleOperator}>+</button>

          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDigit('0'); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={{ ...btnStyleNumber, gridColumn: 'span 2' }}>0</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDecimal(); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleNumber}>.</button>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEquals(); }} onMouseDown={handlePressDown} onMouseUp={handlePressUp} style={btnStyleEquals}>=</button>
        </div>
      </div>
    </div>
  );
}

// Estilos de Botones con Bisel y Profundidad 3D en Rosado Pastel

const btnStyleNumber = {
  background: 'linear-gradient(180deg, #ffffff 0%, #fdf2f8 50%, #fce7f3 100%)',
  color: '#831843', // Contraste nítido sobre el botón pastel
  border: '1px solid #fbcfe8',
  borderBottom: '4px solid #f472b6', // Bisel 3D que le da relieve físico
  borderRadius: '14px',
  padding: '0.75rem 0',
  fontSize: '1.25rem',
  fontWeight: '900',
  cursor: 'pointer',
  transition: 'all 0.1s ease',
  boxShadow: '0 4px 8px rgba(219, 39, 119, 0.16), inset 0 1px 1px #ffffff'
};

const btnStyleOperator = {
  background: 'linear-gradient(180deg, #fbcfe8 0%, #f472b6 100%)',
  color: '#ffffff',
  border: '1px solid #f472b6',
  borderBottom: '4px solid #be185d', // Relieve 3D marcado
  borderRadius: '14px',
  padding: '0.75rem 0',
  fontSize: '1.3rem',
  fontWeight: '900',
  cursor: 'pointer',
  boxShadow: '0 4px 10px rgba(190, 24, 93, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.6)',
  transition: 'all 0.1s ease'
};

const btnStyleSpecial = {
  background: 'linear-gradient(180deg, #fff1f2 0%, #fecdd3 100%)',
  color: '#9f1239',
  border: '1px solid #fda4af',
  borderBottom: '4px solid #f43f5e', // Relieve 3D
  borderRadius: '14px',
  padding: '0.75rem 0',
  fontSize: '1.1rem',
  fontWeight: '900',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 8px rgba(244, 63, 94, 0.18), inset 0 1px 1px #ffffff',
  transition: 'all 0.1s ease'
};

const btnStyleEquals = {
  background: 'linear-gradient(180deg, #f472b6 0%, #ec4899 50%, #db2777 100%)',
  color: '#ffffff',
  border: '1px solid #ec4899',
  borderBottom: '4px solid #831843', // Relieve 3D de botón de acción
  borderRadius: '14px',
  padding: '0.75rem 0',
  fontSize: '1.4rem',
  fontWeight: '900',
  cursor: 'pointer',
  boxShadow: '0 5px 14px rgba(219, 39, 119, 0.38), inset 0 1px 1px rgba(255, 255, 255, 0.5)',
  transition: 'all 0.1s ease'
};

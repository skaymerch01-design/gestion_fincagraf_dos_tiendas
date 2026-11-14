import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';

/* ─── Animated Canvas Background ─────────────────────────────────────── */
function CorporateBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animId;
    let W, H;

    // Colores del logo FINCAGRAF: verde lima + gris metálico + azul oscuro
    const COLORS = ['#84cc16', '#a3e635', '#4ade80', '#94a3b8', '#64748b', '#38bdf8'];

    // Partículas flotantes
    const particles = [];
    const PARTICLE_COUNT = 55;

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Crear partículas (hexágonos, rombos y puntos)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 18 + 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: Math.random() * 0.18 + 0.04,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        type: Math.random() > 0.5 ? 'hex' : 'diamond',
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.008,
      });
    }

    // Líneas de conexión
    const drawHex = (x, y, r, rot) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + rot;
        const px = x + r * Math.cos(angle);
        const py = y + r * Math.sin(angle);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    const drawDiamond = (x, y, r, rot) => {
      ctx.beginPath();
      ctx.moveTo(x + r * Math.cos(rot), y + r * Math.sin(rot));
      ctx.lineTo(x + r * Math.cos(rot + Math.PI / 2), y + r * Math.sin(rot + Math.PI / 2));
      ctx.lineTo(x + r * Math.cos(rot + Math.PI), y + r * Math.sin(rot + Math.PI));
      ctx.lineTo(x + r * Math.cos(rot + (3 * Math.PI) / 2), y + r * Math.sin(rot + (3 * Math.PI) / 2));
      ctx.closePath();
    };

    const animate = () => {
      ctx.clearRect(0, 0, W, H);

      // Fondo degradado oscuro profundo
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#020b18');
      bg.addColorStop(0.45, '#060f1e');
      bg.addColorStop(1, '#040d0a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Luz ambiental verde (glow central sutil)
      const radial = ctx.createRadialGradient(W * 0.5, H * 0.5, 50, W * 0.5, H * 0.5, H * 0.75);
      radial.addColorStop(0, 'rgba(132,204,22,0.055)');
      radial.addColorStop(0.5, 'rgba(56,189,248,0.025)');
      radial.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, W, H);

      // Líneas de cuadrícula futuristas
      ctx.strokeStyle = 'rgba(132,204,22,0.045)';
      ctx.lineWidth = 0.6;
      const gridSize = 60;
      for (let gx = 0; gx < W; gx += gridSize) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let gy = 0; gy < H; gy += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      // Líneas de conexión entre partículas cercanas
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(132,204,22,${0.06 * (1 - dist / 140)})`;
            ctx.lineWidth = 0.7;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Dibujar partículas
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        if (p.x < -50) p.x = W + 50;
        if (p.x > W + 50) p.x = -50;
        if (p.y < -50) p.y = H + 50;
        if (p.y > H + 50) p.y = -50;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.2;
        ctx.fillStyle = p.color.replace(')', ',0.08)').replace('rgb', 'rgba');

        if (p.type === 'hex') {
          drawHex(p.x, p.y, p.r, p.rotation);
        } else {
          drawDiamond(p.x, p.y, p.r, p.rotation);
        }
        ctx.stroke();
        ctx.fill();
        ctx.restore();
      });

      animId = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        display: 'block',
      }}
    />
  );
}

/* ─── Login Page ──────────────────────────────────────────────────────── */
export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* Fondo animado */}
      <CorporateBackground />

      {/* Tarjeta glassmorphism */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        maxWidth: '420px',
        margin: '0 1.25rem',
        background: 'rgba(6, 15, 30, 0.82)',
        backdropFilter: 'blur(22px)',
        WebkitBackdropFilter: 'blur(22px)',
        border: '1px solid rgba(132,204,22,0.22)',
        borderRadius: '20px',
        padding: '2.5rem 2.25rem',
        boxShadow: '0 0 60px rgba(132,204,22,0.08), 0 25px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}>

        {/* Línea de acento verde superior */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '15%',
          right: '15%',
          height: '2px',
          background: 'linear-gradient(90deg, transparent, #84cc16, #a3e635, transparent)',
          borderRadius: '999px',
        }} />

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <img
            src="/logo.png"
            alt="FINCAGRAF"
            style={{
              height: '88px',
              width: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 18px rgba(132,204,22,0.35)) drop-shadow(0 4px 12px rgba(0,0,0,0.7))',
              marginBottom: '0.85rem',
            }}
          />
          <h1 style={{
            fontSize: '1.4rem',
            fontWeight: '900',
            color: '#f1f5f9',
            margin: 0,
            letterSpacing: '0.02em',
          }}>
            Gestión <span style={{ color: '#84cc16' }}>FINCAGRAF</span>
          </h1>
          <p style={{
            fontSize: '0.8rem',
            color: '#64748b',
            marginTop: '0.3rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: '600',
          }}>
            Control financiero empresarial
          </p>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '20px',
            padding: '0.25rem 0.75rem',
            marginTop: '0.5rem',
            fontSize: '0.74rem',
            color: '#38bdf8',
            fontWeight: '700'
          }}>
            🏬 Sistema Multitienda (Tienda 1 & Tienda 2)
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.4)',
            color: '#f87171',
            padding: '0.7rem 1rem',
            borderRadius: '10px',
            marginBottom: '1.25rem',
            fontSize: '0.85rem',
            fontWeight: '600',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} autoComplete="off">

          {/* Usuario */}
          <div style={{ marginBottom: '1.1rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.78rem',
              fontWeight: '700',
              color: '#94a3b8',
              marginBottom: '0.4rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>Usuario</label>
            <div style={{ position: 'relative' }}>
              <User size={16} color="#84cc16" style={{
                position: 'absolute', left: '0.85rem',
                top: '50%', transform: 'translateY(-50%)'
              }} />
              <input
                type="text"
                name="fincagraf_user"
                placeholder="Ingrese su usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.75rem 0.85rem 0.75rem 2.5rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(132,204,22,0.2)',
                  borderRadius: '10px',
                  color: '#f1f5f9',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'rgba(132,204,22,0.6)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(132,204,22,0.08)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'rgba(132,204,22,0.2)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          {/* Contraseña */}
          <div style={{ marginBottom: '1.75rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.78rem',
              fontWeight: '700',
              color: '#94a3b8',
              marginBottom: '0.4rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>Contraseña</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="#84cc16" style={{
                position: 'absolute', left: '0.85rem',
                top: '50%', transform: 'translateY(-50%)'
              }} />
              <input
                type={showPassword ? 'text' : 'password'}
                name="fincagraf_pass"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.75rem 2.75rem 0.75rem 2.5rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(132,204,22,0.2)',
                  borderRadius: '10px',
                  color: '#f1f5f9',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'rgba(132,204,22,0.6)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(132,204,22,0.08)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'rgba(132,204,22,0.2)';
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: '0.85rem',
                  top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: showPassword ? '#84cc16' : '#64748b',
                  display: 'flex', alignItems: 'center', padding: 0,
                }}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* Botón Ingresar */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.85rem',
              background: loading
                ? 'rgba(132,204,22,0.4)'
                : 'linear-gradient(135deg, #65a30d 0%, #84cc16 50%, #a3e635 100%)',
              color: '#052e16',
              border: 'none',
              borderRadius: '11px',
              fontWeight: '900',
              fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              letterSpacing: '0.04em',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(132,204,22,0.35)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              if (!loading) e.currentTarget.style.boxShadow = '0 6px 28px rgba(132,204,22,0.55)';
            }}
            onMouseLeave={e => {
              if (!loading) e.currentTarget.style.boxShadow = '0 4px 20px rgba(132,204,22,0.35)';
            }}
          >
            {loading ? 'Ingresando...' : (<>Ingresar al Sistema <ArrowRight size={18} /></>)}
          </button>
        </form>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          marginTop: '1.5rem',
          fontSize: '0.72rem',
          color: '#334155',
          letterSpacing: '0.05em',
        }}>
          © {new Date().getFullYear()} FINCAGRAF · Sistema de Gestión Financiera
        </p>
      </div>
    </div>
  );
}

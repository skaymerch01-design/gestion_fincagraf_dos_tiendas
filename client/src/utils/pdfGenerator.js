import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

const fmt = (num) => 'S/ ' + (parseFloat(num || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ==========================================
// 1. MOTOR GRÁFICO HD (HTML5 CANVAS 2D)
// ==========================================

function drawRoundedRect(ctx, x, y, w, h, r = 6) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [r, r, 0, 0]);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFullRoundedRect(ctx, x, y, w, h, r = 8) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Genera gráfico comparativo de barras verticales agrupadas en alta resolución
 */
function renderGroupedBarChart({
  title = '',
  subtitle = '',
  categories = [],
  series = [],
  width = 1200,
  height = 380,
  isCurrency = true,
  unit = 'S/'
}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Fondo oscuro ejecutivo
  ctx.fillStyle = '#0f172a';
  drawFullRoundedRect(ctx, 0, 0, width, height, 14);

  // Borde sutil
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, width - 3, height - 3, 14);
    ctx.stroke();
  }

  // Título
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(title, 36, 20);

  // Subtítulo
  if (subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(subtitle, 36, 48);
  }

  // Leyenda en esquina superior derecha
  let legendX = width - 36;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';

  for (let s = series.length - 1; s >= 0; s--) {
    const sItem = series[s];
    const textWidth = ctx.measureText(sItem.name).width;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(sItem.name, legendX, 35);

    legendX -= (textWidth + 18);
    ctx.fillStyle = sItem.color;
    drawFullRoundedRect(ctx, legendX, 28, 14, 14, 3);
    legendX -= 25;
  }

  // Escala Máxima
  let maxVal = 0;
  series.forEach(s => {
    (s.values || []).forEach(v => {
      const num = parseFloat(v) || 0;
      if (num > maxVal) maxVal = num;
    });
  });
  if (maxVal <= 0) maxVal = 100;

  const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const normalized = maxVal / magnitude;
  let niceMax;
  if (normalized <= 1.2) niceMax = 1.2 * magnitude;
  else if (normalized <= 2) niceMax = 2 * magnitude;
  else if (normalized <= 5) niceMax = 5 * magnitude;
  else niceMax = 10 * magnitude;

  // Dimensiones del área de trazado
  const plotLeft = 110;
  const plotRight = width - 36;
  const plotTop = 80;
  const plotBottom = height - 50;
  const plotHeight = plotBottom - plotTop;
  const plotWidth = plotRight - plotLeft;

  // Líneas de cuadrícula horizontal y etiquetas de eje Y
  const steps = 4;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = '600 12px system-ui, -apple-system, sans-serif';

  for (let i = 0; i <= steps; i++) {
    const yVal = (niceMax / steps) * i;
    const yPos = plotBottom - (i / steps) * plotHeight;

    ctx.strokeStyle = i === 0 ? '#475569' : '#1e293b';
    ctx.lineWidth = i === 0 ? 1.5 : 1;
    ctx.setLineDash(i === 0 ? [] : [5, 5]);

    ctx.beginPath();
    ctx.moveTo(plotLeft, yPos);
    ctx.lineTo(plotRight, yPos);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    const labelStr = isCurrency
      ? `S/ ${yVal >= 1000 ? (yVal / 1000).toFixed(1) + 'k' : yVal.toFixed(0)}`
      : yVal.toFixed(0);
    ctx.fillText(labelStr, plotLeft - 12, yPos);
  }
  ctx.setLineDash([]);

  // Trazado de Barras Agrupadas
  const groupCount = categories.length;
  if (groupCount === 0) return canvas.toDataURL('image/png');

  const groupWidth = plotWidth / groupCount;
  const barCount = series.length;
  const totalBarWidthRatio = 0.58;
  const barWidth = (groupWidth * totalBarWidthRatio) / barCount;
  const groupPadding = (groupWidth - (barWidth * barCount)) / 2;

  categories.forEach((cat, cIdx) => {
    const groupStartX = plotLeft + cIdx * groupWidth + groupPadding;

    // Etiqueta del Eje X (Categoría)
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(cat, plotLeft + cIdx * groupWidth + groupWidth / 2, plotBottom + 12);

    series.forEach((sItem, sIdx) => {
      const val = parseFloat((sItem.values || [])[cIdx]) || 0;
      const barH = (val / niceMax) * plotHeight;
      const barX = groupStartX + sIdx * barWidth;
      const barY = plotBottom - barH;

      if (barH > 0) {
        const grad = ctx.createLinearGradient(barX, barY, barX, plotBottom);
        const col1 = sItem.gradientColors ? sItem.gradientColors[0] : sItem.color;
        const col2 = sItem.gradientColors ? sItem.gradientColors[1] : sItem.color;
        grad.addColorStop(0, col1);
        grad.addColorStop(1, col2);

        ctx.fillStyle = grad;
        drawRoundedRect(ctx, barX + 2, barY, barWidth - 4, barH, 4);

        // Valor monetario arriba de la barra
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const formattedVal = val >= 1000
          ? (val / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k'
          : val.toFixed(0);
        ctx.fillText(`${unit} ${formattedVal}`, barX + barWidth / 2, barY - 4);
      }
    });
  });

  return canvas.toDataURL('image/png');
}

/**
 * Genera gráfico de 3 pilares ejecutivos (Tarjetas / Pilares visuales en Canvas)
 */
function renderThreePillarsChart({
  title = '',
  subtitle = '',
  pillars = [],
  width = 1200,
  height = 340
}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0f172a';
  drawFullRoundedRect(ctx, 0, 0, width, height, 14);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, width - 3, height - 3, 14);
    ctx.stroke();
  }

  // Título
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(title, 36, 20);

  if (subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(subtitle, 36, 48);
  }

  const pCount = pillars.length || 3;
  const gap = 24;
  const totalW = width - 72;
  const pWidth = (totalW - (gap * (pCount - 1))) / pCount;
  const pTop = 75;
  const pHeight = height - pTop - 25;

  pillars.forEach((p, idx) => {
    const pX = 36 + idx * (pWidth + gap);

    const grad = ctx.createLinearGradient(pX, pTop, pX, pTop + pHeight);
    grad.addColorStop(0, p.topGradient || 'rgba(2, 132, 199, 0.25)');
    grad.addColorStop(1, p.bottomGradient || 'rgba(15, 23, 42, 0.85)');
    ctx.fillStyle = grad;
    drawFullRoundedRect(ctx, pX, pTop, pWidth, pHeight, 10);

    ctx.strokeStyle = p.color || '#38bdf8';
    ctx.lineWidth = 2;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(pX, pTop, pWidth, pHeight, 10);
      ctx.stroke();
    }

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText((p.label || '').toUpperCase(), pX + pWidth / 2, pTop + 18);

    ctx.fillStyle = p.color || '#ffffff';
    ctx.font = '900 28px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.valueStr || 'S/ 0.00', pX + pWidth / 2, pTop + pHeight / 2 - 4);

    if (p.note) {
      const badgeH = 26;
      const badgeW = Math.min(pWidth - 30, 240);
      const bY = pTop + pHeight - 40;
      const bX = pX + pWidth / 2 - badgeW / 2;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      drawFullRoundedRect(ctx, bX, bY, badgeW, badgeH, 6);

      ctx.strokeStyle = p.color || '#38bdf8';
      ctx.lineWidth = 1;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(bX, bY, badgeW, badgeH, 6);
        ctx.stroke();
      }

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.note, pX + pWidth / 2, bY + badgeH / 2);
    }
  });

  return canvas.toDataURL('image/png');
}

/**
 * Genera gráfico de barras horizontales (Gastos por Categoría)
 */
function renderHorizontalBarChart({
  title = '',
  subtitle = '',
  items = [],
  width = 1200,
  height = 360
}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0f172a';
  drawFullRoundedRect(ctx, 0, 0, width, height, 14);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, width - 3, height - 3, 14);
    ctx.stroke();
  }

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(title, 36, 20);

  if (subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(subtitle, 36, 48);
  }

  const topY = 75;
  const bottomY = height - 25;
  const availableH = bottomY - topY;
  const displayItems = items.slice(0, 6);
  const rowCount = Math.max(displayItems.length, 1);
  const rowH = availableH / rowCount;
  const maxAmt = Math.max(...displayItems.map(it => it.amount || 0), 100);

  const labelW = 260;
  const barStart = labelW + 36;
  const barMaxW = width - barStart - 200;

  displayItems.forEach((it, idx) => {
    const yCenter = topY + idx * rowH + (rowH / 2);
    const barH = Math.min(22, rowH * 0.55);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.name, 36, yCenter);

    ctx.fillStyle = 'rgba(51, 65, 85, 0.4)';
    drawFullRoundedRect(ctx, barStart, yCenter - barH / 2, barMaxW, barH, 4);

    const fillW = Math.max(10, ((it.amount || 0) / maxAmt) * barMaxW);
    const grad = ctx.createLinearGradient(barStart, 0, barStart + fillW, 0);
    grad.addColorStop(0, it.color || '#ea580c');
    grad.addColorStop(1, it.colorLight || '#fb923c');
    ctx.fillStyle = grad;
    drawFullRoundedRect(ctx, barStart, yCenter - barH / 2, fillW, barH, 4);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const pctStr = it.percent !== undefined ? ` (${it.percent}%)` : '';
    ctx.fillText(`S/ ${(it.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${pctStr}`, barStart + fillW + 12, yCenter);
  });

  return canvas.toDataURL('image/png');
}

// ==========================================
// 2. ENCABEZADOS Y ELEMENTOS COMUNES EN PDF
// ==========================================

function addBrandHeader(doc, mainTitle, badgeText, badgeColor = [2, 132, 199]) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(0, 0, pageWidth, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('FINCAGRAF', 14, 10.5);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('CONTROL Y GESTIÓN FINANCIERA EJECUTIVA', 14, 16.5);

  // Badge en la derecha
  doc.setFillColor(...badgeColor);
  const badgeWidth = 96;
  doc.roundedRect(pageWidth - badgeWidth - 14, 4.5, badgeWidth, 13, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(badgeText, pageWidth - badgeWidth - 11, 12.5);
}

function addMetaBox(doc, y, periodTitle, adminName, estadoText = 'VERIFICADO Y AUDITADO') {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(248, 250, 252);
  doc.rect(14, y, pageWidth - 28, 13, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, y, pageWidth - 28, 13, 'S');

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`PERIODO AUDITADO: ${periodTitle}`, 18, y + 5);
  doc.text(`FECHA DE EMISIÓN: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`, 18, y + 9.5);

  doc.text(`AUDITOR RESPONSABLE: ${adminName}`, pageWidth - 95, y + 5);
  doc.text(`ESTADO: ${estadoText}`, pageWidth - 95, y + 9.5);
}

function addSectionTitle(doc, y, titleText, color = [2, 132, 199]) {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(titleText, 14, y);

  doc.setDrawColor(...color);
  doc.setLineWidth(0.8);
  doc.line(14, y + 2, 110, y + 2);
}

function addAuditorSignatures(doc, y, adminName = 'Administrador Principal') {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 45) {
    doc.addPage();
    y = 25;
  }

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);

  // Firma Administrador (Lado izquierdo)
  doc.line(25, y + 15, 85, y + 15);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('ADMINISTRADOR PRINCIPAL', 28, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Firma y Sello de Auditoría', 33, y + 24);

  // Firma Gerencia (Lado derecho)
  doc.line(pageWidth - 85, y + 15, pageWidth - 25, y + 15);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('GERENCIA GENERAL / JEFE', pageWidth - 80, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Conformidad y V°B° Gerencial', pageWidth - 76, y + 24);
}

function applyPageNumbers(doc, reportType = 'EJECUTIVO') {
  const totalPages = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(241, 245, 249);
    doc.rect(0, pageHeight - 9, pageWidth, 9, 'F');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    const subtitle = reportType === 'PLANILLA'
      ? 'FINCAGRAF — Control Financiero | Planilla Diaria de Ingresos y Egresos'
      : 'FINCAGRAF — Sistema Integrado de Control Financiero Auditor | Documento Confidencial Gerencial';
    doc.text(subtitle, 14, pageHeight - 3.5);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 28, pageHeight - 3.5);
  }
}

export function checkReportUnlockStatus(periodType, selectedYear, selectedMonth) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  if (periodType === 'weekly') {
    return { isUnlocked: true, unlockDateStr: '', isPreliminary: false };
  }

  if (periodType === 'monthly') {
    const isPast = (selectedYear < currentYear) || (selectedYear === currentYear && selectedMonth < currentMonth);
    const nextMonthIdx = (selectedMonth + 1) % 12;
    const nextMonthYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
    return {
      isUnlocked: true,
      isPreliminary: !isPast,
      unlockDateStr: isPast ? 'Cerrado y Auditado' : `Cierre Oficial: 01 de ${MONTH_NAMES[nextMonthIdx]} de ${nextMonthYear}`
    };
  }

  if (periodType === 'annual') {
    const isPastYear = selectedYear < currentYear;
    return {
      isUnlocked: true,
      isPreliminary: !isPastYear,
      unlockDateStr: isPastYear ? 'Año Concluido y Auditado' : `Cierre Oficial: 01 de ENERO de ${selectedYear + 1}`
    };
  }

  return { isUnlocked: true, unlockDateStr: '', isPreliminary: false };
}

// =========================================================================
// 3. GENERADOR REPORTE SEMANAL EXCLUSIVO: PLANILLA DIARIA (VERTICAL A4)
//    - Página 1: KPIs + Gráfico Métodos de Pago + Tabla Cuadre Métodos
//    - Página 2: Gráfico Diario + Tabla Cuadre Diario + Tabla Ranking
//    - Páginas 3+: Detalle Egresos + Detalle Ingresos + Firmas
// =========================================================================

export function buildWeeklyDailySheetPDF(doc, params) {
  const {
    periodTitle,
    adminName = 'Administrador / Auditor',
    dailyData,
    expensesData = []
  } = params;

  let currentY = 26;
  addBrandHeader(doc, 'REPORTE SEMANAL', 'PLANILLA DIARIA CONSOLIDADA', [2, 132, 199]);
  addMetaBox(doc, currentY, periodTitle, adminName);
  currentY += 16;

  const breakdown = dailyData?.breakdown || {
    EFECTIVO: { venta: 0, gasto: 0, diferencia: 0 },
    BCP: { venta: 0, gasto: 0, diferencia: 0 },
    YAPE: { venta: 0, gasto: 0, diferencia: 0 },
    POS: { venta: 0, gasto: 0, diferencia: 0 }
  };
  const totals = dailyData?.totals || { total_venta: 0, total_gasto: 0, total_ganancia: 0 };
  const initialCash = typeof dailyData?.initial_cash === 'number' ? dailyData.initial_cash : (parseFloat(dailyData?.initial_cash) || 0);
  const finalCash = typeof dailyData?.final_cash_in_hand === 'number' ? dailyData.final_cash_in_hand : (initialCash + (breakdown.EFECTIVO.venta - breakdown.EFECTIVO.gasto));

  // ================= PÁGINA 1: RESUMEN Y CUADRE POR MÉTODO DE PAGO =================
  // TARJETAS KPI
  autoTable(doc, {
    startY: currentY,
    head: [['TOTAL RECAUDADO (VENTAS)', 'TOTAL EGRESOS (GASTOS)', 'UTILIDAD NETA SEMANAL', 'SALDO EN EFECTIVO EN MANO']],
    body: [[
      fmt(totals.total_venta),
      fmt(totals.total_gasto),
      fmt(totals.total_ganancia),
      fmt(finalCash)
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 7.2 },
    bodyStyles: { fontStyle: 'bold', halign: 'center', fontSize: 9.5, textColor: [15, 23, 42] },
    columnStyles: {
      0: { textColor: [2, 132, 199] },
      1: { textColor: [234, 88, 12] },
      2: { textColor: totals.total_ganancia >= 0 ? [16, 185, 129] : [220, 38, 38] },
      3: { textColor: [16, 185, 129] }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 5;

  // GRÁFICO 1: COMPARATIVO POR MÉTODO DE PAGO
  addSectionTitle(doc, currentY, '1. COMPARATIVO POR CANAL Y MÉTODO DE PAGO (INGRESOS VS EGRESOS)', [2, 132, 199]);
  currentY += 5;

  const chartImgMethods = renderGroupedBarChart({
    title: 'INGRESOS VS EGRESOS POR MÉTODO DE PAGO',
    subtitle: 'Comparativo consolidado de ventas y gastos de la semana',
    categories: ['EFECTIVO', 'BCP', 'YAPE', 'POS'],
    series: [
      {
        name: 'Ventas / Ingresos',
        color: '#0284c7',
        gradientColors: ['#38bdf8', '#0284c7'],
        values: [breakdown.EFECTIVO.venta, breakdown.BCP.venta, breakdown.YAPE.venta, breakdown.POS.venta]
      },
      {
        name: 'Gastos / Egresos',
        color: '#ea580c',
        gradientColors: ['#fb923c', '#ea580c'],
        values: [breakdown.EFECTIVO.gasto, breakdown.BCP.gasto, breakdown.YAPE.gasto, breakdown.POS.gasto]
      }
    ],
    width: 1200,
    height: 380
  });

  doc.addImage(chartImgMethods, 'PNG', 14, currentY, 182, 56);
  currentY += 60;

  // TABLA 1: CUADRE POR MÉTODO DE PAGO (PLANILLA DIARIA)
  const efectivoDiferencia = breakdown.EFECTIVO.venta - breakdown.EFECTIVO.gasto;
  const bancarioVenta = breakdown.BCP.venta + breakdown.YAPE.venta + breakdown.POS.venta;
  const bancarioGasto = breakdown.BCP.gasto + breakdown.YAPE.gasto + breakdown.POS.gasto;
  const bancarioDiferencia = bancarioVenta - bancarioGasto;

  autoTable(doc, {
    startY: currentY,
    head: [['MÉTODO / CONCEPTO', 'VENTA (INGRESOS)', 'GASTO (EGRESOS)', 'DIFERENCIA / SALDO', 'TIPO']],
    body: [
      ['(+) CAJA DE INICIO (APERTURA LUNES)', fmt(initialCash), '-', fmt(initialCash), 'APERTURA'],
      ['EFECTIVO (MOVIMIENTOS DE LA SEMANA)', fmt(breakdown.EFECTIVO.venta), fmt(breakdown.EFECTIVO.gasto), fmt(efectivoDiferencia), 'FLUJO'],
      ['TOTAL DISPONIBLE EN CAJA FÍSICA', fmt(initialCash + breakdown.EFECTIVO.venta), fmt(breakdown.EFECTIVO.gasto), fmt(finalCash), 'CAJA EFECTIVO'],
      ['BCP (Banco de Crédito)', fmt(breakdown.BCP.venta), fmt(breakdown.BCP.gasto), fmt(breakdown.BCP.diferencia), 'BANCO'],
      ['YAPE (Billetera Digital)', fmt(breakdown.YAPE.venta), fmt(breakdown.YAPE.gasto), fmt(breakdown.YAPE.diferencia), 'DIGITAL'],
      ['POS / IZIPAY (Tarjetas)', fmt(breakdown.POS.venta), fmt(breakdown.POS.gasto), fmt(breakdown.POS.diferencia), 'TARJETAS'],
      ['SUBTOTAL PAGOS BANCARIOS Y DIGITALES', fmt(bancarioVenta), fmt(bancarioGasto), fmt(bancarioDiferencia), 'SUBTOTAL']
    ],
    foot: [['TOTAL GENERAL SEMANAL', fmt(totals.total_venta), fmt(totals.total_gasto), fmt(totals.total_ganancia), '100%']],
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    footStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'right', fontSize: 7.8 },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 70 },
      1: { halign: 'right', fontStyle: 'bold', textColor: [2, 132, 199], cellWidth: 28 },
      2: { halign: 'right', textColor: [234, 88, 12], cellWidth: 28 },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 30 },
      4: { halign: 'center', fontStyle: 'bold', cellWidth: 26 }
    },
    didParseCell: function (data) {
      if (data.section === 'body') {
        if (data.row.index === 2) {
          data.cell.styles.fillColor = [209, 250, 229];
          data.cell.styles.fontStyle = 'bold';
        } else if (data.row.index === 6) {
          data.cell.styles.fillColor = [224, 242, 254];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: 14, right: 14 }
  });

  // ================= PÁGINA 2: EVOLUCIÓN DIARIA Y RANKING DE VENDEDORAS =================
  doc.addPage();
  currentY = 16;

  addSectionTitle(doc, currentY, '2. EVOLUCIÓN Y CUADRE DIARIO DE LA SEMANA (LUNES A SÁBADO)', [16, 185, 129]);
  currentY += 5;

  const dailyBreakdown = dailyData?.daily_breakdown || [];
  const dayLabels = dailyBreakdown.length > 0
    ? dailyBreakdown.map(d => d.day_name)
    : ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const dayIncomes = dailyBreakdown.length > 0 ? dailyBreakdown.map(d => d.income) : [0, 0, 0, 0, 0, 0];
  const dayExpenses = dailyBreakdown.length > 0 ? dailyBreakdown.map(d => d.expense) : [0, 0, 0, 0, 0, 0];

  const chartImgDays = renderGroupedBarChart({
    title: 'INGRESOS Y EGRESOS DIARIOS (LUNES A SÁBADO)',
    subtitle: 'Flujo de caja registrado día por día durante la semana',
    categories: dayLabels,
    series: [
      {
        name: 'Ingresos del Día',
        color: '#10b981',
        gradientColors: ['#34d399', '#059669'],
        values: dayIncomes
      },
      {
        name: 'Egresos del Día',
        color: '#ea580c',
        gradientColors: ['#fb923c', '#ea580c'],
        values: dayExpenses
      }
    ],
    width: 1200,
    height: 380
  });

  doc.addImage(chartImgDays, 'PNG', 14, currentY, 182, 56);
  currentY += 60;

  // Tabla Cuadre Diario
  const dailyTableBody = dailyBreakdown.length > 0
    ? dailyBreakdown.map(d => [
        d.day_name,
        d.date_str,
        fmt(d.income),
        fmt(d.expense),
        fmt(d.balance),
        d.balance >= 0 ? 'SUPERÁVIT' : 'DÉFICIT'
      ])
    : [
        ['LUNES', '-', fmt(0), fmt(0), fmt(0), 'SIN MOV.'],
        ['MARTES', '-', fmt(0), fmt(0), fmt(0), 'SIN MOV.'],
        ['MIÉRCOLES', '-', fmt(0), fmt(0), fmt(0), 'SIN MOV.'],
        ['JUEVES', '-', fmt(0), fmt(0), fmt(0), 'SIN MOV.'],
        ['VIERNES', '-', fmt(0), fmt(0), fmt(0), 'SIN MOV.'],
        ['SÁBADO', '-', fmt(0), fmt(0), fmt(0), 'SIN MOV.']
      ];

  autoTable(doc, {
    startY: currentY,
    head: [['DÍA', 'FECHA', 'INGRESOS DEL DÍA', 'EGRESOS DEL DÍA', 'SALDO NETO', 'ESTADO']],
    body: dailyTableBody,
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 28 },
      1: { halign: 'center', cellWidth: 28 },
      2: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129], cellWidth: 34 },
      3: { halign: 'right', textColor: [234, 88, 12], cellWidth: 32 },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 34 },
      5: { halign: 'center', fontStyle: 'bold', cellWidth: 26 }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 5;

  // SECCIÓN 3: RANKING DE VENDEDORAS (SIN EMOJIS ROTOS)
  addSectionTitle(doc, currentY, '3. RENDIMIENTO Y RANKING DE VENDEDORAS DE LA SEMANA', [245, 158, 11]);
  currentY += 5;

  const sellersRanking = dailyData?.sellers_ranking || [];
  const rankingBody = sellersRanking.length > 0
    ? sellersRanking.map((s, idx) => [
        `${idx + 1}° Lugar - ${s.seller_name || s.vendedor_name || 'Vendedora'}`,
        `${s.contracts_count || 0} Contratos`,
        fmt(s.total_ventas || 0),
        fmt(s.total_recaudado || 0),
        s.total_ventas > 0 ? `${((s.total_recaudado / s.total_ventas) * 100).toFixed(1)}%` : '100%'
      ])
    : [['Sin registros de ventas en la semana', '0 Contratos', 'S/ 0.00', 'S/ 0.00', '0%']];

  autoTable(doc, {
    startY: currentY,
    head: [['VENDEDORA', 'CONTRATOS CERRADOS', 'TOTAL CONTRATADO', 'RECAUDADO A CUENTA', '% EFECTIVIDAD']],
    body: rankingBody,
    theme: 'striped',
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 34 },
      2: { halign: 'right', cellWidth: 36 },
      3: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129], cellWidth: 36 },
      4: { halign: 'center', fontStyle: 'bold', cellWidth: 26 }
    },
    margin: { left: 14, right: 14 }
  });

  // ================= PÁGINA 3+: DETALLE DE EGRESOS E INGRESOS (PLANILLA DIARIA) =================
  doc.addPage();
  currentY = 16;

  addSectionTitle(doc, currentY, '4. DETALLE COMPLETO DE EGRESOS DE PLANILLA DIARIA', [234, 88, 12]);
  currentY += 5;

  const weeklyExpenses = dailyData?.detailed_expenses || expensesData || [];
  const sumExpenses = weeklyExpenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);

  const expensesBody = weeklyExpenses.length > 0
    ? weeklyExpenses.map(e => [
        e.date_str || '-',
        e.category || e.expense_type || 'General',
        e.details || e.description || 'Gasto operativo',
        e.payment_type || 'EFECTIVO',
        fmt(e.amount)
      ])
    : [['-', 'Sin egresos', 'No se registraron egresos en la semana', '-', 'S/ 0.00']];

  autoTable(doc, {
    startY: currentY,
    head: [['FECHA', 'CATEGORÍA', 'DETALLE / DESCRIPCIÓN DEL GASTO', 'MEDIO', 'MONTO S/']],
    body: expensesBody,
    foot: [['', '', 'TOTAL EGRESOS SEMANALES:', '', fmt(sumExpenses)]],
    theme: 'striped',
    headStyles: { fillColor: [234, 88, 12], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    footStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'right', fontSize: 7.8 },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 36, fontStyle: 'bold' },
      2: { cellWidth: 76 },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 24, halign: 'right', fontStyle: 'bold', textColor: [234, 88, 12] }
    },
    margin: { left: 14, right: 14 }
  });

  // Espacio para la tabla de ingresos
  if (doc.lastAutoTable.finalY > 195) {
    doc.addPage();
    currentY = 16;
  } else {
    currentY = doc.lastAutoTable.finalY + 8;
  }

  addSectionTitle(doc, currentY, '5. DETALLE COMPLETO DE INGRESOS DE PLANILLA DIARIA', [2, 132, 199]);
  currentY += 5;

  const weeklyIncomes = dailyData?.detailed_incomes || [];
  const sumIncomesPaid = weeklyIncomes.reduce((acc, i) => acc + (parseFloat(i.amount_paid) || 0), 0);

  const incomesBody = weeklyIncomes.length > 0
    ? weeklyIncomes.map(inc => [
        inc.is_copy ? `${inc.contract_num || '-'}\n(COPIA)` : (inc.contract_num || '-'),
        inc.date_str || '-',
        inc.client_name || '-',
        inc.vendedor_name || 'Vendedora',
        (inc.details || 'Trabajo de Imprenta').substring(0, 40),
        fmt(inc.total_amount || inc.amount_paid),
        fmt(inc.amount_paid),
        inc.payment_type || 'EFECTIVO'
      ])
    : [['-', '-', 'Sin ingresos registrados en la planilla', '-', '-', 'S/ 0.00', 'S/ 0.00', '-']];

  autoTable(doc, {
    startY: currentY,
    head: [['N° CONT', 'FECHA', 'CLIENTE', 'VEND.', 'DETALLE DEL TRABAJO', 'TOTAL S/', 'COBRADO', 'MEDIO']],
    body: incomesBody,
    foot: [['', '', 'TOTAL RECAUDADO EN PLANILLA:', '', '', '', fmt(sumIncomesPaid), '']],
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    footStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'right', fontSize: 7.8 },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 38 },
      3: { cellWidth: 20, fontStyle: 'bold' },
      4: { cellWidth: 38 },
      5: { cellWidth: 16, halign: 'right' },
      6: { cellWidth: 18, halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] },
      7: { cellWidth: 16, halign: 'center' }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 10;
  addAuditorSignatures(doc, currentY, adminName);
}

export function generateWeeklyDailySheetPDF(params) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  buildWeeklyDailySheetPDF(doc, params);
  applyPageNumbers(doc, 'PLANILLA');

  let datePart = '';
  if (params.startDate && params.endDate) {
    datePart = `${params.startDate}_AL_${params.endDate}`;
  } else if (params.periodTitle) {
    const matches = params.periodTitle.match(/(\d{4}-\d{2}-\d{2}|\d{2}[-/]\d{2}[-/]\d{4})/g);
    if (matches && matches.length >= 2) {
      datePart = `${matches[0]}_AL_${matches[1]}`.replace(/\//g, '-');
    } else if (matches && matches.length === 1) {
      datePart = matches[0].replace(/\//g, '-');
    }
  }
  if (!datePart && params.dailyData?.week_start && params.dailyData?.week_end) {
    datePart = `${params.dailyData.week_start}_AL_${params.dailyData.week_end}`;
  }
  if (!datePart) {
    datePart = new Date().toISOString().split('T')[0];
  }

  const cleanFileName = `REPORTE_SEMANAL_PLANILLA_${datePart}.pdf`;
  doc.save(cleanFileName);
}

// =========================================================================
// 4. GENERADOR REPORTE EJECUTIVO SEMANAL (FORMATO HORIZONTAL / LANDSCAPE)
//    Detallado con las 4 pestañas gerenciales:
//    - ESTADO DE CUENTA
//    - BALANCE GLOBAL SEGÚN SU SEMANA
//    - FACTURAS COMPRAS / VENTAS CON SUS COMPRAS, VENTAS Y PAGO SUNAT
//    - PRÉSTAMOS PERSONALES
// =========================================================================

function buildWeeklyExecutivePDF(doc, params) {
  const {
    periodTitle,
    adminName = 'Administrador Principal',
    bankData = [],
    contractsData = [],
    sunatData = null,
    sunatInvoices = [],
    staffLoansData = []
  } = params;

  let currentY = 26;
  addBrandHeader(doc, 'REPORTE EJECUTIVO SEMANAL', 'REPORTE EJECUTIVO (ESTADO DE CUENTA, BALANCE, FACTURAS Y PRÉSTAMOS)', [2, 132, 199]);
  addMetaBox(doc, currentY, periodTitle, adminName);
  currentY += 16;

  // Totales rápidos para encabezado ejecutivo
  const validBank = (bankData || []).filter(b => !b.anulado);
  const bankIngresos = validBank.filter(b => b.transaction_type === 'INGRESO').reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);
  const bankEgresos = validBank.filter(b => b.transaction_type === 'EGRESO').reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);
  const bankDiferencia = bankIngresos - bankEgresos;

  const validContracts = (contractsData || []).filter(c => c.payment_status !== 'ANULADO' && c.order_status !== 'ANULADO');
  const totalContratado = validContracts.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);
  const totalRecaudado = validContracts.reduce((sum, c) => sum + (parseFloat(c.total_paid || c.amount_paid) || 0), 0);
  const totalSaldo = validContracts.reduce((sum, c) => sum + (parseFloat(c.balance_due) || 0), 0);
  const cobroRate = totalContratado > 0 ? ((totalRecaudado / totalContratado) * 100).toFixed(1) : 0;

  const salesInvoices = (sunatInvoices || []).filter(i => i.type === 'VENTA');
  const purchasesInvoices = (sunatInvoices || []).filter(i => i.type === 'COMPRA');
  const salesTotal = sunatData?.salesTotal ?? salesInvoices.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
  const purchasesTotal = sunatData?.purchasesTotal ?? purchasesInvoices.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
  const rentaAmount = sunatData?.rentaAmount ?? (Math.round((salesTotal * 0.015) * 100) / 100);
  const igvAmount = sunatData?.igvAmount ?? (Math.round((Math.max(0, salesTotal - purchasesTotal) * 0.04) * 100) / 100);
  const taxPagar = sunatData?.taxPagar ?? (Math.round((rentaAmount + igvAmount) * 100) / 100);

  const totalLoansPrestado = (staffLoansData || []).reduce((sum, l) => sum + (parseFloat(l.total_amount) || 0), 0);
  const totalLoansCobrado = (staffLoansData || []).reduce((sum, l) => sum + (parseFloat(l.amount_paid) || 0), 0);
  const totalLoansPendiente = (staffLoansData || []).reduce((sum, l) => sum + (parseFloat(l.balance_due) || 0), 0);

  // --- TARJETA RESUMEN EJECUTIVO DE LOS 4 PILARES ---
  autoTable(doc, {
    startY: currentY,
    head: [[
      '1. ESTADO DE CUENTA (BANCO)',
      '2. BALANCE GLOBAL (CONTRATOS)',
      '3. FACTURAS / PAGO SUNAT',
      '4. PRÉSTAMOS PERSONALES'
    ]],
    body: [[
      `Neto: ${fmt(bankDiferencia)}\n(Entradas: ${fmt(bankIngresos)} | Salidas: ${fmt(bankEgresos)})`,
      `Contratado: ${fmt(totalContratado)}\n(Cobrado: ${fmt(totalRecaudado)} | Saldo: ${fmt(totalSaldo)})`,
      `Impuesto a Pagar: ${fmt(taxPagar)}\n(Ventas: ${fmt(salesTotal)} | Compras: ${fmt(purchasesTotal)})`,
      `Saldo en Cartera: ${fmt(totalLoansPendiente)}\n(Prestado: ${fmt(totalLoansPrestado)} | Cobrado: ${fmt(totalLoansCobrado)})`
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 7.5 },
    bodyStyles: { fontStyle: 'bold', halign: 'center', fontSize: 8.5, textColor: [15, 23, 42] },
    columnStyles: {
      0: { textColor: bankDiferencia >= 0 ? [2, 132, 199] : [220, 38, 38] },
      1: { textColor: [16, 185, 129] },
      2: { textColor: [217, 119, 6] },
      3: { textColor: totalLoansPendiente > 0 ? [220, 38, 38] : [16, 185, 129] }
    },
    margin: { left: 14, right: 14 }
  });

  // ================= SECCIÓN 1: ESTADO DE CUENTA =================
  currentY = doc.lastAutoTable.finalY + 6;
  addSectionTitle(doc, currentY, '1. ESTADO DE CUENTA Y CONCILIACIÓN BANCARIA (BCP, YAPE, TRANSFERENCIAS)', [2, 132, 199]);
  currentY += 5;

  const bankTotalOps = (bankData || []).length;
  const bankVerificados = validBank.filter(b => b.reconciliation_status === 'VERIFICADO').length;
  const bankVerificadoPct = bankTotalOps > 0 ? ((bankVerificados / bankTotalOps) * 100).toFixed(1) : 100;

  autoTable(doc, {
    startY: currentY,
    head: [['TOTAL ENTRADAS BANCARIAS', 'TOTAL SALIDAS BANCARIAS', 'SALDO NETO BANCARIO', 'CONCILIACIONES AUDITADAS']],
    body: [[
      fmt(bankIngresos),
      fmt(bankEgresos),
      fmt(bankDiferencia),
      `${bankVerificados} de ${bankTotalOps} operaciones auditadas (${bankVerificadoPct}%)`
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 7.2 },
    bodyStyles: { fontStyle: 'bold', halign: 'center', fontSize: 9.5 },
    columnStyles: {
      0: { textColor: [16, 185, 129] },
      1: { textColor: [234, 88, 12] },
      2: { textColor: bankDiferencia >= 0 ? [2, 132, 199] : [220, 38, 38] },
      3: { textColor: [15, 23, 42] }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 4;

  const bankBody = (bankData && bankData.length > 0)
    ? bankData.map(b => [
        b.date ? String(b.date).substring(0, 10) : '-',
        b.bank_name || 'BCP',
        b.transaction_type || 'INGRESO',
        b.reference_number || '-',
        (b.details || 'Movimiento Bancario').substring(0, 75),
        fmt(b.amount),
        b.anulado ? 'ANULADO' : (b.reconciliation_status || 'VERIFICADO'),
        b.verified_by_name || 'Auditoría'
      ])
    : [['-', 'BCP / YAPE', '-', '-', 'Sin movimientos bancarios conciliados en esta semana', 'S/ 0.00', 'SIN MOV.', '-']];

  autoTable(doc, {
    startY: currentY,
    head: [['FECHA', 'BANCO / ENTIDAD', 'TIPO OPERACIÓN', 'REFERENCIA / N° OP', 'DETALLE / CONCEPTO DEL MOVIMIENTO', 'MONTO S/', 'ESTADO AUDITORÍA', 'AUDITOR']],
    body: bankBody,
    foot: [['TOTALES:', '', '', '', `Entradas: ${fmt(bankIngresos)} | Salidas: ${fmt(bankEgresos)}`, fmt(bankDiferencia), `${bankVerificados} Verificados`, '']],
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    footStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'right', fontSize: 7.8 },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 28, fontStyle: 'bold' },
      2: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 32 },
      4: { cellWidth: 85 },
      5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
      7: { cellWidth: 24, halign: 'center' }
    },
    didParseCell: function (data) {
      if (data.section === 'body') {
        if (data.column.index === 2) {
          if (data.cell.text[0] === 'INGRESO') {
            data.cell.styles.textColor = [16, 185, 129];
          } else {
            data.cell.styles.textColor = [234, 88, 12];
          }
        }
        if (data.column.index === 6) {
          if (data.cell.text[0] === 'VERIFICADO' || data.cell.text[0] === 'CONFORME') {
            data.cell.styles.fillColor = [209, 250, 229];
            data.cell.styles.textColor = [5, 150, 105];
          } else if (data.cell.text[0] === 'ANULADO') {
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [220, 38, 38];
          } else {
            data.cell.styles.fillColor = [254, 243, 199];
            data.cell.styles.textColor = [217, 119, 6];
          }
        }
      }
    },
    margin: { left: 14, right: 14 }
  });

  // ================= SECCIÓN 2: BALANCE GLOBAL DE LA SEMANA =================
  doc.addPage();
  currentY = 16;

  addSectionTitle(doc, currentY, '2. REPORTE SEMANAL DEL BALANCE GLOBAL (CONTRATOS Y PEDIDOS DE LA SEMANA)', [2, 132, 199]);
  currentY += 5;

  autoTable(doc, {
    startY: currentY,
    head: [['TOTAL CONTRATADO', 'TOTAL RECAUDADO / A CTA.', 'SALDO PENDIENTE DE COBRO', 'TASA DE COBRANZA', 'TOTAL CONTRATOS']],
    body: [[
      fmt(totalContratado),
      fmt(totalRecaudado),
      fmt(totalSaldo),
      `${cobroRate}%`,
      `${validContracts.length} pedidos válidos (${contractsData.length} en total)`
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 7.2 },
    bodyStyles: { fontStyle: 'bold', halign: 'center', fontSize: 9.5 },
    columnStyles: {
      0: { textColor: [2, 132, 199] },
      1: { textColor: [16, 185, 129] },
      2: { textColor: totalSaldo > 0 ? [217, 119, 6] : [100, 116, 139] },
      3: { textColor: [16, 185, 129] },
      4: { textColor: [15, 23, 42] }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 4;

  const sortedContracts = (contractsData && contractsData.length > 0)
    ? [...contractsData].sort((a, b) => {
        const numA = parseInt(String(a.contract_number || a.contract_code || a.id).replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.contract_number || b.contract_code || b.id).replace(/\D/g, ''), 10) || 0;
        if (numA !== numB) return numA - numB;
        return String(a.contract_number || a.contract_code || a.id).localeCompare(String(b.contract_number || b.contract_code || b.id));
      })
    : [];

  const contractsBody = (sortedContracts.length > 0)
    ? sortedContracts.map(c => [
        c.contract_number ? `#${c.contract_number}` : (c.id ? `#${c.id}` : '-'),
        c.contract_date ? String(c.contract_date).substring(0, 10) : '-',
        c.created_by_name || c.vendedor || '-',
        (c.client_name || c.client || '-').substring(0, 32),
        c.quantity != null ? String(c.quantity) : '-',
        (c.description || '-').substring(0, 48),
        fmt(c.total_amount),
        fmt(c.total_paid || c.amount_paid),
        fmt(c.balance_due),
        (c.order_status || 'PENDIENTE').substring(0, 18),
        (c.payment_status || 'PENDIENTE').substring(0, 18)
      ])
    : [['-', '-', '-', 'Sin contratos registrados en esta semana', '-', '-', fmt(0), fmt(0), fmt(0), '-', '-']];

  autoTable(doc, {
    startY: currentY,
    head: [['N° CONT.', 'FECHA', 'VEND.', 'CLIENTE', 'CANT.', 'DESCRIPCIÓN DEL PEDIDO', 'TOTAL S/', 'A CTA S/', 'SALDO S/', 'ESTADO PEDIDO', 'ESTADO PAGO']],
    body: contractsBody,
    foot: [['TOTALES:', '', '', `${contractsData.length} Pedidos`, '', '', fmt(totalContratado), fmt(totalRecaudado), fmt(totalSaldo), '', '']],
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    footStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'right', fontSize: 7.6 },
    bodyStyles: { fontSize: 6.8, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 20 },
      3: { cellWidth: 44, fontStyle: 'bold' },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 47 },
      6: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 24, halign: 'right', textColor: [16, 185, 129], fontStyle: 'bold' },
      8: { cellWidth: 24, halign: 'right', textColor: [217, 119, 6], fontStyle: 'bold' },
      9: { cellWidth: 20, halign: 'center', fontSize: 6.5 },
      10: { cellWidth: 16, halign: 'center', fontSize: 6.5, fontStyle: 'bold' }
    },
    didParseCell: function (data) {
      if (data.section === 'body') {
        const rawStatus = (data.row.raw[10] || '').toUpperCase();
        if (rawStatus.includes('CANCELADO')) {
          if (data.column.index === 10) {
            data.cell.styles.fillColor = [209, 250, 229];
            data.cell.styles.textColor = [5, 150, 105];
          }
        } else if (rawStatus.includes('ANULADO')) {
          data.cell.styles.fillColor = [254, 226, 226];
          data.cell.styles.textColor = [220, 38, 38];
        } else if (rawStatus.includes('PENDIENTE')) {
          if (data.column.index === 10) {
            data.cell.styles.fillColor = [254, 243, 199];
            data.cell.styles.textColor = [217, 119, 6];
          }
        }
      }
    },
    margin: { left: 14, right: 14 }
  });

  // ================= SECCIÓN 3: FACTURAS COMPRAS / VENTAS Y SUNAT =================
  doc.addPage();
  currentY = 16;

  addSectionTitle(doc, currentY, '3. FACTURAS COMPRAS / VENTAS Y LIQUIDACIÓN TRIBUTARIA - PAGO SUNAT', [16, 185, 129]);
  currentY += 5;

  const salesSubtotal = salesInvoices.reduce((sum, i) => sum + (parseFloat(i.subtotal) || 0), 0);
  const salesIgv = salesInvoices.reduce((sum, i) => sum + (parseFloat(i.igv) || 0), 0);
  const purchasesSubtotal = purchasesInvoices.reduce((sum, i) => sum + (parseFloat(i.subtotal) || 0), 0);
  const purchasesIgv = purchasesInvoices.reduce((sum, i) => sum + (parseFloat(i.igv) || 0), 0);

  autoTable(doc, {
    startY: currentY,
    head: [['TOTAL VENTAS FACTURADAS', 'COMPRAS FACTURADAS (CRÉDITO)', 'IMPUESTO A LA RENTA (1.5%)', 'IGV A DECLARAR (4.0%)', 'TOTAL IMPUESTO A PAGAR A SUNAT']],
    body: [[
      fmt(salesTotal),
      fmt(purchasesTotal),
      fmt(rentaAmount),
      fmt(igvAmount),
      fmt(taxPagar)
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 7.2 },
    bodyStyles: { fontStyle: 'bold', halign: 'center', fontSize: 9.5 },
    columnStyles: {
      0: { textColor: [2, 132, 199] },
      1: { textColor: [217, 119, 6] },
      2: { textColor: [15, 23, 42] },
      3: { textColor: [15, 23, 42] },
      4: { textColor: [220, 38, 38], fillColor: [254, 242, 242] }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 5;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(2, 132, 199);
  doc.text('3.1 DETALLE DE FACTURAS Y BOLETAS DE VENTA (INGRESOS FACTURADOS)', 14, currentY);
  currentY += 2;

  const salesBody = salesInvoices.length > 0
    ? salesInvoices.map(s => [
        s.issue_date ? String(s.issue_date).substring(0, 10) : '-',
        s.doc_type || 'FACTURA',
        s.doc_number || '-',
        s.ruc_dni || '-',
        (s.customer_supplier_name || '-').substring(0, 50),
        fmt(s.subtotal),
        fmt(s.igv),
        fmt(s.total)
      ])
    : [['-', 'FACTURA', '-', '-', 'Sin facturas de venta registradas en este periodo', fmt(0), fmt(0), fmt(0)]];

  autoTable(doc, {
    startY: currentY,
    head: [['FECHA', 'TIPO DOC.', 'N° COMPROBANTE', 'RUC / DNI', 'CLIENTE / RAZÓN SOCIAL', 'SUBTOTAL S/', 'IGV S/', 'TOTAL FACTURADO S/']],
    body: salesBody,
    foot: [['TOTAL VENTAS FACTURADAS:', '', '', '', `${salesInvoices.length} Comprobantes Emitidos`, fmt(salesSubtotal), fmt(salesIgv), fmt(salesTotal)]],
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    footStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'right', fontSize: 7.8 },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center' },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 32, fontStyle: 'bold' },
      3: { cellWidth: 30, halign: 'center' },
      4: { cellWidth: 79, fontStyle: 'bold' },
      5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 30, halign: 'right', fontStyle: 'bold', textColor: [2, 132, 199] }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 6;

  if (currentY > 155) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(234, 88, 12);
  doc.text('3.2 DETALLE DE FACTURAS DE COMPRAS Y GASTOS (CRÉDITO FISCAL DEDUCIBLE)', 14, currentY);
  currentY += 2;

  const purchasesBody = purchasesInvoices.length > 0
    ? purchasesInvoices.map(p => [
        p.issue_date ? String(p.issue_date).substring(0, 10) : '-',
        p.doc_type || 'FACTURA',
        p.doc_number || '-',
        p.ruc_dni || '-',
        (p.customer_supplier_name || '-').substring(0, 45),
        (p.notes || 'Gasto Operativo').substring(0, 30),
        fmt(p.subtotal),
        fmt(p.igv),
        fmt(p.total)
      ])
    : [['-', 'FACTURA', '-', '-', 'Sin facturas de compra registradas en este periodo', '-', fmt(0), fmt(0), fmt(0)]];

  autoTable(doc, {
    startY: currentY,
    head: [['FECHA', 'TIPO DOC.', 'N° COMPROBANTE', 'RUC PROVEEDOR', 'PROVEEDOR / RAZÓN SOCIAL', 'DETALLE / NOTAS', 'SUBTOTAL S/', 'IGV S/', 'TOTAL COMPRA S/']],
    body: purchasesBody,
    foot: [['TOTAL COMPRAS DEDUCIBLES:', '', '', '', `${purchasesInvoices.length} Comprobantes de Compra`, '', fmt(purchasesSubtotal), fmt(purchasesIgv), fmt(purchasesTotal)]],
    theme: 'grid',
    headStyles: { fillColor: [234, 88, 12], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    footStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'right', fontSize: 7.8 },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 30, fontStyle: 'bold' },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 65, fontStyle: 'bold' },
      5: { cellWidth: 32 },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 20, halign: 'right' },
      8: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: [234, 88, 12] }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 5;

  if (currentY > 165) {
    doc.addPage();
    currentY = 16;
  }

  autoTable(doc, {
    startY: currentY,
    head: [['CONCEPTO FISCAL SUNAT', 'BASE IMPONIBLE S/', 'TASA (%)', 'MONTO DETERMINADO S/', 'CONDICIÓN / ESTADO']],
    body: [
      ['Impuesto a la Renta Mensual (Régimen Especial)', fmt(salesTotal), '1.5%', fmt(rentaAmount), 'Pago a Cuenta Mensual'],
      ['Impuesto General a las Ventas (IGV Régimen)', fmt(Math.max(0, salesTotal - purchasesTotal)), '4.0%', fmt(igvAmount), salesTotal >= purchasesTotal ? 'Impuesto a Favor del Fisco' : 'Saldo a Favor del Contribuyente'],
      ['TOTAL TRIBUTOS A PAGAR A SUNAT', '-', '-', fmt(taxPagar), 'MONTO TOTAL A CANCELAR EN BANCO']
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 105 },
      1: { halign: 'right', cellWidth: 44 },
      2: { halign: 'center', cellWidth: 30 },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 40 },
      4: { halign: 'center', fontStyle: 'bold', cellWidth: 50 }
    },
    didParseCell: function (data) {
      if (data.section === 'body' && data.row.index === 2) {
        data.cell.styles.fillColor = [254, 226, 226];
        data.cell.styles.textColor = [220, 38, 38];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 14, right: 14 }
  });

  // ================= SECCIÓN 4: PRÉSTAMOS PERSONALES =================
  doc.addPage();
  currentY = 16;

  addSectionTitle(doc, currentY, '4. CONTROL DE PRÉSTAMOS PERSONALES AL PERSONAL Y DESCUENTOS', [245, 158, 11]);
  currentY += 5;

  autoTable(doc, {
    startY: currentY,
    head: [['TOTAL DESEMBOLSADO EN PRÉSTAMOS', 'TOTAL RECUPERADO / COBRADO', 'SALDO PENDIENTE POR RECUPERAR', 'PERSONAL CON PRÉSTAMOS ACTIVOS']],
    body: [[
      fmt(totalLoansPrestado),
      fmt(totalLoansCobrado),
      fmt(totalLoansPendiente),
      `${(staffLoansData || []).length} registros de préstamo auditados`
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 7.2 },
    bodyStyles: { fontStyle: 'bold', halign: 'center', fontSize: 9.5 },
    columnStyles: {
      0: { textColor: [2, 132, 199] },
      1: { textColor: [16, 185, 129] },
      2: { textColor: totalLoansPendiente > 0 ? [220, 38, 38] : [16, 185, 129] },
      3: { textColor: [15, 23, 42] }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 4;

  const loansBody = (staffLoansData && staffLoansData.length > 0)
    ? staffLoansData.map(l => [
        l.staff_name || '-',
        l.date_str ? String(l.date_str).substring(0, 10) : '-',
        (l.reason || 'Préstamo personal').substring(0, 55),
        fmt(l.total_amount),
        fmt(l.amount_paid),
        fmt(l.balance_due),
        (l.status || 'PENDIENTE').toUpperCase(),
        (l.notes || l.created_by_name || 'Autorizado por Administración').substring(0, 35)
      ])
    : [['-', '-', 'Sin préstamos al personal registrados en este periodo', fmt(0), fmt(0), fmt(0), 'SIN DEUDA', '-']];

  autoTable(doc, {
    startY: currentY,
    head: [['TRABAJADOR / PERSONAL', 'FECHA PRÉSTAMO', 'MOTIVO / CONCEPTO DEL PRÉSTAMO', 'MONTO PRESTADO S/', 'CUOTAS PAGADAS S/', 'SALDO PENDIENTE S/', 'ESTADO', 'OBSERVACIONES / AUTORIZADO']],
    body: loansBody,
    foot: [['TOTALES:', '', `${staffLoansData.length} Registros`, fmt(totalLoansPrestado), fmt(totalLoansCobrado), fmt(totalLoansPendiente), '', '']],
    theme: 'grid',
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    footStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'right', fontSize: 7.8 },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 26, halign: 'center' },
      2: { cellWidth: 65 },
      3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 28, halign: 'right', textColor: [16, 185, 129], fontStyle: 'bold' },
      5: { cellWidth: 28, halign: 'right', textColor: [220, 38, 38], fontStyle: 'bold' },
      6: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      7: { cellWidth: 32 }
    },
    didParseCell: function (data) {
      if (data.section === 'body' && data.column.index === 6) {
        if (data.cell.text[0] === 'PAGADO' || data.cell.text[0] === 'CANCELADO') {
          data.cell.styles.fillColor = [209, 250, 229];
          data.cell.styles.textColor = [5, 150, 105];
        } else {
          data.cell.styles.fillColor = [254, 243, 199];
          data.cell.styles.textColor = [217, 119, 6];
        }
      }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 10;
  addAuditorSignatures(doc, currentY, adminName);
}

// ==========================================
// 5. GENERADOR REPORTE MENSUAL (SOLO GRÁFICOS Y NÚMEROS TOTALES)
// ==========================================

function buildMonthlyExecutivePDF(doc, params) {
  const {
    periodTitle,
    adminName,
    contractsData = [],
    expensesData = [],
    sunatData = null,
    staffLoansData = [],
    scheduleData = []
  } = params;

  let currentY = 26;
  addBrandHeader(doc, 'REPORTE MENSUAL', 'REPORTE MENSUAL FINANCIERO (SOLO GRÁFICOS Y TOTALES)', [16, 185, 129]);
  addMetaBox(doc, currentY, periodTitle, adminName);
  currentY += 16;

  const validContracts = contractsData.filter(c => c.payment_status !== 'ANULADO' && c.order_status !== 'ANULADO');
  const totalFacturado = validContracts.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);
  const totalCobrado = validContracts.reduce((sum, c) => sum + (parseFloat(c.total_paid) || 0), 0);
  const totalPendiente = validContracts.reduce((sum, c) => sum + (parseFloat(c.balance_due) || 0), 0);
  const cobroRate = totalFacturado > 0 ? ((totalCobrado / totalFacturado) * 100).toFixed(1) : 0;
  const totalEgresosMes = expensesData.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const utilidadOperativaMes = totalCobrado - totalEgresosMes;

  // --- KPI CARDS MES ---
  autoTable(doc, {
    startY: currentY,
    head: [['FACTURADO TOTAL', 'RECAUDADO EFECTIVO', 'SALDO POR COBRAR', 'EGRESOS OPERATIVOS', 'UTILIDAD DEL MES']],
    body: [[
      fmt(totalFacturado),
      fmt(totalCobrado),
      fmt(totalPendiente),
      fmt(totalEgresosMes),
      fmt(utilidadOperativaMes)
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 7.2 },
    bodyStyles: { fontStyle: 'bold', halign: 'center', fontSize: 9 },
    columnStyles: {
      0: { textColor: [2, 132, 199] },
      1: { textColor: [16, 185, 129] },
      2: { textColor: [245, 158, 11] },
      3: { textColor: [234, 88, 12] },
      4: { textColor: utilidadOperativaMes >= 0 ? [16, 185, 129] : [220, 38, 38] }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 5;

  // GRÁFICO 1: 3 PILARES MES
  addSectionTitle(doc, currentY, '1. BALANCE GENERAL DE VENTAS Y COBRANZAS DEL MES', [2, 132, 199]);
  currentY += 5;

  const chartImgPillars = renderThreePillarsChart({
    title: 'BALANCE CONSOLIDADO DE VENTAS Y CARTERA DEL MES',
    subtitle: `Total Contratos: ${contractsData.length} | Tasa de Cobro: ${cobroRate}%`,
    pillars: [
      {
        label: '1. Facturado Total',
        valueStr: fmt(totalFacturado),
        note: `${validContracts.length} Pedidos Válidos`,
        color: '#38bdf8',
        topGradient: 'rgba(2, 132, 199, 0.4)',
        bottomGradient: 'rgba(15, 23, 42, 0.9)'
      },
      {
        label: '2. Recaudado a Cuenta',
        valueStr: fmt(totalCobrado),
        note: `Cobranza Efectiva (${cobroRate}%)`,
        color: '#34d399',
        topGradient: 'rgba(16, 185, 129, 0.4)',
        bottomGradient: 'rgba(15, 23, 42, 0.9)'
      },
      {
        label: '3. Saldo por Cobrar',
        valueStr: fmt(totalPendiente),
        note: totalPendiente > 0 ? 'Cartera Pendiente' : '100% Cobrado',
        color: totalPendiente > 0 ? '#fbbf24' : '#94a3b8',
        topGradient: 'rgba(245, 158, 11, 0.4)',
        bottomGradient: 'rgba(15, 23, 42, 0.9)'
      }
    ],
    width: 1200,
    height: 330
  });

  doc.addImage(chartImgPillars, 'PNG', 14, currentY, 182, 52);
  currentY += 56;

  // GRÁFICO 2: GASTOS POR CATEGORÍA
  addSectionTitle(doc, currentY, '2. DISTRIBUCIÓN DE EGRESOS Y COSTOS OPERATIVOS POR CATEGORÍA', [245, 158, 11]);
  currentY += 5;

  const categoryMap = {};
  expensesData.forEach(e => {
    const cat = e.category || 'General';
    const amt = parseFloat(e.amount) || 0;
    if (!categoryMap[cat]) categoryMap[cat] = { count: 0, amount: 0 };
    categoryMap[cat].count += 1;
    categoryMap[cat].amount += amt;
  });

  const catColors = ['#0284c7', '#ea580c', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  const catItems = Object.keys(categoryMap)
    .map((cName, idx) => ({
      name: cName,
      amount: categoryMap[cName].amount,
      percent: totalEgresosMes > 0 ? ((categoryMap[cName].amount / totalEgresosMes) * 100).toFixed(1) : 0,
      color: catColors[idx % catColors.length]
    }))
    .sort((a, b) => b.amount - a.amount);

  const chartImgCategories = renderHorizontalBarChart({
    title: 'DISTRIBUCIÓN DE GASTOS OPERATIVOS POR CATEGORÍA',
    subtitle: `Total gastos del mes: ${fmt(totalEgresosMes)} (${expensesData.length} comprobantes)`,
    items: catItems,
    width: 1200,
    height: 360
  });

  doc.addImage(chartImgCategories, 'PNG', 14, currentY, 182, 54);

  // ================= PÁGINA 2: FISCAL SUNAT + BALANCE TOTALES =================
  doc.addPage();
  currentY = 16;

  addSectionTitle(doc, currentY, '3. LIQUIDACIÓN FISCAL SUNAT Y RESULTADOS TRIBUTARIOS DEL MES', [16, 185, 129]);
  currentY += 5;

  const salesTotal = sunatData?.salesTotal || 0;
  const purchasesTotal = sunatData?.purchasesTotal || 0;
  const rentaAmount = sunatData?.rentaAmount || Math.round((salesTotal * 0.015) * 100) / 100;
  const igvAmount = sunatData?.igvAmount || Math.round((Math.max(0, salesTotal - purchasesTotal) * 0.04) * 100) / 100;
  const taxPagar = sunatData?.taxPagar || Math.round((rentaAmount + igvAmount) * 100) / 100;

  const chartImgSunat = renderThreePillarsChart({
    title: 'INDICADORES FISCALES DECLARADOS A SUNAT (RESUMEN EJECUTIVO)',
    subtitle: 'Ventas con Factura vs Compras Deducibles e Impuesto Total a Pagar',
    pillars: [
      {
        label: 'Ventas Declaradas',
        valueStr: fmt(salesTotal),
        note: `Régimen Especial`,
        color: '#38bdf8',
        topGradient: 'rgba(2, 132, 199, 0.4)',
        bottomGradient: 'rgba(15, 23, 42, 0.9)'
      },
      {
        label: 'Compras con Factura',
        valueStr: fmt(purchasesTotal),
        note: `Crédito Fiscal Deducible`,
        color: '#fbbf24',
        topGradient: 'rgba(245, 158, 11, 0.4)',
        bottomGradient: 'rgba(15, 23, 42, 0.9)'
      },
      {
        label: 'Total Impuesto a Pagar',
        valueStr: fmt(taxPagar),
        note: `Renta (1.5%) + IGV (4.0%)`,
        color: '#f87171',
        topGradient: 'rgba(220, 38, 38, 0.4)',
        bottomGradient: 'rgba(15, 23, 42, 0.9)'
      }
    ],
    width: 1200,
    height: 330
  });

  doc.addImage(chartImgSunat, 'PNG', 14, currentY, 182, 52);
  currentY += 56;

  // SÍNTESIS DE BALANCE GENERAL CONSOLIDADO
  addSectionTitle(doc, currentY, '4. GRAN BALANCE GENERAL CONSOLIDADO DEL MES (NÚMEROS TOTALES)', [2, 132, 199]);
  currentY += 5;

  const totalLoansPrestado = staffLoansData.reduce((sum, l) => sum + (parseFloat(l.total_amount) || 0), 0);
  const totalLoansRecuperado = staffLoansData.reduce((sum, l) => sum + (parseFloat(l.amount_paid) || 0), 0);
  const totalLoansPendiente = staffLoansData.reduce((sum, l) => sum + (parseFloat(l.balance_due) || 0), 0);

  const totalScheduleAmount = scheduleData.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const totalSchedulePaid = scheduleData.filter(s => s.status === 'PAGADO').reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

  autoTable(doc, {
    startY: currentY,
    head: [['RUBRO FINANCIERO DEL MES', 'MONTO TOTAL S/', 'OBSERVACIONES AUDITORAS / ESTADO']],
    body: [
      ['1. Facturación Total de Pedidos y Contratos', fmt(totalFacturado), `${validContracts.length} contratos emitidos en el mes`],
      ['2. Cobranza Efectiva Recaudada', fmt(totalCobrado), `Efectividad de cobranza: ${cobroRate}%`],
      ['3. Saldo Total Pendiente por Cobrar en Cartera', fmt(totalPendiente), 'Cartera comercial pendiente de liquidación'],
      ['4. Total Egresos y Costos Operativos del Mes', fmt(totalEgresosMes), `${expensesData.length} transacciones de egreso registradas`],
      ['5. UTILIDAD OPERATIVA NETA DEL MES', fmt(utilidadOperativaMes), utilidadOperativaMes >= 0 ? 'Resultado Financiero Positivo (Superávit)' : 'Déficit Financiero Operativo'],
      ['6. Impuesto Consolidado a Pagar a SUNAT', fmt(taxPagar), 'Renta Régimen Especial (1.5%) + IGV Régimen (4.0%)'],
      ['7. Préstamos al Personal (Saldo en Cartera)', fmt(totalLoansPendiente), `Prestado: ${fmt(totalLoansPrestado)} | Recuperado: ${fmt(totalLoansRecuperado)}`],
      ['8. Cronograma de Pagos y Servicios Programados', fmt(totalScheduleAmount), `Pagado: ${fmt(totalSchedulePaid)} | Pendiente: ${fmt(totalScheduleAmount - totalSchedulePaid)}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 75 },
      1: { halign: 'right', fontStyle: 'bold', cellWidth: 32 },
      2: { cellWidth: 75 }
    },
    didParseCell: function (data) {
      if (data.section === 'body') {
        if (data.row.index === 4) {
          data.cell.styles.fillColor = utilidadOperativaMes >= 0 ? [209, 250, 229] : [254, 226, 226];
          data.cell.styles.textColor = utilidadOperativaMes >= 0 ? [5, 150, 105] : [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 10;
  addAuditorSignatures(doc, currentY, adminName);
}

// ==========================================
// 5. GENERADOR REPORTE ANUAL (SOLO GRÁFICOS Y NÚMEROS TOTALES)
// ==========================================

function buildAnnualExecutivePDF(doc, params) {
  const {
    periodTitle,
    selectedYear,
    adminName,
    contractsData = [],
    contractsAnnualReport = null,
    expensesData = [],
    sunatStats = null,
    staffLoansData = []
  } = params;

  let currentY = 26;
  addBrandHeader(doc, 'REPORTE ANUAL', 'REPORTE ANUAL EJECUTIVO (SOLO GRÁFICOS Y TOTALES)', [217, 119, 6]);
  addMetaBox(doc, currentY, periodTitle, adminName, 'CONSOLIDADO ANUAL DEFINITIVO');
  currentY += 16;

  const monthlyBreakdown = contractsAnnualReport?.monthlyBreakdown || [];
  const annualSummary = contractsAnnualReport?.annualSummary || {
    total_contracts: contractsData.length,
    total_amount: contractsData.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0),
    total_collected: contractsData.reduce((sum, c) => sum + (parseFloat(c.total_paid) || 0), 0),
    total_pending: contractsData.reduce((sum, c) => sum + (parseFloat(c.balance_due) || 0), 0),
    payment_rate: 0
  };

  const totalFacturadoAnual = annualSummary.total_amount || 0;
  const totalCobradoAnual = annualSummary.total_collected || 0;
  const totalPendienteAnual = annualSummary.total_pending || 0;
  const totalContratosAnual = annualSummary.total_contracts || 0;
  const cobroRateAnual = totalFacturadoAnual > 0 ? ((totalCobradoAnual / totalFacturadoAnual) * 100).toFixed(1) : 0;
  const totalEgresosAnual = expensesData.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const utilidadNetaAnual = totalCobradoAnual - totalEgresosAnual;

  // --- KPI CARDS ANUALES ---
  autoTable(doc, {
    startY: currentY,
    head: [['FACTURACIÓN ANUAL', 'RECAUDACIÓN EFECTIVA', 'SALDO TOTAL POR COBRAR', 'TOTAL CONTRATOS', 'UTILIDAD NETA ANUAL']],
    body: [[
      fmt(totalFacturadoAnual),
      fmt(totalCobradoAnual),
      fmt(totalPendienteAnual),
      `${totalContratosAnual} (${cobroRateAnual}%)`,
      fmt(utilidadNetaAnual)
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 7.2 },
    bodyStyles: { fontStyle: 'bold', halign: 'center', fontSize: 9 },
    columnStyles: {
      0: { textColor: [2, 132, 199] },
      1: { textColor: [16, 185, 129] },
      2: { textColor: [245, 158, 11] },
      3: { textColor: [168, 85, 247] },
      4: { textColor: utilidadNetaAnual >= 0 ? [16, 185, 129] : [220, 38, 38] }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 5;

  // GRÁFICO 1: EVOLUCIÓN MENSUAL ANUAL (12 MESES)
  addSectionTitle(doc, currentY, '1. EVOLUCIÓN MENSUAL ANUAL CONSOLIDADA (ENERO A DICIEMBRE)', [2, 132, 199]);
  currentY += 5;

  const shortMonths = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC'];
  const monthFacturados = shortMonths.map((_, idx) => (monthlyBreakdown[idx]?.total_amount || 0));
  const monthCobrados = shortMonths.map((_, idx) => (monthlyBreakdown[idx]?.total_collected || 0));

  const chartImgAnnual = renderGroupedBarChart({
    title: `EVOLUCIÓN MENSUAL DE VENTAS Y COBRANZAS (${selectedYear})`,
    subtitle: 'Comparativo de monto facturado vs recaudación mes a mes',
    categories: shortMonths,
    series: [
      {
        name: 'Facturado (S/)',
        color: '#0284c7',
        gradientColors: ['#38bdf8', '#0284c7'],
        values: monthFacturados
      },
      {
        name: 'Recaudado (S/)',
        color: '#10b981',
        gradientColors: ['#34d399', '#059669'],
        values: monthCobrados
      }
    ],
    width: 1200,
    height: 380
  });

  doc.addImage(chartImgAnnual, 'PNG', 14, currentY, 182, 56);
  currentY += 60;

  // TABLA SÍNTESIS DE 12 MESES
  const annualTableBody = shortMonths.map((mShort, idx) => {
    const item = monthlyBreakdown[idx] || {};
    const tf = item.total_amount || 0;
    const tc = item.total_collected || 0;
    const tp = item.total_pending || 0;
    return [
      MONTH_NAMES[idx],
      `${item.total_contracts || 0}`,
      fmt(tf),
      fmt(tc),
      fmt(tp),
      tf > 0 ? `${((tc / tf) * 100).toFixed(1)}%` : '0%'
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['MES DEL AÑO', 'N° CONT.', 'FACTURADO TOTAL', 'RECAUDADO A CUENTA', 'SALDO PENDIENTE', '% COBRO']],
    body: annualTableBody,
    foot: [['TOTAL ANUAL CONSOLIDADO', `${totalContratosAnual}`, fmt(totalFacturadoAnual), fmt(totalCobradoAnual), fmt(totalPendienteAnual), `${cobroRateAnual}%`]],
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    footStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'right', fontSize: 7.5 },
    bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 42 },
      1: { halign: 'center', cellWidth: 24 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129], cellWidth: 30 },
      4: { halign: 'right', fontStyle: 'bold', textColor: [245, 158, 11], cellWidth: 30 },
      5: { halign: 'center', fontStyle: 'bold', cellWidth: 26 }
    },
    margin: { left: 14, right: 14 }
  });

  // ================= PÁGINA 2: GRAN BALANCE ANUAL + GASTOS =================
  doc.addPage();
  currentY = 16;

  addSectionTitle(doc, currentY, '2. GRAN BALANCE FINANCIERO ANUAL (INGRESOS VS EGRESOS VS UTILIDAD NETA)', [16, 185, 129]);
  currentY += 5;

  const chartImgPillarsAnnual = renderThreePillarsChart({
    title: 'GRAN BALANCE FINANCIERO ANUAL CONSOLIDADO',
    subtitle: `Ingresos recaudados vs Egresos anuales y Utilidad Neta Resultante`,
    pillars: [
      {
        label: '1. Ingresos Recaudados',
        valueStr: fmt(totalCobradoAnual),
        note: `Cobranza efectiva del año`,
        color: '#34d399',
        topGradient: 'rgba(16, 185, 129, 0.4)',
        bottomGradient: 'rgba(15, 23, 42, 0.9)'
      },
      {
        label: '2. Egresos Operativos',
        valueStr: fmt(totalEgresosAnual),
        note: `${expensesData.length} Comprobantes`,
        color: '#fb923c',
        topGradient: 'rgba(234, 88, 12, 0.4)',
        bottomGradient: 'rgba(15, 23, 42, 0.9)'
      },
      {
        label: '3. Utilidad Neta Anual',
        valueStr: fmt(utilidadNetaAnual),
        note: utilidadNetaAnual >= 0 ? 'Rendimiento Positivo' : 'Déficit Anual',
        color: utilidadNetaAnual >= 0 ? '#38bdf8' : '#f87171',
        topGradient: utilidadNetaAnual >= 0 ? 'rgba(2, 132, 199, 0.4)' : 'rgba(220, 38, 38, 0.4)',
        bottomGradient: 'rgba(15, 23, 42, 0.9)'
      }
    ],
    width: 1200,
    height: 330
  });

  doc.addImage(chartImgPillarsAnnual, 'PNG', 14, currentY, 182, 52);
  currentY += 56;

  // GASTOS ANUALES POR CATEGORÍA
  addSectionTitle(doc, currentY, '3. CONSOLIDADO ANUAL DE EGRESOS Y GASTOS POR CATEGORÍA', [245, 158, 11]);
  currentY += 5;

  const annualCatMap = {};
  expensesData.forEach(e => {
    const cat = e.category || 'General';
    const amt = parseFloat(e.amount) || 0;
    if (!annualCatMap[cat]) annualCatMap[cat] = { count: 0, amount: 0 };
    annualCatMap[cat].count += 1;
    annualCatMap[cat].amount += amt;
  });

  const catColors = ['#0284c7', '#ea580c', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  const annualCatItems = Object.keys(annualCatMap)
    .map((cName, idx) => ({
      name: cName,
      count: annualCatMap[cName].count,
      amount: annualCatMap[cName].amount,
      percent: totalEgresosAnual > 0 ? ((annualCatMap[cName].amount / totalEgresosAnual) * 100).toFixed(1) : 0,
      color: catColors[idx % catColors.length]
    }))
    .sort((a, b) => b.amount - a.amount);

  const chartImgCatAnnual = renderHorizontalBarChart({
    title: 'DISTRIBUCIÓN ANUAL DE GASTOS Y COSTOS OPERATIVOS',
    subtitle: `Total gastos anuales: ${fmt(totalEgresosAnual)} (${expensesData.length} registros)`,
    items: annualCatItems,
    width: 1200,
    height: 360
  });

  doc.addImage(chartImgCatAnnual, 'PNG', 14, currentY, 182, 54);
  currentY += 58;

  // SÍNTESIS FINANCIERA ANUAL CONSOLIDADA
  const sunatMonthlyData = sunatStats?.monthlyData || [];
  let sunatVentasAnual = 0;
  let sunatComprasAnual = 0;
  let sunatRentaAnual = 0;
  let sunatIgvAnual = 0;

  sunatMonthlyData.forEach(m => {
    const v = parseFloat(m.sales_total) || 0;
    const c = parseFloat(m.purchases_total) || 0;
    sunatVentasAnual += v;
    sunatComprasAnual += c;
    sunatRentaAnual += Math.round((v * 0.015) * 100) / 100;
    sunatIgvAnual += Math.round((Math.max(0, v - c) * 0.04) * 100) / 100;
  });
  const sunatImpuestosAnual = sunatRentaAnual + sunatIgvAnual;

  const totalLoansPrestado = staffLoansData.reduce((sum, l) => sum + (parseFloat(l.total_amount) || 0), 0);
  const totalLoansCobrado = staffLoansData.reduce((sum, l) => sum + (parseFloat(l.amount_paid) || 0), 0);
  const totalLoansPendiente = staffLoansData.reduce((sum, l) => sum + (parseFloat(l.balance_due) || 0), 0);

  autoTable(doc, {
    startY: currentY,
    head: [['RUBRO FINANCIERO ANUAL CONSOLIDADO', 'MONTO TOTAL S/', 'OBSERVACIONES AUDITORAS / ESTADO']],
    body: [
      ['1. Total Facturado Anual de Pedidos', fmt(totalFacturadoAnual), `${totalContratosAnual} contratos emitidos en el año`],
      ['2. Total Recaudación Efectiva Cobrada', fmt(totalCobradoAnual), `Tasa de cobranza anual: ${cobroRateAnual}%`],
      ['3. Saldo Total Pendiente por Cobrar en Cartera', fmt(totalPendienteAnual), 'Cartera comercial pendiente de liquidación'],
      ['4. Total Egresos Operativos del Ejercicio', fmt(totalEgresosAnual), `${expensesData.length} operaciones de gasto auditadas`],
      ['5. UTILIDAD NETA DEL EJERCICIO ANUAL', fmt(utilidadNetaAnual), utilidadNetaAnual >= 0 ? 'Ejercicio Comercial con Superávit' : 'Ejercicio Comercial con Déficit'],
      ['6. Total Impuestos Pagados a SUNAT en el Año', fmt(sunatImpuestosAnual), `Renta: ${fmt(sunatRentaAnual)} | IGV: ${fmt(sunatIgvAnual)}`],
      ['7. Préstamos al Personal (Saldo por Recuperar)', fmt(totalLoansPendiente), `Desembolsado: ${fmt(totalLoansPrestado)} | Recuperado: ${fmt(totalLoansCobrado)}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 7.2 },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 75 },
      1: { halign: 'right', fontStyle: 'bold', cellWidth: 32 },
      2: { cellWidth: 75 }
    },
    didParseCell: function (data) {
      if (data.section === 'body' && data.row.index === 4) {
        data.cell.styles.fillColor = utilidadNetaAnual >= 0 ? [209, 250, 229] : [254, 226, 226];
        data.cell.styles.textColor = utilidadNetaAnual >= 0 ? [5, 150, 105] : [220, 38, 38];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 10;
  addAuditorSignatures(doc, currentY, adminName);
}

// ==========================================
// 6. FUNCIÓN PRINCIPAL EXPORTADA
// ==========================================

export function generateExecutivePDF(params) {
  const { periodType = 'weekly' } = params;

  if (periodType === 'weekly') {
    // REPORTE EJECUTIVO SEMANAL: FORMATO HORIZONTAL OBLIGATORIO (LANDSCAPE A4: 297mm x 210mm)
    // Con detalle completo de: Estado de Cuenta, Balance Global, Facturas Compras/Ventas y Pago SUNAT, y Préstamos Personales
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    buildWeeklyExecutivePDF(doc, params);
    applyPageNumbers(doc, 'EJECUTIVO');

    let datePart = '';
    if (params.startDate && params.endDate) {
      datePart = `${params.startDate}_AL_${params.endDate}`;
    } else if (params.periodTitle) {
      const matches = params.periodTitle.match(/(\d{4}-\d{2}-\d{2}|\d{2}[-/]\d{2}[-/]\d{4})/g);
      if (matches && matches.length >= 2) {
        datePart = `${matches[0]}_AL_${matches[1]}`.replace(/\//g, '-');
      } else if (matches && matches.length === 1) {
        datePart = matches[0].replace(/\//g, '-');
      }
    }
    if (!datePart) datePart = new Date().toISOString().split('T')[0];

    const cleanFileName = `REPORTE_EJECUTIVO_SEMANAL_${datePart}.pdf`;
    doc.save(cleanFileName);
    return;
  }

  // Para reportes Mensual y Anual (Visual solo gráficos en Vertical A4)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  if (periodType === 'monthly') {
    buildMonthlyExecutivePDF(doc, params);
  } else if (periodType === 'annual') {
    buildAnnualExecutivePDF(doc, params);
  } else {
    buildMonthlyExecutivePDF(doc, params);
  }

  applyPageNumbers(doc, 'EJECUTIVO');

  let periodPart = '';
  if (params.periodTitle) {
    periodPart = params.periodTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
  } else {
    periodPart = new Date().toISOString().split('T')[0];
  }
  const cleanFileName = `REPORTE_EJECUTIVO_${periodType.toUpperCase()}_${periodPart}.pdf`;
  doc.save(cleanFileName);
}

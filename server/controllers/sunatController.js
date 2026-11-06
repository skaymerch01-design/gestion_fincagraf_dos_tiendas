const { dbAll, dbRun, dbGet } = require('../config/db');

exports.getSunatInvoices = async (req, res) => {
  try {
    const { period, type, doc_type } = req.query;
    let sql = `SELECT * FROM sunat_invoices WHERE 1=1`;
    const params = [];

    if (period) {
      sql += ` AND period = ?`;
      params.push(period);
    }

    if (type) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    if (doc_type) {
      sql += ` AND doc_type = ?`;
      params.push(doc_type);
    }

    sql += ` ORDER BY issue_date DESC`;

    const invoices = await dbAll(sql, params);

    return res.json({ success: true, invoices });
  } catch (err) {
    console.error('Error fetching SUNAT invoices:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener comprobantes SUNAT.' });
  }
};

exports.createSunatInvoice = async (req, res) => {
  try {
    const { period, type, doc_type, doc_number, issue_date, customer_supplier_name, ruc_dni, subtotal, igv, total, notes } = req.body;

    if (!type || !doc_type || !doc_number || !issue_date || !customer_supplier_name || !total) {
      return res.status(400).json({ success: false, error: 'Complete los campos obligatorios del comprobante.' });
    }

    const numTotal = parseFloat(total);
    if (isNaN(numTotal) || numTotal <= 0) {
      return res.status(400).json({ success: false, error: 'Monto total inválido.' });
    }

    // Auto-calculate subtotal and IGV (18% Peru standard) if omitted
    let numSubtotal = parseFloat(subtotal);
    let numIgv = parseFloat(igv);

    if (isNaN(numSubtotal) || isNaN(numIgv)) {
      numSubtotal = Math.round((numTotal / 1.18) * 100) / 100;
      numIgv = Math.round((numTotal - numSubtotal) * 100) / 100;
    }

    // Default period YYYY-MM if omitted, accepts invoices from previous months assigned to current active accounting period
    const cleanIssueDate = issue_date ? issue_date.substring(0, 10) : '';
    const targetPeriod = period || cleanIssueDate.substring(0, 7);

    const result = await dbRun(
      `INSERT INTO sunat_invoices (period, type, doc_type, doc_number, issue_date, customer_supplier_name, ruc_dni, subtotal, igv, total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        targetPeriod,
        type,
        doc_type,
        doc_number.trim(),
        cleanIssueDate,
        customer_supplier_name.trim(),
        ruc_dni ? ruc_dni.trim() : null,
        numSubtotal,
        numIgv,
        numTotal,
        notes || null,
      ]
    );

    const created = await dbGet(`SELECT * FROM sunat_invoices WHERE id = ?`, [result.id]);

    return res.status(201).json({
      success: true,
      message: 'Comprobante SUNAT registrado correctamente.',
      invoice: created,
    });
  } catch (err) {
    console.error('Error creating SUNAT invoice:', err);
    return res.status(500).json({ success: false, error: 'Error al registrar comprobante SUNAT.' });
  }
};

exports.getSunatMonthlyStats = async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = year || new Date().getFullYear().toString();

    const monthlyData = await dbAll(
      `SELECT period,
              SUM(CASE WHEN type = 'VENTA' THEN total ELSE 0 END) as sales_total,
              SUM(CASE WHEN type = 'VENTA' THEN igv ELSE 0 END) as sales_igv,
              SUM(CASE WHEN type = 'COMPRA' THEN total ELSE 0 END) as purchases_total,
              SUM(CASE WHEN type = 'COMPRA' THEN igv ELSE 0 END) as purchases_igv
       FROM sunat_invoices
       WHERE period LIKE ?
       GROUP BY period
       ORDER BY period ASC`,
      [`${targetYear}-%`]
    );

    // Totals for the selected year
    const yearlyTotals = monthlyData.reduce(
      (acc, item) => {
        acc.total_sales += item.sales_total;
        acc.total_sales_igv += item.sales_igv;
        acc.total_purchases += item.purchases_total;
        acc.total_purchases_igv += item.purchases_igv;
        acc.net_igv += item.sales_igv - item.purchases_igv;
        return acc;
      },
      {
        total_sales: 0,
        total_sales_igv: 0,
        total_purchases: 0,
        total_purchases_igv: 0,
        net_igv: 0,
      }
    );

    return res.json({
      success: true,
      year: targetYear,
      yearlyTotals,
      monthlyData,
    });
  } catch (err) {
    console.error('Error fetching SUNAT monthly stats:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener reportes mensuales de SUNAT.' });
  }
};

exports.updateSunatInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { doc_number, issue_date, customer_supplier_name, ruc_dni, total, notes, doc_type, type, period } = req.body;

    const existing = await dbGet(`SELECT * FROM sunat_invoices WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Comprobante no encontrado.' });
    }

    const numTotal = total !== undefined ? parseFloat(total) : existing.total;
    const numSubtotal = Math.round((numTotal / 1.18) * 100) / 100;
    const numIgv = Math.round((numTotal - numSubtotal) * 100) / 100;
    const cleanIssueDate = issue_date ? issue_date.substring(0, 10) : (existing.issue_date ? existing.issue_date.substring(0, 10) : '');
    const targetPeriod = period || existing.period || (cleanIssueDate ? cleanIssueDate.substring(0, 7) : null);

    await dbRun(
      `UPDATE sunat_invoices
       SET period = ?,
           type = COALESCE(?, type),
           doc_type = COALESCE(?, doc_type),
           doc_number = COALESCE(?, doc_number),
           issue_date = COALESCE(?, issue_date),
           customer_supplier_name = COALESCE(?, customer_supplier_name),
           ruc_dni = COALESCE(?, ruc_dni),
           subtotal = ?,
           igv = ?,
           total = ?,
           notes = COALESCE(?, notes)
       WHERE id = ?`,
      [
        targetPeriod,
        type || existing.type,
        doc_type || existing.doc_type,
        doc_number ? doc_number.trim() : existing.doc_number,
        cleanIssueDate,
        customer_supplier_name ? customer_supplier_name.trim() : existing.customer_supplier_name,
        ruc_dni !== undefined ? (ruc_dni ? ruc_dni.trim() : null) : existing.ruc_dni,
        numSubtotal,
        numIgv,
        numTotal,
        notes !== undefined ? notes : existing.notes,
        id
      ]
    );

    const updated = await dbGet(`SELECT * FROM sunat_invoices WHERE id = ?`, [id]);
    return res.json({ success: true, message: 'Comprobante actualizado correctamente.', invoice: updated });
  } catch (err) {
    console.error('Error updating SUNAT invoice:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar comprobante.' });
  }
};

exports.deleteSunatInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun(`DELETE FROM sunat_invoices WHERE id = ?`, [id]);
    return res.json({ success: true, message: 'Comprobante SUNAT eliminado.' });
  } catch (err) {
    console.error('Error deleting SUNAT invoice:', err);
    return res.status(500).json({ success: false, error: 'Error al eliminar comprobante.' });
  }
};

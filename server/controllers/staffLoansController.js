const { dbRun, dbGet, dbAll } = require('../config/db');

exports.getStaffLoans = async (req, res) => {
  try {
    const { status, search, year, month } = req.query;
    let sql = `SELECT l.*, u.full_name as created_by_name FROM staff_loans l LEFT JOIN users u ON l.created_by = u.id WHERE 1=1`;
    const params = [];

    if (status) {
      sql += ` AND l.status = ?`;
      params.push(status);
    }

    if (year) {
      if (month !== undefined && month !== null && month !== '') {
        const monthStr = String(parseInt(month) + 1).padStart(2, '0');
        sql += ` AND l.date_str LIKE ?`;
        params.push(`${year}-${monthStr}-%`);
      } else {
        sql += ` AND l.date_str LIKE ?`;
        params.push(`${year}-%`);
      }
    }

    if (search && search.trim() !== '') {
      sql += ` AND (l.staff_name LIKE ? OR l.notes LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    sql += ` ORDER BY l.id DESC`;

    const loans = await dbAll(sql, params);

    return res.json({ success: true, loans });
  } catch (err) {
    console.error('Error fetching staff loans:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener préstamos al personal.' });
  }
};

exports.getStaffLoanById = async (req, res) => {
  try {
    const { id } = req.params;
    const loan = await dbGet(`SELECT * FROM staff_loans WHERE id = ?`, [id]);
    if (!loan) {
      return res.status(404).json({ success: false, error: 'Préstamo no encontrado.' });
    }

    const payments = await dbAll(
      `SELECT p.*, u.full_name as registered_by_name 
       FROM staff_loan_payments p 
       LEFT JOIN users u ON p.registered_by = u.id 
       WHERE p.loan_id = ? 
       ORDER BY p.id DESC`,
      [id]
    );

    return res.json({ success: true, loan, payments });
  } catch (err) {
    console.error('Error fetching staff loan detail:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener detalle del préstamo.' });
  }
};

exports.createStaffLoan = async (req, res) => {
  try {
    const { date_str, staff_name, total_amount, weekly_discount, notes, expense_entry_id } = req.body;

    if (!staff_name || !staff_name.trim()) {
      return res.status(400).json({ success: false, error: 'Ingrese el nombre del colaborador.' });
    }

    const numTotal = parseFloat(total_amount);
    if (isNaN(numTotal) || numTotal <= 0) {
      return res.status(400).json({ success: false, error: 'Ingrese un monto prestado válido mayor a 0.' });
    }

    const numWeekly = parseFloat(weekly_discount || 0);
    const dateVal = date_str || new Date().toISOString().split('T')[0];

    const result = await dbRun(
      `INSERT INTO staff_loans (date_str, staff_name, total_amount, weekly_discount, amount_paid, balance_due, status, notes, expense_entry_id, created_by)
       VALUES (?, ?, ?, ?, 0.0, ?, 'ACTIVO', ?, ?, ?)`,
      [
        dateVal,
        staff_name.trim(),
        numTotal,
        numWeekly,
        numTotal,
        notes ? notes.trim() : null,
        expense_entry_id || null,
        req.user.id
      ]
    );

    const created = await dbGet(`SELECT * FROM staff_loans WHERE id = ?`, [result.id]);

    return res.status(201).json({
      success: true,
      message: 'Préstamo registrado exitosamente en el módulo 6.',
      loan: created
    });
  } catch (err) {
    console.error('Error creating staff loan:', err);
    return res.status(500).json({ success: false, error: 'Error al registrar préstamo.' });
  }
};

exports.addLoanPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { date_str, amount, notes } = req.body;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Ingrese un monto de descuento válido mayor a 0.' });
    }

    const loan = await dbGet(`SELECT * FROM staff_loans WHERE id = ?`, [id]);
    if (!loan) {
      return res.status(404).json({ success: false, error: 'Préstamo no encontrado.' });
    }

    const dateVal = date_str || new Date().toISOString().split('T')[0];

    await dbRun(
      `INSERT INTO staff_loan_payments (loan_id, date_str, amount, notes, registered_by)
       VALUES (?, ?, ?, ?, ?)`,
      [id, dateVal, numAmount, notes || 'Descuento en planilla vendedora', req.user.id]
    );

    const sumRow = await dbGet(
      `SELECT SUM(amount) as total FROM staff_loan_payments WHERE loan_id = ?`,
      [id]
    );

    const totalPaid = sumRow ? sumRow.total || 0 : 0;
    const newBalance = Math.max(0, loan.total_amount - totalPaid);
    const newStatus = newBalance <= 0 ? 'LIQUIDADO' : 'ACTIVO';

    await dbRun(
      `UPDATE staff_loans SET amount_paid = ?, balance_due = ?, status = ? WHERE id = ?`,
      [totalPaid, newBalance, newStatus, id]
    );

    return res.json({
      success: true,
      message: newStatus === 'LIQUIDADO' ? '¡Préstamo liquidado y saldado en su totalidad!' : 'Cuota descontada con éxito.',
      amount_paid: totalPaid,
      balance_due: newBalance,
      status: newStatus
    });
  } catch (err) {
    console.error('Error adding loan payment:', err);
    return res.status(500).json({ success: false, error: 'Error al registrar descuento al préstamo.' });
  }
};

exports.deleteStaffLoan = async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun(`DELETE FROM staff_loan_payments WHERE loan_id = ?`, [id]);
    await dbRun(`DELETE FROM staff_loans WHERE id = ?`, [id]);
    return res.json({ success: true, message: 'Préstamo y sus descuentos han sido eliminados.' });
  } catch (err) {
    console.error('Error deleting staff loan:', err);
    return res.status(500).json({ success: false, error: 'Error al eliminar préstamo.' });
  }
};

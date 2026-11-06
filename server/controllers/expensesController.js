const { dbRun, dbGet, dbAll } = require('../config/db');

exports.createExpense = async (req, res) => {
  try {
    const { category, amount, description, is_contract_related, contract_id, expense_date } = req.body;

    if (!category || !amount || !description) {
      return res.status(400).json({ success: false, error: 'Categoría, monto y descripción son obligatorios.' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Ingrese un monto válido mayor a 0.' });
    }

    const dateVal = expense_date || new Date().toISOString();
    const contractRelatedFlag = is_contract_related ? 1 : 0;
    const targetContractId = is_contract_related && contract_id ? parseInt(contract_id, 10) : null;

    const result = await dbRun(
      `INSERT INTO expenses (expense_date, category, amount, description, is_contract_related, contract_id, registered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [dateVal, category.trim(), numericAmount, description.trim(), contractRelatedFlag, targetContractId, req.user.id]
    );

    const createdExpense = await dbGet(`SELECT * FROM expenses WHERE id = ?`, [result.id]);

    return res.status(201).json({
      success: true,
      message: 'Egreso registrado correctamente.',
      expense: createdExpense,
    });
  } catch (err) {
    console.error('Error creating expense:', err);
    return res.status(500).json({ success: false, error: 'Error al registrar el egreso.' });
  }
};

exports.getExpenses = async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;
    let sql = `
      SELECT e.*, u.full_name as registered_by_name, c.contract_code, c.client_name
      FROM expenses e
      LEFT JOIN users u ON e.registered_by = u.id
      LEFT JOIN contracts c ON e.contract_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      sql += ` AND e.category = ?`;
      params.push(category);
    }

    if (startDate) {
      sql += ` AND date(e.expense_date) >= date(?)`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND date(e.expense_date) <= date(?)`;
      params.push(endDate);
    }

    sql += ` ORDER BY e.expense_date DESC`;

    const expenses = await dbAll(sql, params);
    return res.json({ success: true, expenses });
  } catch (err) {
    console.error('Error fetching expenses:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener egresos.' });
  }
};

// Tab 2: Gastos Adicionales (Non-contract expenses)
exports.getNonContractExpenses = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let sql = `
      SELECT e.*, u.full_name as registered_by_name
      FROM expenses e
      LEFT JOIN users u ON e.registered_by = u.id
      WHERE (e.is_contract_related = 0 OR e.is_contract_related IS NULL)
        AND LOWER(e.category) NOT LIKE '%contrato%'
    `;
    const params = [];

    if (startDate) {
      sql += ` AND date(e.expense_date) >= date(?)`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND date(e.expense_date) <= date(?)`;
      params.push(endDate);
    }

    sql += ` ORDER BY e.expense_date DESC`;

    const expenses = await dbAll(sql, params);

    const totalAmount = expenses.reduce((sum, item) => sum + item.amount, 0);

    return res.json({
      success: true,
      count: expenses.length,
      total_amount: totalAmount,
      expenses,
    });
  } catch (err) {
    console.error('Error fetching non-contract expenses:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener gastos adicionales.' });
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun(`DELETE FROM expenses WHERE id = ?`, [id]);
    return res.json({ success: true, message: 'Egreso eliminado correctamente.' });
  } catch (err) {
    console.error('Error deleting expense:', err);
    return res.status(500).json({ success: false, error: 'Error al eliminar egreso.' });
  }
};

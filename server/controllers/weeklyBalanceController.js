const { dbAll, dbRun } = require('../config/db');

exports.getWeeklyBalance = async (req, res) => {
  try {
    const { startDate, endDate, week } = req.query;

    let start = startDate;
    let end = endDate;

    // Default to last 7 days if no range provided
    if (!start || !end) {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      start = sevenDaysAgo.toISOString().split('T')[0];
      end = now.toISOString().split('T')[0];
    }

    // Fetch income (contract payments) in date range
    const incomeList = await dbAll(
      `SELECT p.id, p.payment_date as date, 'INGRESO_CONTRATO' as type, p.amount, p.receipt_number, p.notes,
              c.contract_code, c.client_name, u.full_name as registered_by_name
       FROM contract_payments p
       JOIN contracts c ON p.contract_id = c.id
       LEFT JOIN users u ON p.registered_by = u.id
       WHERE date(p.payment_date) >= date(?) AND date(p.payment_date) <= date(?)
       ORDER BY p.payment_date DESC`,
      [start, end]
    );

    // Fetch expenses in date range
    const expensesList = await dbAll(
      `SELECT e.id, e.expense_date as date, 'EGRESO' as type, e.amount, e.category, e.description,
              e.is_contract_related, u.full_name as registered_by_name
       FROM expenses e
       LEFT JOIN users u ON e.registered_by = u.id
       WHERE date(e.expense_date) >= date(?) AND date(e.expense_date) <= date(?)
       ORDER BY e.expense_date DESC`,
      [start, end]
    );

    // Fetch admin adjustments for this period/week
    const weekTag = week || `${start}_to_${end}`;
    const adjustmentsList = await dbAll(
      `SELECT a.*, u.full_name as admin_name
       FROM admin_weekly_adjustments a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.week_identifier = ? OR (date(a.created_at) >= date(?) AND date(a.created_at) <= date(?))
       ORDER BY a.created_at DESC`,
      [weekTag, start, end]
    );

    const totalIncome = incomeList.reduce((acc, curr) => acc + curr.amount, 0);
    const totalExpenses = expensesList.reduce((acc, curr) => acc + curr.amount, 0);
    const netBalance = totalIncome - totalExpenses;

    return res.json({
      success: true,
      period: { startDate: start, endDate: end, weekTag },
      summary: {
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_balance: netBalance,
      },
      income: incomeList,
      expenses: expensesList,
      admin_adjustments: adjustmentsList,
    });
  } catch (err) {
    console.error('Error fetching weekly balance:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener balance semanal.' });
  }
};

exports.addWeeklyAdjustment = async (req, res) => {
  try {
    const { week_identifier, item_type, target_id, admin_note, adjustment_amount } = req.body;

    if (!admin_note) {
      return res.status(400).json({ success: false, error: 'Ingrese una nota de ajuste para el balance.' });
    }

    const type = item_type || 'GENERAL';
    const amount = parseFloat(adjustment_amount || 0);

    const result = await dbRun(
      `INSERT INTO admin_weekly_adjustments (week_identifier, item_type, target_id, admin_note, adjustment_amount, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [week_identifier || 'GENERAL', type, target_id || null, admin_note.trim(), amount, req.user.id]
    );

    return res.status(201).json({
      success: true,
      message: 'Nota de ajuste registrada correctamente.',
      adjustment_id: result.id,
    });
  } catch (err) {
    console.error('Error adding weekly adjustment:', err);
    return res.status(500).json({ success: false, error: 'Error al registrar ajuste semanal.' });
  }
};

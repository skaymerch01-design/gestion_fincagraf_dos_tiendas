const { dbAll, dbRun, dbGet } = require('../config/db');

exports.getPaymentSchedules = async (req, res) => {
  try {
    const { status, category } = req.query;
    let sql = `SELECT * FROM payment_schedule WHERE 1=1`;
    const params = [];

    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY due_date ASC, id ASC`;

    const schedules = await dbAll(sql, params);

    // Calculate active alerts (5 days before due date, or today / past due, while status !== 'PAGADO')
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeAlerts = [];
    schedules.forEach((sch) => {
      if (sch.status !== 'PAGADO') {
        const dueDate = new Date(sch.due_date + 'T00:00:00');
        const diffMs = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays <= 5) {
          activeAlerts.push({
            id: sch.id,
            concept: sch.concept || sch.category,
            category: sch.category,
            amount: sch.amount,
            due_date: sch.due_date,
            diffDays,
            status: sch.status,
            isVendedoraRegistered: sch.status === 'REGISTRADO_POR_VENDEDORA'
          });
        }
      }
    });

    // Calculate overall stats
    const totalPendingRow = await dbGet(`SELECT SUM(amount) as total FROM payment_schedule WHERE status != 'PAGADO'`);
    const totalPaidRow = await dbGet(`SELECT SUM(amount) as total FROM payment_schedule WHERE status = 'PAGADO'`);

    return res.json({
      success: true,
      stats: {
        total_pending: totalPendingRow ? totalPendingRow.total || 0 : 0,
        total_paid: totalPaidRow ? totalPaidRow.total || 0 : 0,
      },
      activeAlerts,
      schedules,
    });
  } catch (err) {
    console.error('Error fetching payment schedule:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener cronograma de pagos.' });
  }
};

exports.getActiveAlerts = async (req, res) => {
  try {
    const sql = `SELECT * FROM payment_schedule WHERE status != 'PAGADO' ORDER BY due_date ASC`;
    const schedules = await dbAll(sql);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeAlerts = [];
    schedules.forEach((sch) => {
      const dueDate = new Date(sch.due_date + 'T00:00:00');
      const diffMs = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 5) {
        activeAlerts.push({
          id: sch.id,
          concept: sch.concept || sch.category,
          category: sch.category,
          amount: sch.amount,
          due_date: sch.due_date,
          diffDays,
          status: sch.status,
        });
      }
    });

    return res.json({ success: true, alerts: activeAlerts });
  } catch (err) {
    console.error('Error fetching active payment alerts:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener alertas de pago.' });
  }
};

exports.createScheduledPayment = async (req, res) => {
  try {
    const { concept, category, due_date, amount, notes } = req.body;

    const finalConcept = concept ? concept.trim() : (category ? category.trim() : 'SERVICIO FIJO');
    const finalCategory = category ? category.trim() : finalConcept;

    if (!due_date || !amount) {
      return res.status(400).json({ success: false, error: 'Fecha de vencimiento y monto son obligatorios.' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Ingrese un monto válido.' });
    }

    const result = await dbRun(
      `INSERT INTO payment_schedule (concept, category, due_date, amount, notes, status)
       VALUES (?, ?, ?, ?, ?, 'PENDIENTE')`,
      [finalConcept, finalCategory, due_date, numericAmount, notes || null]
    );

    let created = null;
    if (result && result.id) {
      created = await dbGet(`SELECT * FROM payment_schedule WHERE id = ?`, [result.id]);
    }
    if (!created) {
      created = await dbGet(`SELECT * FROM payment_schedule ORDER BY id DESC LIMIT 1`);
    }

    return res.status(201).json({
      success: true,
      message: 'Programación de pago creada correctamente.',
      schedule: created,
    });
  } catch (err) {
    console.error('Error creating scheduled payment:', err);
    return res.status(500).json({ success: false, error: err.message || 'Error al programar pago.' });
  }
};

exports.markAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_date, notes } = req.body;

    const dateVal = payment_date || new Date().toISOString();

    const sch = await dbGet(`SELECT * FROM payment_schedule WHERE id = ?`, [id]);
    if (!sch) {
      return res.status(404).json({ success: false, error: 'Pago programado no encontrado.' });
    }

    await dbRun(
      `UPDATE payment_schedule SET status = 'PAGADO', payment_date = ?, notes = COALESCE(?, notes) WHERE id = ?`,
      [dateVal, notes || null, id]
    );

    // Auto-generate next month's recurring payment schedule entry
    if (sch.due_date) {
      const parts = sch.due_date.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);

        let nextMonth = month + 1;
        let nextYear = year;
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear += 1;
        }

        const daysInNextMonth = new Date(nextYear, nextMonth, 0).getDate();
        const nextDay = Math.min(day, daysInNextMonth);
        const nextDueDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;

        const existingNext = await dbGet(
          `SELECT id FROM payment_schedule WHERE concept = ? AND category = ? AND due_date = ?`,
          [sch.concept, sch.category, nextDueDate]
        );

        if (!existingNext) {
          await dbRun(
            `INSERT INTO payment_schedule (concept, category, due_date, amount, notes, status)
             VALUES (?, ?, ?, ?, ?, 'PENDIENTE')`,
            [sch.concept, sch.category, nextDueDate, sch.amount, sch.notes]
          );
        }
      }
    }

    return res.json({ success: true, message: 'Pago marcado como realizado exitosamente. Alerta desactivada y programado el siguiente mes.' });
  } catch (err) {
    console.error('Error marking payment as paid:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar pago.' });
  }
};

exports.deleteScheduledPayment = async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun(`DELETE FROM payment_schedule WHERE id = ?`, [id]);
    return res.json({ success: true, message: 'Pago programado eliminado.' });
  } catch (err) {
    console.error('Error deleting scheduled payment:', err);
    return res.status(500).json({ success: false, error: 'Error al eliminar pago programado.' });
  }
};

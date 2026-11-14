const { dbRun, dbGet, dbAll } = require('../config/db');
const { exportSnapshot } = require('../config/snapshotSync');

// Helper to format any date or timestamp safely to YYYY-MM-DD string
function formatToYMD(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    const clean = val.includes('T') ? val.split('T')[0] : val.trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
      const [d, m, y] = clean.split('/');
      return `${y}-${m}-${d}`;
    }
    return clean;
  }
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val);
}

// Helper to generate a unique contract code if not provided
async function generateContractCode() {
  const year = new Date().getFullYear();
  const row = await dbGet(`SELECT COUNT(*) as count FROM contracts`);
  const nextNum = (row ? row.count : 0) + 1;
  return String(nextNum);
}

exports.createContract = async (req, res) => {
  try {
    let { contract_code, client_name, vendedor_name, quantity, description, total_amount, initial_payment, observations, date_str, items, payment_type, order_status, cancellation_date, delivery_date } = req.body;

    const numericTotal = parseFloat(total_amount || 0);
    const numericInitial = parseFloat(initial_payment || 0);

    if (!contract_code || contract_code.trim() === '') {
      contract_code = await generateContractCode();
    } else {
      contract_code = contract_code.trim();
    }

    const contractDate = date_str && date_str.trim() ? date_str.trim() : formatToYMD(new Date());
    const cleanPaymentType = payment_type ? payment_type.toString().trim().toUpperCase() : 'EFECTIVO';
    const cleanOrderStatus = order_status ? order_status.toString().trim() : 'PRODUCCION';

    let itemsJson = null;
    let computedDesc = description ? description.trim() : '';
    let computedQty = quantity ? quantity.toString().trim() : '1';

    if (items) {
      const itemsList = Array.isArray(items) ? items : (typeof items === 'string' ? JSON.parse(items) : []);
      if (itemsList.length > 0) {
        itemsJson = JSON.stringify(itemsList);
        if (!computedDesc) {
          computedDesc = itemsList
            .filter(it => it.description && it.description.trim())
            .map(it => `${it.quantity || 1} x ${it.description.trim()}${parseFloat(it.amount) > 0 ? ` (S/ ${parseFloat(it.amount).toFixed(2)})` : ''}`)
            .join(' | ') || 'TRABAJO DE IMPRENTA';
        }
        if (!quantity || quantity === '1') {
          const sumQty = itemsList.reduce((acc, it) => acc + (parseInt(it.quantity) || 1), 0);
          computedQty = String(sumQty);
        }
      }
    }

    if (!computedDesc) {
      computedDesc = 'TRABAJO DE IMPRENTA';
    }

    const balanceDue = Math.max(0, numericTotal - numericInitial);
    const isFullyPaid = balanceDue <= 0 && numericTotal > 0;
    let status = 'ACTIVO';
    if (req.body.status === 'ANULADO') {
      status = 'ANULADO';
    } else if (isFullyPaid) {
      status = 'CANCELADO';
    } else {
      status = 'ACTIVO';
    }
    const cancellationDate = cancellation_date ? formatToYMD(cancellation_date) : (isFullyPaid ? contractDate : null);
    const deliveryDate = delivery_date ? formatToYMD(delivery_date) : (cleanOrderStatus === 'ENTREGADO / CANCELADO' ? (cancellationDate || contractDate) : null);

    const existing = await dbGet(`SELECT id FROM contracts WHERE contract_code = ?`, [contract_code]);
    if (existing) {
      await dbRun(
        `UPDATE contracts 
         SET client_name = COALESCE(?, client_name),
             vendedor_name = COALESCE(?, vendedor_name),
             quantity = COALESCE(?, quantity),
             description = COALESCE(?, description),
             total_amount = ?,
             initial_payment = ?,
             balance_due = ?,
             status = ?,
             cancellation_date = COALESCE(?, cancellation_date),
             delivery_date = COALESCE(?, delivery_date),
             observations = ?,
             date_str = COALESCE(?, date_str),
             items = COALESCE(?, items),
             payment_type = COALESCE(?, payment_type),
             order_status = COALESCE(?, order_status)
         WHERE id = ?`,
        [
          client_name ? client_name.trim() : null,
          vendedor_name ? vendedor_name.trim() : null,
          computedQty,
          computedDesc,
          numericTotal,
          numericInitial,
          balanceDue,
          status,
          cancellationDate,
          deliveryDate,
          observations ? observations.trim() : null,
          contractDate,
          itemsJson,
          cleanPaymentType,
          cleanOrderStatus,
          existing.id
        ]
      );
      const updated = await dbGet(`SELECT * FROM contracts WHERE id = ?`, [existing.id]);
      return res.json({ success: true, message: 'Contrato actualizado en Balance Global.', contract: updated });
    }

    const storeIdVal = parseInt(req.body.storeId || 1, 10);
    const result = await dbRun(
      `INSERT INTO contracts (contract_code, client_name, vendedor_name, quantity, description, total_amount, initial_payment, balance_due, status, cancellation_date, delivery_date, observations, created_by, date_str, items, payment_type, order_status, store_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contract_code,
        client_name ? client_name.trim() : 'CLIENTE POR REGISTRAR',
        vendedor_name ? vendedor_name.trim() : (req.user ? req.user.full_name : 'Administrador'),
        computedQty,
        computedDesc,
        numericTotal,
        numericInitial,
        balanceDue,
        status,
        cancellationDate,
        deliveryDate,
        observations ? observations.trim() : null,
        req.user ? req.user.id : null,
        contractDate,
        itemsJson,
        cleanPaymentType,
        cleanOrderStatus,
        storeIdVal
      ]
    );

    if (numericInitial > 0) {
      await dbRun(
        `INSERT INTO contract_payments (contract_id, amount, payment_date, payment_type, receipt_number, notes, registered_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [result.id, numericInitial, contractDate, cleanPaymentType, 'CUOTA-INICIAL', `Adelanto inicial (${cleanPaymentType})`, req.user ? req.user.id : null]
      );
    }

    const newContract = await dbGet(`SELECT * FROM contracts WHERE id = ?`, [result.id]);

    return res.status(201).json({
      success: true,
      message: 'Fila de Balance Global creada exitosamente.',
      contract: newContract,
    });
  } catch (err) {
    console.error('Error creating contract:', err);
    return res.status(500).json({ success: false, error: 'Error al registrar contrato en Balance Global: ' + err.message });
  }
};

exports.updateContract = async (req, res) => {
  try {
    const { id } = req.params;
    const { contract_code, client_name, vendedor_name, quantity, description, total_amount, initial_payment, observations, status, date_str, items, payment_type, order_status, cancellation_date, delivery_date } = req.body;

    let itemsJson = null;
    let computedDesc = description ? description.trim() : '';
    let computedQty = quantity !== undefined ? quantity.toString().trim() : '1';

    if (items) {
      const itemsList = Array.isArray(items) ? items : (typeof items === 'string' ? JSON.parse(items) : []);
      if (itemsList.length > 0) {
        itemsJson = JSON.stringify(itemsList);
        if (!computedDesc) {
          computedDesc = itemsList
            .filter(it => it.description && it.description.trim())
            .map(it => `${it.quantity || 1} x ${it.description.trim()}${parseFloat(it.amount) > 0 ? ` (S/ ${parseFloat(it.amount).toFixed(2)})` : ''}`)
            .join(' | ') || 'TRABAJO DE IMPRENTA';
        }
        if (!quantity || quantity === '1') {
          const sumQty = itemsList.reduce((acc, it) => acc + (parseInt(it.quantity) || 1), 0);
          computedQty = String(sumQty);
        }
      }
    }

    const cleanPaymentType = payment_type ? payment_type.toString().trim().toUpperCase() : null;
    const cleanOrderStatus = order_status ? order_status.toString().trim() : null;

    // Check if id is virtual like "inc_103"
    let existing = null;
    if (String(id).startsWith('inc_')) {
      const codeFromId = String(id).replace('inc_', '');
      existing = await dbGet(`SELECT * FROM contracts WHERE contract_code = ?`, [codeFromId]);
      if (!existing) {
        const numericTotal = parseFloat(total_amount || 0);
        await dbRun(
          `INSERT INTO contracts (contract_code, client_name, vendedor_name, quantity, description, total_amount, balance_due, status, cancellation_date, delivery_date, observations, created_by, date_str, items, payment_type, order_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            contract_code || codeFromId,
            client_name || 'CLIENTE',
            vendedor_name || 'Vendedora',
            computedQty,
            computedDesc || 'TRABAJO DE IMPRENTA',
            numericTotal,
            numericTotal,
            status || 'ACTIVO',
            cancellation_date ? formatToYMD(cancellation_date) : null,
            delivery_date ? formatToYMD(delivery_date) : null,
            observations || null,
            req.user ? req.user.id : null,
            date_str || formatToYMD(new Date()),
            itemsJson,
            cleanPaymentType || 'EFECTIVO',
            cleanOrderStatus || 'PRODUCCION'
          ]
        );
        return res.json({ success: true, message: 'Fila de Balance Global registrada correctamente.' });
      }
    } else {
      existing = await dbGet(`SELECT * FROM contracts WHERE id = ?`, [id]);
    }

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Registro de contrato no encontrado.' });
    }

    const formattedContractDate = date_str !== undefined && date_str !== null && String(date_str).trim() !== ''
      ? formatToYMD(date_str)
      : (existing.date_str ? formatToYMD(existing.date_str) : null);

    const numericTotal = total_amount !== undefined ? parseFloat(total_amount) : existing.total_amount;
    
    const paymentsList = await dbAll(`SELECT id, amount FROM contract_payments WHERE contract_id = ? ORDER BY id ASC`, [existing.id]);
    const paymentsSumRow = await dbGet(`SELECT SUM(amount) as sum_paid FROM contract_payments WHERE contract_id = ?`, [existing.id]);
    
    let keepInitialPayment = parseFloat(existing.initial_payment) || 0;

    if (paymentsList && paymentsList.length <= 1) {
      if (initial_payment !== undefined && initial_payment !== null && initial_payment !== '') {
        const parsedInitial = parseFloat(initial_payment);
        if (!isNaN(parsedInitial)) {
          keepInitialPayment = parsedInitial;
          if (paymentsList.length === 1) {
            if (keepInitialPayment > 0) {
              await dbRun(`UPDATE contract_payments SET amount = ? WHERE id = ?`, [keepInitialPayment, paymentsList[0].id]);
            } else {
              await dbRun(`DELETE FROM contract_payments WHERE id = ?`, [paymentsList[0].id]);
            }
          } else if (paymentsList.length === 0 && keepInitialPayment > 0) {
            await dbRun(
              `INSERT INTO contract_payments (contract_id, amount, payment_date, payment_type, notes, registered_by)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [existing.id, keepInitialPayment, formattedContractDate || existing.date_str || formatToYMD(new Date()), existing.payment_type || 'EFECTIVO', 'Adelanto inicial registrado', req.user ? req.user.id : null]
            );
          }
        }
      }
    } else if (paymentsList && paymentsList.length > 1) {
      // Múltiples abonos: el adelanto inicial original queda estático
      if (paymentsList[0] && parseFloat(paymentsList[0].amount) > 0) {
        keepInitialPayment = parseFloat(paymentsList[0].amount);
      }
    }

    const updatedSumRow = await dbGet(`SELECT SUM(amount) as sum_paid FROM contract_payments WHERE contract_id = ?`, [existing.id]);
    const abonosSum = updatedSumRow && updatedSumRow.sum_paid !== null ? parseFloat(updatedSumRow.sum_paid) : 0;
    const actualPaid = abonosSum > 0 ? abonosSum : keepInitialPayment;

    // Sincronizar fecha del contrato en el primer abono si existe
    if (formattedContractDate) {
      const firstPayment = await dbGet(
        `SELECT id FROM contract_payments WHERE contract_id = ? ORDER BY id ASC LIMIT 1`,
        [existing.id]
      );
      if (firstPayment) {
        await dbRun(`UPDATE contract_payments SET payment_date = ? WHERE id = ?`, [formattedContractDate, firstPayment.id]);
      }
    }

    const newBalance = Math.max(0, numericTotal - actualPaid);

    let resolvedStatus = status || existing.status;
    let cancellationDate = existing.cancellation_date;
    if (cancellation_date !== undefined) {
      cancellationDate = cancellation_date ? formatToYMD(cancellation_date) : null;
    }

    if (resolvedStatus === 'ANULADO' || existing.status === 'ANULADO' || status === 'ANULADO') {
      resolvedStatus = 'ANULADO';
    } else if (newBalance <= 0 && numericTotal > 0) {
      resolvedStatus = 'CANCELADO';
      if (!cancellationDate) {
        // Tomar la fecha del último abono registrado para reflejar el momento real en que se canceló el saldo
        const lastPay = await dbGet(
          `SELECT payment_date FROM contract_payments WHERE contract_id = ? ORDER BY payment_date DESC, id DESC LIMIT 1`,
          [existing.id]
        );
        cancellationDate = (lastPay && lastPay.payment_date)
          ? formatToYMD(lastPay.payment_date)
          : (formattedContractDate || formatToYMD(new Date()));
      }
    } else {
      resolvedStatus = 'ACTIVO';
      cancellationDate = null;
    }

    let resolvedOrderStatus = cleanOrderStatus || existing.order_status;
    let deliveryDate = existing.delivery_date;
    if (delivery_date !== undefined) {
      deliveryDate = delivery_date ? formatToYMD(delivery_date) : null;
    }
    if (resolvedOrderStatus === 'ENTREGADO / CANCELADO' && !deliveryDate) {
      deliveryDate = cancellationDate || formattedContractDate || formatToYMD(new Date());
    }

    await dbRun(
      `UPDATE contracts
       SET contract_code = COALESCE(?, contract_code),
           client_name = COALESCE(?, client_name),
           vendedor_name = COALESCE(?, vendedor_name),
           quantity = COALESCE(?, quantity),
           description = COALESCE(?, description),
           total_amount = ?,
           initial_payment = ?,
           balance_due = ?,
           observations = COALESCE(?, observations),
           status = ?,
           cancellation_date = ?,
           delivery_date = ?,
           date_str = ?,
           items = COALESCE(?, items),
           payment_type = COALESCE(?, payment_type),
           order_status = COALESCE(?, order_status)
       WHERE id = ?`,
      [
        contract_code ? contract_code.trim() : existing.contract_code,
        client_name ? client_name.trim() : existing.client_name,
        vendedor_name ? vendedor_name.trim() : existing.vendedor_name,
        computedQty || existing.quantity,
        computedDesc || existing.description,
        numericTotal,
        keepInitialPayment,
        newBalance,
        observations !== undefined ? observations : existing.observations,
        resolvedStatus,
        cancellationDate,
        deliveryDate,
        formattedContractDate || existing.date_str,
        itemsJson || existing.items,
        cleanPaymentType || existing.payment_type,
        resolvedOrderStatus,
        existing.id
      ]
    );

    const updatedContract = await dbGet(
      `SELECT c.*, u.full_name as created_by_name FROM contracts c LEFT JOIN users u ON c.created_by = u.id WHERE c.id = ?`,
      [existing.id]
    );

    return res.json({
      success: true,
      message: 'Fila de Balance Global actualizada correctamente.',
      contract: updatedContract
    });
  } catch (err) {
    console.error('Error updating contract:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar contrato: ' + err.message });
  }
};

// Actualizar estado del pedido (PRODUCCION, PEDIDO EN TIENDA, ENTREGADO / CANCELADO)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { order_status } = req.body;
    if (!order_status || !order_status.trim()) {
      return res.status(400).json({ success: false, error: 'Debe especificar el estado del pedido.' });
    }

    const cleanStatus = order_status.trim();
    const existing = await dbGet(`SELECT * FROM contracts WHERE id = ?`, [id]);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Contrato no encontrado.' });
    }

    let deliveryDate = existing.delivery_date;
    if (cleanStatus === 'ENTREGADO / CANCELADO' && !deliveryDate) {
      deliveryDate = formatToYMD(new Date());
    }

    await dbRun(`UPDATE contracts SET order_status = ?, delivery_date = ? WHERE id = ?`, [cleanStatus, deliveryDate, existing.id]);
    return res.json({ success: true, message: `Estado actualizado a ${cleanStatus}.`, order_status: cleanStatus, delivery_date: deliveryDate });
  } catch (err) {
    console.error('Error updating order status:', err);
    return res.status(500).json({ success: false, error: 'Error al cambiar estado de pedido: ' + err.message });
  }
};

// Liquidar y marcar contrato como CANCELADO (saldo = 0)
exports.liquidateContract = async (req, res) => {
  try {
    const { id } = req.params;
    const todayStr = formatToYMD(new Date());
    const existing = await dbGet(`SELECT * FROM contracts WHERE id = ?`, [id]);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Contrato no encontrado.' });
    }

    const previousBalance = existing.balance_due > 0 ? existing.balance_due : Math.max(0, existing.total_amount - (existing.initial_payment || 0));
    if (previousBalance > 0) {
      // Registrar abono de liquidación
      await dbRun(
        `INSERT INTO contract_payments (contract_id, amount, payment_date, payment_type, receipt_number, notes, registered_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [existing.id, previousBalance, todayStr, existing.payment_type || 'EFECTIVO', 'LIQUIDACION', 'Liquidación total del contrato', req.user ? req.user.id : null]
      );
    }

    let deliveryDate = existing.delivery_date;
    if (existing.order_status === 'ENTREGADO / CANCELADO' && !deliveryDate) {
      deliveryDate = todayStr;
    }

    await dbRun(
      `UPDATE contracts 
       SET status = 'CANCELADO',
           balance_due = 0,
           cancellation_date = ?,
           delivery_date = ?
       WHERE id = ?`,
      [todayStr, deliveryDate, existing.id]
    );

    return res.json({
      success: true,
      message: `¡Contrato N° ${existing.contract_code} marcado como CANCELADO! Saldo liquidado a S/ 0.00.`,
      cancellation_date: todayStr,
      delivery_date: deliveryDate
    });
  } catch (err) {
    console.error('Error liquidating contract:', err);
    return res.status(500).json({ success: false, error: 'Error al liquidar contrato: ' + err.message });
  }
};

// Revertir liquidación (Regresar de CANCELADO a PENDIENTE con su saldo original restaurado)
exports.revertLiquidation = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await dbGet(`SELECT * FROM contracts WHERE id = ?`, [id]);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Contrato no encontrado.' });
    }

    const contractCode = existing.contract_code;

    // 1. Eliminar cualquier abono generado por la liquidación
    await dbRun(
      `DELETE FROM contract_payments WHERE contract_id = ? AND receipt_number = 'LIQUIDACION'`,
      [existing.id]
    );

    // 2. Calcular los pagos reales registrados (primer adelanto + abonos)
    const otherPayments = await dbAll(
      `SELECT amount FROM contract_payments WHERE contract_id = ?`,
      [existing.id]
    );
    const abonosSum = (otherPayments && otherPayments.length > 0)
      ? otherPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
      : 0;
    const initialDeposit = parseFloat(existing.initial_payment) || 0;
    const realPaid = initialDeposit + abonosSum;

    const totalAmount = existing.total_amount || 0;
    const restoredBalance = Math.max(0, totalAmount - realPaid);
    const restoredStatus = (restoredBalance <= 0 && totalAmount > 0) ? 'CANCELADO' : 'ACTIVO';

    await dbRun(
      `UPDATE contracts 
       SET status = ?,
           balance_due = ?,
           cancellation_date = NULL,
           order_status = CASE WHEN order_status = 'ENTREGADO / CANCELADO' THEN 'PRODUCCION' ELSE order_status END
       WHERE id = ?`,
      [restoredStatus, restoredBalance, existing.id]
    );

    return res.json({
      success: true,
      message: `Contrato N° ${contractCode} restaurado a PENDIENTE DE SALDO (Saldo por cobrar: S/ ${restoredBalance.toFixed(2)}).`,
      balance_due: restoredBalance,
      status: restoredStatus
    });
  } catch (err) {
    console.error('Error reverting liquidation:', err);
    return res.status(500).json({ success: false, error: 'Error al revertir liquidación: ' + err.message });
  }
};

// Eliminar contrato (borrar permanentemente)
exports.deleteContract = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await dbGet(`SELECT * FROM contracts WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Contrato no encontrado.' });
    }

    const codeToDelete = existing.contract_code;

    // Eliminar pagos asociados
    await dbRun(`DELETE FROM contract_payments WHERE contract_id = ?`, [existing.id]);
    // Eliminar el contrato
    await dbRun(`DELETE FROM contracts WHERE id = ?`, [existing.id]);

    return res.json({ success: true, message: `Contrato N° ${codeToDelete} eliminado correctamente.` });
  } catch (err) {
    console.error('Error deleting contract:', err);
    return res.status(500).json({ success: false, error: 'Error al eliminar contrato: ' + err.message });
  }
};

exports.lookupContractByCode = async (req, res) => {
  try {
    const { code } = req.params;
    if (!code || code.trim() === '') {
      return res.json({ success: true, exists: false });
    }

    const cleanCode = code.trim();
    const contractRow = await dbGet(
      `SELECT * FROM contracts WHERE contract_code = ?`,
      [cleanCode]
    );

    if (!contractRow) {
      return res.json({
        success: true,
        exists: false,
        message: `N° de Contrato ${cleanCode} disponible.`
      });
    }

    return res.json({
      success: true,
      exists: true,
      message: `El Contrato N° ${cleanCode} ya existe en Balance Global.`,
      contract: contractRow
    });
  } catch (err) {
    console.error('Error looking up contract by code:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar número de contrato.' });
  }
};

async function fetchProcessedContractsList({ year, month, search, status, startDate, endDate, storeId } = {}) {
  const storeFilter = storeId ? `WHERE (c.store_id = ${parseInt(storeId, 10)} OR c.store_id IS NULL)` : '';
  const contracts = await dbAll(
    `SELECT c.*, u.full_name as created_by_name FROM contracts c LEFT JOIN users u ON c.created_by = u.id ${storeFilter} ORDER BY c.id DESC`
  );

  const allPayments = await dbAll(`SELECT * FROM contract_payments ORDER BY payment_date ASC, id ASC`);
  const paymentsByContract = {};
  allPayments.forEach(p => {
    if (!paymentsByContract[p.contract_id]) paymentsByContract[p.contract_id] = [];
    paymentsByContract[p.contract_id].push(p);
  });

  let processedList = contracts.map(c => {
    const code = c.contract_code ? c.contract_code.trim() : '';
    const cPayments = paymentsByContract[c.id] || [];

    let totalPaid = 0;
    let paymentMethods = [];
    let initialDate = formatToYMD(c.date_str);
    if (!initialDate) {
      if (cPayments.length > 0 && cPayments[0].payment_date) {
        initialDate = formatToYMD(cPayments[0].payment_date);
      } else {
        initialDate = formatToYMD(c.created_at);
      }
    }
    let latestPaymentDate = null;
    let sellerName = (c.vendedor_name || c.created_by_name || '').trim();

    let abonosSum = 0;
    cPayments.forEach(p => {
      abonosSum += (parseFloat(p.amount) || 0);
      if (p.payment_date) latestPaymentDate = formatToYMD(p.payment_date);
      const pType = (p.payment_type || '').toUpperCase();
      if (pType && !paymentMethods.includes(pType)) {
        paymentMethods.push(pType);
      }
    });

    const initialPay = parseFloat(c.initial_payment) || 0;
    totalPaid = cPayments.length > 0 ? abonosSum : initialPay;

    if (c.payment_type && !paymentMethods.includes(c.payment_type.toUpperCase())) {
      paymentMethods.unshift(c.payment_type.toUpperCase());
    }

    const totalAmount = c.total_amount || 0;
    let balanceDue = Math.max(0, totalAmount - totalPaid);

    if (c.status === 'CANCELADO') {
      balanceDue = 0;
      if (totalPaid < totalAmount) {
        totalPaid = totalAmount;
      }
    }

    let paymentStatus = 'PENDIENTE DE SALDO';
    let orderStatus = c.order_status;

    if (c.status === 'ANULADO') {
      paymentStatus = 'ANULADO';
      orderStatus = 'ANULADO';
      balanceDue = 0;
    } else if (c.status === 'CANCELADO' || (balanceDue <= 0 && totalAmount > 0)) {
      paymentStatus = 'CANCELADO';
    } else if (c.status === 'SIN PAGO' || totalPaid <= 0) {
      paymentStatus = 'SIN PAGO';
    }

    if (c.status !== 'ANULADO') {
      if (!orderStatus) {
        if (c.status === 'ENTREGADO' || c.status === 'CANCELADO Y ENTREGADO') orderStatus = 'ENTREGADO / CANCELADO';
        else if (c.status === 'CANCELADO' || balanceDue <= 0) orderStatus = 'ENTREGADO / CANCELADO';
        else orderStatus = 'PRODUCCION';
      } else {
        if (orderStatus === 'EN PRODUCCION') orderStatus = 'PRODUCCION';
        if (orderStatus === 'CANCELADO (POR ENTREGAR)') orderStatus = 'PEDIDO EN TIENDA';
        if (orderStatus === 'ENTREGADO') orderStatus = 'ENTREGADO / CANCELADO';
      }
    }

    let cancellationDate = c.status === 'ANULADO' ? null : formatToYMD(c.cancellation_date);
    if (c.status !== 'ANULADO' && (paymentStatus === 'CANCELADO' || balanceDue <= 0) && totalAmount > 0) {
      // Si el contrato está cancelado y tiene abonos registrados, la fecha real de cancelación
      // es la fecha del último abono que liquidó el saldo (ej. 30/10/2026), evitando sobreescribir con la fecha del día de llenado
      if (latestPaymentDate) {
        if (!cancellationDate || (cancellationDate > latestPaymentDate && cPayments.length > 0)) {
          cancellationDate = latestPaymentDate;
        }
      } else if (!cancellationDate || (initialDate && cancellationDate > initialDate && cancellationDate >= formatToYMD(new Date()))) {
        cancellationDate = initialDate;
      }
    }

    let deliveryDate = c.status === 'ANULADO' ? null : formatToYMD(c.delivery_date);
    if (c.status !== 'ANULADO' && orderStatus === 'ENTREGADO / CANCELADO') {
      if (!deliveryDate || (cancellationDate && deliveryDate > cancellationDate && deliveryDate >= formatToYMD(new Date()))) {
        deliveryDate = cancellationDate || latestPaymentDate || initialDate;
      }
    }

    let parsedItems = null;
    if (c.items) {
      try {
        parsedItems = typeof c.items === 'string' ? JSON.parse(c.items) : c.items;
      } catch (_) {
        parsedItems = null;
      }
    }

    return {
      id: c.id,
      date: initialDate,
      contract_code: code,
      vendedor_name: sellerName,
      client_name: c.client_name || '-',
      quantity: c.quantity || '1',
      description: c.description || c.client_name || '-',
      items: parsedItems,
      total_amount: totalAmount,
      initial_payment: parseFloat(c.initial_payment) || 0,
      total_paid: totalPaid,
      balance_due: balanceDue,
      payment_status: paymentStatus,
      order_status: orderStatus,
      payment_type: c.payment_type || (paymentMethods[0] || 'EFECTIVO'),
      payment_type_display: paymentMethods.join(' + ') || c.payment_type || 'EFECTIVO',
      payment_date: cancellationDate || latestPaymentDate || initialDate,
      cancellation_date: cancellationDate,
      delivery_date: deliveryDate,
      payments: cPayments,
      payments_count: cPayments.length,
      observations: c.observations || ''
    };
  });

  // Filter by startDate and endDate if provided
  if (startDate && endDate) {
    processedList = processedList.filter(item => {
      if (!item.date) return false;
      return item.date >= startDate && item.date <= endDate;
    });
  }

  // Filter by year and month if provided
  if (year !== undefined && year !== null && year !== '') {
    const targetYear = parseInt(year);
    if (month !== undefined && month !== null && month !== '') {
      const targetMonth = parseInt(month);
      processedList = processedList.filter(item => {
        if (!item.date) return false;
        const parts = String(item.date).split('-');
        if (parts.length >= 2) {
          const itemYear = parseInt(parts[0]);
          const itemMonth = parseInt(parts[1]) - 1;
          return itemYear === targetYear && itemMonth === targetMonth;
        }
        return false;
      });
    } else {
      processedList = processedList.filter(item => {
        if (!item.date) return false;
        const parts = String(item.date).split('-');
        return parts.length >= 1 && parseInt(parts[0]) === targetYear;
      });
    }
  }

  if (search && search.trim() !== '') {
    const term = search.trim().toLowerCase();
    processedList = processedList.filter(item =>
      item.contract_code.toLowerCase().includes(term) ||
      item.client_name.toLowerCase().includes(term) ||
      item.description.toLowerCase().includes(term) ||
      item.vendedor_name.toLowerCase().includes(term)
    );
  }

  if (status) {
    if (status === 'ACTIVO') processedList = processedList.filter(i => i.balance_due > 0 && i.total_paid > 0 && i.payment_status !== 'ANULADO');
    else if (status === 'SIN_PAGO' || status === 'SIN PAGO') processedList = processedList.filter(i => (i.payment_status === 'SIN PAGO' || i.total_paid <= 0) && i.payment_status !== 'ANULADO');
    else if (status === 'CANCELADO') processedList = processedList.filter(i => (i.payment_status === 'CANCELADO' || i.balance_due <= 0) && i.payment_status !== 'ANULADO');
    else if (status === 'ANULADO') processedList = processedList.filter(i => i.payment_status === 'ANULADO');
  }

  return processedList;
}

exports.getContracts = async (req, res) => {
  try {
    const { status, search, year, month, startDate, endDate, storeId } = req.query;
    const processedList = await fetchProcessedContractsList({ year, month, search, status, startDate, endDate, storeId });
    return res.json({ success: true, contracts: processedList });
  } catch (err) {
    console.error('Error fetching contracts:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener balance global de contratos.' });
  }
};

exports.getMonthlyReport = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    const year = req.query.year !== undefined && req.query.year !== '' ? parseInt(req.query.year) : currentYear;
    const month = req.query.month !== undefined && req.query.month !== '' ? parseInt(req.query.month) : currentMonth;

    const list = await fetchProcessedContractsList({ year, month });

    let totalContracts = list.length;
    let totalContractValue = 0;
    let totalCollected = 0;
    let totalPending = 0;

    const paymentMethods = {};
    const orderStatuses = {
      'PRODUCCION': 0,
      'PEDIDO EN TIENDA': 0,
      'ENTREGADO / CANCELADO': 0
    };
    const sellers = {};

    list.forEach(item => {
      const isItemAnulado = item.payment_status === 'ANULADO' || item.status === 'ANULADO' || item.order_status === 'ANULADO';
      if (isItemAnulado) {
        return;
      }
      totalContractValue += item.total_amount || 0;
      totalCollected += item.total_paid || 0;
      totalPending += item.balance_due || 0;

      const pType = item.payment_type_display || 'EFECTIVO';
      if (!paymentMethods[pType]) {
        paymentMethods[pType] = { count: 0, total: 0 };
      }
      paymentMethods[pType].count += 1;
      paymentMethods[pType].total += item.total_paid || 0;

      const oStatus = item.order_status || 'EN PRODUCCION';
      if (orderStatuses[oStatus] !== undefined) {
        orderStatuses[oStatus] += 1;
      } else {
        orderStatuses[oStatus] = 1;
      }

      let seller = (item.vendedor_name || 'Vendedora').trim();

      if (!sellers[seller]) {
        sellers[seller] = { count: 0, total_amount: 0, total_paid: 0, balance_due: 0 };
      }
      sellers[seller].count += 1;
      sellers[seller].total_amount += item.total_amount || 0;
      sellers[seller].total_paid += item.total_paid || 0;
      sellers[seller].balance_due += item.balance_due || 0;
    });

    const monthNames = [
      'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
      'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
    ];

    return res.json({
      success: true,
      year,
      month,
      month_label: `${monthNames[month]} ${year}`,
      summary: {
        total_contracts: totalContracts,
        total_contract_value: totalContractValue,
        total_collected: totalCollected,
        total_pending: totalPending,
        payment_rate: totalContractValue > 0 ? parseFloat(((totalCollected / totalContractValue) * 100).toFixed(1)) : 0
      },
      by_payment_method: paymentMethods,
      by_order_status: orderStatuses,
      by_vendedor: sellers
    });
  } catch (err) {
    console.error('Error getting monthly report:', err);
    return res.status(500).json({ success: false, error: 'Error al generar reporte mensual.' });
  }
};

exports.getAnnualReport = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const year = req.query.year !== undefined && req.query.year !== '' ? parseInt(req.query.year) : currentYear;

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const allYearContracts = await fetchProcessedContractsList({ year });

    const monthlyBreakdown = monthNames.map((name, index) => {
      const monthContracts = allYearContracts.filter(item => {
        if (!item.date) return false;
        const parts = item.date.split('-');
        return parts.length >= 2 && (parseInt(parts[1]) - 1) === index;
      });

      let totalValue = 0;
      let totalCollected = 0;
      let totalPending = 0;

      monthContracts.forEach(item => {
        const isItemAnulado = item.payment_status === 'ANULADO' || item.status === 'ANULADO' || item.order_status === 'ANULADO';
        if (isItemAnulado) return;
        totalValue += item.total_amount || 0;
        totalCollected += item.total_paid || 0;
        totalPending += item.balance_due || 0;
      });

      return {
        month_index: index,
        month_name: name,
        total_contracts: monthContracts.length,
        total_amount: totalValue,
        total_collected: totalCollected,
        total_pending: totalPending,
        payment_rate: totalValue > 0 ? parseFloat(((totalCollected / totalValue) * 100).toFixed(1)) : 0
      };
    });

    let annualTotalContracts = 0;
    let annualTotalAmount = 0;
    let annualTotalCollected = 0;
    let annualTotalPending = 0;

    monthlyBreakdown.forEach(m => {
      annualTotalContracts += m.total_contracts;
      annualTotalAmount += m.total_amount;
      annualTotalCollected += m.total_collected;
      annualTotalPending += m.total_pending;
    });

    return res.json({
      success: true,
      year,
      monthlyBreakdown,
      annualSummary: {
        total_contracts: annualTotalContracts,
        total_amount: annualTotalAmount,
        total_collected: annualTotalCollected,
        total_pending: annualTotalPending,
        payment_rate: annualTotalAmount > 0 ? parseFloat(((annualTotalCollected / annualTotalAmount) * 100).toFixed(1)) : 0
      }
    });
  } catch (err) {
    console.error('Error getting annual report:', err);
    return res.status(500).json({ success: false, error: 'Error al generar reporte anual.' });
  }
};

exports.getContractById = async (req, res) => {
  try {
    const { id } = req.params;
    const contract = await dbGet(`SELECT * FROM contracts WHERE id = ?`, [id]);
    if (!contract) {
      return res.status(404).json({ success: false, error: 'Contrato no encontrado.' });
    }

    let payments = await dbAll(
      `SELECT p.*, u.full_name as registered_by_name
       FROM contract_payments p
       LEFT JOIN users u ON p.registered_by = u.id
       WHERE p.contract_id = ?
       ORDER BY p.payment_date ASC, p.id ASC`,
      [id]
    );

    const abonosSum = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const initialDeposit = parseFloat(contract.initial_payment) || 0;
    const totalPaid = payments.length > 0 ? abonosSum : initialDeposit;
    const balanceDue = Math.max(0, (parseFloat(contract.total_amount) || 0) - totalPaid);

    return res.json({
      success: true,
      contract: {
        ...contract,
        cancellation_date: formatToYMD(contract.cancellation_date),
        delivery_date: formatToYMD(contract.delivery_date),
        total_paid: totalPaid,
        balance_due: balanceDue,
      },
      payments,
    });
  } catch (err) {
    console.error('Error fetching contract detail:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener detalle del contrato.' });
  }
};

exports.addContractPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, receipt_number, notes, payment_date, payment_type } = req.body;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Ingrese un monto válido mayor a 0.' });
    }

    const contract = await dbGet(`SELECT * FROM contracts WHERE id = ?`, [id]);
    if (!contract) {
      return res.status(404).json({ success: false, error: 'Contrato no encontrado.' });
    }

    const payDate = payment_date && payment_date.trim() !== '' ? payment_date.trim() : formatToYMD(new Date());
    const payType = payment_type && payment_type.trim() !== '' ? payment_type.trim() : (contract.payment_type || 'EFECTIVO');

    await dbRun(
      `INSERT INTO contract_payments (contract_id, amount, payment_date, payment_type, receipt_number, notes, registered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, numericAmount, payDate, payType, receipt_number ? receipt_number.trim() : null, notes ? notes.trim() : null, req.user ? req.user.id : null]
    );

    const payments = await dbAll(
      `SELECT p.*, u.full_name as registered_by_name
       FROM contract_payments p
       LEFT JOIN users u ON p.registered_by = u.id
       WHERE p.contract_id = ?
       ORDER BY p.payment_date ASC, p.id ASC`,
      [id]
    );

    const abonosSum = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const initialDeposit = parseFloat(contract.initial_payment) || 0;
    const totalPaid = payments.length > 0 ? abonosSum : initialDeposit;
    const newBalanceDue = Math.max(0, (parseFloat(contract.total_amount) || 0) - totalPaid);

    let newStatus = contract.status;
    let cancellationDate = contract.cancellation_date;

    if (newBalanceDue <= 0) {
      newStatus = 'CANCELADO';
      cancellationDate = payDate || formatToYMD(new Date());
    } else if (newBalanceDue > 0 && contract.status === 'CANCELADO') {
      newStatus = 'ACTIVO';
      cancellationDate = null;
    }

    // IMPORTANTE: NO sobreescribir initial_payment (primer adelanto estático).
    // Solo actualizamos balance_due, status y cancellation_date.
    await dbRun(
      `UPDATE contracts SET balance_due = ?, status = ?, cancellation_date = ? WHERE id = ?`,
      [newBalanceDue, newStatus, cancellationDate, id]
    );

    await exportSnapshot(dbAll);

    return res.json({
      success: true,
      message: newStatus === 'CANCELADO' ? '¡Contrato liquidado y cancelado en su totalidad!' : 'Acuenta registrado con éxito.',
      total_paid: totalPaid,
      balance_due: newBalanceDue,
      status: newStatus,
      cancellation_date: cancellationDate,
      payments
    });
  } catch (err) {
    console.error('Error adding contract payment:', err);
    return res.status(500).json({ success: false, error: 'Error al registrar abono al contrato: ' + err.message });
  }
};

exports.deleteContractPayment = async (req, res) => {
  try {
    const { id, paymentId } = req.params;
    const contract = await dbGet(`SELECT * FROM contracts WHERE id = ?`, [id]);
    if (!contract) {
      return res.status(404).json({ success: false, error: 'Contrato no encontrado.' });
    }

    await dbRun(`DELETE FROM contract_payments WHERE id = ? AND contract_id = ?`, [paymentId, id]);

    const payments = await dbAll(
      `SELECT p.*, u.full_name as registered_by_name
       FROM contract_payments p
       LEFT JOIN users u ON p.registered_by = u.id
       WHERE p.contract_id = ?
       ORDER BY p.payment_date ASC, p.id ASC`,
      [id]
    );

    const abonosSum = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const initialDeposit = parseFloat(contract.initial_payment) || 0;
    const totalPaid = payments.length > 0 ? abonosSum : initialDeposit;
    const newBalanceDue = Math.max(0, (parseFloat(contract.total_amount) || 0) - totalPaid);

    let newStatus = newBalanceDue <= 0 ? 'CANCELADO' : 'ACTIVO';
    let cancellationDate = null;
    if (newStatus === 'CANCELADO') {
      const lastRemainingPay = payments.length > 0 ? payments[payments.length - 1] : null;
      cancellationDate = (lastRemainingPay && lastRemainingPay.payment_date)
        ? formatToYMD(lastRemainingPay.payment_date)
        : (formatToYMD(contract.date_str) || formatToYMD(new Date()));
    }

    // IMPORTANTE: NO sobreescribir initial_payment (primer adelanto estático).
    await dbRun(
      `UPDATE contracts SET balance_due = ?, status = ?, cancellation_date = ? WHERE id = ?`,
      [newBalanceDue, newStatus, cancellationDate, id]
    );

    await exportSnapshot(dbAll);

    return res.json({
      success: true,
      message: 'Abono eliminado y saldo actualizado.',
      total_paid: totalPaid,
      balance_due: newBalanceDue,
      status: newStatus,
      payments
    });
  } catch (err) {
    console.error('Error deleting contract payment:', err);
    return res.status(500).json({ success: false, error: 'Error al eliminar abono: ' + err.message });
  }
};

exports.getGlobalBalanceStats = async (req, res) => {
  try {
    const totalContractsRow = await dbGet(`SELECT COUNT(*) as count FROM contracts`);
    const activeContractsRow = await dbGet(`SELECT COUNT(*) as count FROM contracts WHERE status = 'ACTIVO'`);
    const cancelledContractsRow = await dbGet(`SELECT COUNT(*) as count FROM contracts WHERE status = 'CANCELADO' OR status = 'ENTREGADO'`);

    const totalAmountRow = await dbGet(`SELECT SUM(total_amount) as total FROM contracts`);
    const totalPaymentsRow = await dbGet(`SELECT SUM(amount) as total FROM contract_payments`);

    const totalContractsAmount = totalAmountRow ? totalAmountRow.total || 0 : 0;
    const totalCollectedAmount = totalPaymentsRow ? totalPaymentsRow.total || 0 : 0;
    const totalPendingAmount = Math.max(0, totalContractsAmount - totalCollectedAmount);

    return res.json({
      success: true,
      stats: {
        total_contracts: totalContractsRow ? totalContractsRow.count : 0,
        active_contracts: activeContractsRow ? activeContractsRow.count : 0,
        cancelled_contracts: cancelledContractsRow ? cancelledContractsRow.count : 0,
        total_contract_value: totalContractsAmount,
        total_collected: totalCollectedAmount,
        total_pending: totalPendingAmount,
      },
    });
  } catch (err) {
    console.error('Error fetching global balance stats:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener resumen de balance global.' });
  }
};

// Anular o Reactivar contrato
exports.toggleAnularContract = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await dbGet(`SELECT * FROM contracts WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Contrato no encontrado.' });
    }

    if (existing.status === 'ANULADO') {
      // Reactivar contrato
      const isPaid = (existing.balance_due <= 0 && existing.total_amount > 0);
      const restoredStatus = isPaid ? 'CANCELADO' : 'ACTIVO';
      const restoredOrder = isPaid ? 'ENTREGADO / CANCELADO' : 'PRODUCCION';

      await dbRun(
        `UPDATE contracts SET status = ?, order_status = ? WHERE id = ?`,
        [restoredStatus, restoredOrder, existing.id]
      );

      return res.json({
        success: true,
        message: `Contrato N° ${existing.contract_code} REACTIVADO correctamente.`,
        status: restoredStatus,
        order_status: restoredOrder
      });
    } else {
      // Anular contrato
      await dbRun(
        `UPDATE contracts SET status = 'ANULADO', order_status = 'ANULADO' WHERE id = ?`,
        [existing.id]
      );

      return res.json({
        success: true,
        message: `Contrato N° ${existing.contract_code} marcado como ANULADO.`,
        status: 'ANULADO',
        order_status: 'ANULADO'
      });
    }
  } catch (err) {
    console.error('Error toggling anular contract:', err);
    return res.status(500).json({ success: false, error: 'Error al cambiar estado de anulación: ' + err.message });
  }
};

// Obtener todas las observaciones pendientes (Contratos, Ingresos y Egresos observados)
function parseObservationNoteAndResponse(rawText) {
  if (!rawText) return { note: '', response: null, isResolvedByVendedora: false };
  const text = String(rawText).trim();
  const arregladoMatch = text.match(/(?:💬\s*)?\[(?:ARREGLADO|Descargo)[^\]]*\]:\s*([\s\S]+)$/i);
  if (arregladoMatch) {
    const response = arregladoMatch[1].trim();
    const note = text.substring(0, arregladoMatch.index).trim();
    return {
      note: note || text,
      response,
      isResolvedByVendedora: true
    };
  }
  return {
    note: text,
    response: null,
    isResolvedByVendedora: false
  };
}

// Obtener todas las observaciones pendientes (Contratos, Ingresos, Egresos, Banco y Notas Adhesivas)
exports.getPendingObservations = async (req, res) => {
  try {
    // 1. Contratos con observaciones no resueltas
    const contracts = await dbAll(
      `SELECT id, contract_code, client_name, vendedor_name, observations, date_str, total_amount, balance_due, status
       FROM contracts
       WHERE observations IS NOT NULL 
         AND TRIM(observations) != ''
         AND observations NOT LIKE '%[RESUELTO]%'
       ORDER BY id DESC`
    );

    // 2. Ingresos de planilla diaria observados o arreglados
    const incomeEntries = await dbAll(
      `SELECT id, date_str, contract_num, details, amount_paid, total_amount, vendedor_name, audit_status, audit_note
       FROM daily_income_entries
       WHERE audit_status IN ('OBSERVADO', 'ARREGLADO')
       ORDER BY id DESC`
    );

    // 3. Egresos de planilla diaria observados o arreglados
    const expenseEntries = await dbAll(
      `SELECT id, date_str, expense_type, details, amount, staff_name, payment_type, audit_status, audit_note
       FROM daily_expense_entries
       WHERE audit_status IN ('OBSERVADO', 'ARREGLADO')
       ORDER BY id DESC`
    );

    // 4. Movimientos bancarios observados o arreglados
    let bankEntries = [];
    try {
      bankEntries = await dbAll(
        `SELECT id, date, bank_name, transaction_type, amount, reference_code, notes, audit_note, status
         FROM bank_reconciliation
         WHERE status IN ('OBSERVADO', 'ARREGLADO')
         ORDER BY id DESC`
      );
    } catch (_) {}

    // 5. Notas Adhesivas Directas
    let directNotes = [];
    try {
      directNotes = await dbAll(
        `SELECT id, category, reference_id, title, content, response, status, created_by_name, resolved_by_name, created_at, resolved_at
         FROM sticky_notes
         WHERE status != 'APROBADO_ADMIN'
         ORDER BY id DESC`
      );
    } catch (_) {}

    const items = [
      ...contracts.map(c => {
        const parsed = parseObservationNoteAndResponse(c.observations);
        return {
          id: `contract_${c.id}`,
          raw_id: c.id,
          category: 'CONTRATO',
          code: c.contract_code,
          title: `Contrato N° ${c.contract_code} - ${c.client_name || 'Cliente'}`,
          vendedor: c.vendedor_name || 'Vendedora',
          date: formatToYMD(c.date_str),
          amount: c.total_amount,
          balance_due: c.balance_due,
          note: parsed.note,
          response: parsed.response,
          status: parsed.isResolvedByVendedora ? 'ARREGLADO' : 'PENDIENTE',
          client: c.client_name || '-',
          details: `Total: S/ ${(c.total_amount || 0).toFixed(2)} | Saldo: S/ ${(c.balance_due || 0).toFixed(2)}`
        };
      }),
      ...incomeEntries.map(i => {
        const parsed = parseObservationNoteAndResponse(i.audit_note);
        const isArr = i.audit_status === 'ARREGLADO' || parsed.isResolvedByVendedora;
        return {
          id: `income_${i.id}`,
          raw_id: i.id,
          category: 'INGRESO',
          code: i.contract_num || '-',
          title: `Ingreso Caja (Contrato ${i.contract_num || '-'})`,
          vendedor: i.vendedor_name || 'Vendedora',
          date: formatToYMD(i.date_str),
          amount: i.amount_paid,
          note: parsed.note,
          response: parsed.response,
          status: isArr ? 'ARREGLADO' : 'PENDIENTE',
          client: '-',
          details: i.details || `Cobro contrato ${i.contract_num || '-'}`
        };
      }),
      ...expenseEntries.map(e => {
        const parsed = parseObservationNoteAndResponse(e.audit_note);
        const isArr = e.audit_status === 'ARREGLADO' || parsed.isResolvedByVendedora;
        return {
          id: `expense_${e.id}`,
          raw_id: e.id,
          category: 'EGRESO',
          code: e.expense_type || 'GASTO',
          title: `Egreso Caja: ${e.expense_type || 'Gasto'}`,
          vendedor: e.staff_name || 'Personal',
          date: formatToYMD(e.date_str),
          amount: e.amount,
          note: parsed.note,
          response: parsed.response,
          status: isArr ? 'ARREGLADO' : 'PENDIENTE',
          client: '-',
          details: e.details || e.expense_type || 'Gasto registrado'
        };
      }),
      ...bankEntries.map(b => {
        const parsed = parseObservationNoteAndResponse(b.audit_note);
        const isArr = b.status === 'ARREGLADO' || parsed.isResolvedByVendedora;
        return {
          id: `bank_${b.id}`,
          raw_id: b.id,
          category: 'BANCO',
          code: b.bank_name || 'BANCO',
          title: `Movimiento Banco: ${b.bank_name || 'Banco'} (${b.transaction_type || 'MOV'})`,
          transaction_type: b.transaction_type || 'INGRESO',
          vendedor: 'Vendedora',
          date: formatToYMD(b.date),
          amount: b.amount,
          note: parsed.note,
          response: parsed.response,
          status: isArr ? 'ARREGLADO' : 'PENDIENTE',
          client: '-',
          details: b.notes ? `${b.notes}${b.reference_code ? ` (Ref: ${b.reference_code})` : ''}` : (b.reference_code ? `Ref: ${b.reference_code}` : 'Movimiento Bancario')
        };
      }),
      ...directNotes.map(d => ({
        id: `stickynote_${d.id}`,
        raw_id: d.id,
        category: 'NOTA_RAPIDA',
        code: 'STICKY NOTE',
        title: d.title || 'Nota de Administración',
        vendedor: 'Vendedora',
        date: formatToYMD(d.created_at),
        amount: null,
        note: d.content,
        response: d.response,
        status: d.status === 'RESUELTO_POR_VENDEDORA' ? 'ARREGLADO' : 'PENDIENTE',
        client: '-',
        details: `Enviado por: ${d.created_by_name || 'Administrador'}`
      }))
    ];

    const pendingCount = items.filter(it => it.status === 'PENDIENTE').length;
    const resolvedCount = items.filter(it => it.status === 'ARREGLADO').length;

    return res.json({
      success: true,
      count: items.length,
      pendingCount,
      resolvedCount,
      items
    });
  } catch (err) {
    console.error('Error fetching pending observations:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener observaciones pendientes: ' + err.message });
  }
};

// Responder / Justificar / Marcar como Arreglado por parte de la Vendedora
exports.justifyObservation = async (req, res) => {
  try {
    const { category, raw_id, justification } = req.body;
    if (!justification || !justification.trim()) {
      return res.status(400).json({ success: false, error: 'Debe ingresar una justificación o detalle de cómo se corrigió.' });
    }

    const cleanJust = justification.trim();
    const who = req.user ? (req.user.full_name || req.user.username) : 'Vendedora';
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const nowStr = `${day}/${month} ${hours}:${mins}`;

    if (category === 'CONTRATO') {
      const existing = await dbGet(`SELECT observations FROM contracts WHERE id = ?`, [raw_id]);
      if (existing) {
        const updatedNote = (existing.observations ? existing.observations + '\n' : '') + `💬 [ARREGLADO por ${who} (${nowStr})]: ${cleanJust}`;
        await dbRun(`UPDATE contracts SET observations = ? WHERE id = ?`, [updatedNote, raw_id]);
      }
    } else if (category === 'INGRESO') {
      const existing = await dbGet(`SELECT audit_note FROM daily_income_entries WHERE id = ?`, [raw_id]);
      if (existing) {
        const updatedNote = (existing.audit_note ? existing.audit_note + '\n' : '') + `💬 [ARREGLADO por ${who} (${nowStr})]: ${cleanJust}`;
        await dbRun(`UPDATE daily_income_entries SET audit_status = 'ARREGLADO', audit_note = ? WHERE id = ?`, [updatedNote, raw_id]);
      }
    } else if (category === 'EGRESO') {
      const existing = await dbGet(`SELECT audit_note FROM daily_expense_entries WHERE id = ?`, [raw_id]);
      if (existing) {
        const updatedNote = (existing.audit_note ? existing.audit_note + '\n' : '') + `💬 [ARREGLADO por ${who} (${nowStr})]: ${cleanJust}`;
        await dbRun(`UPDATE daily_expense_entries SET audit_status = 'ARREGLADO', audit_note = ? WHERE id = ?`, [updatedNote, raw_id]);
      }
    } else if (category === 'BANCO') {
      const existing = await dbGet(`SELECT audit_note FROM bank_reconciliation WHERE id = ?`, [raw_id]);
      if (existing) {
        const updatedNote = (existing.audit_note ? existing.audit_note + '\n' : '') + `💬 [ARREGLADO por ${who} (${nowStr})]: ${cleanJust}`;
        await dbRun(`UPDATE bank_reconciliation SET status = 'ARREGLADO', audit_note = ? WHERE id = ?`, [updatedNote, raw_id]);
      }
    } else if (category === 'NOTA_RAPIDA') {
      await dbRun(
        `UPDATE sticky_notes SET status = 'RESUELTO_POR_VENDEDORA', response = ?, resolved_by_name = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [cleanJust, who, raw_id]
      );
    }

    return res.json({ success: true, message: 'Corrección / descargo enviado exitosamente a Administración.' });
  } catch (err) {
    console.error('Error justifying observation:', err);
    return res.status(500).json({ success: false, error: 'Error al enviar justificación: ' + err.message });
  }
};

// Aprobar y retirar observación definitivamente (Administrador)
exports.resolveAnyObservation = async (req, res) => {
  try {
    const { category, raw_id } = req.body;
    const who = req.user ? (req.user.full_name || req.user.username) : 'Administrador';

    if (category === 'CONTRATO') {
      await dbRun(`UPDATE contracts SET observations = '' WHERE id = ?`, [raw_id]);
    } else if (category === 'INGRESO') {
      await dbRun(`UPDATE daily_income_entries SET audit_status = 'CONFORME', audit_note = '' WHERE id = ?`, [raw_id]);
    } else if (category === 'EGRESO') {
      await dbRun(`UPDATE daily_expense_entries SET audit_status = 'CONFORME', audit_note = '' WHERE id = ?`, [raw_id]);
    } else if (category === 'BANCO') {
      await dbRun(`UPDATE bank_reconciliation SET status = 'VERIFICADO', audit_note = '' WHERE id = ?`, [raw_id]);
    } else if (category === 'NOTA_RAPIDA') {
      await dbRun(`UPDATE sticky_notes SET status = 'APROBADO_ADMIN', approved_by_name = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?`, [who, raw_id]);
    }

    return res.json({ success: true, message: 'Observación aprobada y retirada exitosamente.' });
  } catch (err) {
    console.error('Error resolving observation:', err);
    return res.status(500).json({ success: false, error: 'Error al aprobar observación: ' + err.message });
  }
};

// Editar indicación u observación de una nota (Administrador)
exports.updateObservation = async (req, res) => {
  try {
    const { category, raw_id, new_note } = req.body;
    if (!new_note || !new_note.trim()) {
      return res.status(400).json({ success: false, error: 'La nota no puede estar vacía.' });
    }

    const cleanNote = new_note.trim();

    if (category === 'CONTRATO') {
      await dbRun(`UPDATE contracts SET observations = ? WHERE id = ?`, [cleanNote, raw_id]);
    } else if (category === 'INGRESO') {
      await dbRun(`UPDATE daily_income_entries SET audit_note = ? WHERE id = ?`, [cleanNote, raw_id]);
    } else if (category === 'EGRESO') {
      await dbRun(`UPDATE daily_expense_entries SET audit_note = ? WHERE id = ?`, [cleanNote, raw_id]);
    } else if (category === 'BANCO') {
      await dbRun(`UPDATE bank_reconciliation SET audit_note = ? WHERE id = ?`, [cleanNote, raw_id]);
    } else if (category === 'NOTA_RAPIDA') {
      await dbRun(`UPDATE sticky_notes SET content = ? WHERE id = ?`, [cleanNote, raw_id]);
    }

    return res.json({ success: true, message: 'Nota actualizada correctamente.' });
  } catch (err) {
    console.error('Error updating observation:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar nota: ' + err.message });
  }
};

// Re-observar (Rebotar observación a la Vendedora con nueva indicación)
exports.reobserveObservation = async (req, res) => {
  try {
    const { category, raw_id, new_note } = req.body;
    if (!new_note || !new_note.trim()) {
      return res.status(400).json({ success: false, error: 'Debe ingresar la nueva indicación o motivo de re-observación.' });
    }

    const cleanNote = new_note.trim();
    const who = req.user ? (req.user.full_name || req.user.username) : 'Administrador';
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const nowStr = `${day}/${month} ${hours}:${mins}`;
    const formattedNewNote = `⚠️ [Re-observado por ${who} (${nowStr})]: ${cleanNote}`;

    if (category === 'CONTRATO') {
      await dbRun(`UPDATE contracts SET observations = ? WHERE id = ?`, [formattedNewNote, raw_id]);
    } else if (category === 'INGRESO') {
      await dbRun(`UPDATE daily_income_entries SET audit_status = 'OBSERVADO', audit_note = ? WHERE id = ?`, [formattedNewNote, raw_id]);
    } else if (category === 'EGRESO') {
      await dbRun(`UPDATE daily_expense_entries SET audit_status = 'OBSERVADO', audit_note = ? WHERE id = ?`, [formattedNewNote, raw_id]);
    } else if (category === 'BANCO') {
      await dbRun(`UPDATE bank_reconciliation SET status = 'OBSERVADO', audit_note = ? WHERE id = ?`, [formattedNewNote, raw_id]);
    } else if (category === 'NOTA_RAPIDA') {
      await dbRun(`UPDATE sticky_notes SET status = 'PENDIENTE_VENDEDORA', content = ?, response = NULL WHERE id = ?`, [formattedNewNote, raw_id]);
    }

    return res.json({ success: true, message: 'Observación rebotada a la vendedora.' });
  } catch (err) {
    console.error('Error re-observing item:', err);
    return res.status(500).json({ success: false, error: 'Error al re-observar: ' + err.message });
  }
};

// Crear Nota Adhesiva Directa (Administrador a Vendedora)
exports.createStickyNote = async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'El contenido de la nota no puede estar vacío.' });
    }
    const who = req.user ? (req.user.full_name || req.user.username) : 'Administrador';
    const cleanTitle = (title && title.trim()) ? title.trim() : 'Nota de Administración';
    const cleanContent = content.trim();

    const result = await dbRun(
      `INSERT INTO sticky_notes (category, title, content, status, created_by_name)
       VALUES ('NOTA_RAPIDA', ?, ?, 'PENDIENTE_VENDEDORA', ?)`,
      [cleanTitle, cleanContent, who]
    );

    return res.status(201).json({
      success: true,
      message: 'Stick de Nota enviado a la vendedora con éxito.',
      id: result.id
    });
  } catch (err) {
    console.error('Error creating sticky note:', err);
    return res.status(500).json({ success: false, error: 'Error al crear stick de nota: ' + err.message });
  }
};

// Resolver observación de contrato (Administrador - compatibilidad retroactiva)
exports.resolveContractObservation = async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun(`UPDATE contracts SET observations = '' WHERE id = ?`, [id]);
    return res.json({ success: true, message: 'Observación resuelta y retirada.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// Eliminar / Descartar nota u observación permanentemente (Administrador)
exports.deleteObservation = async (req, res) => {
  try {
    const { category, raw_id } = req.body;
    if (!category || !raw_id) {
      return res.status(400).json({ success: false, error: 'Faltan parámetros requeridos (category, raw_id).' });
    }

    if (category === 'NOTA_RAPIDA') {
      await dbRun(`DELETE FROM sticky_notes WHERE id = ?`, [raw_id]);
    } else if (category === 'BANCO') {
      await dbRun(`UPDATE bank_reconciliation SET status = 'VERIFICADO', audit_note = NULL WHERE id = ?`, [raw_id]);
    } else if (category === 'CONTRATO') {
      await dbRun(`UPDATE contracts SET observations = '' WHERE id = ?`, [raw_id]);
    } else if (category === 'INGRESO') {
      await dbRun(`UPDATE daily_income_entries SET audit_status = 'CONFORME', audit_note = '' WHERE id = ?`, [raw_id]);
    } else if (category === 'EGRESO') {
      await dbRun(`UPDATE daily_expense_entries SET audit_status = 'CONFORME', audit_note = '' WHERE id = ?`, [raw_id]);
    }

    return res.json({ success: true, message: 'Stick de nota / observación eliminada permanentemente.' });
  } catch (err) {
    console.error('Error deleting observation:', err);
    return res.status(500).json({ success: false, error: 'Error al eliminar observación: ' + err.message });
  }
};

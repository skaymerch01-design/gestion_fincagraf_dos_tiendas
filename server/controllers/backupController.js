const path = require('path');
const fs = require('fs');
const { dbPath, dbGet, dbRun, dbAll, isPg } = require('../config/db');

exports.getBackupStatus = async (req, res) => {
  try {
    const config = await dbGet(`SELECT * FROM drive_config WHERE id = 1`);
    let dbSizeMB = '0.50';

    if (!isPg && dbPath && fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      dbSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    } else if (isPg) {
      dbSizeMB = 'Nube (Activa)';
    }

    const defaultConfig = {
      is_connected: 1,
      backup_frequency: 'DIARIO',
      drive_folder_id: '193jDdet5al8Vf-XtOnipY3Ls_0Us3elL',
      drive_folder_url: 'https://drive.google.com/drive/folders/193jDdet5al8Vf-XtOnipY3Ls_0Us3elL?usp=drive_link'
    };

    const finalConfig = config ? {
      ...config,
      is_connected: 1,
      drive_folder_id: config.drive_folder_id || defaultConfig.drive_folder_id,
      drive_folder_url: config.drive_folder_url || defaultConfig.drive_folder_url
    } : defaultConfig;

    return res.json({
      success: true,
      config: finalConfig,
      dbSizeMB,
      message: 'Base de datos en la nube (Supabase) activa.',
    });
  } catch (err) {
    console.error('Error fetching backup status:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener estado de copias de seguridad.' });
  }
};

exports.updateDriveConfig = async (req, res) => {
  try {
    const { is_connected, drive_folder_id, drive_folder_url, backup_frequency } = req.body;

    const isConnectedVal = (is_connected || drive_folder_id || drive_folder_url) ? 1 : 0;

    await dbRun(
      `INSERT INTO drive_config (id, is_connected, drive_folder_id, drive_folder_url, backup_frequency)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         is_connected = excluded.is_connected,
         drive_folder_id = excluded.drive_folder_id,
         drive_folder_url = excluded.drive_folder_url,
         backup_frequency = excluded.backup_frequency`,
      [isConnectedVal, drive_folder_id || null, drive_folder_url || null, backup_frequency || 'DIARIO']
    );

    return res.json({ success: true, message: 'Configuración de Google Drive actualizada.' });
  } catch (err) {
    console.error('Error updating drive config:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar configuración de respaldo.' });
  }
};

exports.downloadDatabaseBackup = async (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (isPg) {
      // Export live data from Supabase as a JSON snapshot file
      const users = await dbAll(`SELECT id, username, role, full_name, created_at FROM users`);
      const daily_cash_sheets = await dbAll(`SELECT * FROM daily_cash_sheets`);
      const daily_income_entries = await dbAll(`SELECT * FROM daily_income_entries`);
      const daily_expense_entries = await dbAll(`SELECT * FROM daily_expense_entries`);
      const contracts = await dbAll(`SELECT * FROM contracts`);
      const contract_payments = await dbAll(`SELECT * FROM contract_payments`);
      const expenses = await dbAll(`SELECT * FROM expenses`);
      const admin_weekly_adjustments = await dbAll(`SELECT * FROM admin_weekly_adjustments`);
      const payment_schedule = await dbAll(`SELECT * FROM payment_schedule`);
      const bank_reconciliation = await dbAll(`SELECT * FROM bank_reconciliation`);
      const sunat_invoices = await dbAll(`SELECT * FROM sunat_invoices`);
      const staff_loans = await dbAll(`SELECT * FROM staff_loans`);
      const staff_loan_payments = await dbAll(`SELECT * FROM staff_loan_payments`);
      const bank_weekly_openings = await dbAll(`SELECT * FROM bank_weekly_openings`);

      const backupData = {
        exported_at: new Date().toISOString(),
        database: 'Supabase PostgreSQL',
        users,
        daily_cash_sheets,
        daily_income_entries,
        daily_expense_entries,
        contracts,
        contract_payments,
        expenses,
        admin_weekly_adjustments,
        payment_schedule,
        bank_reconciliation,
        sunat_invoices,
        staff_loans,
        staff_loan_payments,
        bank_weekly_openings
      };

      const filename = `fincagraf_backup_${timestamp}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
      return res.send(JSON.stringify(backupData, null, 2));
    }

    if (!dbPath || !fs.existsSync(dbPath)) {
      return res.status(404).json({ success: false, error: 'Base de datos no encontrada.' });
    }

    const filename = `fincagraf_backup_${timestamp}.db`;
    res.download(dbPath, filename, (err) => {
      if (err) {
        console.error('Error sending backup file:', err);
      }
    });
  } catch (err) {
    console.error('Error creating database backup:', err);
    return res.status(500).json({ success: false, error: 'Error al generar copia de seguridad.' });
  }
};

exports.restoreDatabaseBackup = async (req, res) => {
  let uploadedPath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se subió ningún archivo de respaldo.' });
    }

    uploadedPath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.json') {
      const raw = fs.readFileSync(uploadedPath, 'utf8');
      const snapshot = JSON.parse(raw);

      if (isPg) {
        // Direct upsert into live Supabase PostgreSQL tables
        const restoreTable = async (items, insertFn) => {
          if (!Array.isArray(items) || items.length === 0) return;
          for (const item of items) {
            try {
              await insertFn(item);
            } catch (err) {
              console.warn('Warning inserting item:', err.message);
            }
          }
        };

        // 1. Users
        await restoreTable(snapshot.users, (u) =>
          dbRun(
            `INSERT INTO users (id, username, password_hash, role, full_name)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               username = excluded.username,
               password_hash = COALESCE(excluded.password_hash, users.password_hash),
               role = excluded.role,
               full_name = excluded.full_name`,
            [u.id, u.username, u.password_hash || null, u.role || 'vendedora', u.full_name || u.username]
          )
        );

        // 2. Daily Cash Sheets
        await restoreTable(snapshot.daily_cash_sheets, (item) =>
          dbRun(
            `INSERT INTO daily_cash_sheets (id, date_str, previous_cash)
             VALUES (?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               date_str = excluded.date_str,
               previous_cash = excluded.previous_cash`,
            [item.id, item.date_str, item.previous_cash || 0]
          )
        );

        // 3. Daily Income Entries
        await restoreTable(snapshot.daily_income_entries, (item) =>
          dbRun(
            `INSERT INTO daily_income_entries (id, date_str, entry_type, contract_num, details, total_amount, amount_paid, payment_type, status, registered_by, audit_status, audit_note, vendedor_name, initial_payment, initial_payment_type, final_payment, final_payment_type, efectivo_paid, bcp_paid, bbva_paid, pos_paid, yape_paid)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               date_str = excluded.date_str,
               entry_type = excluded.entry_type,
               contract_num = excluded.contract_num,
               details = excluded.details,
               total_amount = excluded.total_amount,
               amount_paid = excluded.amount_paid,
               payment_type = excluded.payment_type,
               status = excluded.status,
               registered_by = excluded.registered_by,
               audit_status = excluded.audit_status,
               audit_note = excluded.audit_note,
               vendedor_name = excluded.vendedor_name,
               initial_payment = excluded.initial_payment,
               initial_payment_type = excluded.initial_payment_type,
               final_payment = excluded.final_payment,
               final_payment_type = excluded.final_payment_type,
               efectivo_paid = excluded.efectivo_paid,
               bcp_paid = excluded.bcp_paid,
               bbva_paid = excluded.bbva_paid,
               pos_paid = excluded.pos_paid,
               yape_paid = excluded.yape_paid`,
            [
              item.id, item.date_str, item.entry_type || 'CONTRATO', item.contract_num || '', item.details || '',
              item.total_amount || 0, item.amount_paid || 0, item.payment_type || 'EFECTIVO', item.status || 'ACTIVO',
              item.registered_by || null, item.audit_status || 'PENDIENTE', item.audit_note || '',
              item.vendedor_name || null, item.initial_payment || 0, item.initial_payment_type || null,
              item.final_payment || 0, item.final_payment_type || null,
              item.efectivo_paid || 0, item.bcp_paid || 0, item.bbva_paid || 0, item.pos_paid || 0, item.yape_paid || 0
            ]
          )
        );

        // 4. Daily Expense Entries
        await restoreTable(snapshot.daily_expense_entries, (item) =>
          dbRun(
            `INSERT INTO daily_expense_entries (id, date_str, expense_type, details, amount, payment_type, registered_by, audit_status, audit_note, staff_name, weekly_discount, staff_loan_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               date_str = excluded.date_str,
               expense_type = excluded.expense_type,
               details = excluded.details,
               amount = excluded.amount,
               payment_type = excluded.payment_type,
               registered_by = excluded.registered_by,
               audit_status = excluded.audit_status,
               audit_note = excluded.audit_note,
               staff_name = excluded.staff_name,
               weekly_discount = excluded.weekly_discount,
               staff_loan_id = excluded.staff_loan_id`,
            [
              item.id, item.date_str, item.expense_type || 'General', item.details || '', item.amount || 0,
              item.payment_type || 'EFECTIVO', item.registered_by || null, item.audit_status || 'PENDIENTE',
              item.audit_note || '', item.staff_name || null, item.weekly_discount || 0, item.staff_loan_id || null
            ]
          )
        );

        // 5. Contracts
        await restoreTable(snapshot.contracts, (c) =>
          dbRun(
            `INSERT INTO contracts (id, date_str, contract_code, vendedor_name, client_name, quantity, description, total_amount, initial_payment, balance_due, status, observations, created_by, items)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               date_str = excluded.date_str,
               contract_code = excluded.contract_code,
               vendedor_name = excluded.vendedor_name,
               client_name = excluded.client_name,
               quantity = excluded.quantity,
               description = excluded.description,
               total_amount = excluded.total_amount,
               initial_payment = excluded.initial_payment,
               balance_due = excluded.balance_due,
               status = excluded.status,
               observations = excluded.observations,
               created_by = excluded.created_by,
               items = excluded.items`,
            [
              c.id, c.date_str, c.contract_code, c.vendedor_name || '', c.client_name || '', c.quantity || 1,
              c.description || '', c.total_amount || 0, c.initial_payment || 0, c.balance_due || 0,
              c.status || 'ACTIVO', c.observations || '', c.created_by || null,
              c.items ? (typeof c.items === 'object' ? JSON.stringify(c.items) : c.items) : null
            ]
          )
        );

        // 6. Contract Payments
        await restoreTable(snapshot.contract_payments, (cp) =>
          dbRun(
            `INSERT INTO contract_payments (id, contract_id, date_str, amount_paid, payment_type, notes)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               contract_id = excluded.contract_id,
               date_str = excluded.date_str,
               amount_paid = excluded.amount_paid,
               payment_type = excluded.payment_type,
               notes = excluded.notes`,
            [cp.id, cp.contract_id, cp.date_str, cp.amount_paid || 0, cp.payment_type || 'EFECTIVO', cp.notes || '']
          )
        );

        // 7. Expenses
        await restoreTable(snapshot.expenses, (ex) =>
          dbRun(
            `INSERT INTO expenses (id, date, category, description, amount, payment_method, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               date = excluded.date,
               category = excluded.category,
               description = excluded.description,
               amount = excluded.amount,
               payment_method = excluded.payment_method,
               notes = excluded.notes,
               created_by = excluded.created_by`,
            [ex.id, ex.date, ex.category || '', ex.description || '', ex.amount || 0, ex.payment_method || 'EFECTIVO', ex.notes || '', ex.created_by || null]
          )
        );

        // 8. Payment Schedule
        await restoreTable(snapshot.payment_schedule, (ps) =>
          dbRun(
            `INSERT INTO payment_schedule (id, contract_id, due_date, amount_due, amount_paid, is_paid)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               contract_id = excluded.contract_id,
               due_date = excluded.due_date,
               amount_due = excluded.amount_due,
               amount_paid = excluded.amount_paid,
               is_paid = excluded.is_paid`,
            [ps.id, ps.contract_id, ps.due_date, ps.amount_due || 0, ps.amount_paid || 0, ps.is_paid ? 1 : 0]
          )
        );

        // 9. Bank Reconciliation
        await restoreTable(snapshot.bank_reconciliation, (b) =>
          dbRun(
            `INSERT INTO bank_reconciliation (id, date, bank_name, transaction_type, amount, reference_code, image_url, status, notes, verified_by, audit_note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               date = excluded.date,
               bank_name = excluded.bank_name,
               transaction_type = excluded.transaction_type,
               amount = excluded.amount,
               reference_code = excluded.reference_code,
               image_url = excluded.image_url,
               status = excluded.status,
               notes = excluded.notes,
               verified_by = excluded.verified_by,
               audit_note = excluded.audit_note`,
            [b.id, b.date, b.bank_name, b.transaction_type, b.amount || 0, b.reference_code || null, b.image_url || null, b.status || 'PENDIENTE', b.notes || null, b.verified_by || null, b.audit_note || '']
          )
        );

        // 10. Sunat Invoices
        await restoreTable(snapshot.sunat_invoices, (s) =>
          dbRun(
            `INSERT INTO sunat_invoices (id, invoice_number, date_str, buyer_ruc, buyer_name, invoice_type, amount_taxed, igv, total_amount, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               invoice_number = excluded.invoice_number,
               date_str = excluded.date_str,
               buyer_ruc = excluded.buyer_ruc,
               buyer_name = excluded.buyer_name,
               invoice_type = excluded.invoice_type,
               amount_taxed = excluded.amount_taxed,
               igv = excluded.igv,
               total_amount = excluded.total_amount,
               status = excluded.status`,
            [s.id, s.invoice_number, s.date_str, s.buyer_ruc || '', s.buyer_name || '', s.invoice_type || 'FACTURA', s.amount_taxed || 0, s.igv || 0, s.total_amount || 0, s.status || 'REGISTRADO']
          )
        );

        // 11. Staff Loans
        await restoreTable(snapshot.staff_loans, (sl) =>
          dbRun(
            `INSERT INTO staff_loans (id, date_str, staff_name, total_amount, weekly_discount, amount_paid, balance_due, status, notes, expense_entry_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               date_str = excluded.date_str,
               staff_name = excluded.staff_name,
               total_amount = excluded.total_amount,
               weekly_discount = excluded.weekly_discount,
               amount_paid = excluded.amount_paid,
               balance_due = excluded.balance_due,
               status = excluded.status,
               notes = excluded.notes,
               expense_entry_id = excluded.expense_entry_id,
               created_by = excluded.created_by`,
            [sl.id, sl.date_str, sl.staff_name, sl.total_amount || 0, sl.weekly_discount || 0, sl.amount_paid || 0, sl.balance_due || 0, sl.status || 'ACTIVO', sl.notes || null, sl.expense_entry_id || null, sl.created_by || null]
          )
        );

        // 12. Staff Loan Payments
        await restoreTable(snapshot.staff_loan_payments, (slp) =>
          dbRun(
            `INSERT INTO staff_loan_payments (id, loan_id, date_str, amount_paid, notes)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               loan_id = excluded.loan_id,
               date_str = excluded.date_str,
               amount_paid = excluded.amount_paid,
               notes = excluded.notes`,
            [slp.id, slp.loan_id, slp.date_str, slp.amount_paid || 0, slp.notes || '']
          )
        );

        // 13. Bank Weekly Openings
        await restoreTable(snapshot.bank_weekly_openings, (bwo) =>
          dbRun(
            `INSERT INTO bank_weekly_openings (week_start, opening_balance, notes)
             VALUES (?, ?, ?)
             ON CONFLICT(week_start) DO UPDATE SET
               opening_balance = excluded.opening_balance,
               notes = excluded.notes,
               updated_at = CURRENT_TIMESTAMP`,
            [bwo.week_start, bwo.opening_balance || 0, bwo.notes || null]
          )
        );

        // Reset PostgreSQL ID sequences for all primary keys
        const seqTables = [
          'users', 'daily_cash_sheets', 'daily_income_entries', 'daily_expense_entries',
          'contracts', 'contract_payments', 'expenses', 'payment_schedule',
          'bank_reconciliation', 'sunat_invoices', 'staff_loans', 'staff_loan_payments', 'bank_weekly_openings'
        ];
        for (const tbl of seqTables) {
          try {
            await dbRun(`SELECT setval(pg_get_serial_sequence('${tbl}', 'id'), COALESCE((SELECT MAX(id) FROM ${tbl}), 1))`);
          } catch (_) {}
        }

        if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
        return res.json({ success: true, message: '¡Copia de seguridad JSON restaurada con éxito en la base de datos en la nube!' });
      }

      // SQLite fallback mode
      const { restoreSnapshot } = require('../config/snapshotSync');
      const { snapshotPath } = require('../config/snapshotSync');
      if (snapshotPath && fs.existsSync(path.dirname(snapshotPath))) {
        fs.writeFileSync(snapshotPath, raw, 'utf8');
      }
      await restoreSnapshot(dbRun, dbGet);
      if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
      return res.json({ success: true, message: '¡Copia de seguridad JSON restaurada con éxito!' });
    } else if (ext === '.db' || ext === '.sqlite') {
      if (isPg) {
        if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
        return res.status(400).json({ success: false, error: 'La base de datos actual es Supabase en la nube. Por favor restaure una copia en formato .json' });
      }
      fs.copyFileSync(uploadedPath, dbPath);
      if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
      const { exportSnapshot } = require('../config/snapshotSync');
      await exportSnapshot(dbAll);
      return res.json({ success: true, message: '¡Base de datos restaurada con éxito!' });
    } else {
      if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
      return res.status(400).json({ success: false, error: 'Formato inválido. Suba un archivo .json' });
    }
  } catch (err) {
    if (uploadedPath && fs.existsSync(uploadedPath)) {
      try { fs.unlinkSync(uploadedPath); } catch (_) {}
    }
    console.error('Error restoring database backup:', err);
    return res.status(500).json({ success: false, error: 'Error al restaurar copia: ' + err.message });
  }
};

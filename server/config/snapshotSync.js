const fs = require('fs');
const path = require('path');

let dataDir = process.env.DATA_DIR || null;
if (!dataDir && process.env.RENDER && fs.existsSync('/var/data')) {
  dataDir = '/var/data';
}

const snapshotPath = process.env.SNAPSHOT_PATH || (dataDir && fs.existsSync(dataDir) ? path.join(dataDir, 'db_snapshot.json') : path.resolve(__dirname, '../../db_snapshot.json'));
const fallbackSnapshotPath = path.resolve(__dirname, '../../db_snapshot.json');

async function exportSnapshot(dbAll) {
  const { isPg } = require('./db');
  if (isPg) {
    // With Supabase active, the cloud PostgreSQL database is already persistent and safe.
    // We don't need to block operations doing 14 heavy SELECT queries on every single click!
    return;
  }
  try {
    const users = await dbAll(`SELECT * FROM users`);
    const drive_config = await dbAll(`SELECT * FROM drive_config`);
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

    const snapshot = {
      updated_at: new Date().toISOString(),
      users,
      drive_config,
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

    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
    console.log('✅ DB Snapshot successfully saved to db_snapshot.json');
    return snapshot;
  } catch (err) {
    console.error('Error exporting snapshot:', err);
    return null;
  }
}

async function restoreSnapshot(dbRun, dbGet) {
  try {
    let targetPath = snapshotPath;
    if (!fs.existsSync(targetPath)) {
      if (fs.existsSync(fallbackSnapshotPath)) {
        targetPath = fallbackSnapshotPath;
      } else {
        return;
      }
    }
    const raw = fs.readFileSync(targetPath, 'utf8');
    if (!raw || raw.trim().length === 0) return;
    const snapshot = JSON.parse(raw);
    if (!snapshot) return;

    // Restore users
    if (Array.isArray(snapshot.users)) {
      for (const u of snapshot.users) {
        await dbRun(
          `INSERT INTO users (id, username, password_hash, role, full_name)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             username = excluded.username,
             password_hash = excluded.password_hash,
             role = excluded.role,
             full_name = excluded.full_name`,
          [u.id, u.username, u.password_hash, u.role, u.full_name]
        );
      }
    }

    // Restore drive_config
    if (Array.isArray(snapshot.drive_config)) {
      for (const d of snapshot.drive_config) {
        await dbRun(
          `INSERT INTO drive_config (id, is_connected, backup_frequency, drive_folder_id, drive_folder_url, last_backup_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             is_connected = excluded.is_connected,
             backup_frequency = excluded.backup_frequency,
             drive_folder_id = excluded.drive_folder_id,
             drive_folder_url = excluded.drive_folder_url,
             last_backup_at = excluded.last_backup_at`,
          [d.id, d.is_connected, d.backup_frequency || 'DIARIO', d.drive_folder_id || null, d.drive_folder_url || null, d.last_backup_at || null]
        );
      }
    }

    // Restore daily_cash_sheets
    if (Array.isArray(snapshot.daily_cash_sheets)) {
      for (const item of snapshot.daily_cash_sheets) {
        await dbRun(
          `INSERT INTO daily_cash_sheets (id, date_str, previous_cash)
           VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             date_str = excluded.date_str,
             previous_cash = excluded.previous_cash`,
          [item.id, item.date_str, item.previous_cash]
        );
      }
    }

    // Restore daily_income_entries
    if (Array.isArray(snapshot.daily_income_entries)) {
      for (const item of snapshot.daily_income_entries) {
        await dbRun(
          `INSERT INTO daily_income_entries (id, date_str, entry_type, contract_num, details, total_amount, amount_paid, payment_type, status, registered_by, audit_status, audit_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
             audit_note = excluded.audit_note`,
          [
            item.id, item.date_str, item.entry_type || 'CONTRATO', item.contract_num || '', item.details || '',
            item.total_amount || 0, item.amount_paid || 0, item.payment_type || 'EFECTIVO', item.status || 'ACTIVO',
            item.registered_by || null, item.audit_status || 'PENDIENTE', item.audit_note || ''
          ]
        );
      }
    }

    // Restore daily_expense_entries
    if (Array.isArray(snapshot.daily_expense_entries)) {
      for (const item of snapshot.daily_expense_entries) {
        await dbRun(
          `INSERT INTO daily_expense_entries (id, date_str, expense_type, details, amount, payment_type, registered_by, audit_status, audit_note, staff_name, weekly_discount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
             weekly_discount = excluded.weekly_discount`,
          [
            item.id, item.date_str, item.expense_type || 'General', item.details || '', item.amount || 0,
            item.payment_type || 'EFECTIVO', item.registered_by || null, item.audit_status || 'PENDIENTE',
            item.audit_note || '', item.staff_name || null, item.weekly_discount || 0
          ]
        );
      }
    }

    // Restore bank_reconciliation
    if (Array.isArray(snapshot.bank_reconciliation)) {
      for (const item of snapshot.bank_reconciliation) {
        await dbRun(
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
          [
            item.id, item.date, item.bank_name, item.transaction_type, item.amount || 0,
            item.reference_code || null, item.image_url || null, item.status || 'PENDIENTE',
            item.notes || null, item.verified_by || null, item.audit_note || ''
          ]
        );
      }
    }

    // Restore staff_loans
    if (Array.isArray(snapshot.staff_loans)) {
      for (const item of snapshot.staff_loans) {
        await dbRun(
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
          [
            item.id, item.date_str, item.staff_name, item.total_amount || 0, item.weekly_discount || 0,
            item.amount_paid || 0, item.balance_due || 0, item.status || 'ACTIVO', item.notes || null,
            item.expense_entry_id || null, item.created_by || null
          ]
        );
      }
    }

    console.log('✅ DB Snapshot successfully restored into SQLite!');
  } catch (err) {
    console.error('Error restoring snapshot:', err);
  }
}

module.exports = {
  exportSnapshot,
  restoreSnapshot,
  snapshotPath
};

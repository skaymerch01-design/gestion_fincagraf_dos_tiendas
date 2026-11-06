const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createSchema() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('vendedora', 'administrador')) NOT NULL,
      full_name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_cash_sheets (
      id SERIAL PRIMARY KEY,
      date_str TEXT UNIQUE NOT NULL,
      previous_cash NUMERIC DEFAULT 0.0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_income_entries (
      id SERIAL PRIMARY KEY,
      date_str TEXT NOT NULL,
      entry_type TEXT DEFAULT 'CONTRATO',
      contract_num TEXT NOT NULL,
      details TEXT NOT NULL,
      total_amount NUMERIC DEFAULT 0.0,
      amount_paid NUMERIC NOT NULL DEFAULT 0.0,
      payment_type TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVO',
      registered_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      initial_payment NUMERIC DEFAULT 0.0,
      initial_payment_type TEXT,
      final_payment NUMERIC DEFAULT 0.0,
      final_payment_type TEXT,
      efectivo_paid NUMERIC DEFAULT 0.0,
      bcp_paid NUMERIC DEFAULT 0.0,
      bbva_paid NUMERIC DEFAULT 0.0,
      pos_paid NUMERIC DEFAULT 0.0,
      yape_paid NUMERIC DEFAULT 0.0,
      audit_status TEXT DEFAULT 'PENDIENTE',
      audit_note TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS daily_expense_entries (
      id SERIAL PRIMARY KEY,
      date_str TEXT NOT NULL,
      expense_type TEXT DEFAULT 'General',
      details TEXT NOT NULL,
      amount NUMERIC NOT NULL DEFAULT 0.0,
      payment_type TEXT NOT NULL,
      registered_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      staff_name TEXT,
      weekly_discount NUMERIC DEFAULT 0.0,
      audit_status TEXT DEFAULT 'PENDIENTE',
      audit_note TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY,
      contract_code TEXT UNIQUE NOT NULL,
      client_name TEXT NOT NULL,
      client_dni TEXT,
      total_amount NUMERIC NOT NULL DEFAULT 0.0,
      initial_payment NUMERIC NOT NULL DEFAULT 0.0,
      balance_due NUMERIC NOT NULL DEFAULT 0.0,
      status TEXT CHECK(status IN ('ACTIVO', 'CANCELADO', 'ENTREGADO', 'ANULADO')) NOT NULL DEFAULT 'ACTIVO',
      cancellation_date TIMESTAMP,
      notes TEXT,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contract_payments (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL,
      payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      amount NUMERIC NOT NULL,
      receipt_number TEXT,
      notes TEXT,
      registered_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      expense_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      category TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      description TEXT NOT NULL,
      is_contract_related INTEGER DEFAULT 0,
      contract_id INTEGER,
      registered_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_weekly_adjustments (
      id SERIAL PRIMARY KEY,
      week_identifier TEXT NOT NULL,
      item_type TEXT CHECK(item_type IN ('EXPENSE', 'CONTRACT', 'GENERAL')) NOT NULL,
      target_id INTEGER,
      admin_note TEXT NOT NULL,
      adjustment_amount NUMERIC DEFAULT 0.0,
      status TEXT DEFAULT 'REVISADO',
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_schedule (
      id SERIAL PRIMARY KEY,
      concept TEXT NOT NULL,
      category TEXT NOT NULL,
      due_date DATE NOT NULL,
      amount NUMERIC NOT NULL,
      status TEXT CHECK(status IN ('PENDIENTE', 'PAGADO', 'REGISTRADO_POR_VENDEDORA')) NOT NULL DEFAULT 'PENDIENTE',
      payment_date TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bank_reconciliation (
      id SERIAL PRIMARY KEY,
      date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      bank_name TEXT NOT NULL,
      transaction_type TEXT CHECK(transaction_type IN ('INGRESO', 'EGRESO')) NOT NULL,
      amount NUMERIC NOT NULL,
      reference_code TEXT,
      image_url TEXT,
      status TEXT DEFAULT 'PENDIENTE',
      notes TEXT,
      audit_note TEXT DEFAULT '',
      verified_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sunat_invoices (
      id SERIAL PRIMARY KEY,
      period TEXT NOT NULL,
      type TEXT CHECK(type IN ('VENTA', 'COMPRA')) NOT NULL,
      doc_type TEXT CHECK(doc_type IN ('FACTURA', 'BOLETA')) NOT NULL,
      doc_number TEXT NOT NULL,
      issue_date DATE NOT NULL,
      customer_supplier_name TEXT NOT NULL,
      ruc_dni TEXT,
      subtotal NUMERIC NOT NULL,
      igv NUMERIC NOT NULL,
      total NUMERIC NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS staff_loans (
      id SERIAL PRIMARY KEY,
      date_str TEXT NOT NULL,
      staff_name TEXT NOT NULL,
      total_amount NUMERIC NOT NULL DEFAULT 0.0,
      weekly_discount NUMERIC NOT NULL DEFAULT 0.0,
      amount_paid NUMERIC NOT NULL DEFAULT 0.0,
      balance_due NUMERIC NOT NULL DEFAULT 0.0,
      status TEXT CHECK(status IN ('ACTIVO', 'LIQUIDADO')) NOT NULL DEFAULT 'ACTIVO',
      notes TEXT,
      expense_entry_id INTEGER,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS staff_loan_payments (
      id SERIAL PRIMARY KEY,
      loan_id INTEGER NOT NULL REFERENCES staff_loans(id) ON DELETE CASCADE,
      date_str TEXT NOT NULL,
      amount NUMERIC NOT NULL DEFAULT 0.0,
      notes TEXT,
      registered_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS drive_config (
      id SERIAL PRIMARY KEY,
      is_connected INTEGER DEFAULT 1,
      backup_frequency TEXT DEFAULT 'DIARIO',
      drive_folder_id TEXT DEFAULT '193jDdet5al8Vf-XtOnipY3Ls_0Us3elL',
      last_backup_at TIMESTAMP,
      drive_folder_url TEXT DEFAULT 'https://drive.google.com/drive/folders/193jDdet5al8Vf-XtOnipY3Ls_0Us3elL'
    );
  `;

  await pool.query(ddl);
  console.log('✅ ALL Supabase PostgreSQL tables created successfully!');
  await pool.end();
}

createSchema().catch(err => {
  console.error('Schema creation error:', err);
  process.exit(1);
});

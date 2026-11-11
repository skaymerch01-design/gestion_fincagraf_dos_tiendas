const { Pool, types } = require('pg');
// Parse NUMERIC / DECIMAL (type ID 1700) as floating point number instead of string
types.setTypeParser(1700, (val) => (val === null ? 0 : parseFloat(val)));
// Parse INT8 / BIGINT (type ID 20) as integer
types.setTypeParser(20, (val) => (val === null ? 0 : parseInt(val, 10)));

let sqlite3 = null;
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const SUPABASE_DEFAULT_URL = 'postgresql://postgres.xzubrgqwthzrgrhjnzbz:PERUlima22*@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const databaseUrl = process.env.DATABASE_URL || SUPABASE_DEFAULT_URL;

let isPg = false;
let pgPool = null;

if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
  isPg = true;
  pgPool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  console.log('🌐 Connected to Supabase Cloud PostgreSQL Database (Sistema 2 Tiendas)!');
}

let db = null;
let dbPath = null;

if (!isPg) {
  try {
    sqlite3 = require('sqlite3').verbose();
  } catch (e) {
    console.warn('SQLite3 driver not installed (using PostgreSQL cloud database).');
  }
  let dataDir = process.env.DATA_DIR || null;
  if (!dataDir && process.env.RENDER && fs.existsSync('/var/data')) {
    dataDir = '/var/data';
  }

  dbPath = process.env.DB_PATH;
  if (!dbPath) {
    if (dataDir && fs.existsSync(dataDir)) {
      dbPath = path.join(dataDir, 'fincagraf.db');
    } else {
      dbPath = path.resolve(__dirname, '../../fincagraf.db');
    }
  }

  if (sqlite3) db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
    } else {
      console.log('Connected to SQLite database at:', dbPath);
    }
  });
}

function convertSqlToPg(sql) {
  let paramIndex = 1;
  let inString = false;
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      inString = !inString;
      out += ch;
    } else if (ch === '?' && !inString) {
      out += `$${paramIndex++}`;
    } else {
      out += ch;
    }
  }
  return out;
}

const dbRun = async (sql, params = []) => {
  const cleanParams = (params || []).map(p => (p === undefined ? null : p));

  if (isPg) {
    const trimmed = sql.trim();
    const isInsert = /^INSERT\s+INTO/i.test(trimmed);
    const hasReturning = /RETURNING/i.test(trimmed);

    let pgSql = convertSqlToPg(sql);
    if (isInsert && !hasReturning) {
      pgSql = pgSql.replace(/;?\s*$/, ' RETURNING id;');
    }

    try {
      const res = await pgPool.query(pgSql, cleanParams);
      const insertId = (res.rows && res.rows[0] && res.rows[0].id) ? res.rows[0].id : 0;
      return { id: insertId, changes: res.rowCount || 0 };
    } catch (err) {
      if (err.message && err.message.includes('column "id" does not exist')) {
        const withoutReturning = convertSqlToPg(sql);
        const res2 = await pgPool.query(withoutReturning, cleanParams);
        return { id: 0, changes: res2.rowCount || 0 };
      }
      throw err;
    }
  }

  return new Promise((resolve, reject) => {
    db.run(sql, cleanParams, function (err) {
      if (err) reject(err);
      else resolve({ id: this ? this.lastID : 0, changes: this ? this.changes : 0 });
    });
  });
};

const dbGet = async (sql, params = []) => {
  const cleanParams = (params || []).map(p => (p === undefined ? null : p));

  if (isPg) {
    const pgSql = convertSqlToPg(sql);
    const res = await pgPool.query(pgSql, cleanParams);
    return res.rows[0] || null;
  }

  return new Promise((resolve, reject) => {
    db.get(sql, cleanParams, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = async (sql, params = []) => {
  const cleanParams = (params || []).map(p => (p === undefined ? null : p));

  if (isPg) {
    const pgSql = convertSqlToPg(sql);
    const res = await pgPool.query(pgSql, cleanParams);
    return res.rows || [];
  }

  return new Promise((resolve, reject) => {
    db.all(sql, cleanParams, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

async function initDatabase() {
  if (isPg) {
    console.log('✅ Supabase PostgreSQL is active. Persistent cloud storage enabled (2 Tiendas).');
    
    // 1. Crear todas las tablas base para el nuevo sistema multi-tienda
    const pgTables = [
      `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT CHECK(role IN ('vendedora', 'administrador')) NOT NULL,
        full_name TEXT NOT NULL,
        store_id INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS daily_cash_sheets (
        id SERIAL PRIMARY KEY,
        date_str TEXT NOT NULL,
        store_id INTEGER DEFAULT 1,
        previous_cash NUMERIC DEFAULT 0.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_daily_cash_sheets_date_store UNIQUE (date_str, store_id)
      );`,

      `CREATE TABLE IF NOT EXISTS daily_income_entries (
        id SERIAL PRIMARY KEY,
        date_str TEXT NOT NULL,
        store_id INTEGER DEFAULT 1,
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
        vendedor_name TEXT,
        audit_status TEXT DEFAULT 'PENDIENTE',
        audit_note TEXT DEFAULT ''
      );`,

      `CREATE TABLE IF NOT EXISTS daily_expense_entries (
        id SERIAL PRIMARY KEY,
        date_str TEXT NOT NULL,
        store_id INTEGER DEFAULT 1,
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
      );`,

      `CREATE TABLE IF NOT EXISTS contracts (
        id SERIAL PRIMARY KEY,
        store_id INTEGER DEFAULT 1,
        contract_code TEXT UNIQUE NOT NULL,
        client_name TEXT NOT NULL,
        client_dni TEXT,
        vendedor_name TEXT,
        quantity TEXT DEFAULT '1',
        description TEXT,
        total_amount NUMERIC NOT NULL DEFAULT 0.0,
        initial_payment NUMERIC NOT NULL DEFAULT 0.0,
        balance_due NUMERIC NOT NULL DEFAULT 0.0,
        status TEXT DEFAULT 'ACTIVO',
        cancellation_date TIMESTAMP,
        notes TEXT,
        observations TEXT,
        items TEXT,
        date_str TEXT,
        payment_type TEXT,
        delivery_date TEXT,
        order_status TEXT DEFAULT 'PRODUCCION',
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS contract_payments (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER NOT NULL,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        amount NUMERIC NOT NULL,
        payment_type TEXT,
        receipt_number TEXT,
        notes TEXT,
        registered_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        store_id INTEGER DEFAULT 1,
        expense_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        category TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        description TEXT NOT NULL,
        is_contract_related INTEGER DEFAULT 0,
        contract_id INTEGER,
        registered_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS admin_weekly_adjustments (
        id SERIAL PRIMARY KEY,
        week_identifier TEXT NOT NULL,
        item_type TEXT NOT NULL,
        target_id INTEGER,
        admin_note TEXT NOT NULL,
        adjustment_amount NUMERIC DEFAULT 0.0,
        status TEXT DEFAULT 'REVISADO',
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS payment_schedule (
        id SERIAL PRIMARY KEY,
        concept TEXT NOT NULL,
        category TEXT NOT NULL,
        due_date DATE NOT NULL,
        amount NUMERIC NOT NULL,
        status TEXT DEFAULT 'PENDIENTE',
        payment_date TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS bank_reconciliation (
        id SERIAL PRIMARY KEY,
        store_id INTEGER DEFAULT 1,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        bank_name TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        reference_code TEXT,
        image_url TEXT,
        status TEXT DEFAULT 'PENDIENTE',
        notes TEXT,
        audit_note TEXT DEFAULT '',
        verified_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS sunat_invoices (
        id SERIAL PRIMARY KEY,
        period TEXT NOT NULL,
        type TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        doc_number TEXT NOT NULL,
        issue_date DATE NOT NULL,
        customer_supplier_name TEXT NOT NULL,
        ruc_dni TEXT,
        subtotal NUMERIC NOT NULL,
        igv NUMERIC NOT NULL,
        total NUMERIC NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS staff_loans (
        id SERIAL PRIMARY KEY,
        date_str TEXT NOT NULL,
        staff_name TEXT NOT NULL,
        total_amount NUMERIC NOT NULL DEFAULT 0.0,
        weekly_discount NUMERIC NOT NULL DEFAULT 0.0,
        amount_paid NUMERIC NOT NULL DEFAULT 0.0,
        balance_due NUMERIC NOT NULL DEFAULT 0.0,
        status TEXT DEFAULT 'ACTIVO',
        notes TEXT,
        expense_entry_id INTEGER,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS staff_loan_payments (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES staff_loans(id),
        amount NUMERIC NOT NULL,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        discount_type TEXT DEFAULT 'PLANILLA',
        notes TEXT,
        registered_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS drive_config (
        id SERIAL PRIMARY KEY,
        is_connected BOOLEAN DEFAULT FALSE,
        backup_frequency TEXT DEFAULT 'DIARIO',
        drive_folder_id TEXT,
        drive_folder_url TEXT,
        last_backup_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS sticky_notes (
        id SERIAL PRIMARY KEY,
        category TEXT DEFAULT 'NOTA_RAPIDA',
        reference_id TEXT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        response TEXT,
        status TEXT DEFAULT 'PENDIENTE_VENDEDORA',
        created_by_name TEXT DEFAULT 'Administrador',
        resolved_by_name TEXT,
        approved_by_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP,
        approved_at TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS bank_weekly_openings (
        id SERIAL PRIMARY KEY,
        week_start TEXT NOT NULL UNIQUE,
        opening_balance REAL DEFAULT 0,
        notes TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`
    ];

    for (const sql of pgTables) {
      try {
        await dbRun(sql);
      } catch (tableErr) {
        console.warn('Postgres table creation note:', tableErr.message);
      }
    }

    // 2. Migraciones incrementales para garantizar store_id en todas las tablas
    const pgMigrations = [
      `ALTER TABLE daily_cash_sheets ADD COLUMN IF NOT EXISTS store_id INTEGER DEFAULT 1;`,
      `ALTER TABLE daily_income_entries ADD COLUMN IF NOT EXISTS store_id INTEGER DEFAULT 1;`,
      `ALTER TABLE daily_expense_entries ADD COLUMN IF NOT EXISTS store_id INTEGER DEFAULT 1;`,
      `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS store_id INTEGER DEFAULT 1;`,
      `ALTER TABLE bank_reconciliation ADD COLUMN IF NOT EXISTS store_id INTEGER DEFAULT 1;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id INTEGER DEFAULT 1;`
    ];

    for (const sql of pgMigrations) {
      try {
        await dbRun(sql);
      } catch (migErr) {
        console.warn('Postgres column migration note:', migErr.message);
      }
    }

    // 3. Crear usuarios iniciales si la tabla de usuarios está vacía
    try {
      const usersCount = await dbGet(`SELECT COUNT(*) as count FROM users;`);
      if (!usersCount || parseInt(usersCount.count || 0, 10) === 0) {
        const hashAdmin = await bcrypt.hash('admin123', 10);
        const hashVendedora = await bcrypt.hash('vendedora123', 10);
        await dbRun(
          `INSERT INTO users (username, password_hash, role, full_name, store_id) VALUES (?, ?, ?, ?, ?)`,
          ['admin', hashAdmin, 'administrador', 'Administrador General', null]
        );
        await dbRun(
          `INSERT INTO users (username, password_hash, role, full_name, store_id) VALUES (?, ?, ?, ?, ?)`,
          ['vendedora1', hashVendedora, 'vendedora', 'Vendedora Tienda 1', 1]
        );
        await dbRun(
          `INSERT INTO users (username, password_hash, role, full_name, store_id) VALUES (?, ?, ?, ?, ?)`,
          ['vendedora2', hashVendedora, 'vendedora', 'Vendedora Tienda 2', 2]
        );
        console.log('✅ Default users initialized for 2 stores (admin, vendedora1, vendedora2).');
      }
    } catch (uErr) {
      console.warn('Seed users note:', uErr.message);
    }

    return;
  }

  // SQLite fallback initialization
  await dbRun(`PRAGMA foreign_keys = ON;`);
  await dbRun(`PRAGMA journal_mode = WAL;`);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('vendedora', 'administrador')) NOT NULL,
      full_name TEXT NOT NULL,
      store_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS daily_cash_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_str TEXT NOT NULL,
      store_id INTEGER DEFAULT 1,
      previous_cash REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (date_str, store_id)
    );
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS daily_income_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_str TEXT NOT NULL,
      store_id INTEGER DEFAULT 1,
      entry_type TEXT DEFAULT 'CONTRATO',
      contract_num TEXT NOT NULL,
      details TEXT NOT NULL,
      total_amount REAL DEFAULT 0.0,
      amount_paid REAL NOT NULL DEFAULT 0.0,
      payment_type TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVO',
      registered_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      vendedor_name TEXT,
      audit_status TEXT DEFAULT 'PENDIENTE',
      audit_note TEXT DEFAULT '',
      initial_payment REAL DEFAULT 0,
      initial_payment_type TEXT,
      final_payment REAL DEFAULT 0,
      final_payment_type TEXT,
      efectivo_paid REAL DEFAULT 0,
      bcp_paid REAL DEFAULT 0,
      bbva_paid REAL DEFAULT 0,
      pos_paid REAL DEFAULT 0,
      yape_paid REAL DEFAULT 0,
      FOREIGN KEY (registered_by) REFERENCES users(id)
    );
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS daily_expense_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_str TEXT NOT NULL,
      store_id INTEGER DEFAULT 1,
      expense_type TEXT DEFAULT 'General',
      details TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0.0,
      payment_type TEXT NOT NULL,
      registered_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      staff_name TEXT,
      weekly_discount REAL DEFAULT 0.0,
      audit_status TEXT DEFAULT 'PENDIENTE',
      audit_note TEXT DEFAULT '',
      FOREIGN KEY (registered_by) REFERENCES users(id)
    );
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      contract_code TEXT UNIQUE NOT NULL,
      client_name TEXT NOT NULL,
      client_dni TEXT,
      vendedor_name TEXT,
      quantity TEXT DEFAULT '1',
      description TEXT,
      total_amount REAL NOT NULL DEFAULT 0.0,
      initial_payment REAL NOT NULL DEFAULT 0.0,
      balance_due REAL NOT NULL DEFAULT 0.0,
      status TEXT DEFAULT 'ACTIVO',
      cancellation_date DATETIME,
      notes TEXT,
      observations TEXT,
      items TEXT,
      date_str TEXT,
      payment_type TEXT,
      delivery_date TEXT,
      order_status TEXT DEFAULT 'PRODUCCION',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS contract_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      amount REAL NOT NULL,
      payment_type TEXT,
      receipt_number TEXT,
      notes TEXT,
      registered_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (registered_by) REFERENCES users(id)
    );
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS payment_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concept TEXT NOT NULL,
      category TEXT NOT NULL,
      due_date DATE NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'PENDIENTE',
      payment_date DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS sticky_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT DEFAULT 'NOTA_RAPIDA',
      reference_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      response TEXT,
      status TEXT DEFAULT 'PENDIENTE_VENDEDORA',
      created_by_name TEXT DEFAULT 'Administrador',
      resolved_by_name TEXT,
      approved_by_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      approved_at DATETIME
    );
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS bank_weekly_openings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL UNIQUE,
      opening_balance REAL DEFAULT 0,
      notes TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migraciones SQLite
  try { await dbRun(`ALTER TABLE daily_cash_sheets ADD COLUMN store_id INTEGER DEFAULT 1;`); } catch (_) {}
  try { await dbRun(`ALTER TABLE daily_income_entries ADD COLUMN store_id INTEGER DEFAULT 1;`); } catch (_) {}
  try { await dbRun(`ALTER TABLE daily_expense_entries ADD COLUMN store_id INTEGER DEFAULT 1;`); } catch (_) {}
  try { await dbRun(`ALTER TABLE contracts ADD COLUMN store_id INTEGER DEFAULT 1;`); } catch (_) {}
  try { await dbRun(`ALTER TABLE users ADD COLUMN store_id INTEGER DEFAULT 1;`); } catch (_) {}

  // Crear usuarios iniciales SQLite
  try {
    const usersCount = await dbGet(`SELECT COUNT(*) as count FROM users;`);
    if (!usersCount || parseInt(usersCount.count || 0, 10) === 0) {
      const hashAdmin = await bcrypt.hash('admin123', 10);
      const hashVendedora = await bcrypt.hash('vendedora123', 10);
      await dbRun(
        `INSERT INTO users (username, password_hash, role, full_name, store_id) VALUES (?, ?, ?, ?, ?)`,
        ['admin', hashAdmin, 'administrador', 'Administrador General', null]
      );
      await dbRun(
        `INSERT INTO users (username, password_hash, role, full_name, store_id) VALUES (?, ?, ?, ?, ?)`,
        ['vendedora1', hashVendedora, 'vendedora', 'Vendedora Tienda 1', 1]
      );
      await dbRun(
        `INSERT INTO users (username, password_hash, role, full_name, store_id) VALUES (?, ?, ?, ?, ?)`,
        ['vendedora2', hashVendedora, 'vendedora', 'Vendedora Tienda 2', 2]
      );
    }
  } catch (_) {}
}

initDatabase().catch((err) => {
  console.error('Failed to initialize database schema:', err);
});

module.exports = {
  db,
  dbPath,
  dbRun,
  dbGet,
  dbAll,
  isPg
};

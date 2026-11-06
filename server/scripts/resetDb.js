const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../fincagraf.db');
const db = new sqlite3.Database(dbPath);

console.log('🧹 Limpiando base de datos FINCAGRAF...');

const tables = [
  'daily_income_entries',
  'daily_expense_entries',
  'daily_cash_sheets',
  'contracts',
  'contract_payments',
  'expenses',
  'bank_entries',
  'payment_schedules',
  'sunat_invoices'
];

db.serialize(() => {
  tables.forEach(t => {
    db.run(`DELETE FROM ${t};`, [], () => {});
  });
  db.run(`DELETE FROM sqlite_sequence WHERE name != 'users';`, [], () => {
    console.log('✅ Base de datos limpiada al 100%. Todos los registros están en CERO.');
  });
});

db.close();

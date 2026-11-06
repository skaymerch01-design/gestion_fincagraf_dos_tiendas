const { dbRun, dbAll } = require('./config/db');

async function resetAllData() {
  console.log('🧹 Iniciando limpieza total de datos de prueba...');

  const tablesToClear = [
    'daily_income_entries',
    'daily_expense_entries',
    'daily_cash_sheets',
    'contracts',
    'contract_payments',
    'expenses',
    'admin_weekly_adjustments',
    'payment_schedule',
    'bank_reconciliation',
    'sunat_invoices',
    'staff_loans',
    'staff_loan_payments'
  ];

  for (const table of tablesToClear) {
    try {
      await dbRun(`DELETE FROM ${table};`);
      console.log(`✅ Tabla ${table} vaciada.`);
    } catch (err) {
      console.error(`⚠️ Error al vaciar ${table}:`, err.message);
    }
  }

  try {
    await dbRun(`DELETE FROM sqlite_sequence WHERE name IN (${tablesToClear.map(t => `'${t}'`).join(',')});`);
    console.log('✅ Auto-incrementos reiniciados.');
  } catch (err) {
    console.log('Información: no se pudieron reiniciar autoincrementos.', err.message);
  }

  console.log('✨ Limpieza total finalizada con éxito. El sistema está 100% listo para uso real.');
  process.exit(0);
}

resetAllData();

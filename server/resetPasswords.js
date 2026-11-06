const bcrypt = require('bcryptjs');
const { dbRun, dbAll, dbGet } = require('./config/db');

async function resetPasswords() {
  console.log('🔄 Restableciendo contraseñas por defecto...');

  const adminHash = await bcrypt.hash('admin123', 10);
  const vendedoraHash = await bcrypt.hash('vendedora123', 10);

  await dbRun(`UPDATE users SET password_hash = ? WHERE username = 'admin'`, [adminHash]);
  await dbRun(`UPDATE users SET password_hash = ? WHERE username = 'vendedora'`, [vendedoraHash]);

  // Check users in DB
  const users = await dbAll(`SELECT id, username, role, full_name FROM users`);
  console.log('📋 Usuarios en la base de datos:', users);

  // Test compare
  const adminUser = await dbGet(`SELECT * FROM users WHERE username = 'admin'`);
  const adminOk = await bcrypt.compare('admin123', adminUser.password_hash);
  console.log('✅ Verificación de contraseña de admin ("admin123"):', adminOk);

  const vendedoraUser = await dbGet(`SELECT * FROM users WHERE username = 'vendedora'`);
  const vendedoraOk = await bcrypt.compare('vendedora123', vendedoraUser.password_hash);
  console.log('✅ Verificación de contraseña de vendedora ("vendedora123"):', vendedoraOk);

  console.log('✨ Contraseñas restablecidas con éxito.');
  process.exit(0);
}

resetPasswords();

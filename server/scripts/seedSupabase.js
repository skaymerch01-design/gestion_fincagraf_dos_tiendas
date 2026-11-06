const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: 'postgresql://postgres.vbiedgaycufqniulmtga:PERUlima22*@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function populateFromSnapshot() {
  const snapshotPath = path.resolve(__dirname, '../../db_snapshot.json');
  if (!fs.existsSync(snapshotPath)) return;
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

  // Users
  if (Array.isArray(snapshot.users)) {
    for (const u of snapshot.users) {
      await pool.query(
        `INSERT INTO users (id, username, password_hash, role, full_name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           full_name = EXCLUDED.full_name`,
        [u.id, u.username, u.password_hash, u.role, u.full_name]
      );
    }
    await pool.query(`SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users))`);
  }

  // Drive config
  if (Array.isArray(snapshot.drive_config)) {
    for (const d of snapshot.drive_config) {
      await pool.query(
        `INSERT INTO drive_config (id, is_connected, backup_frequency, drive_folder_id, drive_folder_url)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           is_connected = EXCLUDED.is_connected,
           drive_folder_id = EXCLUDED.drive_folder_id,
           drive_folder_url = EXCLUDED.drive_folder_url`,
        [d.id, d.is_connected, d.backup_frequency, d.drive_folder_id, d.drive_folder_url]
      );
    }
  }

  // Daily cash sheets
  if (Array.isArray(snapshot.daily_cash_sheets)) {
    for (const s of snapshot.daily_cash_sheets) {
      await pool.query(
        `INSERT INTO daily_cash_sheets (id, date_str, previous_cash)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.date_str, s.previous_cash]
      );
    }
    await pool.query(`SELECT setval('daily_cash_sheets_id_seq', (SELECT COALESCE(MAX(id), 1) FROM daily_cash_sheets))`);
  }

  console.log('✅ Initial users, drive_config and sheets imported to Supabase!');
  await pool.end();
}

populateFromSnapshot().catch(err => {
  console.error('Error populating Supabase:', err);
  process.exit(1);
});

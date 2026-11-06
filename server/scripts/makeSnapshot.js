const { dbAll } = require('../config/db');
const { exportSnapshot } = require('../config/snapshotSync');

setTimeout(async () => {
  try {
    await exportSnapshot(dbAll);
    console.log('Snapshot created successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Snapshot failed:', err);
    process.exit(1);
  }
}, 1500);

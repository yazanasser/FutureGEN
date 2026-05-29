
const fs = require('fs');
const path = require('path');

try {
    console.log('Starting migration...');
    require('./scripts/migrate-routing-data.js');
    console.log('Migration finished successfully.');
} catch (err) {
    console.error('Migration failed:');
    console.error(err.message);
    console.error(err.stack);
}

const { Pool } = require('pg');
const { DB_URL } = require('../config/env');

const pool = new Pool({
  connectionString: DB_URL,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

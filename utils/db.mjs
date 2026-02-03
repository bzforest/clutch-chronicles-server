import pg from "pg";
const { Pool } = pg;

const connectionPool = new Pool({
  connectionString: process.env.CONNECTION_STRING,
});

export { connectionPool };
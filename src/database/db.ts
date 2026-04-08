import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Environment variable DATABASE_URL is not set');
}
const sql = postgres(connectionString);

export default sql;

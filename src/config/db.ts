import { Pool } from "pg";
import { env } from "./env";

// Pool = a collection of reusable DB connections
// instead of opening a new connection for every request
export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

export async function connectDB(): Promise<void> {
  try {
    // Try to get a connection — if this fails, DB is unreachable
    const client = await pool.connect();
    client.release();
    console.log("✅ PostgreSQL connected");
  } catch (error) {
    console.error("❌ PostgreSQL connection failed:", error);
    process.exit(1);
  }
}

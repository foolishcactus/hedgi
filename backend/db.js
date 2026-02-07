import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "markets.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS markets (
    ticker TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    platform TEXT NOT NULL,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_markets_title ON markets(title);
  CREATE INDEX IF NOT EXISTS idx_markets_platform ON markets(platform);
`);

const existingColumns = db
  .prepare("PRAGMA table_info(markets)")
  .all()
  .map((column) => column.name);

if (!existingColumns.includes("market_ticker")) {
  db.exec("ALTER TABLE markets ADD COLUMN market_ticker TEXT");
}

if (!existingColumns.includes("price_yes")) {
  db.exec("ALTER TABLE markets ADD COLUMN price_yes REAL");
}

export { db, dbPath };

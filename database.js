
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let dbPath = path.join(__dirname, 'mypharmacy.db');
if (fs.existsSync('/data')) {
  dbPath = '/data/mypharmacy.db';
  console.log('Using persistent disk: /data/mypharmacy.db');
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medicines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  batch TEXT NOT NULL,
  expiry TEXT NOT NULL,
  price REAL NOT NULL,
  stock INTEGER NOT NULL,
  purchase_price REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  subtotal REAL NOT NULL,
  discount REAL DEFAULT 0,
  total REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  medicine_id INTEGER NOT NULL,
  medicine_name TEXT NOT NULL,
  price REAL NOT NULL,
  purchase_price REAL DEFAULT 0,
  quantity INTEGER NOT NULL,
  total REAL NOT NULL,
  FOREIGN KEY(sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier TEXT NOT NULL,
  invoice_number TEXT,
  total REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
  medicine_id INTEGER NOT NULL,
  medicine_name TEXT NOT NULL,
  purchase_price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  total REAL NOT NULL,
  FOREIGN KEY(purchase_id) REFERENCES purchases(id)
);
`);

console.log('Database connected successfully!');
module.exports = db;

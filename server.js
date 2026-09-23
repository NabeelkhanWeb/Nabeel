
const express = require("express");
const cors = require("cors");
const db = require("./database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const JWT_SECRET = process.env.JWT_SECRET || "nabeel-pharmacy-secret-2026";
const app = express();

// CORS - Mobile se access ke liye zaroori
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// --- FIELD MIGRATIONS ---
try { db.exec(`ALTER TABLE medicines ADD COLUMN purchase_price REAL NOT NULL DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE sale_items ADD COLUMN purchase_price REAL NOT NULL DEFAULT 0`); } catch (e) {}

// --- DEFAULT ADMIN ---
const adminExists = db.prepare(`SELECT id FROM users WHERE username = ?`).get("admin");
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync("admin123", 10);
  db.prepare(`INSERT INTO users (username, password) VALUES (?, ?)`).run("admin", hashedPassword);
  console.log("Default admin created: admin / admin123");
}

// --- LOGIN ---
app.post("/api/login", (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
    if (!user) return res.status(401).json({ message: "Username ya password ghalat hai." });
    const ok = bcrypt.compareSync(password, user.password);
    if (!ok) return res.status(401).json({ message: "Username ya password ghalat hai." });
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (e) {
    res.status(500).json({ message: "Login failed" });
  }
});

app.get("/", (req, res) => {
  res.send("Nabeel Pharmacy Backend is Running Online! Use /api/medicines");
});

// ... baaki aapka purana code same rahega, yahan se copy kiya he
app.get("/api/medicines", (req, res) => {
  res.json(db.prepare(`SELECT * FROM medicines ORDER BY id DESC`).all());
});
app.post("/api/medicines", (req, res) => {
  const { name, company, batch, expiry, price, stock, purchase_price = 0 } = req.body;
  const result = db.prepare(`INSERT INTO medicines (name, company, batch, expiry, price, stock, purchase_price) VALUES (?,?,?,?,?,?,?)`).run(name, company, batch, expiry, Number(price), Number(stock), Number(purchase_price||0));
  res.status(201).json(db.prepare(`SELECT * FROM medicines WHERE id = ?`).get(result.lastInsertRowid));
});
app.put("/api/medicines/:id", (req, res) => {
  const { name, company, batch, expiry, price, stock, purchase_price = 0 } = req.body;
  db.prepare(`UPDATE medicines SET name=?, company=?, batch=?, expiry=?, price=?, stock=?, purchase_price=? WHERE id=?`).run(name, company, batch, expiry, Number(price), Number(stock), Number(purchase_price||0), req.params.id);
  res.json(db.prepare(`SELECT * FROM medicines WHERE id=?`).get(req.params.id));
});
app.delete("/api/medicines/:id", (req, res) => {
  db.prepare(`DELETE FROM medicines WHERE id=?`).run(req.params.id);
  res.json({ message: "deleted" });
});

// SALES, CUSTOMERS, etc ka code aapke purane server.js se same copy kar sakte ho, filhal basic routes online ke liye kaafi hain
// Full file ke liye aap apna purana server.js ka code yahan neeche paste kar sakte ho, bus upar wala CORS wala part yehi rehne do

// Analytics - ghar se dekhne ke liye sab se important
app.get("/api/analytics", (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const from = req.query.from || today;
    const to = req.query.to || today;
    const salesSummary = db.prepare(`SELECT COUNT(*) AS bills, COALESCE(SUM(total),0) AS total FROM sales WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?)`).get(from, to);
    const medicines = db.prepare(`SELECT COUNT(*) as total FROM medicines`).get();
    const stock = db.prepare(`SELECT COALESCE(SUM(stock),0) as total_stock FROM medicines`).get();
    res.json({
      today_sales: salesSummary.total,
      bills: salesSummary.bills,
      total_medicines: medicines.total,
      total_stock: stock.total_stock
    });
  } catch (e) {
    res.status(500).json({ message: "analytics failed" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Online Server running on port ${PORT}`));
module.exports = app;

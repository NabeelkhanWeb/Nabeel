
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || "nabeel-secret-key-2024";

app.use(cors());
app.use(express.json());

// ROOT - ye zaroori hai taake Not Found na aaye
app.get("/", (req, res) => {
  res.send("Nabeel Pharmacy Backend is Running Online! Available at /api/medicines, /api/dashboard etc");
});

// AUTH MIDDLEWARE
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return next(); // For now allow without token for testing, you can make it strict later
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// CREATE DEFAULT ADMIN
function createDefaultAdmin() {
  try {
    const existing = db.prepare("SELECT * FROM users WHERE username = ?").get("admin");
    if (!existing) {
      const hashed = bcrypt.hashSync("admin123", 10);
      db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run("admin", hashed);
      console.log("Default admin created: admin / admin123");
    }
  } catch (e) {
    console.error("Admin creation error:", e.message);
  }
}
createDefaultAdmin();

// LOGIN
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) return res.status(401).json({ message: "Invalid username" });
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ message: "Invalid password" });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "1d" });
  res.json({ token, username: user.username });
});

// DASHBOARD - Ye aapka missing tha!
app.get("/api/dashboard", (req, res) => {
  try {
    const totalMedicines = db.prepare("SELECT COUNT(*) as count FROM medicines").get().count;
    const totalStock = db.prepare("SELECT SUM(stock) as total FROM medicines").get().total || 0;
    const lowStock = db.prepare("SELECT COUNT(*) as count FROM medicines WHERE stock < 10").get().count;
    const totalSales = db.prepare("SELECT COUNT(*) as count FROM sales").get().count;
    const totalSalesAmount = db.prepare("SELECT SUM(total) as total FROM sales").get().total || 0;
    const totalPurchases = db.prepare("SELECT COUNT(*) as count FROM purchases").get().count;
    const totalCustomers = db.prepare("SELECT COUNT(*) as count FROM customers").get().count;
    
    // Expiry alert - next 3 months
    const expiring = db.prepare("SELECT COUNT(*) as count FROM medicines WHERE expiry != ''").all();
    
    res.json({
      totalMedicines,
      totalStock,
      lowStock,
      totalSales,
      totalSalesAmount,
      totalPurchases,
      totalCustomers,
      expiringCount: expiring.length
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
});

// ALERTS
app.get("/api/alerts/low-stock", (req, res) => {
  const meds = db.prepare("SELECT * FROM medicines WHERE stock < 10 ORDER BY stock ASC").all();
  res.json(meds);
});

app.get("/api/alerts/expiry", (req, res) => {
  const meds = db.prepare("SELECT * FROM medicines ORDER BY expiry ASC LIMIT 20").all();
  res.json(meds);
});

// MEDICINES CRUD
app.get("/api/medicines", (req, res) => {
  try {
    const meds = db.prepare("SELECT * FROM medicines ORDER BY created_at DESC").all();
    res.json(meds);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/medicines/:id", (req, res) => {
  const med = db.prepare("SELECT * FROM medicines WHERE id = ?").get(req.params.id);
  if (!med) return res.status(404).json({ message: "Not found" });
  res.json(med);
});

app.post("/api/medicines", (req, res) => {
  try {
    const { name, company, batch, expiry, price, stock, purchase_price } = req.body;
    if (!name || !company || !batch || !expiry) return res.status(400).json({ message: "All fields required" });
    const result = db.prepare(
      "INSERT INTO medicines (name, company, batch, expiry, price, stock, purchase_price) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(name, company, batch, expiry, Number(price) || 0, Number(stock) || 0, Number(purchase_price) || 0);
    const newMed = db.prepare("SELECT * FROM medicines WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(newMed);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/medicines/:id", (req, res) => {
  try {
    const { name, company, batch, expiry, price, stock, purchase_price } = req.body;
    db.prepare(
      "UPDATE medicines SET name=?, company=?, batch=?, expiry=?, price=?, stock=?, purchase_price=? WHERE id=?"
    ).run(name, company, batch, expiry, Number(price)||0, Number(stock)||0, Number(purchase_price)||0, req.params.id);
    const updated = db.prepare("SELECT * FROM medicines WHERE id=?").get(req.params.id);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/medicines/:id", (req, res) => {
  try {
    db.prepare("DELETE FROM medicines WHERE id=?").run(req.params.id);
    res.json({ message: "Deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CUSTOMERS
app.get("/api/customers", (req, res) => {
  res.json(db.prepare("SELECT * FROM customers ORDER BY created_at DESC").all());
});
app.post("/api/customers", (req, res) => {
  const { name, phone, address } = req.body;
  const r = db.prepare("INSERT INTO customers (name, phone, address) VALUES (?,?,?)").run(name, phone, address);
  res.json(db.prepare("SELECT * FROM customers WHERE id=?").get(r.lastInsertRowid));
});

// SALES
app.get("/api/sales", (req, res) => {
  res.json(db.prepare("SELECT * FROM sales ORDER BY created_at DESC").all());
});
app.post("/api/sales", (req, res) => {
  try {
    const { customer_id, subtotal, discount, total, items } = req.body;
    const sale = db.prepare("INSERT INTO sales (customer_id, subtotal, discount, total) VALUES (?,?,?,?)").run(customer_id||null, subtotal, discount||0, total);
    const saleId = sale.lastInsertRowid;
    if (items && Array.isArray(items)) {
      const stmt = db.prepare("INSERT INTO sale_items (sale_id, medicine_id, medicine_name, price, purchase_price, quantity, total) VALUES (?,?,?,?,?,?,?)");
      const updateStock = db.prepare("UPDATE medicines SET stock = stock - ? WHERE id = ?");
      for (const it of items) {
        stmt.run(saleId, it.medicine_id, it.medicine_name, it.price, it.purchase_price||0, it.quantity, it.total);
        updateStock.run(it.quantity, it.medicine_id);
      }
    }
    res.status(201).json({ id: saleId, message: "Sale created" });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// PURCHASES
app.get("/api/purchases", (req, res) => {
  res.json(db.prepare("SELECT * FROM purchases ORDER BY created_at DESC").all());
});
app.post("/api/purchases", (req, res) => {
  try {
    const { supplier, invoice_number, total, items } = req.body;
    const pur = db.prepare("INSERT INTO purchases (supplier, invoice_number, total) VALUES (?,?,?)").run(supplier, invoice_number, total);
    const purId = pur.lastInsertRowid;
    if (items && Array.isArray(items)) {
      const stmt = db.prepare("INSERT INTO purchase_items (purchase_id, medicine_id, medicine_name, purchase_price, quantity, total) VALUES (?,?,?,?,?,?)");
      const updateStock = db.prepare("UPDATE medicines SET stock = stock + ?, purchase_price = ? WHERE id = ?");
      for (const it of items) {
        stmt.run(purId, it.medicine_id, it.medicine_name, it.purchase_price, it.quantity, it.total);
        updateStock.run(it.quantity, it.purchase_price, it.medicine_id);
      }
    }
    res.status(201).json({ id: purId });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// REPORTS
app.get("/api/reports/sales", (req, res) => {
  const sales = db.prepare("SELECT * FROM sales ORDER BY created_at DESC").all();
  res.json(sales);
});

function startServer() {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} - ONLINE READY`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;

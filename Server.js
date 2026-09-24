
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

// FIXED CORS - Allow frontend from anywhere (localhost, render, electron)
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

// Migrations
try { db.exec(`ALTER TABLE medicines ADD COLUMN purchase_price REAL NOT NULL DEFAULT 0`); } catch(e){}
try { db.exec(`ALTER TABLE sale_items ADD COLUMN purchase_price REAL NOT NULL DEFAULT 0`); } catch(e){}
try { db.exec(`ALTER TABLE sales ADD COLUMN customer_id INTEGER`); } catch(e){}

// Default admin
const adminExists = db.prepare(`SELECT id FROM users WHERE username = ?`).get("admin");
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync("admin123", 10);
  db.prepare(`INSERT INTO users (username, password) VALUES (?, ?)`).run("admin", hashedPassword);
  console.log("Default admin created: admin / admin123");
}

// Login
app.post("/api/login", (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username aur password required hai." });
    const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
    if (!user) return res.status(401).json({ message: "Username ya password ghalat hai." });
    const ok = bcrypt.compareSync(password, user.password);
    if (!ok) return res.status(401).json({ message: "Username ya password ghalat hai." });
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ message: "Login successful", token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
});

app.get("/", (req, res) => {
  res.send("Nabeel Pharmacy Backend is Running Online! Available at /api/medicines, /api/dashboard etc");
});

// MEDICINES
app.get("/api/medicines", (req, res) => {
  try { res.json(db.prepare(`SELECT * FROM medicines ORDER BY id DESC`).all()); }
  catch(e){ res.status(500).json({ message: "Medicines not load" }); }
});
app.post("/api/medicines", (req, res) => {
  const { name, company, batch, expiry, price, stock, purchase_price = 0 } = req.body;
  try {
    const r = db.prepare(`INSERT INTO medicines (name, company, batch, expiry, price, stock, purchase_price) VALUES (?,?,?,?,?,?,?)`).run(name, company, batch, expiry, Number(price), Number(stock), Number(purchase_price||0));
    res.status(201).json(db.prepare(`SELECT * FROM medicines WHERE id = ?`).get(r.lastInsertRowid));
  } catch(e){ res.status(500).json({ message: "Medicine not added" }); }
});
app.put("/api/medicines/:id", (req, res) => {
  const { name, company, batch, expiry, price, stock, purchase_price = 0 } = req.body;
  try {
    db.prepare(`UPDATE medicines SET name=?, company=?, batch=?, expiry=?, price=?, stock=?, purchase_price=? WHERE id=?`).run(name, company, batch, expiry, Number(price), Number(stock), Number(purchase_price||0), req.params.id);
    res.json(db.prepare(`SELECT * FROM medicines WHERE id=?`).get(req.params.id));
  } catch(e){ res.status(500).json({ message: "Update failed" }); }
});
app.delete("/api/medicines/:id", (req, res) => {
  try { db.prepare(`DELETE FROM medicines WHERE id=?`).run(req.params.id); res.json({ message: "deleted" }); }
  catch(e){ res.status(500).json({ message: "delete failed" }); }
});

// CUSTOMERS
app.get("/api/customers", (req,res)=>{ try{ res.json(db.prepare(`SELECT * FROM customers ORDER BY id DESC`).all()); }catch(e){res.status(500).json({message:"error"});} });
app.post("/api/customers", (req,res)=>{ const {name, phone, address}=req.body; try{ const r=db.prepare(`INSERT INTO customers (name, phone, address) VALUES (?,?,?)`).run(name, phone||"", address||""); res.status(201).json(db.prepare(`SELECT * FROM customers WHERE id=?`).get(r.lastInsertRowid)); }catch(e){res.status(500).json({message:"failed"});} });
app.put("/api/customers/:id", (req,res)=>{ const {name, phone, address}=req.body; try{ db.prepare(`UPDATE customers SET name=?, phone=?, address=? WHERE id=?`).run(name, phone, address, req.params.id); res.json(db.prepare(`SELECT * FROM customers WHERE id=?`).get(req.params.id)); }catch(e){res.status(500).json({message:"failed"});} });
app.delete("/api/customers/:id", (req,res)=>{ try{ db.prepare(`DELETE FROM customers WHERE id=?`).run(req.params.id); res.json({message:"deleted"}); }catch(e){res.status(500).json({message:"failed"});} });

// SALES
app.post("/api/sales", (req,res)=>{
  const { cart, discount=0, customerId=null, customer_id=null } = req.body;
  const finalCustomerId = customerId || customer_id || null;
  if(!cart || cart.length===0) return res.status(400).json({message:"Cart empty"});
  try{
    const txn = db.transaction(()=>{
      let subtotal=0;
      for(const item of cart){ const med=db.prepare(`SELECT * FROM medicines WHERE id=?`).get(item.id); if(!med) throw new Error(`Medicine ${item.name} not found`); if(med.stock < item.quantity) throw new Error(`Stock khatam: ${med.name}`); subtotal+=med.price*item.quantity; }
      const total=Math.max(subtotal-Number(discount||0),0);
      const saleR=db.prepare(`INSERT INTO sales (customer_id, subtotal, discount, total) VALUES (?,?,?,?)`).run(finalCustomerId, subtotal, Number(discount||0), total);
      const saleId=saleR.lastInsertRowid;
      for(const item of cart){ const med=db.prepare(`SELECT * FROM medicines WHERE id=?`).get(item.id); db.prepare(`INSERT INTO sale_items (sale_id, medicine_id, medicine_name, price, purchase_price, quantity, total) VALUES (?,?,?,?,?,?,?)`).run(saleId, med.id, med.name, med.price, med.purchase_price||0, item.quantity, med.price*item.quantity); db.prepare(`UPDATE medicines SET stock=stock-? WHERE id=?`).run(item.quantity, med.id); }
      return {saleId, subtotal, total};
    });
    const result=txn();
    res.status(201).json({message:"Sale completed", sale:result});
  }catch(e){ console.error(e); res.status(500).json({message:e.message||"Sale failed"}); }
});
app.get("/api/sales", (req,res)=>{ try{ res.json(db.prepare(`SELECT sales.*, customers.name as customer_name FROM sales LEFT JOIN customers ON sales.customer_id=customers.id ORDER BY sales.id DESC`).all()); }catch(e){res.status(500).json({message:"error"});} });
app.get("/api/sales/:id", (req,res)=>{ try{ const sale=db.prepare(`SELECT sales.*, customers.name as customer_name, customers.phone as customer_phone FROM sales LEFT JOIN customers ON sales.customer_id=customers.id WHERE sales.id=?`).get(req.params.id); if(!sale) return res.status(404).json({message:"Not found"}); const items=db.prepare(`SELECT * FROM sale_items WHERE sale_id=?`).all(req.params.id); res.json({sale, items}); }catch(e){res.status(500).json({message:"error"});} });

// PURCHASES - handle both formats
app.post("/api/purchases", (req,res)=>{
  const { supplier, invoice_number, invoiceNumber, items, total } = req.body;
  const inv = invoice_number || invoiceNumber || "";
  const finalSupplier = supplier;
  if(!finalSupplier || !items || items.length===0) return res.status(400).json({message:"Supplier and items required"});
  try{
    const txn=db.transaction(()=>{
      const pr=db.prepare(`INSERT INTO purchases (supplier, invoice_number, total) VALUES (?,?,?)`).run(finalSupplier, inv, Number(total||0));
      const pid=pr.lastInsertRowid;
      for(const it of items){
        const mid = it.medicine_id || it.medicineId || it.id;
        const mname = it.medicine_name || it.medicineName || it.name || "Unknown";
        const qty = Number(it.quantity||0);
        const pp = Number(it.purchase_price || it.purchasePrice || 0);
        const tot = pp*qty;
        db.prepare(`INSERT INTO purchase_items (purchase_id, medicine_id, medicine_name, purchase_price, quantity, total) VALUES (?,?,?,?,?,?)`).run(pid, mid, mname, pp, qty, tot);
        db.prepare(`UPDATE medicines SET stock=stock+?, purchase_price=? WHERE id=?`).run(qty, pp, mid);
      }
      return pid;
    });
    const purchaseId=txn();
    res.status(201).json({message:"Purchase added", purchaseId});
  }catch(e){ console.error(e); res.status(500).json({message:"Purchase failed"}); }
});
app.get("/api/purchases", (req,res)=>{ try{ res.json(db.prepare(`SELECT * FROM purchases ORDER BY id DESC`).all()); }catch(e){res.status(500).json({message:"error"});} });

// DASHBOARD & ALERTS - YEHI MISSING THA!
app.get("/api/dashboard", (req,res)=>{
  try{
    const today=new Date().toISOString().slice(0,10);
    const todaySales=db.prepare(`SELECT COALESCE(SUM(total),0) as total FROM sales WHERE DATE(created_at)=DATE(?)`).get(today);
    const totalSales=db.prepare(`SELECT COALESCE(SUM(total),0) as total FROM sales`).get();
    const todayBills=db.prepare(`SELECT COUNT(*) as count FROM sales WHERE DATE(created_at)=DATE(?)`).get(today);
    const medicineCount=db.prepare(`SELECT COUNT(*) as count FROM medicines`).get();
    const totalStock=db.prepare(`SELECT COALESCE(SUM(stock),0) as total FROM medicines`).get();
    const topMedicines=db.prepare(`SELECT medicine_name, SUM(quantity) as quantity FROM sale_items GROUP BY medicine_id ORDER BY quantity DESC LIMIT 5`).all();
    res.json({ todaySales:todaySales.total, totalSales:totalSales.total, todayBills:todayBills.count, totalMedicines:medicineCount.count, medicineCount:medicineCount.count, totalStock:totalStock.total, topMedicines });
  }catch(e){ console.error(e); res.status(500).json({message:"Dashboard error"}); }
});
app.get("/api/alerts", (req,res)=>{
  try{
    const lowStock=db.prepare(`SELECT * FROM medicines WHERE stock <= 10 ORDER BY stock ASC`).all();
    const expiry=db.prepare(`SELECT * FROM medicines WHERE DATE(expiry) <= DATE('now', '+30 days') ORDER BY expiry ASC`).all();
    const allMedicines=db.prepare(`SELECT COUNT(*) as count FROM medicines`).get();
    res.json({ lowStock, expiry, expiringSoon: expiry, allMedicines: allMedicines.count });
  }catch(e){ console.error(e); res.status(500).json({message:"Alerts error"}); }
});
app.get("/api/stock", (req,res)=>{ try{ res.json(db.prepare(`SELECT * FROM medicines ORDER BY stock ASC`).all()); }catch(e){res.status(500).json({message:"error"});} });

// REPORTS - for Reports.jsx
app.get("/api/reports/sales", (req,res)=>{ try{ res.json(db.prepare(`SELECT sales.*, customers.name as customer_name, customers.phone as customer_phone FROM sales LEFT JOIN customers ON sales.customer_id=customers.id ORDER BY sales.id DESC`).all()); }catch(e){res.status(500).json({message:"error"});} });
app.get("/api/reports/purchases", (req,res)=>{ try{ res.json(db.prepare(`SELECT * FROM purchases ORDER BY id DESC`).all()); }catch(e){res.status(500).json({message:"error"});} });
app.get("/api/reports", (req,res)=>{ try{ const {from,to}=req.query; let q=`SELECT * FROM sales`; let p=[]; if(from&&to){ q+=` WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?)`; p=[from,to]; } q+=` ORDER BY id DESC`; res.json(db.prepare(q).all(...p)); }catch(e){res.status(500).json({message:"error"});} });

// ANALYTICS
app.get("/api/analytics", (req,res)=>{
  try{
    const today=new Date().toISOString().slice(0,10);
    const from=req.query.from||today;
    const to=req.query.to||today;
    const salesSummary=db.prepare(`SELECT COUNT(*) AS bills, COALESCE(SUM(sales.subtotal),0) AS subtotal, COALESCE(SUM(sales.discount),0) AS discount, COALESCE(SUM(sales.total),0) AS sales_total FROM sales WHERE DATE(sales.created_at) BETWEEN DATE(?) AND DATE(?)`).get(from,to);
    const purchaseSummary=db.prepare(`SELECT COUNT(*) AS purchases, COALESCE(SUM(purchases.total),0) AS purchase_total FROM purchases WHERE DATE(purchases.created_at) BETWEEN DATE(?) AND DATE(?)`).get(from,to);
    const profitSummary=db.prepare(`SELECT COALESCE(SUM(sale_items.price * sale_items.quantity),0) AS salesAmount, COALESCE(SUM(sale_items.purchase_price * sale_items.quantity),0) AS costAmount FROM sale_items INNER JOIN sales ON sales.id=sale_items.sale_id WHERE DATE(sales.created_at) BETWEEN DATE(?) AND DATE(?)`).get(from,to);
    const grossProfit=Number(profitSummary.salesAmount||0)-Number(profitSummary.costAmount||0);
    const customerCount=db.prepare(`SELECT COUNT(*) AS total_customers FROM customers`).get();
    const topMedicines=db.prepare(`SELECT sale_items.medicine_name AS medicine_name, SUM(sale_items.quantity) AS quantity, SUM(sale_items.total) AS sales FROM sale_items INNER JOIN sales ON sales.id=sale_items.sale_id WHERE DATE(sales.created_at) BETWEEN DATE(?) AND DATE(?) GROUP BY sale_items.medicine_id, sale_items.medicine_name ORDER BY quantity DESC LIMIT 10`).all(from,to);
    res.json({ period:{from,to}, sales:{bills:Number(salesSummary.bills||0), subtotal:Number(salesSummary.subtotal||0), discount:Number(salesSummary.discount||0), total:Number(salesSummary.sales_total||0)}, purchases:{count:Number(purchaseSummary.purchases||0), total:Number(purchaseSummary.purchase_total||0)}, profit:{sales:Number(profitSummary.salesAmount||0), cost:Number(profitSummary.costAmount||0), gross:Number(grossProfit||0)}, customers:Number(customerCount.total_customers||0), topMedicines });
  }catch(e){ console.error(e); res.status(500).json({message:"Analytics error"}); }
});

// BACKUP & RESTORE
app.get("/api/backup", (req,res)=>{
  try{
    const dbPath=process.env.DB_PATH || path.join(__dirname, "mypharmacy.db");
    const date=new Date().toISOString().slice(0,10);
    res.download(dbPath, `pharmacy-backup-${date}.db`);
  }catch(e){ res.status(500).json({message:"Backup failed"}); }
});
app.post("/api/restore", (req,res)=>{
  try{
    const dbPath=process.env.DB_PATH || path.join(__dirname, "mypharmacy.db");
    const chunks=[]; req.on("data", c=>chunks.push(c));
    req.on("end", ()=>{
      try{
        const buf=Buffer.concat(chunks);
        if(buf.length===0) return res.status(400).json({message:"File empty"});
        const temp=path.join(__dirname, "restore-temp.db");
        fs.writeFileSync(temp, buf);
        const testDb=new Database(temp);
        const tables=testDb.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(t=>t.name);
        testDb.close();
        if(!tables.includes("medicines")){ fs.unlinkSync(temp); return res.status(400).json({message:"Invalid backup"}); }
        try{ db.pragma("wal_checkpoint(TRUNCATE)"); }catch{}
        db.close();
        fs.copyFileSync(temp, dbPath);
        fs.unlinkSync(temp);
        res.json({message:"Restored"});
        setTimeout(()=>process.exit(0),1000);
      }catch(err){ console.error(err); res.status(500).json({message:"Restore failed"}); }
    });
  }catch(e){ res.status(500).json({message:"Restore error"}); }
});

app.put("/api/change-password", async (req,res)=>{
  try{
    const {currentPassword, newPassword}=req.body;
    const user=db.prepare(`SELECT * FROM users WHERE id=1`).get();
    if(!user) return res.status(404).json({message:"User not found"});
    const match=await bcrypt.compare(currentPassword, user.password);
    if(!match) return res.status(401).json({message:"Current password wrong"});
    const hashed=await bcrypt.hash(newPassword,10);
    db.prepare(`UPDATE users SET password=? WHERE id=?`).run(hashed, user.id);
    res.json({message:"Password changed"});
  }catch(e){ res.status(500).json({message:"Failed"}); }
});

const PORT=process.env.PORT||5000;
function startServer(port=PORT){ return app.listen(port, ()=>console.log(`Server running on port ${port} - ONLINE READY`)); }
if(require.main===module){ startServer(); }
module.exports=app;
module.exports.startServer=startServer;

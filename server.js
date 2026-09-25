
// Fix for Node 20 WebSocket issue on Render
if (typeof WebSocket === 'undefined') {
  global.WebSocket = require('ws');
}

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || "nabeel-secret-2024";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

console.log("Starting with SUPABASE_URL:", SUPABASE_URL ? "FOUND" : "MISSING");
console.log("Starting with SUPABASE_KEY:", SUPABASE_KEY ? "FOUND" : "MISSING");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Nabeel Pharmacy Backend - SUPABASE VERSION FIXED - Running Online! /api/medicines working");
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const { data: users } = await supabase.from("users").select("*").eq("username", username).limit(1);
  const user = users && users[0];
  if (!user) return res.status(401).json({ message: "Invalid username" });
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ message: "Invalid password" });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "1d" });
  res.json({ token, username: user.username });
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const { count: totalMedicines } = await supabase.from("medicines").select("*", { count: "exact", head: true });
    const { data: meds } = await supabase.from("medicines").select("stock");
    const totalStock = meds ? meds.reduce((a, b) => a + (b.stock || 0), 0) : 0;
    const lowStock = meds ? meds.filter(m => m.stock < 10).length : 0;
    const { count: totalSales } = await supabase.from("sales").select("*", { count: "exact", head: true });
    const { data: sales } = await supabase.from("sales").select("total");
    const totalSalesAmount = sales ? sales.reduce((a, b) => a + (Number(b.total) || 0), 0) : 0;
    const { count: totalPurchases } = await supabase.from("purchases").select("*", { count: "exact", head: true });
    const { count: totalCustomers } = await supabase.from("customers").select("*", { count: "exact", head: true });
    res.json({ totalMedicines: totalMedicines || 0, totalStock, lowStock, totalSales: totalSales || 0, totalSalesAmount, totalPurchases: totalPurchases || 0, totalCustomers: totalCustomers || 0, expiringCount: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/alerts/low-stock", async (req, res) => {
  const { data } = await supabase.from("medicines").select("*").lt("stock", 10).order("stock");
  res.json(data || []);
});
app.get("/api/alerts/expiry", async (req, res) => {
  const { data } = await supabase.from("medicines").select("*").order("created_at", { ascending: false }).limit(20);
  res.json(data || []);
});

app.get("/api/medicines", async (req, res) => {
  const { data, error } = await supabase.from("medicines").select("*").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
app.get("/api/medicines/:id", async (req, res) => {
  const { data, error } = await supabase.from("medicines").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ message: "Not found" });
  res.json(data);
});
app.post("/api/medicines", async (req, res) => {
  const { name, company, batch, expiry, price, stock, purchase_price } = req.body;
  if (!name) return res.status(400).json({ message: "Name required" });
  const { data, error } = await supabase.from("medicines").insert([{ name, company, batch, expiry, price: Number(price) || 0, stock: Number(stock) || 0, purchase_price: Number(purchase_price) || 0 }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});
app.put("/api/medicines/:id", async (req, res) => {
  const { data, error } = await supabase.from("medicines").update(req.body).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
app.delete("/api/medicines/:id", async (req, res) => {
  const { error } = await supabase.from("medicines").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Deleted" });
});

app.get("/api/customers", async (req, res) => {
  const { data } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
  res.json(data || []);
});
app.post("/api/customers", async (req, res) => {
  const { data, error } = await supabase.from("customers").insert([req.body]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get("/api/sales", async (req, res) => {
  const { data } = await supabase.from("sales").select("*").order("created_at", { ascending: false });
  res.json(data || []);
});
app.post("/api/sales", async (req, res) => {
  try {
    const { customer_id, customer_name, subtotal, discount, total, items } = req.body;
    const { data: sale, error } = await supabase.from("sales").insert([{ customer_id: customer_id || null, customer_name, subtotal, discount: discount || 0, total }]).select().single();
    if (error) throw error;
    if (items && Array.isArray(items)) {
      for (const it of items) {
        await supabase.from("sale_items").insert([{ sale_id: sale.id, medicine_id: it.medicine_id, medicine_name: it.medicine_name, price: it.price, purchase_price: it.purchase_price || 0, quantity: it.quantity, total: it.total }]);
        const { data: med } = await supabase.from("medicines").select("stock").eq("id", it.medicine_id).single();
        if (med) await supabase.from("medicines").update({ stock: med.stock - it.quantity }).eq("id", it.medicine_id);
      }
    }
    res.status(201).json(sale);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/purchases", async (req, res) => {
  const { data } = await supabase.from("purchases").select("*").order("created_at", { ascending: false });
  res.json(data || []);
});
app.post("/api/purchases", async (req, res) => {
  try {
    const { supplier, invoice_number, total, items } = req.body;
    const { data: pur, error } = await supabase.from("purchases").insert([{ supplier, invoice_number, total }]).select().single();
    if (error) throw error;
    if (items && Array.isArray(items)) {
      for (const it of items) {
        await supabase.from("purchase_items").insert([{ purchase_id: pur.id, medicine_id: it.medicine_id, medicine_name: it.medicine_name, purchase_price: it.purchase_price, quantity: it.quantity, total: it.total }]);
        const { data: med } = await supabase.from("medicines").select("stock").eq("id", it.medicine_id).single();
        if (med) await supabase.from("medicines").update({ stock: med.stock + it.quantity, purchase_price: it.purchase_price }).eq("id", it.medicine_id);
      }
    }
    res.status(201).json(pur);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/reports/sales", async (req, res) => {
  const { data } = await supabase.from("sales").select("*").order("created_at", { ascending: false });
  res.json(data || []);
});

app.listen(PORT, () => console.log("SUPABASE SERVER FIXED running on port " + PORT));

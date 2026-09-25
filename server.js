
const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// In-memory storage - Render par 100% chalega, crash nahi hoga
let medicines = [
  { id: 1, name: "Panadol", company: "GSK", batch: "B001", expiry: "2026-12", price: 50, stock: 100, purchase_price: 30, created_at: new Date().toISOString() },
  { id: 2, name: "Brufen", company: "Abbott", batch: "B002", expiry: "2026-11", price: 80, stock: 50, purchase_price: 50, created_at: new Date().toISOString() }
];
let nextId = 3;

let customers = [];
let sales = [];
let purchases = [];

app.get("/", (req, res) => {
  res.send("Nabeel Pharmacy Backend is Running Online! Available at /api/medicines, /api/dashboard etc - FINAL VERSION");
});

// DASHBOARD
app.get("/api/dashboard", (req, res) => {
  res.json({
    totalMedicines: medicines.length,
    totalStock: medicines.reduce((a,b)=>a+b.stock,0),
    lowStock: medicines.filter(m=>m.stock<10).length,
    totalSales: sales.length,
    totalSalesAmount: sales.reduce((a,b)=>a+(b.total||0),0),
    totalPurchases: purchases.length,
    totalCustomers: customers.length,
    expiringCount: 0
  });
});

app.get("/api/alerts/low-stock", (req,res)=> res.json(medicines.filter(m=>m.stock<10)));
app.get("/api/alerts/expiry", (req,res)=> res.json(medicines.slice(0,20)));

// MEDICINES - YEHI FIX HAI!
app.get("/api/medicines", (req, res) => {
  console.log("GET /api/medicines called, returning", medicines.length);
  res.json(medicines);
});

app.get("/api/medicines/:id", (req,res)=>{
  const med = medicines.find(m=>m.id==req.params.id);
  if(!med) return res.status(404).json({message:"Not found"});
  res.json(med);
});

app.post("/api/medicines", (req,res)=>{
  const { name, company, batch, expiry, price, stock, purchase_price } = req.body;
  const newMed = {
    id: nextId++,
    name, company, batch, expiry,
    price: Number(price)||0,
    stock: Number(stock)||0,
    purchase_price: Number(purchase_price)||0,
    created_at: new Date().toISOString()
  };
  medicines.unshift(newMed);
  console.log("Medicine added:", newMed.name);
  res.status(201).json(newMed);
});

app.put("/api/medicines/:id", (req,res)=>{
  const idx = medicines.findIndex(m=>m.id==req.params.id);
  if(idx===-1) return res.status(404).json({message:"Not found"});
  medicines[idx] = { ...medicines[idx], ...req.body, id: medicines[idx].id };
  res.json(medicines[idx]);
});

app.delete("/api/medicines/:id", (req,res)=>{
  medicines = medicines.filter(m=>m.id!=req.params.id);
  res.json({message:"Deleted"});
});

// CUSTOMERS
app.get("/api/customers", (req,res)=> res.json(customers));
app.post("/api/customers", (req,res)=>{
  const c = {id: Date.now(), ...req.body, created_at: new Date().toISOString()};
  customers.unshift(c);
  res.json(c);
});

// SALES
app.get("/api/sales", (req,res)=> res.json(sales));
app.post("/api/sales", (req,res)=>{
  const s = {id: Date.now(), ...req.body, created_at: new Date().toISOString()};
  sales.unshift(s);
  // reduce stock
  if(req.body.items){
    req.body.items.forEach(it=>{
      const med = medicines.find(m=>m.id==it.medicine_id);
      if(med) med.stock -= it.quantity;
    });
  }
  res.status(201).json(s);
});

// PURCHASES
app.get("/api/purchases", (req,res)=> res.json(purchases));
app.post("/api/purchases", (req,res)=>{
  const p = {id: Date.now(), ...req.body, created_at: new Date().toISOString()};
  purchases.unshift(p);
  if(req.body.items){
    req.body.items.forEach(it=>{
      const med = medicines.find(m=>m.id==it.medicine_id);
      if(med){ med.stock += it.quantity; med.purchase_price = it.purchase_price; }
    });
  }
  res.status(201).json(p);
});

app.get("/api/reports/sales", (req,res)=> res.json(sales));
app.post("/api/login", (req,res)=> res.json({token:"test-token", username:"admin"}));

app.listen(PORT, ()=> console.log("Server running on port "+PORT+" - FINAL IN-MEMORY VERSION READY"));

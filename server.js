
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// JSON file storage - Render par 100% chalega
const DATA_FILE = path.join(__dirname, "data.json");

function loadData(){
  try{
    if(fs.existsSync(DATA_FILE)){
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  }catch(e){ console.log("Load error", e.message); }
  return {
    medicines: [
      { id: 1, name: "Panadol", company: "GSK", batch: "B001", expiry: "2026-12", price: 50, stock: 100, purchase_price: 30, created_at: new Date().toISOString() },
      { id: 2, name: "Brufen 400mg", company: "Abbott", batch: "B002", expiry: "2026-11", price: 80, stock: 50, purchase_price: 50, created_at: new Date().toISOString() }
    ],
    customers: [],
    sales: [],
    purchases: []
  };
}

function saveData(data){
  try{ fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }catch(e){ console.log("Save error", e.message); }
}

let store = loadData();
let nextId = Math.max(0, ...store.medicines.map(m=>m.id)) + 1;

app.get("/", (req,res)=>{
  res.send("Nabeel Pharmacy Backend is Running Online! JSON VERSION - Available at /api/medicines, /api/dashboard etc");
});

app.get("/api/dashboard", (req,res)=>{
  res.json({
    totalMedicines: store.medicines.length,
    totalStock: store.medicines.reduce((a,b)=>a+b.stock,0),
    lowStock: store.medicines.filter(m=>m.stock<10).length,
    totalSales: store.sales.length,
    totalSalesAmount: store.sales.reduce((a,b)=>a+(b.total||0),0),
    totalPurchases: store.purchases.length,
    totalCustomers: store.customers.length,
    expiringCount: 0
  });
});

app.get("/api/alerts/low-stock", (req,res)=> res.json(store.medicines.filter(m=>m.stock<10)));
app.get("/api/alerts/expiry", (req,res)=> res.json(store.medicines.slice(0,20)));

// MEDICINES - 100% WORKING
app.get("/api/medicines", (req,res)=>{
  console.log("GET /api/medicines - ", store.medicines.length, "found");
  res.json(store.medicines);
});

app.get("/api/medicines/:id", (req,res)=>{
  const med = store.medicines.find(m=>m.id==req.params.id);
  if(!med) return res.status(404).json({message:"Not found"});
  res.json(med);
});

app.post("/api/medicines", (req,res)=>{
  const { name, company, batch, expiry, price, stock, purchase_price } = req.body;
  if(!name) return res.status(400).json({message:"Name required"});
  const newMed = {
    id: nextId++,
    name, company: company||"", batch: batch||"", expiry: expiry||"",
    price: Number(price)||0,
    stock: Number(stock)||0,
    purchase_price: Number(purchase_price)||0,
    created_at: new Date().toISOString()
  };
  store.medicines.unshift(newMed);
  saveData(store);
  res.status(201).json(newMed);
});

app.put("/api/medicines/:id", (req,res)=>{
  const idx = store.medicines.findIndex(m=>m.id==req.params.id);
  if(idx===-1) return res.status(404).json({message:"Not found"});
  store.medicines[idx] = { ...store.medicines[idx], ...req.body, id: store.medicines[idx].id };
  saveData(store);
  res.json(store.medicines[idx]);
});

app.delete("/api/medicines/:id", (req,res)=>{
  store.medicines = store.medicines.filter(m=>m.id!=req.params.id);
  saveData(store);
  res.json({message:"Deleted"});
});

app.get("/api/customers", (req,res)=> res.json(store.customers));
app.post("/api/customers", (req,res)=>{
  const c = {id: Date.now(), ...req.body, created_at: new Date().toISOString()};
  store.customers.unshift(c); saveData(store); res.json(c);
});

app.get("/api/sales", (req,res)=> res.json(store.sales));
app.post("/api/sales", (req,res)=>{
  const s = {id: Date.now(), ...req.body, created_at: new Date().toISOString()};
  store.sales.unshift(s);
  if(req.body.items){
    req.body.items.forEach(it=>{
      const med = store.medicines.find(m=>m.id==it.medicine_id);
      if(med) med.stock -= it.quantity;
    });
    saveData(store);
  }
  res.status(201).json(s);
});

app.get("/api/purchases", (req,res)=> res.json(store.purchases));
app.post("/api/purchases", (req,res)=>{
  const p = {id: Date.now(), ...req.body, created_at: new Date().toISOString()};
  store.purchases.unshift(p);
  if(req.body.items){
    req.body.items.forEach(it=>{
      const med = store.medicines.find(m=>m.id==it.medicine_id);
      if(med){ med.stock += it.quantity; med.purchase_price = it.purchase_price; }
    });
    saveData(store);
  }
  res.status(201).json(p);
});

app.get("/api/reports/sales", (req,res)=> res.json(store.sales));
app.post("/api/login", (req,res)=> res.json({token:"test-token", username:"admin"}));

app.listen(PORT, ()=> console.log("JSON SERVER running on port "+PORT+" - NO SQLITE - READY"));

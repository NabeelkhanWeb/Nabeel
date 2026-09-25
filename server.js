const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req,res)=> res.send("Backend is Running! Nabeel Pharmacy"));

app.get("/api/medicines", (req,res)=> res.json([{id:1, name:"Test Panadol", stock:100}]));

app.get("/api/dashboard", (req,res)=> res.json({totalMedicines:1, totalStock:100, lowStock:0}));

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log("Server running on port "+PORT));

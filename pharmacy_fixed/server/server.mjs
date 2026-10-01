import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, 'data.json');
const SEED_FILE = path.join(__dirname, 'seed.json');
const app = express();
const PORT = 4000;
app.use(express.json({ limit: '1mb' }));

async function readDb() { try { return JSON.parse(await fs.readFile(DB_FILE,'utf8')); } catch { const seed=JSON.parse(await fs.readFile(SEED_FILE,'utf8')); await writeDb(seed); return seed; } }
async function writeDb(db) { await fs.writeFile(DB_FILE, JSON.stringify(db,null,2),'utf8'); }
function makeId(prefix) { return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random()*900+100)}`; }
function nowText() { return new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }
function notify(db,title,message,type) { db.notifications.unshift({id:makeId('N'),title,message,time:'just now',type,read:false}); }
function required(res, pairs) { for (const [key,value] of pairs) if (value === undefined || value === null || String(value).trim()==='') { res.status(400).json({error:`${key} is required.`}); return true; } return false; }

app.get('/api/health',(_req,res)=>res.json({ok:true,service:'OncoCare Pharmacy API'}));
app.get('/api/state',async(_req,res)=>res.json(await readDb()));
app.post('/api/reset',async(_req,res)=>{const seed=JSON.parse(await fs.readFile(SEED_FILE,'utf8'));await writeDb(seed);res.json(seed);});

app.post('/api/orders',async(req,res)=>{const {patient,patientId='',prescription='',medicines=1,amount=0,priority='Normal'}=req.body;if(required(res,[['Patient name',patient]]))return;if(Number(medicines)<1)return res.status(400).json({error:'At least one medicine is required.'});if(Number(amount)<0)return res.status(400).json({error:'Amount cannot be negative.'});const db=await readDb();const order={id:makeId('OC'),patient:String(patient).trim(),patientId,prescription:String(prescription).trim()||null,medicines:Number(medicines),amount:Number(amount),status:'Verification',priority,created:nowText()};db.orders.unshift(order);notify(db,'New order received',`${order.id} for ${order.patient} is waiting for verification.`,'Order');await writeDb(db);res.status(201).json(order);});
app.patch('/api/orders/:id/status',async(req,res)=>{const allowed=['Verification','Preparing','Ready','Dispatched','Completed','Cancelled'];const {status}=req.body;if(!allowed.includes(status))return res.status(400).json({error:'Invalid order status.'});const db=await readDb();const o=db.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Order not found.'});o.status=status;const d=db.deliveries.find(x=>x.order===o.id);if(d&&['Ready','Dispatched','Completed'].includes(status))d.status=status==='Completed'?'Delivered':status;notify(db,'Order updated',`${o.id} is now ${status}.`,'Order');await writeDb(db);res.json(o);});

app.post('/api/inventory',async(req,res)=>{const {name,generic='',category='Other',price=0,stock=0,reorder=10,batch='',expiry=''}=req.body;if(required(res,[['Medicine name',name]]))return;const db=await readDb();const med={id:makeId('MED'),name:String(name).trim(),generic:String(generic).trim()||String(name).trim(),category,price:Number(price)||0,stock:Number(stock)||0,reorder:Number(reorder)||0,batch:String(batch).trim()||`BATCH-${Date.now()}`,expiry};db.inventory.unshift(med);notify(db,'Medicine added',`${med.name} was added to inventory.`,'Inventory');await writeDb(db);res.status(201).json(med);});
app.patch('/api/inventory/:id/stock',async(req,res)=>{const delta=Number(req.body.delta);if(!Number.isFinite(delta))return res.status(400).json({error:'Stock change must be a number.'});const db=await readDb();const m=db.inventory.find(x=>x.id===req.params.id);if(!m)return res.status(404).json({error:'Medicine not found.'});m.stock=Math.max(0,m.stock+delta);await writeDb(db);res.json(m);});

app.post('/api/patients',async(req,res)=>{const {name,condition='',phone='',email=''}=req.body;if(required(res,[['Patient name',name]]))return;const db=await readDb();const patient={id:makeId('P'),name:String(name).trim(),condition,phone,email,orders:0,status:'Active'};db.patients.unshift(patient);notify(db,'New patient added',`${patient.name} was added to the patient directory.`,'Patient');await writeDb(db);res.status(201).json(patient);});
app.post('/api/prescriptions',async(req,res)=>{const {patient,patientId='',doctor,medicines=1,notes=''}=req.body;if(required(res,[['Patient',patient],['Doctor',doctor]]))return;const db=await readDb();const p={id:makeId('RX'),patient:String(patient).trim(),patientId,doctor:String(doctor).trim(),medicines:Number(medicines)||1,status:'Pending Verification',submitted:nowText(),notes};db.prescriptions.unshift(p);notify(db,'Prescription submitted',`${p.id} is waiting for verification.`,'Prescription');await writeDb(db);res.status(201).json(p);});
app.patch('/api/prescriptions/:id/status',async(req,res)=>{const {status}=req.body;if(!['Verified','Rejected','Pending Verification'].includes(status))return res.status(400).json({error:'Invalid prescription status.'});const db=await readDb();const p=db.prescriptions.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Prescription not found.'});p.status=status;const o=db.orders.find(x=>x.prescription===p.id);if(o)o.status=status==='Verified'?'Preparing':status==='Rejected'?'Cancelled':o.status;notify(db,'Prescription updated',`${p.id} is now ${status}.`,'Prescription');await writeDb(db);res.json(p);});

app.post('/api/deliveries',async(req,res)=>{const {order,patient,schedule,courier='OncoCare Express',address=''}=req.body;if(required(res,[['Order',order],['Patient',patient],['Schedule',schedule]]))return;const db=await readDb();const d={id:makeId('DL'),order,patient,schedule,status:'Ready',courier,address};db.deliveries.unshift(d);notify(db,'Delivery created',`${d.id} is ready for dispatch.`,'Delivery');await writeDb(db);res.status(201).json(d);});
app.patch('/api/deliveries/:id/status',async(req,res)=>{const {status}=req.body;if(!['Preparing','Ready','Dispatched','Delivered','Cancelled'].includes(status))return res.status(400).json({error:'Invalid delivery status.'});const db=await readDb();const d=db.deliveries.find(x=>x.id===req.params.id);if(!d)return res.status(404).json({error:'Delivery not found.'});d.status=status;const o=db.orders.find(x=>x.id===d.order);if(o)o.status=status==='Delivered'?'Completed':status;notify(db,'Delivery updated',`${d.id} is now ${status}.`,'Delivery');await writeDb(db);res.json(d);});

app.post('/api/payments',async(req,res)=>{const {order,patient,amount,method='UPI'}=req.body;if(required(res,[['Order',order],['Patient',patient]]))return;if(!(Number(amount)>0))return res.status(400).json({error:'Amount must be greater than zero.'});const db=await readDb();const p={id:makeId('PAY'),order,patient,amount:Number(amount),method,status:'Paid',time:nowText()};db.payments.unshift(p);notify(db,'Payment received',`₹${p.amount.toLocaleString('en-IN')} received for ${order}.`,'Payment');await writeDb(db);res.status(201).json(p);});
app.patch('/api/notifications/:id/read',async(req,res)=>{const db=await readDb();const n=db.notifications.find(x=>x.id===req.params.id);if(!n)return res.status(404).json({error:'Notification not found.'});n.read=true;await writeDb(db);res.json(n);});
app.post('/api/notifications/read-all',async(_req,res)=>{const db=await readDb();db.notifications.forEach(n=>n.read=true);await writeDb(db);res.json({ok:true});});
app.patch('/api/profile',async(req,res)=>{const db=await readDb();db.profile={...db.profile,...req.body};await writeDb(db);res.json(db.profile);});

app.listen(PORT,()=>console.log(`OncoCare Pharmacy API running on http://localhost:${PORT}`));

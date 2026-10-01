import React,{useMemo,useState} from 'react';
import {Card,Page,Shell,Status} from './PharmacyShell';
import {usePharmacy} from './PharmacyContext';

const empty={name:'',generic:'',category:'Chemotherapy',price:'',stock:'',reorder:'10',batch:'',expiry:''};
export default function PharmacyInventory(){
 const {inventory,updateInventory,addMedicine}=usePharmacy(); const [search,setSearch]=useState(''); const [open,setOpen]=useState(false); const [form,setForm]=useState(empty); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
 const rows=useMemo(()=>inventory.filter(m=>`${m.name} ${m.generic} ${m.category}`.toLowerCase().includes(search.toLowerCase())),[inventory,search]);
 const submit=async e=>{e.preventDefault();setError('');setSaving(true);try{await addMedicine({...form,price:Number(form.price),stock:Number(form.stock),reorder:Number(form.reorder)});setForm(empty);setOpen(false);}catch(err){setError(err.message)}finally{setSaving(false)}};
 return <Shell><Page title="Inventory" subtitle="Manage medicines, stock, batches, expiry and reorder levels." actions={<button className="primary-button" onClick={()=>setOpen(true)}>+ Add Stock / Medicine</button>}/>
  <Card title="Medicine Inventory" subtitle={`${inventory.length} medicines in catalogue`}><div className="toolbar"><input className="pharmacy-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search medicine..."/></div>
   <div className="inventory-table"><div className="inventory-row inventory-header"><span>MEDICINE</span><span>CATEGORY</span><span>STOCK</span><span>EXPIRY</span><span>ACTION</span></div>
    {rows.map(m=><div className="inventory-row" key={m.id}><div><strong>{m.name}</strong><small>Batch {m.batch}</small></div><span className="muted">{m.category}</span><div><strong>{m.stock} units</strong><small>Reorder at {m.reorder}</small></div><span>{m.expiry||'—'}</span><div className="row-actions"><Status>{m.stock===0?'Critical':m.stock<=m.reorder?'Low':'Healthy'}</Status><button className="mini-button" onClick={()=>updateInventory(m.id,1)}>+1</button><button className="mini-button" onClick={()=>updateInventory(m.id,5)}>+5</button></div></div>)}
   </div>{rows.length===0&&<div className="empty-state"><div>⌕</div><strong>No medicines found</strong><span>Try another search term.</span></div>}
  </Card>
  {open&&<div className="modal-backdrop" onClick={()=>setOpen(false)}><form className="dashboard-card modal" onSubmit={submit} onClick={e=>e.stopPropagation()}><div className="card-header"><div><h2>Add Medicine / Stock</h2><p>Enter the real stock information you received.</p></div><button type="button" className="close-button" onClick={()=>setOpen(false)}>×</button></div>{error&&<div className="form-error">{error}</div>}<div className="form-grid">
   <div className="form-field"><label>Medicine name *</label><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
   <div className="form-field"><label>Generic name</label><input value={form.generic} onChange={e=>setForm({...form,generic:e.target.value})}/></div>
   <div className="form-field"><label>Category</label><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option>Chemotherapy</option><option>Supportive Care</option><option>Hormonal Therapy</option><option>Immunotherapy</option><option>Other</option></select></div>
   <div className="form-field"><label>Unit price (₹)</label><input type="number" min="0" required value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></div>
   <div className="form-field"><label>Opening stock</label><input type="number" min="0" required value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/></div>
   <div className="form-field"><label>Reorder level</label><input type="number" min="0" required value={form.reorder} onChange={e=>setForm({...form,reorder:e.target.value})}/></div>
   <div className="form-field"><label>Batch number</label><input value={form.batch} onChange={e=>setForm({...form,batch:e.target.value})}/></div>
   <div className="form-field"><label>Expiry date</label><input type="date" value={form.expiry} onChange={e=>setForm({...form,expiry:e.target.value})}/></div>
  </div><div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving?'Saving...':'Save Medicine'}</button></div></form></div>}
 </Shell>;
}

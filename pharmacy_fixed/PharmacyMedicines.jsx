import React, { useMemo, useState } from 'react';
import { Card, Page, Shell, money, Status } from './PharmacyShell';
import { usePharmacy } from './PharmacyContext';

export default function PharmacyMedicines(){
 const {inventory}=usePharmacy(); const [search,setSearch]=useState('');
 const rows=useMemo(()=>inventory.filter(m=>`${m.name} ${m.generic} ${m.category}`.toLowerCase().includes(search.toLowerCase())),[inventory,search]);
 return <Shell><Page title="Medicines" subtitle="Search the oncology medicine catalogue and current availability." />
 <Card title="Medicine Catalogue" subtitle="Price and stock information"><div className="toolbar"><input className="pharmacy-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search medicine, generic or category..." /></div>
 <div className="inventory-table"><div className="inventory-row inventory-header"><span>MEDICINE</span><span>CATEGORY</span><span>PRICE</span><span>STOCK</span><span>STATUS</span></div>{rows.map(m=><div className="inventory-row" key={m.id}><div><strong>{m.name}</strong><small>{m.generic}</small></div><span className="muted">{m.category}</span><strong>{money(m.price)}</strong><span>{m.stock} units</span><Status>{m.stock<=m.reorder?'Low':'Healthy'}</Status></div>)}</div></Card></Shell>;
}

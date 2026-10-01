import React from 'react';
import { Card, Page, Shell, StatCard, Status, money, navigate } from './PharmacyShell';
import { usePharmacy } from './PharmacyContext';

export default function PharmacyDashboard() {
  const { orders, inventory, notifications, payments, loading, error } = usePharmacy();
  if (loading) return <Shell><div className="loading-state">Loading pharmacy data…</div></Shell>;
  const pending = orders.filter(o => o.status === 'Verification').length;
  const preparing = orders.filter(o => o.status === 'Preparing').length;
  const ready = orders.filter(o => o.status === 'Ready').length;
  const completed = orders.filter(o => o.status === 'Completed').length;
  const lowStock = inventory.filter(m => m.stock <= m.reorder);
  const unread = notifications.filter(n => !n.read).length;
  const revenue = payments.filter(p => p.status === 'Paid').reduce((sum,p)=>sum+Number(p.amount||0),0);
  const dispatched = orders.filter(o => ['Dispatched','Completed'].includes(o.status)).length;

  return <Shell>
    <Page title="Pharmacy Dashboard" subtitle="Manage prescriptions, orders, inventory and deliveries."
      actions={<><button className="icon-button" onClick={() => navigate('/pharmacy/notifications')}>◉{unread > 0 && <span className="notification-dot" />}</button><button className="primary-button" onClick={() => navigate('/pharmacy/orders')}>+ New Order</button></>} />
    {error && <div className="api-error">API connection issue: {error}</div>}
    <section className="workflow-card"><div className="workflow-heading"><div><h2>Order Workflow</h2><p>Receive → Verify → Prepare → Dispatch → Complete</p></div><span className="live-status"><span /> Live</span></div><div className="workflow">{[['01','Receive','New order'],['02','Verify','Prescription'],['03','Prepare','Medicines'],['04','Dispatch','Delivery'],['05','Complete','Delivered']].map((s,i)=><React.Fragment key={s[1]}><div className={`workflow-step ${i === 0 ? 'active' : ''}`}><div className="workflow-number">{s[0]}</div><div><strong>{s[1]}</strong><span>{s[2]}</span></div></div>{i < 4 && <div className="workflow-line" />}</React.Fragment>)}</div></section>
    <section className="pharmacy-stats"><StatCard title="Pending Orders" value={pending} subtitle="Require verification" icon="▣" /><StatCard title="To Prepare" value={preparing} subtitle="After verification" icon="▤" /><StatCard title="Ready to Dispatch" value={ready} subtitle="Awaiting pickup" icon="➜" /><StatCard title="Completed" value={completed} subtitle="Successfully completed" icon="✓" /></section>
    <section className="dashboard-content-grid">
      <Card title="Active Orders" subtitle="Orders requiring pharmacy action" action={<button className="text-button" onClick={() => navigate('/pharmacy/orders')}>View all →</button>}>
        <div className="orders-table"><div className="order-row order-header"><span>ORDER</span><span>PATIENT</span><span>PRESCRIPTION</span><span>AMOUNT</span><span>STATUS</span><span>ACTION</span></div>{orders.filter(o => o.status !== 'Completed').slice(0,5).map(o => <div className="order-row" key={o.id}><strong>#{o.id}</strong><span>{o.patient}</span><span className="muted">{o.prescription || `${o.medicines} medicines`}</span><strong>{money(o.amount)}</strong><Status>{o.status}</Status><button className="table-action" onClick={() => navigate('/pharmacy/orders')}>View</button></div>)}</div>
      </Card>
      <Card title="Low Stock" subtitle="Medicines requiring attention" action={<button className="text-button" onClick={() => navigate('/pharmacy/inventory')}>View all →</button>}><div className="stock-list">{lowStock.slice(0,4).map(m => <div className="stock-item" key={m.id}><div className="medicine-icon">✚</div><div className="medicine-info"><strong>{m.name}</strong><span>{m.category}</span></div><div className="stock-quantity"><strong>{m.stock}</strong><span className={m.stock <= 5 ? 'critical' : 'low'}>{m.stock <= 5 ? 'Critical' : 'Low'}</span></div></div>)}{lowStock.length===0&&<div className="empty-state"><div>✓</div><strong>Stock levels look good</strong><span>No medicine is below its reorder level.</span></div>}</div></Card>
    </section>
    <section className="bottom-grid">
      <Card title="Quick Actions" subtitle="Common pharmacy tasks"><div className="quick-actions">{[['☷','Verify Prescription','/pharmacy/prescriptions'],['▤','Update Inventory','/pharmacy/inventory'],['➜','Manage Deliveries','/pharmacy/deliveries'],['✚','Search Medicines','/pharmacy/medicines']].map(([icon,label,path]) => <button className="quick-action" key={path} onClick={() => navigate(path)}><span className="quick-action-icon">{icon}</span><span>{label}</span><strong>→</strong></button>)}</div></Card>
      <Card title="Today's Activity" subtitle="Live transaction summary"><div className="summary-grid"><div className="summary-item"><span>Orders Recorded</span><strong>{orders.length}</strong></div><div className="summary-item"><span>Prescriptions Verified</span><strong>{orders.filter(o=>o.status!=='Verification').length}</strong></div><div className="summary-item"><span>Orders Dispatched</span><strong>{dispatched}</strong></div><div className="summary-item"><span>Paid Revenue</span><strong>{money(revenue)}</strong></div></div></Card>
    </section>
  </Shell>;
}

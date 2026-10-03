import React,{useMemo} from 'react';
import {CalendarDays,Users,AlertTriangle,ClipboardCheck,Activity,MessageSquare,ArrowUpRight,ChevronRight,Clock3,ShieldAlert} from 'lucide-react';
import {useNavigate} from 'react-router-dom';import {useApp} from '../context/AppContext';import {AppointmentRow,AlertRow,Badge,StatCard} from '../components/UI';
import {vitals} from '../data/mockData';import {ResponsiveContainer,AreaChart,Area,XAxis,YAxis,Tooltip} from 'recharts';

export default function Dashboard(){
 const {patients,appointments,notifications}=useApp();const nav=useNavigate();
 const high=patients.filter(p=>p.risk==='High'), pending=appointments.filter(a=>a.status==='Pending').length;
 const today=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
 const upcoming=[...appointments].sort((a,b)=>String(a.time).localeCompare(String(b.time))).slice(0,5);
 const unread=notifications.filter(n=>!n.read).length;
 const active=patients.filter(p=>p.status!=='Archived').length;
 return <div>
  <div className="welcome"><div><div className="eyebrow">{today.toUpperCase()}</div><h1>Good evening, Dr. Sharma</h1><p>Here is the clinical work that may need your attention today.</p></div><button className="btn ghost" onClick={()=>nav('/patients')}><Users size={17}/>View patient list</button></div>
  <div className="stats-grid">
   <StatCard icon={Users} label="Active patients" value={active} sub="Current care workspace" onClick={()=>nav('/patients')}/>
   <StatCard icon={CalendarDays} label="Appointments" value={appointments.length} sub={`${pending} awaiting confirmation`} tone="blue" onClick={()=>nav('/appointments')}/>
   <StatCard icon={ShieldAlert} label="High-risk patients" value={high.length} sub="Review clinical status" tone="orange" onClick={()=>nav('/patients?search=High')}/>
   <StatCard icon={ClipboardCheck} label="Unread workflow items" value={unread} sub="Labs, messages & updates" tone="purple" onClick={()=>nav('/notifications')}/>
  </div>
  <div className="dashboard-grid">
   <section className="panel appointments"><div className="panel-head"><div><h2>Next appointments</h2><p>Prioritize today's patient interactions.</p></div><button className="text-btn" onClick={()=>nav('/appointments')}>Manage <ChevronRight size={15}/></button></div>{upcoming.map(a=><AppointmentRow key={a.id} item={a} patient={patients.find(p=>p.id===a.patientId)} onAction={()=>nav('/patients/'+a.patientId)}/>)}</section>
   <section className="panel alerts"><div className="panel-head"><div><h2>Clinical attention</h2><p>Patients requiring a review.</p></div><Badge tone="danger">{high.length} priority</Badge></div>{high.slice(0,5).map(p=><AlertRow key={p.id} patient={p} text={`${p.cancer} · symptom score ${p.score}/10`} onClick={()=>nav('/patients/'+p.id)}/>)}{!high.length&&<div className="empty">No high-risk patients currently flagged.</div>}</section>
  </div>
  <div className="dashboard-grid lower">
   <section className="panel chart-panel"><div className="panel-head"><div><h2>Recent symptom trend</h2><p>Aggregate check-in signal for the demo workspace.</p></div><Badge tone="success"><Activity size={14}/> Improving</Badge></div><div className="chart-wrap"><ResponsiveContainer width="100%" height={260}><AreaChart data={vitals}><defs><linearGradient id="score" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#14998e" stopOpacity={0.22}/><stop offset="95%" stopColor="#14998e" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="day" axisLine={false} tickLine={false}/><YAxis domain={[0,10]} axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="score" stroke="#14998e" fill="url(#score)" strokeWidth={2.5}/></AreaChart></ResponsiveContainer></div></section>
   <section className="panel quick-actions"><div className="panel-head"><div><h2>Quick actions</h2><p>Jump directly into a workflow.</p></div></div><button onClick={()=>nav('/appointments')}><span><CalendarDays size={18}/></span>Schedule appointment<ArrowUpRight size={16}/></button><button onClick={()=>nav('/prescriptions')}><span><ClipboardCheck size={18}/></span>Create prescription<ArrowUpRight size={16}/></button><button onClick={()=>nav('/consultations')}><span><Activity size={18}/></span>Document consultation<ArrowUpRight size={16}/></button><button onClick={()=>nav('/messages')}><span><MessageSquare size={18}/></span>Reply to patients<ArrowUpRight size={16}/></button></section>
  </div>
 </div>
}

import React from 'react';
import {NavLink,Outlet,useLocation,useNavigate} from 'react-router-dom';
import {LayoutDashboard,Users,CalendarDays,Stethoscope,Pill,ClipboardList,FileText,MessageSquare,Bell,UserRound,HeartPulse,LogOut,Menu,X,Search,Settings} from 'lucide-react';
import {useApp} from '../context/AppContext';

const groups=[['MAIN',[['Dashboard','/dashboard',LayoutDashboard],['My Patients','/patients',Users],['Appointments','/appointments',CalendarDays],['Consultations','/consultations',Stethoscope]]],['CLINICAL',[['Prescriptions','/prescriptions',Pill],['Treatment Plans','/treatment-plans',ClipboardList],['Reports','/reports',FileText]]],['COMMUNICATION',[['Messages','/messages',MessageSquare],['Notifications','/notifications',Bell]]],['ACCOUNT',[['Profile & Availability','/profile',UserRound],['Settings','/settings',Settings]]]];

export default function DoctorLayout({onLogout}){
 const [open,setOpen]=React.useState(false); const [q,setQ]=React.useState('');
 const loc=useLocation(), nav=useNavigate(); const {notifications,patients}=useApp();
 const unread=notifications.filter(n=>!n.read).length;
 const submitSearch=e=>{e.preventDefault();if(q.trim()){nav('/patients?search='+encodeURIComponent(q.trim()));setQ('')}};
 return <div className="app-shell">
  <aside className={'sidebar '+(open?'open':'')}>
   <div className="brand"><div className="brand-mark"><HeartPulse size={22}/></div><div><b>OncoCare<span>+</span></b><small>Doctor Portal</small></div><button className="mobile-close" onClick={()=>setOpen(false)}><X size={19}/></button></div>
   <nav>{groups.map(([title,items])=><div className="nav-group" key={title}><div className="nav-title">{title}</div>{items.map(([label,path,Icon])=><NavLink key={path} to={path} onClick={()=>setOpen(false)} className={({isActive})=>'nav-link '+(isActive?'active':'')}><Icon size={18}/><span>{label}</span>{label==='Notifications'&&unread>0&&<em>{unread}</em>}</NavLink>)}</div>)}</nav>
   <div className="side-doctor"><div className="avatar">AS</div><div><b>Dr. Arjun Sharma</b><span>Medical Oncologist</span></div><div className="online"/></div>
   <button className="side-logout" onClick={onLogout}><LogOut size={15}/>Sign out</button>
  </aside>
  <main className="main"><header className="topbar">
    <button className="mobile-menu" onClick={()=>setOpen(true)}><Menu size={21}/></button>
    <div className="crumb"><span>Doctor Portal</span><b>/</b><strong>{loc.pathname.split('/')[1]?.replaceAll('-',' ')||'dashboard'}</strong></div>
    <div className="top-actions"><form className="quick-search" onSubmit={submitSearch}><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search patients..."/></form><NavLink to="/notifications" className="top-icon"><Bell size={19}/>{unread>0&&<i>{unread}</i>}</NavLink><NavLink to="/profile" className="top-avatar">AS</NavLink></div>
  </header><div className="content"><Outlet/></div></main>
 </div>
}

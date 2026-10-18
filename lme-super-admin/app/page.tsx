 "use client";

import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Building2,
  CheckCircle2, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3,
  Command, Cpu, Database, FileCheck2, FlaskConical, HeartPulse, LayoutDashboard,
  LifeBuoy, LockKeyhole, Menu, Search, Settings2, ShieldCheck, SlidersHorizontal,
  Stethoscope, Users, UserRound, UserRoundCog, X, Zap, Pill, MessageSquareText,
  Hospital, Network, History, Mail, PanelLeftClose
} from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase";

const nav = [
  { group: "WORKSPACE", items: [
    ["Overview", LayoutDashboard], ["User management", Users], ["Hospital management", Building2],
    ["Doctor management", Stethoscope], ["Patient accounts", HeartPulse], ["Caregiver management", UserRoundCog],
    ["Pharmacy management", Pill], ["Research partners", FlaskConical], ["Medical advisors", UserRound]
  ]},
  { group: "PLATFORM", items: [
    ["Dashboard & Feature Control", SlidersHorizontal], ["AI services & safety", Cpu],
    ["Notifications", Bell], ["Support & incidents", LifeBuoy], ["Integrations & health", Network],
    ["System settings", Settings2], ["Roles & permissions", LockKeyhole], ["Audit log", History]
  ]}
] as const;

const metrics = [
  { label: "Registered users", value: "—", note: "Connect database to load", icon: Users, tone: "blue" },
  { label: "Active patients", value: "—", note: "Live data not connected", icon: HeartPulse, tone: "pink" },
  { label: "Pending verifications", value: "—", note: "Awaiting review", icon: FileCheck2, tone: "amber" },
  { label: "Open incidents", value: "—", note: "No live feed configured", icon: AlertTriangle, tone: "red" }
];

const integrations = [
  { name: "Supabase", desc: "Authentication & database", state: "Configured status unverified", icon: Database },
  { name: "AI provider", desc: "Gemini service", state: "Not verified", icon: Cpu },
  { name: "Google Maps", desc: "Maps browser integration", state: "Not verified", icon: Network },
  { name: "Notifications", desc: "Email, SMS and push", state: "Not implemented", icon: Mail }
];

export default function Home() {
  const [active, setActive] = useState("Overview");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [featureEnabled, setFeatureEnabled] = useState<Record<string, boolean>>({
    "Medication reminders": true, "AI report explanation": false, "Patient community": true,
    "Hospital queue management": true, "Research-partner access": false
  });
  const [role, setRole] = useState("LME Super Admin");
  const [showProfile, setShowProfile] = useState(false);

  const allItems = useMemo(() => nav.flatMap(g => g.items.map(i => i[0])), []);
  const visibleNav = nav.map(g => ({...g, items: g.items.filter(i => i[0].toLowerCase().includes(search.toLowerCase()))})).filter(g => g.items.length);
  const title = active === "Overview" ? "Platform overview" : active;
  const setPage = (label: string) => { setActive(label); setSidebarOpen(false); setNotice(""); };

  return <div className="app-shell">
    {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="brand">
        <div className="brand-mark"><HeartPulse size={23} strokeWidth={2.5}/></div>
        <div><div className="brand-name">OncoCare<span>+</span></div><div className="brand-sub">LME CONTROL CENTRE</div></div>
        <button className="icon-btn sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18}/></button>
      </div>
      <div className="workspace-switch"><div className="workspace-icon"><ShieldCheck size={17}/></div><div className="workspace-copy"><strong>Central Admin</strong><span>All workspaces</span></div><ChevronDown size={15}/></div>
      <div className="nav-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search menu..." aria-label="Search menu"/><kbd>⌘ K</kbd></div>
      <nav className="nav-list">
        {visibleNav.map(group => <div className="nav-group" key={group.group}><div className="nav-heading">{group.group}</div>
          {group.items.map(([label, Icon]) => <button key={label} onClick={() => setPage(label)} className={`nav-item ${active===label?"nav-active":""}`}><Icon size={17}/><span>{label}</span>{label==="Support & incidents" && <span className="nav-count">3</span>}</button>)}
        </div>)}
        {visibleNav.length===0 && <p className="no-results">No matching sections.</p>}
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-icon"><CircleHelp size={18}/></div><div><strong>Need a hand?</strong><span>Visit admin guide</span></div><ChevronRight size={16}/></div>
        <div className="sidebar-user"><div className="avatar">LME</div><div className="user-copy"><strong>Admin workspace</strong><span>Local preview mode</span></div><button className="icon-btn" aria-label="User menu" onClick={()=>setShowProfile(!showProfile)}><ChevronDown size={16}/></button></div>
        {showProfile && <div className="profile-pop"><strong>Preview profile</strong><p>Authentication is not connected in this starter.</p><button onClick={()=>{setShowProfile(false);setNotice("Connect your existing Supabase Auth and server-side RBAC before deployment.")}}>View setup note</button></div>}
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="top-left"><button className="icon-btn mobile-menu" onClick={()=>setSidebarOpen(true)} aria-label="Open menu"><Menu size={20}/></button><div className="breadcrumbs">OncoCare+ <ChevronRight size={14}/> <span>{active}</span></div></div>
        <div className="top-actions"><div className="env-pill"><span/> Development</div><button className="icon-btn notification-btn" aria-label="Notifications" onClick={()=>setPage("Notifications")}><Bell size={19}/><i/></button><div className="top-divider"/><button className="profile-button" onClick={()=>setShowProfile(!showProfile)}><div className="avatar small">L</div><span>Workspace admin</span><ChevronDown size={15}/></button></div>
      </header>

      <div className="page-content">
        {notice && <div className="notice-banner"><CircleHelp size={18}/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Dismiss"><X size={16}/></button></div>}
        <div className="page-heading">
          <div><div className="eyebrow"><span className="eyebrow-dot"/>{active==="Overview"?"MONITORING & OPERATIONS":"CENTRAL ADMINISTRATION"}</div><h1>{title}</h1><p>{active==="Overview"?"A clear view of platform activity, services, and operational health.":"Manage this area from one central workspace. Connect the approved backend to enable live workflows."}</p></div>
          <div className="heading-actions"><button className="button button-secondary" onClick={()=>setNotice("Reports will become available after a secured reporting endpoint is connected.")}><ClipboardList size={16}/> Export report</button><button className="button button-primary" onClick={()=>setPage("System settings")}><Settings2 size={16}/> Configure</button></div>
        </div>

        {active==="Overview" ? <>
          <div className="status-strip"><div className="status-left"><span className="status-indicator warning"><Activity size={15}/></span><div><strong>Development workspace</strong><span>Live database metrics are intentionally not shown until verified.</span></div></div><div className="status-right"><span className={`status-tag ${supabaseConfigured?"tag-warn":"tag-muted"}`}><i/>{supabaseConfigured?"Credentials present · unverified":"Backend not connected"}</span><button className="text-link" onClick={()=>setPage("Integrations & health")}>View integrations <ChevronRight size={15}/></button></div></div>
          <div className="section-title-row"><div><h2>Platform at a glance</h2><p>Live metrics will populate after secure data sources are connected.</p></div><button className="filter-button" onClick={()=>setNotice("Date, hospital and role filters will be wired to verified database queries in the integration phase.")}><SlidersHorizontal size={15}/> Filters</button></div>
          <div className="metric-grid">{metrics.map((m,i)=><div className="metric-card" key={m.label}><div className="metric-top"><div className={`metric-icon ${m.tone}`}><m.icon size={19}/></div><span className="metric-index">0{i+1}</span></div><div className="metric-value">{m.value}</div><div className="metric-label">{m.label}</div><div className="metric-note">{m.note}</div></div>)}</div>
          <div className="content-grid">
            <section className="panel activity-panel"><div className="panel-header"><div><h3>Operational activity</h3><p>Administrative events from connected systems</p></div><button className="subtle-button" onClick={()=>setPage("Audit log")}>View audit log <ChevronRight size={15}/></button></div>
              <div className="empty-state"><div className="empty-icon"><Activity size={23}/></div><strong>No live activity feed yet</strong><p>Once audit logging is connected, recent administrative actions will appear here with actor, target, outcome, and timestamp.</p><button className="button button-secondary" onClick={()=>setPage("Audit log")}>Set up audit logging</button></div>
            </section>
            <section className="panel health-panel"><div className="panel-header"><div><h3>Service health</h3><p>Connection verification</p></div><span className="health-count">4 services</span></div>
              <div className="integration-list">{integrations.map((item,i)=><div className="integration-row" key={item.name}><div className="integration-icon"><item.icon size={17}/></div><div className="integration-copy"><strong>{item.name}</strong><span>{item.desc}</span></div><span className={`mini-status ${i===0&&supabaseConfigured?"pending":""}`}><i/>{i===3?"Not implemented":i===0&&supabaseConfigured?"Unverified":"Not verified"}</span></div>)}</div>
              <button className="full-link" onClick={()=>setPage("Integrations & health")}>Open integration monitor <ChevronRight size={16}/></button>
            </section>
          </div>
          <div className="section-title-row lower-title"><div><h2>Quick controls</h2><p>Common actions for platform administrators</p></div><span className="text-muted"><LockKeyhole size={14}/> Preview only</span></div>
          <div className="quick-grid">
            <button className="quick-card" onClick={()=>setPage("User management")}><div className="quick-icon purple"><Users size={19}/></div><div><strong>User management</strong><span>Accounts, roles and access</span></div><ChevronRight size={17}/></button>
            <button className="quick-card" onClick={()=>setPage("Dashboard & Feature Control")}><div className="quick-icon teal"><SlidersHorizontal size={19}/></div><div><strong>Feature controls</strong><span>Availability and rollout rules</span></div><ChevronRight size={17}/></button>
            <button className="quick-card" onClick={()=>setPage("Support & incidents")}><div className="quick-icon orange"><LifeBuoy size={19}/></div><div><strong>Support & incidents</strong><span>Triage and track issues</span></div><ChevronRight size={17}/></button>
          </div>
        </> : active==="Dashboard & Feature Control" ? <section className="panel feature-panel"><div className="panel-header"><div><h3>Feature availability</h3><p>Preview toggles only. These do not change backend access or production flags.</p></div><span className="status-tag tag-warn"><i/>Local preview</span></div><div className="feature-toolbar"><label>Scope <select value={role} onChange={e=>setRole(e.target.value)}><option>LME Super Admin</option><option>LME Operations Admin</option><option>Hospital Admin</option><option>Doctor</option><option>Caregiver</option><option>Patient</option></select></label><span className="text-muted">Environment: Development</span></div>{Object.entries(featureEnabled).map(([name,on])=><div className="feature-row" key={name}><div className="feature-symbol"><Zap size={17}/></div><div className="feature-info"><strong>{name}</strong><span>Scope: {role} · No server-side flag configured</span></div><button role="switch" aria-checked={on} className={`toggle ${on?"toggle-on":""}`} onClick={()=>setFeatureEnabled(prev=>({...prev,[name]:!prev[name]}))}><span/></button><span className={`toggle-label ${on?"enabled":""}`}>{on?"Preview on":"Preview off"}</span></div>)}<div className="warning-note"><AlertTriangle size={17}/><span>Clinical and patient-care workflows must not be disabled without impact review and an approved fallback.</span></div></section> : <section className="panel module-panel"><div className="module-hero"><div className="module-hero-icon"><Command size={24}/></div><div><span className="eyebrow">MODULE WORKSPACE</span><h2>{active}</h2><p>This section is scaffolded for integration with your existing OncoCare+ database and APIs.</p></div></div><div className="module-cards"><div className="module-info-card"><CheckCircle2 size={19}/><div><strong>Designed for shared authorization</strong><p>Use existing Supabase Auth, role assignments, RLS and server-side permission checks. Do not rely on hidden UI controls.</p></div></div><div className="module-info-card"><ShieldCheck size={19}/><div><strong>Privacy-first administration</strong><p>Keep clinical information minimized. Sensitive access must be specifically approved, time-limited and audited.</p></div></div><div className="module-info-card"><Database size={19}/><div><strong>Real data only</strong><p>No fabricated metrics or “connected” claims. Integration status must come from verified health checks.</p></div></div></div><div className="module-footer"><div><strong>Next step</strong><span>Map this module to your current schema and existing APIs before enabling write actions.</span></div><button className="button button-primary" onClick={()=>setNotice(`Integration checklist opened for ${active}: review current tables, RLS policies, APIs, permissions and audit requirements.`)}>View integration checklist <ChevronRight size={16}/></button></div></section>}
        <footer className="footer"><span>© {new Date().getFullYear()} OncoCare+ · LME Control Centre</span><span><ShieldCheck size={14}/> Built with privacy and accountability in mind</span></footer>
      </div>
    </main>
  </div>;
}
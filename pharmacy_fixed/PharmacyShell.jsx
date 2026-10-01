import React, { useEffect, useState } from 'react';
import { usePharmacy } from './PharmacyContext';
import './PharmacyDashboard.css';

const menu = [
  ['Dashboard', '/pharmacy', '⌂'],
  ['Orders', '/pharmacy/orders', '▣'],
  ['Inventory', '/pharmacy/inventory', '▤'],
  ['Medicines', '/pharmacy/medicines', '✚'],
  ['Customers / Patients', '/pharmacy/patients', '♙'],
  ['Prescriptions', '/pharmacy/prescriptions', '☷'],
  ['Deliveries', '/pharmacy/deliveries', '➜'],
  ['Payments', '/pharmacy/payments', '₹'],
  ['Notifications', '/pharmacy/notifications', '◉'],
  ['Pharmacy Profile', '/pharmacy/profile', '⚙'],
];

export function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function Logo() {
  return (
    <div className="pharmacy-brand" onClick={() => navigate('/pharmacy')} role="button" tabIndex={0}>
      <img src="https://oncocare-delta.vercel.app/brand/oncocare-brandmark.png" alt="OncoCare+" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      <div><strong>OncoCare+</strong><span>Pharmacy</span></div>
    </div>
  );
}

export function PharmacySidebar() {
  const [path, setPath] = useState(window.location.pathname);
  const { notifications, profile } = usePharmacy();
  useEffect(() => { const f = () => setPath(window.location.pathname); window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f); }, []);
  const unread = notifications.filter(n => !n.read).length;
  return (
    <aside className="pharmacy-sidebar">
      <Logo />
      <nav className="pharmacy-navigation">
        <div className="navigation-label">PHARMACY</div>
        {menu.map(([label, href, icon]) => {
          const active = href === '/pharmacy' ? path === href : path.startsWith(href);
          return <button key={href} className={`pharmacy-menu-item ${active ? 'active' : ''}`} onClick={() => navigate(href)}>
            <span className="menu-icon">{icon}</span><span className="menu-label">{label}</span>
            {label === 'Notifications' && unread > 0 && <b className="nav-count">{unread}</b>}
          </button>;
        })}
      </nav>
      <div className="pharmacy-sidebar-footer">
        <div className="pharmacy-avatar">AP</div>
        <div><strong>{profile.name}</strong><span>Pharmacy Manager</span></div>
      </div>
    </aside>
  );
}

export function Page({ title, subtitle, breadcrumb = title, actions, children }) {
  return <>
    <header className="pharmacy-header">
      <div><div className="breadcrumb">Pharmacy / {breadcrumb}</div><h1>{title}</h1><p>{subtitle}</p></div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
    {children}
  </>;
}

export function Shell({ children }) {
  return <div className="pharmacy-layout"><PharmacySidebar /><main className="pharmacy-main">{children}</main></div>;
}

export function StatCard({ title, value, subtitle, icon = '•' }) {
  return <div className="stat-card"><div className="stat-top"><span>{title}</span><div className="stat-icon">{icon}</div></div><strong className="stat-value">{value}</strong>{subtitle && <span className="stat-subtitle">{subtitle}</span>}</div>;
}

export function Card({ title, subtitle, action, children, className = '' }) {
  return <section className={`dashboard-card ${className}`}><div className="card-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

export function money(value) { return `₹${Number(value).toLocaleString('en-IN')}`; }

export function statusClass(status) {
  if (['Completed', 'Delivered', 'Paid', 'Verified', 'Ready'].includes(status)) return 'ready';
  if (['Verification', 'Pending Verification', 'Pending'].includes(status)) return 'verification';
  if (['Preparing', 'Follow-up'].includes(status)) return 'preparing';
  if (['Cancelled', 'Rejected', 'Critical'].includes(status)) return 'danger';
  return 'dispatched';
}

export function Status({ children }) { return <span className={`status-badge ${statusClass(children)}`}>{children}</span>; }

export function Empty({ text }) { return <div className="empty-state"><div>✓</div><strong>{text}</strong><span>Nothing needs attention here right now.</span></div>; }

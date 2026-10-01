import React, { useEffect, useState } from 'react';
import { PharmacyProvider } from './PharmacyContext';
import PharmacyDashboard from './PharmacyDashboard';
import PharmacyOrders from './PharmacyOrders';
import PharmacyInventory from './PharmacyInventory';
import PharmacyMedicines from './PharmacyMedicines';
import PharmacyPatients from './PharmacyPatients';
import PharmacyPrescriptions from './PharmacyPrescriptions';
import PharmacyDeliveries from './PharmacyDeliveries';
import PharmacyPayments from './PharmacyPayments';
import PharmacyNotifications from './PharmacyNotifications';
import PharmacyProfile from './PharmacyProfile';

function Router() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => { const onPop = () => setPath(window.location.pathname); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  if (path === '/' || path === '/pharmacy' || path === '/pharmacy/') return <PharmacyDashboard />;
  if (path.startsWith('/pharmacy/orders')) return <PharmacyOrders />;
  if (path.startsWith('/pharmacy/inventory')) return <PharmacyInventory />;
  if (path.startsWith('/pharmacy/medicines')) return <PharmacyMedicines />;
  if (path.startsWith('/pharmacy/patients')) return <PharmacyPatients />;
  if (path.startsWith('/pharmacy/prescriptions')) return <PharmacyPrescriptions />;
  if (path.startsWith('/pharmacy/deliveries')) return <PharmacyDeliveries />;
  if (path.startsWith('/pharmacy/payments')) return <PharmacyPayments />;
  if (path.startsWith('/pharmacy/notifications')) return <PharmacyNotifications />;
  if (path.startsWith('/pharmacy/profile')) return <PharmacyProfile />;
  window.history.replaceState({}, '', '/');
  return <PharmacyDashboard />;
}

export default function PharmacyApp() {
  return <PharmacyProvider><Router /></PharmacyProvider>;
}

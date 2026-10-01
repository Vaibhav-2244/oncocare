import React from 'react';
import { Card, Page, Shell, statusClass } from './PharmacyShell';
import { usePharmacy } from './PharmacyContext';

export default function PharmacyNotifications(){
 const {notifications,markNotificationRead,markAllNotificationsRead}=usePharmacy();
 return <Shell><Page title="Notifications" subtitle="Important pharmacy alerts and workflow updates" actions={<button className="secondary-button" onClick={markAllNotificationsRead}>Mark all as read</button>} />
 <div className="notification-list">{notifications.map(n=><button key={n.id} className={`notification-card ${n.read?'read':''}`} onClick={()=>markNotificationRead(n.id)}><div className={`notification-icon ${statusClass(n.type)}`}>◉</div><div className="notification-content"><div className="notification-title-row"><strong>{n.title}</strong><span>{n.time}</span></div><p>{n.message}</p><small>{n.type} {n.read?'• Read':'• Unread'}</small></div></button>)}</div></Shell>;
}

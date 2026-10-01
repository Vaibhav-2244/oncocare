import React, { useEffect, useState } from 'react';
import { Card, Page, Shell } from './PharmacyShell';
import { usePharmacy } from './PharmacyContext';

export default function PharmacyProfile(){
 const {profile,saveProfile,resetData}=usePharmacy(); const [form,setForm]=useState(profile); const [saved,setSaved]=useState(false);
 useEffect(()=>setForm(profile),[profile]); const update=e=>setForm(f=>({...f,[e.target.name]:e.target.value}));
 const submit=e=>{e.preventDefault();saveProfile(form);setSaved(true);setTimeout(()=>setSaved(false),1800);};
 return <Shell><Page title="Pharmacy Profile" subtitle="Manage pharmacy information and operational settings" actions={saved?<span className="saved-message">✓ Changes saved</span>:null} />
 <div className="profile-grid"><Card title="Pharmacy Information" subtitle="Basic information shown to the pharmacy team"><form className="profile-form" onSubmit={submit}><label>Pharmacy Name<input name="name" value={form.name} onChange={update}/></label><label>License Number<input name="license" value={form.license} onChange={update}/></label><label>Phone<input name="phone" value={form.phone} onChange={update}/></label><label>Email<input name="email" value={form.email} onChange={update}/></label><label className="full-width">Address<textarea name="address" value={form.address} onChange={update}/></label><div className="form-actions full-width"><button className="primary-button" type="submit">Save Changes</button></div></form></Card>
 <Card title="Operational Status" subtitle="Current pharmacy availability"><div className="profile-status"><div className="status-toggle"><span className="live-dot"/><strong>{form.open?'Pharmacy Open':'Pharmacy Closed'}</strong></div><p>When open, the pharmacy can receive and process new prescriptions and orders.</p><div className="profile-stat"><span>Opening Hours</span><strong>{form.hours}</strong></div><button className="secondary-button" onClick={()=>{const next=!form.open;setForm(f=>({...f,open:next}));saveProfile({open:next});}}>{form.open?'Close Pharmacy':'Open Pharmacy'}</button><button className="danger-outline" onClick={resetData}>Reset Seed Data</button></div></Card></div></Shell>;
}

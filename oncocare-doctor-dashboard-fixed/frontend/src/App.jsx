import React,{useState} from 'react';
import {Routes,Route,Navigate,useNavigate} from 'react-router-dom';
import DoctorLayout from './layouts/DoctorLayout';
import {AppProvider} from './context/AppContext';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import PatientDetail from './pages/PatientDetail';
import {Appointments,Consultations,Prescriptions,TreatmentPlans,Reports,Messages,Notifications,Profile,Settings} from './pages/GenericPages';
import Login from './pages/Login';

function Protected(){
  const [auth,setAuth]=useState(()=>localStorage.getItem('oncocare_doctor_auth')==='1');
  if(!auth) return <Login onLogin={(email,password)=>{
    if(email.trim().toLowerCase()==='doctor@oncocare.demo' && password==='doctor123'){
      localStorage.setItem('oncocare_doctor_auth','1');setAuth(true);return true;
    } return false;
  }}/>;
  return <DoctorLayout onLogout={()=>{localStorage.removeItem('oncocare_doctor_auth');setAuth(false)}}/>;
}
export default function App(){
 return <AppProvider><Routes><Route element={<Protected/>}>
   <Route path="/" element={<Navigate to="/dashboard" replace/>}/>
   <Route path="/dashboard" element={<Dashboard/>}/>
   <Route path="/patients" element={<Patients/>}/>
   <Route path="/patients/:id" element={<PatientDetail/>}/>
   <Route path="/appointments" element={<Appointments/>}/>
   <Route path="/consultations" element={<Consultations/>}/>
   <Route path="/prescriptions" element={<Prescriptions/>}/>
   <Route path="/treatment-plans" element={<TreatmentPlans/>}/>
   <Route path="/reports" element={<Reports/>}/>
   <Route path="/messages" element={<Messages/>}/>
   <Route path="/notifications" element={<Notifications/>}/>
   <Route path="/profile" element={<Profile/>}/>
   <Route path="/settings" element={<Settings/>}/>
   <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
 </Route></Routes></AppProvider>
}

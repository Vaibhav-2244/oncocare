import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {initialPatients,initialAppointments,initialConsultations,initialPrescriptions,initialTreatmentPlans,initialReports,initialMessages,initialNotifications} from '../data/mockData';

const Ctx=createContext(null);
const seed={
  patients:initialPatients, appointments:initialAppointments, consultations:initialConsultations,
  prescriptions:initialPrescriptions, treatmentPlans:initialTreatmentPlans, reports:initialReports,
  messages:initialMessages, notifications:initialNotifications,
  profile:{name:'Dr. Arjun Sharma',specialty:'Medical Oncology',registration:'HMC-ONC-20481',
    hospital:'OncoCare Cancer Centre, Gurugram',email:'arjun.sharma@oncocare.example',
    phone:'+91 98XXXX1122',bio:'Medical oncologist focused on coordinated, longitudinal cancer care.'},
  availability:[
    {day:'Monday',enabled:true,start:'09:00',end:'17:00'},{day:'Tuesday',enabled:true,start:'09:00',end:'17:00'},
    {day:'Wednesday',enabled:true,start:'09:00',end:'17:00'},{day:'Thursday',enabled:true,start:'09:00',end:'17:00'},
    {day:'Friday',enabled:true,start:'09:00',end:'17:00'},{day:'Saturday',enabled:false,start:'09:00',end:'13:00'}
  ]
};
function load(){
  try{
    const raw=localStorage.getItem('oncocare_doctor_state');
    if(!raw) return seed;
    const saved=JSON.parse(raw);
    return {...seed,...saved};
  }catch{return seed}
}
export function AppProvider({children}){
  const [state,setState]=useState(load);
  const [toast,setToast]=useState(null);
  useEffect(()=>localStorage.setItem('oncocare_doctor_state',JSON.stringify(state)),[state]);
  const notify=(message,type='success')=>{
    setToast({message,type});
    window.clearTimeout(window.__ocToast);
    window.__ocToast=window.setTimeout(()=>setToast(null),2800);
  };
  const update=(key,fn)=>setState(s=>({...s,[key]:typeof fn==='function'?fn(s[key]):fn}));
  const reset=()=>{setState(seed);localStorage.setItem('oncocare_doctor_state',JSON.stringify(seed));notify('Demo workspace reset')};
  const exportData=()=>{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url;a.download=`oncocare-doctor-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);
    notify('Workspace backup downloaded');
  };
  const importData=(file)=>{
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{try{
      const incoming=JSON.parse(reader.result);
      setState({...seed,...incoming});notify('Workspace backup restored');
    }catch{notify('Invalid backup file','error')}};
    reader.readAsText(file);
  };
  const value=useMemo(()=>({...state,update,notify,reset,exportData,importData}),[state]);
  return <Ctx.Provider value={value}>{children}{toast&&<div className={'toast '+toast.type}>{toast.message}</div>}</Ctx.Provider>
}
export const useApp=()=>useContext(Ctx);

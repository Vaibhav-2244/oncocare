import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
const PharmacyContext=createContext(null);
async function api(path,options={}){const response=await fetch(path,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Request failed.');return data;}
export function PharmacyProvider({children}){
 const [state,setState]=useState({orders:[],inventory:[],prescriptions:[],patients:[],deliveries:[],payments:[],notifications:[],profile:{}});const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const refresh=async()=>{try{setError('');setState(await api('/api/state'));}catch(e){setError(e.message);}finally{setLoading(false);}};
 useEffect(()=>{refresh();},[]);
 const run=async(path,options)=>{const result=await api(path,options);await refresh();return result;};
 const createOrder=p=>run('/api/orders',{method:'POST',body:JSON.stringify(p)}); const updateOrderStatus=(id,status)=>run(`/api/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});
 const addMedicine=p=>run('/api/inventory',{method:'POST',body:JSON.stringify(p)}); const updateInventory=(id,delta)=>run(`/api/inventory/${id}/stock`,{method:'PATCH',body:JSON.stringify({delta})});
 const createPatient=p=>run('/api/patients',{method:'POST',body:JSON.stringify(p)}); const createPrescription=p=>run('/api/prescriptions',{method:'POST',body:JSON.stringify(p)});
 const approvePrescription=id=>run(`/api/prescriptions/${id}/status`,{method:'PATCH',body:JSON.stringify({status:'Verified'})}); const rejectPrescription=id=>run(`/api/prescriptions/${id}/status`,{method:'PATCH',body:JSON.stringify({status:'Rejected'})});
 const createDelivery=p=>run('/api/deliveries',{method:'POST',body:JSON.stringify(p)}); const updateDeliveryStatus=(id,status)=>run(`/api/deliveries/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});
 const createPayment=p=>run('/api/payments',{method:'POST',body:JSON.stringify(p)}); const markNotificationRead=id=>run(`/api/notifications/${id}/read`,{method:'PATCH',body:'{}'}); const markAllNotificationsRead=()=>run('/api/notifications/read-all',{method:'POST',body:'{}'});
 const saveProfile=p=>run('/api/profile',{method:'PATCH',body:JSON.stringify(p)}); const resetData=()=>run('/api/reset',{method:'POST',body:'{}'});
 const value=useMemo(()=>({...state,loading,error,refresh,createOrder,updateOrderStatus,addMedicine,updateInventory,createPatient,createPrescription,approvePrescription,rejectPrescription,createDelivery,updateDeliveryStatus,createPayment,markNotificationRead,markAllNotificationsRead,saveProfile,resetData}),[state,loading,error]);
 return <PharmacyContext.Provider value={value}>{children}</PharmacyContext.Provider>;
}
export function usePharmacy(){const value=useContext(PharmacyContext);if(!value)throw new Error('usePharmacy must be used inside PharmacyProvider');return value;}

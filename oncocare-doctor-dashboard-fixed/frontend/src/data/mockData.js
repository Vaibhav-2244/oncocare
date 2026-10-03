export const initialPatients = [
 {id:'OC-1042',name:'Priya Sharma',age:46,sex:'Female',cancer:'Breast Cancer',stage:'Stage II',treatment:'Chemotherapy',cycle:'Cycle 4 of 6',status:'Active',risk:'Moderate',score:7.8,lastCheckin:'Today, 09:20',phone:'+91 98XXXX2211',email:'priya.sharma@example.com',nextVisit:'02 Oct 2026',doctorNote:'Mild nausea trend after last cycle; appetite improving.',allergies:'Penicillin',blood:'B+',diagnosed:'14 Jun 2026'},
 {id:'OC-1038',name:'Rajesh Kumar',age:61,sex:'Male',cancer:'Lung Cancer',stage:'Stage III',treatment:'Immunotherapy',cycle:'Maintenance',status:'Active',risk:'Low',score:8.5,lastCheckin:'Yesterday, 18:10',phone:'+91 97XXXX9044',email:'rajesh.k@example.com',nextVisit:'05 Oct 2026',doctorNote:'Stable respiratory symptoms. Continue monitoring SpO₂.',allergies:'None known',blood:'O+',diagnosed:'08 Mar 2026'},
 {id:'OC-1051',name:'Anita Desai',age:54,sex:'Female',cancer:'Colorectal Cancer',stage:'Stage III',treatment:'Chemotherapy',cycle:'Cycle 2 of 8',status:'Active',risk:'High',score:5.2,lastCheckin:'Today, 07:45',phone:'+91 99XXXX1132',email:'anita.d@example.com',nextVisit:'01 Oct 2026',doctorNote:'Persistent fatigue and reduced intake. Review labs before next dose.',allergies:'Sulfa',blood:'A+',diagnosed:'19 Jul 2026'},
 {id:'OC-1060',name:'Arjun Mehta',age:38,sex:'Male',cancer:'Oral Cancer',stage:'Stage I',treatment:'Radiotherapy',cycle:'Week 5 of 7',status:'Active',risk:'Low',score:8.9,lastCheckin:'Today, 11:02',phone:'+91 96XXXX7710',email:'arjun.m@example.com',nextVisit:'09 Oct 2026',doctorNote:'Mucositis controlled with current supportive care.',allergies:'None known',blood:'AB+',diagnosed:'22 Aug 2026'},
 {id:'OC-1067',name:'Neha Singh',age:49,sex:'Female',cancer:'Cervical Cancer',stage:'Stage II',treatment:'Chemoradiation',cycle:'Week 3',status:'Active',risk:'Moderate',score:6.9,lastCheckin:'Yesterday, 15:40',phone:'+91 95XXXX4421',email:'neha.s@example.com',nextVisit:'03 Oct 2026',doctorNote:'Pelvic discomfort reported; hydration adequate.',allergies:'None known',blood:'A-',diagnosed:'11 Aug 2026'},
 {id:'OC-1073',name:'Vikram Rao',age:67,sex:'Male',cancer:'Prostate Cancer',stage:'Stage II',treatment:'Hormone Therapy',cycle:'Month 5',status:'Active',risk:'Low',score:9.1,lastCheckin:'28 Sep 2026',phone:'+91 94XXXX8820',email:'vikram.r@example.com',nextVisit:'12 Oct 2026',doctorNote:'PSA trend improving; no new adverse symptoms.',allergies:'None known',blood:'B-',diagnosed:'03 May 2026'}
];
export const initialAppointments=[
 {id:'A-201',time:'09:00',patientId:'OC-1042',type:'Follow-up',mode:'In clinic',status:'Confirmed',note:'Review nausea trend and cycle 4 response.'},
 {id:'A-202',time:'10:30',patientId:'OC-1051',type:'Consultation',mode:'Video',status:'Pending',note:'Review CBC and hydration concerns.'},
 {id:'A-203',time:'12:15',patientId:'OC-1038',type:'Follow-up',mode:'Video',status:'Confirmed',note:'Respiratory symptom check.'},
 {id:'A-204',time:'15:00',patientId:'OC-1060',type:'Treatment review',mode:'In clinic',status:'Confirmed',note:'Radiotherapy tolerance review.'},
 {id:'A-205',time:'16:30',patientId:'OC-1067',type:'Follow-up',mode:'Video',status:'Pending',note:'Symptom review and treatment adherence.'}
];
export const initialConsultations=[
 {id:'C-801',patientId:'OC-1042',date:'01 Oct 2026',duration:'18 min',summary:'Patient reports mild nausea for two days, no vomiting. Appetite improving. No fever.',status:'Needs sign-off'},
 {id:'C-802',patientId:'OC-1051',date:'30 Sep 2026',duration:'22 min',summary:'Fatigue increased after last cycle. Oral intake down. Awaiting CBC and electrolytes.',status:'Needs sign-off'},
 {id:'C-803',patientId:'OC-1038',date:'29 Sep 2026',duration:'14 min',summary:'Stable cough. No acute dyspnea. Home SpO₂ within reported baseline.',status:'Signed'},
];
export const initialPrescriptions=[
 {id:'RX-310',patientId:'OC-1042',medicine:'Ondansetron 8 mg',dose:'1 tablet',frequency:'Twice daily as needed',duration:'5 days',status:'Active'},
 {id:'RX-311',patientId:'OC-1051',medicine:'Oral rehydration solution',dose:'200 ml',frequency:'After loose stool',duration:'7 days',status:'Active'},
 {id:'RX-312',patientId:'OC-1060',medicine:'Benzydamine mouth rinse',dose:'15 ml',frequency:'Three times daily',duration:'10 days',status:'Active'},
];
export const initialTreatmentPlans=[
 {id:'TP-101',patientId:'OC-1042',plan:'AC-T chemotherapy protocol',progress:67,next:'Cycle 5 · 10 Oct 2026',status:'On track'},
 {id:'TP-102',patientId:'OC-1051',plan:'FOLFOX chemotherapy protocol',progress:25,next:'Cycle 3 · 08 Oct 2026',status:'Review required'},
 {id:'TP-103',patientId:'OC-1060',plan:'External beam radiotherapy',progress:71,next:'Session 26 · 02 Oct 2026',status:'On track'},
];
export const initialReports=[
 {id:'R-5001',patientId:'OC-1051',type:'CBC',date:'01 Oct 2026',flag:'Attention',summary:'Hemoglobin 9.4 g/dL; ANC 1.7 x10⁹/L'},
 {id:'R-5002',patientId:'OC-1042',type:'CMP',date:'30 Sep 2026',flag:'Normal',summary:'Renal and hepatic markers within reported range'},
 {id:'R-5003',patientId:'OC-1038',type:'CT Chest',date:'29 Sep 2026',flag:'Stable',summary:'No new acute finding reported'},
];
export const initialMessages=[
 {id:'M-1',patientId:'OC-1042',sender:'Priya Sharma',text:'Doctor, nausea is better today but I still feel tired.',time:'10:42 AM',unread:true},
 {id:'M-2',patientId:'OC-1051',sender:'Anita Desai',text:'I uploaded my blood report from this morning.',time:'09:18 AM',unread:true},
 {id:'M-3',patientId:'OC-1038',sender:'Rajesh Kumar',text:'My oxygen reading was 96% this morning.',time:'Yesterday',unread:false}
];
export const initialNotifications=[
 {id:'N1',title:'Lab report needs review',text:'CBC for Anita Desai has been flagged.',time:'12 min ago',kind:'warning',read:false},
 {id:'N2',title:'Appointment pending',text:'10:30 consultation is awaiting confirmation.',time:'34 min ago',kind:'info',read:false},
 {id:'N3',title:'Patient check-in received',text:'Priya Sharma completed today’s symptom check-in.',time:'1 hr ago',kind:'success',read:true}
];
export const vitals=[
 {day:'25 Sep',score:6.4,fatigue:6,pain:4},{day:'26 Sep',score:6.8,fatigue:5,pain:4},{day:'27 Sep',score:7.2,fatigue:5,pain:3},{day:'28 Sep',score:7.5,fatigue:4,pain:3},{day:'29 Sep',score:7.7,fatigue:4,pain:2},{day:'30 Sep',score:7.8,fatigue:3,pain:2},{day:'01 Oct',score:8.2,fatigue:3,pain:2}
];

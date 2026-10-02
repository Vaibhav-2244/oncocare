I want to clarify the exact purpose of the Hospital Dashboard for OncoCare\+\.

This dashboard is specifically being designed around the real patient workflow at NCI, AIIMS Jhajjar, so I don’t want a generic hospital\-management dashboard\. I want us to solve the actual problems patients face there\.

Current Problem / Existing Process

When a patient comes to NCI for an appointment or follow\-up, the process is largely dependent on physical OPD cards, stamps, registers, files, and manual queues\.

The current flow is roughly:

1\. Patient enters the OPD\.

2\. Their OPD card is stamped to confirm that they have come to the hospital\.

3\. If they have pending blood tests or other reports, they have to go and collect/check those reports\.

4\. They then go to the respective block/wing where their doctor is sitting\.

5\. They show the day’s hospital/OPD stamp to the staff there\.

6\. The staff manually enters their details into a register\.

7\. The patient is then told which patient/token number is currently going on\.

8\. The patient’s physical file has to be searched and brought to the respective doctor\.

9\. The patient waits for the file and their turn\.

10\. The doctor examines the patient and writes the consultation, medicines, tests, follow\-up, etc\. on the physical OPD card/file\.

11\. If the patient needs to see another doctor/department, they have to physically carry the file again, submit it, get entered into another register/queue, and wait again\.

12\. The same process can repeat for every department\.

Because of this, a patient’s actual consultation may take only a few minutes, but the complete process can take 2–3\+ hours, sometimes much more\.

What I want OncoCare\+ to solve

Every registered NCI patient already has a unique NCI Number\.

I want this NCI Number to become the primary patient identifier throughout the OncoCare\+ hospital workflow\.

For example:

NCI Number: NCI\-24601

When hospital staff searches this number, they should be able to access the patient’s authorized digital record instead of manually searching for a physical file\.

The system should connect:

NCI Number → Patient → Appointment → Department → Doctor → Queue/Token → Reports → Consultation → Prescription → Follow\-up

⸻

Hospital Dashboard

The Hospital Dashboard should act as a real\-time OPD and patient\-flow management system, not just a generic admin dashboard\.

The most important sections should be:

\* Dashboard / Command Center

\* Patient Search

\* OPD & Live Queue

\* Appointments

\* Doctors & Departments

\* Investigations / Reports

\* Patient Records

\* Admissions/Beds

\* Notifications

1\. Universal Patient Search

There should be a prominent search bar where hospital staff can search using:

\* NCI Number

\* Patient name

\* Mobile number

\* Token/queue number

\* Doctor

\* Department

\* Appointment

The NCI Number should be the fastest and most reliable way to find a patient’s record\.

Example:

Search: NCI\-24601

→ Patient profile opens immediately\.

⸻

2\. Digital Patient Check\-In

When a patient arrives at the hospital for an appointment/follow\-up, there should be a digital check\-in process\.

After check\-in:

Appointment → Checked In → Department/Doctor Queue

The system should record the patient’s arrival without requiring the same information to be repeatedly written into different registers\.

⸻

3\. Live OPD Queue

This is one of the MOST IMPORTANT features\.

For every doctor/department, the hospital should be able to see:

\* Current patient/token being served

\* Next patient

\* Waiting patients

\* Patient NCI number

\* Appointment time

\* Check\-in status

\* Consultation status

\* Number of patients ahead

\* Approximate waiting time

Example:

Dr\. Raj Sharma — Medical Oncology

Currently serving: \#102

Next: \#103

Waiting: 21 patients

The patient should also be able to see their own position from their OncoCare\+ patient dashboard\.

For example:

Appointment: 11:30 AM

Your Token: \#118

Currently Serving: \#102

Patients Ahead: 15

Estimated Waiting: 45–60 minutes

The queue should update in real time\.

⸻

4\. Reduce Unnecessary Waiting

The main purpose of this feature is that a patient should NOT have to sit physically outside the doctor’s room for 2–3 hours just to find out when their turn will come\.

As the queue moves, the patient should receive notifications such as:

“Currently Token \#105 is being served\. Your token is \#118\.”

Then:

“You are approximately 5 patients away\. Please proceed towards the OPD\.”

Then:

“Your token \#118 has been called\. Please proceed to Room/OPD \_\_\_\.”

The system should provide a tentative waiting\-time range, not a fake exact consultation time, because actual consultation duration can vary\.

⸻

5\. Physical File Problem

Another major problem I want to solve is the physical file movement\.

Today, the patient’s file may need to be:

Registration → OPD → Doctor → Another Department → Another Doctor → Another Counter

I want the authorized digital patient record to be searchable using the NCI Number so that the doctor/staff does not always have to wait for the physical file to be located\.

The doctor should be able to search:

NCI\-24601

and see the patient’s authorized information, such as:

\* Previous consultations

\* Previous treatment

\* Relevant reports

\* Previous prescriptions

\* Current treatment

\* Pending investigations

\* Previous follow\-ups

\* Relevant medical history

The physical file can continue to exist where institutionally required, but OncoCare\+ should reduce dependency on manually locating and carrying it for every step\.

⸻

6\. Doctor Consultation

Once the patient reaches the doctor, the doctor should be able to open the patient’s record using the NCI Number\.

The doctor should be able to digitally record:

\* Consultation notes

\* Diagnosis/assessment

\* Treatment plan

\* Medicines

\* Investigations

\* Follow\-up

\* Referral to another department

This information should then be reflected in the patient’s OncoCare\+ dashboard according to the appropriate permissions\.

⸻

7\. Reports / Blood Tests

Another important problem is patients having to repeatedly ask whether their blood report or other investigation has arrived\.

The hospital dashboard should show investigation status clearly\.

Example:

NCI\-24601

CBC — Report Ready

LFT — Processing

KFT — Report Ready

PET Scan — Scheduled

Biopsy — Awaiting Report

Suggested workflow:

Test Ordered → Sample Collected → Processing → Report Ready → Doctor Reviewed

The relevant status should automatically sync with the doctor and patient dashboards\.

⸻

8\. Multiple Departments / Doctors

If the patient needs to see another doctor or department, the patient should not have to repeatedly carry their entire file and start the process from zero\.

For example:

Medical Oncology → Radiation Oncology

The first doctor can create a referral\.

The next department should be able to find the patient using their NCI Number and see the relevant authorized information\.

The patient can then receive:

Department: Radiation Oncology

Doctor: Dr\. XYZ

Appointment/Queue: \#XX

Status: Waiting

This should significantly reduce repeated registration and unnecessary file movement\.

⸻

9\. Patient Timeline

I also want a simple timeline for each patient so hospital staff can understand what has happened\.

Example:

30 September

09:15 — Hospital Check\-in

09:20 — Oncology Queue Joined

09:25 — Token \#118 Assigned

10:10 — Blood Sample Collected

10:45 — CBC Report Ready

11:20 — Token \#118 Called

11:25 — Consultation Started

11:45 — Consultation Completed

11:50 — Prescription Generated

11:55 — Follow\-up Scheduled

This should make the entire patient journey visible in one place\.

⸻

10\. Hospital Dashboard Home Screen

The main dashboard should be clean and operational\.

It should show things like:

Today’s OPD Patients

Checked\-In Patients

Currently Waiting

Patients in Consultation

Pending Reports

Today’s Admissions

And below that:

Live OPD Queues

For example:

Medical Oncology — Now Serving \#102 — 21 Waiting

Radiation Oncology — Now Serving \#67 — 14 Waiting

Surgical Oncology — Now Serving \#42 — 9 Waiting

And an Action Required section:

\* Reports ready for review

\* Patients waiting beyond estimated time

\* Doctor/OPD delays

\* Patients who haven’t checked in

\* Pending investigations

⸻

Most Important Requirement

Please don’t make this a complicated generic hospital ERP\.

The dashboard should be designed around one central idea:

NCI Number → Digital Patient Record → Appointment → Check\-in → Live Queue → Doctor → Reports → Treatment → Follow\-up

The primary goal is to reduce:

\* Physical file searching

\* Manual register entries

\* Repeated patient verification

\* Unnecessary movement between counters

\* Repeatedly carrying files between departments

\* Uncertainty about queue position

\* 2–3\+ hours of unnecessary waiting

The patient should always know:

Where do I need to go?

Which doctor am I seeing?

What is my token?

Which number is currently going on?

How many patients are ahead of me?

Approximately how long will I wait?

Are my reports ready?

What is my next step?

And the hospital should always be able to find the patient using the NCI Number and see the relevant status of their journey\.

This is the core workflow I want the Hospital Dashboard of OncoCare\+ to solve\.

11\. Investigation / Diagnostic Scheduling Problem

There is another major problem that I want OncoCare\+ to solve, especially for a specialized cancer hospital like NCI\.

Suppose a doctor sees a patient today and says:

“You need to get a mammography\.”

The patient then goes to the mammography/radiology department to schedule the investigation\.

But sometimes they are told:

“The next available date is after 2–3 months\.”

The problem becomes even bigger because after the test is actually performed, the report may take another 1–2 weeks\.

So a test that the doctor recommended today can practically take 3–4 months or more to complete\.

This creates a huge gap between:

Doctor’s Decision → Investigation → Report → Doctor Review → Treatment Decision

For cancer patients, this delay can significantly affect the continuity of their treatment journey\.

I want OncoCare\+ to address this at the hospital workflow level, not just show the patient an appointment date\.

⸻

12\. Investigation Capacity Management

The Hospital Dashboard should have a dedicated Investigations / Diagnostics Management section\.

It should cover investigations such as:

\* Mammography

\* X\-Ray

\* CT Scan

\* MRI

\* PET\-CT

\* Ultrasound

\* Biopsy

\* Blood Tests

\* Pathology

\* Nuclear Medicine investigations

\* Other oncology\-related investigations

Each investigation type should have its own:

\* Department

\* Machine/equipment

\* Doctor/technician

\* Daily capacity

\* Working hours

\* Available slots

\* Booked slots

\* Emergency/priority slots

\* Waiting list

\* Expected report time

⸻

13\. Doctor Should See Investigation Availability

This is very important\.

When a doctor orders an investigation, the doctor should not simply select:

“Mammography Required\.”

The system should immediately show the doctor the current availability\.

For example:

Mammography

Today’s capacity: 4

Booked: 4

Available: 0

Next available:

15 October — 1 slot

Following available:

18 October — 2 slots

The doctor can then understand that the investigation is currently heavily backlogged\.

Similarly:

CT Scan

Available slots:

2 October — 3

3 October — 5

4 October — 2

MRI

Available slots:

20 October — 2

22 October — 4

This gives the doctor visibility into the actual hospital capacity\.

⸻

14\. Don’t Just Show “No Slots”

If there is no immediate availability, the system should show:

Investigation: Mammography

Current availability: Full

Next available date: 15 October

Waiting period: ~15 days

Expected report: 2–5 working days after investigation

This allows the doctor to make an informed decision about scheduling and follow\-up\.

⸻

15\. Automatic Booking After Doctor Orders Test

Ideally, once the doctor orders an investigation, the patient should be able to see the available slots directly\.

Example:

Doctor orders:

Mammography

On the patient dashboard:

Mammography has been recommended by Dr\. XYZ\.

Available dates:

15 October — 10:00 AM

16 October — 11:30 AM

18 October — 9:30 AM

Patient selects a slot\.

The system creates:

Investigation Appointment

and connects it to:

Patient → NCI Number → Doctor → Investigation → Department → Slot

The patient should not have to separately visit another counter just to find out the next available date\.

⸻

16\. Capacity Should Be Configurable

The hospital should be able to configure the capacity for every investigation\.

For example:

Mammography

Daily capacity: 4

9:00 AM — Patient 1

10:00 AM — Patient 2

11:00 AM — Patient 3

12:00 PM — Patient 4

But the system should NOT assume that every day has the same capacity\.

Hospital staff should be able to configure:

\* Number of machines

\* Working hours

\* Slots per machine

\* Technician availability

\* Doctor availability

\* Holidays

\* Maintenance periods

\* Emergency slots

\* Reserved slots

For example, if there are 2 mammography machines:

Machine 1: 4 patients/day

Machine 2: 4 patients/day

Total capacity:

8 patients/day

The system should calculate availability automatically\.

⸻

17\. Priority / Urgency Management

This is especially important for oncology\.

Not every investigation has the same urgency\.

The doctor should be able to select something like:

Priority:

\* Routine

\* Urgent

\* Clinically Priority

\* Emergency

The hospital should then be able to manage the queue accordingly based on its approved clinical policies\.

For example:

A routine investigation may be scheduled for the next available normal slot\.

An urgent investigation may require hospital staff to find an earlier approved slot\.

The system should never allow patients to arbitrarily jump queues; priority should be controlled through authorized hospital/clinical rules\.

⸻

18\. Waiting List

If all slots are full, the patient should not simply be told:

“Come back after 3 months\.”

Instead, OncoCare\+ should create a proper waiting list\.

Example:

Mammography Waiting List

1\. NCI\-24601 — Routine

2\. NCI\-24652 — Priority

3\. NCI\-24701 — Routine

If a patient cancels their appointment, the system should notify the next eligible patient according to the hospital’s configured rules\.

This can help utilize cancelled slots instead of leaving them unused\.

⸻

19\. Cancellation & Rescheduling

The system should automatically handle:

Booked → Cancelled → Slot Available

If a slot becomes available:

\* Waiting\-list patients can be notified\.

\* Hospital staff can assign the slot according to priority rules\.

\* Doctor/patient dashboards update automatically\.

If the hospital cancels or changes an investigation appointment, the patient should receive a notification\.

⸻

20\. Investigation Status Tracking

After booking, the patient should see the complete status\.

Example:

Mammography

Doctor Ordered ✓

Appointment Booked ✓

Patient Checked In ✓

Investigation Completed ✓

Report Processing ⏳

Report Ready

Doctor Review Pending

This creates a complete investigation journey\.

⸻

21\. Report Turnaround Time

The system should also track how long reports actually take\.

For example:

Mammography

Expected report time: 2–5 working days

The hospital dashboard can then show:

Reports Pending

Mammography — 12

CT — 7

MRI — 5

Biopsy — 18

Pathology — 24

And identify investigations where the report has exceeded the expected turnaround time\.

⸻

22\. Doctor Should Know the Complete Timeline

Suppose I am a doctor and I order a mammography today\.

I should be able to see:

Ordered: 30 September

Appointment: 15 October

Investigation: 15 October

Expected Report: 17–22 October

Report Ready: 18 October

Doctor Review: Pending

This is much better than simply writing “Mammography advised” on a physical card\.

The doctor can also schedule the patient’s follow\-up appropriately\.

For example:

Mammography report expected by 20 October → follow\-up consultation scheduled for 22 October\.

This connects the investigation and follow\-up instead of treating them as separate processes\.

⸻

23\. Hospital Capacity Dashboard

The Hospital Admin should have a high\-level view of diagnostic capacity\.

Example:

Investigation	Daily Capacity	Booked	Available	Waiting List	Next Available

Mammography	4	4	0	32	15 Oct

CT Scan	12	9	3	8	2 Oct

MRI	6	6	0	21	20 Oct

PET\-CT	5	5	0	17	25 Oct

X\-Ray	30	18	12	4	Today

This immediately tells hospital management where the bottlenecks are\.

⸻

24\. Bottleneck Detection

The system should identify departments/investigations where demand is consistently higher than capacity\.

For example:

Mammography

Daily capacity: 4

Average daily demand: 11

Waiting list: 32

The system can flag:

“Mammography capacity is below current demand\.”

Similarly:

Biopsy

Daily capacity: 8

Average demand: 14

This gives hospital management actual data to decide whether additional machines, staff, slots, or operational changes are required\.

The software should identify the bottleneck; the decision about staffing, equipment, or capacity should remain with the hospital\.

⸻

25\. Most Important Workflow

The complete system should connect everything:

Doctor Consultation

↓

Investigation Ordered

↓

System Checks Availability

↓

Available Slots Shown

↓

Patient Books Slot

↓

Investigation Appointment Created

↓

Patient Gets Reminder

↓

Patient Checks In

↓

Investigation Performed

↓

Report Processing

↓

Report Ready

↓

Doctor Notified

↓

Doctor Reviews Report

↓

Treatment Plan Updated

↓

Follow\-up Appointment

This is the workflow I want us to build\.

⸻

Core Objective

The goal is not simply to digitize the existing paper process\.

The goal is to identify where patients are getting stuck and create a connected digital workflow around those bottlenecks\.

For investigations, the key question should always be:

“Doctor ordered the test today — when can the hospital actually perform it, and when will the doctor receive the report?”

OncoCare\+ should make that entire timeline visible to the doctor, hospital staff, and patient, with appropriate role\-based permissions\.

This should work across the different diagnostic departments of a cancer hospital rather than being hard\-coded only for mammography\.


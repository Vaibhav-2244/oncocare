import React, { useState } from 'react';
import {
  CalendarDays,
  Video,
  CheckCircle2,
  Clock3,
  FileText,
  Send,
  Download,
  Check,
  Save,
  Trash2,
  RefreshCw,
  UploadCloud,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  PageHeader,
  SearchBox,
  Badge,
  Modal,
  FormField,
  SelectField,
  Progress,
  Empty,
} from '../components/UI';

const todayLabel = () =>
  new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join('');

export function Appointments() {
  const { appointments, patients, update, notify } = useApp();
  const [modal, setModal] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    patientId: patients[0]?.id || '',
    date: '',
    time: '09:30',
    type: 'Follow-up',
    mode: 'Video',
  });

  const filtered = appointments.filter((a) => {
    const patient = patients.find((p) => p.id === a.patientId);
    return `${patient?.name || ''} ${a.type || ''} ${a.status || ''}`
      .toLowerCase()
      .includes(q.toLowerCase());
  });

  const add = () => {
    if (!form.patientId || !form.time) {
      notify('Patient and time are required', 'error');
      return;
    }

    update('appointments', (items) => [
      ...items,
      {
        id: `A-${Date.now().toString().slice(-6)}`,
        ...form,
        date: form.date || todayLabel(),
        status: 'Pending',
        note: '',
      },
    ]);
    setModal(false);
    notify('Appointment created');
  };

  const setStatus = (id, status) => {
    update('appointments', (items) =>
      items.map((item) => (item.id === id ? { ...item, status } : item))
    );
    notify(`Appointment ${status.toLowerCase()}`);
  };

  const remove = (id) => {
    if (!window.confirm('Cancel and remove this appointment?')) return;
    update('appointments', (items) => items.filter((item) => item.id !== id));
    notify('Appointment removed');
  };

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Create, confirm, reschedule and cancel patient visits."
        action={() => setModal(true)}
        actionLabel="New appointment"
      />

      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search patient or appointment..."
        />
        <div className="toolbar-note">
          <CalendarDays size={16} />
          {filtered.length} scheduled
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Schedule</h2>
            <p>Local workspace calendar · {todayLabel()}</p>
          </div>
        </div>

        {filtered.map((appointment) => {
          const patient = patients.find((p) => p.id === appointment.patientId);
          return (
            <div className="appointment-row extended" key={appointment.id}>
              <div className="time">{appointment.time}</div>
              <div className="appt-icon">
                {appointment.mode === 'Video' ? (
                  <Video size={17} />
                ) : (
                  <CalendarDays size={17} />
                )}
              </div>
              <div className="appt-main">
                <strong>{patient?.name || 'Unknown patient'}</strong>
                <span>
                  {appointment.type} · {appointment.mode} ·{' '}
                  {appointment.date || 'Today'}
                </span>
              </div>
              <Badge
                tone={
                  appointment.status === 'Pending'
                    ? 'warning'
                    : appointment.status === 'Cancelled'
                      ? 'danger'
                      : 'success'
                }
              >
                {appointment.status}
              </Badge>
              <div className="row-actions">
                <button
                  className="icon-btn"
                  title="Confirm"
                  onClick={() => setStatus(appointment.id, 'Confirmed')}
                >
                  <Check size={15} />
                </button>
                <button
                  className="icon-btn"
                  title="Cancel"
                  onClick={() => setStatus(appointment.id, 'Cancelled')}
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  className="icon-btn danger-icon"
                  title="Delete"
                  onClick={() => remove(appointment.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}

        {!filtered.length && <Empty text="No appointments found." />}
      </div>

      {modal && (
        <Modal
          title="New appointment"
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setModal(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={add}>
                Create appointment
              </button>
            </>
          }
        >
          <div className="form-grid">
            <SelectField
              label="Patient"
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
            >
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} · {patient.id}
                </option>
              ))}
            </SelectField>
            <FormField
              label="Date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
            <FormField
              label="Time"
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
            <SelectField
              label="Visit type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option>Follow-up</option>
              <option>Consultation</option>
              <option>Treatment review</option>
              <option>Tele-oncology</option>
            </SelectField>
            <SelectField
              label="Mode"
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}
            >
              <option>Video</option>
              <option>In clinic</option>
            </SelectField>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Consultations() {
  const { consultations, patients, update, notify } = useApp();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    patientId: patients[0]?.id || '',
    summary: '',
    duration: '30 min',
  });

  const add = () => {
    if (!form.summary.trim()) {
      notify('Consultation summary is required', 'error');
      return;
    }
    update('consultations', (items) => [
      {
        id: `C-${Date.now().toString().slice(-6)}`,
        ...form,
        date: todayLabel(),
        status: 'Draft',
      },
      ...items,
    ]);
    setModal(false);
    notify('Consultation draft created');
  };

  const sign = (id) => {
    update('consultations', (items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'Signed',
              signedAt: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            }
          : item
      )
    );
    notify('Consultation signed');
  };

  return (
    <div>
      <PageHeader
        title="Consultations"
        subtitle="Document encounters, add clinical summaries and sign notes."
        action={() => setModal(true)}
        actionLabel="New consultation"
      />

      <div className="cards-grid">
        {consultations.map((consultation) => {
          const patient = patients.find((p) => p.id === consultation.patientId);
          return (
            <div className="panel consultation-card" key={consultation.id}>
              <div className="card-top">
                <div className="avatar small">{initials(patient?.name)}</div>
                <div>
                  <b>{patient?.name || 'Unknown patient'}</b>
                  <span>
                    {consultation.id} · {consultation.date} · {consultation.duration}
                  </span>
                </div>
                <Badge tone={consultation.status === 'Signed' ? 'success' : 'warning'}>
                  {consultation.status}
                </Badge>
              </div>
              <p>{consultation.summary}</p>
              <div className="card-actions">
                {consultation.status !== 'Signed' && (
                  <button className="btn primary" onClick={() => sign(consultation.id)}>
                    <Check size={15} />
                    Sign & lock note
                  </button>
                )}
                <button className="btn ghost" onClick={() => notify('Summary ready for review')}>
                  Review
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <Modal
          title="New consultation"
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setModal(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={add}>
                Save draft
              </button>
            </>
          }
        >
          <div className="form-grid">
            <SelectField
              label="Patient"
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
            >
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name}
                </option>
              ))}
            </SelectField>
            <FormField
              label="Duration"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
            />
            <FormField
              label="Clinical summary"
              type="textarea"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="Assessment, response to treatment, plan..."
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Prescriptions() {
  const { prescriptions, patients, update, notify } = useApp();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    patientId: patients[0]?.id || '',
    medicine: '',
    dose: '',
    frequency: 'Once daily',
    duration: '7 days',
    instructions: '',
  });

  const add = () => {
    if (!form.medicine.trim() || !form.dose.trim()) {
      notify('Medicine and dose are required', 'error');
      return;
    }
    update('prescriptions', (items) => [
      {
        id: `RX-${Date.now().toString().slice(-6)}`,
        ...form,
        status: 'Active',
        created: todayLabel(),
      },
      ...items,
    ]);
    setModal(false);
    notify('Prescription saved');
  };

  const discontinue = (id) => {
    update('prescriptions', (items) =>
      items.map((item) => (item.id === id ? { ...item, status: 'Discontinued' } : item))
    );
    notify('Prescription discontinued');
  };

  return (
    <div>
      <PageHeader
        title="Prescriptions"
        subtitle="Create medication orders and manage active prescriptions."
        action={() => setModal(true)}
        actionLabel="New prescription"
      />
      <div className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Medicine</th>
                <th>Dose</th>
                <th>Frequency</th>
                <th>Duration</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prescriptions.map((prescription) => {
                const patient = patients.find((p) => p.id === prescription.patientId);
                return (
                  <tr key={prescription.id}>
                    <td>
                      <b>{patient?.name || 'Unknown patient'}</b>
                      <span className="cell-sub">{prescription.id}</span>
                    </td>
                    <td>
                      <b>{prescription.medicine}</b>
                      <span className="cell-sub">
                        {prescription.instructions || 'No special instructions'}
                      </span>
                    </td>
                    <td>{prescription.dose}</td>
                    <td>{prescription.frequency}</td>
                    <td>{prescription.duration}</td>
                    <td>
                      <Badge tone={prescription.status === 'Active' ? 'success' : 'neutral'}>
                        {prescription.status}
                      </Badge>
                    </td>
                    <td>
                      {prescription.status === 'Active' && (
                        <button
                          className="icon-btn"
                          title="Discontinue"
                          onClick={() => discontinue(prescription.id)}
                        >
                          <Check size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal
          title="New prescription"
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setModal(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={add}>
                Save prescription
              </button>
            </>
          }
        >
          <div className="form-grid">
            <SelectField
              label="Patient"
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
            >
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name}
                </option>
              ))}
            </SelectField>
            <FormField
              label="Medicine"
              value={form.medicine}
              onChange={(e) => setForm({ ...form, medicine: e.target.value })}
              placeholder="Medicine name"
            />
            <FormField
              label="Dose"
              value={form.dose}
              onChange={(e) => setForm({ ...form, dose: e.target.value })}
              placeholder="e.g. 500 mg"
            />
            <SelectField
              label="Frequency"
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            >
              <option>Once daily</option>
              <option>Twice daily</option>
              <option>Three times daily</option>
              <option>Every 8 hours</option>
              <option>As needed</option>
            </SelectField>
            <FormField
              label="Duration"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
            />
            <FormField
              label="Instructions"
              type="textarea"
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

export function TreatmentPlans() {
  const { treatmentPlans, patients, update, notify } = useApp();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    patientId: patients[0]?.id || '',
    plan: '',
    progress: 0,
    next: '',
    status: 'On track',
  });

  const add = () => {
    if (!form.plan.trim()) {
      notify('Treatment plan name is required', 'error');
      return;
    }
    update('treatmentPlans', (items) => [
      {
        id: `TP-${Date.now().toString().slice(-6)}`,
        ...form,
        progress: Number(form.progress),
      },
      ...items,
    ]);
    setModal(false);
    notify('Treatment plan created');
  };

  const advance = (id) => {
    update('treatmentPlans', (items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const nextProgress = Math.min(100, Number(item.progress) + 10);
        return {
          ...item,
          progress: nextProgress,
          status: nextProgress >= 100 ? 'Completed' : 'On track',
        };
      })
    );
    notify('Plan progress updated');
  };

  return (
    <div>
      <PageHeader
        title="Treatment Plans"
        subtitle="Track protocols, milestones and treatment progress."
        action={() => setModal(true)}
        actionLabel="New treatment plan"
      />
      <div className="cards-grid">
        {treatmentPlans.map((plan) => {
          const patient = patients.find((p) => p.id === plan.patientId);
          return (
            <div className="panel plan-card" key={plan.id}>
              <div className="card-top">
                <div>
                  <b>{patient?.name || 'Unknown patient'}</b>
                  <span>
                    {patient?.cancer} · {plan.id}
                  </span>
                </div>
                <Badge
                  tone={
                    plan.status === 'Review required'
                      ? 'warning'
                      : plan.status === 'Completed'
                        ? 'neutral'
                        : 'success'
                  }
                >
                  {plan.status}
                </Badge>
              </div>
              <h3>{plan.plan}</h3>
              <div className="progress-label">
                <span>Plan progress</span>
                <b>{plan.progress}%</b>
              </div>
              <Progress value={plan.progress} />
              <div className="plan-next">
                <Clock3 size={15} />
                Next: {plan.next || 'Not scheduled'}
              </div>
              {plan.progress < 100 && (
                <button className="btn ghost plan-btn" onClick={() => advance(plan.id)}>
                  Mark next milestone
                </button>
              )}
            </div>
          );
        })}
      </div>

      {modal && (
        <Modal
          title="New treatment plan"
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setModal(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={add}>
                Create plan
              </button>
            </>
          }
        >
          <div className="form-grid">
            <SelectField
              label="Patient"
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
            >
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name}
                </option>
              ))}
            </SelectField>
            <FormField
              label="Plan / protocol"
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
              placeholder="e.g. FOLFOX protocol"
            />
            <FormField
              label="Progress %"
              type="number"
              min="0"
              max="100"
              value={form.progress}
              onChange={(e) => setForm({ ...form, progress: e.target.value })}
            />
            <FormField
              label="Next milestone"
              value={form.next}
              onChange={(e) => setForm({ ...form, next: e.target.value })}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Reports() {
  const { reports, patients, update, notify } = useApp();
  const [modal, setModal] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    patientId: patients[0]?.id || '',
    type: 'CBC',
    summary: '',
    flag: 'Normal',
  });

  const filtered = reports.filter((report) => {
    const patient = patients.find((p) => p.id === report.patientId);
    return `${report.type} ${report.summary} ${patient?.name || ''}`
      .toLowerCase()
      .includes(q.toLowerCase());
  });

  const add = () => {
    if (!form.summary.trim()) {
      notify('Report summary is required', 'error');
      return;
    }
    update('reports', (items) => [
      {
        id: `R-${Date.now().toString().slice(-6)}`,
        ...form,
        date: todayLabel(),
      },
      ...items,
    ]);
    setModal(false);
    notify('Report added');
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Review investigations and record clinically relevant findings."
        action={() => setModal(true)}
        actionLabel="Add report"
      />
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search reports..." />
        <div className="toolbar-note">
          <FileText size={16} />
          {filtered.length} reports
        </div>
      </div>
      <div className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Report</th>
                <th>Patient</th>
                <th>Date</th>
                <th>Summary</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((report) => {
                const patient = patients.find((p) => p.id === report.patientId);
                return (
                  <tr key={report.id}>
                    <td>
                      <b>{report.type}</b>
                      <span className="cell-sub">{report.id}</span>
                    </td>
                    <td>{patient?.name || 'Unknown patient'}</td>
                    <td>{report.date}</td>
                    <td>{report.summary}</td>
                    <td>
                      <Badge
                        tone={
                          report.flag === 'Attention'
                            ? 'danger'
                            : report.flag === 'Watch'
                              ? 'warning'
                              : 'success'
                        }
                      >
                        {report.flag}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && <Empty text="No reports found." />}
        </div>
      </div>

      {modal && (
        <Modal
          title="Add investigation report"
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setModal(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={add}>
                <UploadCloud size={16} />
                Save report
              </button>
            </>
          }
        >
          <div className="form-grid">
            <SelectField
              label="Patient"
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
            >
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Report type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option>CBC</option>
              <option>CMP</option>
              <option>CT</option>
              <option>MRI</option>
              <option>PET-CT</option>
              <option>Pathology</option>
            </SelectField>
            <SelectField
              label="Clinical flag"
              value={form.flag}
              onChange={(e) => setForm({ ...form, flag: e.target.value })}
            >
              <option>Normal</option>
              <option>Watch</option>
              <option>Attention</option>
            </SelectField>
            <FormField
              label="Summary / finding"
              type="textarea"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="Enter the report finding..."
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Messages() {
  const { messages, patients, update, notify } = useApp();
  const patientIds = [...new Set(messages.map((message) => message.patientId))];
  const [selectedPatient, setSelectedPatient] = useState(patientIds[0] || '');
  const [text, setText] = useState('');

  const currentPatient = patients.find((patient) => patient.id === selectedPatient);
  const conversation = messages.filter((message) => message.patientId === selectedPatient);

  const send = () => {
    if (!text.trim() || !selectedPatient) return;
    update('messages', (items) => [
      ...items,
      {
        id: `M-${Date.now()}`,
        patientId: selectedPatient,
        sender: 'Dr. Arjun Sharma',
        text: text.trim(),
        time: 'Just now',
        unread: false,
      },
    ]);
    setText('');
    notify('Message sent');
  };

  const selectPatient = (patientId) => {
    setSelectedPatient(patientId);
    update('messages', (items) =>
      items.map((item) =>
        item.patientId === patientId ? { ...item, unread: false } : item
      )
    );
  };

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Coordinate follow-up and communicate with patients."
      />

      <div className="message-layout panel">
        <div className="conversation-list">
          {patientIds.map((patientId) => {
            const patient = patients.find((item) => item.id === patientId);
            const patientMessages = messages.filter(
              (message) => message.patientId === patientId
            );
            const last = patientMessages[patientMessages.length - 1];
            const unread = patientMessages.some((message) => message.unread);

            return (
              <button
                className={patientId === selectedPatient ? 'selected' : ''}
                key={patientId}
                onClick={() => selectPatient(patientId)}
              >
                <div className="avatar small">{initials(patient?.name)}</div>
                <div>
                  <b>{patient?.name || 'Unknown patient'}</b>
                  <span>{last?.text || 'No messages yet'}</span>
                  <small>{last?.time || ''}</small>
                </div>
                {unread && <i />}
              </button>
            );
          })}
        </div>

        <div className="chat">
          <div className="chat-head">
            <div className="avatar small">{initials(currentPatient?.name)}</div>
            <div>
              <b>{currentPatient?.name || 'Select a patient'}</b>
              {currentPatient && (
                <span>
                  {currentPatient.cancer} · {currentPatient.id}
                </span>
              )}
            </div>
          </div>

          <div className="chat-body">
            {conversation.map((message) => (
              <div
                className={message.sender.startsWith('Dr.') ? 'bubble me' : 'bubble'}
                key={message.id}
              >
                <p>{message.text}</p>
                <small>{message.time}</small>
              </div>
            ))}
            {!conversation.length && <Empty text="No messages for this patient." />}
          </div>

          <div className="composer">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a secure message..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
              }}
              disabled={!selectedPatient}
            />
            <button
              className="btn primary"
              onClick={send}
              disabled={!selectedPatient || !text.trim()}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Notifications() {
  const { notifications, update } = useApp();

  const markAll = () => {
    update('notifications', (items) => items.map((item) => ({ ...item, read: true })));
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Clinical alerts and workflow updates."
        action={markAll}
        actionLabel="Mark all read"
      />
      <div className="panel notification-list">
        {notifications.map((notification) => (
          <div
            className={`notification ${!notification.read ? 'unread' : ''}`}
            key={notification.id}
          >
            <div className={`notif-icon ${notification.kind}`}>
              {notification.kind === 'success' ? (
                <CheckCircle2 size={18} />
              ) : (
                <Clock3 size={18} />
              )}
            </div>
            <div>
              <b>{notification.title}</b>
              <p>{notification.text}</p>
              <small>{notification.time}</small>
            </div>
            {!notification.read && <span className="unread-dot" />}
          </div>
        ))}
        {!notifications.length && <Empty text="No notifications." />}
      </div>
    </div>
  );
}

export function Profile() {
  const { profile, availability, update, notify } = useApp();
  const [form, setForm] = useState(profile);
  const [saved, setSaved] = useState(false);

  const save = () => {
    update('profile', form);
    setSaved(true);
    notify('Profile saved');
    window.setTimeout(() => setSaved(false), 1500);
  };

  const changeAvail = (index, key, value) => {
    update('availability', (items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      )
    );
  };

  return (
    <div>
      <PageHeader
        title="Profile & Availability"
        subtitle="Keep your professional details and consultation hours current."
      />

      <div className="profile-grid">
        <section className="panel">
          <div className="profile-cover">
            <div className="avatar xl">AS</div>
            <div>
              <h2>{form.name}</h2>
              <p>{form.specialty}</p>
            </div>
          </div>

          <div className="form-grid profile-form">
            <FormField
              label="Full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <FormField
              label="Specialty"
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
            />
            <FormField
              label="Registration number"
              value={form.registration}
              onChange={(e) => setForm({ ...form, registration: e.target.value })}
            />
            <FormField
              label="Hospital / clinic"
              value={form.hospital}
              onChange={(e) => setForm({ ...form, hospital: e.target.value })}
            />
            <FormField
              label="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <FormField
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <FormField
              label="Bio"
              type="textarea"
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </div>

          <button className="btn primary" onClick={save}>
            <Save size={16} />
            {saved ? 'Saved' : 'Save profile'}
          </button>
        </section>

        <section className="panel availability">
          <div className="panel-head">
            <div>
              <h2>Availability</h2>
              <p>Changes persist in this browser.</p>
            </div>
          </div>

          {availability.map((day, index) => (
            <div className="availability-row" key={day.day}>
              <b>{day.day}</b>
              <label>
                <input
                  type="checkbox"
                  checked={day.enabled}
                  onChange={(e) => changeAvail(index, 'enabled', e.target.checked)}
                />
                <span>Available</span>
              </label>
              <input
                type="time"
                value={day.start}
                onChange={(e) => changeAvail(index, 'start', e.target.value)}
              />
              <span>to</span>
              <input
                type="time"
                value={day.end}
                onChange={(e) => changeAvail(index, 'end', e.target.value)}
              />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

export function Settings() {
  const { reset, exportData, importData } = useApp();
  const ref = React.useRef(null);

  return (
    <div>
      <PageHeader
        title="Workspace Settings"
        subtitle="Control local demo data and backups."
      />

      <div className="settings-grid">
        <section className="panel setting-card">
          <h2>Data backup</h2>
          <p>
            Export the current patient, appointment and clinical workspace as JSON.
          </p>
          <button className="btn primary" onClick={exportData}>
            <Download size={16} />
            Download backup
          </button>
          <button className="btn ghost" onClick={() => ref.current?.click()}>
            <UploadCloud size={16} />
            Restore backup
          </button>
          <input
            ref={ref}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => importData(e.target.files?.[0])}
          />
        </section>

        <section className="panel setting-card danger-panel">
          <h2>Reset demo workspace</h2>
          <p>
            Restore the original demonstration dataset. This removes local changes in
            this browser.
          </p>
          <button
            className="btn danger"
            onClick={() => {
              if (window.confirm('Reset all local changes?')) reset();
            }}
          >
            <RefreshCw size={16} />
            Reset data
          </button>
        </section>
      </div>
    </div>
  );
}

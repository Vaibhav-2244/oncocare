import jsPDF from 'jspdf';

export function printPrescription(prescription: { prescription_no: string; items: { medicine?: string; dose?: string }[]; created_at: string }, doctorName: string, patientName: string) {
  const pdf = new jsPDF();
  pdf.setFontSize(18);
  pdf.text('OncoCare+ Prescription', 20, 20);
  pdf.setFontSize(11);
  pdf.text(`Prescription: ${prescription.prescription_no}`, 20, 32);
  pdf.text(`Doctor: ${doctorName}`, 20, 40);
  pdf.text(`Patient: ${patientName}`, 20, 48);
  pdf.text(`Date: ${new Date(prescription.created_at).toLocaleDateString()}`, 20, 56);
  pdf.line(20, 62, 190, 62);
  prescription.items.forEach((item, index) => pdf.text(`${index + 1}. ${item.medicine || 'Medicine'} ${item.dose || ''}`, 24, 74 + index * 10));
  pdf.text('Signature: ____________________', 20, 74 + prescription.items.length * 10 + 20);
  pdf.save(`${prescription.prescription_no}.pdf`);
}

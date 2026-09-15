'use client';

import { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import type { BplDonation } from '@/lib/bpl-api';

export function generateDonationReceipt(donation: BplDonation & { patientName?: string }) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const teal: [number, number, number] = [7, 151, 153];
  const dark: [number, number, number] = [17, 55, 83];
  const grey: [number, number, number] = [105, 125, 140];
  const border: [number, number, number] = [218, 232, 233];
  const light: [number, number, number] = [241, 248, 248];
  const successBg: [number, number, number] = [235, 249, 247];

  const pageWidth = 210;
  const left = 20;
  const right = 190;
  const contentWidth = right - left;

  // Top brand bar
  doc.setFillColor(teal[0], teal[1], teal[2]);
  doc.rect(0, 0, pageWidth, 7, 'F');

  // Brand
  doc.setTextColor(teal[0], teal[1], teal[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text('OncoCare+', left, 25);

  doc.setTextColor(grey[0], grey[1], grey[2]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('BPL Donation Platform', left, 32);

  doc.setDrawColor(border[0], border[1], border[2]);
  doc.line(left, 40, right, 40);

  // Title
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('Donation Receipt', left, 54);

  doc.setTextColor(grey[0], grey[1], grey[2]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Thank you for supporting a verified cancer patient.', left, 62);

  // Receipt meta box
  doc.setFillColor(light[0], light[1], light[2]);
  doc.roundedRect(left, 72, contentWidth, 21, 3, 3, 'F');

  doc.setTextColor(grey[0], grey[1], grey[2]);
  doc.setFontSize(7);
  doc.text('RECEIPT ID', 27, 80);
  doc.text('DATE & TIME', 125, 80);

  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(String(donation.id).slice(0, 8).toUpperCase(), 27, 87);
  doc.text(
    new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(donation.created_at as string)),
    125,
    87
  );

  // Section heading
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.setFontSize(12.5);
  doc.text('Donation Details', left, 108);

  let y = 120;

  const row = (label: string, value: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(grey[0], grey[1], grey[2]);
    doc.text(label, 27, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(dark[0], dark[1], dark[2]);

    const text = String(value ?? '-');
    const lines = doc.splitTextToSize(text, 98);
    doc.text(lines, 82, y);

    y += Math.max(10, lines.length * 4.5 + 5);
  };

  row('Donor Name', donation.donor_name || 'Anonymous');
  row('Donor Email', donation.donor_email || '—');
  row('Beneficiary', donation.patientName || 'Patient');
  row(
    'Payment Method',
    donation.payment_method === 'upi'
      ? 'UPI'
      : donation.payment_method === 'card'
        ? 'Debit / Credit Card'
        : 'Net Banking'
  );

  // Amount highlight
  doc.setFillColor(light[0], light[1], light[2]);
  doc.roundedRect(left, y + 1, contentWidth, 24, 3, 3, 'F');

  doc.setTextColor(grey[0], grey[1], grey[2]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('DONATION AMOUNT', 27, y + 10);

  doc.setTextColor(teal[0], teal[1], teal[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(
    `Rs. ${Number(donation.amount || 0).toLocaleString('en-IN')}`,
    27,
    y + 19
  );

  y += 35;

  // Verification box
  doc.setDrawColor(border[0], border[1], border[2]);
  doc.setFillColor(successBg[0], successBg[1], successBg[2]);
  doc.roundedRect(left, y, contentWidth, 25, 3, 3, 'FD');

  doc.setTextColor(teal[0], teal[1], teal[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Verified Patient Campaign', 27, y + 10);

  doc.setTextColor(grey[0], grey[1], grey[2]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Contribution recorded for the patient\'s treatment campaign.', 27, y + 18);

  // Footer
  doc.setDrawColor(border[0], border[1], border[2]);
  doc.line(left, 270, right, 270);

  doc.setTextColor(grey[0], grey[1], grey[2]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(
    'System-generated receipt | Demo mode - no real payment was processed.',
    left,
    279
  );

  doc.setTextColor(teal[0], teal[1], teal[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('OncoCare+', left, 287);

  doc.setTextColor(grey[0], grey[1], grey[2]);
  doc.setFont('helvetica', 'normal');
  doc.text('Together we can support cancer care.', 48, 287);

  doc.save(
    `${String(donation.id).slice(0, 8)}-Donation-Receipt.pdf`
  );
}

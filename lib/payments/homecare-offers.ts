export type HomecareOfferRow = {
  id: string;
  offer_type: string;
  amount_in_paise: number | string;
  duration_days: number | null;
};

export type HomecareOffer = {
  id: string;
  offer_type: 'daily' | 'monthly';
  amount_in_paise: number;
  duration_days: number;
};

export function resolveHomecareOffer(
  row: HomecareOfferRow | null,
  selectedOfferId: string,
  selectedOfferType: string,
): HomecareOffer | null {
  if (!row || row.id !== selectedOfferId || row.offer_type !== selectedOfferType) return null;
  return validateHomecareOffers([row]).offers[0] ?? null;
}

export function validateHomecareOffers(rows: HomecareOfferRow[]) {
  const offers: HomecareOffer[] = [];
  const invalidTypes = new Set<string>();

  for (const row of rows) {
    if (row.offer_type !== 'daily' && row.offer_type !== 'monthly') {
      invalidTypes.add(row.offer_type);
      continue;
    }
    const amount = Number(row.amount_in_paise);
    const duration = row.offer_type === 'daily' ? 1 : Number(row.duration_days);
    const validDuration = row.offer_type === 'daily'
      ? row.duration_days === null || row.duration_days === 1
      : Number.isSafeInteger(duration) && duration > 0;

    if (!Number.isSafeInteger(amount) || amount <= 0 || !validDuration || !row.id) {
      invalidTypes.add(row.offer_type);
      continue;
    }

    offers.push({
      id: row.id,
      offer_type: row.offer_type,
      amount_in_paise: amount,
      duration_days: duration,
    });
  }

  const unavailableReason = offers.length
    ? null
    : rows.length === 0
      ? 'No active daily or monthly offer is configured for this provider. Ask an administrator to add and activate an approved offer in Payment configuration.'
      : `No valid active home-care offers are available${invalidTypes.size ? ` (${Array.from(invalidTypes).join(', ')} offer configuration is invalid)` : ''}. Ask an administrator to review the provider’s approved offers.`;

  return { offers, unavailableReason };
}

export function homecareDemoCheckoutBlockReason({
  isDemo,
  paidDemoCheckoutsEnabled,
  consentAccepted,
}: {
  isDemo: boolean;
  paidDemoCheckoutsEnabled: boolean;
  consentAccepted: boolean;
}): string | null {
  if (isDemo && (!paidDemoCheckoutsEnabled || !consentAccepted)) {
    return 'Paid-demo home-care checkout requires operator enablement and explicit demo disclosure consent.';
  }
  return null;
}

export function patientDonationBlockReason({
  donationsEnabled,
  campaignExists,
  campaignVerified,
  bplStatusVerified,
  medicalDocumentsVerified,
  beneficiaryAccountVerified,
}: {
  donationsEnabled: boolean;
  campaignExists: boolean;
  campaignVerified: boolean;
  bplStatusVerified: boolean;
  medicalDocumentsVerified: boolean;
  beneficiaryAccountVerified: boolean;
}): string | null {
  const blockers: string[] = [];
  if (!campaignExists) {
    blockers.push('The selected patient campaign was not found.');
  } else {
    if (!campaignVerified) blockers.push('This patient campaign is not verified for donations.');
    const missingApprovals = [
      !bplStatusVerified && 'BPL status verification',
      !medicalDocumentsVerified && 'medical document verification',
      !beneficiaryAccountVerified && 'beneficiary account verification',
    ].filter((value): value is string => Boolean(value));
    if (missingApprovals.length) {
      blockers.push(`Patient donations require completed ${missingApprovals.join(', ')}.`);
    }
  }
  if (!donationsEnabled) {
    blockers.push('Patient-specific donations are disabled because PATIENT_DONATIONS_ENABLED is false. Enable it only after operator and merchant approvals; campaign verification is still required.');
  }
  return blockers.length ? blockers.join(' ') : null;
}

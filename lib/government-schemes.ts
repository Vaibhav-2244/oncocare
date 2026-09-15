export type PatientProfile = {
  state: string;
  cancer: string;
  stage: string;
  income: string;
  bpl: string;
  pmjayEligible: string;
  ppp: string;
  treatment: string;
  treatmentCentre: string;
  governmentEmployee: string;
};

export type GovernmentScheme = {
  id: string;
  name: string;
  category: string;
  scope: string;
  description: string;
  benefit: string;
  officialUrl: string;
  source: string;
  lastVerified: string;
  eligibility: {
    states: 'all' | string[];
    cancerRelevant?: boolean;
    cancerRequired?: boolean;
    stageRequired?: string[];
    incomeLimit?: number;
    bplRequired?: boolean;
    pmjayConfirmationRequired?: boolean;
    pppRequired?: boolean;
    treatmentRequired?: boolean;
    treatmentCentreRequired?: boolean;
    governmentEmployeeExcluded?: boolean;
    governmentHospitalRequired?: boolean;
  };
  documents: string[];
  applicationSteps: string[];
};

export type SchemeResult = GovernmentScheme & {
  matchScore: number;
  matchLevel: 'Potential Match' | 'Needs Verification';
  matchedReasons: string[];
  failedRequirements: string[];
  verificationReasons: string[];
};

export const statesAndUTs = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

export const governmentSchemes: GovernmentScheme[] = [
  {
    id: 'pmjay', name: 'Ayushman Bharat PM-JAY', category: 'Central Government', scope: 'National',
    description: 'Ayushman Bharat PM-JAY provides cashless health assurance for eligible beneficiaries through empanelled hospitals. Cancer treatment packages are covered, subject to clinical approval and pre-authorisation.',
    benefit: 'Up to Rs 5 lakh per eligible family per year', officialUrl: 'https://pmjay.gov.in/', source: 'National Health Authority, Government of India', lastVerified: '25 Aug 2026',
    eligibility: { states: 'all', cancerRelevant: true, pmjayConfirmationRequired: true, treatmentRequired: true },
    documents: ['Government-approved identity document', 'Beneficiary or family identification details', 'Relevant hospital and treatment records'],
    applicationSteps: ['Check beneficiary status on the official NHA portal', 'Visit an empanelled hospital', 'Complete beneficiary verification', 'The hospital processes applicable treatment approval'],
  },
  {
    id: 'hmcpf', name: "Health Minister's Cancer Patient Fund (HMCPF)", category: 'Central Government', scope: 'National',
    description: 'HMCPF operates under the Rashtriya Arogya Nidhi framework and provides financial assistance to eligible cancer patients subject to current Ministry rules and the designated cancer-centre process.',
    benefit: 'Financial assistance subject to current HMCPF/RAN rules', officialUrl: 'https://www.mohfw.gov.in/', source: 'Ministry of Health & Family Welfare, Government of India', lastVerified: '25 Aug 2026',
    eligibility: { states: 'all', cancerRequired: true, bplRequired: true, treatmentRequired: true, treatmentCentreRequired: true, governmentEmployeeExcluded: true },
    documents: ['Identity proof', 'Cancer diagnosis and treatment records', 'Income or BPL documentation, where applicable', 'Documents required by the designated cancer centre'],
    applicationSteps: ['Confirm current HMCPF/RAN conditions with the treating centre', 'Approach the applicable government cancer treatment centre', 'Submit medical and financial documents', 'Complete verification through the government process'],
  },
  {
    id: 'haryana-cancer', name: 'Financial Assistance for Stage III & IV Cancer Patients', category: 'Haryana Government', scope: 'Haryana',
    description: "Haryana's scheme provides monthly financial assistance for eligible Stage III and Stage IV cancer patients who meet the residence, Family ID, and family-income conditions.",
    benefit: 'Monthly financial assistance for eligible Stage III/IV patients', officialUrl: 'https://sewa.haryana.gov.in/financial-assistance-for-stage-iii-iv-cancer-patients/', source: 'Government of Haryana', lastVerified: '25 Aug 2026',
    eligibility: { states: ['Haryana'], cancerRequired: true, stageRequired: ['3', '4'], incomeLimit: 300000, pppRequired: true },
    documents: ['Haryana residence or identity documentation', 'Cancer diagnosis and Stage III/IV documentation', 'Parivar Pehchan Patra / Family ID', 'Income-related documentation as required'],
    applicationSteps: ['Confirm Stage III/IV diagnosis and Haryana residence', 'Prepare Family ID and medical documents', 'Use the applicable Haryana government application process', 'Complete verification by the concerned authority'],
  },
  {
    id: 'delhi-arogya-kosh', name: 'Delhi Arogya Kosh', category: 'Delhi Government', scope: 'Delhi',
    description: 'Delhi Arogya Kosh provides assistance through eligible government hospitals and applicable government processes. Requirements should be confirmed with the treating hospital.',
    benefit: 'Financial assistance subject to current Delhi government rules', officialUrl: 'https://dgehs.delhi.gov.in/dghs/delhi-arogya-kosh', source: 'Government of NCT of Delhi', lastVerified: '25 Aug 2026',
    eligibility: { states: ['Delhi'], cancerRelevant: true, governmentHospitalRequired: true },
    documents: ['Identity and residence proof', 'Medical diagnosis and treatment records', 'Income and eligibility documents requested by the hospital'],
    applicationSteps: ['Confirm eligibility with an eligible government hospital', 'Prepare medical and identity documents', 'Submit the request through the hospital process', 'Complete government verification'],
  },
];

const incomeMap: Record<string, number> = { below1: 50000, '1to3': 200000, '3to5': 400000, '5to10': 750000, above10: 1200000 };

export function calculateGovernmentSchemeResults(patient: PatientProfile): { matches: SchemeResult[]; needsVerification: SchemeResult[]; notMatches: SchemeResult[] } {
  const matches: SchemeResult[] = [];
  const needsVerification: SchemeResult[] = [];
  const notMatches: SchemeResult[] = [];

  governmentSchemes.forEach((scheme) => {
    const eligibility = scheme.eligibility;
    let score = 0;
    let maxScore = 0;
    const matchedReasons: string[] = [];
    const failedRequirements: string[] = [];
    const verificationReasons: string[] = [];

    if (eligibility.states === 'all') { score += 10; maxScore += 10; }
    else { maxScore += 30; if (eligibility.states.includes(patient.state)) { score += 30; matchedReasons.push(`${patient.state} residence matches`); } else failedRequirements.push(`This scheme is for residents of ${eligibility.states.join(', ')}`); }
    if (eligibility.cancerRequired) { maxScore += 30; if (patient.cancer === 'yes') { score += 30; matchedReasons.push('Cancer diagnosis matches'); } else if (patient.cancer === 'no') failedRequirements.push('Cancer diagnosis is required'); else verificationReasons.push('Cancer diagnosis needs confirmation'); }
    else if (eligibility.cancerRelevant && patient.cancer === 'yes') { score += 10; maxScore += 10; matchedReasons.push('Cancer treatment is relevant to this scheme'); }
    if (eligibility.stageRequired) { maxScore += 25; if (eligibility.stageRequired.includes(patient.stage)) { score += 25; matchedReasons.push(`Stage ${patient.stage} matches the stated requirement`); } else if (patient.stage) failedRequirements.push('The stated cancer stage does not match the scheme requirement'); else verificationReasons.push('Cancer stage needs confirmation'); }
    if (eligibility.incomeLimit) { maxScore += 20; const income = incomeMap[patient.income]; if (income !== undefined && income <= eligibility.incomeLimit) { score += 20; matchedReasons.push('Reported family income is within the stated limit'); } else if (income !== undefined) failedRequirements.push('Reported family income is above the stated limit'); else verificationReasons.push('Family income needs verification'); }
    if (eligibility.bplRequired) { maxScore += 20; if (patient.bpl === 'yes') { score += 20; matchedReasons.push('BPL or eligible low-income status indicated'); } else if (patient.bpl === 'no') failedRequirements.push('BPL or eligible low-income status is required'); else verificationReasons.push('BPL or low-income status needs verification'); }
    if (eligibility.pmjayConfirmationRequired) { maxScore += 20; if (patient.pmjayEligible === 'yes') { score += 20; matchedReasons.push('Existing PM-JAY eligibility indicated'); } else verificationReasons.push('PM-JAY beneficiary status should be verified on the official NHA portal'); }
    if (eligibility.pppRequired) { maxScore += 15; if (patient.ppp === 'yes') { score += 15; matchedReasons.push('Family ID / PPP available'); } else if (patient.ppp === 'no') failedRequirements.push('Family ID / PPP is required'); else verificationReasons.push('Family ID / PPP needs verification'); }
    if (eligibility.treatmentRequired) { maxScore += 10; if (patient.treatment === 'yes') { score += 10; matchedReasons.push('Current treatment status matches'); } else verificationReasons.push('Current treatment status needs verification'); }
    if (eligibility.treatmentCentreRequired || eligibility.governmentHospitalRequired) { maxScore += 15; if (patient.treatmentCentre === 'yes') { score += 15; matchedReasons.push('Eligible government or designated treatment centre indicated'); } else if (patient.treatmentCentre === 'no' && eligibility.treatmentCentreRequired) failedRequirements.push('Treatment at an eligible or designated centre is required'); else verificationReasons.push('Treatment-centre eligibility needs verification'); }
    if (eligibility.governmentEmployeeExcluded) { maxScore += 10; if (patient.governmentEmployee === 'no') { score += 10; matchedReasons.push('Government or PSU employee exclusion does not apply'); } else if (patient.governmentEmployee === 'yes') failedRequirements.push('Government or PSU employees may be excluded under applicable rules'); else verificationReasons.push('Employment status needs verification'); }

    const result: SchemeResult = { ...scheme, matchScore: maxScore ? Math.round((score / maxScore) * 100) : 0, matchLevel: 'Needs Verification', matchedReasons, failedRequirements, verificationReasons };
    if (failedRequirements.length) notMatches.push(result);
    else if (verificationReasons.length) needsVerification.push(result);
    else { result.matchLevel = 'Potential Match'; matches.push(result); }
  });
  matches.sort((a, b) => b.matchScore - a.matchScore); needsVerification.sort((a, b) => b.matchScore - a.matchScore); notMatches.sort((a, b) => b.matchScore - a.matchScore);
  return { matches, needsVerification, notMatches };
}

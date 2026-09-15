export interface Doctor {
  id: number;
  name: string;
  specialty: string;
  hospital: string;
  location: string;
  experience: string;
  consultationFee: number;
  image: string | null;
  expertise: string[];
  languages: string[];
  verified: boolean;
}

export const doctors: Doctor[] = [
  {
    id: 1,
    name: "Dr. Vinod Raina",
    specialty: "Medical Oncology",
    hospital: "Fortis Memorial Research Institute",
    location: "Gurugram",
    experience: "40+ Years",
    consultationFee: 499,
    image: null,
    expertise: [
      "Breast Cancer",
      "Lung Cancer",
      "GI Cancer",
      "Lymphoma"
    ],
    languages: ["English", "Hindi"],
    verified: true
  },
  {
    id: 2,
    name: "Dr. Nitesh Rohatgi",
    specialty: "Medical Oncology",
    hospital: "Fortis Memorial Research Institute",
    location: "Gurugram",
    experience: "Senior Consultant",
    consultationFee: 399,
    image: null,
    expertise: [
      "Breast Cancer",
      "Solid Tumors",
      "Medical Oncology"
    ],
    languages: ["English", "Hindi"],
    verified: true
  },
  {
    id: 3,
    name: "Dr. Ankur Bahl",
    specialty: "Medical Oncology",
    hospital: "Fortis Memorial Research Institute",
    location: "Gurugram",
    experience: "Senior Specialist",
    consultationFee: 399,
    image: null,
    expertise: [
      "Medical Oncology",
      "Solid Tumors",
      "Cancer Care"
    ],
    languages: ["English", "Hindi"],
    verified: true
  },
  {
    id: 4,
    name: "Dr. Atul Sharma",
    specialty: "Medical Oncology",
    hospital: "Max Super Speciality Hospital, Saket",
    location: "Delhi",
    experience: "35+ Years",
    consultationFee: 499,
    image: null,
    expertise: [
      "Medical Oncology",
      "Chemotherapy",
      "Cancer Care"
    ],
    languages: ["English", "Hindi"],
    verified: true
  },
  {
    id: 5,
    name: "Dr. Meenu Walia",
    specialty: "Medical Oncology",
    hospital: "Max Super Speciality Hospital",
    location: "Delhi NCR",
    experience: "36+ Years",
    consultationFee: 499,
    image: null,
    expertise: [
      "Breast Cancer",
      "Gynaecological Cancer",
      "GI Cancer"
    ],
    languages: ["English", "Hindi"],
    verified: true
  },
  {
    id: 6,
    name: "Dr. Devavrat Arya",
    specialty: "Medical Oncology",
    hospital: "Max Super Speciality Hospital, Saket",
    location: "Delhi",
    experience: "21+ Years",
    consultationFee: 399,
    image: null,
    expertise: [
      "Breast Cancer",
      "Thoracic Oncology",
      "GI Cancer"
    ],
    languages: ["English", "Hindi"],
    verified: true
  },
  {
    id: 7,
    name: "Dr. Harit Kumar Chaturvedi",
    specialty: "Surgical Oncology",
    hospital: "Indraprastha Apollo Hospitals",
    location: "New Delhi",
    experience: "38+ Years",
    consultationFee: 499,
    image: null,
    expertise: [
      "Breast Cancer Surgery",
      "Head & Neck Oncology",
      "GI Oncology"
    ],
    languages: ["English", "Hindi"],
    verified: true
  },
  {
    id: 8,
    name: "Dr. Harsh Dua",
    specialty: "Medical Oncology",
    hospital: "Apollo Cancer Centre",
    location: "New Delhi",
    experience: "Senior Consultant",
    consultationFee: 399,
    image: null,
    expertise: [
      "Medical Oncology",
      "Haematology",
      "Cancer Care"
    ],
    languages: ["English", "Hindi"],
    verified: true
  },
  {
    id: 9,
    name: "Dr. Dipanjan Panda",
    specialty: "Medical Oncology",
    hospital: "Apollo Cancer Centre",
    location: "New Delhi",
    experience: "Senior Consultant",
    consultationFee: 399,
    image: null,
    expertise: [
      "Medical Oncology",
      "Solid Tumors",
      "Cancer Therapy"
    ],
    languages: ["English", "Hindi"],
    verified: true
  },
  {
    id: 10,
    name: "Dr. Ashok Kumar Vaid",
    specialty: "Hemato-Oncology",
    hospital: "Medanta - The Medicity",
    location: "Gurugram",
    experience: "Senior Chairman",
    consultationFee: 499,
    image: null,
    expertise: [
      "Leukemia",
      "Lymphoma",
      "Solid Tumors"
    ],
    languages: ["English", "Hindi"],
    verified: true
  },
  {
    id: 11,
    name: "Dr. Rajeev Agarwal",
    specialty: "Surgical Oncology",
    hospital: "Medanta - The Medicity",
    location: "Gurugram",
    experience: "Senior Director",
    consultationFee: 499,
    image: null,
    expertise: [
      "Breast Cancer",
      "Surgical Oncology",
      "Breast Reconstruction"
    ],
    languages: ["English", "Hindi"],
    verified: true
  },
  {
    id: 12,
    name: "Dr. Rahul Bhargava",
    specialty: "Hemato-Oncology",
    hospital: "Fortis Memorial Research Institute",
    location: "Gurugram",
    experience: "16+ Years",
    consultationFee: 399,
    image: null,
    expertise: [
      "Leukemia",
      "Lymphoma",
      "Bone Marrow Transplant"
    ],
    languages: ["English", "Hindi"],
    verified: true
  }
];

export const doctorAvailability: Record<number, Record<string, string[]>> = {
  1: {
    "2026-08-25": ["10:00 AM", "11:30 AM", "2:00 PM", "4:00 PM"],
    "2026-08-26": ["10:00 AM", "2:00 PM", "6:00 PM"]
  },
  2: {
    "2026-08-25": ["9:30 AM", "12:00 PM", "5:00 PM"],
    "2026-08-27": ["10:30 AM", "1:30 PM", "4:30 PM"]
  },
  3: {
    "2026-08-26": ["11:00 AM", "1:00 PM", "3:30 PM", "6:00 PM"],
    "2026-08-28": ["10:00 AM", "12:30 PM", "5:30 PM"]
  },
  4: {
    "2026-08-25": ["10:30 AM", "12:30 PM", "3:00 PM"],
    "2026-08-29": ["11:00 AM", "2:00 PM", "4:00 PM"]
  },
  5: {
    "2026-08-26": ["9:00 AM", "11:00 AM", "2:30 PM", "5:00 PM"],
    "2026-08-30": ["10:00 AM", "1:00 PM", "4:30 PM"]
  },
  6: {
    "2026-08-27": ["10:00 AM", "12:00 PM", "3:00 PM"],
    "2026-08-31": ["11:00 AM", "2:00 PM", "5:00 PM"]
  },
  7: {
    "2026-08-25": ["9:30 AM", "11:30 AM", "2:30 PM"],
    "2026-08-28": ["10:30 AM", "1:30 PM", "4:30 PM"]
  },
  8: {
    "2026-08-26": ["10:00 AM", "12:00 PM", "4:00 PM", "6:00 PM"],
    "2026-08-29": ["9:30 AM", "1:00 PM", "3:30 PM"]
  },
  9: {
    "2026-08-27": ["10:30 AM", "12:30 PM", "3:30 PM"],
    "2026-08-30": ["11:00 AM", "2:00 PM", "5:30 PM"]
  },
  10: {
    "2026-08-25": ["10:00 AM", "1:00 PM", "4:00 PM"],
    "2026-08-31": ["9:30 AM", "12:00 PM", "3:00 PM"]
  },
  11: {
    "2026-08-26": ["11:00 AM", "2:00 PM", "5:00 PM"],
    "2026-08-29": ["10:00 AM", "12:30 PM", "4:30 PM"]
  },
  12: {
    "2026-08-27": ["9:30 AM", "11:30 AM", "3:00 PM", "6:00 PM"],
    "2026-08-30": ["10:30 AM", "1:30 PM", "5:00 PM"]
  }
};

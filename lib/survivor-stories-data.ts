export interface SurvivorStory {
  id: string;
  name: string;
  nameNote?: string;
  title: string;
  cancerType: string;
  category: string;
  region: string;
  format: string;
  location: string;
  treatmentInstitution: string;
  institutionType: string;
  sourceName: string;
  sourceLabel: string;
  sourceUrl: string;
  videoId?: string;
  videoWatchUrl?: string;
  verified: boolean;
  tags: string[];
  summary: string;
  supportFocus: string;
  quote?: string;
  initials: string;
  avatarClass: string;
  featured?: boolean;
}

export const survivorStories: SurvivorStory[] = [
  /*
   * ============================================================
   * INDIAN SURVIVOR STORIES
   * Government / public cancer hospitals
   * ============================================================
   */

  {
    id: "india-001",
    name: "Sathya",
    nameNote: "Name changed in the original report",

    title: "From leukemia treatment to trekking again",

    cancerType: "Leukemia",
    category: "Blood Cancer",

    region: "Indian Stories",

    format: "Written Story",

    location: "Chittoor, Andhra Pradesh",

    treatmentInstitution:
      "Kidwai Memorial Institute of Oncology, Bengaluru",

    institutionType: "Government cancer hospital",

    sourceName: "The Times of India",
    sourceLabel: "Times of India",

    sourceUrl:
      "https://timesofindia.indiatimes.com/city/bengaluru/bone-marrow-transplants-at-kidwai-memorial-institute-of-oncology/articleshow/112330032.cms",

    verified: true,

    tags: [
      "Blood Cancer",
      "Young Adult",
      "Recovery",
      "Life After Treatment",
      "Indian Survivor",
    ],

    summary:
      "Sathya was diagnosed with blood cancer at 16. After chemotherapy failed to improve his condition, he travelled to Bengaluru and underwent a bone-marrow transplant at Kidwai Memorial Institute of Oncology in February 2023. The published account describes him later returning to trekking and continuing his education.",

    supportFocus:
      "Returning to everyday life after intensive treatment, rebuilding energy, education and confidence.",

    quote:
      "I go trekking with my friends. It feels good to have so much energy.",

    initials: "S",
    avatarClass: "avatar-teal",

    featured: false,
  },

  {
    id: "india-002",

    name: "Shekhar Jha",

    title: "Growing up after childhood cancer",

    cancerType: "Hodgkin's Disease",
    category: "Blood Cancer",

    region: "Indian Stories",

    format: "Written Story",

    location: "Bihar, India",

    treatmentInstitution:
      "Tata Memorial Hospital, Mumbai",

    institutionType:
      "Tata Memorial Centre",

    sourceName:
      "Indian Cancer Society — UGAM",

    sourceLabel:
      "Indian Cancer Society",

    sourceUrl:
      "https://www.indiancancersociety.org/what-do-we-do/pdf/ugam-4th-anniversary.pdf",

    verified: true,

    tags: [
      "Childhood Cancer",
      "Education",
      "Young Adult",
      "Indian Survivor",
      "Life After Treatment",
    ],

    summary:
      "Shekhar Jha describes being diagnosed with Hodgkin's disease in childhood and receiving treatment at Tata Memorial Hospital. His survivor account describes continuing his studies, completing postgraduate education and later becoming involved with UGAM, a childhood cancer survivor support group.",

    supportFocus:
      "Education, childhood survivorship, returning to work and building a life after treatment.",

    quote:
      "I have completed my Post graduation in commerce from L N M University Darbhanga, Bihar in 2012.",

    initials: "SJ",
    avatarClass: "avatar-blue",

    featured: false,
  },

  {
    id: "india-003",

    name: "Vanchinathan",

    title: "Life's turning point after testicular cancer",

    cancerType: "Testicular Cancer",
    category: "Other",

    region: "Indian Stories",

    format: "Written Story",

    location: "Mumbai, India",

    treatmentInstitution:
      "Tata Memorial Hospital and Sion Hospital, Mumbai",

    institutionType:
      "Public cancer care institutions",

    sourceName:
      "Indian Cancer Society — UGAM",

    sourceLabel:
      "Indian Cancer Society",

    sourceUrl:
      "https://www.indiancancersociety.org/what-do-we-do/pdf/ugam-4th-anniversary.pdf",

    verified: true,

    tags: [
      "Testicular Cancer",
      "Family",
      "Recovery",
      "Indian Survivor",
      "Life After Treatment",
    ],

    summary:
      "Vanchinathan's survivor account describes his diagnosis with a testicular tumour in 1992 and treatment at Tata Memorial Hospital and Sion Hospital. He writes about the shock of diagnosis, support from family and friends, completing treatment and rebuilding his personal and working life.",

    supportFocus:
      "Family support, emotional recovery, returning to work and rebuilding life after treatment.",

    quote:
      "With the help of my family, doctors, social service group and friends I could become victorious against cancer.",

    initials: "V",
    avatarClass: "avatar-purple",

    featured: false,
  },

  {
    id: "india-004",

    name: "Gurmeet Kaur Bhattal",

    title: "Strength through cancer survivorship",

    cancerType: "Cancer Survivor",
    category: "Other",

    region: "Indian Stories",

    format: "Written Story",

    location: "Sangrur, Punjab",

    treatmentInstitution:
      "Homi Bhabha Cancer Hospital, Sangrur",

    institutionType:
      "Tata Memorial Centre",

    sourceName:
      "Reach to Recovery International",

    sourceLabel:
      "Bloom Magazine",

    sourceUrl:
      "https://reachtorecoveryinternational.org/wp-content/uploads/2019/12/Bloom-Magazine_Dec-2019_FINAL.pdf",

    verified: true,

    tags: [
      "Indian Survivor",
      "Emotional Support",
      "Family",
      "Resilience",
      "Life After Treatment",
    ],

    summary:
      "This published survivor account describes Gurmeet Kaur Bhattal's experience after a cancer diagnosis and the important role of her husband and family in helping her through the emotional impact.",

    supportFocus:
      "Emotional resilience, family support and coping with the shock of diagnosis.",

    quote:
      "Her better half supported her completely through this.",

    initials: "GK",
    avatarClass: "avatar-orange",

    featured: false,
  },

  {
    id: "india-005",

    name: "Shiv Prafulla More",

    title: "Growing beyond childhood cancer",

    cancerType: "Neuroblastoma",
    category: "Childhood Cancer",

    region: "Indian Stories",

    format: "Written Story",

    location: "Nashik / Mumbai, India",

    treatmentInstitution:
      "Tata Memorial Hospital, Mumbai",

    institutionType:
      "Tata Memorial Centre",

    sourceName:
      "Indian Cancer Society — UGAM",

    sourceLabel:
      "Indian Cancer Society",

    sourceUrl:
      "https://www.indiancancersociety.org/what-do-we-do/pdf/ugam-16th-anniversary.pdf",

    verified: true,

    tags: [
      "Childhood Cancer",
      "Neuroblastoma",
      "Indian Survivor",
      "Family",
      "Young Survivor",
    ],

    summary:
      "Shiv Prafulla More's published UGAM survivor story describes being diagnosed with neuroblastoma at one year and eight months of age. His family travelled from Nashik to Tata Memorial Hospital in Mumbai, where he underwent chemotherapy, surgery and radiation.",

    supportFocus:
      "Childhood cancer, family resilience, financial challenges and growing up after treatment.",

    quote:
      "For my family, it felt like the ground had crumbled beneath them.",

    initials: "SM",
    avatarClass: "avatar-coral",

    featured: false,
  },

  /*
   * ============================================================
   * VERIFIED SURVIVOR VIDEO STORIES
   * American Cancer Society official survivor videos
   * ============================================================
   */

  {
    id: "video-001",

    name: "Terry Craft",

    title: "Terry's Story",

    cancerType: "Colon Cancer",
    category: "Colorectal Cancer",

    region: "International Stories",

    format: "Video Story",

    location: "United States",

    treatmentInstitution:
      "Not specified in source",

    institutionType:
      "Clinical care",

    sourceName:
      "American Cancer Society",

    sourceLabel:
      "American Cancer Society",

    sourceUrl:
      "https://www.cancer.org/about-us/what-we-do/cancer-stories/terry.html",

    videoId: "pmsPW2998DU",

    videoWatchUrl:
      "https://www.youtube.com/watch?v=pmsPW2998DU",

    verified: true,

    tags: [
      "Colorectal Cancer",
      "Recovery",
      "Emotional Support",
      "Survivorship",
    ],

    summary:
      "Terry Craft shares his experience with colon cancer and how cancer research supported by the American Cancer Society became part of his treatment journey.",

    supportFocus:
      "Facing a cancer diagnosis, treatment, research and finding perspective after treatment.",

    quote:
      "A survivor story can remind you that you are more than your diagnosis.",

    initials: "TC",
    avatarClass: "avatar-green",

    featured: true,
  },

  {
    id: "video-002",

    name: "Lastashia",

    title: "Finding strength through breast cancer",

    cancerType: "Breast Cancer",
    category: "Breast Cancer",

    region: "International Stories",

    format: "Video Story",

    location: "United States",

    treatmentInstitution:
      "Not specified in source",

    institutionType:
      "Clinical care",

    sourceName:
      "American Cancer Society",

    sourceLabel:
      "American Cancer Society",

    sourceUrl:
      "https://www.cancer.org/",

    videoId: "XAfgYL_JhoM",

    videoWatchUrl:
      "https://www.youtube.com/watch?v=XAfgYL_JhoM",

    verified: true,

    tags: [
      "Breast Cancer",
      "Emotional Support",
      "Resilience",
      "Survivorship",
    ],

    summary:
      "Lastashia's survivor video is part of the American Cancer Society's Survivor Journeys collection, sharing a personal experience of living through breast cancer.",

    supportFocus:
      "Emotional resilience, identity and finding strength during survivorship.",

    initials: "L",
    avatarClass: "avatar-pink",

    featured: false,
  },

  {
    id: "video-003",

    name: "Cheryl",

    title: "Living beyond breast cancer",

    cancerType: "Breast Cancer",
    category: "Breast Cancer",

    region: "International Stories",

    format: "Video Story",

    location: "United States",

    treatmentInstitution:
      "Not specified in source",

    institutionType:
      "Clinical care",

    sourceName:
      "American Cancer Society",

    sourceLabel:
      "American Cancer Society",

    sourceUrl:
      "https://www.cancer.org/",

    videoId: "j7JZCb5VSLc",

    videoWatchUrl:
      "https://www.youtube.com/watch?v=j7JZCb5VSLc",

    verified: true,

    tags: [
      "Breast Cancer",
      "Recovery",
      "Emotional Support",
      "Life After Treatment",
    ],

    summary:
      "Cheryl's survivor video is part of the American Cancer Society's Survivor Journeys collection and focuses on personal experience after breast cancer.",

    supportFocus:
      "Recovery, emotional adjustment and finding a way forward after treatment.",

    initials: "C",
    avatarClass: "avatar-blue",

    featured: false,
  },

  {
    id: "video-004",

    name: "Rick",

    title: "Surviving colon and kidney cancer",

    cancerType: "Colorectal Cancer",
    category: "Colorectal Cancer",

    region: "International Stories",

    format: "Video Story",

    location: "United States",

    treatmentInstitution:
      "Not specified in source",

    institutionType:
      "Clinical care",

    sourceName:
      "American Cancer Society",

    sourceLabel:
      "American Cancer Society",

    sourceUrl:
      "https://www.cancer.org/",

    videoId: "eelvXptMj5Q",

    videoWatchUrl:
      "https://www.youtube.com/watch?v=eelvXptMj5Q",

    verified: true,

    tags: [
      "Colorectal Cancer",
      "Kidney Cancer",
      "Resilience",
      "Survivorship",
    ],

    summary:
      "Rick's video is part of the American Cancer Society's Survivor Journeys collection and shares his experience living through colon and kidney cancer.",

    supportFocus:
      "Managing major diagnoses, resilience and continuing life beyond cancer treatment.",

    initials: "R",
    avatarClass: "avatar-indigo",

    featured: false,
  },

  {
    id: "video-005",

    name: "Victoria",

    title: "Finding hope after ovarian cancer",

    cancerType: "Ovarian Cancer",
    category: "Other",

    region: "International Stories",

    format: "Video Story",

    location: "United States",

    treatmentInstitution:
      "Not specified in source",

    institutionType:
      "Clinical care",

    sourceName:
      "American Cancer Society",

    sourceLabel:
      "American Cancer Society",

    sourceUrl:
      "https://www.cancer.org/",

    videoId: "Z7znidwSKdQ",

    videoWatchUrl:
      "https://www.youtube.com/watch?v=Z7znidwSKdQ",

    verified: true,

    tags: [
      "Ovarian Cancer",
      "Family",
      "Emotional Support",
      "Survivorship",
    ],

    summary:
      "Victoria's survivor video is part of the American Cancer Society's Survivor Journeys collection and shares her experience with ovarian cancer.",

    supportFocus:
      "Family, emotional strength and maintaining hope during survivorship.",

    initials: "V",
    avatarClass: "avatar-coral",

    featured: false,
  },
];

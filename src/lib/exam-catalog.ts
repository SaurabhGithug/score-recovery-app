export interface BranchDefinition {
  id: string;
  code: string;
  name: string;
  shortName: string;
}

export interface ExamDefinition {
  id: string;
  name: string;
  shortCode: string;
  category: "SSC" | "Railways" | "Banking" | "GATE" | "Engineering Services" | "Academic" | "Other";
  supportsBranches: boolean;
  availableBranches?: BranchDefinition[];
  subjects: string[];
  markingScheme?: {
    correct: number;
    negative: number;
  };
  description?: string;
}

export const ENGINEERING_BRANCHES: BranchDefinition[] = [
  { id: "civil", code: "CE", name: "Civil Engineering", shortName: "Civil" },
  { id: "mechanical", code: "ME", name: "Mechanical Engineering", shortName: "Mechanical" },
  { id: "electrical", code: "EE", name: "Electrical Engineering", shortName: "Electrical" },
  { id: "ece", code: "EC", name: "Electronics & Communication Engineering", shortName: "ECE" },
  { id: "cse", code: "CS", name: "Computer Science & Engineering", shortName: "CSE" },
  { id: "chemical", code: "CH", name: "Chemical Engineering", shortName: "Chemical" },
];

export const EXAM_CATALOG: ExamDefinition[] = [
  {
    id: "ssc-cgl",
    name: "SSC Combined Graduate Level (CGL)",
    shortCode: "SSC CGL",
    category: "SSC",
    supportsBranches: false,
    subjects: ["Quantitative Aptitude", "General Intelligence & Reasoning", "English Comprehension", "General Awareness"],
    markingScheme: { correct: 2, negative: 0.5 },
    description: "Graduate-level recruitment exam across ministries and central departments.",
  },
  {
    id: "ssc-chsl",
    name: "SSC Combined Higher Secondary Level (CHSL)",
    shortCode: "SSC CHSL",
    category: "SSC",
    supportsBranches: false,
    subjects: ["Quantitative Aptitude", "Reasoning", "English", "General Awareness"],
    markingScheme: { correct: 2, negative: 0.5 },
    description: "Higher secondary recruitment for LDC, JSA, and DEO posts.",
  },
  {
    id: "ssc-je",
    name: "SSC Junior Engineer (JE)",
    shortCode: "SSC JE",
    category: "SSC",
    supportsBranches: true,
    availableBranches: [
      ENGINEERING_BRANCHES[0], // Civil
      ENGINEERING_BRANCHES[1], // Mechanical
      ENGINEERING_BRANCHES[2], // Electrical
    ],
    subjects: ["General Intelligence & Reasoning", "General Awareness", "Core Technical Engineering"],
    markingScheme: { correct: 1, negative: 0.25 },
    description: "Recruitment of Junior Engineers in CPWD, MES, and Central Water Commission.",
  },
  {
    id: "rrb-je",
    name: "Railway Recruitment Board Junior Engineer (RRB JE)",
    shortCode: "RRB JE",
    category: "Railways",
    supportsBranches: true,
    availableBranches: [
      ENGINEERING_BRANCHES[0], // Civil
      ENGINEERING_BRANCHES[1], // Mechanical
      ENGINEERING_BRANCHES[2], // Electrical
      ENGINEERING_BRANCHES[3], // ECE
      ENGINEERING_BRANCHES[4], // CSE
    ],
    subjects: ["Mathematics", "General Intelligence", "General Science", "Technical Abilities"],
    markingScheme: { correct: 1, negative: 0.33 },
    description: "Technical recruitment for Indian Railways zonal divisions.",
  },
  {
    id: "gate",
    name: "Graduate Aptitude Test in Engineering (GATE)",
    shortCode: "GATE",
    category: "GATE",
    supportsBranches: true,
    availableBranches: ENGINEERING_BRANCHES,
    subjects: ["General Aptitude", "Engineering Mathematics", "Discipline Specific Core"],
    markingScheme: { correct: 2, negative: 0.66 },
    description: "National benchmark examination for M.Tech admissions and PSU recruitments.",
  },
  {
    id: "engineering-academic",
    name: "College Engineering Semester / Degree",
    shortCode: "College B.Tech/Diploma",
    category: "Academic",
    supportsBranches: true,
    availableBranches: ENGINEERING_BRANCHES,
    subjects: ["Core Theory", "Numerical & Design", "Lab Practices"],
    description: "University semester study material, notes, and curriculum practice.",
  },
];

export const EXAM_CATEGORIES = [
  "SSC",
  "Railways",
  "GATE",
  "Banking",
  "Civil Services",
  "Engineering Services",
  "Academic",
] as const;

export function getExamById(id: string): ExamDefinition | undefined {
  return EXAM_CATALOG.find((e) => e.id === id);
}

export function getExamsByCategory(category: string): ExamDefinition[] {
  return EXAM_CATALOG.filter((e) => e.category === category);
}

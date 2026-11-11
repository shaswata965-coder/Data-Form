/**
 * Single source of truth for the data collection form.
 *
 * Wording and options follow the "data collection form" Google Doc
 * (Annexure II – clinical oral examination, Annexure IV – Oral Health
 * Practice Questionnaire). Values stored in the database are the option
 * numbers printed in the questionnaire (1, 2, 3 …) and the scores printed
 * in the clinical tables (0, 1, 2 …), so exported data matches the paper form.
 *
 * Used by the form UI, the server-side validation and the admin export.
 */

export const SCHEMA_VERSION = 1;

export type Bilingual = { en: string; bn?: string };

export interface ChoiceOption {
  /** Stored value: option number (questionnaire) or score (clinical exam). */
  value: number;
  en: string;
  bn?: string;
  /** Row letter used in the Annexure II tables (a, b, c …). */
  letter?: string;
  /** Multi-select only: choosing this option clears all others (e.g. "No"). */
  exclusive?: boolean;
}

export interface Answers {
  consent?: boolean;
  participantId?: string;
  age?: number;
  gender?: number;
  maritalStatus?: number;
  education?: number;
  occupation?: number;
  yearsInArea?: number;
  familyIncome?: number;
  houseType?: number;
  houseTypeOther?: string;
  brushTeeth?: number;
  brushTimes?: number[];
  cleaningMethod?: number;
  adverseHabits?: number[];
  dentistVisit?: number;
  awareDentalDiseases?: number;
  awarenessSource?: number;
  awarenessSourceOther?: string;
  dmftDecayed?: number;
  dmftMissing?: number;
  dmftFilled?: number;
  dmftNone?: boolean;
  cpi?: number;
  plaque?: number;
  functional?: number;
  otherCondition?: number;
  saliva?: number;
}

export type AnswerKey = keyof Answers;

interface BaseQuestion {
  id: string;
  /** Number printed on the paper form. */
  num?: string;
  en: string;
  bn?: string;
  /** Extra instruction printed under the question, e.g. "(Multiple answer)". */
  note?: Bilingual;
  /** Shown above the options (e.g. the Functional Status prompt). */
  prompt?: string;
  /** Question is only asked when this returns true. */
  showIf?: (a: Answers) => boolean;
}

export interface SingleQuestion extends BaseQuestion {
  kind: "single";
  field: AnswerKey;
  options: ChoiceOption[];
  /** Annexure II tables: show the score next to every option. */
  scored?: boolean;
  /** Lay out short options (e.g. Yes / No) side by side. */
  inline?: boolean;
  /** Optional free-text box shown when the "Others" option is selected. */
  other?: { value: number; field: AnswerKey };
}

export interface MultiQuestion extends BaseQuestion {
  kind: "multi";
  field: AnswerKey;
  options: ChoiceOption[];
}

export interface NumberQuestion extends BaseQuestion {
  kind: "number";
  field: AnswerKey;
  min: number;
  max: number;
  unit?: Bilingual;
  placeholder?: string;
  /** Show thousands separators while typing (income). */
  money?: boolean;
}

export interface TextQuestion extends BaseQuestion {
  kind: "text";
  field: AnswerKey;
  maxLength: number;
  placeholder?: string;
}

export interface DmftQuestion extends BaseQuestion {
  kind: "dmft";
}

export type Question =
  | SingleQuestion
  | MultiQuestion
  | NumberQuestion
  | TextQuestion
  | DmftQuestion;

export const MAX_TEETH = 32;
export const OTHER_TEXT_MAX = 200;

const YES_NO: ChoiceOption[] = [
  { value: 1, en: "Yes", bn: "হ্যাঁ" },
  { value: 2, en: "No", bn: "না" },
];

/* ------------------------------------------------------------------ */
/* Annexure IV – Oral Health Practice Questionnaire                     */
/* ------------------------------------------------------------------ */

export const consentQuestion: SingleQuestion = {
  id: "consent",
  kind: "single",
  field: "consent",
  en: "Consent Taken",
  inline: true,
  // Stored as a boolean; values here are only used by the UI.
  options: [
    { value: 1, en: "Yes", bn: "হ্যাঁ" },
    { value: 0, en: "No", bn: "না" },
  ],
};

export const questionnaire: Question[] = [
  {
    id: "participantId",
    kind: "text",
    field: "participantId",
    num: "1",
    en: "Participant ID",
    bn: "অংশগ্রহণকারীর আইডি",
    maxLength: 40,
    placeholder: "e.g. P-001",
  },
  {
    id: "age",
    kind: "number",
    field: "age",
    num: "2",
    en: "Age",
    bn: "বয়স",
    min: 1,
    max: 120,
    unit: { en: "Years", bn: "বছর" },
  },
  {
    id: "gender",
    kind: "single",
    field: "gender",
    num: "3",
    en: "Gender",
    bn: "লিঙ্গ",
    inline: true,
    options: [
      { value: 1, en: "Male", bn: "পুরুষ" },
      { value: 2, en: "Female", bn: "মহিলা" },
    ],
  },
  {
    id: "maritalStatus",
    kind: "single",
    field: "maritalStatus",
    num: "4",
    en: "Marital Status",
    bn: "বৈবাহিক অবস্থা",
    options: [
      { value: 1, en: "Married", bn: "বিবাহিত" },
      { value: 2, en: "Unmarried", bn: "অবিবাহিত" },
      { value: 3, en: "Divorced/Separated", bn: "তালাকপ্রাপ্ত" },
      { value: 4, en: "Widowed", bn: "বিধবা" },
    ],
  },
  {
    id: "education",
    kind: "single",
    field: "education",
    num: "5",
    en: "Education Level",
    bn: "শিক্ষা স্তর",
    options: [
      { value: 1, en: "No formal education", bn: "কোন প্রাতিষ্ঠানিক শিক্ষা নেই" },
      { value: 2, en: "Below Primary", bn: "প্রাথমিকের নিচে" },
      { value: 3, en: "Primary", bn: "প্রাথমিক" },
      { value: 4, en: "Secondary", bn: "মাধ্যমিক" },
      { value: 5, en: "Higher Secondary or above", bn: "উচ্চমাধ্যমিক বা তদূর্ধ্ব" },
    ],
  },
  {
    id: "occupation",
    kind: "single",
    field: "occupation",
    num: "6",
    en: "Occupation",
    bn: "পেশা",
    options: [
      { value: 1, en: "Professional worker", bn: "পেশাদার কর্মী" },
      { value: 2, en: "Semi-Profession worker", bn: "আধা-পেশাদার" },
      { value: 3, en: "Skilled Worker", bn: "দক্ষ কর্মী" },
      { value: 4, en: "Unskilled Worker", bn: "অদক্ষ কর্মী" },
      { value: 5, en: "Unemployed or begging", bn: "বেকার বা ভিক্ষাবৃত্তি" },
    ],
  },
  {
    id: "yearsInArea",
    kind: "number",
    field: "yearsInArea",
    num: "7",
    en: "How many years have you lived in this area?",
    bn: "আপনি কত বছর ধরে এই এলাকায় বাস করছেন?",
    min: 0,
    max: 120,
    unit: { en: "Years", bn: "বছর" },
  },
  {
    id: "familyIncome",
    kind: "number",
    field: "familyIncome",
    num: "8",
    en: "Average Family Income",
    bn: "পারিবারিক মাসিক আয়",
    min: 0,
    max: 99_999_999,
    unit: { en: "Taka", bn: "টাকা" },
    money: true,
  },
  {
    id: "houseType",
    kind: "single",
    field: "houseType",
    num: "9",
    en: "What type of house do you currently live in?",
    bn: "আপনার পরিবারের থাকার ঘরটি কোন ধরনের?",
    note: { en: "Tick One", bn: "একটি উত্তর দিন" },
    options: [
      { value: 1, en: "Tin shade house", bn: "টিনের ঘর" },
      {
        value: 2,
        en: "Kucha house (Plastic/Mud/Bamboo)",
        bn: "কাঁচা ঘর (প্লাস্টিক/কাঁদা/বাঁশ)",
      },
      {
        value: 3,
        en: "Semi-pucca house (Partially brick/Tin/Wood-frame)",
        bn: "আধা-পাকা ঘর (ইট/টিন/কাঠের ফ্রেম)",
      },
      {
        value: 4,
        en: "Pucca house (Brick/Fully concrete)",
        bn: "পাকা ঘর (ইট/কংক্রিট পুরোটা)",
      },
      { value: 5, en: "Others", bn: "অন্যান্য" },
    ],
    other: { value: 5, field: "houseTypeOther" },
  },
  {
    id: "brushTeeth",
    kind: "single",
    field: "brushTeeth",
    num: "10",
    en: "Do you brush your teeth?",
    bn: "আপনি কি দাঁত ব্রাশ করেন?",
    inline: true,
    options: YES_NO,
  },
  {
    id: "brushTimes",
    kind: "multi",
    field: "brushTimes",
    num: "11",
    en: "At what time do you brush your teeth?",
    bn: "আপনি কখন দাঁত ব্রাশ করেন?",
    note: { en: "Multiple answer", bn: "একাধিক উত্তর দিতে পারবেন" },
    showIf: (a) => a.brushTeeth === 1,
    options: [
      { value: 1, en: "Morning time", bn: "সকালে" },
      { value: 2, en: "After breakfast", bn: "নাস্তা করার পরে" },
      { value: 3, en: "Before going to bed at night", bn: "রাতে ঘুমাতে যাওয়ার আগে" },
      { value: 4, en: "Any time", bn: "যেকোনো সময়" },
    ],
  },
  {
    id: "cleaningMethod",
    kind: "single",
    field: "cleaningMethod",
    num: "12",
    en: "What do you use for cleaning your teeth?",
    bn: "আপনি কী দিয়ে দাঁত পরিষ্কার করেন?",
    options: [
      { value: 1, en: "Toothbrush and toothpaste", bn: "টুথব্রাশ ও টুথপেস্ট" },
      { value: 2, en: "Finger and toothpaste", bn: "আঙুল ও টুথপেস্ট" },
      { value: 3, en: "Tooth powder", bn: "টুথ পাউডার" },
      { value: 4, en: "Charcoal/Ash/Miswak", bn: "কয়লা / ছাই / মিসওয়াক" },
    ],
  },
  {
    id: "adverseHabits",
    kind: "multi",
    field: "adverseHabits",
    num: "13",
    en: "Do you have any adverse habits?",
    bn: "আপনার কি কোনো ক্ষতিকর অভ্যাস আছে?",
    note: { en: "Multiple answer", bn: "একাধিক উত্তর দিতে পারবেন" },
    options: [
      { value: 1, en: "Smoked tobacco", bn: "ধূমপান যোগ্য তামাক" },
      { value: 2, en: "Smokeless tobacco", bn: "অ-ধূমপান যোগ্য তামাক" },
      { value: 3, en: "Pan, Betel-nut", bn: "পান, সুপারি" },
      { value: 4, en: "No", bn: "না", exclusive: true },
    ],
  },
  {
    id: "dentistVisit",
    kind: "single",
    field: "dentistVisit",
    num: "14",
    en: "When you go to the dentist?",
    bn: "আপনি দাঁতের চিকিৎসকের কাছে কখন যান?",
    options: [
      { value: 1, en: "Only in problem", bn: "শুধু সমস্যা হলে" },
      { value: 2, en: "Once in 3 months", bn: "প্রতি ৩ মাসে একবার" },
      { value: 3, en: "Once in 6 months", bn: "প্রতি ৬ মাসে একবার" },
      { value: 4, en: "Never", bn: "কখনোই না" },
    ],
  },
  {
    id: "awareDentalDiseases",
    kind: "single",
    field: "awareDentalDiseases",
    num: "15",
    en: "Are you aware of dental diseases?",
    bn: "আপনি কি দাঁতের রোগ সম্পর্কে সচেতন?",
    inline: true,
    options: YES_NO,
  },
  {
    id: "awarenessSource",
    kind: "single",
    field: "awarenessSource",
    num: "16",
    en: "If you are aware of dental diseases, through which source did you become aware?",
    bn: "যদি সচেতন হন দাঁতের রোগ সম্পর্কে, তবে কোন মাধ্যমে সচেতন হয়েছেন?",
    showIf: (a) => a.awareDentalDiseases === 1,
    options: [
      { value: 1, en: "Electronic media", bn: "ইলেকট্রনিক মিডিয়া" },
      { value: 2, en: "Social Media", bn: "সোশ্যাল মিডিয়া" },
      { value: 3, en: "In Person", bn: "সরাসরি (ব্যক্তিগতভাবে)" },
      { value: 4, en: "Poster", bn: "পোস্টার" },
      { value: 5, en: "Others", bn: "অন্যান্য" },
    ],
    other: { value: 5, field: "awarenessSourceOther" },
  },
];

/* ------------------------------------------------------------------ */
/* Annexure II – Clinical oral examination                             */
/* ------------------------------------------------------------------ */

export const DMFT_ROWS = [
  { letter: "a", field: "dmftDecayed", en: "Decayed present" },
  { letter: "b", field: "dmftMissing", en: "Missing teeth" },
  { letter: "c", field: "dmftFilled", en: "Filled teeth" },
] as const satisfies ReadonlyArray<{ letter: string; field: AnswerKey; en: string }>;

export const clinical: Question[] = [
  {
    id: "dmft",
    kind: "dmft",
    num: "1",
    en: "Caries Status (DMFT) Index",
    note: { en: "Score = Number of Teeth" },
  },
  {
    id: "cpi",
    kind: "single",
    field: "cpi",
    num: "2",
    en: "Periodontal Health (CPI)",
    scored: true,
    options: [
      { letter: "a", value: 0, en: "Healthy Periodontium" },
      { letter: "b", value: 1, en: "Gingivitis (Bleeding on probing)" },
      { letter: "c", value: 2, en: "Calculus present" },
      { letter: "d", value: 3, en: "Shallow (3–5 mm) pocket" },
      { letter: "e", value: 4, en: "Deep (>5 mm) pocket" },
    ],
  },
  {
    id: "plaque",
    kind: "single",
    field: "plaque",
    num: "3",
    en: "Oral Hygiene Status (Plaque Index)",
    scored: true,
    options: [
      { letter: "a", value: 0, en: "No plaque" },
      { letter: "b", value: 1, en: "Plaque visible on the tooth surface" },
      { letter: "c", value: 2, en: "Plaque covering less than 1/3 of the tooth" },
      { letter: "d", value: 3, en: "Plaque covering 1/3 to 2/3 of the tooth" },
      { letter: "e", value: 4, en: "Plaque covering more than 2/3 of the tooth" },
    ],
  },
  {
    id: "functional",
    kind: "single",
    field: "functional",
    num: "4",
    en: "Functional Status",
    prompt: "Can you chew food without pain or difficulty",
    scored: true,
    options: [
      { letter: "a", value: 1, en: "Difficulty in chewing" },
      { letter: "b", value: 0, en: "Functional chewing" },
    ],
  },
  {
    id: "otherCondition",
    kind: "single",
    field: "otherCondition",
    num: "5",
    en: "Others Oral Condition (oral mucosal diseases, oral lesion)",
    scored: true,
    options: [
      { letter: "a", value: 1, en: "Presence of condition" },
      { letter: "b", value: 0, en: "Absence of condition" },
    ],
  },
  {
    id: "saliva",
    kind: "single",
    field: "saliva",
    en: "Saliva",
    scored: true,
    options: [
      { value: 0, en: "Moist tissues, watery and free flowing saliva" },
      {
        value: 1,
        en: "Dry, sticky tissues, little saliva present, resident thinks they have a dry mouth",
      },
      {
        value: 2,
        en: "Tissues parched and red, little or no saliva present, saliva is thick, resident thinks they have a dry mouth",
      },
    ],
  },
];

/** Reference text printed under the Annexure II tables (not calculated). */
export const OHSI_REFERENCE = {
  formula: "OHSI Formula: 5 Areas = Total Score",
  interpretation: [
    "a) Score range (0–4) = Excellent oral health",
    "b) Score range (5–10) = Better oral health",
    "c) Score range (11 or above) = Bad oral health",
  ],
};

/* ------------------------------------------------------------------ */
/* Steps of the on-screen wizard                                        */
/* ------------------------------------------------------------------ */

export type StepId =
  | "consent"
  | "participant"
  | "household"
  | "hygiene"
  | "care"
  | "clinical1"
  | "clinical2"
  | "review";

export interface Step {
  id: StepId;
  title: Bilingual;
  part: string;
  questions: Question[];
}

const q = (id: string): Question => {
  const found = [...questionnaire, ...clinical].find((x) => x.id === id);
  if (!found) throw new Error(`Unknown question ${id}`);
  return found;
};

export const STEPS: Step[] = [
  {
    id: "consent",
    title: { en: "Consent", bn: "সম্মতি" },
    part: "Annexure IV",
    questions: [consentQuestion],
  },
  {
    id: "participant",
    title: { en: "Participant information", bn: "অংশগ্রহণকারীর তথ্য" },
    part: "Annexure IV · Questionnaire",
    questions: ["participantId", "age", "gender", "maritalStatus", "education", "occupation"].map(q),
  },
  {
    id: "household",
    title: { en: "Residence & income", bn: "বাসস্থান ও আয়" },
    part: "Annexure IV · Questionnaire",
    questions: ["yearsInArea", "familyIncome", "houseType"].map(q),
  },
  {
    id: "hygiene",
    title: { en: "Teeth cleaning habits", bn: "দাঁত পরিষ্কারের অভ্যাস" },
    part: "Annexure IV · Questionnaire",
    questions: ["brushTeeth", "brushTimes", "cleaningMethod", "adverseHabits"].map(q),
  },
  {
    id: "care",
    title: { en: "Dental visits & awareness", bn: "দাঁতের চিকিৎসা ও সচেতনতা" },
    part: "Annexure IV · Questionnaire",
    questions: ["dentistVisit", "awareDentalDiseases", "awarenessSource"].map(q),
  },
  {
    id: "clinical1",
    title: { en: "Clinical exam: Caries & periodontal health" },
    part: "Annexure II · Clinical examination",
    questions: ["dmft", "cpi"].map(q),
  },
  {
    id: "clinical2",
    title: { en: "Clinical exam: Hygiene, function & saliva" },
    part: "Annexure II · Clinical examination",
    questions: ["plaque", "functional", "otherCondition", "saliva"].map(q),
  },
  {
    id: "review",
    title: { en: "Review & submit", bn: "যাচাই করে জমা দিন" },
    part: "Final check",
    questions: [],
  },
];

export const ALL_QUESTIONS: Question[] = [...questionnaire, ...clinical];

export function isVisible(question: Question, a: Answers): boolean {
  return question.showIf ? question.showIf(a) : true;
}

export function optionLabel(options: ChoiceOption[], value: unknown): ChoiceOption | undefined {
  return options.find((o) => o.value === value);
}

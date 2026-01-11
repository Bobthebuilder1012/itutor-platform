export type SubjectLevel = 'CSEC' | 'CAPE';

export type SubjectDefinition = {
  level: SubjectLevel;
  name: string;
  label: string;
};

export const SUBJECTS: SubjectDefinition[] = [
  // CSEC
  { level: 'CSEC', name: 'Mathematics', label: 'CSEC Mathematics' },
  { level: 'CSEC', name: 'English A', label: 'CSEC English A' },
  { level: 'CSEC', name: 'English B', label: 'CSEC English B' },
  { level: 'CSEC', name: 'Additional Mathematics', label: 'CSEC Additional Mathematics' },
  { level: 'CSEC', name: 'Biology', label: 'CSEC Biology' },
  { level: 'CSEC', name: 'Chemistry', label: 'CSEC Chemistry' },
  { level: 'CSEC', name: 'Physics', label: 'CSEC Physics' },
  { level: 'CSEC', name: 'Integrated Science', label: 'CSEC Integrated Science' },
  { level: 'CSEC', name: 'Human and Social Biology', label: 'CSEC Human and Social Biology' },
  { level: 'CSEC', name: 'Agricultural Science (Single Award)', label: 'CSEC Agricultural Science (Single Award)' },
  { level: 'CSEC', name: 'Agricultural Science (Double Award)', label: 'CSEC Agricultural Science (Double Award)' },

  { level: 'CSEC', name: 'Information Technology', label: 'CSEC Information Technology' },
  { level: 'CSEC', name: 'Electronic Document Preparation and Management (EDPM)', label: 'CSEC Electronic Document Preparation and Management (EDPM)' },
  { level: 'CSEC', name: 'Industrial Technology - Building', label: 'CSEC Industrial Technology - Building' },
  { level: 'CSEC', name: 'Industrial Technology - Mechanical', label: 'CSEC Industrial Technology - Mechanical' },
  { level: 'CSEC', name: 'Industrial Technology - Electrical', label: 'CSEC Industrial Technology - Electrical' },

  { level: 'CSEC', name: 'Principles of Accounts (POA)', label: 'CSEC Principles of Accounts (POA)' },
  { level: 'CSEC', name: 'Principles of Business (POB)', label: 'CSEC Principles of Business (POB)' },
  { level: 'CSEC', name: 'Economics', label: 'CSEC Economics' },
  { level: 'CSEC', name: 'Office Administration', label: 'CSEC Office Administration' },

  { level: 'CSEC', name: 'Social Studies', label: 'CSEC Social Studies' },
  { level: 'CSEC', name: 'Geography', label: 'CSEC Geography' },
  { level: 'CSEC', name: 'Caribbean History', label: 'CSEC Caribbean History' },
  { level: 'CSEC', name: 'Religious Education', label: 'CSEC Religious Education' },

  { level: 'CSEC', name: 'Music', label: 'CSEC Music' },
  { level: 'CSEC', name: 'Visual Arts', label: 'CSEC Visual Arts' },
  { level: 'CSEC', name: 'Theatre Arts', label: 'CSEC Theatre Arts' },
  { level: 'CSEC', name: 'Physical Education and Sport', label: 'CSEC Physical Education and Sport' },

  { level: 'CSEC', name: 'Food, Nutrition and Health', label: 'CSEC Food, Nutrition and Health' },
  { level: 'CSEC', name: 'Home Economics Management', label: 'CSEC Home Economics Management' },
  { level: 'CSEC', name: 'Clothing and Textiles', label: 'CSEC Clothing and Textiles' },

  { level: 'CSEC', name: 'Spanish', label: 'CSEC Spanish' },
  { level: 'CSEC', name: 'French', label: 'CSEC French' },
  { level: 'CSEC', name: 'Portuguese', label: 'CSEC Portuguese' },

  { level: 'CSEC', name: 'Technical Drawing', label: 'CSEC Technical Drawing' },
  { level: 'CSEC', name: 'Auto Mechanics', label: 'CSEC Auto Mechanics' },
  { level: 'CSEC', name: 'Building Technology - Woods', label: 'CSEC Building Technology - Woods' },
  { level: 'CSEC', name: 'Building Technology - Construction', label: 'CSEC Building Technology - Construction' },
  { level: 'CSEC', name: 'Electrical and Electronic Technology', label: 'CSEC Electrical and Electronic Technology' },
  { level: 'CSEC', name: 'Mechanical Engineering Technology', label: 'CSEC Mechanical Engineering Technology' },
  { level: 'CSEC', name: 'Plumbing', label: 'CSEC Plumbing' },
  { level: 'CSEC', name: 'Welding', label: 'CSEC Welding' },

  { level: 'CSEC', name: 'Tourism', label: 'CSEC Tourism' },
  { level: 'CSEC', name: 'Entrepreneurship', label: 'CSEC Entrepreneurship' },
  { level: 'CSEC', name: 'Environmental Science (Pilot)', label: 'CSEC Environmental Science (Pilot)' },
  { level: 'CSEC', name: 'Civics (Pilot)', label: 'CSEC Civics (Pilot)' },
  { level: 'CSEC', name: 'Maritime Studies (Pilot)', label: 'CSEC Maritime Studies (Pilot)' },

  // CAPE
  { level: 'CAPE', name: 'Accounting', label: 'CAPE Accounting' },
  { level: 'CAPE', name: 'Agricultural Science', label: 'CAPE Agricultural Science' },
  { level: 'CAPE', name: 'Animation and Game Design', label: 'CAPE Animation and Game Design' },
  { level: 'CAPE', name: 'Applied Mathematics', label: 'CAPE Applied Mathematics' },
  { level: 'CAPE', name: 'Art and Design', label: 'CAPE Art and Design' },
  { level: 'CAPE', name: 'Biology', label: 'CAPE Biology' },
  { level: 'CAPE', name: 'Building and Mechanical Engineering Drawing (BMED)', label: 'CAPE Building and Mechanical Engineering Drawing (BMED)' },
  { level: 'CAPE', name: 'Caribbean Studies', label: 'CAPE Caribbean Studies' },
  { level: 'CAPE', name: 'Chemistry', label: 'CAPE Chemistry' },
  { level: 'CAPE', name: 'Communication Studies', label: 'CAPE Communication Studies' },
  { level: 'CAPE', name: 'Computer Science', label: 'CAPE Computer Science' },
  { level: 'CAPE', name: 'Digital Media', label: 'CAPE Digital Media' },
  { level: 'CAPE', name: 'Economics', label: 'CAPE Economics' },
  { level: 'CAPE', name: 'Electrical and Electronic Engineering Technology', label: 'CAPE Electrical and Electronic Engineering Technology' },
  { level: 'CAPE', name: 'Entrepreneurship', label: 'CAPE Entrepreneurship' },
  { level: 'CAPE', name: 'Environmental Science', label: 'CAPE Environmental Science' },
  { level: 'CAPE', name: 'Food and Nutrition', label: 'CAPE Food and Nutrition' },
  { level: 'CAPE', name: 'French', label: 'CAPE French' },
  { level: 'CAPE', name: 'Geography', label: 'CAPE Geography' },
  { level: 'CAPE', name: 'Green Engineering', label: 'CAPE Green Engineering' },
  { level: 'CAPE', name: 'History', label: 'CAPE History' },
  { level: 'CAPE', name: 'Information Technology', label: 'CAPE Information Technology' },
  { level: 'CAPE', name: 'Integrated Mathematics', label: 'CAPE Integrated Mathematics' },
  { level: 'CAPE', name: 'Law', label: 'CAPE Law' },
  { level: 'CAPE', name: 'Literatures in English', label: 'CAPE Literatures in English' },
  { level: 'CAPE', name: 'Logistics and Supply Chain Operations', label: 'CAPE Logistics and Supply Chain Operations' },
  { level: 'CAPE', name: 'Management of Business (MOB)', label: 'CAPE Management of Business (MOB)' },
  { level: 'CAPE', name: 'Mechanical Engineering', label: 'CAPE Mechanical Engineering' },
  { level: 'CAPE', name: 'Performing Arts', label: 'CAPE Performing Arts' },
  { level: 'CAPE', name: 'Physical Education and Sport', label: 'CAPE Physical Education and Sport' },
  { level: 'CAPE', name: 'Physics', label: 'CAPE Physics' },
  { level: 'CAPE', name: 'Pure Mathematics', label: 'CAPE Pure Mathematics' },
  { level: 'CAPE', name: 'Sociology', label: 'CAPE Sociology' },
  { level: 'CAPE', name: 'Spanish', label: 'CAPE Spanish' },
  { level: 'CAPE', name: 'Tourism', label: 'CAPE Tourism' },
  { level: 'CAPE', name: 'Digital Literacy', label: 'CAPE Digital Literacy' },
  { level: 'CAPE', name: 'Financial Services Studies', label: 'CAPE Financial Services Studies' },
  { level: 'CAPE', name: 'Criminology', label: 'CAPE Criminology' },
  { level: 'CAPE', name: 'Music', label: 'CAPE Music' },
  { level: 'CAPE', name: 'Sports Science', label: 'CAPE Sports Science' },
  { level: 'CAPE', name: 'Maritime Operations', label: 'CAPE Maritime Operations' }
];
















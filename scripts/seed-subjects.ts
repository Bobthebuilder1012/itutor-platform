import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Read .env.local file manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};

envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    env[key] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables!');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

console.log('✅ Environment variables loaded');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const subjects = [
  // CSEC subjects
  { name: 'Mathematics', curriculum: 'CSEC', level: 'Form 4-5', code: 'MATH' },
  { name: 'English A', curriculum: 'CSEC', level: 'Form 4-5', code: 'ENGA' },
  { name: 'English B', curriculum: 'CSEC', level: 'Form 4-5', code: 'ENGB' },
  { name: 'Integrated Science', curriculum: 'CSEC', level: 'Form 4-5', code: 'ISCI' },
  { name: 'Physics', curriculum: 'CSEC', level: 'Form 4-5', code: 'PHYS' },
  { name: 'Chemistry', curriculum: 'CSEC', level: 'Form 4-5', code: 'CHEM' },
  { name: 'Biology', curriculum: 'CSEC', level: 'Form 4-5', code: 'BIOL' },
  { name: 'Spanish', curriculum: 'CSEC', level: 'Form 4-5', code: 'SPAN' },
  { name: 'French', curriculum: 'CSEC', level: 'Form 4-5', code: 'FREN' },
  { name: 'Information Technology', curriculum: 'CSEC', level: 'Form 4-5', code: 'IT' },
  { name: 'Additional Mathematics', curriculum: 'CSEC', level: 'Form 4-5', code: 'ADDMATH' },
  { name: 'Social Studies', curriculum: 'CSEC', level: 'Form 4-5', code: 'SOCSTD' },
  { name: 'Geography', curriculum: 'CSEC', level: 'Form 4-5', code: 'GEOG' },
  { name: 'History', curriculum: 'CSEC', level: 'Form 4-5', code: 'HIST' },
  { name: 'Economics', curriculum: 'CSEC', level: 'Form 4-5', code: 'ECON' },
  { name: 'Principles of Accounts', curriculum: 'CSEC', level: 'Form 4-5', code: 'POA' },
  { name: 'Principles of Business', curriculum: 'CSEC', level: 'Form 4-5', code: 'POB' },
  { name: 'Technical Drawing', curriculum: 'CSEC', level: 'Form 4-5', code: 'TD' },
  { name: 'Visual Arts', curriculum: 'CSEC', level: 'Form 4-5', code: 'VARTS' },
  { name: 'Music', curriculum: 'CSEC', level: 'Form 4-5', code: 'MUSIC' },
  { name: 'Physical Education & Sport', curriculum: 'CSEC', level: 'Form 4-5', code: 'PE' },
  { name: 'Food & Nutrition', curriculum: 'CSEC', level: 'Form 4-5', code: 'FOODNUT' },
  { name: 'Agricultural Science', curriculum: 'CSEC', level: 'Form 4-5', code: 'AGRISCI' },
  { name: 'Human & Social Biology', curriculum: 'CSEC', level: 'Form 4-5', code: 'HSB' },

  // CAPE subjects
  { name: 'Pure Mathematics Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'PMATH1' },
  { name: 'Pure Mathematics Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'PMATH2' },
  { name: 'Applied Mathematics Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'AMATH1' },
  { name: 'Applied Mathematics Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'AMATH2' },
  { name: 'Physics Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'PHYS1' },
  { name: 'Physics Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'PHYS2' },
  { name: 'Chemistry Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'CHEM1' },
  { name: 'Chemistry Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'CHEM2' },
  { name: 'Biology Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'BIOL1' },
  { name: 'Biology Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'BIOL2' },
  { name: 'Economics Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'ECON1' },
  { name: 'Economics Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'ECON2' },
  { name: 'Accounting Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'ACCT1' },
  { name: 'Accounting Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'ACCT2' },
  { name: 'Management of Business Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'MOB1' },
  { name: 'Management of Business Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'MOB2' },
  { name: 'Geography Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'GEOG1' },
  { name: 'Geography Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'GEOG2' },
  { name: 'History Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'HIST1' },
  { name: 'History Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'HIST2' },
  { name: 'Sociology Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'SOC1' },
  { name: 'Sociology Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'SOC2' },
  { name: 'Law Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'LAW1' },
  { name: 'Law Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'LAW2' },
  { name: 'Literatures in English Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'LIT1' },
  { name: 'Literatures in English Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'LIT2' },
  { name: 'Spanish Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'SPAN1' },
  { name: 'Spanish Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'SPAN2' },
  { name: 'French Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'FREN1' },
  { name: 'French Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'FREN2' },
  { name: 'Computer Science Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'CS1' },
  { name: 'Computer Science Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'CS2' },
  { name: 'Communication Studies Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'COMM1' },
  { name: 'Communication Studies Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'COMM2' },
  { name: 'Environmental Science Unit 1', curriculum: 'CAPE', level: 'Unit 1', code: 'ENVSCI1' },
  { name: 'Environmental Science Unit 2', curriculum: 'CAPE', level: 'Unit 2', code: 'ENVSCI2' }
];

async function seedSubjects() {
  console.log('🌱 Starting subject seeding...');

  const { data, error } = await supabase
    .from('subjects')
    .upsert(subjects, {
      onConflict: 'name,curriculum,level',
      ignoreDuplicates: true
    })
    .select();

  if (error) {
    console.error('❌ Error seeding subjects:', error);
    process.exit(1);
  }

  console.log(`✅ Successfully seeded ${data?.length || subjects.length} subjects!`);
  console.log('Sample:', data?.slice(0, 3));
}

seedSubjects();


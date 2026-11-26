export interface Opening {
  id: string;
  title: string;
  tags: string[];
  salary: string;
  category: string;
}

export const OPENINGS: Opening[] = [
  {
    id: '1',
    title: 'Accounts Assistant',
    tags: ['Karachi', 'Full time', '1–2 years'],
    salary: 'PKR 50000–100000',
    category: 'Office and admin',
  },
  {
    id: '2',
    title: 'Customer Support Executive',
    tags: ['Lahore', 'Full time', 'Fresh graduates welcome'],
    salary: 'PKR 60000–120000',
    category: 'Sales and support',
  },
  {
    id: '3',
    title: 'Commercial Electrician',
    tags: ['Karachi', 'Contract', 'Trade certificate'],
    salary: 'PKR 55000–110000',
    category: 'Technical trades',
  },
  {
    id: '4',
    title: 'Data Entry Operator',
    tags: ['Islamabad', 'Full time', 'Typing skills'],
    salary: 'PKR 65000–130000',
    category: 'Office and admin',
  },
  {
    id: '5',
    title: 'Graphic Designer',
    tags: ['Lahore', 'Full time', '2–3 years'],
    salary: 'PKR 70000–140000',
    category: 'IT',
  },
  {
    id: '6',
    title: 'Digital Marketing Specialist',
    tags: ['Islamabad', 'Remote', 'Experience with SEO and SEM'],
    salary: 'PKR 80000–160000',
    category: 'IT',
  },
];

export const TABS = [
  'All roles',
  'Office and admin',
  'Technical trades',
  'IT',
  'Sales and support',
];

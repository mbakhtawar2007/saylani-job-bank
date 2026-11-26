export interface TermsSection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
  subsections?: { title: string; bullets: string[] }[];
}

export const TERMS_PART1: TermsSection[] = [
  {
    title: 'Introduction',
    paragraphs: [
      'Welcome to Saylani Job Bank (“SJB,” “we,” “our,” or “us”).',
      'These Terms & Conditions govern your access to and use of the Saylani Job Bank website and services. Our platform aims to connect eligible job seekers with employers and facilitate recruitment opportunities.',
      'By accessing or using our platform, you agree to these Terms & Conditions. If you do not agree with these terms, please discontinue using our services.',
    ],
  },
  {
    title: 'Eligibility',
    paragraphs: [
      'You may use Saylani Job Bank only if you meet the applicable legal and eligibility requirements for the services you wish to access.',
      'You must provide accurate information during registration and maintain the accuracy of your account details. You may not use our services if you are legally prohibited from doing so.',
    ],
  },
  {
    title: 'User Accounts',
    paragraphs: [],
    subsections: [
      {
        title: 'A. Job Applicants',
        bullets: [
          'Providing accurate and complete personal and professional information.',
          'Keeping their login credentials confidential.',
          'Uploading genuine documents and valid qualifications.',
          'Updating their profiles when relevant information changes.',
          'Using the platform for legitimate employment purposes.',
          'Creating an account does not guarantee an interview, referral, job offer, or employment.',
        ],
      },
      {
        title: 'B. Employers',
        bullets: [
          'Providing accurate organizational and representative information.',
          'Submitting genuine documents when verification is required.',
          'Publishing legitimate and accurately described job vacancies.',
          'Providing clear job requirements and relevant employment details.',
          'Using candidate information only for legitimate recruitment purposes.',
          'Keeping their organization and contact information up to date.',
          'Employers must have the authority to represent the organization for which they register.',
        ],
      },
    ],
  },
  {
    title: 'Employer Registration and Verification',
    paragraphs: [
      'Saylani Job Bank may require employers to complete a verification process before accessing certain recruitment features or publishing job vacancies. We may review submitted information, request additional documents, seek clarification, or contact an organization to verify its details.',
      'If verification cannot be completed, an application may be returned for additional information, placed on hold, or declined. Verified status does not constitute a guarantee of an employer’s future conduct or the authenticity of every subsequent communication or job offer.',
      'Saylani Job Bank reserves the right to restrict or suspend employer access where information is misleading, incomplete, suspicious, or inconsistent with these terms.',
    ],
  },
  {
    title: 'Job Listings and Applications',
    paragraphs: [
      'Job listings are intended to provide information about employment opportunities. Applicants are responsible for reviewing job descriptions, eligibility criteria, qualifications, location, and other relevant requirements before applying.',
      'Applicants must ensure that the information and documents submitted with an application are accurate and genuine.',
      'Saylani Job Bank does not guarantee that every listed vacancy will remain available, that every application will receive a response, or that any applicant will be selected.',
      'Employers are responsible for the accuracy of their vacancy details and for their own recruitment decisions, subject to applicable law.',
    ],
  },
  {
    title: 'Candidate Interviews and Referrals',
    paragraphs: [
      'Saylani Job Bank may conduct interviews, review applicant profiles, assess suitability, and refer candidates to employers based on relevant job requirements.',
      'A referral means that a candidate has been introduced or recommended for further consideration. It does not guarantee an interview with the employer, selection, a job offer, or employment.',
      'Employers remain responsible for their final hiring decisions and any subsequent recruitment procedures. Applicants must provide truthful information and cooperate with reasonable recruitment-related communications.',
    ],
  },
  {
    title: 'Acceptable Use',
    paragraphs: ['Users must not:'],
    bullets: [
      'Submit false, misleading, forged, or fraudulent information or documents.',
      'Create accounts using another person’s identity without authorization.',
      'Publish fake, misleading, discriminatory, or unlawful job advertisements.',
      'Use the platform to scam, harass, threaten, or exploit other users.',
      'Request or misuse personal information for unauthorized purposes.',
      'Attempt to access accounts, systems, or information without authorization.',
      'Interfere with website functionality or attempt to compromise platform security.',
      'Use the platform for activities that violate applicable laws or these terms.',
    ],
  },
  {
    title: 'Fees and Payments',
    paragraphs: [
      'Any fees, if introduced for particular services, must be communicated clearly through the relevant official channels before they apply.',
      'Users should not assume that a payment guarantees employment, candidate selection, employer verification, or a successful recruitment outcome.',
      'Users should exercise caution if anyone requests money while falsely claiming to represent Saylani Job Bank. Any actual fees or payment procedures must be governed by clearly communicated official terms.',
    ],
  },
];

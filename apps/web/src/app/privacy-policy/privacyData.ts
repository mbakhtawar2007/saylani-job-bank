export interface PrivacySection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
  subsections?: { title: string; bullets: string[] }[];
}

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: 'Introduction',
    paragraphs: [
      'Saylani Job Bank (“we,” “our,” or “us”) respects your privacy and is committed to protecting the personal information you share with us. This Privacy Policy explains how we collect, use, store, disclose, and protect information when you visit our website, create an account, apply for employment opportunities, or use our services as an employer.',
      'By using Saylani Job Bank, you acknowledge that you have read this Privacy Policy. Where consent is legally required, we will obtain it separately.',
    ],
  },
  {
    title: 'Information We Collect',
    paragraphs: [
      'We may collect the following categories of information, depending on how you use our platform.',
    ],
    subsections: [
      {
        title: 'A. Job Applicants',
        bullets: [
          'Personal information: Name, email address, phone number, and location.',
          'Professional information: Education, skills, work experience, qualifications, and employment preferences.',
          'Documents: CVs, certificates, identification documents, and other documents required for registration or verification.',
          'Application information: Jobs applied for, application status, interview details, and referral records.',
          'Account information: Login credentials and profile details.',
        ],
      },
      {
        title: 'B. Employers and Organizations',
        bullets: [
          'Organization name, address, and contact details.',
          'Information about authorized representatives and hiring personnel.',
          'Business registration or verification documents, where required.',
          'Company profile information and job postings.',
          'Recruitment communications and candidate referral records.',
        ],
      },
      {
        title: 'C. Technical Information',
        bullets: [
          'When you access our website, certain technical information may be collected, such as browser type, device information, IP address, usage activity, and cookies or similar technologies, depending on the website’s configuration.',
        ],
      },
    ],
  },
  {
    title: 'How We Use Your Information',
    paragraphs: ['We may use the information we collect to:'],
    bullets: [
      'Create and manage applicant and employer accounts.',
      'Build applicant profiles and identify relevant employment opportunities.',
      'Review applications and assess candidate suitability.',
      'Conduct interviews and facilitate candidate referrals.',
      'Verify employer organizations and submitted information.',
      'Communicate account updates, application information, and support responses.',
      'Maintain platform functionality, reliability, and security.',
      'Prevent fraud, misuse, and unauthorized access.',
      'Meet applicable legal and regulatory obligations.',
    ],
  },
  {
    title: 'How Information Is Shared',
    paragraphs: [
      'Saylani Job Bank may share information where necessary to provide its services, subject to applicable law and appropriate safeguards.',
      'With employers: Applicant information, such as CVs, qualifications, contact details, and relevant profile information, may be shared with an employer when a candidate is referred or considered for a suitable opportunity. We aim to limit sharing to information relevant to recruitment.',
      'With applicants: We may share relevant job details, interview arrangements, and recruitment updates with applicants.',
      'With service providers: Information may be processed by authorized service providers supporting website hosting, communications, security, or platform operations.',
      'For legal or safety reasons: Information may be disclosed when required by law or when reasonably necessary to protect rights, safety, or the integrity of our services.',
      'We do not authorize the use of applicant information for unrelated purposes merely because it has been submitted to the platform.',
    ],
  },
  {
    title: 'Employer Verification',
    paragraphs: [
      'Saylani Job Bank may review information and documents submitted by employers to assess the legitimacy of an organization and its authorization to recruit through the platform.',
      'Verification may involve reviewing submitted records and contacting an organization for clarification. Verification is not an absolute guarantee of an employer’s conduct, future activities, or every job posting.',
      'Where available, employers may be asked to correct incomplete information or provide additional documents before verification can be completed.',
    ],
  },
  {
    title: 'Cookies and Website Technologies',
    paragraphs: [
      'Our website may use cookies or similar technologies to support essential functionality, maintain sessions, remember preferences, and understand website usage.',
      'Where required by law, we will seek consent before using non-essential cookies. You may also be able to manage cookies through your browser settings. The specific cookies and technologies used will depend on the website’s implementation.',
    ],
  },
  {
    title: 'Data Security',
    paragraphs: [
      'We take reasonable steps appropriate to our operations to protect personal information against unauthorized access, alteration, disclosure, or loss. Access to personal information should be limited to authorized individuals who need it for legitimate operational purposes. However, no website or electronic transmission can be guaranteed to be completely secure.',
      'Users should keep their login credentials confidential and notify us if they suspect unauthorized access to their accounts.',
    ],
  },
  {
    title: 'Data Retention',
    paragraphs: [
      'We retain personal information only for as long as reasonably necessary for the purposes described in this policy, including recruitment, account management, verification, dispute resolution, and legal compliance.',
      'Retention periods may vary according to the type of information and applicable legal requirements. When information is no longer required, we will take appropriate steps to delete it, anonymize it, or securely dispose of it, where applicable.',
    ],
  },
  {
    title: 'Your Privacy Rights',
    paragraphs: ['Subject to applicable law, you may be able to:'],
    bullets: [
      'Request access to personal information associated with your account.',
      'Request correction of inaccurate or incomplete information.',
      'Request deletion of certain personal information.',
      'Withdraw consent where processing relies on consent.',
      'Object to or request restrictions on certain processing activities.',
      'Request information about how your personal information is used or shared.',
    ],
  },
  {
    title: 'Age Eligibility',
    paragraphs: [
      'Saylani Job Bank is intended for individuals who meet the applicable age and legal eligibility requirements for employment services. Our platform is not designed for children, and we do not knowingly permit children to register for or use our employment services where they are not legally eligible. If we become aware that personal information has been collected from an ineligible child, we will review the situation and take appropriate action in accordance with applicable laws.',
    ],
  },
  {
    title: 'Third-Party Websites',
    paragraphs: [
      'Our website may contain links to third-party websites or services, including employer websites. These third parties may have their own privacy policies and practices. Saylani Job Bank is not responsible for the privacy practices of external websites. We encourage users to review the relevant privacy policies before providing information to those services.',
    ],
  },
  {
    title: 'Contact Us',
    paragraphs: [
      'If you have questions about this Privacy Policy, how your information is handled, or how to submit a privacy request, please contact Saylani Job Bank through our Contact Us page.',
    ],
  },
];

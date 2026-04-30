import LegalDoc, { type Block, type Section } from './legal/LegalDoc';

const INTRO: Block[] = [
  {
    kind: 'p',
    text: 'The AllFor1 Network ("AllFor1," "we," "our," or "us") operates a sports-focused social networking and talent-discovery platform connecting athletes, coaches, scouts, agents, and team organisations across multiple sports disciplines ("Platform"). This Privacy Policy explains how we collect, process, use, share, and sell personal data of users in India.',
  },
  {
    kind: 'p',
    text: 'This Policy is issued in compliance with the Digital Personal Data Protection Act, 2023 ("DPDP Act"), the Information Technology Act, 2000 ("IT Act"), and the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 ("SPDI Rules").',
  },
  {
    kind: 'p',
    text: 'Under the DPDP Act, The AllFor1 Network is the Data Fiduciary and you are the Data Principal. By creating an account or using the Platform, you provide free, specific, informed, and unconditional consent to the processing of your personal data as described herein. If you do not consent, you must not register or use the Platform.',
  },
  {
    kind: 'callout',
    text: 'IMPORTANT: As described in Section 5 below, AllFor1 shares athlete data with verified tournament recruiters and sells certain user data to third parties. Please read this Policy carefully before registering.',
  },
];

const SECTIONS: Section[] = [
  {
    num: '1',
    title: 'About This Policy',
    blocks: [
      { kind: 'p', text: 'This Policy describes our data collection, processing, sharing, and sale practices. It applies to all users of the Platform — Athletes, Coaches, Scouts, Agents, and Teams/Academies.' },
    ],
  },
  {
    num: '2',
    title: 'Personal Data We Collect',
    blocks: [
      { kind: 'h3', text: '2.1 Account and Registration Data' },
      { kind: 'p', text: 'When you register, we collect:' },
      {
        kind: 'ul',
        items: [
          'Full name or team/academy name',
          'Email address and password (stored as a secure cryptographic hash via Firebase Authentication)',
          'User role: Athlete, Coach, Scout, Team/Academy, or Agent/Talent Manager',
          'Primary sport (e.g., Cricket, Football, Basketball, Athletics, Badminton, Wrestling, etc.)',
          'Athletics-specific events where applicable (e.g., sprints, field events)',
          'Date of birth and calculated age (for individual accounts)',
          'Location: country, state/union territory, city',
          'Height (optional, individual accounts only)',
        ],
      },
      { kind: 'h3', text: '2.2 Profile Data' },
      { kind: 'p', text: 'Users may add the following to their profiles:' },
      {
        kind: 'ul',
        items: [
          'Profile photograph (avatar) and banner image',
          'Biography and playing position',
          'Public contact email address',
          'Phone number (used for identity verification via OTP; stored and marked verified/unverified)',
          'Tournament participation records and player rankings',
          'Team memberships and club/academy affiliations',
        ],
      },
      { kind: 'h3', text: '2.3 User-Generated Content' },
      {
        kind: 'ul',
        items: [
          'Posts (text, photographs, and video highlights/reels)',
          'Comments, reposts, and reactions',
          'Direct messages and chat conversations',
          'Tournament registration details and performance statistics',
          'Queries submitted through the Scout Copilot talent-discovery feature',
        ],
      },
      { kind: 'h3', text: '2.4 Automatically Collected Technical Data' },
      {
        kind: 'ul',
        items: [
          'Device type, operating system version, browser or app version',
          'IP address and inferred geographic location',
          'Usage logs: pages visited, features used, search queries, session duration',
          'Social graph data: follow relationships and connection history',
          'Notification interaction events (opens, dismissals)',
          'Crash reports and error logs',
        ],
      },
      { kind: 'callout', text: 'Phone number and biometric-equivalent data (where collected) are treated as Sensitive Personal Data or Information ("SPDI") under the SPDI Rules and are processed with heightened care.' },
    ],
  },
  {
    num: '3',
    title: 'Purposes of Processing',
    blocks: [
      { kind: 'h3', text: '3.1 Platform Operations' },
      {
        kind: 'ul',
        items: [
          'Creating and maintaining your account',
          'Displaying your public profile to other Platform users',
          'Enabling social features: posts, follows, connections, messaging, notifications',
          'Processing tournament registrations and computing player rankings',
          'Sending transactional communications (email verification, password reset, platform alerts)',
        ],
      },
      { kind: 'h3', text: '3.2 Talent Recruitment and Scouting' },
      { kind: 'p', text: 'A core purpose of the Platform is facilitating athlete discovery by legitimate recruiters and scouts. We process your data to:' },
      {
        kind: 'ul',
        items: [
          'Surface athlete profiles to verified scouts, coaches, agents, and talent managers registered on the Platform',
          'Provide structured athlete data — including name, age, sport, position, location, height, performance statistics, rankings, and highlight video content — to recruiters affiliated with verified tournaments hosted on or integrated with the Platform',
          'Power the Scout Copilot AI talent-discovery feature, which enables natural-language queries against athlete data on behalf of scouts and recruiters',
          'Generate data exports and reports delivered to verified tournament operators and their affiliated recruitment staff',
        ],
      },
      { kind: 'callout', text: 'Athlete Data Principal Consent: By registering as an Athlete, you provide explicit and informed consent under the DPDP Act for your profile data to be shared with verified tournament recruiters as described in Section 5.' },
      { kind: 'h3', text: '3.3 Advertising and Personalisation' },
      {
        kind: 'ul',
        items: [
          'Serving targeted advertisements based on your profile, sport, location, interests, and Platform behaviour',
          'Personalising your content feed and recommendations',
          'Measuring advertising effectiveness and reach',
        ],
      },
      { kind: 'h3', text: '3.4 Analytics and Service Improvement' },
      {
        kind: 'ul',
        items: [
          'Analysing usage patterns to improve Platform features and performance',
          'Conducting sports participation research and developing new services',
          'Detecting and preventing fraud, abuse, and violations of these Terms',
        ],
      },
    ],
  },
  {
    num: '4',
    title: 'Cookies and Tracking Technologies',
    blocks: [
      { kind: 'p', text: 'We and our third-party partners use cookies, web beacons, mobile advertising IDs (e.g., GAID, IDFA), and similar tracking technologies to maintain sessions, personalise content, deliver targeted advertisements, and analyse Platform traffic.' },
      { kind: 'p', text: 'You may disable cookies in your browser settings; however, doing so may impair Platform functionality. Our mobile applications use equivalent device-level identifiers, which can be reset through your device settings.' },
    ],
  },
  {
    num: '5',
    title: 'Sharing and Sale of Personal Data',
    blocks: [
      { kind: 'p', text: 'The AllFor1 Network shares and, in certain cases, sells personal data as described below. We do not sell the content of private messages exchanged between users.' },
      { kind: 'h3', text: '5.1 Verified Tournament Recruiters' },
      { kind: 'p', text: 'Athlete personal data — including name, age, height, location, sport, position, performance statistics, rankings, highlight videos, and contact information — is shared with recruiters who have been verified by, or are affiliated with, tournaments hosted on or integrated with the Platform. This sharing is a fundamental feature of Athlete accounts and forms a core purpose for which consent is sought at registration.' },
      { kind: 'h3', text: '5.2 Third-Party Data Sale' },
      { kind: 'p', text: 'AllFor1 sells user personal data to third-party companies for the following purposes:' },
      {
        kind: 'ul',
        items: [
          'Advertising networks: demographic, interest, and behavioural data for ad targeting and serving',
          'API consumers: structured access to anonymised or identifiable user data via AllFor1’s commercial API',
          'Sports analytics and market research firms: aggregated or individual-level data on participation trends, demographics, and Platform engagement',
          'Recruitment technology platforms: athlete profiles, career data, and scouting reports',
        ],
      },
      { kind: 'callout', text: 'By using the Platform and accepting this Policy, you provide explicit, informed consent under the DPDP Act to the sale of your personal data for the purposes listed above. You may withdraw this consent by deleting your account or submitting a written request to our Grievance Officer (Section 11). Withdrawal does not affect lawfulness of processing prior to withdrawal.' },
      { kind: 'h3', text: '5.3 Data Processors and Service Providers' },
      { kind: 'p', text: 'We engage the following categories of trusted processors who act on our behalf:' },
      {
        kind: 'ul',
        items: [
          'Firebase / Google Cloud (Google LLC) — authentication, real-time database, analytics, and push notifications',
          'Cloudinary — media storage and transformation (profile photos, banners, highlight videos)',
          'Email delivery service providers — transactional and marketing communications',
          'Cloud hosting and infrastructure providers',
        ],
      },
      { kind: 'p', text: 'These processors are bound by data processing agreements and are restricted to processing data solely to provide services to AllFor1.' },
      { kind: 'h3', text: '5.4 Law Enforcement and Regulatory Authorities' },
      { kind: 'p', text: 'We may disclose personal data to government authorities, law enforcement agencies, or courts where required by applicable Indian law, court order, or lawful government direction under the IT Act or any other statute. We will endeavour to provide notice to the Data Principal before such disclosure unless prohibited by law.' },
      { kind: 'h3', text: '5.5 Business Transfers' },
      { kind: 'p', text: 'In the event of a merger, acquisition, asset sale, or restructuring of AllFor1, personal data may be transferred as part of that transaction. We will notify Data Principals before their data becomes subject to a materially different privacy policy.' },
    ],
  },
  {
    num: '6',
    title: 'Cross-Border Data Transfers',
    blocks: [
      { kind: 'p', text: 'The AllFor1 Network stores and processes data on cloud infrastructure that may be located outside India. We transfer personal data only to countries or territories notified by the Central Government under the DPDP Act as ensuring adequate data protection, or where appropriate contractual safeguards are in place. By using the Platform, you consent to the transfer of your personal data outside India for the purposes described in this Policy.' },
    ],
  },
  {
    num: '7',
    title: 'Data Retention',
    blocks: [
      { kind: 'p', text: 'We retain personal data for as long as your account is active or as needed to fulfil the purposes described in this Policy. Upon account deletion:' },
      {
        kind: 'ul',
        items: [
          'Active profile and content are removed from production systems within 30 days',
          'Backup copies may be retained for up to 90 days',
          'Data already sold or shared with third parties prior to deletion cannot be retrieved by AllFor1',
          'Data required for legal, regulatory, or tax compliance may be retained for periods mandated by law',
          'Anonymised or aggregated data derived from your account may be retained indefinitely and does not constitute personal data',
        ],
      },
    ],
  },
  {
    num: '8',
    title: 'Rights of Data Principals',
    blocks: [
      { kind: 'p', text: 'Under the DPDP Act, you have the following rights as a Data Principal:' },
      { kind: 'h3', text: '8.1 Right to Access Information' },
      { kind: 'p', text: 'You have the right to obtain a summary of the personal data we hold about you and the processing activities carried out on that data. Most of your data is accessible directly within the Platform’s Settings and Edit Profile pages.' },
      { kind: 'h3', text: '8.2 Right to Correction and Erasure' },
      { kind: 'p', text: 'You may request correction of inaccurate or misleading personal data, or erasure of personal data that is no longer necessary for the purpose for which it was collected (subject to legal retention obligations). Account deletion is available via Settings > Danger Zone > Delete Account.' },
      { kind: 'h3', text: '8.3 Right to Grievance Redressal' },
      { kind: 'p', text: 'You have the right to have any grievance regarding the processing of your personal data redressed. Please contact our Grievance Officer (Section 11) within the timelines specified below.' },
      { kind: 'h3', text: '8.4 Right to Nominate' },
      { kind: 'p', text: 'You may nominate another individual to exercise your rights under the DPDP Act in the event of your death or incapacity. Please contact our Grievance Officer to register a nomination.' },
      { kind: 'h3', text: '8.5 Withdrawal of Consent' },
      { kind: 'p', text: 'You may withdraw consent for any or all processing activities at any time by contacting our Grievance Officer or deleting your account. Withdrawal does not affect the lawfulness of processing carried out before withdrawal. Certain withdrawals may render the Platform non-functional for your account.' },
    ],
  },
  {
    num: '9',
    title: 'Children’s Data (Persons Under 18)',
    blocks: [
      { kind: 'p', text: 'The Platform is not directed to minors under the age of 18. Under the DPDP Act, processing personal data of a child (person under 18 years) requires verifiable parental consent. By registering for an account for yourself or on behalf of a person under 18, you represent that you are the parent or legal guardian and that you provide consent on their behalf.' },
      { kind: 'p', text: 'AllFor1 will not process personal data of children under 18 for behavioural monitoring, targeted advertising, or data sale without explicit verifiable parental consent. If we discover that personal data of a child has been collected without proper parental consent, we will delete it promptly.' },
      { kind: 'p', text: 'Parents or guardians who believe a minor’s data has been collected without consent should contact our Grievance Officer immediately.' },
    ],
  },
  {
    num: '10',
    title: 'Security Measures',
    blocks: [
      { kind: 'p', text: 'The AllFor1 Network implements reasonable security practices and procedures as required under Section 43A of the IT Act and the SPDI Rules, including:' },
      {
        kind: 'ul',
        items: [
          'Encrypted data transmission over HTTPS/TLS',
          'Cryptographic hashing and salting of passwords via Firebase Authentication',
          'OTP-based phone number verification for identity assurance',
          'Role-based access controls and authenticated API endpoints',
          'Rate limiting, bot protection, and abuse monitoring systems',
        ],
      },
      { kind: 'p', text: 'No transmission over the internet or electronic storage system is completely secure. While we strive to protect your personal data, we cannot guarantee absolute security. In the event of a data breach affecting your rights or interests, we will notify you and the applicable authority as required under the DPDP Act.' },
    ],
  },
  {
    num: '11',
    title: 'Grievance Officer',
    blocks: [
      { kind: 'p', text: 'In accordance with the DPDP Act and the IT Act, The AllFor1 Network has designated a Grievance Officer to address complaints and inquiries regarding the processing of personal data. Grievances will be acknowledged within 48 hours and resolved within 30 days of receipt.' },
      {
        kind: 'kv',
        rows: [
          { label: 'Grievance Officer', value: 'The AllFor1 Network' },
          { label: 'Email', value: 'info@allfor1.pro', href: 'mailto:info@allfor1.pro' },
        ],
      },
      { kind: 'p', text: 'For data sale opt-out requests, please include "DATA SALE OPT-OUT" in the subject line.' },
      { kind: 'p', text: 'You also have the right to approach the Data Protection Board of India (once constituted under the DPDP Act) if your grievance is not resolved to your satisfaction.' },
    ],
  },
  {
    num: '12',
    title: 'Changes to This Policy',
    blocks: [
      { kind: 'p', text: 'AllFor1 may update this Privacy Policy from time to time. Material changes will be notified to registered Data Principals via email or a prominent notice on the Platform at least 7 days before the changes take effect. Continued use of the Platform after the effective date constitutes acceptance of the revised Policy. The "Last Updated" date at the top of this document reflects the most recent revision.' },
    ],
  },
  {
    num: '13',
    title: 'Governing Law',
    blocks: [
      { kind: 'p', text: 'This Privacy Policy is governed by the laws of the Republic of India, including the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000. Any disputes arising from this Policy shall be subject to the jurisdiction of the courts at Mumbai, India.' },
    ],
  },
];

export default function Privacy() {
  return (
    <LegalDoc
      eyebrow="The AllFor1 Network · Legal"
      title="Privacy Policy"
      effectiveDate="30 April 2026"
      jurisdiction="Republic of India"
      intro={INTRO}
      sections={SECTIONS}
    />
  );
}

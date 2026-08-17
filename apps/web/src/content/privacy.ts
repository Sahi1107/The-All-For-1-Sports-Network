// Shared legal-document content — the single source of truth for both the SPA
// page (LegalDoc) and the build-time SEO prerender, so the two can't drift.
//
// The entity name, effective date and version come from @af1/core so the document
// text, the prerender's structured data, and the server's acceptance records all
// agree. DigiLocker identity verification is NOT yet built — its active-processing
// sections are deliberately held (see §2.5 forward-looking note) and go live with
// the feature, matching how the marketing pages describe it.
import type { Block, Section } from '../pages/legal/LegalDoc';
import { DATA_FIDUCIARY_LEGAL_NAME as ENTITY, POLICY_EFFECTIVE_DATE, POLICY_SUPERSEDES_DATE } from '@af1/core';

const INTRO: Block[] = [
  {
    kind: 'p',
    text: `${ENTITY} ("AllFor1," "we," "our," or "us") operates a sports-focused social networking and talent-discovery platform connecting athletes, coaches, scouts, agents, and team organisations across multiple sports disciplines ("Platform"). This Privacy Policy explains how we collect, process, use, and share personal data of users in India.`,
  },
  {
    kind: 'p',
    text: 'This Policy is issued in compliance with the Digital Personal Data Protection Act, 2023 ("DPDP Act"), the Information Technology Act, 2000 ("IT Act"), and the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 ("SPDI Rules").',
  },
  {
    kind: 'p',
    text: `Under the DPDP Act, ${ENTITY} is the Data Fiduciary and you are the Data Principal. By creating an account or using the Platform, you provide free, specific, informed, and unconditional consent to the processing of your personal data as described herein. If you do not consent, you must not register or use the Platform.`,
  },
  {
    kind: 'callout',
    text: 'IMPORTANT: As described in Section 5.1, athlete profile data is shared with verified tournament recruiters and scouts. This is a core function of the Platform. AllFor1 does not sell personal data. Please read this Policy carefully before registering.',
  },
];

const SECTIONS: Section[] = [
  {
    num: '1',
    title: 'About This Policy',
    blocks: [
      { kind: 'p', text: 'This Policy describes our data collection, processing, and sharing practices. It applies to all users of the Platform: Athletes, Coaches, Scouts, Agents, and Teams/Academies.' },
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
          'Primary sport (for example Cricket, Football, Basketball, Athletics, Badminton, Wrestling)',
          'Athletics-specific events where applicable (for example sprints, field events)',
          'Date of birth and calculated age (for individual accounts)',
          'Location: country, state or union territory, city',
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
          'Phone number (used for identity verification via OTP; stored and marked verified or unverified)',
          'Tournament participation records and player rankings',
          'Team memberships and club or academy affiliations',
        ],
      },
      { kind: 'h3', text: '2.3 User-Generated Content' },
      {
        kind: 'ul',
        items: [
          'Posts (text, photographs, and video highlights or reels)',
          'Comments, reposts, and reactions',
          'Direct messages and chat conversations',
          'Tournament registration details and performance statistics',
          'Queries submitted through the Radar talent-discovery feature',
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
      { kind: 'h3', text: '2.5 Identity Verification (Planned)' },
      { kind: 'p', text: 'Identity verification through DigiLocker — India’s government-backed digital identity system, via the Meri Pehchaan Single Sign-On service — is planned and is not yet available on the Platform. We do not collect, receive, or store any DigiLocker or Aadhaar-linked identity data today.' },
      { kind: 'callout', text: 'When identity verification launches it will be optional and initiated only by you; its own consent will be captured on a dedicated screen at the point of use, stating the exact attributes requested and the purpose for which they will be used; and this Policy will be updated to describe that processing in full before the feature goes live.' },
      { kind: 'callout', text: 'Phone number and date of birth are treated as Sensitive Personal Data or Information ("SPDI") under the SPDI Rules and are processed with heightened care.' },
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
          'Provide structured athlete data, including name, age, sport, position, location, height, performance statistics, rankings, and highlight video content, to recruiters affiliated with verified tournaments hosted on or integrated with the Platform',
          'Power the Radar AI talent-discovery feature, which enables natural-language queries against athlete data on behalf of scouts and recruiters',
          'Generate data exports and reports delivered to verified tournament operators and their affiliated recruitment staff',
        ],
      },
      { kind: 'callout', text: 'Athlete Data Principal Consent: By registering as an Athlete, you provide explicit and informed consent under the DPDP Act for your profile data to be shared with verified tournament recruiters as described in Section 5.1.' },
      { kind: 'h3', text: '3.3 Advertising and Personalisation' },
      {
        kind: 'ul',
        items: [
          'Serving targeted advertisements based on your profile, sport, location, interests, and Platform behaviour',
          'Personalising your content feed and recommendations',
          'Measuring advertising effectiveness and reach',
        ],
      },
      { kind: 'p', text: 'We do not serve targeted advertising to users under the age of 18.' },
      { kind: 'h3', text: '3.4 Analytics and Service Improvement' },
      {
        kind: 'ul',
        items: [
          'Analysing usage patterns to improve Platform features and performance',
          'Conducting sports participation research and developing new services',
          'Detecting and preventing fraud, abuse, and violations of our Terms',
        ],
      },
    ],
  },
  {
    num: '4',
    title: 'Cookies and Tracking Technologies',
    blocks: [
      { kind: 'p', text: 'We and our third-party partners use cookies, web beacons, mobile advertising identifiers (for example GAID, IDFA), and similar tracking technologies to maintain sessions, personalise content, deliver advertisements, and analyse Platform traffic.' },
      { kind: 'p', text: 'You may disable cookies in your browser settings; however, doing so may impair Platform functionality. Our mobile applications use equivalent device-level identifiers, which can be reset through your device settings.' },
    ],
  },
  {
    num: '5',
    title: 'Sharing of Personal Data',
    blocks: [
      { kind: 'p', text: `${ENTITY} does not sell personal data. We share personal data only in the circumstances described in this Section. We do not share or disclose the content of private messages exchanged between users, except where required by law under Section 5.3.` },
      { kind: 'h3', text: '5.1 Verified Tournament Recruiters' },
      { kind: 'p', text: 'Athlete personal data, including name, age, height, location, sport, position, performance statistics, rankings, highlight videos, and public contact information, is shared with recruiters who have been verified by, or are affiliated with, tournaments hosted on or integrated with the Platform. This sharing is a fundamental feature of Athlete accounts and forms a core purpose for which consent is sought at registration.' },
      { kind: 'h3', text: '5.2 Data Processors and Service Providers' },
      { kind: 'p', text: 'We engage the following categories of trusted processors who act on our behalf:' },
      {
        kind: 'ul',
        items: [
          'Firebase and Google Cloud (Google LLC): authentication, database, analytics, and push notifications',
          'Media storage and transformation providers: profile photographs, banners, and highlight videos',
          'Email delivery service providers: transactional and service communications',
          'Cloud hosting and infrastructure providers',
        ],
      },
      { kind: 'p', text: 'These processors are bound by data processing agreements and are restricted to processing data solely to provide services to AllFor1.' },
      { kind: 'h3', text: '5.3 Law Enforcement and Regulatory Authorities' },
      { kind: 'p', text: 'We may disclose personal data to government authorities, law enforcement agencies, or courts where required by applicable Indian law, court order, or lawful government direction under the IT Act or any other statute. We will endeavour to provide notice to the Data Principal before such disclosure unless prohibited by law.' },
      { kind: 'h3', text: '5.4 Business Transfers' },
      { kind: 'p', text: 'In the event of a merger, acquisition, asset sale, or restructuring of AllFor1, personal data may be transferred as part of that transaction. We will notify Data Principals before their data becomes subject to a materially different privacy policy.' },
    ],
  },
  {
    num: '6',
    title: 'Cross-Border Data Transfers',
    blocks: [
      { kind: 'p', text: `${ENTITY} stores and processes data on cloud infrastructure that may be located outside India. We transfer personal data only to countries or territories notified by the Central Government under the DPDP Act as ensuring adequate data protection, or where appropriate contractual safeguards are in place. By using the Platform, you consent to the transfer of your personal data outside India for the purposes described in this Policy.` },
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
      { kind: 'p', text: 'Under the DPDP Act, you have the following rights as a Data Principal.' },
      { kind: 'h3', text: '8.1 Right to Access Information' },
      { kind: 'p', text: 'You have the right to obtain a summary of the personal data we hold about you and the processing activities carried out on that data. Most of your data is accessible directly within the Platform’s Settings and Edit Profile pages.' },
      { kind: 'h3', text: '8.2 Right to Correction and Erasure' },
      { kind: 'p', text: 'You may request correction of inaccurate or misleading personal data, or erasure of personal data that is no longer necessary for the purpose for which it was collected, subject to legal retention obligations. Account deletion is available via Settings, Danger Zone, Delete Account.' },
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
      { kind: 'p', text: 'Competitive sport in India is substantially organised in age-group categories, and the Platform is used by athletes under the age of 18. AllFor1 processes the personal data of children only in accordance with Section 9 of the DPDP Act and only on the terms set out below.' },
      { kind: 'h3', text: '9.1 Verifiable Parental Consent' },
      { kind: 'p', text: 'An account for a person under the age of 18 must be created and managed by that person’s parent or legal guardian. By registering such an account, you represent that you are the parent or legal guardian of the child and that you provide verifiable consent on their behalf to the processing described in this Policy. AllFor1 records the identity of the consenting guardian and the date, time, and text of the consent given.' },
      { kind: 'h3', text: '9.2 Restrictions on Processing of Children’s Data' },
      { kind: 'p', text: 'AllFor1 does not, in respect of any user under the age of 18:' },
      {
        kind: 'ul',
        items: [
          'undertake tracking or behavioural monitoring;',
          'serve targeted or behavioural advertising;',
          'sell, license, or otherwise monetise personal data;',
          'carry out any processing likely to cause a detrimental effect on the wellbeing of the child.',
        ],
      },
      { kind: 'h3', text: '9.3 Guardian Rights' },
      { kind: 'p', text: 'A parent or legal guardian may exercise all rights set out in Section 8 on behalf of the child, including access, correction, erasure, and withdrawal of consent. Guardians who believe a child’s data has been collected without proper consent should contact our Grievance Officer immediately, and we will delete that data promptly.' },
    ],
  },
  {
    num: '10',
    title: 'Security Measures',
    blocks: [
      { kind: 'p', text: `${ENTITY} implements reasonable security practices and procedures as required under Section 43A of the IT Act and the SPDI Rules, including:` },
      {
        kind: 'ul',
        items: [
          'Encrypted data transmission over HTTPS with TLS 1.2 or above',
          'Cryptographic hashing and salting of passwords via Firebase Authentication',
          'OTP-based phone number verification for identity assurance',
          'Role-based access controls and authenticated API endpoints',
          'Rate limiting, bot protection, and abuse monitoring systems',
          'Encryption of personal data at rest, with access restricted to named application service accounts',
        ],
      },
      { kind: 'p', text: 'No transmission over the internet or electronic storage system is completely secure. While we strive to protect your personal data, we cannot guarantee absolute security. In the event of a data breach affecting your rights or interests, we will notify you and the applicable authority as required under the DPDP Act.' },
    ],
  },
  {
    num: '11',
    title: 'Grievance Officer',
    blocks: [
      { kind: 'p', text: `In accordance with the DPDP Act and the IT Act, ${ENTITY} has designated a Grievance Officer to address complaints and inquiries regarding the processing of personal data. Grievances will be acknowledged within 24 hours and resolved within 15 days of receipt.` },
      {
        kind: 'kv',
        rows: [
          { label: 'Grievance Officer', value: ENTITY },
          { label: 'Email', value: 'info@allfor1.pro', href: 'mailto:info@allfor1.pro' },
        ],
      },
      { kind: 'p', text: 'You also have the right to approach the Data Protection Board of India, once constituted under the DPDP Act, if your grievance is not resolved to your satisfaction.' },
    ],
  },
  {
    num: '12',
    title: 'Changes to This Policy',
    blocks: [
      { kind: 'p', text: 'AllFor1 may update this Privacy Policy from time to time. Material changes will be notified to registered Data Principals by email or by a prominent notice on the Platform at least 7 days before the changes take effect. Continued use of the Platform after the effective date constitutes acceptance of the revised Policy. The effective date at the top of this document reflects the most recent revision.' },
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

export const PRIVACY_DOC = {
  eyebrow: 'All For 1 · Legal',
  title: 'Privacy Policy',
  effectiveDate: POLICY_EFFECTIVE_DATE,
  supersedes: POLICY_SUPERSEDES_DATE,
  jurisdiction: 'Republic of India',
  intro: INTRO,
  sections: SECTIONS,
};

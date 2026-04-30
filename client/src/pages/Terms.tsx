import LegalDoc, { type Block, type Section } from './legal/LegalDoc';

const INTRO: Block[] = [
  {
    kind: 'p',
    text: 'These Terms and Conditions ("Terms") constitute a legally binding agreement between you ("User," "you," or "your") and The AllFor1 Network ("AllFor1," "we," "our," or "us"), a company registered in India, governing your access to and use of the AllFor1 platform, including all websites, mobile applications (iOS and Android), and related services (collectively, the "Platform").',
  },
  {
    kind: 'callout',
    text: 'BY CREATING AN ACCOUNT, TAPPING "JOIN ALL FOR 1," OR OTHERWISE ACCESSING OR USING THE PLATFORM, YOU AGREE TO BE LEGALLY BOUND BY THESE TERMS AND OUR PRIVACY POLICY, WHICH IS INCORPORATED HEREIN BY REFERENCE. IF YOU DO NOT AGREE, YOU MUST NOT USE THE PLATFORM.',
  },
  {
    kind: 'p',
    text: 'Your use of the Platform constitutes an "electronic record" within the meaning of the IT Act, 2000, and does not require a physical or digital signature to be binding.',
  },
];

const SECTIONS: Section[] = [
  {
    num: '1',
    title: 'Acceptance of Terms',
    blocks: [
      { kind: 'p', text: 'By accessing or using the Platform you agree to be bound by these Terms. If you do not agree, you must immediately stop using the Platform.' },
    ],
  },
  {
    num: '2',
    title: 'Eligibility',
    blocks: [
      { kind: 'p', text: 'You must be at least 18 years of age to independently enter into a legally binding contract under the Indian Contract Act, 1872. Users between the ages of 13 and 17 may use the Platform only with the verified consent of a parent or legal guardian, who accepts these Terms on their behalf.' },
      { kind: 'p', text: 'By registering, you represent and warrant that:' },
      {
        kind: 'ul',
        items: [
          'You are at least 13 years of age',
          'If you are between 13 and 17, your parent or legal guardian has reviewed and consented to these Terms and the Privacy Policy on your behalf',
          'You have the legal capacity to enter into binding agreements under applicable Indian law',
          'You are not barred from using the Platform under any applicable law or court order',
          'All registration information you provide is accurate, current, and complete',
        ],
      },
      { kind: 'p', text: 'AllFor1 reserves the right to terminate any account where eligibility requirements are not satisfied.' },
    ],
  },
  {
    num: '3',
    title: 'Account Registration and Security',
    blocks: [
      { kind: 'h3', text: '3.1 Account Creation' },
      { kind: 'p', text: 'To access the Platform, you must register and create an account by selecting your role (Athlete, Coach, Scout, Team/Academy, or Agent/Talent Manager), your primary sport, and providing personal information including your name, email address, and a secure password. Date of birth, location, and height may also be collected to enable talent-discovery features.' },
      { kind: 'h3', text: '3.2 Role and Sport — Permanent Selection' },
      { kind: 'p', text: 'Your selected role and primary sport are permanent and cannot be changed after registration. These fields determine your account type and the nature of data we process and share on your behalf. Choose carefully.' },
      { kind: 'h3', text: '3.3 Account Security' },
      { kind: 'p', text: 'You are solely responsible for maintaining the confidentiality of your login credentials. You agree to:' },
      {
        kind: 'ul',
        items: [
          'Set a strong password (minimum 8 characters with uppercase, lowercase, and a numeral)',
          'Not share credentials with any third party',
          'Immediately notify AllFor1 of any suspected unauthorised access via info@allfor1.pro',
          'Log out from shared or public devices after use',
        ],
      },
      { kind: 'p', text: 'AllFor1 shall not be liable for any loss resulting from your failure to maintain account security.' },
      { kind: 'h3', text: '3.4 Verified Badge' },
      { kind: 'p', text: 'To earn a Verified badge, you must complete email verification, OTP-based phone verification, and provide a complete profile (name, bio, avatar, location, age, and position). AllFor1 may revoke verification status if any information is found to be false or misleading.' },
    ],
  },
  {
    num: '4',
    title: 'User Roles and Platform Features',
    blocks: [
      { kind: 'h3', text: '4.1 Athletes' },
      { kind: 'p', text: 'Athlete accounts enable you to build a public profile showcasing your sport, position, location, height, age, highlight videos, posts, and performance statistics. By registering as an Athlete, you expressly acknowledge and consent that:' },
      {
        kind: 'ul',
        items: [
          'Your profile data will be visible to all registered users of the Platform',
          'Your profile data — including performance metrics, highlight videos, rankings, and contact information — will be shared with scouts, coaches, agents, and recruiters affiliated with verified tournaments on the Platform',
          'Your personal data may be sold to third-party recruitment platforms, analytics firms, advertising networks, and API consumers as described in the Privacy Policy',
          'The Scout Copilot AI feature enables coaches, scouts, and agents to discover your profile through natural-language athlete searches',
        ],
      },
      { kind: 'h3', text: '4.2 Coaches, Scouts, and Agents' },
      { kind: 'p', text: 'These roles grant access to athlete discovery tools including the Explore page, Rankings, Scout Copilot, and direct messaging with athletes and teams. Users in these roles represent and warrant that they are legitimate sports professionals with genuine recruitment or talent development purposes, and agree not to use athlete data for any other purpose.' },
      { kind: 'h3', text: '4.3 Teams and Academies' },
      { kind: 'p', text: 'Team/Academy accounts represent club or organisational entities. These accounts may recruit athletes and connect with coaches, scouts, and agents through the Platform. Team accounts are not required to provide date of birth.' },
    ],
  },
  {
    num: '5',
    title: 'User Content',
    blocks: [
      { kind: 'h3', text: '5.1 Ownership and Licence' },
      { kind: 'p', text: 'You retain ownership of content you create and upload ("User Content"), including posts, photographs, highlight videos, and messages. By uploading User Content to the Platform, you grant AllFor1 a worldwide, non-exclusive, royalty-free, sublicensable, and transferable licence to use, host, reproduce, display, distribute, adapt (for formatting or technical purposes), and make available your User Content for the following purposes:' },
      {
        kind: 'ul',
        items: [
          'Displaying your content to other Platform users',
          'Sharing your content with verified tournament recruiters and scouts',
          'Making your content available to third-party API consumers and data partners',
          'Promotional and marketing materials for AllFor1 and the Platform',
        ],
      },
      { kind: 'h3', text: '5.2 Content Standards' },
      { kind: 'p', text: 'You agree that your User Content shall not:' },
      {
        kind: 'ul',
        items: [
          'Infringe any third-party copyright, trademark, patent, trade secret, privacy, or publicity rights',
          'Contain defamatory, harassing, abusive, discriminatory, or hateful material',
          'Include obscene, sexually explicit, or graphically violent content',
          'Impersonate any person or entity or misrepresent your identity or professional credentials',
          'Constitute spam, unsolicited commercial messages, or malicious code',
          'Violate any provision of the IT Act, 2000, the Indian Penal Code, or any other applicable law',
        ],
      },
      { kind: 'h3', text: '5.3 Content Moderation' },
      { kind: 'p', text: 'AllFor1 reserves the right (but not the obligation) to review, remove, or restrict any User Content that violates these Terms or that we reasonably believe to be harmful to the Platform or its users. As an Intermediary under Section 2(w) of the IT Act, AllFor1 will act on valid takedown notices in compliance with the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 ("Intermediary Guidelines").' },
    ],
  },
  {
    num: '6',
    title: 'Tournaments and Rankings',
    blocks: [
      { kind: 'h3', text: '6.1 Tournament Participation' },
      { kind: 'p', text: 'The Platform provides tournament registration, management, and results tracking. By registering for a tournament, you agree to the rules and terms of the tournament organiser in addition to these Terms. AllFor1 is not responsible for conduct occurring at physical tournament venues.' },
      { kind: 'h3', text: '6.2 Player Rankings' },
      { kind: 'p', text: 'Player rankings are computed based on tournament participation and performance data submitted through the Platform. Rankings are publicly visible on Athlete profiles and may be shared with and sold to third-party recruitment platforms and analytics providers.' },
      { kind: 'h3', text: '6.3 Recruiter Access via Tournaments' },
      { kind: 'p', text: 'Tournament organisers and their affiliated recruitment staff who are verified on the Platform are granted access to Athlete data from their tournaments, including contact details, performance statistics, highlight videos, and profile information. An Athlete’s participation in a verified tournament constitutes explicit consent to this data access and sharing.' },
    ],
  },
  {
    num: '7',
    title: 'Scout Copilot',
    blocks: [
      { kind: 'p', text: 'Scout Copilot is an AI-powered talent discovery tool available to Scout, Coach, Agent, and Team accounts. It enables users to query the Athlete database using natural-language prompts (e.g., "Show me left-arm fast bowlers under 19 in Tamil Nadu with 20+ wickets").' },
      { kind: 'p', text: 'By using Scout Copilot:' },
      {
        kind: 'ul',
        items: [
          'Users in scouting and recruiting roles represent that they are using the feature solely for legitimate talent evaluation purposes',
          'Athletes consent that their data — name, age, location, sport, position, height, statistics, and profile content — may be returned as results of Scout Copilot queries and included in reports delivered to tournament operators and third-party partners',
          'AllFor1 does not guarantee the accuracy, completeness, or timeliness of Scout Copilot results',
          'Users must not use Scout Copilot output to contact athletes for commercial purposes unrelated to sports recruitment',
        ],
      },
    ],
  },
  {
    num: '8',
    title: 'Data Monetisation — Express Consent',
    blocks: [
      { kind: 'p', text: 'In addition to the consents given under the Privacy Policy, by accepting these Terms you expressly and unconditionally consent to the following data monetisation practices of AllFor1:' },
      {
        kind: 'ul',
        items: [
          'Recruiter Data Sharing: AllFor1 shares your profile, performance, and contact data with verified tournament recruiters and their affiliated scouts, coaches, and agents.',
          'Third-Party Data Sale: AllFor1 sells user personal data — including profile information, usage analytics, and content metadata — to advertising networks, API consumers, recruitment technology platforms, and market research firms for commercial consideration.',
          'Targeted Advertising: AllFor1 uses your personal data to serve targeted advertisements on the Platform. Third-party advertisers may receive segmented or anonymised data to facilitate ad targeting.',
          'Commercial API Access: Third parties may access structured user data via AllFor1’s commercial API, which may include athlete profiles, rankings, and event participation records.',
          'Sports Analytics: AllFor1 and its partners analyse user data to generate sports participation insights, talent identification reports, and market analytics products for commercial sale.',
        ],
      },
      { kind: 'callout', text: 'Withdrawal of Consent: You may withdraw consent for data sale by deleting your account or submitting a written withdrawal request to info@allfor1.pro. Withdrawal is effective from the date of receipt and does not affect data already processed or sold before that date. Withdrawal of consent for data sale may limit access to certain Platform features.' },
    ],
  },
  {
    num: '9',
    title: 'Prohibited Conduct',
    blocks: [
      { kind: 'p', text: 'You agree not to use the Platform to:' },
      {
        kind: 'ul',
        items: [
          'Harass, threaten, stalk, or abuse other users in any manner',
          'Create fictitious profiles, impersonate another person, or misrepresent your professional credentials',
          'Scrape, crawl, or use automated tools to extract data from the Platform without prior written authorisation from AllFor1',
          'Attempt to bypass security features, rate limits, authentication controls, or access restricted areas',
          'Upload viruses, malware, spyware, or any code designed to disrupt, damage, or gain unauthorised access',
          'Use athlete contact information obtained through the Platform for purposes other than legitimate sports recruitment or development',
          'Transmit unsolicited commercial messages (spam) or solicit users for commercial purposes unrelated to sports',
          'Engage in match-fixing, doping promotion, or any activity prohibited under Indian sports law or regulations',
          'Violate any applicable provision of Indian law, including the IT Act, the Indian Penal Code, and consumer protection regulations',
        ],
      },
    ],
  },
  {
    num: '10',
    title: 'Intellectual Property',
    blocks: [
      { kind: 'h3', text: '10.1 AllFor1 Intellectual Property' },
      { kind: 'p', text: 'The Platform — including its software, design, branding, logos, features, and compiled content (excluding User Content) — is the exclusive property of The AllFor1 Network and is protected under the Copyright Act, 1957, the Trade Marks Act, 1999, and other applicable Indian intellectual property laws. You may not reproduce, distribute, modify, or create derivative works of Platform materials without our prior written consent.' },
      { kind: 'h3', text: '10.2 Feedback' },
      { kind: 'p', text: 'If you submit suggestions, ideas, or feedback about the Platform, you grant AllFor1 an irrevocable, perpetual, royalty-free licence to use such feedback in any manner and for any purpose without any obligation or compensation to you.' },
    ],
  },
  {
    num: '11',
    title: 'Third-Party Services and Links',
    blocks: [
      { kind: 'p', text: 'The Platform integrates with third-party services including Firebase (Google LLC), Cloudinary, and others. Your use of those services is governed by their respective terms of service and privacy policies. AllFor1 is not responsible for the data practices or conduct of any third-party service provider.' },
    ],
  },
  {
    num: '12',
    title: 'Intermediary Status and Liability',
    blocks: [
      { kind: 'p', text: 'AllFor1 operates as an Intermediary under Section 2(w) of the IT Act. AllFor1 does not initiate the transmission of User Content and does not select or modify the content transmitted by users. AllFor1’s liability for third-party content is limited as provided under Section 79 of the IT Act and the Intermediary Guidelines, 2021.' },
      { kind: 'p', text: 'AllFor1 will respond to valid complaints and takedown notices from users or government authorities within the timelines stipulated by the Intermediary Guidelines.' },
    ],
  },
  {
    num: '13',
    title: 'Termination',
    blocks: [
      { kind: 'h3', text: '13.1 By You' },
      { kind: 'p', text: 'You may terminate your account at any time through Settings > Danger Zone > Delete Account, subject to password re-authentication. Upon deletion, your active profile is removed from production systems within 30 days. Data already sold or shared with third parties prior to deletion is not affected.' },
      { kind: 'h3', text: '13.2 By AllFor1' },
      { kind: 'p', text: 'AllFor1 may suspend or terminate your account, with or without prior notice, for violation of these Terms, fraudulent or abusive activity, harm to other users, or any other reason at AllFor1’s sole discretion. Termination does not affect any rights or obligations accrued before termination.' },
    ],
  },
  {
    num: '14',
    title: 'Disclaimers',
    blocks: [
      { kind: 'caps', text: 'THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. ALLFOR1 DOES NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES. ALLFOR1 DOES NOT WARRANT THE ACCURACY OR COMPLETENESS OF ANY DATA, INCLUDING ATHLETE PROFILES, RANKINGS, OR SCOUT COPILOT RESULTS.' },
    ],
  },
  {
    num: '15',
    title: 'Limitation of Liability',
    blocks: [
      { kind: 'caps', text: 'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE INDIAN LAW, ALLFOR1, ITS DIRECTORS, OFFICERS, EMPLOYEES, AGENTS, AND PARTNERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES — INCLUDING LOSS OF PROFITS, BUSINESS, DATA, OR GOODWILL — ARISING FROM YOUR USE OF OR INABILITY TO USE THE PLATFORM. ALLFOR1’S TOTAL CUMULATIVE LIABILITY TO YOU SHALL NOT EXCEED THE GREATER OF (A) ₹10,000 (INDIAN RUPEES TEN THOUSAND ONLY) OR (B) THE TOTAL FEES, IF ANY, PAID BY YOU TO ALLFOR1 IN THE TWELVE MONTHS PRECEDING THE CLAIM.' },
      { kind: 'p', text: 'Nothing in these Terms limits AllFor1’s liability for death or personal injury caused by negligence, fraud, or any other liability that cannot be excluded under Indian law.' },
    ],
  },
  {
    num: '16',
    title: 'Indemnification',
    blocks: [
      { kind: 'p', text: 'You agree to indemnify, defend, and hold harmless AllFor1 and its affiliates, directors, officers, employees, and agents from and against any claims, demands, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising from: (a) your use of the Platform; (b) your User Content; (c) your violation of these Terms; or (d) your infringement of any third-party right.' },
    ],
  },
  {
    num: '17',
    title: 'Governing Law and Dispute Resolution',
    blocks: [
      { kind: 'p', text: 'These Terms are governed by and construed in accordance with the laws of the Republic of India, without reference to conflict-of-law principles.' },
      { kind: 'p', text: 'In the event of any dispute arising out of or relating to these Terms or the Platform, the parties shall first attempt to resolve the dispute amicably through negotiation. If the dispute is not resolved within 30 days of a written notice, it shall be referred to binding arbitration under the Arbitration and Conciliation Act, 1996, as amended. The seat and venue of arbitration shall be Mumbai, India. The arbitration shall be conducted in English by a sole arbitrator mutually agreed upon by the parties.' },
      { kind: 'p', text: 'Notwithstanding the above, either party may approach a court of competent jurisdiction in Mumbai, India, for urgent interim relief. The parties agree that the courts at Mumbai shall have exclusive jurisdiction over any matters not subject to arbitration under these Terms.' },
    ],
  },
  {
    num: '18',
    title: 'Grievance Redressal',
    blocks: [
      { kind: 'p', text: 'In accordance with the IT Act and the Intermediary Guidelines, AllFor1 has designated a Grievance Officer to receive and address complaints from users regarding the Platform, User Content, or data processing. Complaints are acknowledged within 24 hours and resolved within 15 days of receipt.' },
      {
        kind: 'kv',
        rows: [
          { label: 'Grievance Officer', value: 'The AllFor1 Network' },
          { label: 'Email', value: 'info@allfor1.pro', href: 'mailto:info@allfor1.pro' },
        ],
      },
      { kind: 'p', text: 'For queries about these Terms, you may also contact info@allfor1.pro.' },
    ],
  },
  {
    num: '19',
    title: 'Changes to These Terms',
    blocks: [
      { kind: 'p', text: 'AllFor1 reserves the right to modify these Terms at any time. We will provide at least 7 days’ prior notice of material changes by posting an announcement on the Platform or emailing your registered address. Continued use of the Platform after the revised Terms take effect constitutes acceptance. If you do not agree to the revised Terms, you must stop using the Platform and delete your account.' },
    ],
  },
  {
    num: '20',
    title: 'Severability and Entire Agreement',
    blocks: [
      { kind: 'p', text: 'If any provision of these Terms is found to be unenforceable by a competent authority, that provision shall be modified to the minimum extent necessary to render it enforceable, and the remaining provisions shall continue in full force and effect. These Terms, together with the Privacy Policy, constitute the entire agreement between you and AllFor1 with respect to the Platform and supersede all prior understandings on the same subject.' },
    ],
  },
];

export default function Terms() {
  return (
    <LegalDoc
      eyebrow="The AllFor1 Network · Legal"
      title="Terms & Conditions"
      effectiveDate="30 April 2026"
      jurisdiction="Republic of India"
      intro={INTRO}
      sections={SECTIONS}
    />
  );
}

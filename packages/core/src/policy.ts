// Canonical, versioned facts about the legal documents. One source of truth so the
// on-page text, the SEO prerender, and the server's acceptance records can never
// disagree about which version is live or who the Data Fiduciary is. Bump
// POLICY_VERSION (and the dates) on every published revision — the server stamps
// each acceptance with POLICY_VERSION, so a bump is what makes existing users see
// the notify-and-acknowledge prompt on next login.

/** Version identifier stored against every acceptance. Use the effective date. */
export const POLICY_VERSION = '2026-08-24';

/** Human-readable effective date shown at the top of each document. Set at least
 *  seven days ahead of publication — both documents promise 7 days' notice of
 *  material changes (Privacy s.12 / Terms s.19). */
export const POLICY_EFFECTIVE_DATE = '24 August 2026';

/** The version these documents supersede (the previously-live revision). */
export const POLICY_SUPERSEDES_DATE = '30 April 2026';

/** The registered company that is the Data Fiduciary under the DPDP Act — the
 *  contracting legal entity, not the trading name. Exact registered name. */
export const DATA_FIDUCIARY_LEGAL_NAME = 'ALLFORONE SPORTS TECHNOLOGIES PRIVATE LIMITED';

/** The named Grievance Officer and registered address published in both documents,
 *  as required by SPDI Rule 5(9) and expected under DPDP s.13. */
export const GRIEVANCE_OFFICER_NAME = 'Mann Agarwal';
export const GRIEVANCE_OFFICER_TITLE = 'Director';
export const GRIEVANCE_OFFICER_ADDRESS =
  'House No M-229/12(5), C-6/S-1, Milroc Woods, Corlim, Corlim IE, Tiswadi, North Goa 403110, Goa';
export const CONTACT_EMAIL = 'info@allfor1.pro';

/** The exact statement a parent/legal guardian agrees to when consenting on behalf
 *  of an under-18 (DPDP Act s.9). Stored verbatim with each guardian acceptance so
 *  the chain of consent — who, when, which version, exact words — is auditable, as
 *  the Privacy Policy s.9.1 promises. */
export const GUARDIAN_CONSENT_STATEMENT =
  'I confirm that I am the parent or legal guardian of this athlete, and that I have ' +
  'reviewed and accept the All For 1 Terms & Conditions and Privacy Policy on their ' +
  `behalf (version ${POLICY_VERSION}), providing verifiable consent under Section 9 of ` +
  'the Digital Personal Data Protection Act, 2023 to the processing of their personal ' +
  'data as described therein.';

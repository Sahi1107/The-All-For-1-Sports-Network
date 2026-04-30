import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import logoUrl from '../assets/logo.svg';
import './landing.css';

export default function Terms() {
  return (
    <div className="landing-root" style={{ minHeight: '100vh', paddingBottom: 0 }}>
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'rgba(15, 18, 46, 0.85)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          maxWidth: '100%',
        }}
      >
        <Link to="/" className="l-btn l-btn--outline" style={{ padding: '8px 16px' }}>
          <ArrowLeft size={16} /> Back
        </Link>
        <img src={logoUrl} alt="All For 1" style={{ height: 44 }} />
        <Link to="/login" className="l-btn l-btn--primary" style={{ padding: '8px 16px' }}>Sign In</Link>
      </header>

      <main
        style={{
          maxWidth: 880, margin: '60px auto 80px', padding: '0 24px',
          color: 'rgba(255, 255, 255, 0.88)',
        }}
      >
        <span className="l-section__eyebrow">Legal</span>
        <h1 style={{ color: '#d7ff5a', fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, margin: '8px 0 8px' }}>
          Terms &amp; Conditions
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: 36 }}>
          Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <Section title="1. Acceptance of Terms">
          By accessing or using the All For One Network (&ldquo;Service&rdquo;), you agree to be
          bound by these Terms &amp; Conditions. If you do not agree, you must not use the Service.
        </Section>

        <Section title="2. Eligibility">
          You must be at least 13 years of age to use the Service. If you are under 18, you
          confirm that a parent or legal guardian has reviewed and accepted these terms on your
          behalf.
        </Section>

        <Section title="3. Account Registration">
          You agree to provide accurate, current, and complete information during registration
          and to keep your account information updated. You are responsible for safeguarding
          your password and for all activity under your account.
        </Section>

        <Section title="4. Performance &amp; Rankings">
          Player rankings, tournament results, and statistical data are computed from
          performance information submitted to the platform. While we take reasonable measures
          to verify data, All For One does not guarantee absolute accuracy and reserves the
          right to adjust, correct, or remove rankings at its discretion.
        </Section>

        <Section title="5. User Conduct">
          You agree not to misuse the Service. Prohibited conduct includes (but is not limited
          to): submitting false performance data, harassing other users, impersonating any
          person, attempting to gain unauthorized access, or using the Service for any
          unlawful purpose.
        </Section>

        <Section title="6. Content Ownership">
          You retain ownership of content you upload (images, profile information, posts).
          By uploading, you grant All For One a worldwide, non-exclusive, royalty-free license
          to host, display, and distribute that content as part of operating the Service.
        </Section>

        <Section title="7. Intellectual Property">
          All trademarks, logos, ranking algorithms, and platform code are the property of
          All For One Network and may not be reproduced without written consent.
        </Section>

        <Section title="8. Termination">
          We may suspend or terminate your access to the Service at any time, with or without
          notice, for conduct that violates these terms or is otherwise harmful to other users
          or to the platform.
        </Section>

        <Section title="9. Disclaimers">
          The Service is provided &ldquo;as is&rdquo; without warranty of any kind. To the
          maximum extent permitted by law, All For One disclaims all warranties, express or
          implied, including merchantability, fitness for a particular purpose, and
          non-infringement.
        </Section>

        <Section title="10. Limitation of Liability">
          In no event will All For One Network be liable for any indirect, incidental,
          special, or consequential damages arising out of or in connection with your use of
          the Service.
        </Section>

        <Section title="11. Changes to These Terms">
          We may update these Terms &amp; Conditions from time to time. Continued use of the
          Service after changes constitutes acceptance of the updated terms.
        </Section>

        <Section title="12. Contact">
          Questions about these terms? Reach out to <a href="mailto:hello@allfor1.network" style={{ color: '#d7ff5a' }}>hello@allfor1.network</a>.
        </Section>
      </main>

      <footer className="l-footer">
        <div className="l-footer__bar" style={{ marginTop: 0, borderTop: 'none' }}>
          <span>&copy; {new Date().getFullYear()} All For One Network. All rights reserved.</span>
          <span>
            <Link to="/terms" style={{ color: 'inherit', marginRight: 16 }}>Terms</Link>
            <Link to="/privacy" style={{ color: 'inherit' }}>Privacy</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ color: '#d7ff5a', fontSize: '1.2rem', fontWeight: 700, marginBottom: 10 }}>{title}</h2>
      <p style={{ lineHeight: 1.75, fontSize: '0.98rem', color: 'rgba(255, 255, 255, 0.85)' }}>{children}</p>
    </section>
  );
}

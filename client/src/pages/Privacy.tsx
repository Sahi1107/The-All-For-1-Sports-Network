import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import logoUrl from '../assets/logo.svg';
import './landing.css';

export default function Privacy() {
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
          Privacy Policy
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: 36 }}>
          Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <Section title="1. Introduction">
          All For One Network (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is committed to protecting your
          privacy. This Privacy Policy explains how we collect, use, store, and disclose
          information when you use our platform.
        </Section>

        <Section title="2. Information We Collect">
          <ul style={listStyle}>
            <li><strong>Account information:</strong> name, email, phone, date of birth, role (athlete, coach, scout, team, agent).</li>
            <li><strong>Profile data:</strong> sport, position, age, height, location, bio, profile photo.</li>
            <li><strong>Performance data:</strong> stats, match results, tournament participation.</li>
            <li><strong>Usage data:</strong> device, browser, IP address, and basic interaction analytics.</li>
          </ul>
        </Section>

        <Section title="3. How We Use Information">
          <ul style={listStyle}>
            <li>To create and operate your account on the Service.</li>
            <li>To compute and display rankings and tournament results.</li>
            <li>To enable communication between athletes, coaches, scouts, and teams.</li>
            <li>To improve the platform, debug issues, and detect abuse.</li>
            <li>To send transactional and product updates via email or push notifications.</li>
          </ul>
        </Section>

        <Section title="4. Sharing of Information">
          We do not sell personal information. We share information only with: (a) service
          providers who help us operate the Service (e.g., authentication, hosting, analytics);
          (b) other users, where necessary to display public profile and ranking data; and
          (c) law enforcement, when required by law.
        </Section>

        <Section title="5. Data Storage &amp; Security">
          Information is stored on secure cloud infrastructure. We use industry-standard
          measures including encryption in transit and access controls. No system is fully
          impervious; please use a strong, unique password.
        </Section>

        <Section title="6. Your Rights">
          Subject to applicable law, you may request access to, correction of, or deletion of
          your personal information. You may also request that we restrict or stop processing
          your data. Contact us at the email below to exercise these rights.
        </Section>

        <Section title="7. Children's Privacy">
          The Service is not directed to children under 13. We do not knowingly collect
          personal information from children under 13 without verifiable parental consent.
        </Section>

        <Section title="8. Cookies &amp; Tracking">
          We use cookies and similar technologies for authentication, preferences, and basic
          analytics. You can control cookies through your browser settings, but some parts of
          the Service may not function properly without them.
        </Section>

        <Section title="9. International Users">
          The Service is operated from India. By using the Service from outside India, you
          consent to your data being transferred to and processed in India in accordance with
          this policy.
        </Section>

        <Section title="10. Changes to This Policy">
          We may update this Privacy Policy from time to time. We will indicate the date of
          the latest update at the top of this page. Continued use of the Service after
          changes means you accept the updated policy.
        </Section>

        <Section title="11. Contact">
          For privacy questions or requests, email <a href="mailto:hello@allfor1.network" style={{ color: '#d7ff5a' }}>hello@allfor1.network</a>.
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

const listStyle: React.CSSProperties = {
  margin: '8px 0 0',
  paddingLeft: 22,
  lineHeight: 1.85,
  color: 'rgba(255, 255, 255, 0.85)',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ color: '#d7ff5a', fontSize: '1.2rem', fontWeight: 700, marginBottom: 10 }}>{title}</h2>
      <div style={{ lineHeight: 1.75, fontSize: '0.98rem', color: 'rgba(255, 255, 255, 0.85)' }}>{children}</div>
    </section>
  );
}

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import logoUrl from '../../assets/logo.svg';
import '../landing.css';
import './legal.css';

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'callout'; text: string }
  | { kind: 'caps'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'h3'; text: string }
  | { kind: 'kv'; rows: { label: string; value: string; href?: string }[] };

export interface Section {
  num: string;
  title: string;
  blocks: Block[];
}

interface LegalDocProps {
  eyebrow: string;
  title: string;
  effectiveDate: string;
  jurisdiction: string;
  intro: Block[];
  sections: Section[];
}

export default function LegalDoc({
  eyebrow,
  title,
  effectiveDate,
  jurisdiction,
  intro,
  sections,
}: LegalDocProps) {
  return (
    <div className="landing-root legal-root">
      <header className="legal-header">
        <Link to="/" className="l-btn l-btn--outline legal-header__btn">
          <ArrowLeft size={16} /> Back
        </Link>
        <Link to="/" aria-label="All For 1 — home">
          <img src={logoUrl} alt="All For 1" className="legal-header__logo" />
        </Link>
        <Link to="/login" className="l-btn l-btn--primary legal-header__btn">Sign In</Link>
      </header>

      <main className="legal-main">
        <span className="l-section__eyebrow">{eyebrow}</span>
        <h1 className="legal-title">{title}</h1>
        <p className="legal-meta">
          <span><strong>Effective:</strong> {effectiveDate}</span>
          <span className="legal-meta__sep">·</span>
          <span><strong>Jurisdiction:</strong> {jurisdiction}</span>
        </p>

        {intro.length > 0 && (
          <section className="legal-intro">
            {intro.map((b, i) => renderBlock(b, i))}
          </section>
        )}

        {sections.map((s) => (
          <section key={s.num} className="legal-section">
            <h2 className="legal-section__title">
              <span className="legal-section__num">{s.num}.</span> {s.title}
            </h2>
            {s.blocks.map((b, i) => renderBlock(b, i))}
          </section>
        ))}
      </main>

      <footer className="l-footer">
        <div className="l-footer__bar" style={{ marginTop: 0, borderTop: 'none' }}>
          <span>&copy; {new Date().getFullYear()} The AllFor1 Network. All rights reserved.</span>
          <span>
            <Link to="/terms" style={{ color: 'inherit', marginRight: 16 }}>Terms</Link>
            <Link to="/privacy" style={{ color: 'inherit' }}>Privacy</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

function renderBlock(b: Block, i: number) {
  switch (b.kind) {
    case 'p':
      return <p key={i} className="legal-p">{b.text}</p>;
    case 'callout':
      return <p key={i} className="legal-callout">{b.text}</p>;
    case 'caps':
      return <p key={i} className="legal-caps">{b.text}</p>;
    case 'ul':
      return (
        <ul key={i} className="legal-ul">
          {b.items.map((it, j) => <li key={j}>{it}</li>)}
        </ul>
      );
    case 'h3':
      return <h3 key={i} className="legal-h3">{b.text}</h3>;
    case 'kv':
      return (
        <dl key={i} className="legal-kv">
          {b.rows.map((row, j) => (
            <div key={j} className="legal-kv__row">
              <dt>{row.label}</dt>
              <dd>
                {row.href
                  ? <a href={row.href}>{row.value}</a>
                  : row.value}
              </dd>
            </div>
          ))}
        </dl>
      );
  }
}

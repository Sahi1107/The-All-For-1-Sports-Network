// Sport line-art "brand device" watermarks for the SSR profile hero — ported
// verbatim from the app's client/src/components/SportBackdrop.tsx so the public
// page reads as the same product. Plain SVG strings (no React); drawn in white
// at low opacity to sit behind the dark hero. Weightlifting uses an inline
// barbell (the app's silhouette asset isn't URL-reachable from allfor1-web).
const G = 'stroke="white" fill="none"';

const BACKDROPS: Record<string, string> = {
  BASKETBALL: `<svg viewBox="0 0 940 520" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.8" opacity="0.18">
    <rect x="20" y="20" width="900" height="480"/><line x1="470" y1="20" x2="470" y2="500"/><circle cx="470" cy="260" r="57"/>
    <line x1="58" y1="231" x2="58" y2="289" stroke-width="3.5"/><circle cx="70" cy="260" r="10"/><rect x="20" y="183" width="182" height="154"/>
    <path d="M202,203 A57,57 0 0 1 202,317"/><path d="M202,203 A57,57 0 0 0 202,317" stroke-dasharray="5 4"/>
    <line x1="20" y1="49" x2="154" y2="49"/><line x1="20" y1="471" x2="154" y2="471"/><path d="M154,49 A227,227 0 0 1 154,471"/>
    <line x1="882" y1="231" x2="882" y2="289" stroke-width="3.5"/><circle cx="870" cy="260" r="10"/><rect x="738" y="183" width="182" height="154"/>
    <path d="M738,203 A57,57 0 0 0 738,317"/><path d="M738,203 A57,57 0 0 1 738,317" stroke-dasharray="5 4"/>
    <line x1="786" y1="49" x2="920" y2="49"/><line x1="786" y1="471" x2="920" y2="471"/><path d="M786,49 A227,227 0 0 0 786,471"/></g></svg>`,
  FOOTBALL: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.5" opacity="0.18">
    <rect x="30" y="30" width="740" height="440"/><line x1="400" y1="30" x2="400" y2="470"/><circle cx="400" cy="250" r="65"/><circle cx="400" cy="250" r="4" fill="white" stroke="none"/>
    <rect x="30" y="120" width="116" height="260"/><rect x="30" y="191" width="39" height="118"/><path d="M146,197 A65,65 0 0 1 146,303"/>
    <rect x="654" y="120" width="116" height="260"/><rect x="731" y="191" width="39" height="118"/><path d="M654,197 A65,65 0 0 0 654,303"/></g></svg>`,
  CRICKET: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.8" opacity="0.18">
    <ellipse cx="400" cy="250" rx="362" ry="228"/><ellipse cx="400" cy="250" rx="192" ry="170"/><rect x="311" y="239" width="178" height="22" fill="white" fill-opacity="0.09" stroke-width="1.2"/>
    <line x1="326" y1="207" x2="326" y2="293"/><line x1="474" y1="207" x2="474" y2="293"/></g></svg>`,
  FIELD_HOCKEY: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.6" opacity="0.18">
    <rect x="30" y="30" width="740" height="440"/><line x1="400" y1="30" x2="400" y2="470"/><line x1="190" y1="30" x2="190" y2="470" stroke-dasharray="6 4"/><line x1="610" y1="30" x2="610" y2="470" stroke-dasharray="6 4"/>
    <path d="M30,160 A140,140 0 0 1 30,340"/><path d="M770,160 A140,140 0 0 0 770,340"/></g></svg>`,
  BADMINTON: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.6" opacity="0.18">
    <rect x="30" y="30" width="740" height="440"/><line x1="400" y1="30" x2="400" y2="470" stroke-width="2.5"/><line x1="30" y1="60" x2="770" y2="60"/><line x1="30" y1="440" x2="770" y2="440"/>
    <line x1="290" y1="30" x2="290" y2="470"/><line x1="510" y1="30" x2="510" y2="470"/><line x1="80" y1="30" x2="80" y2="470"/><line x1="720" y1="30" x2="720" y2="470"/></g></svg>`,
  ATHLETICS: `<svg viewBox="0 0 940 520" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.6" opacity="0.18">
    <ellipse cx="470" cy="260" rx="430" ry="220"/><ellipse cx="470" cy="260" rx="380" ry="170"/><ellipse cx="470" cy="260" rx="420" ry="210" stroke-dasharray="8 6"/><ellipse cx="470" cy="260" rx="410" ry="200" stroke-dasharray="8 6"/>
    <ellipse cx="470" cy="260" rx="400" ry="190" stroke-dasharray="8 6"/><ellipse cx="470" cy="260" rx="390" ry="180" stroke-dasharray="8 6"/></g></svg>`,
  WRESTLING: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.6" opacity="0.18">
    <rect x="20" y="20" width="760" height="460"/><circle cx="400" cy="250" r="225"/><circle cx="400" cy="250" r="200"/><circle cx="400" cy="250" r="165" stroke-dasharray="6 5"/><circle cx="400" cy="250" r="45" stroke-width="2"/></g></svg>`,
  BOXING: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.6" opacity="0.18">
    <path d="M 60 460 L 740 460 L 560 240 L 240 240 Z"/><line x1="60" y1="460" x2="60" y2="200" stroke-width="2.5"/><line x1="740" y1="460" x2="740" y2="200" stroke-width="2.5"/>
    <line x1="240" y1="240" x2="240" y2="135" stroke-width="2"/><line x1="560" y1="240" x2="560" y2="135" stroke-width="2"/>
    <line x1="60" y1="245" x2="240" y2="200"/><line x1="60" y1="285" x2="240" y2="215"/><line x1="740" y1="245" x2="560" y2="200"/><line x1="740" y1="285" x2="560" y2="215"/>
    <line x1="240" y1="200" x2="560" y2="200"/><line x1="240" y1="215" x2="560" y2="215"/></g></svg>`,
  SHOOTING: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.6" opacity="0.18">
    <rect x="170" y="20" width="460" height="460"/><circle cx="400" cy="250" r="220"/><circle cx="400" cy="250" r="180"/><circle cx="400" cy="250" r="140"/><circle cx="400" cy="250" r="100"/><circle cx="400" cy="250" r="60"/><circle cx="400" cy="250" r="22"/>
    <line x1="400" y1="20" x2="400" y2="480" stroke-dasharray="5 4" stroke-width="1"/><line x1="170" y1="250" x2="630" y2="250" stroke-dasharray="5 4" stroke-width="1"/></g></svg>`,
  WEIGHTLIFTING: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="2" opacity="0.18">
    <line x1="150" y1="250" x2="650" y2="250" stroke-width="6"/><circle cx="205" cy="250" r="70"/><circle cx="205" cy="250" r="48"/><circle cx="165" cy="250" r="86"/>
    <circle cx="595" cy="250" r="70"/><circle cx="595" cy="250" r="48"/><circle cx="635" cy="250" r="86"/></g></svg>`,
  ARCHERY: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.8" opacity="0.18">
    <circle cx="400" cy="250" r="220"/><circle cx="400" cy="250" r="176"/><circle cx="400" cy="250" r="132"/><circle cx="400" cy="250" r="88"/><circle cx="400" cy="250" r="44"/>
    <line x1="392" y1="242" x2="408" y2="258" stroke-width="2"/><line x1="408" y1="242" x2="392" y2="258" stroke-width="2"/></g></svg>`,
  TENNIS: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.6" opacity="0.18">
    <rect x="30" y="30" width="740" height="440"/><line x1="30" y1="80" x2="770" y2="80"/><line x1="30" y1="420" x2="770" y2="420"/><line x1="400" y1="30" x2="400" y2="470" stroke-width="2.5"/>
    <line x1="200" y1="80" x2="200" y2="420"/><line x1="600" y1="80" x2="600" y2="420"/><line x1="200" y1="250" x2="600" y2="250"/></g></svg>`,
  TABLE_TENNIS: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.8" opacity="0.18">
    <rect x="40" y="40" width="720" height="420" stroke-width="3"/><line x1="400" y1="40" x2="400" y2="460"/><line x1="40" y1="250" x2="760" y2="250" stroke-width="2.5"/></g></svg>`,
  RUGBY: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.6" opacity="0.18">
    <rect x="30" y="30" width="740" height="440"/><line x1="130" y1="30" x2="130" y2="470" stroke-width="2.2"/><line x1="670" y1="30" x2="670" y2="470" stroke-width="2.2"/><line x1="400" y1="30" x2="400" y2="470"/>
    <line x1="225" y1="30" x2="225" y2="470"/><line x1="575" y1="30" x2="575" y2="470"/><line x1="312" y1="30" x2="312" y2="470" stroke-dasharray="6 5"/><line x1="488" y1="30" x2="488" y2="470" stroke-dasharray="6 5"/></g></svg>`,
  SWIMMING: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.6" opacity="0.18">
    <rect x="30" y="30" width="740" height="440"/><line x1="30" y1="85" x2="770" y2="85"/><line x1="30" y1="140" x2="770" y2="140"/><line x1="30" y1="195" x2="770" y2="195"/><line x1="30" y1="250" x2="770" y2="250" stroke-width="2.2"/>
    <line x1="30" y1="305" x2="770" y2="305"/><line x1="30" y1="360" x2="770" y2="360"/><line x1="30" y1="415" x2="770" y2="415"/>
    <line x1="105" y1="30" x2="105" y2="470" stroke-dasharray="4 4" stroke-width="1.2"/><line x1="695" y1="30" x2="695" y2="470" stroke-dasharray="4 4" stroke-width="1.2"/></g></svg>`,
  VOLLEYBALL: `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><g ${G} stroke-width="1.6" opacity="0.18">
    <rect x="30" y="30" width="740" height="440"/><line x1="400" y1="10" x2="400" y2="490" stroke-width="2.5"/><line x1="277" y1="30" x2="277" y2="470"/><line x1="523" y1="30" x2="523" y2="470"/></g></svg>`,
};

/** SVG string for a sport's hero watermark, or '' if the sport is unknown. */
export function sportBackdropSvg(sport: string | null | undefined): string {
  return (sport && BACKDROPS[sport]) || '';
}

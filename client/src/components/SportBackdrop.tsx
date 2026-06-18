import weightlifterSilhouetteUrl from '../assets/weightlifter-silhouette.svg';

/* Sport-specific line-art "brand device" backdrops. Drawn in white so they sit
   behind dark surfaces; the [data-theme="light"] override in index.css (scoped
   to the .sport-backdrop wrapper) recolors the strokes for light mode. Shared by
   the Home feed watermark and the Rankings performance cards. */

function BasketballBackdrop() {
  return (
    <svg viewBox="0 0 940 520" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.8" opacity="0.18">
        <rect x="20" y="20" width="900" height="480" />
        <line x1="470" y1="20" x2="470" y2="500" />
        <circle cx="470" cy="260" r="57" />
        <line x1="58" y1="231" x2="58" y2="289" strokeWidth="3.5" />
        <circle cx="70" cy="260" r="10" />
        <rect x="20" y="183" width="182" height="154" />
        <line x1="63"  y1="183" x2="63"  y2="171" />
        <line x1="90"  y1="183" x2="90"  y2="171" />
        <line x1="130" y1="183" x2="130" y2="171" />
        <line x1="157" y1="183" x2="157" y2="171" />
        <line x1="63"  y1="337" x2="63"  y2="349" />
        <line x1="90"  y1="337" x2="90"  y2="349" />
        <line x1="130" y1="337" x2="130" y2="349" />
        <line x1="157" y1="337" x2="157" y2="349" />
        <path d="M202,203 A57,57 0 0 1 202,317" />
        <path d="M202,203 A57,57 0 0 0 202,317" strokeDasharray="5 4" />
        <line x1="20"  y1="49"  x2="154" y2="49"  />
        <line x1="20"  y1="471" x2="154" y2="471" />
        <path d="M154,49 A227,227 0 0 1 154,471" />
        <path d="M70,222 A38,38 0 0 1 70,298" strokeDasharray="4 3" />
        <line x1="882" y1="231" x2="882" y2="289" strokeWidth="3.5" />
        <circle cx="870" cy="260" r="10" />
        <rect x="738" y="183" width="182" height="154" />
        <line x1="877" y1="183" x2="877" y2="171" />
        <line x1="850" y1="183" x2="850" y2="171" />
        <line x1="810" y1="183" x2="810" y2="171" />
        <line x1="783" y1="183" x2="783" y2="171" />
        <line x1="877" y1="337" x2="877" y2="349" />
        <line x1="850" y1="337" x2="850" y2="349" />
        <line x1="810" y1="337" x2="810" y2="349" />
        <line x1="783" y1="337" x2="783" y2="349" />
        <path d="M738,203 A57,57 0 0 0 738,317" />
        <path d="M738,203 A57,57 0 0 1 738,317" strokeDasharray="5 4" />
        <line x1="786" y1="49"  x2="920" y2="49"  />
        <line x1="786" y1="471" x2="920" y2="471" />
        <path d="M786,49 A227,227 0 0 0 786,471" />
        <path d="M870,222 A38,38 0 0 0 870,298" strokeDasharray="4 3" />
      </g>
    </svg>
  );
}

function FootballBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.5" opacity="0.18">
        <rect x="30" y="30" width="740" height="440" />
        <line x1="400" y1="30" x2="400" y2="470" />
        <circle cx="400" cy="250" r="65" />
        <circle cx="400" cy="250" r="4" fill="white" stroke="none" />
        <rect x="30" y="120" width="116" height="260" />
        <rect x="30" y="191" width="39" height="118" />
        <rect x="10" y="221" width="20" height="58" />
        <circle cx="108" cy="250" r="3" fill="white" stroke="none" />
        <path d="M146,197 A65,65 0 0 1 146,303" />
        <rect x="654" y="120" width="116" height="260" />
        <rect x="731" y="191" width="39" height="118" />
        <rect x="770" y="221" width="20" height="58" />
        <circle cx="692" cy="250" r="3" fill="white" stroke="none" />
        <path d="M654,197 A65,65 0 0 0 654,303" />
        <path d="M30,50 Q30,30 50,30" />
        <path d="M750,30 Q770,30 770,50" />
        <path d="M770,450 Q770,470 750,470" />
        <path d="M50,470 Q30,470 30,450" />
      </g>
    </svg>
  );
}

function CricketBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.8" opacity="0.18">
        <ellipse cx="400" cy="250" rx="362" ry="228" />
        <ellipse cx="400" cy="250" rx="192" ry="170" />
        <rect x="311" y="239" width="178" height="22" fill="white" fillOpacity="0.09" strokeWidth="1.2" />
        <line x1="311" y1="224" x2="311" y2="276" />
        <line x1="326" y1="207" x2="326" y2="293" />
        <line x1="296" y1="224" x2="326" y2="224" />
        <line x1="296" y1="276" x2="326" y2="276" />
        <circle cx="315" cy="243" r="3" fill="white" stroke="none" />
        <circle cx="315" cy="250" r="3" fill="white" stroke="none" />
        <circle cx="315" cy="257" r="3" fill="white" stroke="none" />
        <line x1="489" y1="224" x2="489" y2="276" />
        <line x1="474" y1="207" x2="474" y2="293" />
        <line x1="474" y1="224" x2="504" y2="224" />
        <line x1="474" y1="276" x2="504" y2="276" />
        <circle cx="485" cy="243" r="3" fill="white" stroke="none" />
        <circle cx="485" cy="250" r="3" fill="white" stroke="none" />
        <circle cx="485" cy="257" r="3" fill="white" stroke="none" />
      </g>
    </svg>
  );
}

function FieldHockeyBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        <rect x="30" y="30" width="740" height="440" />
        <line x1="400" y1="30" x2="400" y2="470" />
        <line x1="190" y1="30" x2="190" y2="470" strokeDasharray="6 4" />
        <line x1="610" y1="30" x2="610" y2="470" strokeDasharray="6 4" />
        <path d="M30,160 A140,140 0 0 1 30,340" />
        <path d="M770,160 A140,140 0 0 0 770,340" />
        <rect x="15" y="225" width="15" height="50" />
        <rect x="770" y="225" width="15" height="50" />
        <circle cx="120" cy="250" r="3" fill="white" stroke="none" />
        <circle cx="680" cy="250" r="3" fill="white" stroke="none" />
      </g>
    </svg>
  );
}

function BadmintonBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        <rect x="30" y="30" width="740" height="440" />
        <line x1="400" y1="30" x2="400" y2="470" strokeWidth="2.5" />
        <line x1="30" y1="60" x2="770" y2="60" />
        <line x1="30" y1="440" x2="770" y2="440" />
        <line x1="290" y1="30" x2="290" y2="470" />
        <line x1="510" y1="30" x2="510" y2="470" />
        <line x1="80" y1="30" x2="80" y2="470" />
        <line x1="720" y1="30" x2="720" y2="470" />
        <line x1="80" y1="250" x2="290" y2="250" />
        <line x1="510" y1="250" x2="720" y2="250" />
      </g>
    </svg>
  );
}

function AthleticsBackdrop() {
  return (
    <svg viewBox="0 0 940 520" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        <ellipse cx="470" cy="260" rx="430" ry="220" />
        <ellipse cx="470" cy="260" rx="380" ry="170" />
        <ellipse cx="470" cy="260" rx="420" ry="210" strokeDasharray="8 6" />
        <ellipse cx="470" cy="260" rx="410" ry="200" strokeDasharray="8 6" />
        <ellipse cx="470" cy="260" rx="400" ry="190" strokeDasharray="8 6" />
        <ellipse cx="470" cy="260" rx="390" ry="180" strokeDasharray="8 6" />
        <line x1="470" y1="40" x2="470" y2="90" strokeWidth="3" />
      </g>
    </svg>
  );
}

function WrestlingBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        <rect x="20" y="20" width="760" height="460" />
        <circle cx="400" cy="250" r="225" />
        <circle cx="400" cy="250" r="200" />
        <circle cx="400" cy="250" r="165" strokeDasharray="6 5" />
        <circle cx="400" cy="250" r="45" strokeWidth="2" />
        <circle cx="400" cy="250" r="4" fill="white" stroke="none" />
      </g>
    </svg>
  );
}

function BoxingBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        {/* Ring floor in perspective (trapezoid) */}
        <path d="M 60 460 L 740 460 L 560 240 L 240 240 Z" />
        {/* Front posts */}
        <line x1="60" y1="460" x2="60" y2="200" strokeWidth="2.5" />
        <line x1="740" y1="460" x2="740" y2="200" strokeWidth="2.5" />
        {/* Back posts */}
        <line x1="240" y1="240" x2="240" y2="135" strokeWidth="2" />
        <line x1="560" y1="240" x2="560" y2="135" strokeWidth="2" />
        {/* Back corner pads */}
        <rect x="232" y="125" width="16" height="22" />
        <rect x="552" y="125" width="16" height="22" />
        {/* Side ropes — three rows fanning back into perspective */}
        <line x1="60" y1="245" x2="240" y2="200" />
        <line x1="60" y1="285" x2="240" y2="215" />
        <line x1="60" y1="325" x2="240" y2="230" />
        <line x1="740" y1="245" x2="560" y2="200" />
        <line x1="740" y1="285" x2="560" y2="215" />
        <line x1="740" y1="325" x2="560" y2="230" />
        {/* Back ropes */}
        <line x1="240" y1="200" x2="560" y2="200" />
        <line x1="240" y1="215" x2="560" y2="215" />
        <line x1="240" y1="230" x2="560" y2="230" />
        {/* Center back pad */}
        <rect x="378" y="178" width="44" height="52" />
        <line x1="378" y1="195" x2="422" y2="195" />
        <line x1="378" y1="212" x2="422" y2="212" />
      </g>
    </svg>
  );
}

function ShootingBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        <rect x="170" y="20" width="460" height="460" />
        <circle cx="400" cy="250" r="220" />
        <circle cx="400" cy="250" r="195" />
        <circle cx="400" cy="250" r="170" />
        <circle cx="400" cy="250" r="145" />
        <circle cx="400" cy="250" r="120" />
        <circle cx="400" cy="250" r="95" />
        <circle cx="400" cy="250" r="70" />
        <circle cx="400" cy="250" r="45" />
        <circle cx="400" cy="250" r="22" />
        <line x1="400" y1="20" x2="400" y2="480" strokeDasharray="5 4" strokeWidth="1" />
        <line x1="170" y1="250" x2="630" y2="250" strokeDasharray="5 4" strokeWidth="1" />
        <circle cx="400" cy="250" r="3" fill="white" stroke="none" />
      </g>
    </svg>
  );
}

function WeightliftingBackdrop() {
  return (
    <img
      src={weightlifterSilhouetteUrl}
      alt=""
      className="w-full h-full object-contain opacity-[0.18] scale-[1.15]"
      style={{ filter: 'brightness(0) invert(1)' }}
    />
  );
}

function ArcheryBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.8" opacity="0.18">
        <circle cx="400" cy="250" r="220" />
        <circle cx="400" cy="250" r="198" />
        <circle cx="400" cy="250" r="176" />
        <circle cx="400" cy="250" r="154" />
        <circle cx="400" cy="250" r="132" />
        <circle cx="400" cy="250" r="110" />
        <circle cx="400" cy="250" r="88" />
        <circle cx="400" cy="250" r="66" />
        <circle cx="400" cy="250" r="44" />
        <circle cx="400" cy="250" r="22" />
        <line x1="392" y1="242" x2="408" y2="258" strokeWidth="2" />
        <line x1="408" y1="242" x2="392" y2="258" strokeWidth="2" />
      </g>
    </svg>
  );
}

function TennisBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        <rect x="30" y="30" width="740" height="440" />
        <line x1="30" y1="80" x2="770" y2="80" />
        <line x1="30" y1="420" x2="770" y2="420" />
        <line x1="400" y1="30" x2="400" y2="470" strokeWidth="2.5" />
        <line x1="200" y1="80" x2="200" y2="420" />
        <line x1="600" y1="80" x2="600" y2="420" />
        <line x1="200" y1="250" x2="600" y2="250" />
        <line x1="395" y1="80" x2="405" y2="80" strokeWidth="3" />
        <line x1="395" y1="420" x2="405" y2="420" strokeWidth="3" />
      </g>
    </svg>
  );
}

function RugbyBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        {/* Touchlines + dead-ball lines */}
        <rect x="30" y="30" width="740" height="440" />
        {/* Try lines */}
        <line x1="130" y1="30" x2="130" y2="470" strokeWidth="2.2" />
        <line x1="670" y1="30" x2="670" y2="470" strokeWidth="2.2" />
        {/* Halfway line */}
        <line x1="400" y1="30" x2="400" y2="470" />
        {/* 22m lines */}
        <line x1="225" y1="30" x2="225" y2="470" />
        <line x1="575" y1="30" x2="575" y2="470" />
        {/* 10m lines */}
        <line x1="312" y1="30" x2="312" y2="470" strokeDasharray="6 5" />
        <line x1="488" y1="30" x2="488" y2="470" strokeDasharray="6 5" />
        {/* 5m lines from try lines */}
        <line x1="165" y1="30" x2="165" y2="470" strokeDasharray="4 4" strokeWidth="1.2" />
        <line x1="635" y1="30" x2="635" y2="470" strokeDasharray="4 4" strokeWidth="1.2" />
        {/* 5m lines from touchlines */}
        <line x1="30"  y1="65"  x2="770" y2="65"  strokeDasharray="4 4" strokeWidth="1.2" />
        <line x1="30"  y1="435" x2="770" y2="435" strokeDasharray="4 4" strokeWidth="1.2" />
        {/* 15m lines from touchlines */}
        <line x1="30"  y1="125" x2="770" y2="125" strokeDasharray="3 6" strokeWidth="1" />
        <line x1="30"  y1="375" x2="770" y2="375" strokeDasharray="3 6" strokeWidth="1" />
        {/* Goal posts (H) on try lines */}
        <g strokeWidth="2">
          <line x1="124" y1="232" x2="124" y2="268" />
          <line x1="136" y1="232" x2="136" y2="268" />
          <line x1="124" y1="250" x2="136" y2="250" />
          <line x1="664" y1="232" x2="664" y2="268" />
          <line x1="676" y1="232" x2="676" y2="268" />
          <line x1="664" y1="250" x2="676" y2="250" />
        </g>
        {/* Centre spot */}
        <circle cx="400" cy="250" r="3" fill="white" stroke="none" />
      </g>
    </svg>
  );
}

function TableTennisBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g opacity="0.55">
        {/* Table surface */}
        <rect x="0" y="0" width="800" height="500" fill="#0a0a0a" />
        {/* Mid-table seam (where the two halves of the folding table meet) */}
        <rect x="397" y="0" width="6" height="500" fill="#1f1f1f" />
        {/* Outer boundary */}
        <rect x="40" y="40" width="720" height="420" fill="none" stroke="white" strokeWidth="3" />
        {/* Lengthwise center stripe on each half */}
        <line x1="40" y1="250" x2="395" y2="250" stroke="white" strokeWidth="3" />
        <line x1="405" y1="250" x2="760" y2="250" stroke="white" strokeWidth="3" />

        {/* Red paddle — bottom-left, head up-right, handle down-left */}
        <g transform="rotate(30 200 350)">
          <rect x="190" y="400" width="20" height="78" rx="6" fill="#8b5a2b" />
          <rect x="194" y="395" width="12" height="10" rx="2" fill="#5c3a1a" />
          <ellipse cx="200" cy="350" rx="58" ry="52" fill="#c8302c" stroke="rgba(0,0,0,0.4)" strokeWidth="2" />
        </g>

        {/* Black paddle — top-right, head down-left, handle up-right */}
        <g transform="rotate(210 600 150)">
          <rect x="590" y="200" width="20" height="78" rx="6" fill="#a06b3a" />
          <rect x="594" y="195" width="12" height="10" rx="2" fill="#6b401a" />
          <ellipse cx="600" cy="150" rx="58" ry="52" fill="#1a1a1a" stroke="rgba(0,0,0,0.55)" strokeWidth="2" />
        </g>

        {/* White ball — between the paddles */}
        <circle cx="450" cy="225" r="11" fill="white" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      </g>
    </svg>
  );
}

function SwimmingBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        {/* Pool outline */}
        <rect x="30" y="30" width="740" height="440" />
        {/* Lane dividers (8 lanes) */}
        <line x1="30" y1="85"  x2="770" y2="85" />
        <line x1="30" y1="140" x2="770" y2="140" />
        <line x1="30" y1="195" x2="770" y2="195" />
        <line x1="30" y1="250" x2="770" y2="250" strokeWidth="2.2" />
        <line x1="30" y1="305" x2="770" y2="305" />
        <line x1="30" y1="360" x2="770" y2="360" />
        <line x1="30" y1="415" x2="770" y2="415" />
        {/* Backstroke flag lines (5m from each wall) */}
        <line x1="105" y1="30" x2="105" y2="470" strokeDasharray="4 4" strokeWidth="1.2" />
        <line x1="695" y1="30" x2="695" y2="470" strokeDasharray="4 4" strokeWidth="1.2" />
        {/* T-markers at each end of each lane */}
        <g strokeWidth="2.2">
          <line x1="50"  y1="57"  x2="50"  y2="113" />
          <line x1="50"  y1="112" x2="80"  y2="112" />
          <line x1="50"  y1="167" x2="50"  y2="223" />
          <line x1="50"  y1="222" x2="80"  y2="222" />
          <line x1="50"  y1="277" x2="50"  y2="333" />
          <line x1="50"  y1="332" x2="80"  y2="332" />
          <line x1="50"  y1="387" x2="50"  y2="443" />
          <line x1="50"  y1="442" x2="80"  y2="442" />
          <line x1="750" y1="57"  x2="750" y2="113" />
          <line x1="720" y1="112" x2="750" y2="112" />
          <line x1="750" y1="167" x2="750" y2="223" />
          <line x1="720" y1="222" x2="750" y2="222" />
          <line x1="750" y1="277" x2="750" y2="333" />
          <line x1="720" y1="332" x2="750" y2="332" />
          <line x1="750" y1="387" x2="750" y2="443" />
          <line x1="720" y1="442" x2="750" y2="442" />
        </g>
      </g>
    </svg>
  );
}

function VolleyballBackdrop() {
  return (
    <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="white" fill="none" strokeWidth="1.6" opacity="0.18">
        {/* Court outline (18m x 9m) */}
        <rect x="30" y="30" width="740" height="440" />
        {/* Net / centre line — extends past the sidelines to suggest the posts */}
        <line x1="400" y1="10" x2="400" y2="490" strokeWidth="2.5" />
        {/* Attack (3m) lines either side of the net */}
        <line x1="277" y1="30" x2="277" y2="470" />
        <line x1="523" y1="30" x2="523" y2="470" />
      </g>
    </svg>
  );
}

export const SPORT_BACKDROP: Record<string, () => React.ReactElement> = {
  BASKETBALL: BasketballBackdrop,
  FOOTBALL: FootballBackdrop,
  CRICKET: CricketBackdrop,
  FIELD_HOCKEY: FieldHockeyBackdrop,
  BADMINTON: BadmintonBackdrop,
  ATHLETICS: AthleticsBackdrop,
  WRESTLING: WrestlingBackdrop,
  BOXING: BoxingBackdrop,
  SHOOTING: ShootingBackdrop,
  WEIGHTLIFTING: WeightliftingBackdrop,
  ARCHERY: ArcheryBackdrop,
  TENNIS: TennisBackdrop,
  TABLE_TENNIS: TableTennisBackdrop,
  RUGBY: RugbyBackdrop,
  SWIMMING: SwimmingBackdrop,
  VOLLEYBALL: VolleyballBackdrop,
};

/** Renders the line-art court/field device for a sport, or nothing if unknown. */
export default function SportBackdrop({ sport }: { sport?: string | null }) {
  const Backdrop = sport ? SPORT_BACKDROP[sport] : undefined;
  return Backdrop ? <Backdrop /> : null;
}

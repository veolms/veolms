import { useState, type ReactElement } from "react";

export interface CountryFlagProps {
  code: string;
  className?: string;
  width?: number | string;
  height?: number | string;
}

const FLAGS: Record<string, () => ReactElement> = {
  IN: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#FF9933" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#138808" />
      <circle cx="18" cy="12" r="3.2" fill="none" stroke="#000080" strokeWidth="0.8" />
      <circle cx="18" cy="12" r="0.8" fill="#000080" />
      {Array.from({ length: 24 }).map((_, i) => (
        <line
          key={i}
          x1="18"
          y1="12"
          x2={18 + 3.1 * Math.cos((i * 15 * Math.PI) / 180)}
          y2={12 + 3.1 * Math.sin((i * 15 * Math.PI) / 180)}
          stroke="#000080"
          strokeWidth="0.3"
        />
      ))}
    </svg>
  ),
  US: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      {Array.from({ length: 13 }).map((_, i) => (
        <rect
          key={i}
          y={(i * 24) / 13}
          width="36"
          height={24 / 13}
          fill={i % 2 === 0 ? "#B22234" : "#FFFFFF"}
        />
      ))}
      <rect width="15" height="13" fill="#3C3B6E" />
      <circle cx="3" cy="3" r="0.7" fill="#FFFFFF" />
      <circle cx="7.5" cy="3" r="0.7" fill="#FFFFFF" />
      <circle cx="12" cy="3" r="0.7" fill="#FFFFFF" />
      <circle cx="5.2" cy="6.5" r="0.7" fill="#FFFFFF" />
      <circle cx="9.8" cy="6.5" r="0.7" fill="#FFFFFF" />
      <circle cx="3" cy="10" r="0.7" fill="#FFFFFF" />
      <circle cx="7.5" cy="10" r="0.7" fill="#FFFFFF" />
      <circle cx="12" cy="10" r="0.7" fill="#FFFFFF" />
    </svg>
  ),
  GB: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#012169" />
      <path d="M0,0 L36,24 M36,0 L0,24" stroke="#FFFFFF" strokeWidth="4" />
      <path d="M0,0 L36,24 M36,0 L0,24" stroke="#C8102E" strokeWidth="2.2" />
      <path d="M18,0 V24 M0,12 H36" stroke="#FFFFFF" strokeWidth="7" />
      <path d="M18,0 V24 M0,12 H36" stroke="#C8102E" strokeWidth="4.2" />
    </svg>
  ),
  CA: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#FF0000" />
      <rect x="9" width="18" height="24" fill="#FFFFFF" />
      <path
        d="M18,5 L19,9 L23,8.5 L20.5,12 L22.5,14 L18.5,14.5 L18.5,18 L17.5,18 L17.5,14.5 L13.5,14 L15.5,12 L13,8.5 L17,9 Z"
        fill="#FF0000"
      />
    </svg>
  ),
  AU: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#00008B" />
      <g transform="scale(0.5)">
        <rect width="36" height="24" fill="#012169" />
        <path d="M0,0 L36,24 M36,0 L0,24" stroke="#FFFFFF" strokeWidth="4" />
        <path d="M0,0 L36,24 M36,0 L0,24" stroke="#C8102E" strokeWidth="2.2" />
        <path d="M18,0 V24 M0,12 H36" stroke="#FFFFFF" strokeWidth="7" />
        <path d="M18,0 V24 M0,12 H36" stroke="#C8102E" strokeWidth="4.2" />
      </g>
      <circle cx="9" cy="18" r="2.2" fill="#FFFFFF" />
      <circle cx="27" cy="5" r="1.1" fill="#FFFFFF" />
      <circle cx="31" cy="9" r="1.1" fill="#FFFFFF" />
      <circle cx="31" cy="15" r="1.1" fill="#FFFFFF" />
      <circle cx="27" cy="19" r="1.1" fill="#FFFFFF" />
      <circle cx="28.5" cy="12" r="0.7" fill="#FFFFFF" />
    </svg>
  ),
  DE: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#000000" />
      <rect y="8" width="36" height="8" fill="#DD0000" />
      <rect y="16" width="36" height="8" fill="#FFCE00" />
    </svg>
  ),
  FR: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="12" height="24" fill="#0055A4" />
      <rect x="12" width="12" height="24" fill="#FFFFFF" />
      <rect x="24" width="12" height="24" fill="#EF4135" />
    </svg>
  ),
  AE: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#00732F" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#000000" />
      <rect width="10" height="24" fill="#FF0000" />
    </svg>
  ),
  SA: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#006C35" />
      <rect x="7" y="10" width="22" height="2" rx="1" fill="#FFFFFF" />
      <rect x="6" y="14" width="24" height="1.4" rx="0.7" fill="#FFFFFF" />
      <polygon points="6,14.7 9,13.2 9,16.2" fill="#FFFFFF" />
    </svg>
  ),
  SG: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="12" fill="#ED2939" />
      <rect y="12" width="36" height="12" fill="#FFFFFF" />
      <circle cx="7" cy="6" r="3.8" fill="#FFFFFF" />
      <circle cx="8.2" cy="6" r="3.2" fill="#ED2939" />
      <circle cx="10" cy="4" r="0.7" fill="#FFFFFF" />
      <circle cx="12" cy="5.5" r="0.7" fill="#FFFFFF" />
      <circle cx="11.5" cy="8" r="0.7" fill="#FFFFFF" />
      <circle cx="9" cy="8" r="0.7" fill="#FFFFFF" />
      <circle cx="8.5" cy="5.5" r="0.7" fill="#FFFFFF" />
    </svg>
  ),
  JP: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#FFFFFF" />
      <circle cx="18" cy="12" r="6" fill="#BC002D" />
    </svg>
  ),
  CN: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#DE2910" />
      <polygon points="6,3.5 7,6.5 4,4.5 8,4.5 5,6.5" fill="#FFDE00" />
      <circle cx="11" cy="3" r="0.9" fill="#FFDE00" />
      <circle cx="13" cy="5" r="0.9" fill="#FFDE00" />
      <circle cx="13" cy="8" r="0.9" fill="#FFDE00" />
      <circle cx="11" cy="10" r="0.9" fill="#FFDE00" />
    </svg>
  ),
  BR: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#009C3B" />
      <polygon points="18,3 32,12 18,21 4,12" fill="#FFDF00" />
      <circle cx="18" cy="12" r="5" fill="#002776" />
      <path d="M13.5,12.5 Q18,10 22.5,13" stroke="#FFFFFF" strokeWidth="0.9" fill="none" />
    </svg>
  ),
  IT: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="12" height="24" fill="#009246" />
      <rect x="12" width="12" height="24" fill="#FFFFFF" />
      <rect x="24" width="12" height="24" fill="#CE2B37" />
    </svg>
  ),
  ES: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="6" fill="#AA151B" />
      <rect y="6" width="36" height="12" fill="#F1BF00" />
      <rect y="18" width="36" height="6" fill="#AA151B" />
      <circle cx="10" cy="12" r="2.8" fill="#AA151B" />
      <circle cx="10" cy="12" r="1.8" fill="#F1BF00" />
    </svg>
  ),
  NL: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#AE1C28" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#21468B" />
    </svg>
  ),
  SE: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#006AA7" />
      <rect x="11" width="5" height="24" fill="#FECC00" />
      <rect y="10" width="36" height="4.5" fill="#FECC00" />
    </svg>
  ),
  CH: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#FF0000" />
      <rect x="15.5" y="6" width="5" height="12" fill="#FFFFFF" />
      <rect x="11.5" y="9.5" width="13" height="5" fill="#FFFFFF" />
    </svg>
  ),
  NZ: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#00247D" />
      <g transform="scale(0.5)">
        <rect width="36" height="24" fill="#012169" />
        <path d="M0,0 L36,24 M36,0 L0,24" stroke="#FFFFFF" strokeWidth="4" />
        <path d="M0,0 L36,24 M36,0 L0,24" stroke="#C8102E" strokeWidth="2.2" />
        <path d="M18,0 V24 M0,12 H36" stroke="#FFFFFF" strokeWidth="7" />
        <path d="M18,0 V24 M0,12 H36" stroke="#C8102E" strokeWidth="4.2" />
      </g>
      <circle cx="28" cy="6" r="1.3" fill="#CC142B" stroke="#FFFFFF" strokeWidth="0.5" />
      <circle cx="32" cy="11" r="1.3" fill="#CC142B" stroke="#FFFFFF" strokeWidth="0.5" />
      <circle cx="28" cy="18" r="1.3" fill="#CC142B" stroke="#FFFFFF" strokeWidth="0.5" />
      <circle cx="24" cy="12" r="1.3" fill="#CC142B" stroke="#FFFFFF" strokeWidth="0.5" />
    </svg>
  ),
  ZA: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="12" fill="#E03C31" />
      <rect y="12" width="36" height="12" fill="#001489" />
      <polygon points="0,0 16,12 0,24" fill="#000000" />
      <polygon points="0,0 18,12 0,24" stroke="#FFB81C" strokeWidth="1.8" fill="none" />
      <path d="M0,0 L18,12 L36,12 M0,24 L18,12" stroke="#FFFFFF" strokeWidth="4.5" fill="none" />
      <path d="M0,0 L18,12 L36,12 M0,24 L18,12" stroke="#007749" strokeWidth="3" fill="none" />
    </svg>
  ),
  MX: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="12" height="24" fill="#006847" />
      <rect x="12" width="12" height="24" fill="#FFFFFF" />
      <rect x="24" width="12" height="24" fill="#CE1126" />
      <circle cx="18" cy="12" r="2.8" fill="#8B4513" />
    </svg>
  ),
  ID: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="12" fill="#FF0000" />
      <rect y="12" width="36" height="12" fill="#FFFFFF" />
    </svg>
  ),
  PH: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="12" fill="#0038A8" />
      <rect y="12" width="36" height="12" fill="#CE1126" />
      <polygon points="0,0 16,12 0,24" fill="#FFFFFF" />
      <circle cx="6" cy="12" r="2.2" fill="#FCD116" />
    </svg>
  ),
  PK: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#01411C" />
      <rect width="8" height="24" fill="#FFFFFF" />
      <circle cx="22" cy="12" r="5.5" fill="#FFFFFF" />
      <circle cx="23.5" cy="11" r="4.8" fill="#01411C" />
      <polygon points="24,9 25,12 22,10 26,10 23,12" fill="#FFFFFF" />
    </svg>
  ),
  BD: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#006A4E" />
      <circle cx="16" cy="12" r="6.2" fill="#F42A41" />
    </svg>
  ),
  NG: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="12" height="24" fill="#008751" />
      <rect x="12" width="12" height="24" fill="#FFFFFF" />
      <rect x="24" width="12" height="24" fill="#008751" />
    </svg>
  ),
  TR: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#E30A17" />
      <circle cx="15" cy="12" r="6" fill="#FFFFFF" />
      <circle cx="16.6" cy="12" r="4.8" fill="#E30A17" />
      <polygon points="21,12 23.5,13.5 22.2,10.8 24.5,12 21.8,12" fill="#FFFFFF" />
    </svg>
  ),
  RU: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#FFFFFF" />
      <rect y="8" width="36" height="8" fill="#0039A6" />
      <rect y="16" width="36" height="8" fill="#D52B1E" />
    </svg>
  ),
  KR: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#FFFFFF" />
      <circle cx="18" cy="12" r="5" fill="#CD2E3A" />
      <path d="M13,12 A5,5 0 0,0 23,12 A2.5,2.5 0 0,1 18,12 A2.5,2.5 0 0,0 13,12 Z" fill="#0047A0" />
      <circle cx="18" cy="9.5" r="2.5" fill="#CD2E3A" />
    </svg>
  ),
  AR: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#74ACDF" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#74ACDF" />
      <circle cx="18" cy="12" r="2.2" fill="#F6B40E" />
    </svg>
  ),
  PL: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="12" fill="#FFFFFF" />
      <rect y="12" width="36" height="12" fill="#DC143C" />
    </svg>
  ),
  NO: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#BA0C2F" />
      <rect x="9" width="6" height="24" fill="#FFFFFF" />
      <rect y="9" width="36" height="6" fill="#FFFFFF" />
      <rect x="10.5" width="3" height="24" fill="#00205B" />
      <rect y="10.5" width="36" height="3" fill="#00205B" />
    </svg>
  ),
  FI: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#FFFFFF" />
      <rect x="10" width="5" height="24" fill="#003580" />
      <rect y="9.5" width="36" height="5" fill="#003580" />
    </svg>
  ),
  DK: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#C60C30" />
      <rect x="10" width="4" height="24" fill="#FFFFFF" />
      <rect y="10" width="36" height="4" fill="#FFFFFF" />
    </svg>
  ),
  IE: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="12" height="24" fill="#169B62" />
      <rect x="12" width="12" height="24" fill="#FFFFFF" />
      <rect x="24" width="12" height="24" fill="#FF883E" />
    </svg>
  ),
  PT: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="14" height="24" fill="#006600" />
      <rect x="14" width="22" height="24" fill="#FF0000" />
      <circle cx="14" cy="12" r="4" fill="#FFCC00" />
      <circle cx="14" cy="12" r="2.5" fill="#FFFFFF" stroke="#0000FF" strokeWidth="0.8" />
    </svg>
  ),
  GR: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      {Array.from({ length: 9 }).map((_, i) => (
        <rect
          key={i}
          y={(i * 24) / 9}
          width="36"
          height={24 / 9}
          fill={i % 2 === 0 ? "#0D5EAF" : "#FFFFFF"}
        />
      ))}
      <rect width="13" height="13.3" fill="#0D5EAF" />
      <rect x="5" width="3" height="13.3" fill="#FFFFFF" />
      <rect y="5.1" width="13" height="3" fill="#FFFFFF" />
    </svg>
  ),
  AT: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#ED2939" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#ED2939" />
    </svg>
  ),
  BE: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="12" height="24" fill="#000000" />
      <rect x="12" width="12" height="24" fill="#FDDA24" />
      <rect x="24" width="12" height="24" fill="#EF3340" />
    </svg>
  ),
  TH: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="4" fill="#A51931" />
      <rect y="4" width="36" height="4" fill="#F4F5F8" />
      <rect y="8" width="36" height="8" fill="#2D2A4A" />
      <rect y="16" width="36" height="4" fill="#F4F5F8" />
      <rect y="20" width="36" height="4" fill="#A51931" />
    </svg>
  ),
  VN: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#DA251D" />
      <polygon points="18,6 20.5,13.5 13.5,9 22.5,9 15.5,13.5" fill="#FFFF00" />
    </svg>
  ),
  UA: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="12" fill="#0057B7" />
      <rect y="12" width="36" height="12" fill="#FFD700" />
    </svg>
  ),
  IL: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#FFFFFF" />
      <rect y="3" width="36" height="3" fill="#0038B8" />
      <rect y="18" width="36" height="3" fill="#0038B8" />
      <polygon points="18,8.5 21,14 15,14" fill="none" stroke="#0038B8" strokeWidth="0.8" />
      <polygon points="18,15.5 21,10 15,10" fill="none" stroke="#0038B8" strokeWidth="0.8" />
    </svg>
  ),
  RO: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="12" height="24" fill="#002B7F" />
      <rect x="12" width="12" height="24" fill="#FCD116" />
      <rect x="24" width="12" height="24" fill="#CE1126" />
    </svg>
  ),
  HU: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#CE2939" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#477050" />
    </svg>
  ),
  QA: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#8D1B3D" />
      <polygon points="0,0 10,0 12,1.33 10,2.67 12,4 10,5.33 12,6.67 10,8 12,9.33 10,10.67 12,12 10,13.33 12,14.67 10,16 12,17.33 10,18.67 12,20 10,21.33 12,22.67 10,24 0,24" fill="#FFFFFF" />
    </svg>
  ),
  KW: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#007A3D" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#CE1126" />
      <polygon points="0,0 10,8 10,16 0,24" fill="#000000" />
    </svg>
  ),
  OM: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#FFFFFF" />
      <rect y="8" width="36" height="8" fill="#ED1C24" />
      <rect y="16" width="36" height="8" fill="#008000" />
      <rect width="10" height="24" fill="#ED1C24" />
      <circle cx="5" cy="5" r="1.8" fill="#FFFFFF" />
    </svg>
  ),
  BH: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#CE1126" />
      <polygon points="0,0 10,0 13,2.4 10,4.8 13,7.2 10,9.6 13,12 10,14.4 13,16.8 10,19.2 13,21.6 10,24 0,24" fill="#FFFFFF" />
    </svg>
  ),
  LK: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#FFBE29" />
      <rect x="2" y="2" width="6" height="20" fill="#005A36" />
      <rect x="8" y="2" width="6" height="20" fill="#EB7B12" />
      <rect x="15" y="2" width="19" height="20" fill="#8D153A" />
      <circle cx="24" cy="12" r="3.5" fill="#FFBE29" />
    </svg>
  ),
  NP: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#FFFFFF" />
      <polygon points="2,2 22,12 10,12 24,22 2,22" fill="#DC143C" stroke="#003893" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.2" fill="#FFFFFF" />
      <circle cx="8" cy="17" r="2.5" fill="#FFFFFF" />
    </svg>
  ),
  GH: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#EF3340" />
      <rect y="8" width="36" height="8" fill="#FFD100" />
      <rect y="16" width="36" height="8" fill="#009739" />
      <polygon points="18,9 19.5,13.5 15.5,10.5 20.5,10.5 16.5,13.5" fill="#000000" />
    </svg>
  ),
  MA: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#C1272D" />
      <polygon points="18,6 20,13 14,9 22,9 16,13" fill="none" stroke="#006233" strokeWidth="1.2" />
    </svg>
  ),
  DZ: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="18" height="24" fill="#006233" />
      <rect x="18" width="18" height="24" fill="#FFFFFF" />
      <circle cx="18" cy="12" r="5.5" fill="#D21034" />
      <circle cx="19.5" cy="12" r="4.5" fill="#FFFFFF" />
      <polygon points="20,10 21,13 18.5,11 22.5,11 19.5,13" fill="#D21034" />
    </svg>
  ),
  PE: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="12" height="24" fill="#D91023" />
      <rect x="12" width="12" height="24" fill="#FFFFFF" />
      <rect x="24" width="12" height="24" fill="#D91023" />
    </svg>
  ),
  CR: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="4" fill="#002B7F" />
      <rect y="4" width="36" height="4" fill="#FFFFFF" />
      <rect y="8" width="36" height="8" fill="#CE1126" />
      <rect y="16" width="36" height="4" fill="#FFFFFF" />
      <rect y="20" width="36" height="4" fill="#002B7F" />
    </svg>
  ),
  PA: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="18" height="12" fill="#FFFFFF" />
      <rect x="18" width="18" height="12" fill="#DA121A" />
      <rect y="12" width="18" height="12" fill="#072357" />
      <rect x="18" y="12" width="18" height="12" fill="#FFFFFF" />
      <polygon points="9,3 10,7 7,4.5 11,4.5 8,7" fill="#072357" />
      <polygon points="27,15 28,19 25,16.5 29,16.5 26,19" fill="#DA121A" />
    </svg>
  ),
  UY: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      {Array.from({ length: 9 }).map((_, i) => (
        <rect
          key={i}
          y={(i * 24) / 9}
          width="36"
          height={24 / 9}
          fill={i % 2 === 0 ? "#FFFFFF" : "#0038A8"}
        />
      ))}
      <rect width="12" height="12" fill="#FFFFFF" />
      <circle cx="6" cy="6" r="3" fill="#FCD116" />
    </svg>
  ),
  EC: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="12" fill="#FFDD00" />
      <rect y="12" width="36" height="6" fill="#034EA2" />
      <rect y="18" width="36" height="6" fill="#ED1C24" />
      <circle cx="18" cy="12" r="3" fill="#8B4513" />
    </svg>
  ),
  IS: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#02529C" />
      <rect x="9" width="6" height="24" fill="#FFFFFF" />
      <rect y="9" width="36" height="6" fill="#FFFFFF" />
      <rect x="10.5" width="3" height="24" fill="#DC1E35" />
      <rect y="10.5" width="36" height="3" fill="#DC1E35" />
    </svg>
  ),
  LU: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#EA141D" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#00A1DE" />
    </svg>
  ),
  BG: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#FFFFFF" />
      <rect y="8" width="36" height="8" fill="#00966E" />
      <rect y="16" width="36" height="8" fill="#D62612" />
    </svg>
  ),
  HR: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#FF0000" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#171796" />
      <rect x="14.5" y="6" width="7" height="9" fill="#FF0000" stroke="#FFFFFF" strokeWidth="0.5" />
    </svg>
  ),
  RS: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#C6363C" />
      <rect y="8" width="36" height="8" fill="#0C4076" />
      <rect y="16" width="36" height="8" fill="#FFFFFF" />
      <circle cx="13" cy="12" r="3.5" fill="#C6363C" stroke="#D2A442" strokeWidth="0.8" />
    </svg>
  ),
  SK: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#FFFFFF" />
      <rect y="8" width="36" height="8" fill="#0B4EA2" />
      <rect y="16" width="36" height="8" fill="#EE1C25" />
      <rect x="7" y="5" width="8" height="11" rx="2" fill="#EE1C25" stroke="#FFFFFF" strokeWidth="0.8" />
    </svg>
  ),
  SI: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#FFFFFF" />
      <rect y="8" width="36" height="8" fill="#005CE6" />
      <rect y="16" width="36" height="8" fill="#ED1C24" />
      <rect x="7" y="4" width="6" height="8" fill="#005CE6" stroke="#ED1C24" strokeWidth="0.5" />
    </svg>
  ),
  EE: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#0072CE" />
      <rect y="8" width="36" height="8" fill="#000000" />
      <rect y="16" width="36" height="8" fill="#FFFFFF" />
    </svg>
  ),
  LV: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="9.5" fill="#9E3039" />
      <rect y="9.5" width="36" height="5" fill="#FFFFFF" />
      <rect y="14.5" width="36" height="9.5" fill="#9E3039" />
    </svg>
  ),
  LT: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="8" fill="#FDB913" />
      <rect y="8" width="36" height="8" fill="#006A44" />
      <rect y="16" width="36" height="8" fill="#C1272D" />
    </svg>
  ),
  CY: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="36" height="24" fill="#FFFFFF" />
      <path d="M11,10 L16,6 L25,9 L23,13 L17,14 Z" fill="#D57800" />
      <path d="M12,17 Q18,19 24,17" stroke="#4E7037" strokeWidth="1.2" fill="none" />
    </svg>
  ),
  MT: () => (
    <svg viewBox="0 0 36 24" width="100%" height="100%">
      <rect width="18" height="24" fill="#FFFFFF" />
      <rect x="18" width="18" height="24" fill="#CF142B" />
      <rect x="2" y="2" width="5" height="5" fill="#808080" stroke="#FFFFFF" strokeWidth="0.5" />
    </svg>
  ),
};

export function CountryFlag({
  code,
  className = "",
  width = 20,
  height = 14,
}: CountryFlagProps) {
  const normalizedCode = (code || "").toUpperCase();
  const lowerCode = normalizedCode.toLowerCase();
  const [imgError, setImgError] = useState(false);
  const FlagComponent = FLAGS[normalizedCode];

  return (
    <span
      className={`country-flag ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width,
        height,
        borderRadius: 2,
        overflow: "hidden",
        flexShrink: 0,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.1)",
        backgroundColor: "rgba(255,255,255,0.06)",
        position: "relative",
      }}
      aria-hidden="true"
    >
      {!imgError && lowerCode.length === 2 ? (
        <img
          src={`https://flagcdn.com/36x27/${lowerCode}.png`}
          srcSet={`https://flagcdn.com/72x54/${lowerCode}.png 2x`}
          width={width}
          height={height}
          alt={normalizedCode}
          loading="lazy"
          onError={() => setImgError(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : FlagComponent ? (
        FlagComponent()
      ) : (
        <svg viewBox="0 0 36 24" width="100%" height="100%">
          <rect width="36" height="24" fill="#3B82F6" />
          <text
            x="18"
            y="15"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="10"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            {normalizedCode}
          </text>
        </svg>
      )}
    </span>
  );
}

export function mascotArt(id) {
  return `<svg class="kt-mascot-art" viewBox="0 0 320 320" role="img" aria-label="The Keeper animated fantasy league mascot" focusable="false">
    <defs>
      <radialGradient id="${id}-glow" cx="50%" cy="38%" r="62%"><stop offset="0" stop-color="#c6ff4a" stop-opacity=".38"/><stop offset="1" stop-color="#c6ff4a" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}-body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d7ff70"/><stop offset=".55" stop-color="#b7ef42"/><stop offset="1" stop-color="#72b82b"/></linearGradient>
      <linearGradient id="${id}-jersey" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#293e60"/><stop offset="1" stop-color="#101a2c"/></linearGradient>
      <linearGradient id="${id}-board" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#79c2ff"/><stop offset="1" stop-color="#3285e8"/></linearGradient>
      <filter id="${id}-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#000" flood-opacity=".32"/></filter>
    </defs>
    <ellipse class="kt-mascot-shadow" cx="160" cy="290" rx="88" ry="15" fill="#050912" opacity=".48"/>
    <circle class="kt-mascot-aura" cx="160" cy="148" r="139" fill="url(#${id}-glow)"/>
    <g class="kt-mascot-character" filter="url(#${id}-shadow)">
      <g class="kt-mascot-legs"><path d="M114 273v18m92-18v18" stroke="#152000" stroke-width="12" stroke-linecap="round"/><path d="M96 294h36m56 0h36" stroke="#59a8ff" stroke-width="13" stroke-linecap="round"/></g>
      <path class="kt-mascot-jersey" d="M92 171c17 19 42 27 68 27s51-8 68-27v54c0 35-30 58-68 58s-68-23-68-58z" fill="url(#${id}-jersey)" stroke="#152000" stroke-width="6"/>
      <path d="M123 207h74l-7 56h-60z" fill="#f4f7fb" opacity=".96"/><path d="m146 207 14 18 14-18" fill="none" stroke="#8190a8" stroke-width="4"/>
      <text x="160" y="253" text-anchor="middle" font-family="Arial Narrow,Arial,sans-serif" font-size="31" font-weight="900" fill="#152000">KT</text>
      <g class="kt-mascot-arm kt-mascot-arm-left"><path d="M99 181c-25 5-39 25-32 43 5 13 18 11 31-1" fill="url(#${id}-body)" stroke="#152000" stroke-width="6" stroke-linecap="round"/></g>
      <g class="kt-mascot-arm kt-mascot-arm-right"><path d="M221 181c25 5 39 25 32 43-5 13-18 11-31-1" fill="url(#${id}-body)" stroke="#152000" stroke-width="6" stroke-linecap="round"/></g>
      <g class="kt-mascot-head">
        <path d="M82 117 62 70l48 22m128 25 20-47-48 22" fill="url(#${id}-body)" stroke="#152000" stroke-width="6" stroke-linejoin="round"/>
        <path d="M89 130c0-51 32-83 71-83s71 32 71 83v62c0 40-30 67-71 67s-71-27-71-67z" fill="url(#${id}-body)" stroke="#152000" stroke-width="6"/>
        <path d="M107 104c10-11 25-16 39-10m28 0c14-6 29-1 39 10" fill="none" stroke="#dfff8c" stroke-width="5" stroke-linecap="round" opacity=".52"/>
        <g class="kt-mascot-brows" fill="none" stroke="#152000" stroke-width="8" stroke-linecap="round"><path class="kt-mascot-brow-left" d="M102 124c10-16 28-20 43-8"/><path class="kt-mascot-brow-right" d="M175 116c15-12 33-8 43 8"/></g>
        <g class="kt-mascot-eyes-open">
          <ellipse cx="125" cy="140" rx="17" ry="21" fill="#f4f7fb"/><ellipse cx="195" cy="140" rx="17" ry="21" fill="#f4f7fb"/>
          <g class="kt-mascot-pupils"><ellipse cx="130" cy="144" rx="7" ry="10" fill="#0b0f1a"/><ellipse cx="190" cy="144" rx="7" ry="10" fill="#0b0f1a"/><circle cx="132" cy="140" r="2.5" fill="#c6ff4a"/><circle cx="192" cy="140" r="2.5" fill="#c6ff4a"/></g>
        </g>
        <g class="kt-mascot-eyes-closed" fill="none" stroke="#152000" stroke-width="6" stroke-linecap="round"><path d="M109 143c10 8 22 8 32 0m38 0c10 8 22 8 32 0"/></g>
        <path d="m160 148-17 17 17 8 17-8z" fill="#ffb612" stroke="#152000" stroke-width="4" stroke-linejoin="round"/>
        <path class="kt-mascot-mouth-smile" d="M141 176c11 14 27 14 38 0" fill="none" stroke="#152000" stroke-width="5" stroke-linecap="round"/>
        <path class="kt-mascot-mouth-frown" d="M143 187c10-11 24-11 34 0" fill="none" stroke="#152000" stroke-width="5" stroke-linecap="round"/>
        <path class="kt-mascot-mouth-flat" d="M145 181h30" fill="none" stroke="#152000" stroke-width="5" stroke-linecap="round"/>
      </g>
      <g class="kt-mascot-clipboard">
        <rect x="184" y="185" width="67" height="86" rx="9" fill="url(#${id}-board)" stroke="#152000" stroke-width="5"/>
        <rect x="202" y="177" width="31" height="17" rx="6" fill="#a9b7ca" stroke="#152000" stroke-width="4"/>
        <path d="M196 207h43m-43 14h43m-43 14h29m-29 14h35" stroke="#f4f7fb" stroke-width="5" stroke-linecap="round" opacity=".85"/>
        <path d="m196 251 6 6 12-15" fill="none" stroke="#c6ff4a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </g>
    <g class="kt-mascot-sparkles" fill="#c6ff4a"><path d="m54 110 4 10 10 4-10 4-4 10-4-10-10-4 10-4z"/><path d="m267 89 3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#59a8ff"/><circle cx="273" cy="168" r="5"/><circle cx="48" cy="181" r="4" fill="#59a8ff"/></g>
  </svg>`;
}

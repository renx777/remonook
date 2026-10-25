type Network = 'instagram' | 'x' | 'youtube';

/** Compact official-style social glyphs; decorative because each link has a readable label. */
export function SocialIcon({ network }: { network: Network }) {
  if (network === 'instagram') {
    return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="23" height="23" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="remonook-instagram-gradient" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FEDA75"/>
          <stop offset=".42" stopColor="#FA7E1E"/>
          <stop offset=".68" stopColor="#D62976"/>
          <stop offset="1" stopColor="#4F5BD5"/>
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#remonook-instagram-gradient)"/>
      <rect x="5.3" y="5.3" width="13.4" height="13.4" rx="4.2" fill="none" stroke="#fff" strokeWidth="1.7"/>
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.7"/>
      <circle cx="17.2" cy="6.8" r="1.15" fill="#fff"/>
    </svg>;
  }
  if (network === 'x') {
    return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.602-9.829L0 1.154h7.594l5.243 6.932 6.064-6.933Zm-1.293 19.49h2.04L6.486 3.24H4.298Z"/>
    </svg>;
  }
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="4.4" width="22" height="15.2" rx="4.3" fill="#FF0033"/>
    <path d="m10 8.8 5.5 3.2-5.5 3.2Z" fill="#fff"/>
  </svg>;
}

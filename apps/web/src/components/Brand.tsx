export function Brand({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand${large ? " brand--large" : ""}`}>
      <svg className="brand__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="fg-mark" x1="3" y1="4" x2="29" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fbbf24" />
            <stop offset="0.55" stopColor="#f59e0b" />
            <stop offset="1" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
        <rect x="1.2" y="1.2" width="29.6" height="29.6" rx="9" stroke="url(#fg-mark)" strokeWidth="1.6" />
        <path d="M8 10.5h5.2l5.6 11H24" stroke="url(#fg-mark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 21.5h5.2l2.3-4.6" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
        <circle cx="24" cy="10.5" r="2" fill="#14b8a6" />
      </svg>
      <span>FlowGate</span>
    </span>
  );
}

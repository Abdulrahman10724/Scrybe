import { useEffect, useState } from "react";

// ── Scrybe brand mark ────────────────────────────────────────────────
const SIZES = {
  sm: { icon: 26, gap: 8, font: 17 },
  md: { icon: 34, gap: 10, font: 21 },
  lg: { icon: 46, gap: 12, font: 27 },
  xl: { icon: 60, gap: 14, font: 34 },
};

function BrandMark({ size = "md", animated = true, className = "" }) {
  const { icon } = SIZES[size] || SIZES.md;
  const [ready, setReady] = useState(!animated);

  useEffect(() => {
    if (!animated) return;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [animated]);

  return (
    <svg
      width={icon}
      height={icon}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      role="img"
      aria-label="Scrybe"
    >
      <defs>
        <linearGradient id="scrybe-grad" x1="10" y1="90" x2="90" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0D9488" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>

      <path
        d="M72,30 C58,30 58,50 50,50 C42,50 42,70 28,70"
        stroke="url(#scrybe-grad)"
        strokeWidth="9"
        strokeLinecap="round"
        pathLength="1"
        style={{
          strokeDasharray: 1,
          strokeDashoffset: ready ? 0 : 1,
          transition: animated
            ? "stroke-dashoffset 900ms cubic-bezier(.65,0,.35,1) 80ms"
            : "none",
        }}
      />

      <circle cx="72" cy="30" r="9" fill="#0D9488" />

      <circle cx="28" cy="70" r="9" fill="#4F46E5" />
      {animated && (
        <circle cx="28" cy="70" r="9" fill="#4F46E5" opacity="0.45">
          <animate attributeName="r" values="9;17;9" dur="2.4s" begin="1s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.45;0;0.45" dur="2.4s" begin="1s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}

function BrandLockup({ size = "md", animated = true, className = "" }) {
  const { icon, gap, font } = SIZES[size] || SIZES.md;
  return (
    <div className={`flex items-center ${className}`} style={{ gap }}>
      <BrandMark size={size} animated={animated} />
      <span
        style={{
          fontSize: font,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          backgroundImage: "linear-gradient(120deg, #0D9488, #4F46E5)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        scrybe
      </span>
    </div>
  );
}

export { BrandMark, BrandLockup };
export default BrandMark;
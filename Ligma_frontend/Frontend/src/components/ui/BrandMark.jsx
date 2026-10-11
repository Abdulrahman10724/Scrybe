import { useId } from "react";

// ── Scrybe brand mark ────────────────────────────────────────────────
const SIZES = {
  sm: { icon: 26, gap: 8, font: 17 },
  md: { icon: 34, gap: 10, font: 21 },
  lg: { icon: 46, gap: 12, font: 27 },
  xl: { icon: 60, gap: 14, font: 34 },
};

function BrandMark({ size = "md", animated = true, className = "" }) {
  const { icon } = SIZES[size] || SIZES.md;
  const uid = useId().replace(/:/g, "");
  const gradId = `sb-grad-${uid}`;
  const shineId = `sb-shine-${uid}`;
  const clipId = `sb-clip-${uid}`;

  return (
    <svg
      width={icon}
      height={icon}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      role="img"
      aria-label="Scrybe"
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0D9488" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id={shineId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect width="100" height="100" rx="28" />
        </clipPath>
      </defs>

      {/* Tile */}
      <rect width="100" height="100" rx="28" fill={`url(#${gradId})`} />

      {/* Shine sweep */}
      {animated && (
        <g clipPath={`url(#${clipId})`}>
          <rect x="-60" y="-10" width="36" height="120" fill={`url(#${shineId})`} transform="skewX(-20)">
            <animate attributeName="x" values="-60;140" dur="3.6s" begin="1.2s" repeatCount="indefinite" />
          </rect>
        </g>
      )}

      {/* S-shaped connector */}
      <path
        d="M66 28 C 28 28, 72 72, 34 72"
        stroke="#fff"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset={animated ? 1 : 0}
      >
        {animated && (
          <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1s" begin="0.1s" fill="freeze" />
        )}
      </path>

      {/* End nodes */}
      <circle cx="66" cy="28" r="7.5" fill="#fff" />
      <circle cx="34" cy="72" r="7.5" fill="#fff" />

      {/* Pulse ring on the last node */}
      {animated && (
        <circle cx="34" cy="72" r="7.5" stroke="#fff" strokeWidth="2" fill="none">
          <animate attributeName="r" values="7.5;18;7.5" dur="2.4s" begin="1s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0;0.7" dur="2.4s" begin="1s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Center "AI" node */}
      <circle cx="50" cy="50" r="5" fill="#FBBF24">
        {animated && (
          <animate attributeName="r" values="5;6.8;5" dur="1.8s" begin="1s" repeatCount="indefinite" />
        )}
      </circle>
    </svg>
  );
}

function BrandLockup({ size = "md", animated = true, className = "" }) {
  const { gap, font } = SIZES[size] || SIZES.md;
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
import { useId } from "react";

// ── Scrybe brand mark ────────────────────────────────────────────────
// S-stroke (canvas path) → starts at a node, ends in a pen nib, AI sparkle on top
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
            <animate attributeName="x" values="-60;140" dur="3.6s" begin="1.4s" repeatCount="indefinite" />
          </rect>
        </g>
      )}

      {/* S-shaped stroke (self-drawing) */}
      <path
        d="M70 26 C 40 18, 28 44, 50 50 C 72 56, 60 82, 32 72"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset={animated ? 1 : 0}
      >
        {animated && (
          <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.1s" begin="0.1s" fill="freeze" />
        )}
      </path>

      {/* Start node */}
      <circle cx="70" cy="26" r="7" fill="#fff" />
      {animated && (
        <circle cx="70" cy="26" r="7" stroke="#fff" strokeWidth="2" fill="none">
          <animate attributeName="r" values="7;17;7" dur="2.6s" begin="1.3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0;0.7" dur="2.6s" begin="1.3s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Pen nib at the end of the stroke */}
      <g opacity={animated ? 0 : 1}>
        <polygon points="20,84 30,66 43,76" fill="#fff" />
        <circle cx="30" cy="75" r="2.2" fill="#0F766E" />
        {animated && (
          <animate attributeName="opacity" from="0" to="1" dur="0.3s" begin="1s" fill="freeze" />
        )}
      </g>

      {/* AI sparkle */}
      <path
        d="M24 17 L26.2 23.8 L33 26 L26.2 28.2 L24 35 L21.8 28.2 L15 26 L21.8 23.8 Z"
        fill="#FBBF24"
      >
        {animated && (
          <animate attributeName="opacity" values="1;0.35;1" dur="1.8s" begin="1.2s" repeatCount="indefinite" />
        )}
      </path>
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
          display: "inline-flex",
          alignItems: "baseline",
          fontSize: font,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}
      >
        <span
          style={{
            backgroundImage: "linear-gradient(120deg, #0D9488, #4F46E5)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          scrybe
        </span>
        <span
          style={{
            width: font * 0.2,
            height: font * 0.2,
            marginLeft: font * 0.06,
            borderRadius: "50%",
            background: "#FBBF24",
            display: "inline-block",
          }}
        />
      </span>
    </div>
  );
}

export { BrandMark, BrandLockup };
export default BrandMark;
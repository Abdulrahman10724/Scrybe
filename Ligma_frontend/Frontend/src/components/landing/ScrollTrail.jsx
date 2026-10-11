import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
} from "motion/react";

const TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];

function Tick({ at, progress }) {
  const fill = useTransform(progress, [Math.max(at - 0.02, 0), at], [0, 1]);
  const scale = useTransform(progress, [Math.max(at - 0.02, 0), at], [0.6, 1]);
  return (
    <div
      style={{ position: "absolute", top: `${at * 100}%`, left: "50%" }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          marginLeft: -5,
          marginTop: -5,
          borderRadius: "50%",
          border: "2px solid var(--border-strong)",
          background: "var(--background)",
          position: "relative",
        }}
      >
        <motion.span
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: "50%",
            background: "var(--primary)",
            opacity: fill,
            scale,
            boxShadow: "0 0 10px var(--primary)",
          }}
        />
      </div>
    </div>
  );
}

export default function ScrollTrail() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 24,
    mass: 0.4,
  });
  const headTop = useTransform(progress, [0, 1], ["0%", "100%"]);

  if (reduce) return null;

  return (
    <div
      aria-hidden="true"
      className="hidden md:block"
      style={{
        position: "fixed",
        left: 12,
        top: 90,
        bottom: 40,
        width: 2,
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      {/* faint full track */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--border)",
          borderRadius: 2,
        }}
      />

      {/* line left behind */}
      <motion.div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "top",
          scaleY: progress,
          background: "linear-gradient(to bottom, #0D9488, #4F46E5)",
          borderRadius: 2,
          boxShadow: "0 0 8px rgba(13,148,136,0.5)",
        }}
      />

      {/* milestone nodes */}
      {TICKS.map((t) => (
        <Tick key={t} at={t} progress={progress} />
      ))}

      {/* moving head node */}
      <motion.div
        style={{ position: "absolute", left: "50%", top: headTop }}
      >
        <span
          style={{
            position: "absolute",
            width: 18,
            height: 18,
            marginLeft: -9,
            marginTop: -9,
            borderRadius: "50%",
            background: "rgba(79,70,229,0.25)",
            animation: "trail-ping 1.6s ease-out infinite",
          }}
        />
        <span
          style={{
            position: "absolute",
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#0D9488,#4F46E5)",
            border: "2px solid var(--surface)",
            boxShadow: "0 0 14px rgba(79,70,229,0.7)",
          }}
        />
      </motion.div>

      <style>{`
        @keyframes trail-ping {
          0%   { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(2);   opacity: 0; }
        }
      `}</style>
    </div>
  );
}
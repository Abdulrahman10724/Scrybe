import { motion, useReducedMotion } from "motion/react";
import { Bot, History, LockKeyhole, Users } from "lucide-react";

// Product facts only (no usage numbers): each one is something the app
// actually does today.
const FACTS = [
  { Icon: Users, label: "Real-time multiplayer", description: "Live cursors, presence and chat over WebSockets" },
  { Icon: History, label: "Append-only audit log", description: "Every node and task change is recorded and replayable" },
  { Icon: LockKeyhole, label: "Node-level permissions", description: "Leads lock nodes and choose who can edit them" },
  { Icon: Bot, label: "AI task extraction", description: "Notes classified as Action Items become tasks" },
];

export default function StatsSection() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      style={{
        padding: "80px 24px",
        background: "var(--surface-muted)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: "center", marginBottom: 52 }}
        >
          <div className="section-eyebrow">What you get</div>
          <h2
            style={{
              margin: "10px 0 0",
              fontSize: "clamp(24px, 3vw, 32px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--foreground)",
            }}
          >
            Built for teams that move fast
          </h2>
        </motion.div>

        {/* Stats grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 20,
          }}
        >
          {FACTS.map((fact, i) => (
            <motion.div
              key={fact.label}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              style={{
                background: "var(--surface)",
                borderRadius: 14,
                border: "1px solid var(--border)",
                padding: "28px 24px",
                textAlign: "center",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: "var(--primary-soft)",
                  color: "var(--primary)",
                  marginBottom: 14,
                }}
              >
                <fact.Icon size={22} strokeWidth={2} aria-hidden="true" />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>
                {fact.label}
              </div>
              <div style={{ fontSize: 12, color: "var(--foreground-muted)" }}>
                {fact.description}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

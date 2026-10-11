export default function LandingFooter() {
  return (
    <footer
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        padding: "28px 24px",
        fontFamily: "var(--font-sans)",
        textAlign: "center",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--foreground-muted)" }}>
        © {new Date().getFullYear()} Scrybe. Built with care.
      </span>
    </footer>
  );
}
import { BrandLockup } from "../ui/BrandMark";

// Same two-panel shell as LoginPage / RegisterPage: decorative brand panel
// on large screens, the form card on the right.
export default function AuthSplitLayout({ children }) {
  return (
    <div className="min-h-screen flex bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="hidden lg:flex lg:w-[52%] xl:w-[56%] flex-col justify-between p-12 bg-[color:var(--surface)] border-r border-[color:var(--border)] relative overflow-hidden">
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.04]"
          viewBox="0 0 600 700"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="300" cy="200" r="180" stroke="currentColor" strokeWidth="1" />
          <circle cx="300" cy="200" r="100" stroke="currentColor" strokeWidth="0.6" />
          <line x1="0" y1="200" x2="600" y2="200" stroke="currentColor" strokeWidth="0.6" />
          <line x1="300" y1="0" x2="300" y2="700" stroke="currentColor" strokeWidth="0.6" />
          <line x1="0" y1="0" x2="600" y2="400" stroke="currentColor" strokeWidth="0.4" />
          <line x1="600" y1="0" x2="0" y2="400" stroke="currentColor" strokeWidth="0.4" />
          <rect x="140" y="80" width="320" height="240" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="420" cy="500" r="120" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="100" cy="550" r="80" stroke="currentColor" strokeWidth="0.5" />
        </svg>

        <div className="relative">
          <BrandLockup size="lg" />
        </div>

        <div className="relative space-y-5">
          <h2 className="text-4xl font-black leading-[1.1] tracking-tight text-[color:var(--foreground)]">
            Editorial
            <br />
            <span className="text-[color:var(--primary)]">productivity</span>
            <br />
            meets canvas.
          </h2>
          <p className="text-sm text-[color:var(--foreground-secondary)] max-w-xs leading-relaxed">
            A professional workspace for teams that think visually. Real-time collaboration, AI classification,
            and a full audit history.
          </p>
        </div>

        <p className="relative text-xs text-[color:var(--foreground-muted)]">Scrybe © {new Date().getFullYear()}</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="mb-10 lg:hidden">
          <BrandLockup size="md" />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}


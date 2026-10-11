import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  MailCheck,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

import { BrandLockup } from "../components/ui/BrandMark";
import {
  resendVerificationEmail,
  verifyEmailUser,
  clearAuthState,
} from "../redux/authSlice";

/* ── Confetti burst around the success badge ── */
const CONFETTI_COLORS = ["#0D9488", "#4F46E5", "#FBBF24", "#EA580C", "#EC4899", "#2DD4BF"];

function ConfettiBurst() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <>
      {Array.from({ length: 16 }).map((_, i) => {
        const angle = (i / 16) * Math.PI * 2;
        const dist = 70 + (i % 3) * 18;
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist,
              opacity: 0,
              scale: 0.3,
            }}
            transition={{ duration: 1.1, delay: 0.35, ease: "easeOut" }}
            className="absolute left-1/2 top-1/2 h-2 w-2 rounded-sm"
            style={{ background: CONFETTI_COLORS[i % CONFETTI_COLORS.length] }}
          />
        );
      })}
    </>
  );
}

/* ── Big animated status badge ── */
function StatusBadge({ variant }) {
  const reduce = useReducedMotion();

  const config = {
    loading: { icon: LoaderCircle, grad: "linear-gradient(135deg,#0D9488,#4F46E5)", spin: true },
    success: { icon: Check, grad: "linear-gradient(135deg,#0D9488,#16A34A)" },
    expired: { icon: AlertTriangle, grad: "linear-gradient(135deg,#D97706,#EA580C)" },
    error: { icon: MailCheck, grad: "linear-gradient(135deg,#4F46E5,#0D9488)" },
  }[variant];

  const Icon = config.icon;
  const ringColor = variant === "expired" ? "var(--highlight)" : "var(--primary)";

  return (
    <div className="relative mx-auto flex h-36 w-36 items-center justify-center">
      {!reduce &&
        variant !== "loading" &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border"
            style={{ borderColor: ringColor }}
            initial={{ scale: 0.55, opacity: 0.5 }}
            animate={{ scale: 1.25, opacity: 0 }}
            transition={{ duration: 3, repeat: Infinity, delay: i, ease: "easeOut" }}
          />
        ))}

      {!reduce && variant === "loading" && (
        <motion.div
          className="absolute inset-3"
          animate={{ rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
        >
          <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-[color:var(--secondary)] shadow-[0_0_12px_var(--secondary)]" />
        </motion.div>
      )}

      <motion.div
        key={variant}
        initial={{ scale: 0.4, opacity: 0, rotate: -20 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className="relative flex h-20 w-20 items-center justify-center rounded-3xl shadow-xl"
        style={{ background: config.grad }}
      >
        <Icon
          className={`h-9 w-9 text-white ${config.spin ? "animate-spin" : ""}`}
          strokeWidth={variant === "success" ? 3 : 1.8}
        />
        {variant === "success" && <ConfettiBurst />}
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const { user, verificationLoading, verificationState, verificationMessage } =
    useSelector((state) => state.auth);

  const verifiedTokenRef = useRef(null);

  useEffect(() => {
    if (!token || verifiedTokenRef.current === token) return;
    verifiedTokenRef.current = token;
    dispatch(verifyEmailUser(token));
  }, [dispatch, token]);

  const handleResend = async () => {
    const result = await dispatch(resendVerificationEmail());
    if (resendVerificationEmail.fulfilled.match(result)) {
      navigate("/verify-required", {
        replace: true,
        state: { email: user?.email },
      });
    }
  };

  const isSuccess =
    verificationState === "success" || verificationState === "already-verified";
  const isExpired = verificationState === "expired";
  const isLoading = verificationLoading || (!verificationState && !!token);

  const variant = isLoading
    ? "loading"
    : isSuccess
    ? "success"
    : isExpired
    ? "expired"
    : "error";

  const content = {
    loading: {
      eyebrow: "Verifying",
      title: "Verifying your email…",
      desc: "Please wait while we confirm your address.",
    },
    success: {
      eyebrow: "All set",
      title: "Email verified!",
      desc:
        verificationMessage ||
        "Your account is ready. Let's get your team brainstorming.",
    },
    expired: {
      eyebrow: "Link expired",
      title: "This link has expired",
      desc:
        verificationMessage ||
        "Request a fresh verification link and we'll send it to your inbox.",
    },
    error: {
      eyebrow: "Link problem",
      title: "This link is no longer usable",
      desc:
        verificationMessage ||
        "The link may have already been used or is invalid. Request a new one to continue.",
    },
  }[variant];

  const steps = [
    { title: "Email sent", desc: "Verification link delivered.", state: "done" },
    {
      title: "Link opened",
      desc: isLoading ? "Checking your link…" : isSuccess ? "Link confirmed." : "Link could not be confirmed.",
      state: isLoading ? "active" : isSuccess ? "done" : "failed",
    },
    {
      title: "Access unlocked",
      desc: isSuccess ? "You're ready to go." : "Waiting for verification.",
      state: isSuccess ? "done" : "pending",
    },
  ];

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[color:var(--background)] px-4 py-10 text-[color:var(--foreground)]">
      {/* background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="hero-blob hero-blob-1" />
        <div className="hero-blob hero-blob-2" />
        <div className="hero-grid-overlay" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex justify-center"
        >
          <BrandLockup size="lg" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)]/85 p-7 shadow-[0_30px_80px_rgba(0,0,0,0.12)] backdrop-blur-xl sm:p-9"
        >
          <StatusBadge variant={variant} />

          <div className="mt-6 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--primary)]">
              {content.eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              {content.title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-muted)]">
              {content.desc}
            </p>
          </div>

          {/* steps */}
          <ol className="mt-7 space-y-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/70 p-4">
            {steps.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.12 }}
                className="flex items-start gap-3"
              >
                <span
                  className={`relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                    s.state === "done"
                      ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                      : s.state === "active"
                      ? "border-[color:var(--primary)] text-[color:var(--primary)]"
                      : s.state === "failed"
                      ? "border-[color:var(--danger)] text-[color:var(--danger)]"
                      : "border-[color:var(--border-strong)] text-[color:var(--foreground-muted)]"
                  }`}
                >
                  {s.state === "done" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : s.state === "failed" ? (
                    "!"
                  ) : (
                    i + 1
                  )}
                  {s.state === "active" && (
                    <span className="absolute inset-0 animate-ping rounded-full border border-[color:var(--primary)] opacity-60" />
                  )}
                </span>
                <div>
                  <p
                    className={`text-sm font-semibold ${
                      s.state === "pending"
                        ? "text-[color:var(--foreground-muted)]"
                        : "text-[color:var(--foreground)]"
                    }`}
                  >
                    {s.title}
                  </p>
                  <p className="text-xs text-[color:var(--foreground-muted)]">{s.desc}</p>
                </div>
              </motion.li>
            ))}
          </ol>

          {/* actions */}
          <div className="mt-6 flex flex-col gap-3">
            {isSuccess && (
              <Link
                to="/dashboard"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 text-sm font-semibold text-[color:var(--primary-foreground)] shadow-lg transition hover:bg-[color:var(--primary-hover)]"
              >
                Continue to Scrybe
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}

            {!isSuccess && !isLoading && (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={handleResend}
                  disabled={verificationLoading}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 text-sm font-semibold text-[color:var(--primary-foreground)] shadow-lg transition hover:bg-[color:var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className="h-4 w-4" />
                  Resend verification email
                </motion.button>

                <button
                  type="button"
                  onClick={() => {
                    dispatch(clearAuthState());
                    navigate("/login", { replace: true });
                  }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] px-4 text-sm font-semibold text-[color:var(--foreground)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
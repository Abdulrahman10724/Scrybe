import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Mail, RefreshCw, Check, ArrowLeft, ShieldCheck } from "lucide-react";

import { BrandLockup } from "../components/ui/BrandMark";
import { resendVerificationEmail, clearAuthState, bootstrapAuth } from "../redux/authSlice";

const COOLDOWN_SECONDS = 30;

function EnvelopeHero() {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto flex h-36 w-36 items-center justify-center">
      {/* ping rings */}
      {!reduce &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border border-[color:var(--primary)]"
            initial={{ scale: 0.55, opacity: 0.5 }}
            animate={{ scale: 1.25, opacity: 0 }}
            transition={{ duration: 3, repeat: Infinity, delay: i * 1, ease: "easeOut" }}
          />
        ))}

      {/* orbit */}
      {!reduce && (
        <motion.div
          className="absolute inset-3"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        >
          <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-[color:var(--secondary)] shadow-[0_0_12px_var(--secondary)]" />
        </motion.div>
      )}

      {/* envelope tile */}
      <motion.div
        animate={reduce ? {} : { y: [0, -8, 0], rotate: [-2, 2, -2] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="relative flex h-20 w-20 items-center justify-center rounded-3xl shadow-xl"
        style={{ background: "linear-gradient(135deg,#0D9488,#4F46E5)" }}
      >
        <Mail className="h-9 w-9 text-white" strokeWidth={1.8} />
        <motion.span
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[color:var(--surface)] bg-[color:var(--highlight)] text-[10px] font-bold text-white"
          animate={reduce ? {} : { scale: [1, 1.2, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          1
        </motion.span>
      </motion.div>
    </div>
  );
}

function Step({ index, state, title, desc }) {
  const done = state === "done";
  const active = state === "active";
  return (
    <motion.li
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5 + index * 0.12 }}
      className="flex items-start gap-3"
    >
      <span
        className={`relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
          done
            ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
            : active
            ? "border-[color:var(--primary)] text-[color:var(--primary)]"
            : "border-[color:var(--border-strong)] text-[color:var(--foreground-muted)]"
        }`}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
        {active && (
          <span className="absolute inset-0 animate-ping rounded-full border border-[color:var(--primary)] opacity-60" />
        )}
      </span>
      <div>
        <p className={`text-sm font-semibold ${state === "pending" ? "text-[color:var(--foreground-muted)]" : "text-[color:var(--foreground)]"}`}>
          {title}
        </p>
        <p className="text-xs text-[color:var(--foreground-muted)]">{desc}</p>
      </div>
    </motion.li>
  );
}

export default function VerifyRequiredPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, verificationLoading, verificationMessage } = useSelector((state) => state.auth);
  const [feedback, setFeedback] = useState(verificationMessage || "");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    setFeedback(verificationMessage || "");
  }, [verificationMessage]);

  // Already verified (maybe in another tab) → redirect
  useEffect(() => {
    if (isAuthenticated && user?.emailVerified) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, user?.emailVerified, navigate]);

  // Poll session every 5s
  useEffect(() => {
    if (!isAuthenticated || user?.emailVerified) return undefined;
    const interval = setInterval(() => {
      dispatch(bootstrapAuth());
    }, 5000);
    return () => clearInterval(interval);
  }, [dispatch, isAuthenticated, user?.emailVerified]);

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0) return;
    const result = await dispatch(resendVerificationEmail());
    if (resendVerificationEmail.fulfilled.match(result)) {
      setFeedback("Verification email sent. Please check your inbox.");
      setCooldown(COOLDOWN_SECONDS);
      return;
    }
    setFeedback(result.payload?.message || "We couldn't send another verification email. Please try again shortly.");
  };

  const email = location.state?.email || user?.email || "your inbox";

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
          <EnvelopeHero />

          <div className="mt-6 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--primary)]">
              Verify your email
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Check your inbox</h1>
            <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-muted)]">
              We sent a verification link to
            </p>
            <div className="mx-auto mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-1.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[color:var(--primary)]" />
              <span className="truncate text-sm font-medium">{email}</span>
            </div>
          </div>

          {/* steps */}
          <ol className="mt-7 space-y-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/70 p-4">
            <Step index={0} state="done" title="Email sent" desc="Verification link is on its way." />
            <Step index={1} state="active" title="Open the link" desc="Click the button inside the email." />
            <Step index={2} state="pending" title="Access unlocked" desc="You'll be redirected automatically." />
          </ol>

          {/* live status */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[color:var(--foreground-muted)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--primary)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--primary)]" />
            </span>
            Waiting for verification · checking automatically
          </div>

          <AnimatePresence>
            {feedback && (
              <motion.div
                key={feedback}
                initial={{ opacity: 0, height: 0, y: -6 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 rounded-xl border border-[color:var(--primary)]/25 bg-[color:var(--primary)]/10 px-3 py-2.5 text-center text-sm">
                  {feedback}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* actions */}
          <div className="mt-6 flex flex-col gap-3">
            <motion.button
              whileHover={{ scale: cooldown > 0 ? 1 : 1.02 }}
              whileTap={{ scale: cooldown > 0 ? 1 : 0.97 }}
              type="button"
              onClick={handleResend}
              disabled={verificationLoading || cooldown > 0}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 text-sm font-semibold text-[color:var(--primary-foreground)] shadow-lg transition hover:bg-[color:var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${verificationLoading ? "animate-spin" : ""}`} />
              {verificationLoading
                ? "Sending…"
                : cooldown > 0
                ? `Resend in ${cooldown}s`
                : "Resend verification email"}
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
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-[color:var(--foreground-muted)]">
            Didn't get it? Check your spam folder. If you already verified, just sign in again.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
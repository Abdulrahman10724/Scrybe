import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, KeyRound, TimerOff } from "lucide-react";
import { toast } from "sonner";

import AuthSplitLayout from "../components/layout/AuthSplitLayout";
import { authButtonClass, authInputClass } from "../lib/auth-form.styles";
import authService from "../services/auth.service";

// Same rules as registration (and the backend's passwordSchema).
const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .max(128, "Password must be 128 characters or less"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

function DeadLink({ title, body }) {
  return (
    <div>
      <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
        <TimerOff className="h-5 w-5" />
      </div>
      <h1 className="text-2xl font-bold text-[color:var(--foreground)]">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-muted)]">{body}</p>
      <Link
        to="/forgot-password"
        className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[color:var(--primary)] text-sm font-semibold text-[color:var(--primary-foreground)] hover:bg-[color:var(--primary-hover)]"
      >
        Request a new link
      </Link>
      <Link
        to="/login"
        className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[color:var(--border)] text-sm font-semibold text-[color:var(--foreground)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]"
      >
        Back to sign in
      </Link>
    </div>
  );
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [linkState, setLinkState] = useState(token ? "ok" : "invalid"); // ok | invalid | expired
  const [error, setError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { password: "", confirmPassword: "" } });

  const onSubmit = async ({ password }) => {
    setSubmitting(true);
    setError(null);
    try {
      await authService.resetPassword({ token, password });
      toast.success("Password updated. Please sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (err) {
      if (err?.code === "RESET_TOKEN_EXPIRED" || err?.status === 410) {
        setLinkState("expired");
      } else if (err?.code === "RESET_TOKEN_INVALID") {
        setLinkState("invalid");
      } else {
        setError(err?.message || "We couldn't reset your password. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (linkState === "expired") {
    return (
      <AuthSplitLayout>
        <DeadLink
          title="This link has expired"
          body="Password reset links are valid for 1 hour. Request a new one and use it within the hour."
        />
      </AuthSplitLayout>
    );
  }

  if (linkState === "invalid") {
    return (
      <AuthSplitLayout>
        <DeadLink
          title="This link can't be used"
          body="The reset link is invalid or has already been used. Each link works only once — request a new one if you still need to reset your password."
        />
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout>
      <div className="mb-8">
        <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
          <KeyRound className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold text-[color:var(--foreground)]">Choose a new password</h1>
        <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">
          This signs you out of every device. You'll sign in again with the new password.
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-[color:var(--danger)]/30 bg-[color:var(--danger-soft)] px-3.5 py-3 text-sm text-[color:var(--danger)]">
          {error}
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label className="block text-xs font-semibold text-[color:var(--foreground-secondary)] mb-1.5">New password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              className={`${authInputClass} pr-10`}
              disabled={submitting}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground)] transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <p className="mt-1.5 text-xs text-[color:var(--danger)]">{errors.password.message}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[color:var(--foreground-secondary)] mb-1.5">
            Confirm new password
          </label>
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className={authInputClass}
            disabled={submitting}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="mt-1.5 text-xs text-[color:var(--danger)]">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button type="submit" disabled={submitting} className={authButtonClass}>
          {submitting ? "Saving…" : "Reset password"}
        </button>
      </form>
    </AuthSplitLayout>
  );
}

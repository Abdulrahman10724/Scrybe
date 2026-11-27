import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";

import AuthSplitLayout from "../components/layout/AuthSplitLayout";
import { authButtonClass, authInputClass } from "../lib/auth-form.styles";
import authService from "../services/auth.service";

const schema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
});

export default function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const [error, setError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = async ({ email }) => {
    setSubmitting(true);
    setError(null);
    try {
      await authService.forgotPassword(email);
      setSentTo(email);
    } catch (err) {
      setError(
        err?.status === 429
          ? "Too many reset requests. Please wait a few minutes and try again."
          : err?.message || "We couldn't process that request. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthSplitLayout>
      {sentTo ? (
        <div>
          <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
            <MailCheck className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-[color:var(--foreground)]">Check your email</h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-muted)]">
            If an account exists for <span className="font-medium text-[color:var(--foreground)]">{sentTo}</span>,
            we've sent a link to reset the password. The link expires in 1 hour and works once. Check your spam folder
            if it doesn't arrive.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[color:var(--border)] text-sm font-semibold text-[color:var(--foreground)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[color:var(--foreground)]">Forgot your password?</h1>
            <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">
              Enter your email and we'll send you a link to choose a new one.
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-lg border border-[color:var(--danger)]/30 bg-[color:var(--danger-soft)] px-3.5 py-3 text-sm text-[color:var(--danger)]">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="block text-xs font-semibold text-[color:var(--foreground-secondary)] mb-1.5">
                Email address
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                className={authInputClass}
                disabled={submitting}
                {...register("email")}
              />
              {errors.email && <p className="mt-1.5 text-xs text-[color:var(--danger)]">{errors.email.message}</p>}
            </div>

            <button type="submit" disabled={submitting} className={authButtonClass}>
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </form>

          <p className="mt-6 text-xs text-center text-[color:var(--foreground-muted)]">
            Remembered it?{" "}
            <Link to="/login" className="text-[color:var(--primary)] font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthSplitLayout>
  );
}

import { z } from "zod";

const nameSchema = z.string().trim().min(2, "Name must be at least 2 characters long").max(100, "Name must be 100 characters or less");
const emailSchema = z.string().trim().email("Please provide a valid email address").max(255, "Email must be 255 characters or less");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters long").max(128, "Password must be 128 characters or less");

const registerSchema = z.object({
  body: z.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, "Password is required"),
  }),
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

// Same password rules as registration.
const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().trim().min(1, "Reset token is required").max(256, "Reset token is invalid"),
    password: passwordSchema,
  }),
});

export { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, passwordSchema };

export default {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
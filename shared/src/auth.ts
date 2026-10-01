import { z } from "zod";

export const USERNAME_MAX_LENGTH = 50;
export const DISPLAY_NAME_MAX_LENGTH = 50;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;
export const SIGNUP_CODE_MAX_LENGTH = 200;

export const UsernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(USERNAME_MAX_LENGTH)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Use only letters, numbers, dots, dashes, and underscores.");

export const LoginRequestSchema = z.object({
  username: UsernameSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const RegisterRequestSchema = LoginRequestSchema.extend({
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  signupCode: z.string().min(1).max(SIGNUP_CODE_MAX_LENGTH),
});

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
}

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;


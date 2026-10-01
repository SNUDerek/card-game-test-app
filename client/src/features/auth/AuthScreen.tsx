import { useState, type FormEvent } from "react";
import {
  DISPLAY_NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH,
  SIGNUP_CODE_MAX_LENGTH, USERNAME_MAX_LENGTH,
} from "@card-table/shared";
import { useCurrentUser } from "./AuthContext";
import "./AuthScreen.css";

export function AuthScreen() {
  const { login, register } = useCurrentUser();
  const [registering, setRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (registering) await register({ username, displayName, password, signupCode });
      else await login({ username, password });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <h1>Card Table</h1>
        <p>{registering ? "Create a workspace account" : "Sign in to your workspace"}</p>
        <label htmlFor="auth-username">Username</label>
        <input id="auth-username" value={username} minLength={3} maxLength={USERNAME_MAX_LENGTH}
          autoComplete="username" required onChange={(event) => setUsername(event.target.value)} />
        {registering && <>
          <label htmlFor="auth-display-name">Display name</label>
          <input id="auth-display-name" value={displayName} maxLength={DISPLAY_NAME_MAX_LENGTH}
            autoComplete="nickname" required onChange={(event) => setDisplayName(event.target.value)} />
        </>}
        <label htmlFor="auth-password">Password</label>
        <input id="auth-password" type="password" value={password}
          minLength={registering ? PASSWORD_MIN_LENGTH : 1} maxLength={PASSWORD_MAX_LENGTH}
          autoComplete={registering ? "new-password" : "current-password"} required
          onChange={(event) => setPassword(event.target.value)} />
        {registering && <>
          <label htmlFor="auth-signup-code">Signup code</label>
          <input id="auth-signup-code" type="password" value={signupCode}
            maxLength={SIGNUP_CODE_MAX_LENGTH} autoComplete="off" required
            onChange={(event) => setSignupCode(event.target.value)} />
        </>}
        <button className="auth-submit" disabled={submitting} type="submit">
          {submitting ? "Please wait…" : registering ? "Create account" : "Sign in"}
        </button>
        <button className="auth-switch" type="button" onClick={() => { setRegistering(!registering); setError(null); }}>
          {registering ? "Already have an account? Sign in" : "Need an account? Register"}
        </button>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </form>
    </main>
  );
}


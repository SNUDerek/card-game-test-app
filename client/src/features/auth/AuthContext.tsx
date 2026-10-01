import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import type { CurrentUser, LoginRequest, RegisterRequest } from "@card-table/shared";
import { setUnauthorizedHandler } from "../../api/client";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthValue {
  status: AuthStatus;
  user: CurrentUser | null;
  login(request: LoginRequest): Promise<void>;
  register(request: RegisterRequest): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function authRequest(path: string, init?: RequestInit): Promise<CurrentUser> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  const body = await response.json().catch(() => ({})) as { user?: CurrentUser; error?: string };
  if (!response.ok || !body.user) throw new Error(body.error ?? "Authentication failed.");
  return body.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus("anonymous");
    });
    return () => setUnauthorizedHandler(undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void authRequest("/api/auth/me")
      .then((currentUser) => {
        if (!active) return;
        setUser(currentUser);
        setStatus("authenticated");
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus("anonymous");
      });
    return () => { active = false; };
  }, []);

  const authenticate = useCallback(async (path: string, request: LoginRequest | RegisterRequest) => {
    const currentUser = await authRequest(path, { method: "POST", body: JSON.stringify(request) });
    setUser(currentUser);
    setStatus("authenticated");
  }, []);

  const login = useCallback((request: LoginRequest) => authenticate("/api/auth/login", request), [authenticate]);
  const register = useCallback((request: RegisterRequest) => authenticate("/api/auth/register", request), [authenticate]);
  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(() => ({ status, user, login, register, logout }), [status, user, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCurrentUser(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useCurrentUser must be used inside AuthProvider.");
  return value;
}

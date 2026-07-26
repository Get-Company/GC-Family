"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getCurrentMember,
  getDeviceMembers,
  loginChildWithPin,
  loginParent,
  refreshAccessToken,
  setAccessToken,
  setUnauthorizedHandler,
  type Me,
  type Member,
} from "@/lib/api";

const ACCESS_TOKEN_KEY = "gc-family-access-token";
const DEVICE_TOKEN_KEY = "gc-family-device-token";
const REFRESH_TOKEN_KEY = "gc-family-refresh-token";

type AuthState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | {
      kind: "authenticated";
      me: Me;
      deviceMembers: Member[];
    };

type AuthContextValue = {
  state: AuthState;
  loginParent: (email: string, password: string) => Promise<void>;
  unlockChild: (memberId: number, pin: string) => Promise<void>;
  switchToParent: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getStored(key: string): string | null {
  return window.sessionStorage.getItem(key);
}

function store(key: string, value: string | null) {
  if (value) {
    window.sessionStorage.setItem(key, value);
  } else {
    window.sessionStorage.removeItem(key);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ kind: "loading" });

  const setActiveToken = useCallback((token: string | null) => {
    setAccessToken(token);
    store(ACCESS_TOKEN_KEY, token);
  }, []);

  const loadAuthenticatedState = useCallback(async (token: string, deviceToken: string) => {
    const [me, deviceMembers] = await Promise.all([
      getCurrentMember(token),
      getDeviceMembers(deviceToken),
    ]);
    setState({ kind: "authenticated", me, deviceMembers });
  }, []);

  const logout = useCallback(() => {
    setActiveToken(null);
    store(DEVICE_TOKEN_KEY, null);
    store(REFRESH_TOKEN_KEY, null);
    setState({ kind: "anonymous" });
    router.replace("/login");
  }, [router, setActiveToken]);

  useEffect(() => {
    const restore = async () => {
      const storedAccess = getStored(ACCESS_TOKEN_KEY);
      let deviceToken = getStored(DEVICE_TOKEN_KEY);
      const refreshToken = getStored(REFRESH_TOKEN_KEY);
      if (!storedAccess || !deviceToken) {
        setState({ kind: "anonymous" });
        return;
      }

      setAccessToken(storedAccess);
      try {
        await loadAuthenticatedState(storedAccess, deviceToken);
      } catch {
        if (!refreshToken) {
          logout();
          return;
        }
        try {
          const refreshed = await refreshAccessToken(refreshToken);
          deviceToken = refreshed.access;
          store(DEVICE_TOKEN_KEY, deviceToken);
          setActiveToken(deviceToken);
          await loadAuthenticatedState(deviceToken, deviceToken);
        } catch {
          logout();
        }
      }
    };
    void restore();
  }, [loadAuthenticatedState, logout, setActiveToken]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      async loginParent(email, password) {
        const tokens = await loginParent(email, password);
        store(DEVICE_TOKEN_KEY, tokens.access);
        store(REFRESH_TOKEN_KEY, tokens.refresh);
        setActiveToken(tokens.access);
        await loadAuthenticatedState(tokens.access, tokens.access);
      },
      async unlockChild(memberId, pin) {
        const deviceToken = getStored(DEVICE_TOKEN_KEY);
        if (!deviceToken) {
          throw new Error("Bitte melde zuerst ein Elternkonto an.");
        }
        const childToken = await loginChildWithPin(memberId, pin, deviceToken);
        setActiveToken(childToken.access);
        await loadAuthenticatedState(childToken.access, deviceToken);
      },
      async switchToParent() {
        const deviceToken = getStored(DEVICE_TOKEN_KEY);
        if (!deviceToken) {
          throw new Error("Bitte melde zuerst ein Elternkonto an.");
        }
        setActiveToken(deviceToken);
        await loadAuthenticatedState(deviceToken, deviceToken);
      },
      logout,
    }),
    [loadAuthenticatedState, logout, setActiveToken, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth muss innerhalb von AuthProvider verwendet werden.");
  }
  return context;
}

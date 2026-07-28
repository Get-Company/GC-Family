"use client";

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
  loginWithPin,
  refreshAccessToken,
  setAccessToken,
  setUnauthorizedHandler,
  type Me,
} from "@/lib/api";

const ACCESS_TOKEN_KEY = "gc-family-access-token";
// Einmalige Migration des alten Familiengerät-Modus: Dort konnte der aktive
// Token zu einem Kinderprofil gehören, während dieser Schlüssel den Eltern-Token hielt.
const LEGACY_DEVICE_TOKEN_KEY = "gc-family-device-token";
const REFRESH_TOKEN_KEY = "gc-family-refresh-token";

type AuthState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | {
      kind: "authenticated";
      me: Me;
    };

type AuthContextValue = {
  state: AuthState;
  loginWithPin: (pin: string) => Promise<void>;
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
  const [state, setState] = useState<AuthState>({ kind: "loading" });

  const setActiveToken = useCallback((token: string | null) => {
    setAccessToken(token);
    store(ACCESS_TOKEN_KEY, token);
  }, []);

  const loadAuthenticatedState = useCallback(async (token: string) => {
    const me = await getCurrentMember(token);
    setState({ kind: "authenticated", me });
  }, []);

  const logout = useCallback(() => {
    setActiveToken(null);
    store(LEGACY_DEVICE_TOKEN_KEY, null);
    store(REFRESH_TOKEN_KEY, null);
    // Ein kompletter Seitenwechsel verhindert, dass eine alte Route mit
    // zwischengespeichertem Auth-State direkt wieder zum Dashboard umleitet.
    window.location.assign("/login");
  }, [setActiveToken]);

  useEffect(() => {
    const restore = async () => {
      const storedAccess = getStored(ACCESS_TOKEN_KEY);
      const legacyParentToken = getStored(LEGACY_DEVICE_TOKEN_KEY);
      const activeParentToken = legacyParentToken ?? storedAccess;
      const refreshToken = getStored(REFRESH_TOKEN_KEY);
      if (!activeParentToken) {
        setState({ kind: "anonymous" });
        return;
      }

      setActiveToken(activeParentToken);
      store(LEGACY_DEVICE_TOKEN_KEY, null);
      try {
        await loadAuthenticatedState(activeParentToken);
      } catch {
        if (!refreshToken) {
          logout();
          return;
        }
        try {
          const refreshed = await refreshAccessToken(refreshToken);
          setActiveToken(refreshed.access);
          await loadAuthenticatedState(refreshed.access);
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
      async loginWithPin(pin) {
        const token = await loginWithPin(pin);
        store(REFRESH_TOKEN_KEY, null);
        setActiveToken(token.access);
        await loadAuthenticatedState(token.access);
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

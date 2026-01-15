import React from "react";
import http from "../api/http";
import { AuthContext } from "./context";

export function AuthProvider({ children }) {
  const [token, setToken] = React.useState(
    () => localStorage.getItem("token") || ""
  );

  const [user, setUser] = React.useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });

  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }, [token]);

  React.useEffect(() => {
    if (user) localStorage.setItem("user", JSON.stringify(user));
    else localStorage.removeItem("user");
  }, [user]);

  const login = async (phone, password) => {
    setLoading(true);
    try {
      const { data } = await http.post("/api/auth/admin/login", {
        phone,
        password,
      });

      if ((data?.user?.role || "user") !== "admin") {
        setToken("");
        setUser(null);
        return { ok: false, message: "Bu panele erişim yetkiniz yok." };
      }

      setToken(data?.token || "");
      setUser(data?.user || null);

      return { ok: true };
    } catch (e) {
      const msg = e?.response?.data?.message || "Login başarısız.";
      return { ok: false, message: msg };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken("");
    setUser(null);
  };

  const value = React.useMemo(
    () => ({
      token,
      user,
      loading,
      login,
      logout,
      isAuthed: !!token,
      isAdmin: user?.role === "admin",
    }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

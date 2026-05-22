import React from "react";
import http from "../api/http";
import { AuthContext } from "./context";

export function AuthProvider({ children }) {
  const [token, setToken] = React.useState(
    () => localStorage.getItem("token") || ""
  );

  const [user, setUser] = React.useState(() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem("user");
      return null;
    }
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

  React.useEffect(() => {
    if (!token) return;

    const role = user?.role;
    if (role === "admin" || role === "vet") return;

    setToken("");
    setUser(null);
  }, [token, user]);

  const login = async (loginType, identifier, password) => {
    setLoading(true);
    try {
      const isVetLogin = loginType === "vet";
      const endpoint = isVetLogin ? "/api/auth/vet/login" : "/api/auth/admin/login";
      const payload = isVetLogin
        ? { username: identifier, password }
        : { phone: identifier, password };

      const { data } = await http.post(endpoint, payload);
      const role = data?.user?.role || "user";

      if (!isVetLogin && role !== "admin") {
        setToken("");
        setUser(null);
        return { ok: false, message: "Bu panele erişim yetkiniz yok." };
      }

      if (isVetLogin && role !== "vet") {
        setToken("");
        setUser(null);
        return { ok: false, message: "Bu hesap klinik paneline erişim için yetkili değil." };
      }

      setToken(data?.token || "");
      setUser(data?.user || null);

      return { ok: true, role };
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
      isVet: user?.role === "vet",
    }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

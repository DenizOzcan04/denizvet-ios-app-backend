import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

import newLogo from "../assets/newLogo.png";

export default function Login() {
  const { login, loading } = useAuth();
  const nav = useNavigate();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    const res = await login(phone, password);
    if (!res.ok) return setErr(res.message);

    nav("/", { replace: true });
  };

  return (
    <div className="auth auth--full">
      <div className="authBg">
        <div className="authBg__inner">
          <div className="authBg__badge">DenizVet Admin</div>
          <h1 className="authBg__title">Panel Girişi</h1>
          <p className="authBg__desc">
            Randevu, klinik ve içerik yönetimini tek yerden kontrol et.
          </p>

          <div className="authBg__stats">
            <div className="authBg__stat">
              <span className="authBg__statIcon">⚡</span>
              <span>Hızlı yönetim</span>
            </div>
            <div className="authBg__stat">
              <span className="authBg__statIcon">🔒</span>
              <span>Güvenli oturum</span>
            </div>
            <div className="authBg__stat">
              <span className="authBg__statIcon">📅</span>
              <span>Takvim & randevu</span>
            </div>
          </div>
        </div>

        <span className="authBg__blob authBg__blob--1" />
        <span className="authBg__blob authBg__blob--2" />
        <span className="authBg__blob authBg__blob--3" />
      </div>

      <div className="authCenter">
        <form className="authCard authCard--glass" onSubmit={onSubmit}>
          <div className="authCard__top">
            <img className="authCard__logo" src={newLogo} alt="DenizVet Logo" />
            <div>
              <h2 className="authCard__title">Admin Giriş</h2>
              <p className="authCard__subtitle">
                Telefon numaran ve şifrenle giriş yap.
              </p>
            </div>
          </div>

          <div className="field">
            <label className="field__label">Telefon</label>
            <div className="field__control">
              <span className="field__icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M10 19h4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5555555555"
                autoComplete="username"
                inputMode="numeric"
                required
              />
            </div>
          </div>

          <div className="field">
            <label className="field__label">Şifre</label>
            <div className="field__control">
              <span className="field__icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M7 11V8a5 5 0 0 1 10 0v3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M6.5 11h11A2.5 2.5 0 0 1 20 13.5v6A2.5 2.5 0 0 1 17.5 22h-11A2.5 2.5 0 0 1 4 19.5v-6A2.5 2.5 0 0 1 6.5 11Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          {err && (
            <div className="authAlert" role="alert">
              {err}
            </div>
          )}

          <button className="authBtn" disabled={loading}>
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>

          <div className="authCard__hint">
            <span className="authCard__hintDot" />
            <span>Yetkisiz erişimler kayıt altına alınır.</span>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

function getPageMeta(pathname) {
  if (pathname === "/" || pathname === "") {
    return {
      page: "Dashboard",
      desc: "Genel durum ve hızlı erişim alanı. Veriler anlık olarak güncellenir.",
    };
  }
  if (pathname.startsWith("/blogs")) {
    return {
      page: "Bloglar",
      desc: "Blog içeriklerini ekleyebilir, düzenleyebilir ve silebilirsin.",
    };
  }
  if (pathname.startsWith("/clinics")) {
    return {
      page: "Klinikler",
      desc: "Klinik kayıtlarını yönetebilir, güncelleyebilir ve silebilirsin.",
    };
  }
  if (pathname.startsWith("/appointments")) {
    return {
      page: "Randevular",
      desc: "Tüm randevuları görüntüleyebilir ve hatalı kayıtları silebilirsin.",
    };
  }
  return { page: "Admin", desc: "Yönetim ekranı" };
}

export default function Topbar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const meta = useMemo(() => getPageMeta(location.pathname), [location.pathname]);

  const displayName = user?.name || user?.email || "Admin";
  const initial = String(displayName || "A").trim().charAt(0).toUpperCase();

  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="topbar__badge">Admin Panel</div>

        <div className="topbar__titles">
          <div className="topbar__page">{meta.page}</div>
          <div className="topbar__desc">{meta.desc}</div>
        </div>
      </div>

      <div className="topbar__right">
        <div className="topbarUser" title={displayName}>
          <div className="topbarUser__avatar" aria-hidden="true">
            {initial}
          </div>
          <div className="topbarUser__meta">
            <div className="topbarUser__name">{displayName}</div>
            <div className="topbarUser__role">Admin</div>
          </div>
        </div>

        <button className="btn topbarLogout" onClick={logout}>
          Çıkış
        </button>
      </div>
    </header>
  );
}

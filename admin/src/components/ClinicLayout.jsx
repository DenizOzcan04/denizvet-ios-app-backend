import ClinicSidebar from "./ClinicSidebar";
import { useAuth } from "../auth/useAuth";

export default function ClinicLayout({ children, title = "Klinik Panel", description = "Klinik işlemlerinizi buradan yönetebilirsiniz." }) {
  const { user, logout } = useAuth();

  const displayName =
    user?.username ||
    [user?.name, user?.surname].filter(Boolean).join(" ").trim() ||
    user?.email ||
    "Klinik";

  return (
    <div className="shell clinic-layout">
      <ClinicSidebar />
      <main className="main clinic-main">
        <header className="topbar clinic-topbar">
          <div className="topbar__left clinic-topbar__left">
            <div className="topbar__badge clinic-badge">Klinik Panel</div>
            <div className="topbar__titles clinic-topbar__titles">
              <div className="topbar__page clinic-topbar__page">{title}</div>
              <div className="topbar__desc clinic-topbar__desc">{description}</div>
            </div>
          </div>

          <div className="topbar__right clinic-topbar__right">
            <div className="topbarUser clinic-topbar-user" title={displayName}>
              <div className="topbarUser__avatar clinic-topbar-user__avatar" aria-hidden="true">
                {String(displayName).trim().charAt(0).toUpperCase()}
              </div>
              <div className="topbarUser__meta clinic-topbar-user__meta">
                <div className="topbarUser__name clinic-topbar-user__name">{displayName}</div>
                <div className="topbarUser__role clinic-topbar-user__role">Veteriner Klinik</div>
              </div>
            </div>

            <button className="btn topbarLogout clinic-button clinic-button--logout" onClick={logout}>
              Çıkış
            </button>
          </div>
        </header>

        <div className="content clinic-content">{children}</div>
      </main>
    </div>
  );
}

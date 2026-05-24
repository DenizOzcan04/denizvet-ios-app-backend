import { NavLink } from "react-router-dom";
import logo from "../assets/logo.png";

export default function ClinicSidebar() {
  return (
    <aside className="sidebar clinic-sidebar">
      <div className="brand clinic-brand">
        <img className="brand__logo" src={logo} alt="DenizVet" />
        <div className="brand__text clinic-brand__text">
          <div className="brand__title clinic-brand__title">DenizVet</div>
          <div className="brand__sub clinic-brand__sub">Klinik Panel</div>
        </div>
      </div>

      <nav className="nav clinic-nav">
        <NavLink
          to="/clinic"
          end
          className={({ isActive }) => `navLink clinic-nav-link ${isActive ? "active clinic-active" : ""}`}
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/clinic/appointments"
          className={({ isActive }) => `navLink clinic-nav-link ${isActive ? "active clinic-active" : ""}`}
        >
          Aktif Randevular
        </NavLink>

        <NavLink
          to="/clinic/cancel-requests"
          className={({ isActive }) => `navLink clinic-nav-link ${isActive ? "active clinic-active" : ""}`}
        >
          İptal Talepleri
        </NavLink>

        <NavLink
          to="/clinic/history"
          className={({ isActive }) => `navLink clinic-nav-link ${isActive ? "active clinic-active" : ""}`}
        >
          Geçmiş Randevular
        </NavLink>

        <NavLink
          to="/clinic/slots"
          className={({ isActive }) => `navLink clinic-nav-link ${isActive ? "active clinic-active" : ""}`}
        >
          Slot Yönetimi
        </NavLink>

        <NavLink
          to="/clinic/profile"
          className={({ isActive }) => `navLink clinic-nav-link ${isActive ? "active clinic-active" : ""}`}
        >
          Klinik Bilgilerim
        </NavLink>
      </nav>
    </aside>
  );
}

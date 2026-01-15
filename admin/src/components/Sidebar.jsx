import { NavLink } from "react-router-dom";
import logo from "../assets/logo.png"; // gerekiyorsa yolu düzelt: ../../assets/logo.png

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand__logo" src={logo} alt="DenizVet" />
        <div className="brand__text">
          <div className="brand__title">DenizVet</div>
          <div className="brand__sub">Admin Panel</div>
        </div>
      </div>

      <nav className="nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `navLink ${isActive ? "active" : ""}`}
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/blogs"
          className={({ isActive }) => `navLink ${isActive ? "active" : ""}`}
        >
          Bloglar
        </NavLink>

        <NavLink
          to="/clinics"
          className={({ isActive }) => `navLink ${isActive ? "active" : ""}`}
        >
          Klinikler
        </NavLink>

        <NavLink
          to="/appointments"
          className={({ isActive }) => `navLink ${isActive ? "active" : ""}`}
        >
          Randevular
        </NavLink>
      </nav>
    </aside>
  );
}

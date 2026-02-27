import { NavLink, Outlet } from "react-router-dom";
import { useAppContext } from "../hooks/useAppContext";

export default function AdminLayout() {
  const { logout } = useAppContext();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">SISTRUN HUB</p>
          <h1>슈퍼 어드민</h1>
        </div>

        <nav className="nav-list">
          <NavLink to="/apk" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            APK관리
          </NavLink>
          <NavLink to="/devices" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            기기관리
          </NavLink>
          <NavLink to="/store" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            앱스토어 모니터
          </NavLink>
        </nav>
      </aside>

      <main className="content-area">
        <header className="topbar">
          <button type="button" className="danger-button" onClick={logout}>
            로그아웃
          </button>
        </header>

        <Outlet />
      </main>
    </div>
  );
}

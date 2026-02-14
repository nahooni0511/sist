import { NavLink, Outlet } from "react-router-dom";
import { useAppContext } from "../hooks/useAppContext";

export default function AdminLayout() {
  const { baseUrl, adminToken, setBaseUrl, setAdminToken } = useAppContext();

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
        </nav>
      </aside>

      <main className="content-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">CONTROL PANEL</p>
            <h2>공원 설치 단말 운영 콘솔</h2>
          </div>
          <div className="connection-inline">
            <label>
              API Base URL
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="http://localhost:4000"
              />
            </label>
            <label>
              Admin Token
              <input
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                placeholder="x-admin-token"
              />
            </label>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}

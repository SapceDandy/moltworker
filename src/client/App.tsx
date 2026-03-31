import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import GoalsPage from './pages/GoalsPage';
import SchedulePage from './pages/SchedulePage';
import SettingsPage from './pages/SettingsPage';
import BoardPage from './pages/BoardPage';
import LeadsPage from './pages/LeadsPage';
import ActionsPage from './pages/ActionsPage';
import CadencePage from './pages/CadencePage';
import ResearchPage from './pages/ResearchPage';
import './App.css';

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <header className="app-header">
          <img src="/logo-small.png" alt="Moltworker" className="header-logo" />
          <h1>Kudjo</h1>
          <nav className="app-nav">
            <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Dashboard</NavLink>
            <NavLink to="/board" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Board</NavLink>
            <NavLink to="/projects" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Projects</NavLink>
            <NavLink to="/leads" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Leads</NavLink>
            <NavLink to="/actions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Actions</NavLink>
            <NavLink to="/cadence" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Cadence</NavLink>
            <NavLink to="/goals" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Goals</NavLink>
            <NavLink to="/schedule" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Schedule</NavLink>
            <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Settings</NavLink>
            <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Admin</NavLink>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/board" element={<BoardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectsPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/research/:leadId" element={<ResearchPage />} />
            <Route path="/actions" element={<ActionsPage />} />
            <Route path="/cadence" element={<CadencePage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

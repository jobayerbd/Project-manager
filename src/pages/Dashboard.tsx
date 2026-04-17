import { useAuth } from '../hooks/useAuth';
import AdminDashboard from './AdminDashboard';
import CoordinatorDashboard from './CoordinatorDashboard';
import SCDashboard from './SiteCoordinatorDashboard';
import { ViewType } from '../components/layout/Sidebar';

export default function Dashboard({ view, onViewChange }: { view: ViewType; onViewChange: (view: ViewType) => void }) {
  const { profile } = useAuth();

  if (!profile) return null;

  const role = profile.role?.toUpperCase();

  // Global override for Admin functionality
  if (view === 'ADMINISTRATION' && role === 'ADMIN') {
    return <AdminDashboard view={view} onViewChange={onViewChange} />;
  }

  switch (role) {
    case 'ADMIN':
      return <AdminDashboard view={view} onViewChange={onViewChange} />;
    case 'COORDINATOR':
      return <CoordinatorDashboard view={view} onViewChange={onViewChange} />;
    case 'SITE_COORDINATOR':
      return <SCDashboard view={view} onViewChange={onViewChange} />;
    default:
      // Fallback for old role names
      if (role === 'PROJECT_COORDINATOR' || role === 'COORDINATOR') {
        return <CoordinatorDashboard view={view} onViewChange={onViewChange} />;
      }
      if (role === 'SITE_MANAGER') {
        return <SCDashboard view={view} onViewChange={onViewChange} />;
      }
      return <div>Invalid role: {profile.role}</div>;
  }
}

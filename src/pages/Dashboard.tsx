import { useAuth } from '../hooks/useAuth';
import AdminDashboard from './AdminDashboard';
import PCDashboard from './ProjectCoordinatorDashboard';
import SCDashboard from './SiteCoordinatorDashboard';

export default function Dashboard() {
  const { profile } = useAuth();

  if (!profile) return null;

  switch (profile.role) {
    case 'ADMIN':
      return <AdminDashboard />;
    case 'PROJECT_COORDINATOR':
      return <PCDashboard />;
    case 'SITE_COORDINATOR':
      return <SCDashboard />;
    default:
      return <div>Invalid role</div>;
  }
}

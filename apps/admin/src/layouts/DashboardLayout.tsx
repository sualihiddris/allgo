import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/call-in', label: 'Call-In Trip', icon: '📞', highlight: true },  // Section 18
  { path: '/trips', label: 'Trips', icon: '🏍️' },
  { path: '/deliveries', label: 'Deliveries', icon: '📦' },
  { path: '/drivers', label: 'Drivers', icon: '👥' },
  { path: '/subscriptions', label: 'Subscriptions', icon: '💳' },
  { path: '/customers', label: 'Customers', icon: '👤' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

// Section 4B: only visible to super admins
const superAdminNavItems = [
  { path: '/branches', label: 'Branches', icon: '🏢' },
  { path: '/audit-log', label: 'Audit Log', icon: '📋' },
];

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const isSuperAdmin = user?.admin?.role === 'SUPER_ADMIN';
  const visibleNavItems = isSuperAdmin ? [...navItems, ...superAdminNavItems] : navItems;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary-500">AllGo Admin</h1>
        </div>

        {/* Navigation */}
        <nav className="p-4">
          {visibleNavItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                location.pathname === item.path
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* User */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white font-bold">
              {user?.name?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{user?.name || 'Admin'}</p>
              <p className="text-sm text-gray-500 truncate">{user?.phone}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {visibleNavItems.find((item) => item.path === location.pathname)?.label || 'Dashboard'}
          </h2>
        </header>

        {/* Content */}
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

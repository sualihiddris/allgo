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

  const renderNavLink = (item: { path: string; label: string; icon: string }) => {
    const active = location.pathname === item.path;
    return (
      <Link
        key={item.path}
        to={item.path}
        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition duration-150 ${
          active
            ? 'bg-primary-50 font-semibold text-primary-700'
            : 'font-medium text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
        }`}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary-500" />
        )}
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base transition ${
            active ? 'bg-white shadow-sm' : 'bg-transparent group-hover:bg-white/70'
          }`}
        >
          {item.icon}
        </span>
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen">
      {/* Sidebar - flex column so the footer sits after the nav in normal
          flow and can never overlap it; nav scrolls on its own if the list
          ever outgrows the viewport (e.g. super admin's extra items) */}
      <aside className="fixed left-0 top-0 flex h-full w-64 flex-col border-r border-slate-200/80 bg-white/95 backdrop-blur">
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500 text-base font-bold text-white shadow-sm shadow-orange-500/30">
            A
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-900">AllGo</p>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Admin</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {navItems.map(renderNavLink)}

          {isSuperAdmin && (
            <>
              <div className="my-3 flex items-center gap-2 px-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Super Admin</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              {superAdminNavItems.map(renderNavLink)}
            </>
          )}
        </nav>

        {/* User */}
        <div className="shrink-0 border-t border-slate-200/80 p-3">
          <div className="flex items-center gap-3 rounded-xl p-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-sm font-bold text-white shadow-sm">
              {user?.name?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{user?.name || 'Admin'}</p>
              <p className="truncate text-xs text-slate-500">{user?.phone}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <span>↩</span> Sign out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64">
        {/* Header */}
        <header className="sticky top-0 z-10 flex h-16 items-center border-b border-slate-200/80 bg-white/80 px-8 backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">
            {visibleNavItems.find((item) => item.path === location.pathname)?.label || 'Dashboard'}
          </h2>
        </header>

        {/* Content */}
        <div className="mx-auto max-w-7xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

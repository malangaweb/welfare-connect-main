import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { canAccessPath, normalizeRole } from '@/lib/rbac';

const items = [
  { label: 'Executive', href: '/reports' },
  { label: 'Fiscal', href: '/reports/fiscal' },
  { label: 'Compliance', href: '/reports/compliance' },
];

const ReportsSubnav = () => {
  const location = useLocation();
  const currentUserRole = (() => {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return null;
    try {
      const user = JSON.parse(userStr);
      return normalizeRole(user?.role as string | undefined);
    } catch {
      return null;
    }
  })();

  const isActive = (href: string) =>
    location.pathname === href || (href !== '/reports' && location.pathname.startsWith(href));

  const visibleItems = items.filter((item) => canAccessPath(item.href, currentUserRole));

  return (
    <div className="rounded-xl border bg-card p-1">
      <nav className={cn('grid gap-1', visibleItems.length <= 1 ? 'grid-cols-1' : visibleItems.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              'rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors',
              isActive(item.href)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
};

export default ReportsSubnav;

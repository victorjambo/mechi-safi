'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Clock3,
  FlaskConical,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { api, post } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const links = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/predictions/generate', label: 'Generate Predictions', icon: Sparkles },
  { href: '/fixtures', label: 'Upcoming Fixtures', icon: CalendarDays },
  { href: '/predictions/history', label: 'Prediction History', icon: History },
  { href: '/backtesting', label: 'Backtesting', icon: FlaskConical },
  { href: '/performance', label: 'Performance', icon: BarChart3 },
  { href: '/competitions', label: 'Competitions', icon: Trophy },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10000 } },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell>{children}</Shell>
    </QueryClientProvider>
  );
}

function Login() {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => post('/auth/login', { password }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session'] }),
  });
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-5">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white">
            <Activity size={25} />
          </div>
          <CardTitle className="text-xl">Mechi Safi</CardTitle>
          <CardDescription>Football Prediction Benchmark</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              login.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="password">Admin password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {login.error && (
              <p role="alert" className="text-sm text-red-600">
                {login.error.message}
              </p>
            )}
            <Button className="w-full" type="submit" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => api<{ authenticated: boolean; mockMode: boolean }>('/auth/session'),
  });
  const appSettings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ settings: { timezone: string } }>('/settings'),
    enabled: !!session.data?.authenticated,
  });
  useEffect(() => {
    if (appSettings.data?.settings.timezone)
      document.documentElement.dataset.timezone = appSettings.data.settings.timezone;
  }, [appSettings.data]);
  const logout = useMutation({
    mutationFn: () => post('/auth/logout'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session'] }),
  });
  if (session.isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading Mechi Safi…
      </div>
    );
  if (session.isError)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md p-6">
          <h1 className="font-semibold">API unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Start PostgreSQL, Redis, the API, and worker, then refresh this page.
          </p>
          <Button className="mt-4" onClick={() => session.refetch()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  if (!session.data?.authenticated) return <Login />;
  const current =
    links.find((link) => link.href === pathname) ??
    links.find((link) => pathname.startsWith(link.href) && link.href !== '/') ??
    links[0]!;
  const nav = (
    <>
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
          <Activity size={22} strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-base font-bold tracking-tight text-white">Mechi Safi</div>
          <div className="text-[11px] text-slate-400">Football Prediction Benchmark</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-6" aria-label="Main navigation">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-400 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 flex items-center gap-2 px-2 text-xs text-slate-400">
          <ShieldCheck size={15} /> Private workspace
        </div>
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-300 hover:bg-white/10"
          onClick={() => logout.mutate()}
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </>
  );
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#111827] lg:flex">
        {nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-64 flex-col bg-[#111827]"
          >
            <button
              aria-label="Close navigation"
              className="absolute right-3 top-6 text-slate-300"
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>
            {nav}
          </aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-border bg-white/95 px-5 backdrop-blur lg:px-9">
          <div className="flex items-center gap-3">
            <Button
              className="lg:hidden"
              variant="ghost"
              size="icon"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu size={20} />
            </Button>
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Workspace</span>
                <ChevronRight size={13} />
                <span>{current.label}</span>
              </div>
              <h1 className="mt-1 text-lg font-semibold tracking-tight">{current.label}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline-flex',
                session.data.mockMode ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700',
              )}
            >
              {session.data.mockMode ? 'MOCK DATA' : 'LIVE PROVIDERS'}
            </span>
            <span className="hidden items-center gap-1 text-xs text-muted-foreground md:inline-flex">
              <Clock3 size={14} /> {appSettings.data?.settings.timezone ?? 'Africa/Nairobi'}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-primary">
              MS
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] space-y-6 p-5 lg:p-9">{children}</main>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowRight, Delete, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, Store } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';
import { notifySessionChanged } from '@/lib/sessionSync';
import { StaffBrand } from '@/components/staff-brand';
import { StaffThemeToggle } from '@/components/staff-theme';
import { defaultStaffHomePath } from '@/lib/roleHome';
import { usePlatformConfig } from '@/lib/usePlatformConfig';

const LAST_VENUE_STORAGE_KEY = 'dingzi-last-station-venue';

export default function Login() {
  const platformCfg = usePlatformConfig();
  const [mode, setMode] = useState<'email' | 'pin'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);

  const [venueCode, setVenueCode] = useState(() => {
    try {
      return localStorage.getItem(LAST_VENUE_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Login failed');
      const profileRes = await fetch('/api/auth/user', { credentials: 'include' });
      const profile = profileRes.ok ? await profileRes.json() : data.user;
      setPassword('');
      queryClient.clear();
      notifySessionChanged();
      window.location.href = defaultStaffHomePath(profile);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not sign in',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6 || !venueCode.trim()) return;
    setIsLoading(true);
    try {
      const response = await fetch('/api/login/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueCode: venueCode.trim(), pin }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Invalid venue code or station PIN');
      try {
        localStorage.setItem(LAST_VENUE_STORAGE_KEY, venueCode.trim());
      } catch {
        /* Storage optional */
      }
      const profileRes = await fetch('/api/auth/user', { credentials: 'include' });
      const profile = profileRes.ok ? await profileRes.json() : data.user;
      setPin('');
      queryClient.clear();
      notifySessionChanged();
      window.location.href = defaultStaffHomePath(profile);
    } catch (error) {
      setPin('');
      toast({
        variant: 'destructive',
        title: 'Station PIN rejected',
        description: error instanceof Error ? error.message : 'Check your venue slug and 6-digit PIN.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const appendPinDigit = (digit: string) => {
    setPin(prev => (prev.length < 6 ? prev + digit : prev));
  };

  return (
    <div className="staff-login">
      <header className="staff-login-top">
        <StaffThemeToggle />
        <span>dingzi · Hospitality Operations</span>
      </header>
      <main className="staff-login-stage">
        <img className="staff-login-watermark" src="/brand/dingzi-icon-color.svg" alt="" aria-hidden="true" />
        <section className="staff-login-card" aria-labelledby="staff-login-title">
          <StaffBrand />
          <h1 id="staff-login-title">{platformCfg.loginHeadline}</h1>
          <p className="staff-login-description">{platformCfg.loginSubtitle}</p>

          {/* Sign-In Method Switcher */}
          <div
            role="tablist"
            aria-label="Sign-in mode"
            className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#F6F5FC] dark:bg-[#241E42] border border-[#E5E2F2] dark:border-[#312959] mb-4"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'email'}
              data-testid="tab-login-email"
              onClick={() => setMode('email')}
              className={`min-h-11 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                mode === 'email'
                  ? 'bg-[#6236FF] text-white shadow-sm'
                  : 'text-[#57507A] dark:text-white/75 hover:text-[#17132E] dark:hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Admin &amp; Staff Email</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'pin'}
              data-testid="tab-login-pin"
              onClick={() => setMode('pin')}
              className={`min-h-11 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                mode === 'pin'
                  ? 'bg-[#6236FF] text-white shadow-sm'
                  : 'text-[#57507A] dark:text-white/75 hover:text-[#17132E] dark:hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Reception / Station PIN</span>
            </button>
          </div>

          {mode === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="Your work email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="pl-10"
                    data-testid="input-email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={visible ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="pl-10 pr-12"
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    className="staff-password-toggle"
                    disabled={isLoading}
                    onClick={() => setVisible(v => !v)}
                    aria-label={visible ? 'Hide password' : 'Show password'}
                    aria-pressed={visible}
                  >
                    {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="staff-sign-in" disabled={isLoading} data-testid="button-login-submit">
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in to dingzi
                    <ArrowRight />
                  </>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="venue-code">Venue Slug or Name</Label>
                <div className="relative">
                  <Store className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="venue-code"
                    value={venueCode}
                    onChange={e => setVenueCode(e.target.value)}
                    placeholder="e.g. urban-cafe"
                    required
                    disabled={isLoading}
                    data-testid="input-pin-venue"
                    className="pl-10 min-h-11 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="station-pin">6-Digit Reception / Station PIN</Label>
                <Input
                  id="station-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  required
                  disabled={isLoading}
                  data-testid="input-station-pin"
                  className="min-h-12 text-center font-mono text-xl tracking-[0.5em]"
                />
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                    <button
                      key={d}
                      type="button"
                      disabled={isLoading}
                      onClick={() => appendPinDigit(d)}
                      className="min-h-11 rounded-xl border border-[#E5E2F2] dark:border-[#312959] bg-card font-mono font-bold text-base hover:bg-[#EFEAFF] hover:text-[#4B1FE0] active:scale-[0.98] transition-all cursor-pointer"
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => setPin('')}
                    className="min-h-11 rounded-xl border border-[#E5E2F2] dark:border-[#312959] bg-card text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => appendPinDigit('0')}
                    className="min-h-11 rounded-xl border border-[#E5E2F2] dark:border-[#312959] bg-card font-mono font-bold text-base hover:bg-[#EFEAFF] hover:text-[#4B1FE0] active:scale-[0.98] transition-all cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    aria-label="Backspace PIN digit"
                    disabled={isLoading}
                    onClick={() => setPin(p => p.slice(0, -1))}
                    className="min-h-11 rounded-xl border border-[#E5E2F2] dark:border-[#312959] bg-card grid place-items-center text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="staff-sign-in"
                disabled={isLoading || pin.length !== 6 || !venueCode.trim()}
                data-testid="button-pin-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Opening station…
                  </>
                ) : (
                  <>
                    Clock In with PIN
                    <ArrowRight />
                  </>
                )}
              </Button>
            </form>
          )}

          <p className="staff-login-help">{platformCfg.loginHelpText}</p>
        </section>
      </main>
      <footer className="staff-login-footer">dingzi · Hospitality Operating Platform</footer>
    </div>
  );
}

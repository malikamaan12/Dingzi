import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Download, KeyRound, ShieldAlert, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export default function CafeSettings() {
  const { user } = useAuth();
  const [location] = useLocation();
  const platformAccount = location === '/super-admin/account';
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [repeatPassword, setRepeat] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== repeatPassword) {
      return toast({ title: 'Passwords do not match', variant: 'destructive' });
    }
    setBusy(true);
    try {
      await apiRequest('PUT', '/api/account/password', { currentPassword, newPassword });
      setCurrent('');
      setNew('');
      setRepeat('');
      toast({ title: 'Password changed', description: 'Other active sessions for this account were signed out.' });
    } catch (e) {
      toast({ title: 'Could not change password', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function clearMenu() {
    if (!window.confirm('Permanently clear all categories, items, discounts, specials, and price options for this café?')) return;
    setBusy(true);
    try {
      await apiRequest('DELETE', '/api/cafe-menu', { confirmation });
      await queryClient.invalidateQueries();
      setConfirmation('');
      toast({ title: 'Menu cleared' });
    } catch (e) {
      toast({ title: 'Could not clear menu', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function exportMenu() {
    setBusy(true);
    try {
      const response = await apiRequest('GET', '/api/cafe-backup');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'dingzi-branch-backup.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast({ title: 'Could not export branch backup', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="manager-eyebrow">SECURITY &amp; PORTABLE DATA</p>
        <h1 className="text-2xl sm:text-3xl font-bold">
          {platformAccount ? 'My Super Admin Account' : 'Account Security & Branch Recovery'}
        </h1>
      </div>

      {(user?.role !== 'super_admin' || platformAccount) && (
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="w-5 h-5 text-primary" />
              <span>Change Your Password</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Signed-in account: {user?.email}</p>
            <form onSubmit={changePassword} className="space-y-3.5">
              <div>
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={e => setCurrent(e.target.value)}
                  className="h-11 mt-1"
                />
              </div>
              <div>
                <Label htmlFor="new-password">New password (at least 10 characters)</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={72}
                  required
                  value={newPassword}
                  onChange={e => setNew(e.target.value)}
                  className="h-11 mt-1"
                />
              </div>
              <div>
                <Label htmlFor="repeat-password">Confirm new password</Label>
                <Input
                  id="repeat-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={72}
                  required
                  value={repeatPassword}
                  onChange={e => setRepeat(e.target.value)}
                  className="h-11 mt-1"
                />
              </div>
              <Button disabled={busy} className="min-h-11 rounded-xl cursor-pointer">
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {!platformAccount && user?.role === 'super_admin' && user.cafeContext && (
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserCheck className="w-5 h-5 text-primary" />
              <span>Café Manager Account</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{user.cafeContext.owner?.email}</p>
            <Link href={`/super-admin/restaurant/${user.cafeContext.id}`}>
              <Button variant="outline" className="min-h-11 rounded-xl cursor-pointer">
                Open manager account controls
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {!platformAccount && (
        <>
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Download className="w-5 h-5 text-primary" />
                <span>Export Branch Recovery Backup</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Download your complete Dingzi branch configuration (profile, categories, menu items, variants, modifiers, dining zones, tables, curbside bays, aggregator links, and QR/NFC smart tags) as portable JSON. Payment secrets and passwords are never included.
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={exportMenu}
                className="min-h-11 rounded-xl cursor-pointer gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download branch backup</span>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-destructive/25">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-destructive">
                <ShieldAlert className="w-5 h-5" />
                <span>Start With an Empty Menu</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This permanently removes your branch’s categories and menu items. Export your branch backup above first if you need a copy.
              </p>
              <div>
                <Label htmlFor="clear-confirmation">Type CLEAR MENU to confirm</Label>
                <Input
                  id="clear-confirmation"
                  value={confirmation}
                  onChange={e => setConfirmation(e.target.value)}
                  className="h-11 mt-1 font-mono"
                />
              </div>
              <Button
                variant="destructive"
                disabled={busy || confirmation !== 'CLEAR MENU'}
                onClick={clearMenu}
                className="min-h-11 rounded-xl cursor-pointer"
              >
                Clear café menu
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

import { useRoute, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CalendarCheck2, Clock, MapPin, Users, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cafeThemeStyle } from '@/lib/cafeTheme';
import { MenuLanguageProvider, MenuLanguageSwitch, useMenuLanguage } from '@/lib/menuLanguage';

export default function GuestBookingPage() {
  return (
    <MenuLanguageProvider>
      <GuestBookingContent />
    </MenuLanguageProvider>
  );
}

function GuestBookingContent() {
  const [, params] = useRoute('/booking/:token');
  const token = params?.token || '';
  const { language, dir, label } = useMenuLanguage();

  const query = useQuery<any>({
    enabled: Boolean(token),
    queryKey: ['/api/public/booking', token],
    queryFn: async () => {
      const res = await fetch(`/api/public/booking/${token}`);
      if (!res.ok) throw new Error('Reservation not found');
      return res.json();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/public/booking/${token}/cancel`, {});
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/public/booking', token] });
    },
  });

  if (query.isLoading) return <div className="min-h-screen grid place-items-center p-6">Loading reservation…</div>;
  const data = query.data;
  if (!data?.reservation || !data?.restaurant) {
    return <div className="min-h-screen grid place-items-center p-6">Reservation not found.</div>;
  }

  const { reservation, table, zone, restaurant } = data;
  const start = new Date(reservation.startAt);

  return (
    <div
      dir={dir}
      lang={language}
      style={cafeThemeStyle(restaurant.theme, restaurant.brandAccentHex)}
      className="min-h-screen bg-background text-foreground p-4"
    >
      <div className="max-w-md mx-auto py-6 space-y-5">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase font-semibold text-muted-foreground">Table Reservation</p>
            <h1 className="text-xl font-bold">{label(restaurant.name)}</h1>
          </div>
          <MenuLanguageSwitch />
        </header>

        <section className="rounded-3xl border bg-card p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase px-3 py-1 rounded-full bg-primary/10 text-primary">
              <CalendarCheck2 className="w-4 h-4" />
              {reservation.status}
            </span>
            {table && <span className="font-mono font-bold text-sm">Table {table.tableCode}</span>}
          </div>

          <div className="space-y-2 text-sm">
            <p className="text-lg font-semibold">{reservation.guestName}</p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4 text-primary" />
              <span>{start.toLocaleString(language === 'ar' ? 'ar-QA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4 text-primary" />
              <span>Party of {reservation.partySize}{zone ? ` · ${zone.name}` : ''}</span>
            </p>
            {restaurant.address && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4 text-primary" />
                <span>{restaurant.address}</span>
              </p>
            )}
          </div>

          {reservation.status === 'confirmed' && (
            <Button
              type="button"
              variant="outline"
              className="w-full min-h-11 text-destructive cursor-pointer gap-2"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              <XCircle className="w-4 h-4" />
              Cancel Reservation
            </Button>
          )}
        </section>

        <div className="text-center">
          <Link href={`/menu/${restaurant.id}`}>
            <Button variant="ghost" className="cursor-pointer">Explore {label(restaurant.name)} Menu</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

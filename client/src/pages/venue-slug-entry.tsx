import { useEffect } from 'react';
import { Link, useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DingziWordmark } from '@/components/staff-brand';

function EntryShell({
  errorTitle,
  errorBody,
}: {
  errorTitle?: string;
  errorBody?: string;
}) {
  return (
    <div className="min-h-screen grid place-items-center bg-[#F6F5FC] text-[#17132E] p-6">
      <div className="max-w-sm w-full rounded-3xl border border-[#E5E2F2] bg-white p-8 text-center shadow-sm space-y-4">
        <div className="flex justify-center">
          <DingziWordmark tone="light" />
        </div>
        {errorTitle ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-[#EFEAFF] text-[#4B1FE0] grid place-items-center mx-auto">
              <QrCode className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold">{errorTitle}</h1>
            <p className="text-sm text-[#57507A]">{errorBody}</p>
            <Link href="/">
              <Button className="w-full min-h-11 rounded-2xl cursor-pointer gap-2">
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Browse Dingzi Venues</span>
              </Button>
            </Link>
          </>
        ) : (
          <p className="text-sm font-medium text-[#57507A] animate-pulse" role="status">
            Opening live venue experience…
          </p>
        )}
      </div>
    </div>
  );
}

export function VenueBySlugEntry() {
  const [, params] = useRoute('/v/:slug');
  const [, navigate] = useLocation();
  const slug = params?.slug || '';

  const query = useQuery<{ restaurant: { id: string } }>({
    enabled: Boolean(slug),
    queryKey: ['/api/public/venue-by-slug', slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/venue-by-slug/${slug}`);
      if (!res.ok) throw new Error('Venue not found');
      return res.json();
    },
  });

  useEffect(() => {
    if (query.data?.restaurant?.id) {
      const search = window.location.search || '';
      navigate(`/menu/${query.data.restaurant.id}${search}`, { replace: true });
    }
  }, [query.data, navigate]);

  if (query.isError) {
    return (
      <EntryShell
        errorTitle="Venue Link Not Found"
        errorBody="This venue link may have changed or is currently offline. Explore active Dingzi venues below."
      />
    );
  }
  return <EntryShell />;
}

export function BayQrEntry() {
  const [, params] = useRoute('/bay/:token');
  const [, navigate] = useLocation();
  const token = params?.token || '';

  const query = useQuery<{ restaurant: { id: string; orderingMode?: string }; bay: { id: string; code: string } }>({
    enabled: Boolean(token),
    queryKey: ['/api/public/bay', token],
    queryFn: async () => {
      const res = await fetch(`/api/public/bay/${token}`);
      if (!res.ok) throw new Error('Bay QR not found');
      return res.json();
    },
  });

  useEffect(() => {
    if (query.data?.restaurant?.id && query.data?.bay?.id) {
      const actionParam = query.data.restaurant.orderingMode === 'browse_and_pager' ? '&action=curbside' : '';
      navigate(`/menu/${query.data.restaurant.id}?bay=${query.data.bay.id}${actionParam}`, { replace: true });
    }
  }, [query.data, navigate]);

  if (query.isError) {
    return (
      <EntryShell
        errorTitle="Parking Bay QR Not Found"
        errorBody="Please rescan the curbside or drive-thru signage QR code, or open the venue menu directly."
      />
    );
  }
  return <EntryShell />;
}

export function TableQrEntry() {
  const [, params] = useRoute('/table/:token');
  const [, navigate] = useLocation();
  const token = params?.token || '';

  const query = useQuery<{ restaurant: { id: string }; table: { id: string; tableCode: string } }>({
    enabled: Boolean(token),
    queryKey: ['/api/public/table', token],
    queryFn: async () => {
      const res = await fetch(`/api/public/table/${token}`);
      if (!res.ok) throw new Error('Table QR not found');
      return res.json();
    },
  });

  useEffect(() => {
    if (query.data?.restaurant?.id && query.data?.table?.tableCode) {
      navigate(
        `/menu/${query.data.restaurant.id}?table=${encodeURIComponent(query.data.table.tableCode)}`,
        { replace: true },
      );
    }
  }, [query.data, navigate]);

  if (query.isError) {
    return (
      <EntryShell
        errorTitle="Table QR Not Found"
        errorBody="This table QR code is inactive. Please scan the venue menu QR or ask a team member."
      />
    );
  }
  return <EntryShell />;
}

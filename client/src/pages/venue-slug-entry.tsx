import { useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Coffee } from 'lucide-react';

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
      navigate(`/menu/${query.data.restaurant.id}`, { replace: true });
    }
  }, [query.data, navigate]);

  if (query.isError) {
    return <div className="min-h-screen grid place-items-center p-6">Venue link not found.</div>;
  }
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <Coffee className="w-8 h-8 animate-pulse text-primary" />
    </div>
  );
}

export function BayQrEntry() {
  const [, params] = useRoute('/bay/:token');
  const [, navigate] = useLocation();
  const token = params?.token || '';

  const query = useQuery<{ restaurant: { id: string }; bay: { id: string; code: string } }>({
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
      navigate(`/menu/${query.data.restaurant.id}?bay=${query.data.bay.id}`, { replace: true });
    }
  }, [query.data, navigate]);

  if (query.isError) {
    return <div className="min-h-screen grid place-items-center p-6">Parking bay QR not found.</div>;
  }
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <Coffee className="w-8 h-8 animate-pulse text-primary" />
    </div>
  );
}

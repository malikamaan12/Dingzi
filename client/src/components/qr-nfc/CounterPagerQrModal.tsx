import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { BellOff, CheckCircle2, ExternalLink, Monitor, QrCode, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LocalQrBox } from '@/components/hospitality/LocalQrBox';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import { publicExperienceOrigin } from '@shared/menuIdentity';

export interface IssuedPagerHandoff {
  id: string;
  ticketCode: string;
  trackingToken: string;
  customerName?: string | null;
}

interface CounterPagerQrModalProps {
  venueName: string;
  ticket: IssuedPagerHandoff | null;
  onClose: () => void;
}

export function CounterPagerQrModal({ venueName, ticket, onClose }: CounterPagerQrModalProps) {
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    setClaimed(false);
  }, [ticket?.id]);

  useRealtimeStream(ticket ? '/api/hospitality/stream' : null, event => {
    if (
      event.type === 'pager.claimed' &&
      (event.data?.ticketId === ticket?.id || event.data?.ticketCode === ticket?.ticketCode)
    ) {
      setClaimed(true);
    }
  });

  if (!ticket) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const guestPagerUrl = `${publicExperienceOrigin(origin)}/pager/${ticket.trackingToken}`;

  return (
    <Dialog open={Boolean(ticket)} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md rounded-3xl border-2 border-[#6236FF]/30 p-6">
        <DialogHeader className="text-center sm:text-center space-y-1.5">
          <div className="flex items-center justify-center gap-2">
            <Badge className="bg-[#EFEAFF] text-[#4B1FE0] hover:bg-[#EFEAFF] border-0 font-bold">
              1-to-1 Guest Pager QR
            </Badge>
            <Badge variant="outline" className="font-mono font-bold">
              {ticket.ticketCode}
            </Badge>
          </div>
          <DialogTitle className="text-2xl font-display font-extrabold text-[#17132E]">
            {claimed ? `Guest Phone Connected (${ticket.ticketCode})` : `Ask Guest to Scan ${ticket.ticketCode}`}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-[#57507A]">
            {claimed
              ? 'This private pager is now locked to the customer’s phone. Only their phone will ring when you mark the order Ready.'
              : `Show this QR to ${ticket.customerName || 'the customer'}. Once scanned, only their phone will chime & vibrate when ${ticket.ticketCode} is ready.`}
          </DialogDescription>
        </DialogHeader>

        {claimed ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="banner-pager-claimed"
            className="rounded-3xl bg-[#C8FF42] text-[#17132E] border-2 border-[#17132E] p-6 text-center space-y-3"
          >
            <CheckCircle2 className="w-12 h-12 mx-auto text-[#17132E]" aria-hidden="true" />
            <div className="font-display font-extrabold text-xl">
              Paired to Customer’s Phone!
            </div>
            <p className="text-xs font-semibold text-[#17132E]/85">
              Ticket <span className="font-mono font-extrabold">{ticket.ticketCode}</span> is active in the prep queue for {venueName}.
            </p>
          </div>
        ) : (
          <div className="rounded-3xl bg-[#F6F5FC] border border-[#E5E2F2] p-5 flex flex-col items-center gap-3">
            <div className="font-mono text-3xl font-black text-[#17132E]" data-testid="modal-handoff-ticket-code">
              {ticket.ticketCode}
            </div>
            <LocalQrBox url={guestPagerUrl} size={220} />
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4B1FE0]">
              <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Waiting for customer camera scan…</span>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-[#F6F5FC] px-3.5 py-2.5 flex items-center justify-between gap-2 text-[11px] text-[#57507A]">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <BellOff className="w-3.5 h-3.5 text-[#6236FF] shrink-0" aria-hidden="true" />
            <span>Staff device stays silent — only customer’s phone rings</span>
          </span>
          <ShieldCheck className="w-4 h-4 text-[#6236FF] shrink-0" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            asChild
            className="min-h-11 rounded-2xl cursor-pointer gap-1.5"
          >
            <Link href="/admin/counter-display" onClick={onClose}>
              <Monitor className="w-4 h-4" />
              <span>Counter Screen</span>
            </Link>
          </Button>
          <Button
            type="button"
            onClick={onClose}
            data-testid="button-close-handoff-modal"
            className="min-h-11 rounded-2xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-bold cursor-pointer"
          >
            {claimed ? 'Done · Next Guest' : 'Done'}
          </Button>
        </div>

        <div className="text-center">
          <a
            href={`${guestPagerUrl}?preview=1`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#4B1FE0] hover:underline"
          >
            <span>Open silent ticket preview</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { BellRing, CheckCircle2, Smartphone } from 'lucide-react';

export function GuestPhoneStatusBadge({
  ticket,
  darkSurface = false,
  showUnclaimed = false,
}: {
  ticket: {
    status?: string | null;
    pushArmed?: boolean | null;
    deviceClaimedAt?: string | Date | null;
    acknowledgedAt?: string | Date | null;
  };
  darkSurface?: boolean;
  showUnclaimed?: boolean;
}) {
  if (ticket.status === 'ready' && ticket.acknowledgedAt) {
    return (
      <span
        data-testid="badge-guest-ack"
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#C8FF42] text-[#17132E]"
      >
        <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>On My Way</span>
      </span>
    );
  }

  if (ticket.pushArmed) {
    return (
      <span
        data-testid="badge-guest-armed"
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
          darkSurface
            ? 'bg-[#241E42] text-white border-white/20'
            : 'bg-[#EFEAFF] text-[#4B1FE0] border-[#6236FF]/25'
        }`}
      >
        <BellRing className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>Lock-Screen Armed</span>
      </span>
    );
  }

  if (ticket.deviceClaimedAt) {
    return (
      <span
        data-testid="badge-guest-claimed"
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
          darkSurface
            ? 'bg-white/10 text-white/85 border-white/15'
            : 'bg-[#F6F5FC] text-[#17132E] border-[#E5E2F2]'
        }`}
      >
        <Smartphone className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>Phone Connected</span>
      </span>
    );
  }

  if (showUnclaimed) {
    return (
      <span className={`text-xs ${darkSurface ? 'text-white/65' : 'text-muted-foreground'}`}>
        Awaiting guest QR scan
      </span>
    );
  }

  return null;
}

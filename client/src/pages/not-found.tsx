import { Link } from 'wouter';
import { ArrowLeft, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DingziWordmark } from '@/components/staff-brand';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full grid place-items-center bg-[#F6F5FC] text-[#17132E] p-6">
      <div className="w-full max-w-md rounded-3xl border border-[#E5E2F2] bg-white p-8 text-center shadow-sm space-y-5">
        <div className="flex justify-center">
          <DingziWordmark tone="light" />
        </div>
        <div className="w-14 h-14 rounded-2xl bg-[#EFEAFF] text-[#4B1FE0] grid place-items-center mx-auto">
          <Compass className="w-7 h-7" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold">Page Not Found</h1>
          <p className="text-sm text-[#57507A]">
            That link doesn’t match an active menu, pager ticket, or workspace page.
          </p>
        </div>
        <Link href="/">
          <Button className="w-full min-h-11 rounded-2xl cursor-pointer gap-2">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Explore Dingzi Venues</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}

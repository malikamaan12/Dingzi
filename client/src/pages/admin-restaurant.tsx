import { useLayoutEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Check,
  Clock,
  Coffee,
  ExternalLink,
  Globe,
  MapPin,
  Palette,
  RotateCcw,
  Save,
  Star,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  useManagerMenu,
  updateManagerMenu,
  refreshCafe,
  uploadMedia,
  managerMoney,
} from '@/lib/managerMenu';
import { cafeThemes } from '@/lib/cafeTheme';
import { liveCafeStyle } from '@/lib/menuPalette';
import { CategoryVectorIcon } from '@/components/menu/CategoryVectorIcon';
import { VenueConfigStudio } from '@/components/hospitality/VenueConfigStudio';
import { publicExperienceOrigin } from '@shared/menuIdentity';
import { SUPPORTED_CURRENCIES, resolveVenueConfig, type VenueConfig } from '@shared/venueConfig';
import type { Restaurant } from '@shared/schema';
import UnsavedChanges from '@/components/unsaved-changes';

const empty = {
  name: '',
  nameAr: '',
  slug: '',
  cuisineType: '',
  cuisineTypeAr: '',
  address: '',
  addressAr: '',
  phone: '',
  openingHours: '',
  openingHoursAr: '',
  openTime: '08:00',
  closeTime: '23:00',
  venueConfig: {} as VenueConfig,
  googleMapsReviewUrl: '',
  logoUrl: '',
  coverMediaUrl: '',
  coverMediaType: null as 'image' | 'video' | 'gif' | null,
  theme: 'e3',
  brandAccentHex: '',
  currency: 'QAR',
  timezone: 'Asia/Qatar',
};

type Profile = typeof empty;

function profile(cafe: Restaurant): Profile {
  return {
    name: cafe.name,
    nameAr: cafe.nameAr || '',
    slug: cafe.slug || '',
    cuisineType: cafe.cuisineType || '',
    cuisineTypeAr: cafe.cuisineTypeAr || '',
    address: cafe.address || '',
    addressAr: cafe.addressAr || '',
    phone: cafe.phone || '',
    openingHours: cafe.openingHours || '',
    openingHoursAr: cafe.openingHoursAr || '',
    openTime: cafe.openTime || '08:00',
    closeTime: cafe.closeTime || '23:00',
    venueConfig: cafe.venueConfig || {},
    googleMapsReviewUrl: cafe.googleMapsReviewUrl || '',
    logoUrl: cafe.logoUrl || '',
    coverMediaUrl: cafe.coverMediaUrl || '',
    coverMediaType: cafe.coverMediaType as Profile['coverMediaType'],
    theme: cafe.theme,
    brandAccentHex: cafe.brandAccentHex || '',
    currency: cafe.currency,
    timezone: cafe.timezone,
  };
}

export default function AdminRestaurant() {
  const query = useManagerMenu();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Profile>(empty);
  const [baseline, setBaseline] = useState(JSON.stringify(empty));
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const initialized = useRef<string | null>(null);
  const revision = useRef<string | undefined>(undefined);
  const cafe = query.data?.restaurant;

  useLayoutEffect(() => {
    if (cafe && initialized.current !== cafe.id) {
      const next = profile(cafe);
      setDraft(next);
      setBaseline(JSON.stringify(next));
      initialized.current = cafe.id;
      revision.current = cafe.updatedAt ? new Date(cafe.updatedAt).toISOString() : undefined;
    }
  }, [cafe]);

  const dirty = JSON.stringify(draft) !== baseline;
  const update = (values: Partial<Profile>) => setDraft(prev => ({ ...prev, ...values }));

  const save = useMutation({
    mutationKey: ['cafe-menu-write'],
    onMutate: () => queryClient.cancelQueries({ queryKey: ['/api/manager-menu'] }),
    mutationFn: async () => {
      if (!draft.name.trim()) throw new Error('Enter your restaurant or café name.');
      const normalizedSlug = draft.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const normalizedHex = draft.brandAccentHex.trim();
      if (normalizedHex && !/^#[0-9a-fA-F]{6}$/.test(normalizedHex)) {
        throw new Error('Brand accent color must be a 6-digit hex code such as #6236FF.');
      }
      return (
        await apiRequest('POST', '/api/restaurant', {
          name: draft.name.trim(),
          nameAr: draft.nameAr.trim() || null,
          slug: normalizedSlug || null,
          cuisineType: draft.cuisineType,
          cuisineTypeAr: draft.cuisineTypeAr.trim() || null,
          address: draft.address,
          addressAr: draft.addressAr.trim() || null,
          phone: draft.phone,
          openingHours: draft.openingHours,
          openingHoursAr: draft.openingHoursAr.trim() || null,
          openTime: draft.openTime || '08:00',
          closeTime: draft.closeTime || '23:00',
          venueConfig: draft.venueConfig,
          googleMapsReviewUrl: draft.googleMapsReviewUrl.trim() || null,
          logoUrl: draft.logoUrl,
          coverMediaUrl: draft.coverMediaUrl,
          coverMediaType: draft.coverMediaType,
          theme: draft.theme,
          brandAccentHex: normalizedHex || null,
          currency: draft.currency,
          timezone: draft.timezone,
          expectedUpdatedAt: revision.current,
        })
      ).json() as Promise<Restaurant>;
    },
    onSuccess: result => {
      const next = profile(result);
      setDraft(next);
      setBaseline(JSON.stringify(next));
      initialized.current = result.id;
      revision.current = result.updatedAt ? new Date(result.updatedAt).toISOString() : undefined;
      updateManagerMenu(data => ({ ...data, restaurant: result }));
      queryClient.setQueryData(['/api/restaurant'], result);
      void refreshCafe('profile');
      void queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/dashboard'] });
      toast({
        title: 'Restaurant profile saved',
        description: 'Your identity, hours, slug, and theme are live on the guest menu.',
      });
    },
    onError: (e: Error) => setError(e.message),
  });

  async function media(file: File | undefined, kind: 'logoUrl' | 'coverMediaUrl') {
    if (!file) return;
    setUploading(kind);
    setError('');
    try {
      const url = await uploadMedia(file);
      update({
        [kind]: url,
        ...(kind === 'coverMediaUrl'
          ? {
              coverMediaType: file.type.startsWith('video/')
                ? 'video'
                : file.type === 'image/gif'
                  ? 'gif'
                  : 'image',
            }
          : {}),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

  if (query.isLoading) return <p role="status">Loading restaurant profile…</p>;
  if (query.isError) {
    return (
      <div className="manager-panel p-8">
        Could not load your restaurant profile. <Button onClick={() => query.refetch()}>Try again</Button>
      </div>
    );
  }

  const publicBase = publicExperienceOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  const previewHex = /^#[0-9a-fA-F]{6}$/.test(draft.brandAccentHex.trim())
    ? draft.brandAccentHex.trim()
    : null;

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        setError('');
        save.mutate();
      }}
      className="space-y-6"
    >
      <UnsavedChanges dirty={dirty} />

      <div className="manager-section-heading">
        <div>
          <p className="manager-eyebrow">IDENTITY, BRANDING &amp; HOURS</p>
          <h1 className="text-2xl sm:text-3xl font-bold">Profile, Brand &amp; Hours Studio</h1>
          <p className="text-sm text-muted-foreground">
            Configure your venue identity, `/v/:slug` short link, operating hours, custom brand palette, and welcome cover media.
          </p>
        </div>
        <Button
          type="submit"
          disabled={save.isPending || Boolean(uploading) || !draft.name.trim()}
          className="min-h-11 rounded-xl cursor-pointer gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{save.isPending ? 'Saving…' : 'Save Restaurant'}</span>
        </Button>
      </div>

      {error && (
        <p role="alert" className="manager-panel p-4 text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="manager-profile-grid">
        <fieldset disabled={save.isPending || Boolean(uploading)} className="space-y-6 min-w-0">
          {/* 1. Venue Identity & Guest Discovery */}
          <section className="manager-panel p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold">Venue Essentials &amp; Short Link</h2>
              <p className="text-xs text-muted-foreground">
                Shown at the top of your bilingual digital menu, virtual pagers, receipts, and table passes.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cafe-name">Restaurant / Café Name (EN) *</Label>
                <Input
                  id="cafe-name"
                  required
                  value={draft.name}
                  onChange={e => update({ name: e.target.value })}
                  className="h-11"
                />
              </div>
              <div>
                <Label htmlFor="cafe-name-ar">Restaurant / Café Name (Arabic)</Label>
                <Input
                  id="cafe-name-ar"
                  dir="rtl"
                  value={draft.nameAr}
                  onChange={e => update({ nameAr: e.target.value })}
                  placeholder="الاسم بالعربية"
                  className="h-11"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="cafe-slug" className="inline-flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-primary" />
                <span>Branded URL Slug (`/v/:slug`)</span>
              </Label>
              <Input
                id="cafe-slug"
                value={draft.slug}
                onChange={e => update({ slug: e.target.value.toLowerCase() })}
                placeholder="urban-cafe"
                className="h-11 font-mono"
              />
              {draft.slug.trim() && (
                <span className="text-[11px] font-mono text-muted-foreground block mt-1 truncate">
                  {publicBase}/v/{draft.slug.trim().toLowerCase()}
                </span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cafe-cuisine">Cuisine or Tagline (EN)</Label>
                <Input
                  id="cafe-cuisine"
                  value={draft.cuisineType}
                  onChange={e => update({ cuisineType: e.target.value })}
                  placeholder="Specialty coffee, artisan pizza & fresh refreshments"
                  className="h-11"
                />
              </div>
              <div>
                <Label htmlFor="cafe-cuisine-ar">Cuisine or Tagline (Arabic)</Label>
                <Input
                  id="cafe-cuisine-ar"
                  dir="rtl"
                  value={draft.cuisineTypeAr}
                  onChange={e => update({ cuisineTypeAr: e.target.value })}
                  placeholder="قهوة مختصة ومخبوزات طازجة"
                  className="h-11"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cafe-address" className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span>Venue Address (EN)</span>
                </Label>
                <Textarea
                  id="cafe-address"
                  value={draft.address}
                  onChange={e => update({ address: e.target.value })}
                  placeholder="Lusail Marina Promenade, Doha, Qatar"
                />
              </div>
              <div>
                <Label htmlFor="cafe-address-ar">Venue Address (Arabic)</Label>
                <Textarea
                  id="cafe-address-ar"
                  dir="rtl"
                  value={draft.addressAr}
                  onChange={e => update({ addressAr: e.target.value })}
                  placeholder="ممشى مرسى لوسيل، الدوحة، قطر"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cafe-phone">Contact Phone</Label>
                <Input
                  id="cafe-phone"
                  type="tel"
                  value={draft.phone}
                  onChange={e => update({ phone: e.target.value })}
                  placeholder="+974 …"
                  className="h-11"
                />
              </div>
              <div>
                <Label htmlFor="cafe-reviews" className="inline-flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-primary" />
                  <span>Google Maps Review Link</span>
                </Label>
                <Input
                  id="cafe-reviews"
                  type="url"
                  value={draft.googleMapsReviewUrl}
                  onChange={e => update({ googleMapsReviewUrl: e.target.value })}
                  placeholder="https://g.page/r/..."
                  className="h-11"
                />
              </div>
            </div>
          </section>

          {/* 2. Operating Hours & Booking Schedule */}
          <section className="manager-panel p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <span>Operating Hours &amp; Timezone</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Controls your public hours label, daily specials rollover, and reservation time-slot window (supports late-night hours past midnight).
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cafe-hours">Guest Display Hours (EN)</Label>
                <Input
                  id="cafe-hours"
                  value={draft.openingHours}
                  onChange={e => update({ openingHours: e.target.value })}
                  placeholder="Daily · 8 AM–11 PM"
                  className="h-11"
                />
              </div>
              <div>
                <Label htmlFor="cafe-hours-ar">Guest Display Hours (Arabic)</Label>
                <Input
                  id="cafe-hours-ar"
                  dir="rtl"
                  value={draft.openingHoursAr}
                  onChange={e => update({ openingHoursAr: e.target.value })}
                  placeholder="يومياً · 8 ص – 11 م"
                  className="h-11"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cafe-open-time">Opens At (24h)</Label>
                <Input
                  id="cafe-open-time"
                  type="time"
                  value={draft.openTime}
                  onChange={e => update({ openTime: e.target.value || '08:00' })}
                  className="h-11 font-mono"
                />
              </div>
              <div>
                <Label htmlFor="cafe-close-time">Closes At (24h)</Label>
                <Input
                  id="cafe-close-time"
                  type="time"
                  value={draft.closeTime}
                  onChange={e => update({ closeTime: e.target.value || '23:00' })}
                  className="h-11 font-mono"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cafe-currency">Menu &amp; Order Currency</Label>
                <select
                  id="cafe-currency"
                  className="manager-select w-full h-11"
                  value={draft.currency}
                  onChange={e => update({ currency: e.target.value })}
                >
                  {SUPPORTED_CURRENCIES.map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="cafe-timezone">Branch Timezone</Label>
                <Input
                  id="cafe-timezone"
                  required
                  list="cafe-timezones"
                  value={draft.timezone}
                  onChange={e => update({ timezone: e.target.value })}
                  className="h-11"
                />
                <datalist id="cafe-timezones">
                  {['Asia/Qatar', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Kolkata', 'Europe/London', 'America/New_York'].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </datalist>
              </div>
            </div>
          </section>

          {/* 3. Theme Collection & Custom Brand Hex */}
          <section className="manager-panel p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Palette className="w-5 h-5 text-primary" />
                <span>Theme Palette &amp; Custom Brand Accent</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Pick a curated Dingzi hospitality theme or override the primary accent with your exact brand hex.
              </p>
            </div>

            <div className="manager-theme-grid">
              {Object.entries(cafeThemes).map(([key, t]) => (
                <button
                  type="button"
                  className={`manager-theme cursor-pointer ${draft.theme === key ? 'selected' : ''}`}
                  key={key}
                  aria-pressed={draft.theme === key}
                  onClick={() => update({ theme: key })}
                >
                  <div className="manager-theme-colors">
                    <span style={{ background: `hsl(${t.primary})` }} />
                    <span style={{ background: `hsl(${t.background})` }} />
                    <span style={{ background: `hsl(${t.foreground})` }} />
                  </div>
                  <span>{t.label.split(' · ')[0]}</span>
                  <small>{t.label.split(' · ')[1]}</small>
                  {draft.theme === key && <Check className="w-4 h-4 absolute right-3 top-3 text-primary" />}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border bg-muted/25 p-4 flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-[210px]">
                <Label htmlFor="cafe-accent-hex">Custom Brand Accent Hex (optional override)</Label>
                <div className="flex items-center gap-2.5">
                  <input
                    type="color"
                    aria-label="Pick custom brand accent color"
                    value={previewHex || '#6236FF'}
                    onChange={e => update({ brandAccentHex: e.target.value.toUpperCase() })}
                    className="w-11 h-11 rounded-xl border p-1 bg-card cursor-pointer shrink-0"
                  />
                  <Input
                    id="cafe-accent-hex"
                    value={draft.brandAccentHex}
                    onChange={e => update({ brandAccentHex: e.target.value })}
                    placeholder="#6236FF (leave empty for theme default)"
                    className="h-11 font-mono uppercase placeholder:font-sans placeholder:normal-case"
                  />
                </div>
              </div>
              {draft.brandAccentHex && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => update({ brandAccentHex: '' })}
                  className="min-h-11 rounded-xl cursor-pointer gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Use Theme Default</span>
                </Button>
              )}
            </div>
          </section>

          {/* 4. Logo & Welcome Cover Media */}
          <section className="manager-panel p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold">Logo &amp; Welcome Cover Media</h2>
              <p className="text-xs text-muted-foreground">
                Upload a crisp brand mark and an optional hero image, GIF, or MP4 atmosphere loop (up to 5 MB).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cafe-logo">Venue Logo</Label>
              <div className="flex flex-wrap gap-3 items-center">
                {draft.logoUrl && (
                  <img className="w-16 h-16 rounded-2xl object-cover border" src={draft.logoUrl} alt="Logo preview" />
                )}
                <label className="manager-upload min-h-11">
                  <Upload className="w-4 h-4" />
                  <span>{uploading === 'logoUrl' ? 'Uploading…' : 'Upload Logo'}</span>
                  <input
                    className="sr-only"
                    id="cafe-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={e => media(e.target.files?.[0], 'logoUrl')}
                  />
                </label>
                {draft.logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 cursor-pointer"
                    onClick={() => update({ logoUrl: '' })}
                  >
                    Remove Logo
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t">
              <Label htmlFor="cafe-cover">Menu Welcome Cover (Image, GIF, or MP4)</Label>
              {draft.coverMediaUrl &&
                (draft.coverMediaType === 'video' ? (
                  <video src={draft.coverMediaUrl} controls className="rounded-2xl w-full max-h-64 object-cover border" />
                ) : (
                  <img src={draft.coverMediaUrl} alt="Cover preview" className="rounded-2xl w-full max-h-64 object-cover border" />
                ))}
              <div className="flex flex-wrap gap-3 items-center">
                <label className="manager-upload min-h-11">
                  <Upload className="w-4 h-4" />
                  <span>{uploading === 'coverMediaUrl' ? 'Uploading…' : 'Upload Cover Media'}</span>
                  <input
                    className="sr-only"
                    id="cafe-cover"
                    aria-label="Menu cover file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
                    onChange={e => media(e.target.files?.[0], 'coverMediaUrl')}
                  />
                </label>
                {draft.coverMediaUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 cursor-pointer"
                    onClick={() => update({ coverMediaUrl: '', coverMediaType: null })}
                  >
                    Remove Cover
                  </Button>
                )}
              </div>
            </div>
          </section>

          <VenueConfigStudio
            value={draft.venueConfig}
            currency={draft.currency}
            onChange={venueConfig => update({ venueConfig })}
          />
        </fieldset>

        {/* Live Guest Phone Preview */}
        <aside className="manager-preview-wrapper">
          <div className="flex justify-between text-sm mb-3">
            <span className="font-semibold">Live Guest Preview</span>
            <span className="text-muted-foreground">{dirty ? 'Unsaved changes' : 'Published'}</span>
          </div>
          <div className="manager-preview" style={liveCafeStyle(draft.theme, previewHex)}>
            {draft.coverMediaUrl && draft.coverMediaType !== 'video' && (
              <img className="manager-preview-cover" src={draft.coverMediaUrl} alt="" />
            )}
            <div className="manager-preview-top">
              {draft.logoUrl ? (
                <img src={draft.logoUrl} alt="" />
              ) : (
                <span>
                  <Coffee className="w-8 h-8 text-primary" />
                </span>
              )}
              <small>{resolveVenueConfig(draft.venueConfig).menuEyebrow}</small>
              <h2>{draft.name || 'Your restaurant'}</h2>
              <p>{draft.cuisineType || 'Fresh flavors. Seamless hospitality.'}</p>
            </div>
            <div className="manager-preview-pills">
              {(query.data?.categories || []).slice(0, 3).map(c => (
                <span key={c.id}>{c.title}</span>
              ))}
            </div>
            <div className="p-5 space-y-3">
              {(query.data?.items || []).slice(0, 3).map(i => (
                <div className="manager-preview-item" key={i.id}>
                  <span>
                    <CategoryVectorIcon
                      title={query.data?.categories.find(c => c.id === i.categoryId)?.title || ''}
                      size={22}
                      className="text-primary"
                    />
                  </span>
                  <div>
                    <b>{i.name}</b>
                    <small>{managerMoney(i.price, draft.currency)}</small>
                  </div>
                </div>
              ))}
              <a
                className="manager-preview-button block text-center"
                href={cafe ? (cafe.slug ? `/v/${cafe.slug}` : `/menu/${cafe.id}`) : undefined}
                target="_blank"
                rel="noreferrer"
              >
                Explore Live Menu →
              </a>
            </div>
          </div>
          {cafe && (
            <a
              className="min-h-11 text-sm flex items-center gap-2 mt-3 justify-center text-primary font-semibold hover:underline"
              target="_blank"
              rel="noreferrer"
              href={cafe.slug ? `/v/${cafe.slug}` : `/menu/${cafe.id}`}
            >
              <span>Open Live Guest Menu</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </aside>
      </div>

      <div className="manager-save-bar">
        <span className="text-sm text-muted-foreground">
          {dirty ? 'You have unpublished changes.' : 'Your restaurant profile is up to date.'}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || Boolean(uploading) || save.isPending}
            onClick={() => {
              setDraft(JSON.parse(baseline));
              setError('');
            }}
            className="min-h-11 rounded-xl cursor-pointer"
          >
            Discard Changes
          </Button>
          <Button
            type="submit"
            disabled={!draft.name.trim() || Boolean(uploading) || save.isPending}
            className="min-h-11 rounded-xl cursor-pointer gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{save.isPending ? 'Saving…' : 'Save Restaurant'}</span>
          </Button>
        </div>
      </div>
    </form>
  );
}

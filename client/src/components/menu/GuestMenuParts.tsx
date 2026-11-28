import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { Check, Pause, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CategoryVectorIcon } from '@/components/menu/CategoryVectorIcon';
import { MENU_GROUPS, type MenuGroup } from '@/lib/menuDiscovery';
import { localizedEntityText, useMenuLanguage } from '@/lib/menuLanguage';
import { formatCurrencyForLocale } from '@shared/venueConfig';
import type { Category, MenuItem, PublicCafe } from '@shared/schema';

export function MenuImage({ item, category, priority = false }: { item: MenuItem; category: string; priority?: boolean }) {
  return item.imageUrl ? (
    <img src={item.imageUrl} alt="" loading={priority ? 'eager' : 'lazy'} />
  ) : (
    <div className="guest-food-art" aria-hidden="true">
      <span className="guest-art-orbit" />
      <span className="guest-art-plate">
        <CategoryVectorIcon title={category} size={42} className="text-primary" />
      </span>
      <span className="guest-art-dot" />
    </div>
  );
}

export function Price({
  price,
  discount,
  currency,
  unit,
  currencySymbolAr,
}: {
  price: string;
  discount: string | null;
  currency: string;
  unit: string;
  currencySymbolAr?: string | null;
}) {
  const { language, label } = useMenuLanguage();
  const off = Number(discount || 0);
  const currencyLabel = formatCurrencyForLocale(currency, language, currencySymbolAr);
  return (
    <div className="guest-price">
      <strong>
        <bdi dir="ltr">{(Number(price) * (1 - off / 100)).toFixed(2)}</bdi> <small>{currencyLabel}</small>
      </strong>
      {off > 0 && (
        <del>
          <bdi dir="ltr">{Number(price).toFixed(2)}</bdi>
        </del>
      )}
      <span>/ {label(unit)}</span>
    </div>
  );
}

export function MenuCover({ cafe, motion }: { cafe: PublicCafe; motion: boolean }) {
  const { language, t, label } = useMenuLanguage();
  const cafeDisplayName = localizedEntityText(language, cafe.name, cafe.nameAr, label);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!video.current) return;
    if (motion) void video.current.play().catch(() => {});
    else video.current.pause();
  }, [motion, cafe.coverMediaUrl]);
  if (!cafe.coverMediaUrl) return null;
  return (
    <div className="guest-menu-cover">
      {cafe.coverMediaType === 'video' ? (
        <video
          ref={video}
          src={cafe.coverMediaUrl}
          muted
          playsInline
          loop
          controls
          preload="metadata"
          aria-label={t('{name} welcome video', { name: cafeDisplayName })}
        />
      ) : (
        <img src={cafe.coverMediaUrl} alt={t('{name} atmosphere', { name: cafeDisplayName })} />
      )}
    </div>
  );
}

export function GuestMenuFiltersDialog({
  open,
  onOpenChange,
  filterTitleRef,
  language,
  dir,
  panelStyle,
  motion,
  group,
  setGroup,
  category,
  setCategory,
  filter,
  setFilter,
  available,
  categoryGroups,
  groupCategories,
  filteredCount,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterTitleRef: RefObject<HTMLHeadingElement>;
  language: string;
  dir: 'ltr' | 'rtl';
  panelStyle: CSSProperties;
  motion: { enabled: boolean; reduced: boolean; paused: boolean; toggle: () => void };
  group: MenuGroup;
  setGroup: (group: MenuGroup) => void;
  category: string | null;
  setCategory: (category: string | null) => void;
  filter: 'all' | 'specials' | 'saved';
  setFilter: (filter: 'all' | 'specials' | 'saved') => void;
  available: MenuItem[];
  categoryGroups: Map<string, MenuGroup>;
  groupCategories: Category[];
  filteredCount: number;
  onReset: () => void;
}) {
  const { t, label } = useMenuLanguage();
  const visibleGroups = MENU_GROUPS.filter(
    g => g.id === 'all' || available.some(item => categoryGroups.get(item.categoryId) === g.id),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="guest-filter-panel guest-compact-filters"
        onOpenAutoFocus={event => {
          event.preventDefault();
          filterTitleRef.current?.focus({ preventScroll: true });
        }}
        lang={language}
        dir={dir}
        closeLabel={t('Close')}
        overlayClassName={'guest-glass-overlay ' + (!motion.enabled ? 'is-still' : '')}
        style={panelStyle}
        data-motion={motion.enabled ? 'on' : 'off'}
      >
        <div className="guest-filter-heading">
          <DialogTitle ref={filterTitleRef} tabIndex={-1}>
            {t('Filters')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('Choose a menu type, category or saved items.')}
          </DialogDescription>
        </div>

        <div className="guest-filter-scroll space-y-4" role="region" aria-label={t('Filter options')} tabIndex={0}>
          <div className="space-y-2">
            <span className="block text-xs font-bold text-foreground/75">{t('Show')}</span>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#F6F5FC] border border-[#E5E2F2]">
              {(
                [
                  ['all', t('All menu items')],
                  ['specials', t("Today's specials")],
                  ['saved', t('Saved')],
                ] as const
              ).map(([val, title]) => {
                const active = filter === val;
                return (
                  <button
                    key={val}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(val)}
                    className={`min-h-11 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-[#17132E] hover:bg-white'
                    }`}
                  >
                    {title}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-bold text-foreground/75">{t('Menu type')}</span>
            <div className="flex flex-wrap gap-2">
              {visibleGroups.map(g => {
                const active = group === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setGroup(g.id as MenuGroup);
                      setCategory(null);
                    }}
                    className={`min-h-11 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-white text-[#17132E] border-[#E5E2F2] hover:bg-[#EFEAFF]'
                    }`}
                  >
                    {active && <Check size={13} />}
                    <span>{t(g.id === 'all' ? 'Everything' : g.label)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {groupCategories.length > 0 && (
            <div className="space-y-2">
              <span className="block text-xs font-bold text-foreground/75">{t('Category')}</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={!category}
                  onClick={() => setCategory(null)}
                  className={`min-h-11 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    !category
                      ? 'bg-[#EFEAFF] text-[#4B1FE0] border-[#6236FF]'
                      : 'bg-white text-[#17132E] border-[#E5E2F2]'
                  }`}
                >
                  {t('All categories')}
                </button>
                {groupCategories.map(c => {
                  const active = category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCategory(c.id)}
                      className={`min-h-11 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#EFEAFF] text-[#4B1FE0] border-[#6236FF]'
                          : 'bg-white text-[#17132E] border-[#E5E2F2]'
                      }`}
                    >
                      {language === 'ar' && c.titleAr?.trim() ? c.titleAr : label(c.title)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            className="guest-panel-motion cursor-pointer"
            onClick={motion.toggle}
            disabled={motion.reduced}
            aria-label={t(
              motion.reduced
                ? 'Motion reduced by your device settings'
                : motion.paused
                  ? 'Resume animations'
                  : 'Pause animations',
            )}
          >
            {motion.enabled ? <Pause size={15} /> : <Play size={15} />}{' '}
            {t(motion.enabled ? 'Animations on' : 'Animations off')}
          </button>
        </div>

        <div className="guest-panel-actions">
          <button type="button" onClick={onReset} className="cursor-pointer">
            {t('Reset')}
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="cursor-pointer">
            {t(filteredCount === 1 ? 'Show {count} item' : 'Show {count} items', { count: filteredCount })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

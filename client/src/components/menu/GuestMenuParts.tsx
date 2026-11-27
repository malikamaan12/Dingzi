import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { Pause, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CategoryVectorIcon } from '@/components/menu/CategoryVectorIcon';
import { MENU_GROUPS, type MenuGroup } from '@/lib/menuDiscovery';
import { useMenuLanguage } from '@/lib/menuLanguage';
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

export function Price({ price, discount, currency, unit }: { price: string; discount: string | null; currency: string; unit: string }) {
  const { language, label } = useMenuLanguage();
  const off = Number(discount || 0);
  const currencyLabel = language === 'ar' ? ({ QAR: 'ر.ق', SAR: 'ر.س', AED: 'د.إ' }[currency] || currency) : currency;
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
  const { t, label } = useMenuLanguage();
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
          aria-label={t('{name} welcome video', { name: label(cafe.name) })}
        />
      ) : (
        <img src={cafe.coverMediaUrl} alt={t('{name} atmosphere', { name: label(cafe.name) })} />
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
          <DialogDescription className="sr-only">{t('Choose a menu type, category or saved items.')}</DialogDescription>
        </div>
        <div className="guest-filter-scroll" role="region" aria-label={t('Filter options')} tabIndex={0}>
          <label>
            {t('Menu type')}
            <select
              aria-label={t('Menu type')}
              value={group}
              onChange={e => {
                setGroup(e.target.value as MenuGroup);
                setCategory(null);
              }}
            >
              {MENU_GROUPS.filter(g => g.id === 'all' || available.some(item => categoryGroups.get(item.categoryId) === g.id)).map(g => (
                <option key={g.id} value={g.id}>
                  {t(g.id === 'all' ? 'Everything' : g.label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Category')}
            <select aria-label={t('Category')} value={category || ''} onChange={e => setCategory(e.target.value || null)}>
              <option value="">{t('All categories')}</option>
              {groupCategories.map(c => (
                <option key={c.id} value={c.id}>
                  {label(c.title)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Show')}
            <select
              aria-label={t('Show items')}
              value={filter}
              onChange={e => setFilter(e.target.value as 'all' | 'specials' | 'saved')}
            >
              <option value="all">{t('All menu items')}</option>
              <option value="specials">{t("Today's specials")}</option>
              <option value="saved">{t('Saved items')}</option>
            </select>
          </label>
          <button
            className="guest-panel-motion"
            onClick={motion.toggle}
            disabled={motion.reduced}
            aria-label={t(
              motion.reduced ? 'Motion reduced by your device settings' : motion.paused ? 'Resume animations' : 'Pause animations',
            )}
          >
            {motion.enabled ? <Pause size={15} /> : <Play size={15} />} {t(motion.enabled ? 'Animations on' : 'Animations off')}
          </button>
        </div>
        <div className="guest-panel-actions">
          <button onClick={onReset}>{t('Reset')}</button>
          <button onClick={() => onOpenChange(false)}>
            {t(filteredCount === 1 ? 'Show {count} item' : 'Show {count} items', { count: filteredCount })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoute } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Clock3,
  Coffee,
  Heart,
  Leaf,
  MapPin,
  Minus,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import GuestHospitalityBar from '@/components/hospitality/GuestHospitalityBar';
import { ActiveGuestPassesBar } from '@/components/hospitality/ActiveGuestPassesBar';
import { PwaInstallBanner } from '@/components/mobile/PwaInstallBanner';
import { DingziMark } from '@/components/staff-brand';
import { cafeDate, cafeThemeStyle } from '@/lib/cafeTheme';
import { liveCafeStyle, menuTone } from '@/lib/menuPalette';
import { usePersistedGuestCart } from '@/lib/guestSession';
import { useMenuAnimation, useMenuMotionPreference } from '@/lib/useMenuAnimation';
import MenuWheel from '@/components/menu/MenuWheel';
import MenuCategoryBar from '@/components/menu/MenuCategoryBar';
import { GuestItemDetailDialog } from '@/components/menu/GuestItemDetailDialog';
import { MENU_GROUPS, categoryGroup, type MenuGroup } from '@/lib/menuDiscovery';
import { matchesMenuSearch, menuSearchIndex, menuSearchQuery } from '@/lib/menuSearch';
import {
  arabicMenuLabel,
  localizedEntityText,
  MenuCustomTranslationsProvider,
  MenuLanguageProvider,
  MenuLanguageSwitch,
  useMenuLanguage,
} from '@/lib/menuLanguage';
import { resolveVenueConfig } from '@shared/venueConfig';
import type { MenuItem, PriceVariant, PublicHospitalityConfig, PublicMenuData } from '@shared/schema';
import {
  customizationTotal,
  reconcileModifierSelections,
  selectedModifierOptions,
  missingModifierGroups,
  type MenuModifierSelections,
} from '@shared/menuCustomization';
import './customer-menu.css';
import './customer-menu-live.css';
import './customer-menu-simple.css';
import './customer-menu-polish.css';
import './customer-menu-responsive.css';
import './customer-menu-arabic.css';
import './customer-menu-compact.css';
import { GuestMenuFiltersDialog, MenuCover, MenuImage, Price } from '@/components/menu/GuestMenuParts';
import { getMenuData, keepMenuDuringReconnect, MenuLoadError } from '@/lib/menuRefresh';

const EMPTY_MODIFIER_GROUPS: MenuItem['modifierGroups'] = [];

export default function CustomerMenu() {
  return (
    <MenuLanguageProvider>
      <CustomerMenuContent />
    </MenuLanguageProvider>
  );
}

function CustomerMenuContent() {
  const { language, dir, t, label, count } = useMenuLanguage();
  const [, params] = useRoute('/menu/:id');
  const id = params?.id;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [group, setGroup] = useState<MenuGroup>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'specials' | 'saved'>('all');
  const [saved, setSaved] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<MenuModifierSelections>({});
  const [itemQty, setItemQty] = useState(1);
  const [itemNote, setItemNote] = useState('');
  const [cart, setCart] = usePersistedGuestCart(id);

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialTableCode = searchParams?.get('table') || null;
  const initialBayId = searchParams?.get('bay') || null;
  const initialAction = searchParams?.get('action') || null;

  const [now, setNow] = useState(Date.now());
  const menuRef = useRef<HTMLDivElement>(null);
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const filterTitleRef = useRef<HTMLHeadingElement>(null);
  const [detailElement, setDetailElement] = useState<HTMLDivElement | null>(null);
  const motion = useMenuMotionPreference();

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem('cafe-favorites-' + id) || '[]');
      setSaved(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string') : []);
    } catch {
      setSaved([]);
    }
    setSearch('');
    setCategory(null);
    setGroup('all');
    setFiltersOpen(false);
    setWheelOpen(false);
    setFilter('all');
    setSelectedId(null);
    setDetailOpen(false);
    setSelectedVariantId(null);
    setItemQty(1);
    setItemNote('');
  }, [id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const menuQuery = useQuery<PublicMenuData>({
    enabled: !!id,
    queryKey: ['/api/menu/public', id],
    queryFn: ({ signal }) => getMenuData('/api/menu/public/' + id, signal),
    staleTime: 0,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    retry: (attempt, error) =>
      attempt < 1 && (!(error instanceof MenuLoadError) || error.status === 0 || error.status === 429 || error.status >= 500),
  });

  const hospitalityQuery = useQuery<PublicHospitalityConfig>({
    enabled: !!id,
    queryKey: ['/api/public/hospitality', id],
    queryFn: async () => {
      const res = await fetch(`/api/public/hospitality/${id}`);
      if (!res.ok) throw new Error('Failed to load hospitality config');
      return res.json();
    },
    staleTime: 15_000,
  });

  const restaurant = menuQuery.data?.restaurant;
  const venueCfg = useMemo(() => resolveVenueConfig(restaurant?.venueConfig), [restaurant?.venueConfig]);
  const aggregators = hospitalityQuery.data?.aggregators || [];
  const today = useMemo(() => cafeDate(restaurant?.timezone), [restaurant?.timezone, now]);
  const available = useMemo(() => (menuQuery.data?.items || []).filter(item => item.isAvailable), [menuQuery.data?.items]);
  const byItem = useMemo(() => {
    const map = new Map<string, PriceVariant[]>();
    for (const variant of menuQuery.data?.variants || []) {
      const options = map.get(variant.menuItemId) || [];
      options.push(variant);
      map.set(variant.menuItemId, options);
    }
    return map;
  }, [menuQuery.data?.variants]);

  const cartQtyByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart) {
      map.set(line.menuItemId, (map.get(line.menuItemId) || 0) + line.quantity);
    }
    return map;
  }, [cart]);

  const specialsCount = useMemo(
    () => available.filter(i => i.specialDate === today).length,
    [available, today],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of available) counts.set(item.categoryId, (counts.get(item.categoryId) || 0) + 1);
    return counts;
  }, [available]);

  const categoryGroups = useMemo(
    () => new Map((menuQuery.data?.categories || []).map(c => [c.id, categoryGroup(c.title, c.menuGroup)])),
    [menuQuery.data?.categories],
  );

  const searchIndexes = useMemo(() => {
    const titles = new Map((menuQuery.data?.categories || []).map(c => [c.id, `${c.title} ${c.titleAr || ''}`]));
    return new Map(
      available.map(item => {
        const title = titles.get(item.categoryId) || '';
        const options = [
          item.nameAr || '',
          item.descriptionAr || '',
          ...(item.hasMultiplePricing ? (byItem.get(item.id) || []).flatMap(option => [option.label, option.labelAr || '']) : []),
          ...(item.modifierGroups || []).flatMap(grp => [
            grp.title,
            grp.titleAr || '',
            ...grp.options.filter(option => option.isAvailable).flatMap(option => [option.label, option.labelAr || '']),
          ]),
        ];
        return [
          item.id,
          [
            ...menuSearchIndex(item, title, options),
            ...menuSearchIndex(
              { ...item, name: arabicMenuLabel(item.name), tags: item.tags?.map(arabicMenuLabel) },
              arabicMenuLabel(title),
              options.map(arabicMenuLabel),
            ),
          ],
        ];
      }),
    );
  }, [available, menuQuery.data?.categories, byItem]);

  const searchWords = useMemo(() => menuSearchQuery(search), [search]);

  const branchTimeHm = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: restaurant?.timezone || 'Asia/Qatar',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(now));
    } catch {
      return '12:00';
    }
  }, [restaurant?.timezone, now]);

  const activeTimeCategories = useMemo(() => {
    return (menuQuery.data?.categories || []).filter(c => {
      if (c.isVisible === false) return false;
      if (!c.availableFrom || !c.availableUntil) return true;
      if (c.availableFrom <= c.availableUntil) {
        return branchTimeHm >= c.availableFrom && branchTimeHm <= c.availableUntil;
      }
      return branchTimeHm >= c.availableFrom || branchTimeHm <= c.availableUntil;
    });
  }, [menuQuery.data?.categories, branchTimeHm]);

  const activeCatIds = useMemo(() => new Set(activeTimeCategories.map(c => c.id)), [activeTimeCategories]);
  const groupedItems = available.filter(
    item => activeCatIds.has(item.categoryId) && (group === 'all' || categoryGroups.get(item.categoryId) === group),
  );
  const groupCategories = activeTimeCategories.filter(
    c => (group === 'all' || categoryGroups.get(c.id) === group) && categoryCounts.has(c.id),
  );
  const filtered = groupedItems.filter(
    item =>
      (!category || item.categoryId === category) &&
      (filter !== 'specials' || item.specialDate === today) &&
      (filter !== 'saved' || saved.includes(item.id)) &&
      matchesMenuSearch(searchIndexes.get(item.id) || [], searchWords),
  );

  const activeItem = available.find(item => item.id === selectedId);
  const activeOptions = activeItem ? byItem.get(activeItem.id) || [] : [];
  const activeVariant = activeOptions.find(option => option.id === selectedVariantId) || activeOptions[0];
  const activeGroups = activeItem?.modifierGroups || EMPTY_MODIFIER_GROUPS;
  const selectedExtras = selectedModifierOptions(activeGroups, selectedModifiers);
  const missingChoices = missingModifierGroups(activeGroups, selectedModifiers);
  const unavailableRequired = missingChoices.some(g => g.options.filter(o => o.isAvailable).length < g.minSelections);

  useEffect(() => {
    setSelectedModifiers(old => {
      const next = reconcileModifierSelections(activeGroups, old);
      return JSON.stringify(old) === JSON.stringify(next) ? old : next;
    });
  }, [activeGroups]);

  const appliedFilters = Number(group !== 'all') + Number(!!category) + Number(filter !== 'all');
  const hasDiscoverySelection = searchWords.length > 0 || !!category || group !== 'all';
  const selectedCatObj = category ? (menuQuery.data?.categories || []).find(c => c.id === category) : undefined;
  const hasMenuError = menuQuery.isError;
  const activeCategoryObj = (menuQuery.data?.categories || []).find(c => c.id === activeItem?.categoryId);

  useMenuAnimation(
    menuRef,
    detailElement,
    motion.enabled,
    restaurant?.id,
    filtered.map(item => item.id).join(','),
    detailOpen ? activeItem?.id || null : null,
  );

  function openItem(item: MenuItem) {
    setSelectedId(item.id);
    setSelectedVariantId(null);
    setSelectedModifiers({});
    setItemQty(1);
    setItemNote('');
    setDetailOpen(true);
  }

  function canQuickAddItem(item: MenuItem): boolean {
    if (item.hasMultiplePricing) return false;
    const groups = item.modifierGroups || [];
    if (groups.some(g => g.minSelections > 0)) return false;
    return true;
  }

  function handleQuickStepItem(item: MenuItem, delta: 1 | -1) {
    const unitTotal = customizationTotal(item.price, item.discount, []);
    const baseKey = `${item.id}:base::`;
    setCart(prev => {
      const existing = prev.find(line => line.key === baseKey);
      if (delta === 1) {
        if (existing) {
          return prev.map(line => (line.key === baseKey ? { ...line, quantity: line.quantity + 1 } : line));
        }
        return [
          ...prev,
          {
            key: baseKey,
            menuItemId: item.id,
            name: item.name,
            quantity: 1,
            variantId: null,
            variantLabel: null,
            modifiers: {},
            modifierSummary: [],
            unitTotal,
          },
        ];
      }
      if (!existing) {
        // Fallback: decrement most recent cart line for this item
        const anyIdx = prev.findIndex(line => line.menuItemId === item.id);
        if (anyIdx === -1) return prev;
        const target = prev[anyIdx];
        if (target.quantity <= 1) return prev.filter((_, i) => i !== anyIdx);
        return prev.map((line, i) => (i === anyIdx ? { ...line, quantity: line.quantity - 1 } : line));
      }
      if (existing.quantity <= 1) {
        return prev.filter(line => line.key !== baseKey);
      }
      return prev.map(line => (line.key === baseKey ? { ...line, quantity: line.quantity - 1 } : line));
    });
  }

  function toggleSaved(itemId: string) {
    const next = saved.includes(itemId) ? saved.filter(i => i !== itemId) : [...saved, itemId];
    setSaved(next);
    try {
      localStorage.setItem('cafe-favorites-' + id, JSON.stringify(next));
    } catch {
      /* Browsing works without storage. */
    }
  }

  function reset() {
    setSearch('');
    setCategory(null);
    setGroup('all');
    setFilter('all');
  }

  function chooseCategory(next: string | null) {
    setCategory(next);
    window.scrollTo({ top: 0, behavior: motion.enabled ? 'smooth' : 'auto' });
  }

  function handleItemAggregatorClick(agg: any, item: MenuItem) {
    const targetUrl = item.aggregatorOverrides?.[agg.platform] || agg.url;
    try {
      void fetch('/api/public/aggregator-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant!.id,
          aggregatorId: agg.id,
          platform: agg.platform,
          menuItemId: item.id,
          locale: language,
        }),
      });
    } catch {}
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }

  function itemPricing(item: MenuItem) {
    const options = byItem.get(item.id) || [];
    if (item.hasMultiplePricing)
      return (
        <div className="guest-variants">
          {menuQuery.isLoading ? (
            <span>{t('Loading prices…')}</span>
          ) : options.length ? (
            options.map(v => (
              <div key={v.id}>
                <span className="guest-option-label">{localizedEntityText(language, v.label, v.labelAr, label)}</span>
                <Price
                  price={v.price}
                  discount={v.discount}
                  currency={restaurant!.currency}
                  unit={v.unit}
                  currencySymbolAr={venueCfg.currencySymbolAr}
                />
              </div>
            ))
          ) : (
            <span>{t('Ask our team for pricing')}</span>
          )}
        </div>
      );
    return (
      <Price
        price={item.price}
        discount={item.discount}
        currency={restaurant!.currency}
        unit={item.unit}
        currencySymbolAr={venueCfg.currencySymbolAr}
      />
    );
  }

  function cardPricing(item: MenuItem) {
    const options = byItem.get(item.id) || [];
    if (!item.hasMultiplePricing || !options.length) return itemPricing(item);
    const lowest = options.reduce((best, option) =>
      Number(option.price) * (1 - Number(option.discount || 0) / 100) <
      Number(best.price) * (1 - Number(best.discount || 0) / 100)
        ? option
        : best,
    );
    return (
      <div className="guest-starting-price">
        <small>{t('From')}</small>
        <Price
          price={lowest.price}
          discount={lowest.discount}
          currency={restaurant!.currency}
          unit={lowest.unit}
          currencySymbolAr={venueCfg.currencySymbolAr}
        />
      </div>
    );
  }

  if (menuQuery.isLoading)
    return (
      <div className="guest-menu guest-loading" lang={language} dir={dir} style={cafeThemeStyle()}>
        <MenuLanguageSwitch />
        <Coffee size={40} />
        <p>{t('Preparing your menu…')}</p>
      </div>
    );

  if (!restaurant || (menuQuery.isError && !keepMenuDuringReconnect(menuQuery.error, menuQuery.dataUpdatedAt, now)))
    return (
      <div className="guest-menu guest-loading" lang={language} dir={dir} style={cafeThemeStyle()}>
        <MenuLanguageSwitch />
        <Coffee size={40} />
        <h1>{t("We'll be back shortly.")}</h1>
        <p>{t('This café menu is currently unavailable.')}</p>
        <button className="guest-button cursor-pointer" onClick={() => menuQuery.refetch()}>
          {t('Try again')}
        </button>
      </div>
    );

  const orderingEnabled = restaurant.orderingMode !== 'browse_and_pager';
  const cafeDisplayName = localizedEntityText(language, restaurant.name, restaurant.nameAr, label);
  const displayHours = localizedEntityText(language, restaurant.openingHours, restaurant.openingHoursAr);
  const displayAddress = localizedEntityText(language, restaurant.address, restaurant.addressAr);

  const activeUnitTotal =
    activeItem && (!activeItem.hasMultiplePricing || activeVariant)
      ? customizationTotal(
          activeItem.hasMultiplePricing ? activeVariant!.price : activeItem.price,
          activeItem.hasMultiplePricing ? activeVariant!.discount : activeItem.discount,
          selectedExtras,
        )
      : '0.00';
  const activeMultipliedTotal = (Number(activeUnitTotal) * itemQty).toFixed(2);

  return (
    <MenuCustomTranslationsProvider customTranslations={venueCfg.customTranslations}>
      <div
        ref={menuRef}
        className="guest-menu guest-live guest-simple"
        lang={language}
        dir={dir}
        style={liveCafeStyle(restaurant.theme, restaurant.brandAccentHex)}
        data-motion={motion.enabled ? 'on' : 'off'}
        data-page-visible={motion.pageVisible}
      >
        <div className="guest-atmosphere" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="guest-shell">
          <div className="guest-navigation">
            <header className="guest-top">
              <div className="guest-brand">
                {restaurant.logoUrl ? (
                  <img
                    className="guest-brand-logo"
                    src={restaurant.logoUrl}
                    alt={t('{name} logo', { name: cafeDisplayName })}
                  />
                ) : (
                  <span className="guest-brand-icon">
                    <Coffee size={19} />
                  </span>
                )}
                <span>
                  <bdi>{cafeDisplayName}</bdi>
                  <small>
                    {displayHours || (language === 'ar' ? venueCfg.menuEyebrowAr : venueCfg.menuEyebrow)}
                  </small>
                </span>
              </div>
              <div className="guest-header-actions">
                <MenuLanguageSwitch />
                <button
                  className="guest-filter-trigger cursor-pointer"
                  onClick={() => setFiltersOpen(true)}
                  aria-label={t('Open filters')}
                >
                  <SlidersHorizontal size={18} />
                  <span>{t('Filters')}</span>
                  {appliedFilters > 0 && <small>{appliedFilters}</small>}
                </button>
              </div>
            </header>
            <MenuCategoryBar
              categories={groupCategories}
              selected={category}
              allLabel={
                group === 'all'
                  ? t('All')
                  : t('All {group}', { group: t(MENU_GROUPS.find(g => g.id === group)!.label) })
              }
              motionEnabled={motion.enabled}
              onSelect={chooseCategory}
            />
          </div>

          <h1 className="sr-only">{t('{name} menu', { name: cafeDisplayName })}</h1>

          {hasMenuError && (
            <div className="guest-reconnecting" role="status">
              <p>{t('Reconnecting. Prices and availability may have changed.')}</p>
              <button disabled={menuQuery.isFetching} onClick={() => menuQuery.refetch()} className="cursor-pointer">
                {t('Try again')}
              </button>
            </div>
          )}

          <ActiveGuestPassesBar restaurantId={restaurant.id} />
          <MenuCover cafe={restaurant} motion={motion.enabled && motion.pageVisible} />

          <GuestHospitalityBar
            restaurant={restaurant}
            cart={cart}
            setCart={setCart}
            initialTableCode={initialTableCode}
            initialBayId={initialBayId}
            initialAction={initialAction}
          />

          {/* Sleek Single-Row Search + 1-Tap Discovery Chips */}
          <div className="mt-3 mb-4 space-y-2.5">
            <div className="guest-search !mt-0">
              <Search size={18} />
              <input
                aria-label={t('Search menu')}
                placeholder={t('Search items or categories')}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} aria-label={t('Clear search')} className="cursor-pointer">
                  <X size={17} />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-0.5">
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  aria-pressed={filter === 'all' && !category && group === 'all'}
                  onClick={() => setFilter('all')}
                  className={`min-h-11 px-3.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                    filter === 'all'
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-white/90 text-[#17132E] border-[#E5E2F2] hover:bg-white'
                  }`}
                >
                  {t('All')} ({available.length})
                </button>

                {specialsCount > 0 && (
                  <button
                    type="button"
                    aria-pressed={filter === 'specials'}
                    onClick={() => setFilter(f => (f === 'specials' ? 'all' : 'specials'))}
                    className={`min-h-11 px-3.5 rounded-full text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                      filter === 'specials'
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-white/90 text-[#17132E] border-[#E5E2F2] hover:bg-white'
                    }`}
                  >
                    <Sparkles size={13} className={filter === 'specials' ? '' : 'text-primary'} />
                    <span>{t("Today's specials")}</span>
                  </button>
                )}

                {saved.length > 0 && (
                  <button
                    type="button"
                    aria-pressed={filter === 'saved'}
                    onClick={() => setFilter(f => (f === 'saved' ? 'all' : 'saved'))}
                    className={`min-h-11 px-3.5 rounded-full text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                      filter === 'saved'
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-white/90 text-[#17132E] border-[#E5E2F2] hover:bg-white'
                    }`}
                  >
                    <Heart size={13} fill={filter === 'saved' ? 'currentColor' : 'none'} className={filter === 'saved' ? '' : 'text-primary'} />
                    <span>
                      {t('Saved')} ({saved.length})
                    </span>
                  </button>
                )}
              </div>

              {venueCfg.wheelEnabled && (
                <button
                  type="button"
                  className="guest-wheel-link shrink-0 cursor-pointer"
                  onClick={() => setWheelOpen(true)}
                  disabled={!filtered.length || hasMenuError}
                >
                  <Sparkles size={15} />
                  <span>{t("Can't decide?")}</span>
                </button>
              )}
            </div>
          </div>

          <main id="guest-menu-list" className="guest-main">
            {menuQuery.isLoading ? (
              <div className="guest-grid" aria-label={t('Loading menu')}>
                {[0, 1, 2, 3].map(i => (
                  <div className="guest-card-skeleton" key={i} />
                ))}
              </div>
            ) : filtered.length ? (
              <div className="guest-sections">
                {(menuQuery.data?.categories || []).map(c => {
                  const items = filtered.filter(i => i.categoryId === c.id);
                  return items.length ? (
                    <section key={c.id} aria-labelledby={'category-' + c.id} data-tone={menuTone(c.title)}>
                      <div className="guest-category-heading">
                        <h2 id={'category-' + c.id}>{localizedEntityText(language, c.title, c.titleAr, label)}</h2>
                        <span className="guest-section-count">{count(items.length)}</span>
                      </div>
                      <div className="guest-grid">
                        {items.map(item => {
                          const itemDisplayName = localizedEntityText(language, item.name, item.nameAr, label);
                          const itemDesc =
                            item.description || item.descriptionAr
                              ? localizedEntityText(
                                  language,
                                  item.description || item.descriptionAr || '',
                                  item.descriptionAr,
                                  label,
                                )
                              : '';
                          const qtyInCart = cartQtyByItemId.get(item.id) || 0;
                          const quickAddEligible = orderingEnabled && canQuickAddItem(item);

                          return (
                            <article className="guest-item" key={item.id} data-testid={'menu-item-' + item.id}>
                              <div className="guest-image-open">
                                <MenuImage item={item} category={c.title} priority={filtered.indexOf(item) < 4} />
                              </div>
                              <div className="guest-item-body">
                                <div className="guest-item-badges">
                                  {item.specialDate === today && (
                                    <span>
                                      <Sparkles size={11} />
                                      {t('Today only')}
                                    </span>
                                  )}
                                  {!item.hasMultiplePricing && Number(item.discount) > 0 && (
                                    <span className="offer">
                                      {t('{discount}% off', { discount: Number(item.discount) })}
                                    </span>
                                  )}
                                  {item.prepTimeMins && item.prepTimeMins > 0 ? (
                                    <span>{t('Prep ~{mins}m', { mins: item.prepTimeMins })}</span>
                                  ) : null}
                                </div>
                                <h3 className="guest-card-name">
                                  <bdi>{itemDisplayName}</bdi>
                                </h3>
                                {itemDesc && (
                                  <p className="guest-card-desc">
                                    <bdi>{itemDesc}</bdi>
                                  </p>
                                )}
                                <div className="guest-card-bottom">
                                  <div className="guest-item-pricing">{cardPricing(item)}</div>
                                  {!orderingEnabled && (
                                    <span className="guest-card-arrow" aria-hidden="true">
                                      <ArrowUpRight size={17} />
                                    </span>
                                  )}
                                </div>
                              </div>

                              <button
                                className="guest-item-open cursor-pointer"
                                aria-label={t('View {name}', { name: itemDisplayName })}
                                onClick={() => openItem(item)}
                              />

                              <button
                                className={'guest-heart cursor-pointer ' + (saved.includes(item.id) ? 'is-saved' : '')}
                                aria-label={t(saved.includes(item.id) ? 'Unsave {name}' : 'Save {name}', {
                                  name: itemDisplayName,
                                })}
                                aria-pressed={saved.includes(item.id)}
                                onClick={() => toggleSaved(item.id)}
                              >
                                <Heart size={15} fill={saved.includes(item.id) ? 'currentColor' : 'none'} />
                              </button>

                              {/* 1-Tap Quick-Add / Inline Stepper Control */}
                              {orderingEnabled && (
                                <div className="guest-quick-add-slot">
                                  {quickAddEligible && qtyInCart > 0 ? (
                                    <div
                                      className="guest-inline-stepper"
                                      role="group"
                                      aria-label={`${itemDisplayName} quantity`}
                                    >
                                      <button
                                        type="button"
                                        aria-label={`Remove one ${itemDisplayName}`}
                                        onClick={() => handleQuickStepItem(item, -1)}
                                        className="guest-stepper-btn cursor-pointer"
                                      >
                                        <Minus size={14} />
                                      </button>
                                      <span className="guest-stepper-qty font-mono">{qtyInCart}</span>
                                      <button
                                        type="button"
                                        aria-label={`Add one more ${itemDisplayName}`}
                                        onClick={() => handleQuickStepItem(item, 1)}
                                        className="guest-stepper-btn cursor-pointer"
                                      >
                                        <Plus size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      data-testid={`button-quick-add-${item.id}`}
                                      aria-label={
                                        quickAddEligible
                                          ? `Add ${itemDisplayName} to order`
                                          : `Customize ${itemDisplayName}`
                                      }
                                      onClick={() =>
                                        quickAddEligible ? handleQuickStepItem(item, 1) : openItem(item)
                                      }
                                      className="guest-quick-add-btn cursor-pointer"
                                    >
                                      <Plus size={17} strokeWidth={2.5} />
                                      {!quickAddEligible && qtyInCart > 0 && (
                                        <span className="guest-quick-badge font-mono">{qtyInCart}</span>
                                      )}
                                    </button>
                                  )}
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ) : null;
                })}
              </div>
            ) : (
              <div className="guest-empty">
                <span className="guest-empty-icon">
                  <Coffee size={38} strokeWidth={1.5} />
                </span>
                <h2>
                  {t(
                    available.length
                      ? hasDiscoverySelection
                        ? 'A different craving?'
                        : filter === 'saved'
                          ? 'Keep your favorites close.'
                          : filter === 'specials'
                            ? 'More good things soon.'
                            : 'A different craving?'
                      : 'Something good is brewing.',
                  )}
                </h2>
                <p>
                  {t(
                    available.length
                      ? hasDiscoverySelection
                        ? 'No items match your search and filters. Try another word or explore the full menu.'
                        : filter === 'saved'
                          ? 'Tap a heart to save something you love.'
                          : filter === 'specials'
                            ? 'No specials are listed for today. There’s plenty to explore on the menu.'
                            : 'No selections match your filters. Try the full menu.'
                      : 'Our café team is preparing the menu. Ask us about today’s available selections.',
                  )}
                </p>
                {available.length > 0 && (
                  <button className="guest-button cursor-pointer" onClick={reset}>
                    {t('Explore the menu')} <ArrowUpRight size={16} />
                  </button>
                )}
              </div>
            )}

            <div className="guest-note">
              <Leaf size={17} />
              <p>
                {language === 'ar' ? venueCfg.allergenNoticeAr : venueCfg.allergenNotice}
                <br />
                <strong>{t('Our café team is happy to help.')}</strong>
              </p>
            </div>
          </main>

          <div className="my-3">
            <PwaInstallBanner compact />
          </div>

          {(displayHours || displayAddress || restaurant.phone) && (
            <div className="guest-info">
              {displayHours && (
                <span>
                  <Clock3 size={14} />
                  <bdi>{displayHours}</bdi>
                </span>
              )}
              {displayAddress && (
                <a
                  href={'https://maps.google.com/?q=' + encodeURIComponent(restaurant.address || displayAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPin size={14} />
                  <bdi>{displayAddress}</bdi>
                </a>
              )}
              {restaurant.phone && (
                <a href={'tel:' + restaurant.phone}>
                  <Phone size={14} />
                  {t('Call café')}
                </a>
              )}
            </div>
          )}

          <footer className="guest-footer pb-28">
            <span>
              <bdi>{cafeDisplayName}</bdi>
              <small className="inline-flex items-center justify-center gap-1.5 opacity-65">
                <DingziMark size={15} variant="thermal" />
                <span>
                  {t('Powered by dingzi')} · {language === 'ar' ? venueCfg.footerTaglineAr : venueCfg.footerTagline}
                </span>
              </small>
            </span>
          </footer>
        </div>

        <GuestMenuFiltersDialog
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          filterTitleRef={filterTitleRef}
          language={language}
          dir={dir}
          panelStyle={liveCafeStyle(restaurant.theme, restaurant.brandAccentHex)}
          motion={motion}
          group={group}
          setGroup={setGroup}
          category={category}
          setCategory={setCategory}
          filter={filter}
          setFilter={setFilter}
          available={available}
          categoryGroups={categoryGroups}
          groupCategories={groupCategories}
          filteredCount={filtered.length}
          onReset={reset}
        />

        {wheelOpen && venueCfg.wheelEnabled && (
          <MenuWheel
            items={filtered}
            theme={restaurant.theme}
            motionEnabled={motion.enabled}
            maxSlots={venueCfg.wheelMaxItems}
            scope={
              selectedCatObj
                ? localizedEntityText(language, selectedCatObj.title, selectedCatObj.titleAr, label)
                : group === 'all'
                  ? 'Your current menu filters'
                  : MENU_GROUPS.find(g => g.id === group)!.label
            }
            onClose={() => setWheelOpen(false)}
            onSelect={item => {
              setWheelOpen(false);
              openItem(item);
            }}
            pricing={cardPricing}
          />
        )}

        <GuestItemDetailDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          setDetailElement={setDetailElement}
          detailTitleRef={detailTitleRef}
          motionEnabled={motion.enabled}
          pageVisible={motion.pageVisible}
          hasMenuError={hasMenuError}
          restaurant={restaurant}
          currencySymbolAr={venueCfg.currencySymbolAr}
          activeItem={activeItem}
          activeCategoryObj={activeCategoryObj}
          activeOptions={activeOptions}
          activeVariant={activeVariant}
          setSelectedVariantId={setSelectedVariantId}
          activeGroups={activeGroups}
          selectedModifiers={selectedModifiers}
          setSelectedModifiers={setSelectedModifiers}
          selectedExtras={selectedExtras}
          missingChoices={missingChoices}
          unavailableRequired={unavailableRequired}
          today={today}
          itemQty={itemQty}
          setItemQty={setItemQty}
          itemNote={itemNote}
          setItemNote={setItemNote}
          orderingEnabled={orderingEnabled}
          activeUnitTotal={activeUnitTotal}
          activeMultipliedTotal={activeMultipliedTotal}
          saved={saved}
          toggleSaved={toggleSaved}
          setCart={setCart}
          aggregators={aggregators}
          onItemAggregatorClick={handleItemAggregatorClick}
          renderItemPricing={itemPricing}
        />
      </div>
    </MenuCustomTranslationsProvider>
  );
}

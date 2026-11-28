import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import {
  AlertTriangle,
  Check,
  Clock3,
  ExternalLink,
  Heart,
  Leaf,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  Truck,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import MenuModifiers from '@/components/menu/MenuModifiers';
import { MenuImage, Price } from '@/components/menu/GuestMenuParts';
import { liveCafeStyle, menuTone } from '@/lib/menuPalette';
import { localizedEntityText, useMenuLanguage } from '@/lib/menuLanguage';
import { formatCurrencyForLocale } from '@shared/venueConfig';
import type {
  Category,
  MenuItem,
  MenuModifierGroup,
  MenuModifierOption,
  PriceVariant,
  PublicCafe,
  PublicHospitalityConfig,
} from '@shared/schema';
import type { MenuModifierSelections } from '@shared/menuCustomization';
import type { GuestCartItem } from '@/components/hospitality/GuestHospitalityBar';

interface GuestItemDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setDetailElement: (el: HTMLDivElement | null) => void;
  detailTitleRef: RefObject<HTMLHeadingElement>;
  motionEnabled: boolean;
  pageVisible: boolean;
  hasMenuError: boolean;
  restaurant: PublicCafe;
  currencySymbolAr?: string | null;
  activeItem: MenuItem | undefined;
  activeCategoryObj: Category | undefined;
  activeOptions: PriceVariant[];
  activeVariant: PriceVariant | undefined;
  setSelectedVariantId: (id: string | null) => void;
  activeGroups: MenuModifierGroup[];
  selectedModifiers: MenuModifierSelections;
  setSelectedModifiers: Dispatch<SetStateAction<MenuModifierSelections>>;
  selectedExtras: MenuModifierOption[];
  missingChoices: MenuModifierGroup[];
  unavailableRequired: boolean;
  today: string;
  itemQty: number;
  setItemQty: Dispatch<SetStateAction<number>>;
  itemNote: string;
  setItemNote: (note: string) => void;
  orderingEnabled: boolean;
  activeUnitTotal: string;
  activeMultipliedTotal: string;
  saved: string[];
  toggleSaved: (itemId: string) => void;
  setCart: Dispatch<SetStateAction<GuestCartItem[]>>;
  aggregators: PublicHospitalityConfig['aggregators'];
  onItemAggregatorClick: (agg: PublicHospitalityConfig['aggregators'][number], item: MenuItem) => void;
  renderItemPricing: (item: MenuItem) => ReactNode;
}

export function GuestItemDetailDialog({
  open,
  onOpenChange,
  setDetailElement,
  detailTitleRef,
  motionEnabled,
  pageVisible,
  hasMenuError,
  restaurant,
  currencySymbolAr,
  activeItem,
  activeCategoryObj,
  activeOptions,
  activeVariant,
  setSelectedVariantId,
  activeGroups,
  selectedModifiers,
  setSelectedModifiers,
  selectedExtras,
  missingChoices,
  unavailableRequired,
  today,
  itemQty,
  setItemQty,
  itemNote,
  setItemNote,
  orderingEnabled,
  activeUnitTotal,
  activeMultipliedTotal,
  saved,
  toggleSaved,
  setCart,
  aggregators,
  onItemAggregatorClick,
  renderItemPricing,
}: GuestItemDetailDialogProps) {
  const { language, dir, t, label } = useMenuLanguage();
  const activeCategoryTitle = activeCategoryObj?.title || 'Café selection';
  const activeCategoryLabel = activeCategoryObj
    ? localizedEntityText(language, activeCategoryObj.title, activeCategoryObj.titleAr, label)
    : t('Café selection');
  const currencyLabel = formatCurrencyForLocale(restaurant.currency, language, currencySymbolAr);

  return (
    <Dialog open={open && !!activeItem} onOpenChange={onOpenChange}>
      <DialogContent
        ref={setDetailElement}
        onOpenAutoFocus={event => {
          event.preventDefault();
          detailTitleRef.current?.focus({ preventScroll: true });
        }}
        lang={language}
        dir={dir}
        closeLabel={t('Close')}
        overlayClassName={'guest-glass-overlay ' + (!motionEnabled ? 'is-still' : '')}
        className="guest-detail guest-glass-detail guest-compact-detail"
        style={liveCafeStyle(restaurant.theme, restaurant.brandAccentHex)}
        data-motion={motionEnabled ? 'on' : 'off'}
        data-page-visible={pageVisible}
        data-tone={menuTone(activeCategoryTitle)}
      >
        {activeItem && (
          <>
            <div className="guest-detail-heading">
              <div className="guest-detail-image">
                <span className="guest-detail-aura" aria-hidden="true" />
                <MenuImage item={activeItem} category={activeCategoryTitle} priority />
              </div>
              <div className="guest-detail-heading-copy">
                <p className="guest-kicker">{activeCategoryLabel}</p>
                <DialogTitle ref={detailTitleRef} tabIndex={-1} className="guest-detail-title">
                  <bdi>{localizedEntityText(language, activeItem.name, activeItem.nameAr, label)}</bdi>
                </DialogTitle>
                <div className="guest-detail-price">
                  {activeItem.hasMultiplePricing ? (
                    activeVariant ? (
                      <Price
                        price={activeVariant.price}
                        discount={activeVariant.discount}
                        currency={restaurant.currency}
                        unit={activeVariant.unit}
                        currencySymbolAr={currencySymbolAr}
                      />
                    ) : (
                      <span>{t('Ask our team for pricing')}</span>
                    )
                  ) : (
                    renderItemPricing(activeItem)
                  )}
                </div>
              </div>
            </div>

            <div className="guest-detail-body" tabIndex={0} role="region" aria-label={t('Item options and details')}>
              {hasMenuError && (
                <p className="guest-reconnecting" role="status">
                  {t('Reconnecting. Prices and availability may have changed.')}
                </p>
              )}
              <DialogDescription
                className={activeItem.description || activeItem.descriptionAr ? 'guest-detail-description' : 'sr-only'}
              >
                <bdi>
                  {activeItem.description || activeItem.descriptionAr
                    ? localizedEntityText(language, activeItem.description || activeItem.descriptionAr, activeItem.descriptionAr, label)
                    : t('Menu item details and pricing.')}
                </bdi>
              </DialogDescription>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                {activeItem.specialDate === today && (
                  <span className="guest-detail-special !mt-0">
                    <Sparkles size={14} />
                    {t("Today's special")}
                  </span>
                )}
                {activeItem.prepTimeMins ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EFEAFF] text-[#4B1FE0] text-[11px] font-semibold">
                    <Clock3 size={12} />
                    {t('Prep ~{mins}m', { mins: activeItem.prepTimeMins })}
                  </span>
                ) : null}
              </div>

              {activeItem.hasMultiplePricing && activeOptions.length > 0 && (
                <fieldset className="guest-option-picker">
                  <legend>{t('CHOOSE YOUR OPTION')}</legend>
                  {activeOptions.map(option => (
                    <label key={option.id} className={activeVariant?.id === option.id ? 'selected' : ''}>
                      <input
                        type="radio"
                        name="menu-price-option"
                        value={option.id}
                        checked={activeVariant?.id === option.id}
                        onChange={() => setSelectedVariantId(option.id)}
                      />
                      <span>{localizedEntityText(language, option.label, option.labelAr, label)}</span>
                      <Price
                        price={option.price}
                        discount={option.discount}
                        currency={restaurant.currency}
                        unit={option.unit}
                        currencySymbolAr={currencySymbolAr}
                      />
                    </label>
                  ))}
                </fieldset>
              )}

              {!!activeGroups.length && (!activeItem.hasMultiplePricing || activeVariant) && (
                <MenuModifiers
                  item={activeItem}
                  currency={restaurant.currency}
                  selected={selectedModifiers}
                  setSelected={setSelectedModifiers}
                />
              )}

              {!!activeItem.tags?.length && (
                <div className="guest-detail-tags">
                  {activeItem.tags.map(tag => (
                    <span key={tag}>
                      {['Vegetarian', 'Vegan'].includes(tag) && <Leaf size={13} />} {label(tag)}
                    </span>
                  ))}
                </div>
              )}

              {!!activeItem.allergenTags?.length && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>
                    <strong>{t('Allergens')}:</strong> {activeItem.allergenTags.map(label).join(', ')}
                  </span>
                </div>
              )}

              {orderingEnabled && (
                <div className="mt-4 space-y-3 pt-3 border-t border-[#E5E2F2]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-[#17132E]">{t('Quantity')}</span>
                    <div className="inline-flex items-center gap-2 rounded-xl border border-[#E5E2F2] bg-[#F6F5FC] p-1">
                      <button
                        type="button"
                        aria-label="Decrease item quantity"
                        disabled={itemQty <= 1}
                        onClick={() => setItemQty(q => Math.max(1, q - 1))}
                        className="w-11 h-11 rounded-xl bg-white border border-[#E5E2F2] grid place-items-center disabled:opacity-40 cursor-pointer"
                      >
                        <Minus size={15} />
                      </button>
                      <span className="w-8 text-center font-mono font-bold text-sm" data-testid="text-customizer-qty">
                        {itemQty}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase item quantity"
                        disabled={itemQty >= 25}
                        onClick={() => setItemQty(q => Math.min(25, q + 1))}
                        className="w-11 h-11 rounded-xl bg-white border border-[#E5E2F2] grid place-items-center disabled:opacity-40 cursor-pointer"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    maxLength={240}
                    value={itemNote}
                    onChange={e => setItemNote(e.target.value)}
                    placeholder={t('Special instructions for kitchen (optional)')}
                    aria-label={t('Special instructions for kitchen (optional)')}
                    data-testid="input-customizer-note"
                    className="w-full min-h-11 px-3.5 rounded-xl border border-[#E5E2F2] bg-[#F6F5FC] text-base sm:text-xs text-[#17132E] placeholder:text-[#57507A] focus:outline-none focus:ring-2 focus:ring-[#4B1FE0]"
                  />
                </div>
              )}

              {aggregators.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#E5E2F2] space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#57507A] flex items-center gap-1.5">
                    <Truck size={13} className="text-primary" />
                    <span>{t('Order via Delivery Partner')}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {aggregators.map(agg => (
                      <button
                        key={agg.id}
                        type="button"
                        data-testid={`button-item-aggregator-${agg.platform}`}
                        onClick={() => onItemAggregatorClick(agg, activeItem)}
                        className="min-h-11 px-3.5 rounded-xl border border-[#E5E2F2] bg-white hover:bg-[#EFEAFF] text-xs font-semibold text-[#17132E] hover:text-[#4B1FE0] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>{agg.displayName}</span>
                        <ExternalLink size={12} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {unavailableRequired && (
                <p className="guest-modifier-required" role="status">
                  {t('Some required choices are unavailable. Please ask our team for alternatives.')}
                </p>
              )}
              <div className="guest-detail-note">
                <Leaf size={15} />
                <span>{t('For ingredients and allergens, please ask our team.')}</span>
              </div>
              {!orderingEnabled && !!activeGroups.length && (
                <p className="guest-customization-note">
                  {t('Selections are for reference. Tell our team your choices when ordering.')}
                </p>
              )}
            </div>

            <footer className="guest-selection-footer">
              <div className="guest-selection-heading">
                <span>{t('Your selection')}</span>
                <button
                  type="button"
                  className={'guest-detail-save ' + (saved.includes(activeItem.id) ? 'is-saved' : '')}
                  aria-label={t(saved.includes(activeItem.id) ? 'Saved to favorites' : 'Save to favorites')}
                  aria-pressed={saved.includes(activeItem.id)}
                  onClick={() => toggleSaved(activeItem.id)}
                >
                  <Heart size={19} />
                </button>
              </div>
              <div className="guest-selected-choices" role="region" aria-label={t('Selected variant and toppings')} tabIndex={0}>
                {activeItem.hasMultiplePricing && activeVariant && (
                  <span className="guest-selected-variant">
                    <Check size={12} />
                    <bdi>{localizedEntityText(language, activeVariant.label, activeVariant.labelAr, label)}</bdi>
                  </span>
                )}
                {selectedExtras.map(option => (
                  <span className="guest-selected-extra" key={option.id}>
                    <bdi>{language === 'ar' && option.labelAr?.trim() ? option.labelAr : label(option.label)}</bdi>
                    {Number(option.price) > 0 && (
                      <small>
                        <bdi dir="ltr">+{Number(option.price).toFixed(2)}</bdi>
                      </small>
                    )}
                  </span>
                ))}
                {!selectedExtras.length && !!activeGroups.length && <span className="guest-no-extras">{t('No extras selected')}</span>}
                {!activeItem.hasMultiplePricing && !activeGroups.length && <span className="guest-no-extras">{label(activeItem.unit)}</span>}
              </div>
              {missingChoices.length > 0 && (
                <p className="guest-selection-required" role="status">
                  {t('Choose required options.')}
                </p>
              )}
              <div className="guest-selection-total" role="status" aria-live="polite" aria-atomic="true">
                <span>{t('Estimated total')}</span>
                {!activeItem.hasMultiplePricing || activeVariant ? (
                  <strong>
                    <bdi dir="ltr">{orderingEnabled ? activeMultipliedTotal : activeUnitTotal}</bdi> <small>{currencyLabel}</small>
                  </strong>
                ) : (
                  <strong className="guest-selection-no-price">{t('Ask our team for pricing')}</strong>
                )}
              </div>

              {orderingEnabled && (!activeItem.hasMultiplePricing || activeVariant) && (
                <button
                  type="button"
                  disabled={missingChoices.length > 0 || unavailableRequired}
                  data-testid="button-add-item-to-cart"
                  onClick={() => {
                    const trimmedNote = itemNote.trim();
                    const key = `${activeItem.id}:${activeVariant?.id || 'base'}:${selectedExtras
                      .map(e => e.id)
                      .sort()
                      .join(',')}:${trimmedNote}`;
                    setCart(prev => {
                      const existing = prev.find(i => i.key === key);
                      if (existing) {
                        return prev.map(i => (i.key === key ? { ...i, quantity: i.quantity + itemQty } : i));
                      }
                      return [
                        ...prev,
                        {
                          key,
                          menuItemId: activeItem.id,
                          name: activeItem.name,
                          quantity: itemQty,
                          variantId: activeVariant?.id || null,
                          variantLabel: activeVariant?.label || null,
                          modifiers: selectedModifiers,
                          modifierSummary: selectedExtras.map(o => (language === 'ar' && o.labelAr ? o.labelAr : o.label)),
                          unitTotal: activeUnitTotal,
                          ...(trimmedNote ? { notes: trimmedNote } : {}),
                        },
                      ];
                    });
                    onOpenChange(false);
                  }}
                  className="mt-3 w-full min-h-11 rounded-xl bg-primary hover:bg-[#4B1FE0] text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <ShoppingBag size={16} />
                  <span>{itemQty > 1 ? t('Add {qty} to Order', { qty: itemQty }) : t('Add to Order')}</span>
                </button>
              )}
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useRef } from 'react';
import type { Category } from '@shared/schema';
import { useMenuLanguage } from '@/lib/menuLanguage';

export default function MenuCategoryBar({
  categories,
  selected,
  allLabel,
  motionEnabled,
  onSelect,
}: {
  categories: Category[];
  selected: string | null;
  allLabel: string;
  motionEnabled: boolean;
  onSelect: (id: string | null) => void;
}) {
  const { language, dir, label, t } = useMenuLanguage();
  const rtl = dir === 'rtl';
  const rail = useRef<HTMLElement>(null);
  const categoryKey = categories.map(c => `${c.id}:${c.title}:${c.titleAr || ''}`).join('|');

  useEffect(() => {
    const element = rail.current;
    const button = element?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!element || !button) return;
    const buttonBounds = button.getBoundingClientRect();
    const railBounds = element.getBoundingClientRect();
    element.scrollTo({
      left: element.scrollLeft + (rtl ? buttonBounds.right - railBounds.right : buttonBounds.left - railBounds.left),
      behavior: motionEnabled ? 'smooth' : 'auto',
    });
  }, [selected, categoryKey, allLabel, motionEnabled, rtl]);

  return (
    <div className="guest-category-rail">
      <nav ref={rail} className="guest-category-bar" aria-label={t('Menu categories')}>
        <button
          type="button"
          aria-pressed={!selected}
          onClick={() => onSelect(null)}
          className="cursor-pointer"
        >
          <span className="guest-category-label">{allLabel}</span>
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            aria-pressed={selected === cat.id}
            onClick={() => onSelect(cat.id)}
            className="cursor-pointer"
          >
            <span className="guest-category-label">
              {language === 'ar' && cat.titleAr?.trim() ? cat.titleAr : label(cat.title)}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}

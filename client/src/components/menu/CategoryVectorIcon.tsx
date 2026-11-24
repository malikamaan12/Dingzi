import {
  Coffee,
  CupSoda,
  Flame,
  GlassWater,
  IceCreamCone,
  Leaf,
  Pizza,
  Sandwich,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';

export function CategoryVectorIcon({
  title,
  size = 16,
  className = '',
}: {
  title: string;
  size?: number;
  className?: string;
}) {
  const name = title.toLowerCase();
  if (/pizza/.test(name)) return <Pizza size={size} className={className} aria-hidden="true" />;
  if (/hot dog|combo|burger|sandwich|wrap/.test(name)) return <Sandwich size={size} className={className} aria-hidden="true" />;
  if (/soft serve|ice cream|dessert|strawberry|sweet|pancake|waffle/.test(name)) {
    return <IceCreamCone size={size} className={className} aria-hidden="true" />;
  }
  if (/matcha|salad|bowl/.test(name)) return <Leaf size={size} className={className} aria-hidden="true" />;
  if (/cold|iced|slush/.test(name)) return <CupSoda size={size} className={className} aria-hidden="true" />;
  if (/juice|fruit|mocktail|water|refresh/.test(name)) return <GlassWater size={size} className={className} aria-hidden="true" />;
  if (/coffee|tea|karak|espresso/.test(name)) return <Coffee size={size} className={className} aria-hidden="true" />;
  if (/potato|fries|nugget|corn|popcorn/.test(name)) return <Flame size={size} className={className} aria-hidden="true" />;
  if (/all|special|extra/.test(name)) return <Sparkles size={size} className={className} aria-hidden="true" />;
  return <UtensilsCrossed size={size} className={className} aria-hidden="true" />;
}

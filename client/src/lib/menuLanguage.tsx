import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Languages } from 'lucide-react';

export type MenuLanguage = 'en' | 'ar';
const STORAGE_KEY = 'cafe-menu-language-v1';

// Presentation labels only. The stored menu, prices and item identifiers never change.
export const ARABIC_MENU_LABELS: Readonly<Record<string, string>> = {
  'Urban Café': 'أوربان كافيه', 'Inflata Café': 'إنفلاتا كافيه', 'Drive Through Café': 'درايف ثرو كافيه', 'Qstrawberry': 'كيو ستروبيري',
  'Pizza': 'بيتزا', 'Hot Dogs': 'هوت دوغ', 'Spiral Potato': 'بطاطس حلزونية', 'Corn on the Cob': 'ذرة',
  'Combos': 'وجبات كومبو', 'Nuggets & Fries': 'ناغتس وبطاطس', 'Popcorn': 'فشار', 'Soft Serve': 'آيس كريم',
  'Hot Coffee': 'قهوة ساخنة', 'Karak & Tea': 'كرك وشاي', 'Cold Coffee': 'قهوة باردة',
  'Matcha Latte': 'ماتشا لاتيه', 'Iced Matcha': 'ماتشا مثلجة', 'Mocktails': 'موكتيلات', 'Slush': 'سلاش', 'Fresh Juice': 'عصائر طازجة',
  'Marguareita': 'مارغريتا', 'Margherita': 'مارغريتا', 'Creamy Mushroom': 'مشروم كريمي', 'BBR Chicken': 'دجاج باربكيو',
  'Pepperoni': 'بيبروني', 'Four Cheese': 'أربعة أجبان', 'Classic Hot Dog': 'هوت دوغ كلاسيكي',
  'Cheesy Melt Hot Dog': 'هوت دوغ بالجبنة الذائبة', 'Sriracha Mayo Hot Dog': 'هوت دوغ بمايونيز سريراتشا',
  'Caeser Hot Dog': 'هوت دوغ سيزر', 'Loaded Hot Dog': 'هوت دوغ محمّل', 'Classic Salted Spiral': 'بطاطس حلزونية بالملح',
  'Chilli Lemon Spiral': 'بطاطس حلزونية بالفلفل والليمون', 'Sriracha Mayo Spiral': 'بطاطس حلزونية بمايونيز سريراتشا',
  'Classic Butter Corn': 'ذرة بالزبدة', 'Mexican Style Corn': 'ذرة مكسيكية', 'Chessy Corn': 'ذرة بالجبنة',
  'Cheesy Corn': 'ذرة بالجبنة', 'UFO Beef Burger Combo': 'كومبو برغر يو إف أو باللحم',
  'UFO Chicken Burger Combo': 'كومبو برغر يو إف أو بالدجاج', 'Nuggets': 'ناغتس', 'Fries': 'بطاطس مقلية',
  'Nuggets + Fries + Ketchup Combo': 'كومبو ناغتس وبطاطس وكاتشب', 'Salt': 'ملح', 'Carame': 'كراميل', 'Caramel': 'كراميل', 'Cheese': 'جبنة',
  'Chocolate Soft Serve (Cone)': 'آيس كريم شوكولاتة (كون)', 'Vanilla Soft Serve (Cone)': 'آيس كريم فانيليا (كون)',
  'Espresso Single/Double': 'إسبريسو سنغل / دبل', 'Americano': 'أمريكانو', 'Latte': 'لاتيه', 'Cappuccino': 'كابتشينو',
  'Flat White': 'فلات وايت', 'Spanish Latte': 'لاتيه إسباني', 'Mocha': 'موكا', 'Caramel Latte': 'لاتيه كراميل',
  'Vanilla Latte': 'لاتيه فانيليا', 'Hazelnut Latte': 'لاتيه بندق', 'Pistachio Latte': 'لاتيه فستق',
  'Karak': 'كرك', 'Black/Green Tea': 'شاي أسود / أخضر', 'Iced Americano': 'أمريكانو مثلج', 'Iced Latte': 'لاتيه مثلج',
  'Iced Spanish Latte': 'لاتيه إسباني مثلج', 'Iced Mocha': 'موكا مثلجة', 'Iced Caramel Latte': 'لاتيه كراميل مثلج',
  'Iced Vanilla Latte': 'لاتيه فانيليا مثلج', 'Iced Hazelnut Latte': 'لاتيه بندق مثلج', 'Iced Pistachio Latte': 'لاتيه فستق مثلج',
  'Iced Rose Latte': 'لاتيه ورد مثلج', 'Iced Coconut Latte': 'لاتيه جوز الهند مثلج',
  'Classic Hot Matcha Latte': 'ماتشا لاتيه ساخنة كلاسيكية', 'Hot Vanilla Matcha Latte': 'ماتشا لاتيه ساخنة بالفانيليا',
  'Hot Pistachio Matcha Latte': 'ماتشا لاتيه ساخنة بالفستق', 'Hot Rose Matcha Latte': 'ماتشا لاتيه ساخنة بالورد',
  'Iced Matcha Latte': 'ماتشا لاتيه مثلجة', 'Iced Strawberry Matcha Latte': 'ماتشا لاتيه مثلجة بالفراولة',
  'Iced Rose Matcha Latte': 'ماتشا لاتيه مثلجة بالورد', 'Strawberry Mojito': 'موهيتو فراولة',
  'Passion Fruit Mojito': 'موهيتو باشن فروت', 'Classic Mojito': 'موهيتو كلاسيكي', 'Blue Lagoon': 'بلو لاغون',
  'Pinna Colada': 'بينا كولادا', 'Pina Colada': 'بينا كولادا', 'Lemon': 'ليمون', 'Strawberry': 'فراولة',
  'Mango': 'مانجو', 'Pineapple': 'أناناس', 'Passion Fruit': 'باشن فروت', 'Watermelon': 'بطيخ',
  'Orange': 'برتقال', 'Carrot': 'جزر', 'Apple': 'تفاح', 'Single': 'سنغل', 'Double': 'دبل',
  'Black Tea': 'شاي أسود', 'Green Tea': 'شاي أخضر', 'cup': 'كوب', 'serving': 'حصة', 'piece': 'قطعة',
  'Vegetarian': 'نباتي', 'Vegan': 'نباتي بالكامل',
  'Strawberry Desserts': 'حلويات الفراولة', 'Cold Drinks': 'مشروبات باردة', 'Refreshments & Snacks': 'مرطبات ومقبلات', 'Coffee': 'قهوة', 'Extras': 'إضافات',
  'Strawberry Chocolate Cup 14 OZ': 'كوب شوكولاتة بالفراولة 14 أونصة',
  'Strawberry Marshmallow Chocolate Cup 14 OZ': 'كوب شوكولاتة وفراولة ومارشميلو 14 أونصة',
  'Marshmallow Chocolate Cup 14 OZ': 'كوب شوكولاتة ومارشميلو 14 أونصة', 'Mini Pancake': 'ميني بانكيك', 'Waffle Stick': 'وافل ستيك',
  'Slushy': 'سلاش', 'Water': 'ماء', 'Redbull': 'ريد بول', 'Pop Corn': 'بوب كورن',
  'Espresso Single': 'إسبريسو سنغل', 'Cappucino': 'كابتشينو', 'Cortado': 'كورتادو', 'Hot Chocolate': 'شوكولاتة ساخنة',
  'Add Vanilla Syrup': 'إضافة سيروب فانيليا', 'Add Caramel Syrup': 'إضافة سيروب كراميل',
};
const normalizedLabels = new Map(Object.entries(ARABIC_MENU_LABELS).map(([key, value]) => [key.trim().toLowerCase(), value]));
export function arabicMenuLabel(text: string): string { return normalizedLabels.get(text.trim().toLowerCase()) || text; }

const messages: Readonly<Record<string, string>> = {
  'Filter options': 'خيارات الفلاتر', 'Wheel and menu choices': 'العجلة وخيارات القائمة', 'Chosen menu item': 'الصنف المختار',
  'Item options and details': 'خيارات الصنف وتفاصيله', 'Selected variant and toppings': 'الخيار والإضافات المحددة',
  'Choose required options.': 'اختر الخيارات المطلوبة.',
  'Make it yours': 'على ذوقك', 'Required': 'مطلوب', 'Optional': 'اختياري', 'Choose one': 'اختر خياراً واحداً',
  'Choose {min} to {max}': 'اختر من {min} إلى {max} خيارات', 'Choose up to {count}': 'اختر حتى {count} خيارات',
  'Clear': 'مسح', 'Clear {group}': 'مسح اختيارات {group}', 'Unavailable': 'غير متاح', 'Included': 'مشمول',
  'Your selection': 'اختياراتك', 'No extras selected': 'لم تختر إضافات', 'Estimated total': 'الإجمالي التقديري',
  'Choose the required options to complete your selection.': 'اختر الخيارات المطلوبة لإكمال اختياراتك.',
  'Some required choices are unavailable. Please ask our team for alternatives.': 'بعض الخيارات المطلوبة غير متاحة. يرجى سؤال فريقنا عن البدائل.',
  'Selections are for reference. Tell our team your choices when ordering.': 'هذه الاختيارات للعرض فقط. أخبر فريقنا باختياراتك عند الطلب.',
  'THE CAFÉ MENU': 'قائمة المقهى', 'Menu': 'القائمة', 'Filters': 'الفلاتر', 'Open filters': 'فتح الفلاتر',
  'All': 'الكل', 'Everything': 'كل الأصناف', 'Food': 'الوجبات', 'Snacks': 'المقبلات', 'Drinks': 'المشروبات', 'Sweets': 'الحلويات',
  'All {group}': 'كل {group}', 'Menu categories': 'فئات القائمة', 'Previous categories': 'الفئات السابقة', 'More categories': 'المزيد من الفئات',
  'Search menu': 'البحث في القائمة', 'Search items or categories': 'ابحث عن صنف أو فئة', 'Clear search': 'مسح البحث',
  'Clear filters': 'مسح الفلاتر', "Can't decide?": 'محتار؟', 'Loading menu': 'جارٍ تحميل القائمة',
  'Saved': 'المفضلة', "Today's specials": 'عروض اليوم', 'From': 'ابتداءً من', 'Today only': 'اليوم فقط',
  '{discount}% off': 'خصم {discount}٪', 'View {name}': 'عرض {name}', 'Save {name}': 'حفظ {name}', 'Unsave {name}': 'إزالة {name} من المفضلة',
  'Preparing your menu…': 'نحضّر قائمتك…', "We'll be back shortly.": 'سنعود قريباً.',
  'This café menu is currently unavailable.': 'قائمة هذا المقهى غير متاحة حالياً.', 'Try again': 'حاول مجدداً',
  'Loading prices…': 'جارٍ تحميل الأسعار…', 'Ask our team for pricing': 'اسأل فريقنا عن الأسعار',
  'A LITTLE PAUSE': 'لحظة استراحة', 'A different craving?': 'تبحث عن شيء آخر؟', 'Keep your favorites close.': 'احتفظ بأصنافك المفضلة.',
  'More good things soon.': 'المزيد من العروض قريباً.', 'Something good is brewing.': 'نحضّر شيئاً مميزاً.',
  'No items match your search and filters. Try another word or explore the full menu.': 'لا توجد أصناف تطابق بحثك وفلاترك. جرّب كلمة أخرى أو استعرض القائمة كاملة.',
  'Tap a heart to save something you love.': 'اضغط على القلب لحفظ ما يعجبك في المفضلة.',
  'No specials are listed for today. There’s plenty to explore on the menu.': 'لا توجد عروض خاصة اليوم. استكشف بقية أصناف القائمة.',
  'No selections match your filters. Try the full menu.': 'لا توجد أصناف تطابق فلاترك. جرّب القائمة كاملة.',
  'Our café team is preparing the menu. Ask us about today’s available selections.': 'فريق المقهى يحضّر القائمة. اسألنا عن الأصناف المتاحة اليوم.',
  'Explore the menu': 'استعرض القائمة', 'Questions about ingredients or allergens?': 'لديك سؤال عن المكونات أو مسببات الحساسية؟',
  'Our café team is happy to help.': 'فريق المقهى يسعده مساعدتك.', 'Call café': 'اتصل بالمقهى', 'A little pause, a good moment.': 'استراحة صغيرة، ولحظة جميلة.',
  'Choose a menu type, category or saved items.': 'اختر نوع القائمة أو الفئة أو الأصناف المفضلة.',
  'Menu type': 'نوع القائمة', 'Category': 'الفئة', 'All categories': 'كل الفئات', 'Show': 'عرض', 'Show items': 'عرض الأصناف',
  'All menu items': 'كل أصناف القائمة', 'Saved items': 'الأصناف المفضلة', 'Reset': 'إعادة ضبط',
  'Show {count} items': 'عرض الأصناف ({count})', 'Show {count} item': 'عرض الأصناف ({count})', 'Motion reduced by your device settings': 'الحركة مخفّفة حسب إعدادات جهازك',
  'Resume animations': 'تشغيل الحركة', 'Pause animations': 'إيقاف الحركة', 'Animations on': 'الحركة مفعّلة', 'Animations off': 'الحركة متوقفة',
  'Your filters': 'فلاترك', 'Your current menu filters': 'القائمة الحالية', 'Café selection': 'اختيارات المقهى',
  'Reconnecting. Prices and availability may have changed.': 'جارٍ إعادة الاتصال. قد تكون الأسعار والأصناف المتاحة تغيّرت.',
  'One choice from one available item': 'خيار واحد من صنف متاح واحد',
  'Menu item details and pricing.': 'تفاصيل الصنف وأسعاره.', "Today's special": 'عرض اليوم', 'CHOOSE YOUR OPTION': 'اختر ما يناسبك',
  'For ingredients and allergens, please ask our team.': 'للاستفسار عن المكونات ومسببات الحساسية، اسأل فريقنا.',
  'Saved to favorites': 'تم الحفظ في المفضلة', 'Save to favorites': 'حفظ في المفضلة', 'Close': 'إغلاق',
  'A LITTLE MENU MAGIC': 'دع الحظ يختار لك', 'Find your next favorite.': 'اكتشف صنفك المفضل القادم.',
  'Real dishes. Real cravings. One lucky pick.': 'أصناف من قائمتنا. اختيار يحسم حيرتك.', 'A lucky pick from {scope}.': 'اختيار عشوائي من {scope}.',
  'Spin from wheel center': 'تدوير العجلة من الوسط', 'PICKING': 'نختار لك', 'SPIN': 'دوّر', 'Finding your next favorite…': 'نبحث عن صنفك المفضل القادم…',
  'Your pick: {name}': 'اختيارك: {name}', 'The menu just changed. Shuffle for fresh choices.': 'تغيّرت القائمة. بدّل الخيارات لتحديثها.',
  'Ready when you are. Give it a spin!': 'جاهز؟ دوّر العجلة!', 'YOUR NEXT FAVORITE': 'اختيار العجلة',
  'View chosen {name}': 'عرض الصنف المختار: {name}', 'Spinning…': 'العجلة تدور…', 'Spin again': 'دوّر مجدداً', 'Spin the wheel': 'دوّر العجلة',
  'Shuffle wheel choices': 'تبديل خيارات العجلة', 'Shuffle to discover more': 'بدّل الخيارات لاكتشاف المزيد',
  '{slots} choices from {total} available items': '{slots} خيارات من {total} صنفاً متاحاً',
  'Explore these {count} choices': 'استعرض الخيارات ({count})', 'Explore this choice': 'استعرض هذا الخيار', 'Wheel choices': 'خيارات العجلة',
  'No available items match these filters. Explore the full menu to spin.': 'لا توجد أصناف متاحة تطابق هذه الفلاتر. استعرض القائمة كاملة لتدوير العجلة.',
  '{name} menu': 'قائمة {name}', '{name} logo': 'شعار {name}', '{name} welcome video': 'فيديو ترحيبي من {name}', '{name} atmosphere': 'أجواء {name}',
  'Virtual Pager': 'نداء الطلب الذكي', 'Book Table': 'حجز طاولة', 'Walk-In Waitlist': 'قائمة الانتظار',
  'Curbside & Drive-Thru': 'استلام السيارة', 'Get Delivery': 'اطلب توصيل', 'Add to Order': 'أضف للطلب',
  'View Cart': 'عرض السلة', 'Your Order': 'طلبك', 'Checkout': 'إتمام الطلب', 'Place Order (Pay at Venue)': 'إرسال الطلب (الدفع بالمقهى)',
  'Pay Online & Place Order': 'ادفع إلكترونياً وأرسل الطلب', 'Order Channel': 'طريقة الاستلام',
  'Counter Pickup': 'استلام من الكاونتر', 'Dine-In Table': 'داخل المقهى (طاولة)', 'Curbside Bay': 'موقف استلام خارجي',
  'Drive-Thru': 'درايف ثرو', 'Your Name': 'الاسم', 'Phone (Optional)': 'رقم الجوال (اختياري)', 'Table Code': 'رقم الطاولة',
  'Select Parking Bay': 'اختر موقف السيارة', 'Vehicle Color': 'لون السيارة', 'Vehicle Type': 'نوع السيارة',
  'License Plate': 'رقم اللوحة', 'Order Notes': 'ملاحظات الطلب', 'Track Pager': 'تتبع طلبك',
  'Enter receipt or pager # (e.g. A-001)': 'أدخل رقم الفاتورة أو النداء (مثل A-001)',
  'Waiting in Queue': 'في قائمة التحضير', 'Preparing Now': 'قيد التحضير الآن', 'Ready for Pickup!': 'طلبك جاهز للاستلام!',
  'Order Collected': 'تم استلام الطلب', 'Enable Sound & Vibration Alerts': 'تفعيل التنبيه الصوتي والاهتزاز',
  'Alerts Active — Phone will ring when ready': 'التنبيهات مفعّلة — سيرن هاتفك فور الجاهزية',
  '5 Mins Away': 'باقي 5 دقائق', "I'm Here — Check In": 'وصلت الآن — تسجيل الوصول',
  'Rate your experience': 'قيّم تجربتك معنا', 'Leave a Google Maps Review': 'اترك تقييماً على خرائط Google',
  'Order Delivery via Partner': 'اطلب التوصيل عبر شركائنا', 'Reserve a Table': 'احجز طاولتك',
  'Join Live Waitlist': 'انضم لقائمة الانتظار الحية', 'Party Size': 'عدد الأشخاص', 'Dining Zone': 'منطقة الجلوس',
  'Any Zone': 'أي منطقة متاحة', 'Available Times': 'الأوقات المتاحة', 'Confirm Reservation': 'تأكيد الحجز',
  'Join Waitlist': 'انضمام للانتظار', 'On My Way': 'أنا في الطريق', 'Release Spot': 'إلغاء دوري',
  'Prep ~{mins}m': 'التحضير ~{mins} د', 'Allergens': 'مسببات الحساسية',
  'Open': 'فتح', 'Dismiss live pass': 'إخفاء البطاقة الحية',
  'Table Ready!': 'طاولتك جاهزة!', 'In Waitlist': 'في قائمة الانتظار', 'Table Reserved': 'تم حجز الطاولة',
  'Scan the table.': 'امسح رمز الطاولة.', 'Skip the crowd.': 'وتجاوز طابور الانتظار.',
  'Search venues or cuisines…': 'ابحث عن مقهى أو مطعم أو صنف…',
  'All Venues': 'كل الوجهات', 'Order Ahead': 'اطلب مسبقاً', 'Tables': 'حجز طاولات', 'Curbside': 'استلام السيارة',
  'Open venue menu →': 'افتح قائمة الوجهة ←', 'Staff Console ↗': 'لوحة الموظفين ↗',
  'Have a Pager or Receipt Code?': 'لديك رقم نداء أو فاتورة؟',
  'Select venue': 'اختر الوجهة', 'Quantity': 'الكمية',
  'Special instructions for kitchen (optional)': 'ملاحظات خاصة للتحضير (اختياري)',
  'Add {qty} to Order': 'أضف ({qty}) إلى الطلب',
  'Order via Delivery Partner': 'اطلب هذا الصنف عبر تطبيقات التوصيل',
  'Queue ahead': 'قبلك في الدور', 'Est. prep': 'الوقت التقديري',
  'Stop Ringing · On My Way': 'إيقاف الرنين · أنا في الطريق',
  'Stop Ringing': 'إيقاف الرنين',
  'Arm Lock-Screen Ringing & Push': 'تفعيل رنين وإشعارات شاشة القفل',
  'Lock-Screen Push & Ringer Armed': 'تم تفعيل رنين وإشعارات شاشة القفل',
  'Test Ring': 'تجربة الرنين',
  'Add to Calendar (.ics)': 'إضافة إلى التقويم (.ics)',
  'Directions': 'الاتجاهات على الخريطة',
  'Share Pass': 'مشاركة البطاقة',
  'Pass link copied!': 'تم نسخ رابط البطاقة!',
  'Cancel Reservation': 'إلغاء الحجز',
  'Table Reservation': 'حجز طاولة',
  'Parties ahead of you': 'مجموعات قبلك في الانتظار',
  'Browse Menu While You Wait': 'تصفح القائمة أثناء الانتظار',
  'Scan QR / NFC': 'مسح QR / NFC',
  'Scan QR or Tap NFC': 'امسح رمز QR أو قرّب NFC',
  'Point your camera at any Dingzi table, curbside bay, menu, or reusable pager coaster.': 'وجّه الكاميرا نحو أي طاولة أو موقف استلام أو قائمة أو قطعة نداء ذكية من دِنغزي.',
  'Point your camera at any dingzi table, curbside bay, menu, or reusable pager coaster.': 'وجّه الكاميرا نحو أي طاولة أو موقف استلام أو قائمة أو قطعة نداء ذكية من دِنغزي.',
  'Tap Start Camera to scan a Dingzi QR code, or tap your phone directly on any NFC coaster.': 'اضغط تشغيل الكاميرا لمسح رمز QR من دِنغزي، أو قرّب هاتفك مباشرة من أي قطعة نداء NFC.',
  'Tap Start Camera to scan a dingzi QR code, or tap your phone directly on any NFC coaster.': 'اضغط تشغيل الكاميرا لمسح رمز QR من دِنغزي، أو قرّب هاتفك مباشرة من أي قطعة نداء NFC.',
  'Start Camera Scanner': 'تشغيل ماسح الكاميرا',
  'Scan from Photo': 'مسح من صورة',
  'Tap NFC Coaster': 'قراءة شريحة NFC',
  'Ready for NFC Tap…': 'جاهز لقراءة شريحة NFC…',
  'Tip: Hold the top of your phone near any Dingzi NFC coaster to open instantly.': 'معلومة: قرّب أعلى هاتفك من أي قطعة نداء NFC من دِنغزي لفتحها فوراً دون تطبيق.',
  'Tip: Hold the top of your phone near any dingzi NFC coaster to open instantly.': 'معلومة: قرّب أعلى هاتفك من أي قطعة نداء NFC من دِنغزي لفتحها فوراً دون تطبيق.',
  'Pager or coaster # (A-001, COASTER-01)': 'رقم النداء أو القطعة (A-001 أو COASTER-01)',
  'Smart Pager Coaster Ready': 'قطعة النداء الذكية جاهزة',
  'Keep this screen open — it connects automatically the moment the barista links your order, or explore the menu below.': 'أبقِ هذه الشاشة مفتوحة — ستتصل بطلبك تلقائياً فور ربطها من الكاشير، أو تصفح القائمة أدناه.',
  '{done}/{total} prepared': '{done}/{total} جاهز',
  'Ding! Your food is ready.': 'دِنغ! طلبك جاهز.',
  'Menus, tables, and pickup — made dingzi.': 'المنيو والطاولات والاستلام.. بكل سهولة مع دِنغزي.',
  "Sit easy. We'll ding your phone when it's hot.": 'استرح مكانك، بننبهك أول ما يجهز طلبك.',
  "Park easy. Scan your bay and we'll bring it out.": 'صُفّ بسهولة، امسح رمز الموقف وبنجيب طلبك لسيارتك.',
  'Skip the crowd. Your table will ding you.': 'تجنّب الزحمة، طاولتك بتنبهك أول ما تفضى.',
  'Powered by dingzi': 'مشغّل بواسطة دِنغزي',
};
type Values = Record<string, string | number>;
export function menuMessage(language: MenuLanguage, key: string, values: Values = {}): string {
  return (language === 'ar' ? messages[key] || key : key).replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}
export function menuItemCount(language: MenuLanguage, count: number): string {
  if (language === 'en') return `${count} ${count === 1 ? 'item' : 'items'}`;
  const number = new Intl.NumberFormat('ar-QA').format(count);
  if (count === 1) return 'صنف واحد';
  if (count === 2) return 'صنفان';
  return `${number} ${count >= 3 && count <= 10 ? 'أصناف' : 'صنفاً'}`;
}
const Context = createContext<{
  language: MenuLanguage; dir: 'rtl' | 'ltr'; setLanguage: (language: MenuLanguage) => void;
  t: (key: string, values?: Values) => string; label: (text: string) => string; count: (value: number) => string;
} | null>(null);
export function MenuLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<MenuLanguage>(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved === 'ar' || saved === 'en') return saved; } catch { /* Storage is optional. */ }
    return navigator.language.toLowerCase().startsWith('ar') ? 'ar' : 'en';
  });
  useEffect(() => {
    const root = document.documentElement;
    const oldLang = root.lang; const oldDir = root.dir;
    root.lang = language; root.dir = language === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* Browsing works without storage. */ }
    return () => { root.lang = oldLang; root.dir = oldDir; };
  }, [language]);
  const value = useMemo(() => ({ language, dir: language === 'ar' ? 'rtl' as const : 'ltr' as const, setLanguage,
    t: (key: string, values?: Values) => menuMessage(language, key, values),
    label: (text: string) => language === 'ar' ? arabicMenuLabel(text) : text,
    count: (number: number) => menuItemCount(language, number),
  }), [language]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMenuLanguage() {
  const value = useContext(Context);
  if (!value) throw new Error('Menu language provider is required');
  return value;
}
export function MenuLanguageSwitch() {
  const { language, setLanguage } = useMenuLanguage();
  return <button className="guest-language-switch" lang={language === 'ar' ? 'en' : 'ar'} dir="ltr"
    aria-label={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
    onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}><Languages size={16}/>{language === 'ar' ? 'English' : 'العربية'}</button>;
}

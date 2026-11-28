import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

config({ quiet: true });

const { initializeDatabase, db, pool } = await import('../server/db');
const { putMedia } = await import('../server/mediaStore');
const { categories, mediaObjects, menuItems, restaurants } = await import('../shared/schema');
const { ARABIC_MENU_LABELS } = await import('../client/src/lib/menuLanguage');

await initializeDatabase();

try {
  const urbanManifest = JSON.parse(await fs.readFile('assets/urban-menu-photos/manifest.json', 'utf8'));
  const qFixture = JSON.parse(await fs.readFile('fixtures/qstrawberry-menu.json', 'utf8'));

  const allCafes = await db.select().from(restaurants);
  const urban = allCafes.find(c => c.slug === 'urban-cafe' || c.name === 'Urban Café');
  const qCafe = allCafes.find(c => c.slug === 'qstrawberry' || c.name === 'Qstrawberry');

  let uploadedCount = 0;

  if (urban) {
    const cats = await db.select().from(categories).where(eq(categories.restaurantId, urban.id));
    const catById = new Map(cats.map(c => [c.id, c]));
    for (const c of cats) {
      if (!c.titleAr && ARABIC_MENU_LABELS[c.title]) {
        await db.update(categories).set({ titleAr: ARABIC_MENU_LABELS[c.title] }).where(eq(categories.id, c.id));
      }
    }

    const photoRecordByKey = new Map<string, { webp: string }>();
    for (const rec of urbanManifest.records) {
      photoRecordByKey.set(`${rec.category.toLowerCase()}::${rec.name.toLowerCase()}`, rec);
    }

    let firstCover: string | null = urban.coverMediaUrl || null;
    for (const c of cats) {
      const items = await db.select().from(menuItems).where(eq(menuItems.categoryId, c.id));
      for (const item of items) {
        const key = `${catById.get(item.categoryId)?.title.toLowerCase() || ''}::${item.name.toLowerCase()}`;
        const rec = photoRecordByKey.get(key);
        let nextImageUrl = item.imageUrl;
        if (!nextImageUrl && rec) {
          const bytes = await fs.readFile(path.resolve(rec.webp.replaceAll('\\', '/')));
          const mediaId = randomUUID();
          await putMedia(mediaId, bytes, urban.userId, 'image/webp');
          await db.insert(mediaObjects).values({
            id: mediaId,
            ownerId: urban.userId,
            mime: 'image/webp',
            size: bytes.length,
          });
          nextImageUrl = `/objects/${mediaId}`;
          if (!firstCover) firstCover = nextImageUrl;
          uploadedCount++;
        }
        const arabicName = item.nameAr || ARABIC_MENU_LABELS[item.name] || null;
        if (nextImageUrl !== item.imageUrl || arabicName !== item.nameAr) {
          await db
            .update(menuItems)
            .set({ imageUrl: nextImageUrl, nameAr: arabicName })
            .where(eq(menuItems.id, item.id));
        }
      }
    }

    if (firstCover && !urban.coverMediaUrl) {
      await db
        .update(restaurants)
        .set({ coverMediaUrl: firstCover, coverMediaType: 'image' })
        .where(eq(restaurants.id, urban.id));
    }
  }

  if (qCafe) {
    const qFileByName = new Map<string, string>();
    for (const cat of qFixture.categories) {
      for (const row of cat.items) {
        if (row[0] && row[4]) qFileByName.set(String(row[0]).toLowerCase(), String(row[4]));
      }
    }
    const cats = await db.select().from(categories).where(eq(categories.restaurantId, qCafe.id));
    let firstQCover: string | null = qCafe.coverMediaUrl || null;
    for (const c of cats) {
      if (!c.titleAr && ARABIC_MENU_LABELS[c.title]) {
        await db.update(categories).set({ titleAr: ARABIC_MENU_LABELS[c.title] }).where(eq(categories.id, c.id));
      }
      const items = await db.select().from(menuItems).where(eq(menuItems.categoryId, c.id));
      for (const item of items) {
        const filename = qFileByName.get(item.name.toLowerCase());
        let nextImageUrl = item.imageUrl;
        if (!nextImageUrl && filename) {
          const bytes = await fs.readFile(path.join('assets', 'qstrawberry-menu-photos', 'items', filename));
          const mediaId = randomUUID();
          await putMedia(mediaId, bytes, qCafe.userId, 'image/webp');
          await db.insert(mediaObjects).values({
            id: mediaId,
            ownerId: qCafe.userId,
            mime: 'image/webp',
            size: bytes.length,
          });
          nextImageUrl = `/objects/${mediaId}`;
          if (!firstQCover) firstQCover = nextImageUrl;
          uploadedCount++;
        }
        const arabicName = item.nameAr || ARABIC_MENU_LABELS[item.name] || null;
        if (nextImageUrl !== item.imageUrl || arabicName !== item.nameAr) {
          await db
            .update(menuItems)
            .set({ imageUrl: nextImageUrl, nameAr: arabicName })
            .where(eq(menuItems.id, item.id));
        }
      }
    }
    if (firstQCover && !qCafe.coverMediaUrl) {
      await db
        .update(restaurants)
        .set({ coverMediaUrl: firstQCover, coverMediaType: 'image' })
        .where(eq(restaurants.id, qCafe.id));
    }
  }

  console.log(`Hydrated ${uploadedCount} canonical WebP menu photos into local media store.`);
} finally {
  await pool.close();
}

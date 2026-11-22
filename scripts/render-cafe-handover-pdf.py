import json
import os
import sys
import fitz

INPUT = sys.argv[1]
OUTPUT = sys.argv[2]
with open(INPUT, 'r', encoding='utf-8') as stream:
    data = json.load(stream)

PAGE = fitz.paper_rect('a4')
LEFT, RIGHT, TOP, BOTTOM = 46, 46, 58, 46
WIDTH = PAGE.width - LEFT - RIGHT
INK = (0.08, 0.09, 0.15)
MUTED = (0.34, 0.37, 0.46)
PLUM = (0.37, 0.17, 0.52)
LILAC = (0.69, 0.52, 0.95)
MINT = (0.24, 0.79, 0.69)
PALE = (0.96, 0.95, 0.99)
LINE = (0.84, 0.82, 0.90)
doc = fitz.open()
page = None
y = TOP
page_number = 0

def rgb(color):
    return color

def add_page():
    global page, y, page_number
    page = doc.new_page(width=PAGE.width, height=PAGE.height)
    page_number += 1
    page.draw_rect(fitz.Rect(0, 0, PAGE.width, 22), color=None, fill=PLUM)
    page.insert_text((LEFT, 15), 'CAFE MENU PLATFORM', fontsize=7.5, fontname='hebo', color=(1, 1, 1))
    page.insert_text((PAGE.width - RIGHT - 75, 15), 'OPERATIONS HANDOVER', fontsize=7.5, fontname='hebo', color=(1, 1, 1))
    page.insert_text((LEFT, PAGE.height - 24), 'Prepared 22 November 2026  |  Private operations document', fontsize=7.5, fontname='helv', color=MUTED)
    page.insert_text((PAGE.width - RIGHT - 16, PAGE.height - 24), str(page_number), fontsize=8, fontname='hebo', color=PLUM)
    y = TOP

def ensure(height):
    global y
    if page is None or y + height > PAGE.height - BOTTOM:
        add_page()

def text_block(text, size=9.2, color=INK, bold=False, indent=0, leading=None, after=7):
    global y
    font = 'hebo' if bold else 'helv'
    leading = leading or size * 1.42
    rect = fitz.Rect(LEFT + indent, y, PAGE.width - RIGHT, PAGE.height - BOTTOM)
    needed = max(leading, (len(text) / max(1, int((WIDTH - indent) / (size * 0.52))) + 1) * leading)
    ensure(min(needed + after, PAGE.height - TOP - BOTTOM))
    rect = fitz.Rect(LEFT + indent, y, PAGE.width - RIGHT, PAGE.height - BOTTOM)
    result = page.insert_textbox(rect, text, fontsize=size, fontname=font, color=color, lineheight=1.25)
    if result < 0:
        add_page()
        rect = fitz.Rect(LEFT + indent, y, PAGE.width - RIGHT, PAGE.height - BOTTOM)
        result = page.insert_textbox(rect, text, fontsize=size, fontname=font, color=color, lineheight=1.25)
    used = max(leading, needed - min(0, result))
    y += used + after

def heading(text, level=1):
    global y
    sizes = {1: 20, 2: 14, 3: 11.5, 4: 10}
    size = sizes[level]
    ensure(size * 2.2)
    if level == 1:
        page.draw_rect(fitz.Rect(LEFT, y, LEFT + 7, y + 25), color=None, fill=MINT)
        page.insert_text((LEFT + 16, y + 19), text, fontsize=size, fontname='hebo', color=INK)
        y += 34
    else:
        page.insert_text((LEFT, y + size), text, fontsize=size, fontname='hebo', color=PLUM if level == 2 else INK)
        y += size + 8

def rule():
    global y
    ensure(10)
    page.draw_line((LEFT, y), (PAGE.width - RIGHT, y), color=LINE, width=.7)
    y += 10

def metric_row(metrics):
    global y
    cell_w = WIDTH / len(metrics)
    ensure(56)
    for index, (label, value) in enumerate(metrics):
        x = LEFT + index * cell_w
        page.draw_rect(fitz.Rect(x + 2, y, x + cell_w - 6, y + 46), color=None, fill=PALE)
        page.insert_text((x + 10, y + 17), label.upper(), fontsize=6.8, fontname='hebo', color=MUTED)
        page.insert_text((x + 10, y + 36), str(value), fontsize=14, fontname='hebo', color=PLUM)
    y += 58

def table(headers, rows, widths):
    global y
    header_h = 20
    row_h = 18
    def draw_row(values, top, is_header=False):
        x = LEFT
        if is_header:
            page.draw_rect(fitz.Rect(LEFT, top, LEFT + WIDTH, top + header_h), color=None, fill=PLUM)
        for index, value in enumerate(values):
            w = widths[index] * WIDTH
            if not is_header:
                page.draw_rect(fitz.Rect(x, top, x + w, top + row_h), color=LINE, fill=None, width=.35)
            page.insert_textbox(fitz.Rect(x + 4, top + 4, x + w - 3, top + (header_h if is_header else row_h) - 2), str(value), fontsize=7.2 if is_header else 7.1, fontname='hebo' if is_header else 'helv', color=(1,1,1) if is_header else INK, align=0)
            x += w
    ensure(header_h + row_h)
    draw_row(headers, y, True)
    y += header_h
    for row in rows:
        if y + row_h > PAGE.height - BOTTOM:
            add_page()
            draw_row(headers, y, True)
            y += header_h
        draw_row(row, y)
        y += row_h
    y += 9

add_page()
heading('Cafe Menu Platform', 1)
text_block('Operational handover for the live café menu platform. This document uses the verified 21 October 2026 recovery snapshot and excludes all credentials, account data, payment records and secrets.', size=10.2, color=MUTED, after=14)
rule()
heading('Platform access', 2)
table(['SERVICE', 'ADDRESS / CAPABILITY'], [
    ['Public menu', data['platform']['publicMenuBaseUrl']],
    ['Staff portal', data['platform']['staffPortalUrl']],
    ['Customer experience', 'Browse, filters, search, Arabic / English, favourites, item details, options and suggestion wheel'],
    ['Manager controls', 'Profiles, themes, categories, items, images, visibility, QR, shared menu library and RBAC'],
], [0.26, 0.74])
heading('Portfolio summary', 2)
s = data['summary']
metric_row([('Cafes', s['cafes']), ('Menu items', s['menuItems']), ('Categories', s['categories']), ('Media files', s['media'])])
table(['CAFE', 'STATUS', 'THEME', 'CURRENCY', 'ITEMS'], [[c['restaurant']['name'], c['restaurant']['status'], c['restaurant']['theme'], c['restaurant']['currency'], len(c['menuItems'])] for c in data['cafes']], [0.31, 0.18, 0.18, 0.16, 0.17])

for cafe in data['cafes']:
    r = cafe['restaurant']
    heading(r['name'], 1)
    text_block(f"Public menu: {cafe['publicUrl']}", size=9, color=PLUM, bold=True, after=5)
    text_block(f"State: {r['status']}  |  Visible: {'Yes' if not r['hidden'] else 'No'}  |  Theme: {r['theme']}  |  Currency: {r['currency']}", size=9, color=MUTED, after=4)
    detail = f"Cuisine: {r.get('cuisine_type') or 'Not specified'}  |  Address: {r.get('address') or 'Not specified'}  |  Phone: {r.get('phone') or 'Not specified'}"
    text_block(detail, size=8.5, color=MUTED, after=10)
    if not cafe['categoryDetails']:
        text_block('No categories or menu items have been configured yet.', size=9.2, color=MUTED, after=12)
        continue
    heading('Categories', 3)
    table(['CATEGORY', 'ITEMS'], [[c['title'], c['itemCount']] for c in cafe['categoryDetails']], [0.78, 0.22])
    heading('Menu catalogue', 3)
    for category in cafe['categoryDetails']:
        heading(category['title'], 4)
        rows = []
        for item in category['items']:
            options = ', '.join([g.get('name') or g.get('label') or 'Options' for g in (item.get('modifier_groups') or [])]) or 'None'
            variants = [v for v in cafe['priceVariants'] if v['menu_item_id'] == item['id']]
            price = f"{float(item['price']):.2f} {r['currency']}"
            if float(item.get('discount') or 0) > 0: price += f" (-{item['discount']}%)"
            rows.append([item['name'], price, 'Visible' if item['is_available'] else 'Hidden', options, len(variants)])
        table(['ITEM', 'PRICE', 'STATUS', 'OPTIONS', 'VARIANTS'], rows, [0.31, 0.18, 0.14, 0.25, 0.12])

heading('Recovery and governance', 1)
text_block('The handover folder includes the all-cafes recovery archive. Its schema-and-data.sql file restores records into an isolated cafe_menu_backup schema for safe inspection. The archive also includes JSON, a recovery readme, and the referenced media files.', size=9.5, color=INK, after=7)
text_block('Restore order: café profile, categories, menu items, price variants, shared menu library, then media objects and files. Create or assign manager accounts separately during recovery.', size=9.5, color=INK, after=7)
text_block('Keep this handover folder private. It does not contain credentials but it does contain operational café information and product media.', size=9.5, color=MUTED, bold=True, after=8)

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
doc.save(OUTPUT, garbage=4, deflate=True)
print(json.dumps({'pages': page_number, 'output': OUTPUT}))

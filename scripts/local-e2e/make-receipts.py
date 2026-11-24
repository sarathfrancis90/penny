import random, json, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
out = sys.argv[1]
def font(size, bold=False):
    for p in (["/System/Library/Fonts/Supplemental/Courier New Bold.ttf"] if bold else []) + ["/System/Library/Fonts/Supplemental/Courier New.ttf", "/System/Library/Fonts/Menlo.ttc"]:
        try: return ImageFont.truetype(p, size)
        except Exception: pass
    return ImageFont.load_default()
def render(name, lines, faded=False, rot=0.0, seed=1):
    random.seed(seed)
    W = 760; lh = 40
    img = Image.new("L", (W, lh*(len(lines)+4)), 245)
    d = ImageDraw.Draw(img)
    y = lh
    ink = 150 if faded else 25
    for ln in lines:
        bold = ln.startswith("!")
        ln = ln.lstrip("!")
        f = font(30, bold)
        if "|" in ln:
            l, r = ln.split("|")
            d.text((40, y), l, fill=ink, font=f)
            w = d.textlength(r, font=f); d.text((W-40-w, y), r, fill=ink, font=f)
        else:
            w = d.textlength(ln, font=f); d.text(((W-w)/2, y), ln, fill=ink, font=f)
        y += lh
    # put on a desk background like a phone photo
    bg = Image.new("L", (1200, img.height+500), 70)
    img = img.rotate(rot, expand=True, fillcolor=70, resample=Image.BICUBIC)
    bg.paste(img, ((1200-img.width)//2, 250))
    px = bg.load()
    for _ in range(bg.width*bg.height//25):
        x = random.randrange(bg.width); yy = random.randrange(bg.height)
        px[x, yy] = max(0, min(255, px[x, yy] + random.randint(-30, 30)))
    bg = bg.filter(ImageFilter.GaussianBlur(1.4 if faded else 0.7))
    bg.convert("RGB").save(f"{out}/{name}.jpg", quality=82)
R = {}
render("coffee", ["!TIM HORTONS #2241", "55 Ontario St S, Milton ON", "2026-11-09  08:14", "", "1 Med Dbl Dbl|2.15", "1 Bagel BELT|5.79", "", "Subtotal|7.94", "HST 13%|1.03", "!TOTAL|8.97", "", "VISA ************4821", "Thank you!"], rot=2.5, seed=1)
R["coffee"] = dict(vendor="Tim Hortons", amount=8.97, date="2026-11-09", category="Meals and entertainment")
render("grocery", ["!SOBEYS", "Milton Crossroads", "HST# 10123 4567 RT0001", "11/14/2026 18:42", ""] + [f"{n}|{p}" for n,p in [("BANANAS 1.2kg","1.92"),("2% MILK 4L","6.49"),("EGGS LARGE 12","4.99"),("CHICKEN BRST","14.37"),("BREAD WW","3.49"),("LAYS CLASSIC H","4.79"),("PAPER TOWEL 6 H","9.99"),("DISH SOAP H","3.99"),("APPLES GALA","5.20"),("BASMATI RICE 8LB","13.99"),("YOGURT 650G","4.29"),("TOMATOES","3.11")]] + ["", "SUBTOTAL|76.61", "HST|2.44", "!TOTAL|79.05", "", "MASTERCARD|79.05", "ITEMS 12"], rot=-3.0, seed=2)
R["grocery"] = dict(vendor="Sobeys", amount=79.05, date="2026-11-14", category="Groceries")
render("french", ["!PHARMAPRIX", "1500 av. Atwater, Montreal QC", "2026-10-28 12:05", "", "PAPIER IMPRIMANTE|12,99", "CARTOUCHE ENCRE HP|42,99", "STYLOS BLEUS (10)|6,49", "", "SOUS-TOTAL|62,47", "TPS 5%|3,12", "TVQ 9,975%|6,23", "!TOTAL|71,82", "", "INTERAC|71,82", "Merci!"], rot=1.0, seed=3)
R["french"] = dict(vendor="Pharmaprix", amount=71.82, date="2026-10-28", category="Office expenses")
render("gas", ["!PETRO-CANADA", "8300 Hwy 25, Milton ON", "Date: 03/02/2025  17:31", "", "PUMP 04  REGULAR", "41.203 L @ 1.529/L", "", "FUEL|63.00", "HST INCLUDED|7.25", "!TOTAL|63.00", "", "VISA ****4821 APPROVED"], faded=True, rot=4.0, seed=4)
R["gas"] = dict(vendor="Petro-Canada", amount=63.00, date="2025-03-02", category="Vehicle - Fuel (gasoline, propane, oil)")
render("restaurant", ["!THE KEG STEAKHOUSE", "Oakville ON", "Nov 20, 2026 7:48 PM", "Table 14  Guests 2", "", "2 Sirloin 8oz|78.00", "1 Caesar Salad|13.00", "2 Soft Drink|9.00", "", "Subtotal|100.00", "HST|13.00", "Total|113.00", "Tip|20.00", "!GRAND TOTAL|133.00", "", "AMEX ****1009"], rot=-1.5, seed=5)
R["restaurant"] = dict(vendor="The Keg", amount=133.00, date="2026-11-20", category="Meals and entertainment")
render("parking", ["!GREEN P PARKING", "City of Toronto", "Lot 36 Nathan Phillips Sq", "2026-11-18 09:02", "", "Parking 3h|18.00", "HST incl.", "!PAID|18.00", "", "Receipt 004418"], faded=True, rot=6.0, seed=6)
R["parking"] = dict(vendor="Green P", amount=18.00, date="2026-11-18", category="Vehicle - Parking costs (non-prorated)")
json.dump(R, open(f"{out}/expected.json","w"), indent=1)

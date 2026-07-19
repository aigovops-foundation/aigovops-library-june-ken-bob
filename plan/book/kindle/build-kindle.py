#!/usr/bin/env python3
"""Build the Kindle EPUB for 'When Creation is Cheap…' from the chapter markdown.

Usage: python3 build-kindle.py            (from plan/book/kindle/)
Outputs: cover.jpg + when-creation-is-cheap.epub in this directory.
No dependencies beyond Pillow (cover) and the stdlib (everything else).
"""
import os, re, zipfile, html, datetime
from xml.dom.minidom import parseString

HERE = os.path.dirname(os.path.abspath(__file__))
BOOK = os.path.dirname(HERE)

# ── garden palette ──────────────────────────────────────────────────────────
CREAM, DEEP_CREAM = (250, 247, 240), (241, 234, 216)
CHARCOAL, GREEN = (43, 43, 40), (46, 125, 79)
GREEN_DEEP, GOLD, ORANGE = (15, 74, 44), (232, 181, 74), (224, 122, 42)

def build_cover(path):
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    W, H = 1600, 2560
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    # ground: layered field strips rising to a horizon
    horizon = int(H * 0.62)
    d.rectangle([0, horizon, W, H], fill=(58, 106, 74))
    for i, (col, y0) in enumerate([((46, 125, 79), 0.66), ((37, 104, 64), 0.74),
                                   ((28, 84, 51), 0.84), ((20, 66, 40), 0.93)]):
        d.rectangle([0, int(H * y0), W, H], fill=col)
    # furrow curves
    for i in range(7):
        y = horizon + 40 + i * 90
        d.arc([-W * 0.3, y, W * 1.3, y + 900], 195, 345, fill=(255, 255, 255, 40), width=6)
    # sky wash
    sky = Image.new("RGB", (W, horizon), CREAM)
    sd = ImageDraw.Draw(sky)
    sd.ellipse([W * 0.55, -200, W * 1.25, horizon * 0.9], fill=(247, 240, 222))
    sky = sky.filter(ImageFilter.GaussianBlur(120))
    img.paste(sky, (0, 0))
    d = ImageDraw.Draw(img)
    # the lantern on its post, centered, fully BELOW the title block (no collisions)
    cx, base = W // 2, horizon
    cage_top, cage_bot = 1075, 1275
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([cx - 330, cage_top - 90, cx + 330, cage_bot + 120], fill=(90, 70, 20))
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    from PIL import ImageChops
    img = ImageChops.add(img, glow)
    d = ImageDraw.Draw(img)
    d.rectangle([cx - 14, cage_bot, cx + 14, base], fill=CHARCOAL)            # post
    d.rectangle([cx - 90, cage_top, cx + 90, cage_bot], fill=CHARCOAL)        # cage
    d.rectangle([cx - 70, cage_top + 20, cx + 70, cage_bot - 20], fill=(255, 214, 120))
    d.polygon([(cx - 110, cage_top), (cx + 110, cage_top), (cx, cage_top - 95)], fill=CHARCOAL)
    d.ellipse([cx - 26, cage_top + 70, cx + 26, cage_top + 140], fill=(255, 240, 200))
    # type
    def font(name, size):
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size)
    def center(dr, y, text, f, fill, tracking=0):
        wdt = dr.textlength(text, font=f)
        dr.text(((W - wdt) / 2, y), text, font=f, fill=fill)
    t1 = font("Georgia Bold.ttf", 118)
    t2 = font("Georgia Bold Italic.ttf", 96)
    ts = font("Georgia Italic.ttf", 58)
    ta = font("Georgia.ttf", 64)
    center(d, 150, "WHEN CREATION", t1, CHARCOAL)
    center(d, 290, "IS CHEAP,", t1, CHARCOAL)
    center(d, 470, "Editorial must be Strong", t2, GREEN_DEEP)
    center(d, 600, "and Architecture", t2, GREEN_DEEP)
    center(d, 730, "FOCUSED and Amazing", t2, GREEN_DEEP)
    center(d, 880, "One day inside an AI-governed estate", ts, CHARCOAL)
    center(d, H - 330, "BOB RAPP", ta, CREAM)
    center(d, H - 230, "with Ken Johnston, Jeeves, and Claude", ts, DEEP_CREAM)
    img.save(path, "JPEG", quality=92)
    return path

# ── tiny markdown → xhtml (covers exactly what the chapters use) ────────────
def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    return s

def md_to_xhtml(md):
    out, i = [], 0
    lines = md.split("\n")
    def flush_para(buf):
        if buf:
            out.append("<p>" + inline(" ".join(buf).strip()) + "</p>")
            buf.clear()
    buf = []
    while i < len(lines):
        ln = lines[i]
        if re.match(r"^\s*$", ln):
            flush_para(buf); i += 1; continue
        if ln.startswith("### "):
            flush_para(buf); out.append("<h3>" + inline(ln[4:]) + "</h3>"); i += 1; continue
        if ln.startswith("## "):
            flush_para(buf); out.append("<h2>" + inline(ln[3:]) + "</h2>"); i += 1; continue
        if ln.startswith("# "):
            flush_para(buf); out.append("<h1>" + inline(ln[2:]) + "</h1>"); i += 1; continue
        if ln.strip() in ("---", "***"):
            flush_para(buf); out.append("<hr/>"); i += 1; continue
        if ln.startswith(">"):
            flush_para(buf)
            q = []
            while i < len(lines) and lines[i].startswith(">"):
                q.append(lines[i].lstrip("> ").rstrip()); i += 1
            out.append("<blockquote><p>" + inline(" ".join(q)) + "</p></blockquote>"); continue
        if ln.startswith("|"):
            flush_para(buf)
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.match(r"^:?-+:?$", c) for c in cells):
                    rows.append(cells)
                i += 1
            out.append("<table>")
            for r_i, r in enumerate(rows):
                tag = "th" if r_i == 0 else "td"
                out.append("<tr>" + "".join(f"<{tag}>{inline(c)}</{tag}>" for c in r) + "</tr>")
            out.append("</table>"); continue
        m = re.match(r"^(\d+)\.\s+(.*)$", ln)
        if m:
            flush_para(buf)
            start = m.group(1)
            out.append(f'<ol start="{start}">')
            while i < len(lines):
                m2 = re.match(r"^(\d+)\.\s+(.*)$", lines[i])
                if m2:
                    item = [m2.group(2)]; i += 1
                    while i < len(lines) and re.match(r"^\s{2,}\S", lines[i]):
                        item.append(lines[i].strip()); i += 1
                    out.append("<li>" + inline(" ".join(item)) + "</li>")
                elif re.match(r"^\s*$", lines[i]) and i + 1 < len(lines) and re.match(r"^\d+\.\s", lines[i + 1]):
                    i += 1
                else:
                    break
            out.append("</ol>"); continue
        if re.match(r"^-\s+", ln):
            flush_para(buf)
            out.append("<ul>")
            while i < len(lines):
                if re.match(r"^-\s+", lines[i]):
                    item = [re.sub(r"^-\s+", "", lines[i])]; i += 1
                    while i < len(lines) and re.match(r"^\s{2,}\S", lines[i]):
                        item.append(lines[i].strip()); i += 1
                    out.append("<li>" + inline(" ".join(item)) + "</li>")
                elif re.match(r"^\s*$", lines[i]) and i + 1 < len(lines) and re.match(r"^-\s", lines[i + 1]):
                    i += 1
                else:
                    break
            out.append("</ul>"); continue
        buf.append(ln.strip()); i += 1
    flush_para(buf)
    return "\n".join(out)

XHTML = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>{title}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><section epub:type="{etype}">
{body}
</section></body></html>"""

CSS = """body { font-family: Georgia, serif; line-height: 1.55; margin: 0 5%; }
h1 { font-size: 1.6em; margin: 1.2em 0 0.3em; line-height: 1.2; }
h2 { font-size: 1.25em; margin: 1.4em 0 0.3em; color: #1F5E3A; }
h3 { font-size: 1.05em; margin: 1.2em 0 0.2em; }
p { margin: 0.5em 0; text-align: left; }
blockquote { margin: 1em 5%; font-style: italic; border-left: 3px solid #2E7D4F; padding-left: 0.8em; }
hr { border: none; border-top: 1px solid #999; margin: 1.6em 20%; }
table { border-collapse: collapse; margin: 1em 0; font-size: 0.92em; }
th, td { border: 1px solid #888; padding: 0.35em 0.5em; text-align: left; }
ol li, ul li { margin: 0.45em 0; }
code { font-family: Menlo, monospace; font-size: 0.9em; }
a { color: #1F5E3A; }"""

def main():
    cover = build_cover(os.path.join(HERE, "cover.jpg"))
    chapters = [
        ("front", "Front matter & foreword", "frontmatter", os.path.join(HERE, "front-matter.md")),
        ("ch1", "Chapter One — The Day the Estate Asked for One Sentence", "chapter", os.path.join(BOOK, "when-creation-is-cheap-ch1.md")),
        ("ch2", "Chapter Two — The Day the Words Got a Garden", "chapter", os.path.join(BOOK, "when-creation-is-cheap-ch2.md")),
        ("ch3", "Chapter Three — The Estate Learns to Tend Itself", "chapter", os.path.join(BOOK, "when-creation-is-cheap-ch3.md")),
        ("ch4", "Chapter Four — The Estate Grows Senses", "chapter", os.path.join(BOOK, "when-creation-is-cheap-ch4.md")),
        ("ch5", "Chapter Five — The Door Opens", "chapter", os.path.join(BOOK, "when-creation-is-cheap-ch5.md")),
        ("back", "Afterword, the lessons, and the authors", "backmatter", os.path.join(HERE, "back-matter.md")),
    ]
    docs = []
    for cid, ctitle, etype, path in chapters:
        md = open(path, encoding="utf-8").read()
        # strip the repeated full book title h1 + chapter-file cross-links (ebook nav replaces them)
        md = re.sub(r"^# When Creation is Cheap.*\n", "", md)
        md = re.sub(r"\n\*The [^*]{0,160}\[Chapter[^*]*\*\n?$", "", md)
        body = md_to_xhtml(md)
        x = XHTML.format(title=html.escape(ctitle), etype=etype, body=body)
        parseString(x)  # well-formedness gate — raises on bad XML
        docs.append((cid, ctitle, x))
    today = datetime.date(2026, 7, 17).isoformat()
    manifest = "\n".join(
        f'<item id="{cid}" href="{cid}.xhtml" media-type="application/xhtml+xml"/>' for cid, _, _ in docs)
    spine = "\n".join(f'<itemref idref="{cid}"/>' for cid, _, _ in docs)
    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:aigovops-wcic-2026-07-17</dc:identifier>
<dc:title>When Creation is Cheap, Editorial must be Strong and Architecture FOCUSED and Amazing</dc:title>
<dc:creator>Bob Rapp</dc:creator>
<dc:contributor>Ken Johnston</dc:contributor>
<dc:language>en</dc:language>
<dc:date>{today}</dc:date>
<dc:publisher>AiGovOps Foundation</dc:publisher>
<meta property="dcterms:modified">{today}T00:00:00Z</meta>
<meta name="cover" content="cover-img"/>
</metadata>
<manifest>
<item id="cover-img" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
{manifest}
</manifest>
<spine>
{spine}
</spine>
</package>"""
    parseString(opf)
    toc_items = "\n".join(f'<li><a href="{cid}.xhtml">{html.escape(t)}</a></li>' for cid, t, _ in docs)
    nav = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><nav epub:type="toc"><h1>Contents</h1><ol>
{toc_items}
</ol></nav></body></html>"""
    parseString(nav)
    out = os.path.join(HERE, "when-creation-is-cheap.epub")
    with zipfile.ZipFile(out, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>""")
        z.writestr("OEBPS/package.opf", opf)
        z.writestr("OEBPS/nav.xhtml", nav)
        z.writestr("OEBPS/style.css", CSS)
        z.write(cover, "OEBPS/cover.jpg")
        for cid, _, x in docs:
            z.writestr(f"OEBPS/{cid}.xhtml", x)
    print("built:", out, os.path.getsize(out), "bytes")

if __name__ == "__main__":
    main()

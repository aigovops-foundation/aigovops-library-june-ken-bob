# Publishing "When Creation is Cheap…" to Amazon Kindle — steward runbook

*The upload-ready package is built; publishing is a steward move (your Amazon account,
your terms acceptance, your pricing). This runbook is the whole path — about 20 minutes.*

## The package (this directory)

- `when-creation-is-cheap.epub` — the book: cover, foreword, chapters 1–3, afterword
  with the eight lessons, about-the-authors. EPUB3, hand-built, XML-validated.
- `cover.jpg` — 1600×2560 (KDP's recommended 1.6:1), embedded in the epub AND needed
  separately at upload.
- `build-kindle.py` — rebuilds both from the chapter markdown (`python3
  build-kindle.py`). New chapters: add one line to the `chapters` list.

## Steps (kdp.amazon.com)

1. **Sign in** at kdp.amazon.com with your Amazon account (create the KDP account if
   first time — it will ask for author/payee identity, tax interview (W-9), and bank
   details for royalties; all yours alone to enter).
2. **Create → Kindle eBook.**
3. **Details** — suggested metadata:
   - Title: `When Creation is Cheap, Editorial must be Strong and Architecture FOCUSED and Amazing`
   - Subtitle: `One day inside an AI-governed estate`
   - Author: Bob Rapp · Contributors: Ken Johnston (Contributor)
   - Description (draft, edit freely): *On a single day in July 2026, a nonprofit's
     entire web estate — ten repositories, a governed AI-agent platform, a community,
     four open-source tools — was redesigned end to end by AI agents, while two humans
     held the meaning with fewer and fewer words. This is the live record of that day,
     kept as it happened: the creed, the garden, the gates that caught the mistakes,
     and the estate that learned to tend itself. A field manual disguised as a story
     for anyone building with AI agents: when creation is cheap, editorial must be
     strong — and architecture focused, and amazing.*
   - Keywords (7): AI governance · AI agents · policy as code · design systems ·
     human-in-the-loop · agentic engineering · digital estate
   - Categories: Computers & Technology → Artificial Intelligence; Business →
     Information Management (adjust in the picker).
   - Public domain: No. Content rights: you own them.
4. **AI-content disclosure:** KDP asks whether AI tools were used. This book is
   AI-assisted by its very subject — answer honestly per the form's definitions
   (text: created with AI tools, with substantial human editing/direction; images
   (cover): created with tools, human-directed). The foreword already discloses it
   to readers.
5. **Content** — upload `when-creation-is-cheap.epub`; upload `cover.jpg` as the
   cover (or use KDP Cover Creator later if you want commissioned art); run the
   **online previewer** and flip through all five sections (check the ch1 table and
   the numbered lists).
6. **Pricing** — territory: all; royalty: 70% requires $2.99–$9.99 (suggest **$4.99**
   to start; $0.99/35% if you want reach over royalty). KDP Select enrollment
   (exclusivity for Kindle Unlimited) is optional — decide deliberately; it forbids
   publishing the ebook elsewhere while enrolled.
7. **Publish.** Live in 24–72h. The ASIN comes by email — worth adding to the press
   kit and the newsroom afterward.

## Editions

This is v1 (chapters 1–3, July 17, 2026). The day's record continues at item 35 —
when chapter four exists, rebuild (`python3 build-kindle.py`) and upload the new file
as a content update to the same ASIN (KDP → your book → Edit content).

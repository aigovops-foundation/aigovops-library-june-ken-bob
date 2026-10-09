# The simple front door — six actions, one Library, default yes (M15)

Status: Directed by Bob 2026-10-08: approved; Devin picked defaults — supersede M13 nav, Cal.com booking, $25/$100/$1,000 one-time or monthly, free registration green, yellow default-yes at 24h.

## Recommendation

**Replace the current porch with one page built around six actions plus one searchable Library, and run every action by agents that default to yes.** Today a visitor needs to learn the vocabulary (gates, movements, the café, Wren, Thursday) before they can find how to join, give or book. The new page leads with what people came to do, and the mechanism line from `plan/growth-100k-recommendations.md` ("AI governance that governs itself") stays as the headline. Ken or Bob are needed for about 45 minutes a week, and only for money leaving, keys, DNS, deletions and mail in their name.

| Metric | Value | Detail |
|---|---:|---|
| Top actions on the home page | 6 | each finished in one sheet, no new page |
| Library items indexed in the prototype | 186 | 100 cases · 8 worksheets · 23 tools · 26 pages · 29 processes |
| Founder time | ~45 min/wk | one weekly Yes-queue, plus the calls they take |

## The six actions today and in the redesign

*Current vs proposed flow for each action*

| Action | Today (what I found on the live site) | Proposed |
|---|---|---|
| Be a member | "Join" in the nav goes to `community.aigovops-foundation.com/signin.html`, a different site with its own vocabulary. | Email only, then a magic link. You become a member in about 30 seconds and fill in your profile later. |
| Give money | The Support page has $50 / $1,000 / $10,000 tiers and says "checkout links arrive soon… pledge-by-email", even though four Stripe links already exist on the page. | One-time or monthly toggle, then $25 / $100 / $1,000 / other, then Stripe Checkout, a receipt and a share option. Organisations get one link to the $10k partner tier. |
| Join meetings | Thursday 15:00 PT is explained on the community page, but there's no RSVP on the porch. The Luma page `luma.com/sfaigovops` isn't linked from the site. | The next Thursday sits on the home page with a date badge and one "Save my seat" button, then a calendar invite and reminders. |
| Read Substack | Only a footer link to `aigovops.substack.com`. | A tile plus an inline email subscribe, so readers never leave the page. |
| Get an audit plan | There's no "audit plan" offer. The nearest things are the 10-minute Gate Check and the Vendor RFI tool. | The Gate Check is renamed to the outcome people want: 10 questions in, a plan mapped to the four gates and worksheets out, plus a signed Gate Card for members. |
| Book the founders | "Schedule a call" on the Founders page is a mailto link hidden behind Cloudflare email protection. There's no calendar. | Choose Either, Ken or Bob, then pick an open slot, then get an invite and a one-page brief. Agents book only into slots the founders opened. |

## Patterns borrowed, and from where

*Reference patterns*

| Reference | Pattern | Used for |
|---|---|---|
| AI Tinkerers (aitinkerers.org) | Upcoming events lead the home page. Each city page has one RSVP, and organisers run the room while the platform handles operations. | The next-Thursday strip, and the Host agent doing the logistics while a human marks the worksheets. |
| MLOps Community (mlops.community) | The nav is just Events · Podcast · Blog · Jobs · Partner, with a *Join* button. | The four-link nav plus one primary button. |
| All Tech Is Human | A global responsible-tech nonprofit: newsletter (35k+), Slack (14k+ in 115 countries), a free resource library, and mentorship. | Proof that a nonprofit grows on a free newsletter plus a free library. Membership stays free. |
| Responsible AI Institute | Paid membership from $10k a year, sold through assessments. | The contrast: we give the audit plan away and keep the $10k tier only for organisations. |
| GoFundMe donate flow (Mobbin) | Amount first, then payment, then confirmation with sharing. | The Give sheet. |
| Calendly booking flow (Mobbin) | Date and time, then details, then confirmation. | The Book-the-founders sheet. |
| Substack / Circle onboarding (Mobbin) | Email first; profile and community setup come after. | Become a member and Subscribe. |

## One indexed Library

Today the content is spread across the porch, practice, community/library (members only), 26 Library pages, 23 repo READMEs and Pages sites, and 29 process docs. The redesign has **one public index with gated depth**: anyone can search and see a title and summary, and some items open only for members (marked *Members*). This follows the Library's existing membership-wall rule (`plan/processes/membership-wall.md`).

| Field | Description |
|---|---|
| Record | `{title, summary, type, gate, level, frameworks, country, url, members_only}`. The prototype embeds the real 186 records. |
| Types | Case · Worksheet · Tool · Guide · Demo · Plan · Process (Newsletter and Talk get added once those feeds are pulled in) |
| Facets | Type and framework (NIST, EU AI Act, OWASP, ISO), plus free text over titles, summaries, frameworks, countries and the case rules |
| Build | A Librarian agent rebuilds `library.json` nightly from the org repos, the harms corpus and Substack RSS. Search runs in the browser, with no server and no search vendor. |
| Class | Green: the index is a machine artifact that's reversible and leaves a receipt. A new item *type* is yellow. |

## Agents run it, default yes

This is built on `policies/autonomy.yaml` (green: act alone; yellow: propose; red: a human only). The new rule for yellow is **yes after 24 hours unless a founder says no**.

*Who runs each action*

| Action | Agent (from plan/agents.md) | Class today | Proposed | Founder touch |
|---|---|---|---|---|
| New free member | Concierge | Red (`accept-a-member-or-grant-access`) | **Green for free registration only**, with abuse screening and revocable access. Granting roles stays red. | None |
| Donation in | Herald | n/a (only `move-money` is red) | Green: Stripe takes the payment and the agent sends the thank-you and receipt. | Refunds and payouts only |
| Meeting RSVP and reminders | Host | Green | Green | The founder hosts or marks; it's optional once stewards host |
| Newsletter issue | Scribe (+ aiupdates feed) | Red when sent as a founder | **Sent as the Foundation:** yellow, default yes after 24 hours | A veto window |
| Audit plan | Auditor (Gate Check) | Green | Green. Answers are never stored; only the verdict is kept. | None |
| Founder booking | Concierge | — | Green, into founder-opened slots only, with a brief attached | Taking the call |
| Library additions | Librarian (Scribe) | Green | Green | None |
| Site copy changes | Maker + Cloud-Mary | Yellow | Yellow, default yes after 24 hours once the battery is green | A veto window |
| DNS, keys, deletes, money out, repo transfers | — | Red | Red (unchanged) | Ken or Bob |

**The founder's week:** one 15-minute Yes-queue on Monday covering anything vetoable and any red items, the calls they choose to open slots for, and Thursday if they want to host.

## Decisions needed from Ken and Bob

**1. Supersede M13 "three doors only".** The home nav changes from Get / Stay / Recover to the six actions. The three movements stay as the Library's map and the language of how the Foundation operates.

**2. Change `autonomy.yaml`:** free member registration becomes green, and yellow becomes "default yes after 24 hours". The file is `status: draft, ratified_by: null`, so this is a ratification step that belongs to the founders.

**3. Tools:** a booking tool (Cal.com or Calendly) with founder availability; Stripe Checkout prices at $25 / $100 / $1,000 one-time and monthly; and the Luma calendar for Thursdays.

**Risk: moving the membership wall.** A public index with member-only depth changes which titles anyone can see. Nothing in the harms corpus is private (all 100 cases are cited public incidents), but the plan and design pages are currently members-only.

## Rollout

### 01 · Ship the six actions on the porch

*Planned · about 1 week*

Rebuild the porch from the prototype in the site repo (PR plus the Cloud-Mary battery) and wire up Stripe, Luma, Substack and booking. Keep the old URLs, using the garden stub treatment.

### 02 · One Library index

*Planned · about 1 week*

Add the Librarian build to the Library repo, publish `library.json` plus the search page, and add the hourly crawl entry.

### 03 · Turn on default yes

*Waiting on decision 2*

Add the veto-window runner, the Monday Yes-queue digest (an extension of `founders-digest`) and receipts for every auto-yes.

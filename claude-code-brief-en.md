# Project: TechVerse

## Concept
An interactive space-themed website (stars, planets, galaxies) displaying computer,
networking, Linux, and systems terminology. Each term = a star. Related terms are
connected by "neural links" (visual lines between stars). Clicking any star opens
its full explanation, and clicking any neural link navigates to the related term
and opens its explanation too.

A working prototype is attached as reference: it uses a D3.js force-directed graph
with a category system and term data embedded inline in the file. It demonstrates
category-based clustering, an info panel that opens on click, and navigation between
related terms. **The goal is to build on this foundation, especially the visual
design, not start from scratch.**

## Design
- Upgrade from the current simple SVG look to a photorealistic space aesthetic —
  stars with real-looking glow, nebula effects, depth and dimension — using
  whichever technology best fits (WebGL / Three.js / Shaders, your call based on
  performance and quality).
- Dynamic, visually striking interaction: smooth motion, smooth zoom/pan, glow on
  selection, a "star birth" effect when a new term is added.
- Preserve readability and usability despite the rich visual style.
- The site is fully RTL (Arabic layout).

## Content and language
- The site UI is available in two languages: Arabic and English (with a toggle
  between them).
- Term name itself: kept in its original English form in both UI languages — as
  actually used in the field, never translated.
- Explanation/definition: available in both Arabic and English at the same time for
  every term (not a UI-toggle translation) — meaning each term's data holds a
  separate Arabic definition field and a separate English definition field.
- Information must be accurate and based on real, credible sources (e.g. RFCs, Cisco
  documentation, Linux man pages, official standards bodies, etc).
- Starting point: roughly 95 terms already in the prototype (networking, Linux,
  systems/infrastructure, cybersecurity, hardware/CCTV) — the goal is to expand
  these to as many terms as possible over time.

## Future domains for expansion
Add gradually (propose the rollout order you think makes most sense):
- Hardware components in detail (CPU, RAM, storage, GPU)
- Operating systems in depth (Windows Server, macOS, Linux distributions)
- Wireless security (802.11 standards, WPA2/WPA3)
- AI and machine learning
- Software development (API, Framework, Git, CI/CD)
- Databases (SQL/NoSQL)
- Web and internet (browser, domain, hosting, CDN)
- Blockchain and cryptocurrency
- Internet of Things (IoT)
- Tech project management (Agile, Scrum, DevOps)

## Technical architecture
- **Static site** — no real backend, no database, no user accounts/login system.
- Term data lives in separate JSON file(s), not inline in the site code as in the
  prototype — so the site stays lightweight as the term count grows.
- Each term's data structure should include from the start (even if some fields
  aren't fully used yet):
  - id, name (English), category, sub-category
  - separate Arabic and English definition fields (definition_ar / definition_en),
    related terms (related)
  - aliases/alternate names
  - date-added

## Search
- Search by primary name and by aliases together.
- When a term isn't found: a clear "not found" message + suggestions for the
  closest matching terms (fuzzy matching).
- Log failed searches to an internal wishlist to track the most-requested missing
  terms.

## Continuous growth features ("expanding universe")
- A distinct visual effect for newly added terms (a "new star").
- Split categories that grow too large into sub-galaxies (sub-clusters) to avoid
  visual crowding.
- A "recent discoveries" page/section showing the latest added terms.
- "Constellations" = curated learning paths linking a group of related terms toward
  a goal (e.g. a CCNA path).
- A "galaxy completeness" indicator per category (term count + link density).

## Update workflow
- A scheduled process (e.g. via Cron) periodically (daily, not hourly) searches for
  new terms and adds them as "drafts" in a separate file (pending-terms.json) —
  not published directly to the live site.
- Drafts are manually reviewed and approved before appearing to visitors, to ensure
  quality and accuracy.

## No login / accounts
The site is fully open to any visitor with no user accounts, login system, or
comments/discussions.

## Monetization and reach
- A simple visitor counter shown on the site.
- Donation support via Buy Me a Coffee — a clear link/button that doesn't intrude
  on the immersive visual exploration experience.
- SEO: correct titles and meta descriptions, indexable HTML structure, good load
  performance, and possibly indexable pages/routes per term or category.

## Communication during implementation
- Always speak to the user in Arabic only while working on this project.
- When any decision is unclear or needs input during implementation, ask the user
  instead of assuming and proceeding — the user will answer your questions and
  guide you.
- The project is connected to a GitHub repository. After any significant
  development milestone or meaningful change, propose to the user that the updates
  be pushed (commit + push), briefly explaining what will be uploaded, and get their
  explicit approval before doing it — never commit or push automatically without the
  user's approval each time.

## Feedback from an actual first design attempt
A first pass at the visual design was tried and was not good enough. Specifically
needed to raise the realism and liveliness:
- **High visual quality (HDR-like feel)**: stars need real multi-layer bloom/glow,
  not just a circle with simple blur, plus color grading that gives the
  over-exposed brightness feel of real space photography (post-processing, e.g.
  UnrealBloomPass in Three.js or an equivalent).
- **Neural links must actually feel "alive"**: light pulses that travel along each
  link between two stars continuously and periodically, with a gradual opacity
  shift (a breathing effect) and possibly a subtle line-width change — not static,
  motionless lines like in the first attempt.
- **Terms (stars) must float and keep moving continuously**: even after the graph
  simulation settles, each star should keep a slow, continuous organic motion
  around itself (a gentle sway/float), not freeze completely in place.

## Hosting
Initially considering hosting the project from the user's personal machine.
Discuss with the user at implementation time the best practical way to keep the
site continuously available (not only while the machine is running), including
free cloud hosting alternatives if that turns out to be a better fit.

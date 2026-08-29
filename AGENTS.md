This is an EmDash site -- a CMS built on Astro with a full admin UI.

## Commands

```bash
pnpm dev              # Start the Astro dev server
npx emdash types      # Regenerate TypeScript types from a running site
```

The admin UI is at `http://localhost:4321/_emdash/admin`.

## Key Files

| File                     | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `astro.config.mjs`       | Astro config with `emdash()` integration, database, and storage                    |
| `src/live.config.ts`     | EmDash loader registration (boilerplate -- don't modify)                           |
| `seed/seed.json`         | Schema definition + demo content (collections, fields, taxonomies, menus, widgets) |
| `emdash-env.d.ts`        | Generated types for collections (auto-regenerated on dev server start)             |
| `src/layouts/Base.astro` | Base layout with EmDash wiring (menus, search, page contributions)                 |
| `src/pages/`             | Astro pages -- all server-rendered                                                 |

## Skills

Agent skills are in `.agents/skills/`. Load them when working on specific tasks:

- **building-emdash-site** -- Querying content, rendering Portable Text, schema design, seed files, site features (menus, widgets, search, SEO, comments, bylines). Start here.
- **creating-plugins** -- Building EmDash plugins with hooks, storage, admin UI, API routes, and Portable Text block types.
- **emdash-cli** -- CLI commands for content management, seeding, type generation, and visual editing flow.

## Documentation

The EmDash docs are available as an MCP server at `https://docs.emdashcms.com/mcp`. When you need to verify an API, hook, config option, field type, or pattern, call `search_docs` against the live documentation rather than relying on training-data recall. The docs reflect current behaviour; assumptions may not.

This template ships with `.mcp.json`, `.cursor/mcp.json`, and `.vscode/mcp.json` so Claude Code, Cursor, and VS Code auto-discover the docs server. Other tools (OpenCode, Windsurf, etc.) need a manual one-time setup -- see [docs.emdashcms.com/docs-mcp](https://docs.emdashcms.com/docs-mcp).

## Rules

- All content pages must be server-rendered (`output: "server"`). No `getStaticPaths()` for CMS content.
- Image fields are objects (`{ src, alt }`), not strings. Use `<Image image={...} />` from `"emdash/ui"`.
- `entry.id` is the slug (for URLs). `entry.data.id` is the database ULID (for API calls like `getEntryTerms`).
- Always call `Astro.cache.set(cacheHint)` on pages that query content.
- Taxonomy names in queries must match the seed's `"name"` field exactly (e.g., `"category"` not `"categories"`).

## This Template

A blog with posts, pages, categories, tags, full-text search, and RSS. Designed for personal writing, technical writing, indie newsletters, and anything where the writing is the product. Editorial-tech aesthetic: confident sans-serif, restrained accent, real article structure with bylines and reading time.

## Pages

| Page        | Path               | What it shows                                                                                          |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| Home        | `/`                | Featured post hero (large image + excerpt), latest posts grid                                          |
| All posts   | `/posts`           | Article count, full post list with excerpts and tag chips                                              |
| Post detail | `/posts/[slug]`    | Featured image, title, body, left meta column (authors + date), right TOC + search + categories gutter |
| Search      | `/search`          | Full-text search UI                                                                                    |
| Page        | `/pages/[slug]`    | Static page content (Portable Text)                                                                    |
| Category    | `/category/[slug]` | Posts filtered by category                                                                             |
| Tag         | `/tag/[slug]`      | Posts filtered by tag                                                                                  |
| RSS         | `/rss.xml`         | Generated feed                                                                                         |

## Schema

- `posts` collection: `title`, `featured_image`, `content` (Portable Text), `excerpt` (text).
- `pages` collection: `title`, `content` (Portable Text). Used for `/about` etc.
- `projects` collection: `title`, `featured_image`, `description` (text), `full_content` (Portable Text), `tech_stack` (array of string), `github_url`, `live_url`, `category` (select), `featured` (boolean, shows on the homepage), `published_at` (datetime, used for ordering).
- Taxonomies: `category`, `tag` (both attached to `posts` only).
- Single `primary` menu (Home, Projects, Blog, About by default).

Site settings have `title` and `tagline` -- both render in the header / footer / hero.

## Newsletter signup

The homepage's newsletter section renders a real form via `@emdash-cms/plugin-forms`, already registered in `astro.config.mjs`. The plugin only stores form *definitions* in its own admin-managed storage -- there's no seed.json support for forms, so the form has to be created once by hand:

1. Start the site and open `/_emdash/admin/plugins/emdash-forms`.
2. Create a form with slug `newsletter-signup` (this must match the `formId` prop on `<Newsletter>` in `src/pages/index.astro`) and at least one `email` field.
3. In the form's settings, set `notifyEmails` to get pinged on new signups, and/or a `webhookUrl` to forward submissions elsewhere. Both are handled by the plugin itself -- no extra wiring needed.
4. Submissions are reviewable at `/_emdash/admin/plugins/emdash-forms/submissions`.

Notification emails require an email-transport plugin (e.g. Resend, Postmark, SES) to be installed and selected in Settings > Email -- this template doesn't ship one. Without it, `notifyEmails` falls back to EmDash's dev console provider, which just logs the email to the server console instead of sending it. The `webhookUrl` option works regardless, since it only needs the `network:request` capability the forms plugin already has.

Newsletter field colors (`--ec-form-*`) are themed per theme file under `.newsletter-form-wrap .ec-form` -- see `src/components/home/Newsletter.astro` for the structural markup and any theme file in `src/styles/themes/` for the color pattern.

## Visual character

Single typeface: **Inter** on `--font-body`, used for everything including headings (`--font-heading` defaults to the body face; tighter letter-spacing on h1/h2). **JetBrains Mono** on `--font-mono` for inline code and code blocks. Body and headings share the same family; weight and size carry the hierarchy (`--font-weight-heading` 600, `--font-weight-display` 700 for h1/page titles).

The brand colour is `#0066cc` (`--color-brand`) -- used for links, the post-card title hover, and the search input focus ring. There's also a secondary text colour (`--color-text-secondary`) and a `--color-muted` for meta info. Don't add a second accent.

The article layout is the standout feature: a three-column reading view with a left meta column (author bylines, date), centred 680px body column, and a right gutter for search, table of contents, and categories. Don't flatten that into one column on desktop -- the layout signals "this is something to read".

## Themes

This site ships 6 interchangeable theme packs in `src/styles/themes/`, each a full port of one of the mockups in `design-demos/`:

| Theme                | Look                                                       |
| --------------------- | ----------------------------------------------------------- |
| `variation-1`         | Dark, indigo -> pink gradient brand mark                   |
| `variation-2`         | Dark, rotating cyan/violet/pink/amber gradient, pill buttons |
| `variation-3`         | Light editorial, slate ink + amber accent                  |
| `huashu-variation-1`  | Dark, orange -> purple gradient (default)                  |
| `huashu-variation-2`  | Dark glassmorphism, violet -> teal                         |
| `huashu-variation-3`  | Dark navy, single teal accent, large image-led cards        |

`src/styles/theme.css` holds a single `@import` line pointing at the active theme file. Switch with:

```bash
npx pnpm theme <name>      # e.g. npx pnpm theme variation-2
npx pnpm theme --list      # see all available themes
```

Restart the dev server after switching. Each theme file only overrides `tokens.css` variables and a handful of section classes (`.hero`, `.feature-card`, `.project-card`, `.post-card`, `.newsletter-form-wrap .ec-form`, etc.) -- none of them touch markup, so switching is always non-destructive. To build a 7th theme, copy an existing file in `src/styles/themes/` as a starting point and point the `@import` at it.

Two of the ported mockups (`huashu-variation-2`, `huashu-variation-3`) pair their palette with a second display font (Space Grotesk / Playfair Display). That swap isn't applied automatically -- see the comment at the top of each theme file for how to add it via the `fonts` array in `astro.config.mjs`.

## Customisation

Design tokens live in `src/styles/tokens.css` with their default values. To restyle the site, override tokens in `src/styles/theme.css` -- declarations there are unlayered, so they always beat the `@layer base` defaults. Don't edit `tokens.css` or `Base.astro` for visual changes. If you're customizing rather than switching themes outright, edit the active file under `src/styles/themes/` instead of `theme.css` itself, since `theme.css` is just the `@import` switch.

Colours are defined with `light-dark(<light>, <dark>)`, so each token carries both modes. Overriding with a plain colour changes light and dark at once; use `light-dark()` in the override to keep them distinct. There is no separate dark palette to maintain.

Webfonts are configured in `astro.config.mjs` under `fonts:`. To swap the body face, change the `name:` for the entry bound to `cssVariable: "--font-body"`. Good alternatives: Geist, IBM Plex Sans, Söhne (if you have a licence), Public Sans. If you want a serif-bodied blog, swap to a humanist serif like Source Serif, Crimson Pro, or Lora -- but then also raise `--font-size-base` to `1.0625rem` for readability. To give headings their own face (or use a system font) without touching the font pipeline, override `--font-heading` or `--font-body` in `theme.css`.

CSS variables worth knowing (see `tokens.css` for the full list):

- `--color-brand`, `--color-brand-hover`, `--color-on-brand`, `--color-brand-ring`
- `--color-bg`, `--color-bg-subtle`, `--color-surface`, `--color-text`, `--color-text-secondary`, `--color-muted`, `--color-border`, `--color-border-subtle`
- `--font-body`, `--font-heading`, `--font-mono`
- `--font-weight-heading` (600) / `--font-weight-display` (700) -- heading weights; lower them if you switch to a serif
- `--tracking-tight` / `--tracking-snug` / `--tracking-wide` / `--tracking-wider` -- letter-spacing tokens used across headings and meta labels
- `--content-width` (680px) -- article body column
- `--wide-width` (1200px) -- max container
- `--gutter-width` (200px) -- right sidebar (TOC) on article pages
- `--meta-col-width` (180px) -- left meta column on article pages
- `--avatar-size-{xs,sm,md,lg}` -- byline avatar sizes at different scales

## What not to do

- Don't add a second accent colour or coloured section backgrounds. The page should be black, white, and one blue.
- Don't replace Inter with a display sans (Bebas, Anton, etc.). Headings rely on weight contrast, not novelty faces.
- Don't collapse the article gutter on desktop -- it's part of the reading experience.
- Don't use stock blog copy ("Welcome to my blog", "Stay tuned for more"). Write a real tagline that says what this blog is about.
- Don't seed the home page with three identical placeholder posts. If you only have one real post, show one real post.
- Don't enable comments without a plan to moderate them. The template doesn't ship a comments system by default for a reason.

# AI design workflow

The design agent owns the design from exploration through final specification and visual QA. Start from the product journeys and use ReelFren/DramaFren as flow references. Use Series Viral Box branding and owned or fixture visuals.

1. Design discovery, provider browse, search, title detail, watch/episode selection, and download journeys. Include mobile navigation, watch progress, bookmarks and admin sync/asset monitoring. Define loading, empty, error, restricted, unavailable and long-title states.
2. Produce web desktop/mobile, native iOS/Android and admin layouts. Supply tokens for color, typography, spacing, focus and motion. Document keyboard, screen reader, touch targets, captions and reduced motion. Check localization and RTL variants before calling relevant designs complete.
3. Publish one versioned source design link and an implementation spec with annotated components, responsive behavior, assets and interaction rules. Keep token values in the repo when implemented. An agent with design tooling finalizes the source, and an implementation agent compares builds to it and records screenshots and differences.
4. Final design acceptance requires complete screen/state coverage, contrast and focus checks, native playback/download interactions, and resolved visual defects. Record the version and QA evidence in the P4-01 PR. Later visual changes update the source design and spec together.


## Catalog implementation checkpoint

The read-only Next.js slice covers provider and locale filtering, paged catalog results, and the title and episode detail view. A single column layout applies at narrow widths, filter controls expand on phones, and long title names wrap in grid cards and detail headings. Filters and pagination use addressable URLs. Native links and form controls retain keyboard navigation, visible focus, and browser history. Status text covers empty results, an invalid cursor, unavailable titles, and upstream failure.

The implemented catalog uses the existing fixture visual palette with dark surfaces, warm link and focus colors, and a system sans fallback. The final design source, visual acceptance, search interaction, RTL acceptance, watch and download flows, signed-in library, admin and native screens remain separate from this checkpoint.

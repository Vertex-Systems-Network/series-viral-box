# AI design workflow

The design agent owns the design from exploration through final specification and visual QA. Start from the product journeys and use ReelFren/DramaFren as flow references. Use Series Viral Box branding and owned or fixture visuals.

1. Design discovery, provider browse, search, title detail, watch/episode selection, and download journeys. Include mobile navigation, watch progress, bookmarks and admin sync/asset monitoring. Define loading, empty, error, restricted, unavailable and long-title states.
2. Produce web desktop/mobile, native iOS/Android and admin layouts. Supply tokens for color, typography, spacing, focus and motion. Document keyboard, screen reader, touch targets, captions and reduced motion. Check localization and RTL variants before calling relevant designs complete.
3. Publish one versioned source design link and an implementation spec with annotated components, responsive behavior, assets and interaction rules. Keep token values in the repo when implemented. An agent with design tooling finalizes the source, and an implementation agent compares builds to it and records screenshots and differences.
4. Final design acceptance requires complete screen/state coverage, contrast and focus checks, native playback/download interactions, and resolved visual defects. Record the version and QA evidence in the P4-01 PR. Later visual changes update the source design and spec together.


## Catalog implementation checkpoint

The read-only Next.js slice covers provider and locale filtering, paged catalog results, and the title and episode detail view. A single column layout applies at narrow widths, filter controls expand on phones, and long title names wrap in grid cards and detail headings. Filters and pagination use addressable URLs. Native links and form controls retain keyboard navigation, visible focus, and browser history. Status text covers empty results, an invalid cursor, unavailable titles, and upstream failure.

The implemented catalog uses the existing fixture visual palette with dark surfaces, warm link and focus colors, and a system sans fallback. The final design source, visual acceptance, search interaction, RTL acceptance, watch and download flows, signed-in library, admin and native screens remain separate from this checkpoint.

## AUD-07 design v0.1

Open the [editable design](https://www.figma.com/design/SmjnJOpLjsoTvF5TCHaxNf/Untitled?t=5wkiy2S14PG56uBf-0&localFileKey=LOCAL_a3f1c930-9aa5-4896-bbfd-2ca166655f79) and select **Series Viral Box · AUD-07 · v0.1**. The seven fixture frames use native editable layers. The imported source is preserved in [design/aud-07-v0.1.json](design/aud-07-v0.1.json). Figma Local inserted 203 nodes and the desktop Discover capture was inspected. Poster and player artwork areas use neutral color blocks pending owned or approved assets.

| Frame | Implementation contract |
| --- | --- |
| Desktop Discover | Preserve provider and locale filters and cursor URLs. Search needs a documented API contract before enabling it. Keep title cards keyboard-focusable and wrap long names. |
| Desktop title and watch | Preserve canonical title identity. List episodes in API order. Request playback and download grants separately, and label the current episode. |
| Mobile Discover | Reflow filters and two-column cards into one column when needed. Reserve space for viewport insets and the bottom navigation. |
| Mobile Watch | Keep video above actions and the episode list. Use the platform's caption and full-screen controls. Present download only when permitted and show progress and failure. |
| Mobile My List | Separate saved titles and active progress. Require a session, restore the saved position, and preserve the empty state. |
| Mobile Account | Expose verification, password and session controls. Announce success and error without shifting focus out of the settings flow. |
| Desktop admin | Keep source health, media status and viewer support distinct. Require authorized operator access. Replace the illustrative counts and rows with actual API data. |

### Implementation tokens

| Token | Value |
| --- | --- |
| Canvas / panel / divider | `#151619` / `#222329` / `#32343C` |
| Text / secondary text | `#F4F2EF` / `#C3C3CA` |
| Action and focus / healthy | `#E4BE8C` / `#9CDBBC` |
| Type | Inter with a system sans fallback |
| Layout | 1200 px desktop reference, 390 px phone reference, 20 px phone gutter, 44 px minimum control height |

### Acceptance still open

- Compare the live catalog against the desktop and phone frames and check 320 px reflow, keyboard focus, zoom, reduced motion, high contrast, and long text.
- Add and review loading, empty, network-error, sign-in-required, permission-denied, expired-grant, and media-unavailable variants. Test localized labels and RTL ordering, then capture review evidence for each affected journey.
- Validate iOS and Android separately for navigation insets, captions, rotation, interrupted playback and download behavior. Treat both platforms as pending until shared contracts and device checks pass.
- Keep viewer session and OAuth mutations same-origin, retain browser-bound callbacks and cookie behavior, and preserve the existing loopback admin boundary until production operator authentication is ready.

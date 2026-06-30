# eaisyDesk UI Patterns

## Page-level Action Toolbar

### Purpose

Use this pattern when a page has a primary page-level action button, such as:

- \+ Új oszlop
- \+ Új kampány
- \+ Új elem
- Exportálás
- Új szabály

### Structure

1. **Page header row** contains the page title only.
2. **Action toolbar row** is placed below the page header as a separate `<div>`.
3. The toolbar row is aligned to the page content grid (not the viewport edge).
4. The action button is aligned to the **right side** of the toolbar.
5. The toolbar sits **above** the main content block.
6. The CTA must **not overlap** with the global notification bell.

### Example Layout

```
┌──────────────────────────────────────────────────┐
│  Page Title                              🔔 Bell │  ← shell header area
├──────────────────────────────────────────────────┤
│                                                  │
│  Page Title (h1 / .page-title)                   │  ← .page-header
│                                                  │
│                              [+ Action Button]   │  ← action toolbar (flex-end)
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Main content block                        │  │  ← content area
│  │  (tabs, table, cards, etc.)                │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### CSS Pattern

```css
.page-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}
```

### Implementation Examples

#### Érdeklődőkezelés (KanbanPage)

```tsx
{/* Header */}
<div className="page-header">
  <div className="page-title">Érdeklődőkezelés</div>
</div>

{/* Page-level CTA */}
<div className="kanban-toolbar">
  <button className="kanban-add-col-btn" onClick={...}>
    <PlusIcon />
    Új oszlop
  </button>
</div>

{/* Main content */}
<div className="kanban-board">...</div>
```

CSS class: `.kanban-toolbar`

#### Kampányok (OutboundPage)

```tsx
{/* Header */}
<div className="page-header">
  <div className="page-title">Kampányok</div>
</div>

{/* Page-level CTA */}
<div className="out-toolbar">
  <button className="out-new-campaign-btn" onClick={...}>
    <PlusIcon />
    Új kampány
  </button>
</div>

{/* Main content */}
<div className="out-content-block">...</div>
```

CSS class: `.out-toolbar`

### Rules

| Rule | Details |
|------|---------|
| **Do not** place page-level CTAs inside `.page-header` | The notification bell occupies the top-right of the shell. A CTA inside `.page-header` may visually overlap with it. |
| **Do not** align CTAs to the far viewport edge | Keep them within the page content grid so they align with the content block below. |
| **Keep visual separation** | Page title, action toolbar, and content block should be clearly separated with consistent spacing. |
| **One CTA per toolbar** | If multiple page-level actions are needed, group them in the same toolbar row with `gap: 8–12px`. |
| **Use a dedicated CSS class per page** | e.g. `.kanban-toolbar`, `.out-toolbar`. All follow the same flex-end pattern. |

### Spacing Guidelines

| Gap | Value |
|-----|-------|
| Page title → action toolbar | Inherited from `.page-header` bottom margin (typically `mb-24`) |
| Action toolbar → content block | `margin-bottom: 16px` on the toolbar |
| Tabs → first content row (inside content block) | `32–40px` |

# UI/UX Consistency Audit Report

## Issues Found

### 1. Debug Alerts (CRITICAL)
- ✅ **FIXED**: Group Income page - Debug alert removed
- ✅ **FIXED**: Group Savings page - Debug alert removed

### 2. Hardcoded Colors (Violates theming.mdc)
**Files with hardcoded colors:**
- `src/app/groups/[id]/page.tsx` - Lines 188, 278: `#8B5CF6`
- `src/app/groups/[id]/members/page.tsx` - Line 286: Inline gradient
- `src/app/groups/page.tsx` - TBD
- `src/app/groups/[id]/settings/page.tsx` - TBD
- `src/app/dashboard/page.tsx` - TBD
- `src/components/groups/create-group-dialog.tsx` - TBD
- `src/components/dashboard/category-pie-chart.tsx` - TBD (Acceptable for charts)

### 3. Page Layout Inconsistencies
**Standard Pattern (from Members page):**
```tsx
<AppLayout>
  <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
    {/* Header with back button */}
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="..."><ArrowLeft /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold gradient-text">Title</h1>
          <p className="text-muted-foreground mt-1">Subtitle</p>
        </div>
      </div>
      <Button>Action</Button>
    </div>
    {/* Content */}
  </div>
</AppLayout>
```

**Pages needing standardization:**
- ✅ Group Income page - Uses `space-y-6` but no max-width container
- ✅ Group Savings page - Uses `space-y-6` but no max-width container
- Personal Income page - TBD
- Personal Savings page - TBD
- Budgets page - TBD
- Analytics page - TBD

### 4. Button Styles
**Inconsistencies:**
- Some use inline gradients (hardcoded)
- Some use className gradients
- Need standardized button variants

### 5. Card Styles
**Inconsistencies:**
- Some use `glass` class
- Some don't
- Need consistent card styling

## Recommended Shared Components

### 1. PageHeader Component
```tsx
<PageHeader
  title="Title"
  subtitle="Subtitle"
  backHref="/path"
  action={<Button>Action</Button>}
/>
```

### 2. PageContainer Component
```tsx
<PageContainer>
  {/* Auto-applies max-width, padding, spacing */}
</PageContainer>
```

### 3. GradientButton Component
```tsx
<GradientButton variant="primary">Action</GradientButton>
```

### 4. EmptyState Component
```tsx
<EmptyState
  icon={<Icon />}
  title="No data"
  description="..."
  action={<Button>Add</Button>}
/>
```

## Action Items

1. ✅ Remove debug alerts
2. ⏳ Replace all hardcoded colors with CSS variables
3. ⏳ Create shared components (PageHeader, PageContainer, etc.)
4. ⏳ Standardize all page layouts
5. ⏳ Audit and fix all dialogs and forms
6. ⏳ Ensure build passes with 0 warnings

## Design Tokens (from globals.css)

### Colors
- Primary: `hsl(var(--primary))`
- Violet: `hsl(var(--violet))`
- Muted: `hsl(var(--muted))`
- etc.

### Gradients
- `.gradient-text`: text-transparent bg-gradient-to-r from-violet-500 to-fuchsia-500
- `.glass`: backdrop-blur with violet border

**ALL inline colors MUST be replaced with these tokens!**


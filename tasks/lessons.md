# Lessons Learned

Patterns and rules to prevent recurring mistakes. Review at session start.

---

## L-001: Always Use Semantic Theme Tokens for Frontend Colors (2026-03-03)

**Mistake**: Used hardcoded Tailwind palette colors (`bg-emerald-100`, `text-amber-800`, `dark:bg-red-900/30`) and hardcoded HSL values (`hsl(248 33% 59%)`) instead of the Cassini theme system's CSS variables.

**Why it matters**: Hardcoded colors don't adapt to light/dark mode, don't respect the Cassini brand palette, and create visual inconsistency. This mistake has happened multiple times.

**Rule**: On EVERY frontend change, verify all colors use semantic tokens:

| Need | Use | Never Use |
|------|-----|-----------|
| Success (green) | `text-success`, `bg-success/10` | `text-emerald-*`, `bg-green-*` |
| Warning (orange) | `text-warning`, `bg-warning/10` | `text-amber-*`, `bg-yellow-*` |
| Danger (red) | `text-destructive`, `bg-destructive/10` | `text-red-*`, `bg-rose-*` |
| Primary (gold) | `text-primary`, `bg-primary/10` | hardcoded gold HSL |
| Chart purple | `text-chart-tertiary`, `bg-chart-tertiary/10` | `text-purple-*`, `hsl(248 33% 59%)` |
| Chart orange | `text-chart-quaternary` | hardcoded orange HSL |
| Neutral text | `text-foreground`, `text-muted-foreground` | `text-gray-*`, `text-slate-*` |
| Borders | `border-border`, `border-foreground/10` | `border-gray-*` |
| Backgrounds | `bg-card`, `bg-muted`, `bg-foreground/[0.03]` | `bg-gray-*`, `bg-slate-*` |

**Checklist before completing any frontend task**:
1. `grep -E "text-(emerald|amber|red|green|purple|slate|gray)-" <changed files>` — should return nothing new
2. `grep -E "bg-(emerald|amber|red|green|purple|slate|gray)-" <changed files>` — should return nothing new
3. `grep -E "hsl\(" <changed files>` — no hardcoded HSL in JSX/TSX (CSS vars in index.css are fine)
4. Verify colors work in both light and dark mode

**Exception**: Some existing components (pre-dating this rule) use hardcoded colors. Don't fix those in unrelated PRs — but never add new ones.

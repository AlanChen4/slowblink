# Loading Skeletons

For content that is loading from disk, the network, or an IPC call, render a [shadcn `<Skeleton>`](https://ui.shadcn.com/docs/components/radix/skeleton) shaped like the content it will be replaced with. Never render placeholder text such as "Loading…", "Loading overview…", or a bare spinner where content will appear.

## Why

A skeleton sized to the real content keeps the layout from jumping when data arrives, and reads as "almost there" rather than "stuck." Free-text fallbacks add a third visual state (text → text → content) that has to re-flow on transition.

## How to apply

1. **Shape the skeleton like the content.** If the loaded view is a list of rows with an icon + label + value, the loading state should be the same row count with `<Skeleton>` blocks at the same sizes. Co-locate the skeleton with the component it shadows (e.g. `TopAppsSkeleton` next to `TopApps`).
2. **Use the existing primitive.** Import from `@/components/ui/skeleton`. Don't roll your own animated div.
3. **Render it from the same loading branch you would have rendered text from.** No extra state, no delay timers — if `loading` is true, return the skeleton tree.

## Exceptions

- **Action processing states** (button mid-submit, refresh button) use an inline spinning icon, not a skeleton. The button is already visible — only its label/icon is changing.
- **Indeterminate background work with no fixed slot** (e.g. a toast that says "Syncing…") is fine as text. The rule covers loading states for slots that will hold content.

## Smell test

You're typing the word "Loading" inside JSX. Stop and reach for `<Skeleton>` instead.

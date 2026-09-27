# Meal plan sharing — design

Date: 2026-09-27
Status: approved for planning

## Context and intent

Today `mealplan-pro` has no user-level ownership: the weekly meal plan
is a single shared resource (`plan:{weekStart}` in KV) that anyone who
can reach the app can see and edit. Cloudflare Access is enabled in
front of the whole site, so every request already carries a reliable
`Cf-Access-Authenticated-User-Email` header.

The goal: let each person have their own meal plan, and let a person
share their plan with 1..n other people, granting each of them either
`view` or `edit` access to it.

Explicitly out of scope for this iteration:
- A recipe/dish catalog per person — `dishes` stays a single global
  catalog shared by everyone.
- Re-sharing: only the owner of a plan manages who it's shared with;
  an `edit` grantee can modify the plan's contents but cannot add or
  remove other grantees.
- A user directory/picker — sharing targets are entered as free-text
  email addresses. Cloudflare Access is the real gate on who can
  actually use that access; our own checks are authorization on top of
  Access's authentication, not a second identity system.
- Any change to the current/next week navigation model already shipped
  — this design extends that feature with an owner dimension, it does
  not change how weeks themselves are browsed.

## Data model (Cloudflare KV)

Four key patterns, all JSON-encoded values:

| Key | Value | Purpose |
|---|---|---|
| `dishes` | `Dish[]` | Unchanged: global recipe catalog. |
| `plan:{ownerEmail}:{weekStart}` | `Plan` | A specific person's plan for a specific week. Replaces the current global `plan:{weekStart}`. |
| `shares:{ownerEmail}` | `ShareEntry[]` | The owner's outgoing shares: who they've granted access to, and at what permission. |
| `shared-with:{granteeEmail}` | `IncomingShare[]` | Reverse index: which owners have granted this person access, and at what permission. Kept in sync with `shares:{ownerEmail}` on every write. |

```ts
type Permission = "view" | "edit";

interface ShareEntry {
  granteeEmail: string;
  permission: Permission;
}

interface IncomingShare {
  ownerEmail: string;
  permission: Permission;
}
```

Both `shares:{ownerEmail}` and `shared-with:{granteeEmail}` are updated
together, inside a single handler, whenever a share is added, changed,
or revoked. There is no reconciliation job — if the two ever drifted
apart it would be a code bug, not a runtime condition the app needs to
detect or repair.

## Identity and authorization

Every API request resolves `requesterEmail` from the
`Cf-Access-Authenticated-User-Email` header (already read today, in
`getAuthenticatedEmail`). If the header is absent, the request is
rejected with 401 — Access is enforced site-wide, so this should only
happen from a misconfigured deployment or a direct local `curl`
without the header set, never from a real user in production.

A new helper resolves access to a specific owner's plan:

```ts
async function resolveAccess(
  env: Env,
  requesterEmail: string,
  ownerEmail: string,
  required: Permission,
): Promise<boolean>
```

- If `requesterEmail === ownerEmail`, access is granted unconditionally
  (an owner always has full "edit" access to their own plan).
- Otherwise, look up `shared-with:{requesterEmail}`, find an entry for
  `ownerEmail`, and check its permission covers `required`. `edit`
  covers both `view` and `edit` requirements; `view` only covers
  `view`.
- No entry, or insufficient permission → access denied.

Rule of thumb applied throughout: reading a plan needs `view`;
generating, regenerating, or swapping a dish in a plan needs `edit`;
managing the share list itself is owner-only and does not go through
`resolveAccess` at all (a grantee, even with `edit`, cannot call the
sharing endpoints for someone else's plan).

## API changes

All existing plan endpoints gain an `ownerEmail` parameter. When
omitted, it defaults to `requesterEmail`, so a user who shares nothing
and is shared with by nobody sees no behavior change from today.

- `GET /api/plan?ownerEmail=...&weekStart=...`
  Requires `view` on `ownerEmail`'s plan. Returns the plan or `null`,
  same as today.
- `POST /api/plan/generate` — body `{ ownerEmail, weekStart }`
  Requires `edit` on `ownerEmail`'s plan.
- `POST /api/plan/swap` — body `{ ownerEmail, weekStart, date, slot, dishId }`
  Requires `edit` on `ownerEmail`'s plan.

New endpoints for managing and discovering shares:

- `GET /api/shares`
  Returns the caller's own outgoing shares (`shares:{requesterEmail}`).
- `POST /api/shares` — body `{ granteeEmail, permission }`
  Adds or updates a share the caller owns. Rejects `granteeEmail ===
  requesterEmail` with 400 (sharing with yourself is meaningless).
  Writes both `shares:{requesterEmail}` and
  `shared-with:{granteeEmail}`.
- `DELETE /api/shares/:granteeEmail`
  Revokes a share the caller owns. Removes the entry from both
  `shares:{requesterEmail}` and `shared-with:{granteeEmail}`.
- `GET /api/shared-with-me`
  Returns the caller's incoming shares
  (`shared-with:{requesterEmail}`) — which owners' plans they can see,
  and at what permission. Drives the frontend's plan picker.

## Frontend

- A plan picker alongside the existing current/next week buttons:
  "Il mio piano" plus one entry per owner in `shared-with-me`, labeled
  by the owner's email. Selecting an entry sets a `viewedOwnerEmail`
  state (default: self); the existing `viewedWeekStart` toggle keeps
  working exactly as it does today, orthogonally, against whichever
  owner is selected.
- When `viewedOwnerEmail !== self` and permission is `view`: the week
  view renders read-only — dish `<select>`s and the "Rigenera piano"
  button are disabled/hidden.
- When permission is `edit` (self, or a granted `edit` share): full
  existing behavior, just scoped to the selected owner.
- A new "Condividi il mio piano" section (only ever about the caller's
  own plan, never shown when viewing someone else's): lists current
  outgoing shares with their permission and a remove button, plus a
  small form (email input + view/edit select) to add a new one.

## Error handling

- 401 — `Cf-Access-Authenticated-User-Email` header missing.
- 403 — requester lacks the required permission for the requested
  owner + action.
- 404 — no plan exists for that owner + week (unchanged from today).
- 400 — attempting to share with yourself, or a malformed share
  request (missing `granteeEmail`/`permission`, invalid `permission`
  value).

## Testing

Unit tests (extending the existing `vitest` + in-memory KV harness in
`functions/api/index.spec.ts`):
- `resolveAccess` for all four cases: owner, shared `view`, shared
  `edit`, no relationship.
- Adding and revoking a share keeps `shares:{owner}` and
  `shared-with:{grantee}` in sync.
- `GET /api/plan` returns 403 for a requester with no relationship to
  the owner.
- `POST /api/plan/generate` and `/api/plan/swap` return 403 for a
  requester who only has `view`.
- `POST /api/shares` rejects self-sharing with 400.
- `GET /api/shared-with-me` and `GET /api/shares` round-trip what was
  written.

Manual verification: exercise the full share → view → edit → revoke
flow in a browser using two different `Cf-Access-Authenticated-User-Email`
values (set directly via `curl -H` against the local `wrangler pages
dev` server, since local dev has no real Access in front of it).

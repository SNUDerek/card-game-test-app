# Post-MVP refactoring targets

## Worth fixing while nearby

### 1. The context value re-creates on every patch

`MultiplayerContext`'s memo depends on `cards` and `stacks`, so every consumer
re-renders on every state patch — roughly 20 Hz for the duration of any drag.
This costs more than any line count on this page, and note that item 4's
rejected two-context split would *not* fix it: both contexts would change
together.

The fix is stable command identities plus selector-style subscription, so a
consumer re-renders only for the slice it reads.

**Not yet.** There is no observed jank at prototype scale. This is the item most
likely to eventually bite, so it is recorded rather than scheduled.

## Deferred, with triggers

### 2. `<TableObjects />` sub-component

The sorted card-and-stack map is the component's actual job. Extracting it means
threading roughly a dozen props across a new boundary — both drag APIs,
definitions, the menu setter, the magnify handlers — which is a prop-drilling
tax for a cosmetic gain. With items 1 and 2 done, `Table.tsx` sits near 170
lines and the mapping reads fine.

**Trigger:** a second object layer (zones are the likely one), or the prop list
shrinking enough that the boundary is cheap.

### 3. `registerTableCommands()` in a `command-registry.ts`

`onCreate` is 77 lines, about 60 of them registrations, and those registrations
are already the thin part: one to three lines each, no logic. That is a routing
table, not a God object.

Extraction also does not cleanly separate anything. The registrations need
`state`, `lockTimeoutMs`, `cardDefinitionIds`, `playerIdBySessionId`,
`rateLimiter`, and `onMessage`, so a free function either takes the room — in
which case the separation is cosmetic and those fields stop being private — or
takes a six-field config object that must be kept in sync. Both are worse than
the current flat, uniform block.

**Trigger:** registrations passing roughly 100 lines. The right cut then is by
domain — `registerCardCommands(command)`, `registerStackCommands(command)`,
taking the existing `command` helper as an argument. That preserves
encapsulation and is a much smaller change than a registry module.

### 4. Splitting `shared/src/commands.ts` by domain

131 lines, flat, no logic, and no internal coupling to untangle — a list of
schema/type/result triples. Three files plus a barrel adds an index to maintain
and a hop when reading, against a speculative future bottleneck. `AGENTS.md`
calls for a small shared module and concrete abstractions driven by current
requirements.

**Trigger:** roughly 300 lines, or two domains needing genuinely different
schema helpers.

Two small placement oddities are worth folding into any future edit of the file:
`WORLD_COORDINATE_LIMIT` is a domain bound sitting in a commands file, and
`objectLockKey` is a function in a file otherwise holding schemas.

# Biochar-OS Backlog

Issues and follow-ups discovered during development, grouped by tier. Tier 0
is critical/blocking; tier 3 is polish and narrow edge cases. New entries go
under the appropriate tier with a brief symptom, root-cause hypothesis,
investigation notes, fix options, and the date it was surfaced.

## Tier 3 — polish and narrow edge cases

### Daily Sheet autosave race — mid-type edits can be erased (~30-60 min)

**Symptom:** Operator types in form fields (especially text fields like
maintenance log or notes), sees their text briefly disappear mid-typing
a few seconds after pausing. Triggered by debounced autosave firing
(3s after last edit), reading state, executing save, then writing back
to state with the pre-typing snapshot — overwriting any characters the
operator typed during the save's in-flight window (typically 100-300ms).

**Root cause hypothesis:** handleSave reads state at fire time but may
mutate or set state arrays (e.g., setBags([...bags]) after marking
bag._saved = true) with a stale snapshot. If user edits arrive during
the in-flight save, those edits get clobbered when the save completes.

**Investigation needed:**
- Reproduce reliably: type continuously for >3 seconds, look for
  characters disappearing around save completion
- Profile React state updates during a save window
- Identify which fields are most affected (text inputs likely worse
  than bag adds)

**Fix options to evaluate:**
1. Read-only saves: handleSave reads state but doesn't write back any
   state — UI updates happen on next user action or via subscription
   to save completion event
2. Diff-merge on completion: when save returns, compute diff between
   pre-save snapshot and current state; merge save's writes (e.g.,
   bag.id assignment) without overwriting user's mid-flight edits
3. Optimistic locking: track "in-flight save" flag, queue post-save
   state updates only if state hasn't been touched during save

**Priority:** Tier 3 — narrow window (100-300ms), but data-loss-adjacent
and operator-visible. Surfaced during Phase 5/autosave QA on 2026-05-18.

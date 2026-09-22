## Summary

Describe the user-visible or system behavior that changes.

## Ownership

- Backlog or issue ID:
- Primary lane:
- Files intentionally changed:
- Contract or data-shape changes:

## Verification

- [ ] `python3 -m unittest discover -s tests -v`
- [ ] `python3 -m compileall -q bridge server.py tests scripts`
- [ ] JavaScript syntax checks pass
- [ ] `python3 scripts/validate_repo.py`
- [ ] Relevant desktop and mobile behavior was checked
- [ ] No `.env`, runtime JSON, vault content, credentials, or absolute local paths were added

## Handoff

Record dependencies, follow-up work, migration notes, and any behavior another agent must preserve.

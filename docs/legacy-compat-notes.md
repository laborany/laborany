# Legacy Compatibility Notes

This repository now uses a unified `skill` / `composite skill` semantic model.
The old standalone `workflow` concept is no longer used for new product behavior.

## Kept intentionally for compatibility

- `agent-service/src/routes/converse.ts`
  - Legacy action normalization for `navigate_workflow` and `workflowId`.
  - These are mapped to unified capability routing (`skill`) to keep old clients functional.

- `src-api/src/core/database.ts`
  - Legacy workflow-related SQLite tables/indexes are retained.
  - Rationale: avoid migration risk and preserve historical data compatibility.

- `backend/src/core/database.py`
  - Legacy workflow tables are behind `LABORANY_ENABLE_LEGACY_WORKFLOW_TABLES`.
  - Default is disabled (`0`), preserving a clean unified schema for new deployments.
  - Set to `1` only for historical migration/inspection scenarios.

## Removed as dead code in unified model

- `agent-service/src/routes/orchestrate.ts`
- `frontend/src/hooks/useSmartRouter.ts`
- `frontend/src/components/home/chat/NavigatorChat.tsx`
- `backend/src/api/workflow.py`
- `backend/src/services/workflow_client.py`
- package electron resources entry for top-level `workflows/`

## Migration direction

- New features should only introduce `skill` or `composite skill` semantics.
- Do not add new standalone `workflow` endpoints or UI entry points.

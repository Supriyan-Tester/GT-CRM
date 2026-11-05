# Changelog – Phase 3E

- Added dependency-aware `GET /api/ready` while preserving `/api/health` as a liveness endpoint.
- Added attachment archive creation, SHA-256 manifest verification, and isolated local restore tooling.
- Added regression coverage for vehicle documents, product images, customer photos, successful isolated restore, tamper detection, restore gating and traversal rejection.
- Added production-readiness and backup/recovery runbook.

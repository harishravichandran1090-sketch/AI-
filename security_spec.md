# Security Specification — JARVIS Assistant

## 1. Data Invariants
1. Every document under `/users/{userId}/tasks/{taskId}`, `/users/{userId}/messages/{messageId}`, and `/users/{userId}/settings/{settingId}` belongs strictly to the authenticated, email-verified user whose `request.auth.uid == userId`.
2. `userId` and `createdAt` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time`.
3. All document IDs (`userId`, `taskId`, `messageId`, `settingId`) must be `<= 128` characters and match `^[a-zA-Z0-9_\-]+$`.
4. All strings and arrays have strict upper bounds (`title <= 160`, `content <= 12000`, `steps.size() <= 12`, `actions.size() <= 8`).
5. No shadow/ghost fields are allowed (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update).

## 2. The "Dirty Dozen" Adversarial Payloads
1. Unauthenticated read/write to `/users/uid1/tasks/t1` -> `PERMISSION_DENIED`.
2. Unverified email (`email_verified: false`) writing to own `/users/uid1/tasks/t1` -> `PERMISSION_DENIED`.
3. Cross-tenant read/list on `/users/uid2/tasks` by `uid1` -> `PERMISSION_DENIED`.
4. Identity spoofing: `uid1` creating task under `/users/uid1/tasks/t1` with `userId: "uid2"` -> `PERMISSION_DENIED`.
5. Shadow field injection on create (`extraAdminFlag: true`) -> `PERMISSION_DENIED`.
6. Forged client timestamp (`createdAt: "2020-01-01T00:00:00Z"`) -> `PERMISSION_DENIED`.
7. Mutating immutable `createdAt` or `userId` on task update -> `PERMISSION_DENIED`.
8. Resource poisoning: `title` > 160 chars or `taskId` > 128 chars or invalid regex -> `PERMISSION_DENIED`.
9. Unbounded array injection (`steps` with 50 items) -> `PERMISSION_DENIED`.
10. Invalid enum value (`category: "Hack"` or `priority: "critical"`) -> `PERMISSION_DENIED`.
11. Type poisoning on update (`completed: "yes"` instead of boolean) -> `PERMISSION_DENIED`.
12. List query without `userId == request.auth.uid` constraint or accessing unrelated collection `/admin/keys` -> `PERMISSION_DENIED`.

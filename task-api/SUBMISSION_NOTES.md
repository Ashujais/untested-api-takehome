# Submission Notes: The Untested API

## Overview
This document summarizes the testing strategy, bug fixes, feature implementation, and architectural reflections for the Task Manager API take-home assignment.

---

## 1. What I'd Test Next With More Time

1. **Combined Filtering, Searching, and Pagination:**
   - In production APIs, consumers frequently execute queries combining multiple filters and pagination (e.g. `GET /tasks?status=in_progress&priority=high&page=2&limit=10`). While our current routes handle `status` or pagination individually, testing and implementing a unified query pipeline with sorting (e.g., sort by `dueDate` or `createdAt` asc/desc) is a key next step.
2. **Date and Timezone Boundary Testing:**
   - Tasks support ISO 8601 strings for `dueDate`. We should add property-based or fuzz tests around daylight saving transitions, non-UTC offsets (e.g., `+05:30`, `-08:00`), leap seconds, and format variations (date-only `YYYY-MM-DD` vs full timestamp with milliseconds).
3. **Concurrent Request Race Conditions:**
   - Although the service currently uses synchronous in-memory operations, transitioning to asynchronous persistence (or handling parallel async Express handlers) creates potential race conditions. We should test concurrent writes, such as two users attempting to assign or complete the same task simultaneously.
4. **Payload Size and DoS Limits:**
   - Test payload boundary extremes: very large JSON bodies, excessively long strings for `title`, `description`, or `assignee`, and prototype pollution attacks via `__proto__` or `constructor` properties in request bodies.
5. **Contract / OpenAPI Schema Validation Tests:**
   - Establish schema validation tests (e.g. using Jest schema matchers or OpenAPI / Swagger specs) to ensure no regressions in response headers, status codes, and JSON schemas across all endpoints.

---

## 2. What Surprised Me in the Codebase

1. **In-Memory Offset Multiplication Bug:**
   - `getPaginated` used `page * limit`. For a standard 1-based pagination API where default is `page = 1`, this offset multiplied out to `10`, causing page 1 to omit items 0 through 9 entirely.
2. **Silent Priority Corruption in `completeTask`:**
   - The original `completeTask` function contained an explicit `priority: 'medium'` reassignment. Completing an urgent task with `priority: 'high'` would silently degrade its priority to `'medium'` without notifying the client.
3. **Substring Matching in `getByStatus`:**
   - `getByStatus` used `t.status.includes(status)` instead of strict equality. Consequently, querying `?status=do` returned tasks that were both `'todo'` and `'done'`.
4. **README vs Codebase Domain Schema Discrepancy:**
   - `README.md` listed status values as `pending | in-progress | completed`, while `ASSIGNMENT.md`, `src/utils/validators.js`, and `src/services/taskService.js` strictly enforced `todo | in_progress | done`. Clients following the README examples would receive 400 Bad Request errors.
5. **No `GET /tasks/:id` Endpoint:**
   - `taskService.findById` existed in the service layer, but there was no corresponding `GET /tasks/:id` route exposed in `src/routes/tasks.js`. While not required by the API specification table, this is an unusual omission for a standard REST resource.

---

## 3. Questions I'd Ask Before Shipping This to Production

1. **Persistence & Storage Architecture:**
   - What database technology will be used (PostgreSQL, MongoDB, DynamoDB)?
   - How should transactions and connection pooling be configured?
   - How will migrations be handled?
2. **Task Assignment Domain Rules:**
   - Can tasks be unassigned (e.g. `assignee: null` or `DELETE /tasks/:id/assign`)?
   - Is self-assignment restricted, or does assignment require the user to exist in a user management service?
   - Should task reassignment emit notifications or an audit log entry tracking who changed the assignee and when?
3. **Authentication & Authorization (AuthN/AuthZ):**
   - How are users identified (JWT bearer tokens, API keys, session cookies)?
   - Are tasks scoped per tenant or per user, or are all tasks public to all authenticated callers?
   - Can any user mark any task complete, or only the assignee / creator / admin?
4. **Pagination & Query Contract:**
   - What response envelope format does the client expect for paginated lists? In production, APIs typically return pagination metadata:
     ```json
     {
       "data": [...],
       "pagination": { "page": 1, "limit": 10, "total": 45, "totalPages": 5 }
     }
     ```
     Returning raw arrays makes it impossible for clients to calculate total pages without fetching the entire dataset.
5. **Concurrency & Locking:**
   - Should updates use optimistic concurrency control (e.g. an `ETag` header or `version` integer) to prevent lost updates when two callers modify a task simultaneously?
6. **Error Response Standardization:**
   - Should errors follow RFC 7807 (Problem Details for HTTP APIs) or an existing company-wide standard (e.g. `{ error: { code, message, details } }`)?
7. **Observability & Telemetry:**
   - What structured logging (e.g. Pino / Winston) and distributed tracing (OpenTelemetry) should be integrated?
   - What rate limiting (e.g. express-rate-limit) and health check endpoints (`/healthz`, `/ready`) should be deployed?

---

## 4. Key Design Decisions

### A. Test Suite Architecture
- **Layered Testing:**
  - **Unit Tests (`tests/taskService.test.js`):** Test core service functions directly in isolation, asserting business rules, data transformations, calculations, and state resets.
  - **Validator Unit Tests (`tests/validators.test.js`):** Test validation rules and edge cases (missing fields, bad types, whitespace strings, null objects).
  - **API Integration Tests (`tests/tasks.routes.test.js`):** Use `supertest` against the Express `app` to verify HTTP status codes, headers, parameter parsing, route order, and end-to-end request-response cycles.
- **Deterministic Test Isolation:**
  - Every test suite invokes `taskService._reset()` in a `beforeEach` hook.
  - No tests depend on static UUIDs, execution order, or hardcoded timestamps.

### B. Bug Selected for Primary Fix & Focused Fix Approach
- **Primary Fix:** Corrected `getPaginated` in `src/services/taskService.js` to compute `offset = (pageNum - 1) * limit` with `pageNum` clamped to `>= 1`.
- **Secondary Quality Fixes:**
  - Removed `priority: 'medium'` from `completeTask` to prevent data corruption.
  - Replaced `.includes(status)` with exact equality `t.status === status` in `getByStatus`.
  - Protected `id` and `createdAt` from being overwritten during `update`.
  - Guarded validators against `null` or non-object bodies to avoid 500 crashes.
- All fixes were surgical and strictly preserved existing architectural patterns.

### C. Implementation of `PATCH /tasks/:id/assign`
- **Validation Decision:**
  - Added `validateAssignTask` to `src/utils/validators.js`.
  - Enforces that `assignee` is present, is of type `string`, and is non-empty after trimming.
  - Trims leading/trailing whitespace before storing to keep user data clean.
  - Returns HTTP 400 Bad Request with `{ "error": "assignee is required and must be a non-empty string" }` for empty, whitespace-only, non-string, or missing values.
- **Reassignment Decision:**
  - Reassigning an already assigned task is explicitly allowed and replaces the previous `assignee`. In project management workflows, reassigning tasks is a standard operation.
- **Route Placement & Conflict Avoidance:**
  - Placed `PATCH /:id/assign` alongside `PATCH /:id/complete` in `src/routes/tasks.js`. It does not conflict with static routes (`/stats`) or full-resource routes (`PUT /:id`).
  - Returns HTTP 404 with `{ "error": "Task not found" }` if the task does not exist.

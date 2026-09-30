# Bug Report

This document details the bugs identified during code inspection and unit/integration testing of the Task Manager API codebase.

---

## Bug 1 — Off-by-One Pagination Calculation in `taskService.getPaginated`

### Location
`src/services/taskService.js`, `getPaginated` function (lines 11–14).

### Expected behavior
The REST API specifies 1-based page indexing (`GET /tasks?page=1&limit=10`). When requesting page 1, the first page of results (indices 0 to 9) should be returned. The offset calculation for a 1-based page should be `(page - 1) * limit`.

### Actual behavior
The implementation calculates `offset = page * limit`. When `page = 1` and `limit = 10`, `offset` is calculated as `10`, causing the slice to start at index 10 (`tasks.slice(10, 20)`). This completely skips the first page of tasks (items 0 to 9). Furthermore, when `page = 0` or invalid input is converted via `parseInt(page) || 1`, page 0 is unreachable, meaning the first `limit` items could never be retrieved via the paginated endpoint.

### How it was discovered
Discovered via unit test `taskService.test.js` (`getPaginated > returns the first page of tasks for page=1`) and integration test `tasks.routes.test.js` (`GET /tasks?page=...&limit=... > happy path: returns first page with specified limit`). Both tests expected `Task 1` / `Item 1` as the first item on page 1, but received `Task 3` / `Item 4` instead.

### Root cause
The author applied the 0-based offset formula (`page * limit`) directly to a 1-based parameter (`page = 1`), introducing an off-by-one multiplication error.

### Suggested fix
Clamp the page number to at least 1 and subtract 1 before multiplying by the limit:
```javascript
const getPaginated = (page, limit) => {
  const pageNum = Math.max(1, page);
  const offset = (pageNum - 1) * limit;
  return tasks.slice(offset, offset + limit);
};
```

### Fixed?
**Yes.** This was selected as a primary bug fix. The logic was corrected in `src/services/taskService.js`, and comprehensive unit and integration tests now verify proper pagination offsets and boundary conditions.

---

## Bug 2 — Priority Overwritten to `'medium'` in `taskService.completeTask`

### Location
`src/services/taskService.js`, `completeTask` function (lines 67–73).

### Expected behavior
Marking a task as complete (`PATCH /tasks/:id/complete`) should update only the lifecycle fields: change `status` to `'done'` and set `completedAt` to the current timestamp. All other attributes of the task, specifically `priority`, `title`, and `description`, should remain unchanged.

### Actual behavior
`completeTask` explicitly hardcoded `priority: 'medium'` into the updated object:
```javascript
const updated = {
  ...task,
  priority: 'medium',
  status: 'done',
  completedAt: new Date().toISOString(),
};
```
If a task originally had `priority: 'high'` or `priority: 'low'`, calling `/complete` silently mutated its priority to `'medium'`.

### How it was discovered
Discovered via unit test `taskService.test.js` (`completeTask > preserves the task existing priority instead of overwriting it to medium`) and route test `tasks.routes.test.js` (`PATCH /tasks/:id/complete > edge case 2: completing a task preserves unrelated fields such as priority`). Both tests asserted that a task with `priority: 'high'` retained its priority after completion, but received `'medium'`.

### Root cause
An unnecessary property assignment (`priority: 'medium'`) was included in the object spread in `completeTask`.

### Suggested fix
Remove `priority: 'medium'` so that `task.priority` is preserved across the completion lifecycle transition:
```javascript
const updated = {
  ...task,
  status: 'done',
  completedAt: new Date().toISOString(),
};
```

### Fixed?
**Yes.** Fixed in `src/services/taskService.js`. Tests now verify that original priorities are preserved.

---

## Bug 3 — Substring Matching Instead of Exact Match in `taskService.getByStatus`

### Location
`src/services/taskService.js`, `getByStatus` function (line 9).

### Expected behavior
Filtering tasks by status (`GET /tasks?status=<status>`) should perform an exact match against the task's `status` field (`'todo'`, `'in_progress'`, or `'done'`). Querying an invalid or partial status (such as `?status=do` or `?status=o`) should return an empty array if no tasks have that exact status.

### Actual behavior
The implementation uses `tasks.filter((t) => t.status.includes(status))`. Because `String.prototype.includes` checks for substrings:
- A query for `?status=do` matches both `'todo'` (`to-do`) and `'done'`.
- A query for `?status=o` matches all three statuses (`'todo'`, `'in_progress'`, and `'done'`).

### How it was discovered
Discovered via unit test `taskService.test.js` (`getByStatus > does not return tasks matching partial substring`) and route test `tasks.routes.test.js` (`GET /tasks?status=... > edge case 2`). The query `?status=do` was expected to return `[]`, but returned tasks with status `todo` and `done`.

### Root cause
Use of `.includes(status)` rather than strict equality `t.status === status`.

### Suggested fix
Replace substring matching with strict equality:
```javascript
const getByStatus = (status) => tasks.filter((t) => t.status === status);
```

### Fixed?
**Yes.** Fixed in `src/services/taskService.js`. Filtering now requires an exact status match.

---

## Bug 4 — Overwriting Immutable Identifiers (`id`, `createdAt`) in `taskService.update`

### Location
`src/services/taskService.js`, `update` function (lines 46–53).

### Expected behavior
A PUT request (`PUT /tasks/:id`) should update mutable task fields (`title`, `description`, `status`, `priority`, `dueDate`), but the system-generated metadata (`id`, `createdAt`) must remain immutable.

### Actual behavior
`update` performs a shallow merge:
```javascript
const updated = { ...tasks[index], ...fields };
```
If the request body contains `{ "id": "new-id", "createdAt": "1999-01-01" }`, the task's primary key (`id`) and timestamp (`createdAt`) are overwritten. Subsequent requests referencing the original ID fail with a 404, and audit history is corrupted.

### How it was discovered
Discovered during code review and verified by `taskService.test.js` (`update > prevents mutation of id and createdAt during update`).

### Root cause
The update function spreads `fields` directly over the existing task record without safeguarding immutable properties.

### Suggested fix
Explicitly retain the existing `id` and `createdAt` values after spreading `fields`:
```javascript
const current = tasks[index];
const updated = {
  ...current,
  ...fields,
  id: current.id,
  createdAt: current.createdAt,
};
```

### Fixed?
**Yes.** Fixed in `src/services/taskService.js`. Tests verify that `id` and `createdAt` cannot be altered.

---

## Bug 5 — Uncaught `TypeError` on Non-Object or Null Request Body

### Location
`src/utils/validators.js`, `validateCreateTask` and `validateUpdateTask`.

### Expected behavior
If a client sends an empty or invalid request body (e.g. `null` or a non-object with `Content-Type: application/json`), the validator should safely detect the invalid input and return a validation error string, resulting in an HTTP 400 Bad Request response.

### Actual behavior
`validateCreateTask` executes:
```javascript
if (!body.title || typeof body.title !== 'string' || body.title.trim() === '')
```
When `body` is `null` or `undefined`, attempting to access `body.title` throws `TypeError: Cannot read properties of null (reading 'title')`. In Express, this unhandled exception bypasses route handling and triggers the global 500 error handler (`Internal server error`).

### How it was discovered
Discovered during boundary analysis and validator unit testing.

### Root cause
Missing guard condition for `!body || typeof body !== 'object' || Array.isArray(body)`.

### Suggested fix
Add a top-level check in validators:
```javascript
if (!body || typeof body !== 'object' || Array.isArray(body)) {
  return 'request body must be an object';
}
```

### Fixed?
**Yes.** Fixed in `src/utils/validators.js` across `validateCreateTask`, `validateUpdateTask`, and the new `validateAssignTask`.

---

## Bug 6 — Inability to Paginate Filtered Status Results in `GET /tasks`

### Location
`src/routes/tasks.js`, `GET /` route (lines 14–24).

### Expected behavior
As documented in `README.md` (`GET /tasks?status=pending&page=1&limit=10`), clients should be able to filter by status and paginate the filtered results simultaneously.

### Actual behavior
```javascript
if (status) {
  const tasks = taskService.getByStatus(status);
  return res.json(tasks);
}

if (page !== undefined || limit !== undefined) {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  const tasks = taskService.getPaginated(pageNum, limitNum);
  return res.json(tasks);
}
```
If `status` is provided in the query string, the route immediately returns all matching tasks and completely ignores `page` and `limit`.

### How it was discovered
Code inspection of query handling flow in `src/routes/tasks.js`.

### Root cause
Mutually exclusive `if (status)` early return prior to evaluating `page` and `limit`.

### Suggested fix
Compose filtering and pagination so that when both `status` and pagination parameters are provided, pagination is applied to the filtered dataset.

### Fixed?
Documented as an architectural limitation of the current service separation (`getByStatus` vs `getPaginated`). In keeping with the requirement to avoid unnecessary refactoring, this was documented in the bug report and submission notes.

---

## Bug 7 — Documentation Inconsistency Between README.md and Codebase

### Location
`README.md` (lines 62, 77, 96) vs `src/utils/validators.js` and `ASSIGNMENT.md`.

### Description
- `README.md` specifies the status values as: `pending | in-progress | completed`.
- `ASSIGNMENT.md` and the actual codebase (`validators.js`, `taskService.js`) define and validate statuses as: `todo | in_progress | done`.
- If an API consumer follows the `README.md` documentation and sends `status: "pending"`, the request is rejected with `status must be one of: todo, in_progress, done`.

### Suggested fix
Align `README.md` documentation to match the canonical domain model (`todo`, `in_progress`, `done`).

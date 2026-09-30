const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

describe('Task API Routes (Integration Tests)', () => {
  beforeEach(() => {
    taskService._reset();
  });

  describe('GET /tasks', () => {
    it('happy path: returns 200 and all tasks with correct schema', async () => {
      taskService.create({
        title: 'Task A',
        description: 'Desc A',
        status: 'todo',
        priority: 'high',
      });

      const res = await request(app).get('/tasks');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);

      const task = res.body[0];
      expect(task).toMatchObject({
        title: 'Task A',
        description: 'Desc A',
        status: 'todo',
        priority: 'high',
        dueDate: null,
        completedAt: null,
      });
      expect(typeof task.id).toBe('string');
      expect(typeof task.createdAt).toBe('string');
    });

    it('edge case 1: returns empty array when no tasks exist', async () => {
      const res = await request(app).get('/tasks');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('edge case 2: returns multiple tasks preserving list integrity', async () => {
      taskService.create({ title: 'Task 1' });
      taskService.create({ title: 'Task 2' });
      taskService.create({ title: 'Task 3' });

      const res = await request(app).get('/tasks');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body.map((t) => t.title)).toEqual(['Task 1', 'Task 2', 'Task 3']);
    });
  });

  describe('GET /tasks?status=...', () => {
    beforeEach(() => {
      taskService.create({ title: 'Task Todo', status: 'todo' });
      taskService.create({ title: 'Task In Prog', status: 'in_progress' });
      taskService.create({ title: 'Task Done', status: 'done' });
    });

    it('happy path: filters tasks by matching status', async () => {
      const res = await request(app).get('/tasks?status=in_progress');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Task In Prog');
      expect(res.body[0].status).toBe('in_progress');
    });

    it('returns all matching tasks when multiple tasks share the same status', async () => {
      taskService.create({ title: 'Another Todo', status: 'todo' });
      const res = await request(app).get('/tasks?status=todo');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.map((t) => t.title)).toEqual(['Task Todo', 'Another Todo']);
    });

    it('edge case 1: returns empty array when no tasks have matching status', async () => {
      taskService._reset();
      taskService.create({ title: 'Only Todo', status: 'todo' });

      const res = await request(app).get('/tasks?status=done');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('edge case 2: query with non-existent or unusual status returns empty array (exact match)', async () => {
      // 'do' is a substring of both 'todo' and 'done', but exact status 'do' doesn't exist
      const res = await request(app).get('/tasks?status=do');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /tasks?page=...&limit=...', () => {
    beforeEach(() => {
      for (let i = 1; i <= 7; i++) {
        taskService.create({ title: `Item ${i}` });
      }
    });

    it('happy path: returns first page with specified limit', async () => {
      const res = await request(app).get('/tasks?page=1&limit=3');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].title).toBe('Item 1');
      expect(res.body[1].title).toBe('Item 2');
      expect(res.body[2].title).toBe('Item 3');
    });

    it('edge case 1: returns second page with proper offset', async () => {
      const res = await request(app).get('/tasks?page=2&limit=3');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].title).toBe('Item 4');
      expect(res.body[1].title).toBe('Item 5');
      expect(res.body[2].title).toBe('Item 6');
    });

    it('edge case 2: returns empty array when page index exceeds total records', async () => {
      const res = await request(app).get('/tasks?page=10&limit=3');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('edge case 3: falls back to defaults (page=1, limit=10) when invalid numbers provided', async () => {
      const res = await request(app).get('/tasks?page=abc&limit=xyz');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(7);
      expect(res.body[0].title).toBe('Item 1');
    });
  });

  describe('POST /tasks', () => {
    it('happy path: creates a valid task with all fields and returns 201', async () => {
      const payload = {
        title: 'Buy Groceries',
        description: 'Milk, eggs, bread',
        status: 'todo',
        priority: 'high',
        dueDate: '2026-11-01T00:00:00.000Z',
      };

      const res = await request(app).post('/tasks').send(payload);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject(payload);
      expect(res.body.id).toBeDefined();
      expect(res.body.completedAt).toBeNull();
      expect(res.body.createdAt).toBeDefined();
    });

    it('happy path with defaults: applies default values when optional fields omitted', async () => {
      const res = await request(app).post('/tasks').send({ title: 'Simple Task' });
      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Simple Task');
      expect(res.body.description).toBe('');
      expect(res.body.status).toBe('todo');
      expect(res.body.priority).toBe('medium');
      expect(res.body.dueDate).toBeNull();
    });

    it('edge case 1: returns 400 when title is missing', async () => {
      const res = await request(app).post('/tasks').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title is required/i);
    });

    it('edge case 2: returns 400 when title is empty or whitespace-only', async () => {
      const resEmpty = await request(app).post('/tasks').send({ title: '' });
      expect(resEmpty.status).toBe(400);

      const resWhitespace = await request(app).post('/tasks').send({ title: '   ' });
      expect(resWhitespace.status).toBe(400);
    });

    it('edge case 3: returns 400 when status is invalid', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Task', status: 'not-valid' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/status must be one of/i);
    });

    it('edge case 4: returns 400 when priority is invalid', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Task', priority: 'extreme' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/priority must be one of/i);
    });

    it('edge case 5: returns 400 when dueDate is not a valid date string', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Task', dueDate: 'not-a-valid-date' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dueDate must be a valid ISO date string/i);
    });
  });

  describe('PUT /tasks/:id', () => {
    it('happy path: updates existing task and returns 200', async () => {
      const created = taskService.create({
        title: 'Initial Title',
        description: 'Initial Desc',
        status: 'todo',
        priority: 'low',
      });

      const updatePayload = {
        title: 'Updated Title',
        status: 'in_progress',
        priority: 'high',
      };

      const res = await request(app).put(`/tasks/${created.id}`).send(updatePayload);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.id);
      expect(res.body.title).toBe('Updated Title');
      expect(res.body.status).toBe('in_progress');
      expect(res.body.priority).toBe('high');
      expect(res.body.description).toBe('Initial Desc');
    });

    it('edge case 1: returns 404 when updating non-existent task', async () => {
      const res = await request(app)
        .put('/tasks/non-existent-id')
        .send({ title: 'New Title' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });

    it('edge case 2: returns 400 when updated title is empty string', async () => {
      const created = taskService.create({ title: 'Old Title' });
      const res = await request(app).put(`/tasks/${created.id}`).send({ title: '' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title must be a non-empty string/i);
    });

    it('edge case 3: returns 400 when updated status or priority is invalid', async () => {
      const created = taskService.create({ title: 'Title' });

      const resStatus = await request(app)
        .put(`/tasks/${created.id}`)
        .send({ status: 'invalid' });
      expect(resStatus.status).toBe(400);

      const resPriority = await request(app)
        .put(`/tasks/${created.id}`)
        .send({ priority: 'invalid' });
      expect(resPriority.status).toBe(400);
    });

    it('edge case 4: returns 400 when updated dueDate is invalid date string', async () => {
      const created = taskService.create({ title: 'Title' });
      const res = await request(app)
        .put(`/tasks/${created.id}`)
        .send({ dueDate: 'bad-date' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dueDate must be a valid ISO date string/i);
    });

    it('edge case 5: returns 400 when body is an array instead of object', async () => {
      const created = taskService.create({ title: 'Title' });
      const res = await request(app)
        .put(`/tasks/${created.id}`)
        .send([1, 2, 3]);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/request body must be an object/i);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('happy path: deletes an existing task and returns 204 with no content', async () => {
      const created = taskService.create({ title: 'To Delete' });

      const res = await request(app).delete(`/tasks/${created.id}`);
      expect(res.status).toBe(204);
      expect(res.body).toEqual({});

      // Verify task is actually removed
      expect(taskService.findById(created.id)).toBeUndefined();
    });

    it('edge case 1: returns 404 when task does not exist', async () => {
      const res = await request(app).delete('/tasks/non-existent-uuid');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });

    it('edge case 2: repeated deletion returns 404 on second attempt', async () => {
      const created = taskService.create({ title: 'Delete Once' });

      const firstRes = await request(app).delete(`/tasks/${created.id}`);
      expect(firstRes.status).toBe(204);

      const secondRes = await request(app).delete(`/tasks/${created.id}`);
      expect(secondRes.status).toBe(404);
    });
  });

  describe('PATCH /tasks/:id/complete', () => {
    it('happy path: marks task as complete and returns 200 with completedAt set', async () => {
      const created = taskService.create({ title: 'Complete Me', status: 'todo' });

      const res = await request(app).patch(`/tasks/${created.id}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
      expect(res.body.completedAt).toBeDefined();
      expect(new Date(res.body.completedAt).getTime()).not.toBeNaN();
    });

    it('edge case 1: returns 404 when completing non-existent task', async () => {
      const res = await request(app).patch('/tasks/non-existent-id/complete');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });

    it('edge case 2: completing a task preserves unrelated fields such as priority', async () => {
      const created = taskService.create({
        title: 'Critical Task',
        priority: 'high',
        status: 'in_progress',
      });

      const res = await request(app).patch(`/tasks/${created.id}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
      expect(res.body.priority).toBe('high'); // Should NOT be mutated to medium
    });

    it('edge case 3: completing an already completed task returns 200 with done status', async () => {
      const created = taskService.create({ title: 'Already Done' });
      await request(app).patch(`/tasks/${created.id}/complete`);

      const res = await request(app).patch(`/tasks/${created.id}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('happy path: assigns a user to an existing task and returns 200 with updated task', async () => {
      const created = taskService.create({ title: 'Task to Assign' });

      const res = await request(app)
        .patch(`/tasks/${created.id}/assign`)
        .send({ assignee: 'John Doe' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.id);
      expect(res.body.assignee).toBe('John Doe');
      expect(res.body.title).toBe('Task to Assign');

      // Verify persistence in data store
      const stored = taskService.findById(created.id);
      expect(stored.assignee).toBe('John Doe');
    });

    it('happy path: reassigns an already assigned task to a new user', async () => {
      const created = taskService.create({ title: 'Shared Task' });
      await request(app)
        .patch(`/tasks/${created.id}/assign`)
        .send({ assignee: 'Alice' });

      const res = await request(app)
        .patch(`/tasks/${created.id}/assign`)
        .send({ assignee: 'Bob' });

      expect(res.status).toBe(200);
      expect(res.body.assignee).toBe('Bob');
      expect(taskService.findById(created.id).assignee).toBe('Bob');
    });

    it('edge case 1: returns 404 when assigning a non-existent task', async () => {
      const res = await request(app)
        .patch('/tasks/non-existent-id/assign')
        .send({ assignee: 'John' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });

    it('edge case 2: returns 400 when assignee is missing from body', async () => {
      const created = taskService.create({ title: 'Task' });
      const res = await request(app)
        .patch(`/tasks/${created.id}/assign`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/assignee is required/i);
    });

    it('edge case 3: returns 400 when assignee is empty string or whitespace-only', async () => {
      const created = taskService.create({ title: 'Task' });

      const emptyRes = await request(app)
        .patch(`/tasks/${created.id}/assign`)
        .send({ assignee: '' });
      expect(emptyRes.status).toBe(400);
      expect(emptyRes.body.error).toMatch(/assignee is required/i);

      const whitespaceRes = await request(app)
        .patch(`/tasks/${created.id}/assign`)
        .send({ assignee: '     ' });
      expect(whitespaceRes.status).toBe(400);
      expect(whitespaceRes.body.error).toMatch(/assignee is required/i);
    });

    it('edge case 4: returns 400 when assignee is not a string (number, null, boolean)', async () => {
      const created = taskService.create({ title: 'Task' });

      const numRes = await request(app)
        .patch(`/tasks/${created.id}/assign`)
        .send({ assignee: 123 });
      expect(numRes.status).toBe(400);

      const nullRes = await request(app)
        .patch(`/tasks/${created.id}/assign`)
        .send({ assignee: null });
      expect(nullRes.status).toBe(400);
    });
  });

  describe('GET /tasks/stats', () => {
    it('happy path: returns counts for all statuses and overdue count', async () => {
      taskService.create({ title: 'T1', status: 'todo' });
      taskService.create({ title: 'T2', status: 'in_progress' });
      taskService.create({ title: 'T3', status: 'done' });

      const res = await request(app).get('/tasks/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        todo: 1,
        in_progress: 1,
        done: 1,
        overdue: 0,
      });
    });

    it('edge case 1: returns zero counts when database is empty', async () => {
      const res = await request(app).get('/tasks/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        todo: 0,
        in_progress: 0,
        done: 0,
        overdue: 0,
      });
    });

    it('edge case 2: accurately reflects overdue tasks and ignores past dueDate for done tasks', async () => {
      const past = new Date(Date.now() - 3600000).toISOString();
      const future = new Date(Date.now() + 3600000).toISOString();

      taskService.create({ title: 'Overdue Todo', status: 'todo', dueDate: past });
      taskService.create({ title: 'Done in Past', status: 'done', dueDate: past });
      taskService.create({ title: 'Future Task', status: 'todo', dueDate: future });

      const res = await request(app).get('/tasks/stats');
      expect(res.status).toBe(200);
      expect(res.body.overdue).toBe(1);
      expect(res.body.todo).toBe(2);
      expect(res.body.done).toBe(1);
    });
  });

  describe('Global Error Handler', () => {
    it('returns 500 when JSON body is malformed', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const res = await request(app)
        .post('/tasks')
        .set('Content-Type', 'application/json')
        .send('{"title": "broken');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      consoleSpy.mockRestore();
    });
  });
});

const taskService = require('../src/services/taskService');

describe('taskService', () => {
  beforeEach(() => {
    taskService._reset();
  });

  describe('create and getAll', () => {
    it('creates a task with provided values and defaults', () => {
      const task = taskService.create({ title: 'Test Task' });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(typeof task.id).toBe('string');
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('');
      expect(task.status).toBe('todo');
      expect(task.priority).toBe('medium');
      expect(task.dueDate).toBeNull();
      expect(task.completedAt).toBeNull();
      expect(task.createdAt).toBeDefined();
      expect(new Date(task.createdAt).getTime()).not.toBeNaN();
    });

    it('creates a task with explicit optional values', () => {
      const dueDate = '2026-10-15T12:00:00.000Z';
      const task = taskService.create({
        title: 'Full Task',
        description: 'Detailed description',
        status: 'in_progress',
        priority: 'high',
        dueDate,
      });

      expect(task.title).toBe('Full Task');
      expect(task.description).toBe('Detailed description');
      expect(task.status).toBe('in_progress');
      expect(task.priority).toBe('high');
      expect(task.dueDate).toBe(dueDate);
    });

    it('returns an empty array when no tasks have been created', () => {
      expect(taskService.getAll()).toEqual([]);
    });

    it('returns a shallow copy of tasks so modifying returned array does not corrupt store', () => {
      taskService.create({ title: 'Task 1' });
      const list = taskService.getAll();
      list.pop();
      expect(taskService.getAll()).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('returns the matching task by id', () => {
      const created = taskService.create({ title: 'Find Me' });
      const found = taskService.findById(created.id);
      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.title).toBe('Find Me');
    });

    it('returns undefined when id does not exist', () => {
      const found = taskService.findById('non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('getByStatus', () => {
    it('filters tasks by exact matching status', () => {
      taskService.create({ title: 'Task 1', status: 'todo' });
      taskService.create({ title: 'Task 2', status: 'in_progress' });
      taskService.create({ title: 'Task 3', status: 'done' });

      const todoTasks = taskService.getByStatus('todo');
      expect(todoTasks).toHaveLength(1);
      expect(todoTasks[0].title).toBe('Task 1');
      expect(todoTasks[0].status).toBe('todo');

      const inProgressTasks = taskService.getByStatus('in_progress');
      expect(inProgressTasks).toHaveLength(1);
      expect(inProgressTasks[0].title).toBe('Task 2');

      const doneTasks = taskService.getByStatus('done');
      expect(doneTasks).toHaveLength(1);
      expect(doneTasks[0].title).toBe('Task 3');
    });

    it('returns empty array when no tasks match the status', () => {
      taskService.create({ title: 'Task 1', status: 'todo' });
      const result = taskService.getByStatus('done');
      expect(result).toEqual([]);
    });

    it('does not return tasks matching partial substring', () => {
      taskService.create({ title: 'Todo Task', status: 'todo' });
      taskService.create({ title: 'Done Task', status: 'done' });

      // Substring 'do' exists in both 'todo' and 'done'
      // Exact matching must return 0 results
      const results = taskService.getByStatus('do');
      expect(results).toHaveLength(0);
    });
  });

  describe('getPaginated', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        taskService.create({ title: `Task ${i}` });
      }
    });

    it('returns the first page of tasks for page=1', () => {
      const page1 = taskService.getPaginated(1, 2);
      expect(page1).toHaveLength(2);
      expect(page1[0].title).toBe('Task 1');
      expect(page1[1].title).toBe('Task 2');
    });

    it('returns the second page of tasks for page=2', () => {
      const page2 = taskService.getPaginated(2, 2);
      expect(page2).toHaveLength(2);
      expect(page2[0].title).toBe('Task 3');
      expect(page2[1].title).toBe('Task 4');
    });

    it('returns remaining tasks on the last page', () => {
      const page3 = taskService.getPaginated(3, 2);
      expect(page3).toHaveLength(1);
      expect(page3[0].title).toBe('Task 5');
    });

    it('returns empty array when requested page exceeds available items', () => {
      const page4 = taskService.getPaginated(4, 2);
      expect(page4).toEqual([]);
    });

    it('clamps negative or zero page to 1', () => {
      const pageZero = taskService.getPaginated(0, 2);
      expect(pageZero).toHaveLength(2);
      expect(pageZero[0].title).toBe('Task 1');

      const pageNegative = taskService.getPaginated(-5, 2);
      expect(pageNegative).toHaveLength(2);
      expect(pageNegative[0].title).toBe('Task 1');
    });
  });

  describe('getStats', () => {
    it('returns zero counts when store is empty', () => {
      const stats = taskService.getStats();
      expect(stats).toEqual({
        todo: 0,
        in_progress: 0,
        done: 0,
        overdue: 0,
      });
    });

    it('correctly aggregates counts by status', () => {
      taskService.create({ title: 'T1', status: 'todo' });
      taskService.create({ title: 'T2', status: 'todo' });
      taskService.create({ title: 'T3', status: 'in_progress' });
      taskService.create({ title: 'T4', status: 'done' });

      const stats = taskService.getStats();
      expect(stats.todo).toBe(2);
      expect(stats.in_progress).toBe(1);
      expect(stats.done).toBe(1);
      expect(stats.overdue).toBe(0);
    });

    it('counts overdue tasks that are not done and have past due date', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const futureDate = new Date(Date.now() + 86400000).toISOString();

      // Overdue: status 'todo', past dueDate
      taskService.create({ title: 'Overdue Todo', status: 'todo', dueDate: pastDate });
      // Overdue: status 'in_progress', past dueDate
      taskService.create({ title: 'Overdue In Progress', status: 'in_progress', dueDate: pastDate });
      // NOT overdue: status 'done', past dueDate
      taskService.create({ title: 'Done with past date', status: 'done', dueDate: pastDate });
      // NOT overdue: future dueDate
      taskService.create({ title: 'Future task', status: 'todo', dueDate: futureDate });
      // NOT overdue: null dueDate
      taskService.create({ title: 'No due date', status: 'todo', dueDate: null });

      const stats = taskService.getStats();
      expect(stats.overdue).toBe(2);
      expect(stats.todo).toBe(3);
      expect(stats.in_progress).toBe(1);
      expect(stats.done).toBe(1);
    });

    it('ignores unknown statuses in status counts', () => {
      taskService.create({ title: 'Unknown', status: 'archived' });
      const stats = taskService.getStats();
      expect(stats).toEqual({
        todo: 0,
        in_progress: 0,
        done: 0,
        overdue: 0,
      });
    });
  });

  describe('update', () => {
    it('updates specified fields of an existing task', () => {
      const task = taskService.create({ title: 'Original', description: 'Desc' });
      const updated = taskService.update(task.id, {
        title: 'Updated Title',
        priority: 'high',
      });

      expect(updated).toBeDefined();
      expect(updated.title).toBe('Updated Title');
      expect(updated.priority).toBe('high');
      expect(updated.description).toBe('Desc'); // preserved
      expect(updated.id).toBe(task.id);
    });

    it('prevents mutation of id and createdAt during update', () => {
      const task = taskService.create({ title: 'Original' });
      const originalCreatedAt = task.createdAt;

      const updated = taskService.update(task.id, {
        id: 'tampered-id',
        createdAt: '1999-01-01T00:00:00.000Z',
        title: 'Safe Update',
      });

      expect(updated.id).toBe(task.id);
      expect(updated.createdAt).toBe(originalCreatedAt);
      expect(updated.title).toBe('Safe Update');
    });

    it('returns null when updating nonexistent task', () => {
      const result = taskService.update('unknown-id', { title: 'New' });
      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('removes an existing task and returns true', () => {
      const task = taskService.create({ title: 'Delete me' });
      const removed = taskService.remove(task.id);

      expect(removed).toBe(true);
      expect(taskService.findById(task.id)).toBeUndefined();
      expect(taskService.getAll()).toHaveLength(0);
    });

    it('returns false when task id does not exist', () => {
      const removed = taskService.remove('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('completeTask', () => {
    it('marks a task as done and sets completedAt timestamp', () => {
      const task = taskService.create({ title: 'Complete me' });
      const completed = taskService.completeTask(task.id);

      expect(completed).toBeDefined();
      expect(completed.status).toBe('done');
      expect(completed.completedAt).toBeDefined();
      expect(new Date(completed.completedAt).getTime()).not.toBeNaN();
    });

    it('preserves the task existing priority instead of overwriting it to medium', () => {
      const highTask = taskService.create({ title: 'High Priority', priority: 'high' });
      const completed = taskService.completeTask(highTask.id);

      expect(completed.priority).toBe('high');
    });

    it('returns null when task id does not exist', () => {
      const result = taskService.completeTask('unknown-id');
      expect(result).toBeNull();
    });
  });

  describe('assignTask', () => {
    it('assigns an assignee to a task and returns the updated task', () => {
      const task = taskService.create({ title: 'Assign Me' });
      const updated = taskService.assignTask(task.id, 'Alice');

      expect(updated).toBeDefined();
      expect(updated.id).toBe(task.id);
      expect(updated.assignee).toBe('Alice');
      expect(taskService.findById(task.id).assignee).toBe('Alice');
    });

    it('supports reassigning a task to a different user', () => {
      const task = taskService.create({ title: 'Reassign Me' });
      taskService.assignTask(task.id, 'Alice');

      const reassigned = taskService.assignTask(task.id, 'Bob');
      expect(reassigned.assignee).toBe('Bob');
      expect(taskService.findById(task.id).assignee).toBe('Bob');
    });

    it('returns null when assigning a nonexistent task', () => {
      const result = taskService.assignTask('unknown-id', 'Alice');
      expect(result).toBeNull();
    });
  });

  describe('_reset', () => {
    it('clears all tasks from store', () => {
      taskService.create({ title: 'T1' });
      taskService.create({ title: 'T2' });
      expect(taskService.getAll()).toHaveLength(2);

      taskService._reset();
      expect(taskService.getAll()).toHaveLength(0);
    });
  });
});

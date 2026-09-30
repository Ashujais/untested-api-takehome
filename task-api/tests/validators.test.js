const { validateCreateTask, validateUpdateTask, validateAssignTask } = require('../src/utils/validators');

describe('validators', () => {
  describe('validateCreateTask', () => {
    it('returns null for a valid task with all fields', () => {
      const result = validateCreateTask({
        title: 'Valid Task',
        description: 'A description',
        status: 'todo',
        priority: 'high',
        dueDate: '2026-12-31T23:59:59.000Z',
      });
      expect(result).toBeNull();
    });

    it('returns null when optional fields are omitted', () => {
      const result = validateCreateTask({
        title: 'Only Title',
      });
      expect(result).toBeNull();
    });

    it('rejects null or non-object body', () => {
      expect(validateCreateTask(null)).toBe('request body must be an object');
      expect(validateCreateTask('string')).toBe('request body must be an object');
      expect(validateCreateTask([1, 2])).toBe('request body must be an object');
    });

    it('rejects missing title', () => {
      const result = validateCreateTask({});
      expect(result).toBe('title is required and must be a non-empty string');
    });

    it('rejects empty string title', () => {
      const result = validateCreateTask({ title: '' });
      expect(result).toBe('title is required and must be a non-empty string');
    });

    it('rejects whitespace-only title', () => {
      const result = validateCreateTask({ title: '   ' });
      expect(result).toBe('title is required and must be a non-empty string');
    });

    it('rejects non-string title', () => {
      const result = validateCreateTask({ title: 12345 });
      expect(result).toBe('title is required and must be a non-empty string');
    });

    it('rejects invalid status', () => {
      const result = validateCreateTask({ title: 'Task', status: 'invalid_status' });
      expect(result).toBe('status must be one of: todo, in_progress, done');
    });

    it('rejects invalid priority', () => {
      const result = validateCreateTask({ title: 'Task', priority: 'urgent' });
      expect(result).toBe('priority must be one of: low, medium, high');
    });

    it('rejects invalid dueDate string', () => {
      const result = validateCreateTask({ title: 'Task', dueDate: 'not-a-date' });
      expect(result).toBe('dueDate must be a valid ISO date string');
    });
  });

  describe('validateUpdateTask', () => {
    it('returns null for valid partial updates', () => {
      expect(validateUpdateTask({ title: 'New Title' })).toBeNull();
      expect(validateUpdateTask({ status: 'done' })).toBeNull();
      expect(validateUpdateTask({ priority: 'low' })).toBeNull();
      expect(validateUpdateTask({ dueDate: '2026-12-31T00:00:00.000Z' })).toBeNull();
      expect(validateUpdateTask({})).toBeNull();
    });

    it('rejects null or non-object body', () => {
      expect(validateUpdateTask(null)).toBe('request body must be an object');
      expect(validateUpdateTask(undefined)).toBe('request body must be an object');
    });

    it('rejects empty string title in update', () => {
      const result = validateUpdateTask({ title: '' });
      expect(result).toBe('title must be a non-empty string');
    });

    it('rejects whitespace-only title in update', () => {
      const result = validateUpdateTask({ title: '   ' });
      expect(result).toBe('title must be a non-empty string');
    });

    it('rejects non-string title in update', () => {
      const result = validateUpdateTask({ title: 999 });
      expect(result).toBe('title must be a non-empty string');
    });

    it('rejects invalid status in update', () => {
      const result = validateUpdateTask({ status: 'archived' });
      expect(result).toBe('status must be one of: todo, in_progress, done');
    });

    it('rejects invalid priority in update', () => {
      const result = validateUpdateTask({ priority: 'critical' });
      expect(result).toBe('priority must be one of: low, medium, high');
    });

    it('rejects invalid dueDate in update', () => {
      const result = validateUpdateTask({ dueDate: 'yesterday' });
      expect(result).toBe('dueDate must be a valid ISO date string');
    });
  });

  describe('validateAssignTask', () => {
    it('returns null for valid string assignee', () => {
      expect(validateAssignTask({ assignee: 'Alice' })).toBeNull();
      expect(validateAssignTask({ assignee: 'Bob Smith' })).toBeNull();
    });

    it('rejects non-object or null request body', () => {
      expect(validateAssignTask(null)).toBe('request body must be an object');
      expect(validateAssignTask(123)).toBe('request body must be an object');
    });

    it('rejects missing assignee property', () => {
      expect(validateAssignTask({})).toBe('assignee is required and must be a non-empty string');
    });

    it('rejects empty string assignee', () => {
      expect(validateAssignTask({ assignee: '' })).toBe('assignee is required and must be a non-empty string');
    });

    it('rejects whitespace-only assignee', () => {
      expect(validateAssignTask({ assignee: '   ' })).toBe('assignee is required and must be a non-empty string');
    });

    it('rejects non-string assignee', () => {
      expect(validateAssignTask({ assignee: 123 })).toBe('assignee is required and must be a non-empty string');
      expect(validateAssignTask({ assignee: null })).toBe('assignee is required and must be a non-empty string');
      expect(validateAssignTask({ assignee: true })).toBe('assignee is required and must be a non-empty string');
      expect(validateAssignTask({ assignee: {} })).toBe('assignee is required and must be a non-empty string');
    });
  });
});

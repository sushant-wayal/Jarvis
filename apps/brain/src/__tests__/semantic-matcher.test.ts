import { describe, it, expect } from 'vitest';
import { semanticMatcher } from '../modules/brain/semantic-matcher';

describe('SemanticMatcher Module', () => {
  it('matches direct exact title fast', async () => {
    const tasks = [
      { id: 't1', title: 'Buy groceries' },
      { id: 't2', title: 'Call accountant' },
    ];

    const result = await semanticMatcher.matchItem(
      'Buy groceries',
      tasks,
      (t) => t.title,
      (t) => t.id
    );

    expect(result.status).toBe('EXACT_MATCH');
    expect(result.matchedItem?.id).toBe('t1');
  });

  it('matches semantic equivalent phrases using LLM', async () => {
    const tasks = [
      { id: 't1', title: 'Workout at Gold Gym' },
      { id: 't2', title: 'Submit quarterly tax report' },
      { id: 't3', title: 'Water the plants' },
    ];

    const result = await semanticMatcher.matchItem(
      'finish my gym session',
      tasks,
      (t) => t.title,
      (t) => t.id,
      'task'
    );

    expect(result.matchedItem?.id).toBe('t1');
  });

  it('detects ambiguity and avoids false matches when multiple items share keywords', async () => {
    const tasks = [
      { id: 't1', title: 'Buy birthday gift for mom' },
      { id: 't2', title: 'Call mom regarding dinner plans' },
    ];

    const result = await semanticMatcher.matchItem(
      'mom',
      tasks,
      (t) => t.title,
      (t) => t.id,
      'task'
    );

    // Because user only said "mom", picking one randomly would be dangerous
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.matchedItem).toBeNull();
  });

  it('differentiates user residency from relative birthplace in memory matching', async () => {
    const memories = [
      { id: 'm1', content: "Mother was born and raised in Mumbai" },
      { id: 'm2', content: "User lived in Mumbai during 2020" },
    ];

    const result = await semanticMatcher.matchItem(
      'forget that I lived in Mumbai',
      memories,
      (m) => m.content,
      (m) => m.id,
      'memory'
    );

    expect(result.matchedItem?.id).toBe('m2');
  });
});

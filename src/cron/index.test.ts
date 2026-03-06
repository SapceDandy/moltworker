import { describe, it, expect, vi, beforeEach } from 'vitest';
import { suppressConsole } from '../test-utils';

// Mock all cron handlers
vi.mock('./keep-warm', () => ({ keepWarm: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./morning-brief', () => ({ morningBrief: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./evening-recap', () => ({ eveningRecap: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./weekly-review', () => ({ weeklyReview: vi.fn().mockResolvedValue(undefined) }));

import { handleScheduled } from './index';
import { keepWarm } from './keep-warm';
import { morningBrief } from './morning-brief';
import { eveningRecap } from './evening-recap';
import { weeklyReview } from './weekly-review';
import type { MoltbotEnv } from '../types';

function makeEvent(cron: string): ScheduledEvent {
  return {
    cron,
    scheduledTime: Date.now(),
    type: 'scheduled',
    noRetry: vi.fn(),
  } as unknown as ScheduledEvent;
}

const mockEnv = {} as MoltbotEnv;

describe('handleScheduled', () => {
  beforeEach(() => {
    suppressConsole();
    vi.clearAllMocks();
  });

  it('dispatches keep-warm cron', async () => {
    await handleScheduled(makeEvent('*/5 * * * *'), mockEnv);
    expect(keepWarm).toHaveBeenCalledWith(mockEnv);
    expect(morningBrief).not.toHaveBeenCalled();
  });

  it('dispatches morning brief cron', async () => {
    await handleScheduled(makeEvent('0 13 * * 1-5'), mockEnv);
    expect(morningBrief).toHaveBeenCalledWith(mockEnv);
    expect(keepWarm).not.toHaveBeenCalled();
  });

  it('dispatches evening recap cron', async () => {
    await handleScheduled(makeEvent('0 23 * * 1-5'), mockEnv);
    expect(eveningRecap).toHaveBeenCalledWith(mockEnv);
  });

  it('dispatches weekly review cron', async () => {
    await handleScheduled(makeEvent('0 23 * * 7'), mockEnv);
    expect(weeklyReview).toHaveBeenCalledWith(mockEnv);
  });

  it('handles unknown cron expression gracefully', async () => {
    await handleScheduled(makeEvent('0 0 * * *'), mockEnv);
    expect(keepWarm).not.toHaveBeenCalled();
    expect(morningBrief).not.toHaveBeenCalled();
    expect(eveningRecap).not.toHaveBeenCalled();
    expect(weeklyReview).not.toHaveBeenCalled();
  });
});

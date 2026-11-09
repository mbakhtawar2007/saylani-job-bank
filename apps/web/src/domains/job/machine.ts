import { JOB_STATUSES, type JobStatus, type Role } from '@jobbank/shared';
import { defineMachine } from '@/domains/shared/state-machine';

export const jobMachine = defineMachine<JobStatus, string, Record<never, never>, Role>({
  name: 'job',
  states: JOB_STATUSES,
  // C3/H19 (2026-11-08): FILLED is no longer terminal — a declined offer
  // frees the vacancy (UNFILL below), so a job whose last vacancy frees
  // re-opens. EXPIRED stays terminal: nothing re-opens an expired job.
  // allowedTransitions() still offers employers nothing on FILLED; UNFILL
  // is a system event fired only by the offer-decline path, never by UI.
  terminal: ['EXPIRED'],
  transitions: [
    { from: 'DRAFT', event: 'PUBLISH', to: 'OPEN', actors: ['EMPLOYER'] },
    { from: 'OPEN', event: 'PAUSE', to: 'PAUSED', actors: ['EMPLOYER'] },
    { from: ['OPEN', 'PAUSED'], event: 'CLOSE', to: 'CLOSED', actors: ['EMPLOYER'] },
    // H16: staff-side close. The employer's CLOSE is EMPLOYER-only, so a
    // separate event is needed — Branch Admin, Super Admin and Verifier
    // close through forceCloseJob, which adds the city-scope check.
    {
      from: ['OPEN', 'PAUSED'],
      event: 'FORCE_CLOSE',
      to: 'CLOSED',
      actors: ['BRANCH_ADMIN', 'SUPER_ADMIN', 'VERIFIER'],
    },
    { from: 'PAUSED', event: 'RESUME', to: 'OPEN', actors: ['EMPLOYER'] },
    { from: 'CLOSED', event: 'REOPEN', to: 'OPEN', actors: ['EMPLOYER'] },
    // System events (filled by matching, expired by scheduler)
    { from: 'OPEN', event: 'FILL', to: 'FILLED' },
    // C3: a declined offer frees the vacancy; a FILLED job whose vacancy
    // frees re-opens (closedAt is cleared by the caller).
    { from: 'FILLED', event: 'UNFILL', to: 'OPEN' },
    { from: ['OPEN', 'PAUSED'], event: 'EXPIRE', to: 'EXPIRED' },
  ],
});

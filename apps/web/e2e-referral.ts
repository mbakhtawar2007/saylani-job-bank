import { randomInt, randomUUID } from 'node:crypto';
import postgres from 'postgres';

/** The candidate's real name. Ported from Najam: this repo's employer view shows
 * referred candidates in full (2026-11-10 rule), so the name is visible, not hidden. */
export const REFERRED_CANDIDATE_NAME = 'Hidden Referred Candidate';

/** Creates a candidate and refers them to a job, as Job Bank staff would, for the browser tests. */
export async function referNewCandidate(jobId: string): Promise<string> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const userId = randomUUID();
    await sql`
      INSERT INTO users (id, name, email, email_verified)
      VALUES (${userId}, ${REFERRED_CANDIDATE_NAME}, ${`referred-${userId}@jobbank.local`}, true)`;
    const [row] = await sql<{ id: string }[]>`
      WITH new_applicant AS (
        INSERT INTO applicants
          (user_id, branch_id, registration_source, registration_reference,
           full_name, father_name, cnic, date_of_birth, gender, status,
           profile_completeness)
        SELECT ${userId}, j.branch_id, 'SELF_SERVICE', ${`SJB-TEST-${randomUUID()}`},
               ${REFERRED_CANDIDATE_NAME}, 'Father',
               ${`7${randomInt(1e11, 9e11)}`}, '1995-05-05', 'MALE', 'ACTIVE', 100
        FROM jobs j WHERE j.id = ${jobId}
        RETURNING id
      )
      INSERT INTO applications (applicant_id, job_id, branch_id, created_by, status)
      SELECT a.id, j.id, j.branch_id, j.created_by, 'FORWARDED'
      FROM new_applicant a CROSS JOIN jobs j
      WHERE j.id = ${jobId}
      RETURNING id`;
    return row!.id;
  } finally {
    await sql.end();
  }
}

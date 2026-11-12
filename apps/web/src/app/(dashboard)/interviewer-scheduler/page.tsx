import { redirect } from 'next/navigation';

/** The interviews list is this role's landing view. */
export default function InterviewerSchedulerHomePage() {
  redirect('/interviewer-scheduler/interviews');
}

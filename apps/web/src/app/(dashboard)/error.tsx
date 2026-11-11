'use client';

import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/atoms';
import { EmptyState } from '@/components/molecules';
import NextLink from 'next/link';

/**
 * Audit 2026-11-11 (M-29): the dashboard had no error boundary, so a
 * domain error thrown by a page (e.g. ScopeViolationError opening a
 * cross-city job URL) rendered Next.js's default error screen. This
 * boundary catches it and shows the same EmptyState language as the
 * 404/forbidden pages, with a retry.
 */
export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page-gutter flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        description="This page couldn't be loaded. Try again, or go back to your dashboard."
        action={
          <div className="flex gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <Button asChild variant="outline">
              <NextLink href="/">Go to the home page</NextLink>
            </Button>
          </div>
        }
      />
    </main>
  );
}

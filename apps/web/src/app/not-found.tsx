import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/atoms';
import { EmptyState } from '@/components/molecules';
import NextLink from 'next/link';

export const metadata = { title: 'Page not found' };

/** F5: root 404 page for unknown (non-API) paths. */
export default function NotFoundPage() {
  return (
    <main className="page-gutter flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={FileQuestion}
        title="This page doesn't exist"
        description="The link may be mistyped, or the page may have moved."
        action={
          <Button asChild>
            <NextLink href="/">Go to the home page</NextLink>
          </Button>
        }
      />
    </main>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/atoms';
import { ConfirmDialog, toast } from '@/components/molecules';
import { apiFetch } from '@/lib/api/client';

/** Delete button for a branch detail page. Only rendered for inactive branches. */
export function BranchDeleteButton({ branchId, name }: { branchId: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title={`Delete ${name}?`}
      description="This permanently deletes the branch. It cannot be undone. Branches with staff, applicants, companies, jobs or applications still assigned cannot be deleted — move or remove those first."
      tone="danger"
      confirmLabel="Delete branch"
      requireReason={{
        label: 'Reason',
        minLength: 5,
        placeholder: 'Recorded in the audit log',
      }}
      onConfirm={async (reason) => {
        await apiFetch(`/api/v1/branches/${branchId}`, {
          method: 'DELETE',
          body: { reason },
        });
        toast.success('Branch deleted');
        router.push('/super-admin/branches');
      }}
      trigger={
        <Button variant="danger" leftIcon={<Trash2 />}>
          Delete branch
        </Button>
      }
    />
  );
}

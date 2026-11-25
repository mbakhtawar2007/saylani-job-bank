import Image from 'next/image';
import { cn } from '@/lib/utils/cn';

interface BrandMarkProps {
  compact?: boolean;
  className?: string;
}

export function BrandMark({ compact = false, className }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center select-none', className)}>
      <Image
        src="/assets/logo.svg"
        alt="Saylani Job Bank"
        width={130}
        height={45}
        className={cn('w-auto object-contain', compact ? 'h-7' : 'h-9 sm:h-10')}
        priority
      />
    </div>
  );
}

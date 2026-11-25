'use client';

import { Menu, X } from 'lucide-react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrandMark } from '@/components/brands/BrandMark';
import { cn } from '@/lib/utils/cn';

interface NavbarProps {
  signedIn?: boolean;
  dashboardHref?: string;
  className?: string;
}

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About Us', href: '/about' },
  { label: 'Jobs', href: '/jobs' },
  { label: 'Contact Us', href: '/contact' },
];

export function Navbar({ signedIn = false, dashboardHref = '/login', className }: NavbarProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full px-4 transition-all duration-300 md:px-[60px]',
        scrolled ? 'pt-2 pb-1' : 'pt-3 pb-2',
        className,
      )}
    >
      <div
        className={cn(
          'mx-auto flex h-[68px] max-w-[1320px] items-center justify-between rounded-full bg-white/95 px-5 backdrop-blur-md transition-all duration-300',
          scrolled
            ? 'border border-black/10 shadow-[0_12px_32px_rgba(0,0,0,0.08)]'
            : 'border border-black/5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]',
        )}
      >
        <NextLink href="/" className="flex items-center transition-opacity hover:opacity-90">
          <BrandMark />
        </NextLink>

        <nav className="hidden items-center gap-2 md:flex" aria-label="Main navigation">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <NextLink
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[16px] leading-[22px] transition-colors',
                  isActive
                    ? 'font-medium text-black'
                    : 'font-normal text-black/60 hover:text-black',
                )}
              >
                {link.label}
              </NextLink>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          {signedIn ? (
            <NextLink
              href={dashboardHref}
              className="inline-flex h-[38px] items-center justify-center rounded-full bg-[#8CC641] px-4 text-[16px] font-medium text-white transition-colors hover:bg-[#7CB337]"
            >
              Go to Dashboard
            </NextLink>
          ) : (
            <>
              <NextLink
                href="/jobs"
                className="inline-flex h-[38px] items-center justify-center rounded-full bg-[#8CC641] px-4 text-[16px] font-medium text-white transition-all hover:bg-[#7CB337] active:scale-95"
              >
                Find a Job
              </NextLink>
              <NextLink
                href="/contact"
                className="inline-flex h-[38px] items-center justify-center rounded-full bg-[#F9F9F9] px-4 text-[16px] font-medium text-black/60 transition-colors hover:text-black active:scale-95"
              >
                Hire talent
              </NextLink>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="inline-flex size-10 items-center justify-center rounded-lg p-2 text-black hover:bg-black/5 md:hidden"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="mx-auto mt-2 max-w-[1320px] rounded-[24px] bg-white px-4 pt-2 pb-4 shadow-xl md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <NextLink
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'rounded-xl px-4 py-2.5 text-[16px]',
                    isActive ? 'font-medium text-black' : 'font-normal text-black/60',
                  )}
                >
                  {link.label}
                </NextLink>
              );
            })}
            <div className="mt-2 flex flex-col gap-2 border-t border-black/10 pt-3">
              <NextLink
                href="/jobs"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full rounded-full bg-[#8CC641] py-3 text-center text-[16px] font-medium text-white"
              >
                Find a Job
              </NextLink>
              <NextLink
                href="/contact"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full rounded-full bg-[#F9F9F9] py-3 text-center text-[16px] font-medium text-black/60"
              >
                Hire talent
              </NextLink>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

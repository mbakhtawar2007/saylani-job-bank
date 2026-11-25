'use client';

import { useState } from 'react';
import { CTABanner } from '@/components/organisms/CTABanner';
import { Footer } from '@/components/organisms/Footer';
import { Navbar } from '@/components/organisms/Navbar';
import { JobDetailCard } from './components/JobDetailCard';
import { JobsFeed } from './components/JobsFeed';
import { JobsHeader } from './components/JobsHeader';
import { FIGMA_JOBS, type JobSummary } from './data';

export default function JobsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('All cities');
  const [selectedJob, setSelectedJob] = useState<JobSummary>(FIGMA_JOBS[0] as JobSummary);

  const filteredJobs = FIGMA_JOBS.filter((job) => {
    if (searchQuery && !job.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (selectedCity !== 'All cities' && job.location !== selectedCity) return false;
    return true;
  });

  return (
    <div className="min-h-screen w-full bg-[#F9F9F9] text-black">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10 pt-10">
        <Navbar />
        <JobsHeader
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedCity={selectedCity}
          setSelectedCity={setSelectedCity}
        />
        <main className="px-4 md:px-[60px]">
          <div className="mx-auto flex max-w-[1320px] flex-col gap-6 lg:flex-row lg:items-start">
            <JobsFeed
              jobs={filteredJobs}
              selectedId={selectedJob.id}
              onSelect={(job) => setSelectedJob(job)}
            />
            <div className="w-full lg:sticky lg:top-6">
              <JobDetailCard job={selectedJob} />
            </div>
          </div>
        </main>
        <CTABanner />
        <Footer />
      </div>
    </div>
  );
}

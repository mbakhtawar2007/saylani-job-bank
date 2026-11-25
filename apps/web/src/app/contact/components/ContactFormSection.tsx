'use client';

import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

const INFO = [
  { label: 'Main Branch (Karachi)', value: 'A-169, Block 3, Clifton, Karachi, Pakistan' },
  { label: 'Opening Hours', value: 'Mon - Sat | 9:00 AM - 5:00 PM' },
  { label: 'Helpline Numbers', value: '+92 300 846 4772   +92 21 111 729 526' },
  { label: 'Official Email', value: 'info@saylanijobbank.org' },
];

const FIELD =
  'h-[52px] w-full rounded-[12px] bg-[#F9F9F9] px-3 text-[18px] leading-[18px] text-black placeholder:text-black/50 focus:outline-none focus:ring-1 focus:ring-black/20';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-[20px] leading-[20px] font-medium text-black">{label}</label>
      {children}
    </div>
  );
}

export function ContactFormSection() {
  return (
    <section id="message-form" className="w-full px-4 py-10 md:px-[60px]">
      <div className="mx-auto flex max-w-[1320px] flex-col items-start justify-center gap-10 lg:flex-row">
        <div className="flex w-full max-w-[680px] flex-col items-center gap-6 rounded-[34px] bg-white p-6 sm:p-10">
          <h2 className="text-center text-[30px] leading-[36px] font-normal text-black sm:text-[36px]">
            Send us a message
          </h2>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex w-full max-w-[600px] flex-col gap-6"
          >
            <Field label="Full Name">
              <input type="text" placeholder="Enter your full name" className={FIELD} />
            </Field>
            <Field label="Email address">
              <input type="email" placeholder="Enter your Email address" className={FIELD} />
            </Field>
            <Field label="I am a">
              <select className={`${FIELD} cursor-pointer appearance-none`}>
                <option>Select the desired occupation</option>
                <option>Job Seeker</option>
                <option>Employer / Hiring Partner</option>
                <option>Saylani Vocational Alum</option>
              </select>
            </Field>
            <Field label="Subject">
              <input type="text" placeholder="Enter the subject" className={FIELD} />
            </Field>
            <Field label="Your Message">
              <textarea
                placeholder="Please provide a detailed description of your message here..."
                className="h-[174px] w-full resize-none rounded-[14px] bg-[#F9F9F9] p-5 text-[18px] leading-[18px] text-black placeholder:text-black/50 focus:ring-1 focus:ring-black/20 focus:outline-none"
              />
            </Field>
            <button
              type="submit"
              className="flex h-[52px] w-full items-center justify-center gap-3.5 rounded-full bg-black text-[16px] leading-[24px] font-bold text-white transition-colors hover:bg-neutral-800"
            >
              Send Message
              <ArrowRight className="size-4" strokeWidth={2} />
            </button>
          </form>
        </div>

        <div className="flex w-full max-w-[600px] flex-col gap-5">
          <div className="flex flex-col items-center gap-10 rounded-[34px] bg-white p-6 sm:p-10">
            <div className="flex flex-col items-center gap-3 text-center">
              <h2 className="text-[30px] leading-[36px] font-normal text-black sm:text-[36px]">
                Saylani Job Bank Info
              </h2>
              <p className="max-w-[458px] text-[16px] leading-[19px] font-bold text-black">
                A trusted employment platform by Saylani Welfare Trust, helping people find better
                opportunities and building a stronger future.
              </p>
            </div>
            <div className="flex w-full flex-col gap-7">
              {INFO.map((item) => (
                <div key={item.label} className="flex flex-col items-center gap-1.5 text-center">
                  <p className="text-[20px] leading-[20px] font-medium text-black">{item.label}</p>
                  <p className="text-[16px] leading-[16px] font-normal text-black">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative aspect-[600/375] w-full overflow-hidden rounded-[24px] bg-neutral-900">
            <Image
              src="/assets/Remove_newspaper_effect_20261014144747_1_66_9967.png"
              alt="Saylani Job Bank consultation desk"
              fill
              sizes="600px"
              className="object-cover object-center"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

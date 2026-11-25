import { Building2, MapPin, Phone } from 'lucide-react';

const BRANCHES = [
  {
    city: 'Karachi Central',
    name: 'Gulshan-e-Iqbal Campus Desk',
    address: 'Block 5, Rashid Minhas Road, Near NIPA, Karachi',
    phone: '+92 (21) 3481-2290',
  },
  {
    city: 'Karachi South',
    name: 'Bahadurabad Employment Hub',
    address: 'A-25, Bahadur Shah Zafar Road, Karachi',
    phone: '+92 (21) 111-729-526',
  },
  {
    city: 'Lahore',
    name: 'Johar Town Regional Office',
    address: 'Main Boulevard, Phase 1, Johar Town, Lahore',
    phone: '+92 (42) 3531-4401',
  },
  {
    city: 'Islamabad / Rawalpindi',
    name: 'Twin Cities Liaison Desk',
    address: '6th Road, Satellite Town, Rawalpindi / Islamabad',
    phone: '+92 (51) 485-3312',
  },
];

export function ContactBranches() {
  return (
    <section className="border-t border-gray-100 bg-[#F9F9F9] py-16 sm:py-20">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-bold tracking-wider text-[var(--primary)] uppercase">
            Regional Presence
          </span>
          <h2 className="mt-2 text-3xl font-bold text-black sm:text-4xl">Regional Branch Desks</h2>
          <p className="mt-3 text-base text-[#54614F]">
            Visit or call our regional facilitation centers for in-person candidate verification and
            hiring consultations.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BRANCHES.map((b) => (
            <div
              key={b.name}
              className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:shadow-md"
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--primary)]/15 text-[var(--primary)]">
                <Building2 className="size-5" />
              </div>
              <span className="mt-4 inline-block text-xs font-bold text-[var(--accent)]">
                {b.city}
              </span>
              <h3 className="mt-1 text-base font-bold text-black">{b.name}</h3>
              <div className="mt-4 space-y-2 text-xs text-[#54614F]">
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-gray-400" />
                  <span>{b.address}</span>
                </p>
                <p className="flex items-center gap-2 font-medium text-black">
                  <Phone className="size-3.5 shrink-0 text-[var(--primary)]" />
                  <span>{b.phone}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

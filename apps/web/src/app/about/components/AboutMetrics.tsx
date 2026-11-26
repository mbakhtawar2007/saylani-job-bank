export function AboutMetrics() {
  const stats = [
    {
      value: '15,000+',
      label: 'Verified placements across Pakistan',
      title: 'Candidates Placed',
      color: 'text-[#8CC641]',
    },
    {
      value: '1,200+',
      label: 'Active registered hiring companies',
      title: 'Partner Employers',
      color: 'text-[#0072BB]',
    },
    {
      value: '94%',
      label: 'Candidates employed past 6 months',
      title: 'Retention Rate',
      color: 'text-[#10261A]',
    },
    {
      value: '100%',
      label: 'Zero commission, zero charges',
      title: 'Free Service',
      color: 'text-[#8CC641]',
    },
  ];

  return (
    <section className="bg-[#F9F9F9] pb-16">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s, idx) => (
            <div
              key={s.title}
              className="relative rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-xs"
            >
              <p className={`text-[36px] leading-tight font-bold ${s.color}`}>{s.value}</p>
              <p className="mt-1 text-sm font-normal text-gray-500">{s.label}</p>
              {idx < stats.length - 1 && (
                <div className="absolute top-1/2 right-0 hidden h-12 w-px -translate-y-1/2 bg-gray-200 lg:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

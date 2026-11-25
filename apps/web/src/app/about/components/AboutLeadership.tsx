'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

const TEAM = [
  { name: 'Abu Zar', role: 'Operational Manager', image: '/assets/team-abuzar.png' },
  { name: 'Kamran Ali', role: 'Accounts Assistant', image: '/assets/team-kamran.png' },
  { name: 'Ali Azmat', role: 'Data Entry Operator', image: '/assets/team-aliazmat.png' },
  { name: 'Javed Khan', role: 'Customer Support Executive', image: '/assets/team-javed.png' },
];

export function AboutLeadership() {
  return (
    <section className="overflow-hidden bg-[#F9F9F9] py-16 sm:py-24">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-3xl font-semibold text-black sm:text-[32px]">
            The people behind the Job Bank
          </h2>
          <p className="mt-3 text-base font-medium text-black/80">
            The team that registers, assesses and matches every candidate.
          </p>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM.map((member, idx) => (
            <motion.div
              key={member.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              whileHover={{ y: -6 }}
              className="group relative flex h-[340px] cursor-pointer flex-col justify-end overflow-hidden rounded-[28px] bg-neutral-900 p-6 text-white shadow-md"
            >
              <Image
                src={member.image}
                alt={member.name}
                fill
                className="object-cover object-top transition-transform duration-500 select-none group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent transition-opacity group-hover:opacity-90" />

              <div className="relative z-10 border-t border-white/20 pt-3">
                <h3 className="text-2xl leading-tight font-semibold text-white">{member.name}</h3>
                <p className="mt-1 text-sm font-medium text-white/90">{member.role}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

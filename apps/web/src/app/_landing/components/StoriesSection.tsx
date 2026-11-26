'use client';

import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import Image from 'next/image';

const STORIES = [
  { name: 'Zubair ali', role: 'Apointee. Systems LTD.', image: '/assets/story-zubair.png' },
  { name: 'Abu Zar', role: 'Apointee. Saylani Schools', image: '/assets/story-abuzar.png' },
];

export function StoriesSection() {
  return (
    <section className="w-full px-4 md:px-[60px]">
      <div className="mx-auto flex max-w-[1320px] flex-col items-center gap-10 py-6 sm:py-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
          className="flex max-w-[652px] flex-col items-center gap-2 text-center"
        >
          <span className="text-[16px] leading-[22px] font-medium text-[#8CC641]">Stories</span>
          <h2 className="text-[26px] leading-[1.3] font-semibold text-black sm:text-[32px] sm:leading-[45px]">
            Real people, real jobs, and the employers who hired them
          </h2>
          <p className="max-w-[490px] text-[15px] leading-[22px] font-normal text-[#787878]">
            Hear from candidates who found steady work through the Job Bank, and from the employers
            who trusted us to find them.
          </p>
        </motion.div>

        <div className="grid w-full grid-cols-1 gap-6 sm:gap-[30px] md:grid-cols-2">
          {STORIES.map((s, idx) => (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.12 }}
              whileHover={{ y: -6 }}
              className="group relative aspect-[648/349] w-full overflow-hidden rounded-[24px] bg-neutral-900 shadow-md transition-shadow duration-300 hover:shadow-2xl"
            >
              <Image
                src={s.image}
                alt={s.name}
                fill
                sizes="(max-width: 768px) 100vw, 648px"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent transition-opacity duration-300 group-hover:from-black/90" />

              <motion.button
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.94 }}
                type="button"
                aria-label={`Play ${s.name} story`}
                className="absolute top-1/2 left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/25 text-white backdrop-blur-md transition-all duration-300 group-hover:bg-[#8CC641] group-hover:shadow-[0_0_24px_rgba(140,198,65,0.6)]"
              >
                <Play className="ml-0.5 size-5 fill-white text-white" />
              </motion.button>

              <div className="absolute bottom-0 left-0 w-full p-6 transition-transform duration-300 group-hover:-translate-y-1">
                <h3
                  style={{ fontFamily: 'var(--font-plus-jakarta), sans-serif' }}
                  className="text-[28px] leading-tight font-semibold text-white sm:text-[33px]"
                >
                  {s.name}
                </h3>
                <p
                  style={{ fontFamily: 'var(--font-plus-jakarta), sans-serif' }}
                  className="mt-1 text-[13px] font-medium text-white/80 sm:text-[14px]"
                >
                  {s.role}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

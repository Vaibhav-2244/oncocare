'use client';

import { Twitter, Linkedin, Github, Instagram, Mail, MapPin, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/shared/logo';

const footerLinks = {
  Company: ['About Us', 'Our Mission', 'Careers', 'Press Kit', 'Blog'],
  Features: ['AI Symptom Checker', 'Caregiver Marketplace', 'Tele Oncology', 'Treatment Tracker', 'Hospital Dashboard'],
  Resources: ['Help Center', 'Patient Guide', 'Doctor Portal', 'API Documentation', 'Community'],
  Legal: ['Privacy Policy', 'Terms of Service', 'Data Security', 'Cookie Policy', 'HIPAA Compliance'],
};

const socials = [
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Linkedin, href: 'https://www.linkedin.com/company/last-minute-engineer/posts/?feedView=all', label: 'LinkedIn' },
  { icon: Instagram, href: 'https://www.instagram.com/myoncocareplus?stkn=MXJmdGVobzU0aGl4Nw%3D%3D&utm_source=qr', label: 'Instagram' },
];

export function Footer() {
  const t = useTranslations('components.sections.footer');
  return (
    <footer className="relative overflow-hidden border-t border-slate-100 bg-white">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-teal-50/30 to-transparent" />

      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-12">
          {/* Brand column */}
          <div className="lg:col-span-4">
            <a href="#" aria-label={t('oncocare')}>
              <Logo />
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
              {t('indiaAposSFirstAiPoweredIntegratedCancerHomeCarePlatformHelpingPatientsBeyondHos')}{' '}</p>

            {/* Contact info */}
            <div className="mt-6 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Mail className="h-3.5 w-3.5 text-teal-500" />
                lastminutengineers@gmail.com
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Phone className="h-3.5 w-3.5 text-teal-500" />
                +91 93 1848 7390
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Phone className="h-3.5 w-3.5 text-teal-500" />
                +91 98 9191 1199
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-teal-500" />
                {t('text100310thFloorSsOmniaSector86GurugramHaryana')}{' '}</div>
            </div>

            {/* Socials */}
            <div className="mt-6 flex gap-2">
              {socials.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:border-teal-300 hover:bg-teal-50 hover:text-emerald-deep hover:shadow-md"
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8">
            {Object.entries(footerLinks).map(([category, links]) => (
              <div key={category}>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  {category}
                </h4>
                <ul className="mt-4 space-y-2.5">
                  {links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="text-sm text-slate-500 transition-colors hover:text-emerald-deep"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-8 sm:flex-row">
          <p className="text-xs text-slate-400">
            {t('text2026OncocareTechnologiesPvtLtdAllRightsReserved')}{' '}</p>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {t('madeWithCareInIndia')}{' '}</div>
        </div>
      </div>
    </footer>
  );
}

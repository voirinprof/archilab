import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import type { Lang } from '../types.ts';

// split so the address never appears whole in the prerendered HTML, where address-harvesting robots look for it
const USER = 'littlearchi';
const DOMAIN = 'eduarchi.xyz';
const SUBJECT = { fr: 'Message depuis EduArchi.xyz', en: 'Message from EduArchi.xyz' };

/** Contact e-mail link: nothing is sent through the site, it opens the visitor's own mail app. */
export function ContactLink({ lang, className }: { lang: Lang; className?: string }) {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => { setAddress(`${USER}@${DOMAIN}`); }, []);
  return (
    <a className={className} href={address ? `mailto:${address}?subject=${encodeURIComponent(SUBJECT[lang])}` : undefined}>
      <Mail size={14} aria-hidden="true" />
      {address ?? (lang === 'fr' ? 'Nous écrire' : 'Write to us')}
    </a>
  );
}

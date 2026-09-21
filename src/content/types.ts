export type Locale = 'en' | 'es';

export type LocalizedText = Record<Locale, string>;

export interface ProjectRecord {
  id: string;
  href: string;
  label: LocalizedText;
  title: LocalizedText;
  text: LocalizedText;
  cta: LocalizedText;
}

export interface TalkRecord {
  id: string;
  href: string;
  year: LocalizedText;
  title: LocalizedText;
  text: LocalizedText;
  cta: LocalizedText;
}

export interface BookRecord {
  id: string;
  title: LocalizedText;
  text: LocalizedText;
}

export interface SiteContent {
  site: {
    name: string;
    wordmark: string;
    location: string;
    linkedin: string;
    github: string;
    newsletter: string;
    sponsorship: string;
    portraitAlt: LocalizedText;
    title: LocalizedText;
    description: LocalizedText;
  };
  nav: Record<'work' | 'talks' | 'about' | 'switchTo' | 'switchLabel', LocalizedText>;
  hero: Record<'eyebrow' | 'title' | 'intro' | 'primaryCta' | 'contactCta' | 'roleContext' | 'portraitNote', LocalizedText>;
  work: Record<'kicker' | 'title' | 'intro' | 'newsletterKicker' | 'newsletterTitle' | 'newsletterText' | 'newsletterCta' | 'sponsorshipCta' | 'visualTop' | 'visualBottom', LocalizedText>;
  projects: ProjectRecord[];
  talks: Record<'kicker' | 'title' | 'intro' | 'availabilityLabel' | 'availabilityText' | 'availabilityCta', LocalizedText>;
  talkItems: TalkRecord[];
  authorship: Record<'kicker' | 'title' | 'intro' | 'bookLabel', LocalizedText>;
  books: BookRecord[];
  about: {
    kicker: LocalizedText;
    title: LocalizedText;
    intro: LocalizedText;
    community: LocalizedText;
    facts: Array<{ label: LocalizedText; value: LocalizedText }>;
  };
  footer: Record<'lead' | 'text' | 'copyright', LocalizedText>;
}

export type Locale = 'en' | 'es';

export type ContentLanguage = Locale | null;

export type TalkOccurrenceKind =
  | 'talk'
  | 'workshop'
  | 'training'
  | 'panel'
  | 'session'
  | 'hosting'
  | 'podcast'
  | 'commentary'
  | 'conversation'
  | 'unknown';

export type TalkOccurrenceStatus = 'delivered' | 'scheduled' | 'unknown';

export type LocalizedText = Record<Locale, string>;

export interface TalkOccurrence {
  id: string;
  kind: TalkOccurrenceKind;
  status: TalkOccurrenceStatus;
  language: ContentLanguage;
}

export interface BookPublication {
  status: 'published' | 'in-progress' | 'unknown';
  language: ContentLanguage;
}

export interface ProjectRecord {
  id: string;
  href: string;
  label: LocalizedText;
  title: LocalizedText;
  text: LocalizedText;
  cta: LocalizedText;
  featured?: boolean;
}

export interface TalkRecord {
  id: string;
  occurrences: TalkOccurrence[];
  year: number;
  event: LocalizedText;
  format: LocalizedText;
  title: LocalizedText;
  text: LocalizedText;
  href?: string;
  cta?: LocalizedText;
  featured?: boolean;
}

export interface BookRecord {
  id: string;
  publication: BookPublication;
  title: LocalizedText;
  text: LocalizedText;
  meta: LocalizedText;
  href?: string;
  cta?: LocalizedText;
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
  hero: Record<'eyebrow' | 'title' | 'intro' | 'recognition' | 'primaryCta' | 'contactCta' | 'roleContext' | 'portraitNote', LocalizedText>;
  work: Record<'kicker' | 'title' | 'intro' | 'newsletterKicker' | 'newsletterTitle' | 'newsletterText' | 'newsletterCta' | 'sponsorshipCta' | 'visualTop' | 'visualBottom' | 'archiveLabel', LocalizedText>;
  projects: ProjectRecord[];
  talks: Record<'kicker' | 'title' | 'intro' | 'availabilityLabel' | 'availabilityText' | 'availabilityCta' | 'archiveLabel', LocalizedText>;
  talkItems: TalkRecord[];
  talkArchive: TalkRecord[];
  authorship: Record<'kicker' | 'title' | 'intro' | 'courseTitle' | 'courseText' | 'courseMeta', LocalizedText>;
  books: BookRecord[];
  about: {
    kicker: LocalizedText;
    title: LocalizedText;
    intro: LocalizedText;
    community: LocalizedText;
    facts: Array<{ label: LocalizedText; value: LocalizedText }>;
    activities: Array<{
      id: string;
      title: LocalizedText;
      text: LocalizedText;
      href?: string;
      cta?: LocalizedText;
    }>;
  };
  footer: Record<'lead' | 'text' | 'copyright', LocalizedText>;
}

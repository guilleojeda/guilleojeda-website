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

export interface WorkHighlight {
  label: LocalizedText;
  title: LocalizedText;
  href: string;
  text: LocalizedText;
}

export interface SpeakerResources {
  summary: LocalizedText;
  bio: {
    label: LocalizedText;
    text: LocalizedText;
  };
  topics: {
    label: LocalizedText;
    items: LocalizedText[];
  };
  languages: {
    label: LocalizedText;
    value: LocalizedText;
  };
  photo: {
    label: LocalizedText;
    downloadLabel: LocalizedText;
  };
  recording: {
    label: LocalizedText;
    talkId: string;
  };
}

export interface ResolvedSpeakerResources extends Omit<SpeakerResources, 'recording'> {
  recording: {
    label: LocalizedText;
    title: LocalizedText;
    href: string;
    languageLabel: LocalizedText;
  };
}

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
  recording?: {
    href: string;
    language: ContentLanguage;
  };
  featured?: boolean;
}

export type AppearanceWhen =
  | { date: string; timeZone: string; scope?: 'event' | 'appearance' }
  | { start: string; end?: string; timeZone: string; scope?: 'event' | 'appearance' };

export interface AppearanceRecord {
  id: string;
  talkId?: string;
  occurrenceId?: string;
  withdrawn?: boolean;
  event?: LocalizedText;
  role: LocalizedText;
  when: AppearanceWhen;
  location?: LocalizedText;
  href?: string;
  titleNote?: LocalizedText;
  timeNote?: LocalizedText;
  accessNote?: LocalizedText;
}

export interface ResolvedAppearance extends AppearanceRecord {
  event: LocalizedText;
  title: LocalizedText;
  status: TalkOccurrenceStatus;
  startAt: number;
  endAt: number;
  date: string;
  timeZone: string;
}

export type UpcomingAppearanceState = 'upcoming' | 'today' | 'in-progress';

export interface UpcomingAppearanceOccurrence extends ResolvedAppearance {
  state: UpcomingAppearanceState;
}

export interface UpcomingAppearanceGroup {
  id: string;
  talkId?: string;
  event: LocalizedText;
  title: LocalizedText;
  occurrences: UpcomingAppearanceOccurrence[];
  nextAt: number;
}

export type AppearanceCopy = Record<
  | 'title'
  | 'intro'
  | 'contact'
  | 'fallback'
  | 'empty'
  | 'eventLink'
  | 'date'
  | 'timeTbc'
  | 'today'
  | 'inProgress'
  | 'eventInProgress'
  | 'scheduled'
  | 'delivered'
  | 'unknownStatus'
  | 'moreOne'
  | 'moreMany',
  LocalizedText
>;

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
    newsletterSubscribe: string;
    sponsorship: string;
    portraitAlt: LocalizedText;
    title: LocalizedText;
    description: LocalizedText;
  };
  nav: Record<'appearances' | 'work' | 'talks' | 'about' | 'switchTo' | 'switchLabel', LocalizedText>;
  appearances: AppearanceCopy;
  hero: Record<'eyebrow' | 'title' | 'intro' | 'recognition' | 'primaryCta' | 'contactCta' | 'roleContext' | 'portraitNote', LocalizedText>;
  work: Record<'title' | 'newsletterKicker' | 'newsletterTitle' | 'newsletterText' | 'newsletterSubscribeCta' | 'newsletterReadCta' | 'sponsorshipCta' | 'visualTop' | 'visualBottom' | 'archiveLabel', LocalizedText>;
  workHighlights: WorkHighlight[];
  projects: ProjectRecord[];
  talks: Record<'title' | 'availabilityText' | 'availabilityCta' | 'archiveLabel', LocalizedText>;
  speakerResources: ResolvedSpeakerResources;
  talkItems: TalkRecord[];
  talkArchive: TalkRecord[];
  appearanceEntries: ResolvedAppearance[];
  authorship: Record<'title' | 'intro' | 'courseTitle' | 'courseText' | 'courseMeta', LocalizedText>;
  books: BookRecord[];
  about: {
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

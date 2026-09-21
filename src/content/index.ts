import profile from './profile.json';
import projects from './projects.json';
import talks from './talks.json';
import books from './books.json';
import type { Locale, SiteContent, TalkRecord } from './types';

type ProfileContent = Omit<SiteContent, 'projects' | 'talkItems' | 'talkArchive' | 'books'>;
const profileContent: ProfileContent = profile;
const projectRecords: SiteContent['projects'] = projects;
const talkRecords: TalkRecord[] = talks;
const bookRecords: SiteContent['books'] = books;

export const content = {
  ...profileContent,
  projects: projectRecords,
  talkItems: talkRecords.filter((talk) => talk.featured),
  talkArchive: talkRecords,
  books: bookRecords
} satisfies SiteContent;

export const locales: Locale[] = ['en', 'es'];

export function text(value: Record<Locale, string>, locale: Locale): string {
  return value[locale];
}

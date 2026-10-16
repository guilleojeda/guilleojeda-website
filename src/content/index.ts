import profile from './profile.json';
import projects from './projects.json';
import talks from './talks.json';
import books from './books.json';
import type {
  BookPublication,
  BookRecord,
  Locale,
  SiteContent,
  TalkOccurrence,
  TalkRecord
} from './types';

type ProfileContent = Omit<SiteContent, 'projects' | 'talkItems' | 'talkArchive' | 'books'>;
const profileContent: ProfileContent = profile;
const projectRecords: SiteContent['projects'] = projects;

// WHY: The build generator validates these facts before deployment, so only
// JSON's widened enum fields need narrowing here; display fields remain typed. See docs/intent/website.md.
const talkRecords: TalkRecord[] = talks.map((talk) => ({
  ...talk,
  occurrences: talk.occurrences as TalkOccurrence[]
}));
const bookRecords: BookRecord[] = books.map((book) => ({
  ...book,
  publication: book.publication as BookPublication
}));

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

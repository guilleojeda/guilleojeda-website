import profile from './profile.json';
import projects from './projects.json';
import talks from './talks.json';
import books from './books.json';
import type { Locale, SiteContent } from './types';

export const content = {
  ...profile,
  projects,
  talkItems: talks,
  books
} satisfies SiteContent;

export const locales: Locale[] = ['en', 'es'];

export function text(value: Record<Locale, string>, locale: Locale): string {
  return value[locale];
}

import profile from './profile.json';
import projects from './projects.json';
import talks from './talks.json';
import books from './books.json';
import highlights from './highlights.json';
import type {
  BookPublication,
  BookRecord,
  Locale,
  LocalizedText,
  ResolvedSpeakerResources,
  SiteContent,
  SpeakerResources,
  TalkOccurrence,
  TalkRecord,
  WorkHighlight
} from './types';

type ProfileContent = Omit<SiteContent, 'projects' | 'talkItems' | 'talkArchive' | 'books' | 'workHighlights' | 'speakerResources'> & {
  speakerResources: SpeakerResources;
};
const profileContent: ProfileContent = profile;
const projectRecords: SiteContent['projects'] = projects;

// WHY: The build generator validates occurrences and publication facts; the
// selected recording language is narrowed when its highlight is resolved. See docs/intent/website.md.
const talkRecords: TalkRecord[] = talks.map(({ recording, ...talk }) => ({
  ...talk,
  occurrences: talk.occurrences as TalkOccurrence[],
  ...(recording ? {
    recording: {
      href: recording.href,
      language: requiredLanguage(recording.language, 'recording')
    }
  } : {})
}));
const bookRecords: BookRecord[] = books.map((book) => ({
  ...book,
  publication: book.publication as BookPublication
}));
type HighlightSelection = (typeof highlights)[number];

const actionLabels: Record<'article' | 'talk' | 'project', LocalizedText> = {
  article: { en: 'Read', es: 'Leer' },
  talk: { en: 'Watch', es: 'Ver' },
  project: { en: 'Play', es: 'Jugar' }
};

const languageLabels: Record<Locale, LocalizedText> = {
  en: { en: 'English', es: 'Inglés' },
  es: { en: 'Spanish', es: 'Español' }
};

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Work highlight is missing ${field}.`);
  return value;
}

function requiredLanguage(value: unknown, kind: string): Locale {
  if (value === 'en' || value === 'es') return value;
  throw new Error(`Work highlight ${kind} has an unsupported or missing content language.`);
}

function resolveWorkHighlight(selection: HighlightSelection): WorkHighlight {
  let title: LocalizedText;
  let href: string;
  let language: Locale;
  let actionLabel: LocalizedText;

  if (selection.kind === 'article') {
    if (!('title' in selection) || !('href' in selection) || !('language' in selection)) {
      throw new Error('Article work highlight is missing its title, URL, or content language.');
    }
    const articleTitle = requiredString(selection.title, 'article title');
    title = { en: articleTitle, es: articleTitle };
    href = requiredString(selection.href, 'article URL');
    language = requiredLanguage(selection.language, 'article');
    actionLabel = actionLabels.article;
  } else if (selection.kind === 'talk') {
    if (!('id' in selection)) throw new Error('Talk work highlight is missing its talk ID.');
    const id = requiredString(selection.id, 'talk ID');
    const talk = talkRecords.find((record) => record.id === id);
    if (!talk) throw new Error(`Work highlight references missing talk "${id}".`);
    if (!talk.recording?.href) throw new Error(`Work highlight talk "${id}" is missing its direct recording URL.`);
    title = talk.title;
    href = talk.recording.href;
    language = requiredLanguage(talk.recording.language, `recording for "${id}"`);
    actionLabel = actionLabels.talk;
  } else if (selection.kind === 'project') {
    if (!('id' in selection) || !('language' in selection)) {
      throw new Error('Project work highlight is missing its project ID or content language.');
    }
    const id = requiredString(selection.id, 'project ID');
    const project = projectRecords.find((record) => record.id === id);
    if (!project) throw new Error(`Work highlight references missing project "${id}".`);
    title = project.title;
    href = project.href;
    language = requiredLanguage(selection.language, 'project');
    actionLabel = actionLabels.project;
  } else {
    throw new Error(`Work highlight has an unsupported kind "${selection.kind}".`);
  }

  return {
    label: {
      en: `${actionLabel.en} · ${languageLabels[language].en}`,
      es: `${actionLabel.es} · ${languageLabels[language].es}`
    },
    title,
    href,
    text: selection.text
  };
}

const workHighlights = highlights.map(resolveWorkHighlight);

function resolveSpeakerResources(selection: SpeakerResources): ResolvedSpeakerResources {
  const talk = talkRecords.find((record) => record.id === selection.recording.talkId);
  if (!talk) throw new Error(`Speaker resources reference missing talk "${selection.recording.talkId}".`);
  if (!talk.recording?.href) throw new Error(`Speaker resources talk "${talk.id}" is missing its direct recording URL.`);
  const language = requiredLanguage(talk.recording.language, `speaker resources recording for "${talk.id}"`);

  return {
    ...selection,
    recording: {
      label: selection.recording.label,
      title: talk.title,
      href: talk.recording.href,
      languageLabel: {
        en: `In ${languageLabels[language].en}`,
        es: `En ${languageLabels[language].es.toLocaleLowerCase('es')}`
      }
    }
  };
}

export const content = {
  ...profileContent,
  projects: projectRecords,
  talkItems: talkRecords.filter((talk) => talk.featured),
  talkArchive: talkRecords,
  books: bookRecords,
  workHighlights,
  speakerResources: resolveSpeakerResources(profileContent.speakerResources)
} satisfies SiteContent;

export const locales: Locale[] = ['en', 'es'];

export function text(value: Record<Locale, string>, locale: Locale): string {
  return value[locale];
}

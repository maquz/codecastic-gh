export type Track = {
    slug: string;
    code: string | null;
    label: string;
    title: string;
    lead: string;
    about: string;
};

export const TRACKS: Track[] = [
    {
        slug: 'basic',
        code: null,
        label: 'Basic 4 to 9 (BECE)',
        title: 'Basic 4 to 9 & BECE Exams',
        lead: 'Multiple choice exams for Basic 4 to 9, with comprehensive BECE preparation for Basic 7 to 9.',
        about: 'Progress through class levels from Basic 4 to Basic 9. Learners in Basic 7, 8, and 9 can also take full national BECE past question and mock exam series.',
    },
    {
        slug: 'shs',
        code: 'SHS',
        label: 'WASSCE (SHS 1 - 3)',
        title: 'WASSCE (SHS 1 - 3): End-of-Term & WASSCE Practice',
        lead: 'Multiple choice exams for Senior High School forms SHS 1 to SHS 3, including WASSCE practice.',
        about: 'Choose your SHS form (SHS 1, SHS 2, or SHS 3) to practise end-of-term exams and national WASSCE questions.',
    },
    {
        slug: 'gtle',
        code: 'GTLE',
        label: 'GTLE',
        title: 'GTLE practice',
        lead: 'Ghana Teacher Licensure Examination.',
        about: 'The GTLE is the licensure examination for teachers in Ghana. Practise professional studies questions and learn from the explanation given for each answer.',
    },
    {
        slug: 'ges-promotion',
        code: 'GES-PROMO',
        label: 'GES Promotion Exams',
        title: 'GES promotion exams practice',
        lead: 'Practice for teachers in the Ghana Education Service who are preparing for promotion.',
        about: 'Work through professional knowledge and classroom practice questions, see your score straight away and read the explanation for each answer.',
    },
];

export function findTrack(slug: string): Track | undefined {
    if (slug === 'bece') return TRACKS.find((t) => t.slug === 'basic');
    if (slug === 'wassce') return TRACKS.find((t) => t.slug === 'shs');
    return TRACKS.find((t) => t.slug === slug);
}

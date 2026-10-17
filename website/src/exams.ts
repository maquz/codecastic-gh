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
        label: 'Basic 4 to 9',
        title: 'Basic 4 to 9: end-of-term and end-of-year exams',
        lead: 'Multiple choice exams for every class from Basic 4 to Basic 9.',
        about: 'Choose your class level and you will only see questions for that level. Answer at your own pace, then get your score and an explanation for every question.',
    },
    {
        slug: 'bece',
        code: 'BECE',
        label: 'BECE',
        title: 'BECE practice',
        lead: 'Basic Education Certificate Examination.',
        about: 'The BECE is the national examination taken at the end of junior high school. Practise by subject, see your score straight away and read the explanation for every answer.',
    },
    {
        slug: 'wassce',
        code: 'WASSCE',
        label: 'WASSCE',
        title: 'WASSCE practice',
        lead: 'West African Senior School Certificate Examination.',
        about: 'The WASSCE is the examination taken at the end of senior high school. Practise by subject, see your score straight away and read the explanation for every answer.',
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

export type Service = { name: string; desc: string };
export type Group = { id: string; name: string; blurb: string; items: Service[] };

export const GROUPS: Group[] = [
    {
        id: 'build',
        name: 'Build',
        blurb: 'New software, websites and apps made to fit how your organisation works.',
        items: [
            { name: 'Software development', desc: 'Custom software for the way your organisation actually works.' },
            { name: 'Website design and development', desc: 'Websites that load quickly, are easy to update and are clear to visitors.' },
            { name: 'Mobile application development', desc: 'Apps for phones and tablets, designed around the people who will use them.' },
        ],
    },
    {
        id: 'run',
        name: 'Run',
        blurb: 'Keep your systems online, secure and supported.',
        items: [
            { name: 'Cloud computing services', desc: 'Hosting and storage that fit your budget, with help moving to the cloud or running better in it.' },
            { name: 'Cybersecurity services', desc: 'Protect your systems and your clients’ data from the risks that matter for an organisation your size.' },
            { name: 'Technology support and maintenance', desc: 'Someone to call when something breaks, and routine care so it breaks less often.' },
        ],
    },
    {
        id: 'advise',
        name: 'Advise',
        blurb: 'Clear guidance on what to buy, build or change.',
        items: [
            { name: 'IT consultancy', desc: 'Independent advice on which technology to buy, build or retire.' },
            { name: 'Digital transformation', desc: 'Move from paper and manual processes to digital ones, one step at a time.' },
            { name: 'Data analytics and business intelligence', desc: 'Turn the records you already keep into reports you can make decisions from.' },
        ],
    },
    {
        id: 'grow',
        name: 'Grow',
        blurb: 'Build skills in your team and reach more customers.',
        items: [
            { name: 'Training and capacity building', desc: 'ICT training programmes for staff, teachers and students.' },
            { name: 'Digital marketing', desc: 'Reach customers online with campaigns you can measure.' },
        ],
    },
];

export const VALUES = [
    { name: 'Integrity', text: 'We keep our word and are open about progress and problems.' },
    { name: 'Excellence', text: 'We hold our work to a high standard before it reaches you.' },
    { name: 'Innovation', text: 'We look for better ways to solve real problems.' },
    { name: 'Professionalism', text: 'We communicate clearly and meet our commitments.' },
    { name: 'Accountability', text: 'We own our results, including our mistakes.' },
    { name: 'Customer satisfaction', text: 'Your outcome is how we measure our work.' },
    { name: 'Teamwork', text: 'We share knowledge and solve problems together.' },
    { name: 'Continuous learning', text: 'Technology moves quickly, so we keep learning.' },
];

export const OBJECTIVES = [
    'Provide high-quality technology services.',
    'Promote digital innovation and entrepreneurship.',
    'Support organisations in reaching technological excellence.',
    'Create employment opportunities in the technology sector.',
    'Carry out research and development.',
    'Deliver professional ICT training programmes.',
    'Build strategic partnerships locally and internationally.',
];

export const OFFICERS = [
    'Chairperson of the Board',
    'Managing Director / CEO',
    'Operations Manager',
    'Finance Manager',
    'Technical Director',
    'Business Development Manager',
    'Company Secretary',
];

export const MEMBERSHIP = [
    'Founding members',
    'Directors',
    'Shareholders',
    'Employees',
    'Consultants',
    'Strategic partners',
];

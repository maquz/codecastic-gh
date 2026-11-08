import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, '../data');
const seedPath = path.join(dataDir, 'seed.json');
const dbPath = path.join(dataDir, 'db.json');

const subjectIds = {
    mathematics: 'a771b07a-deae-4e87-9392-5190693d867e',
    computing: '2b846379-fec2-4aaf-a237-ccf2adf8a70d',
    science: '465b64a4-7931-4675-bd6d-6bce3fa2c92b',
    english: '5a1a85f1-c62d-4147-a474-5df1c60e0018',
    history: 'c3f81e92-7b44-4e20-912b-31a980e15b22',
    careerTech: 'e4a29c17-88df-4122-b2ee-71a62d8544c9',
    socialStudies: 'b1836f34-118c-4a30-8a89-2917e9231f88',
    rme: 'd718290e-436f-474c-8181-a9fbc735e076'
};

const newQuestions = [
    // Career Technology
    {
        subjectId: subjectIds.careerTech,
        level: 7,
        year: '2023',
        category: 'Core Concepts',
        text: 'Which of the following tools is primarily used for measuring and laying out 90° angles on wood or metal?',
        options: ['Try square', 'Hacksaw', 'Cross-cut saw', 'Mallet'],
        correctIndex: 0,
        explanation: 'A try square is designed specifically for checking and marking right angles (90 degrees).'
    },
    {
        subjectId: subjectIds.careerTech,
        level: 8,
        year: '2023',
        category: 'Core Concepts',
        text: 'In food and nutrition, which cooking method uses dry heat in an enclosed oven?',
        options: ['Boiling', 'Steaming', 'Baking', 'Poaching'],
        correctIndex: 2,
        explanation: 'Baking cooks food through dry radiant heat inside an oven.'
    },
    {
        subjectId: subjectIds.careerTech,
        level: 'BECE',
        year: '2024',
        category: 'Past Papers & Mock',
        text: 'The process of applying a protective coat of molten zinc to iron or steel sheets is called:',
        options: ['Galvanizing', 'Anodizing', 'Tinning', 'Electroplating'],
        correctIndex: 0,
        explanation: 'Galvanizing prevents rusting of iron and steel by coating it with zinc.'
    },
    {
        subjectId: subjectIds.careerTech,
        level: 4,
        year: '2023',
        category: 'Core Concepts',
        text: 'Which sewing tool is used to protect the middle finger when pushing a needle through thick fabric?',
        options: ['Thimble', 'Tape measure', 'Shears', 'Bobbin'],
        correctIndex: 0,
        explanation: 'A thimble is a metal or plastic cap that protects the finger while sewing.'
    },
    {
        subjectId: subjectIds.careerTech,
        level: 'BECE',
        year: '2023',
        category: 'Past Papers & Mock',
        text: 'Personal Protective Equipment (PPE) required when working in a woodworking workshop includes all the following EXCEPT:',
        options: ['Goggles', 'Ear protectors', 'Steel toe boots', 'Loose dangling neckties'],
        correctIndex: 3,
        explanation: 'Loose neckties pose severe entanglement risks near spinning workshop machinery.'
    },

    // History
    {
        subjectId: subjectIds.history,
        level: 7,
        year: '2023',
        category: 'Core Concepts',
        text: 'Which major ethnic group in Ghana is traditionally known to have migrated from ancient Western Sudan through Bono Manso?',
        options: ['Akan', 'Ga-Adangme', 'Ewe', 'Guan'],
        correctIndex: 0,
        explanation: 'Oral traditions trace Akan origins through early Bono Manso settlement.'
    },
    {
        subjectId: subjectIds.history,
        level: 8,
        year: '2023',
        category: 'Core Concepts',
        text: 'Who was the leader of the 1900 War of the Golden Stool against British colonial forces in Asante?',
        options: ['Yaa Asantewaa', 'Osei Tutu I', 'Prempeh I', 'Opoku Ware I'],
        correctIndex: 0,
        explanation: 'Nana Yaa Asantewaa, Queen Mother of Ejisu, courageously led the Asante uprising to protect the Golden Stool.'
    },
    {
        subjectId: subjectIds.history,
        level: 'BECE',
        year: '2024',
        category: 'Past Papers & Mock',
        text: 'In which year did the Bond of 1844 formally come into effect in the Gold Coast?',
        options: ['1844', '1874', '1896', '1957'],
        correctIndex: 0,
        explanation: 'The Bond of 1844 was signed on March 6, 1844 between British Lieutenant-Governor Hill and Fante chiefs.'
    },
    {
        subjectId: subjectIds.history,
        level: 4,
        year: '2023',
        category: 'Core Concepts',
        text: 'Who was the first Prime Minister and subsequently the first President of the Republic of Ghana?',
        options: ['Dr. Kwame Nkrumah', 'Dr. J.B. Danquah', 'K.A. Busia', 'E. Akufo-Addo'],
        correctIndex: 0,
        explanation: 'Dr. Kwame Nkrumah led Ghana to independence on March 6, 1957.'
    },
    {
        subjectId: subjectIds.history,
        level: 'BECE',
        year: '2023',
        category: 'Past Papers & Mock',
        text: 'Which political party won the majority of seats in the 1951 Gold Coast general election under the Coussey Constitution?',
        options: ['Convention People’s Party (CPP)', 'United Gold Coast Convention (UGCC)', 'Northern People’s Party (NPP)', 'National Liberation Movement (NLM)'],
        correctIndex: 0,
        explanation: 'The CPP won a landslide victory in the 1951 general election.'
    },

    // Social Studies
    {
        subjectId: subjectIds.socialStudies,
        level: 7,
        year: '2023',
        category: 'Core Concepts',
        text: 'The supreme law of the Republic of Ghana that guides governance and protects fundamental human rights is the:',
        options: ['1992 Constitution', 'Criminal Code', 'Chieftaincy Act', 'Local Government Act'],
        correctIndex: 0,
        explanation: 'The 1992 Constitution is the supreme law of Ghana.'
    },
    {
        subjectId: subjectIds.socialStudies,
        level: 8,
        year: '2023',
        category: 'Core Concepts',
        text: 'Which arm of government is responsible for interpreting the laws and administering justice in Ghana?',
        options: ['The Judiciary', 'The Executive', 'The Legislature', 'The Council of State'],
        correctIndex: 0,
        explanation: 'The Judiciary, headed by the Chief Justice, interprets laws.'
    },
    {
        subjectId: subjectIds.socialStudies,
        level: 'BECE',
        year: '2024',
        category: 'Past Papers & Mock',
        text: 'Rapid population growth without corresponding economic expansion in urban centres in developing countries most often results in:',
        options: ['High standard of living', 'Proliferation of slums and pressure on social amenities', 'Decrease in unemployment', 'Surplus revenue for local authorities'],
        correctIndex: 1,
        explanation: 'Uncontrolled urban influx overstretches housing, healthcare, water, and sanitation facilities.'
    },
    {
        subjectId: subjectIds.socialStudies,
        level: 'BECE',
        year: '2023',
        category: 'Past Papers & Mock',
        text: 'The main goal of sustainable environmental management in Ghana is to:',
        options: ['Exploit all minerals as quickly as possible', 'Meet present needs without compromising the ability of future generations to meet theirs', 'Stop all farming activities near forest belts', 'Privatize all water bodies'],
        correctIndex: 1,
        explanation: 'Sustainability balances socio-economic progress with environmental conservation.'
    },

    // Religious & Moral Education (RME)
    {
        subjectId: subjectIds.rme,
        level: 4,
        year: '2023',
        category: 'Core Concepts',
        text: 'In Christian tradition, God created the universe in how many days before resting?',
        options: ['6 days', '7 days', '10 days', '3 days'],
        correctIndex: 0,
        explanation: 'According to Genesis, God created all things in six days and rested on the seventh day.'
    },
    {
        subjectId: subjectIds.rme,
        level: 7,
        year: '2023',
        category: 'Core Concepts',
        text: 'The five daily ritual prayers performed by Muslims are known as:',
        options: ['Salat', 'Sawm', 'Zakat', 'Hajj'],
        correctIndex: 0,
        explanation: 'Salat represents the compulsory five daily prayers in Islam.'
    },
    {
        subjectId: subjectIds.rme,
        level: 8,
        year: '2023',
        category: 'Core Concepts',
        text: 'In Traditional Ghanaian Society, libation is primarily poured to:',
        options: ['Entertain visitors only', 'Communicate with the Supreme Being, deities, and ancestors', 'Cool the ground before dance', 'Sanctify modern currency'],
        correctIndex: 1,
        explanation: 'Libation is a prayer medium connecting the physical community to ancestors and God.'
    },
    {
        subjectId: subjectIds.rme,
        level: 'BECE',
        year: '2024',
        category: 'Past Papers & Mock',
        text: 'Demonstrating honesty and integrity in public examinations reflects the moral virtue of:',
        options: ['Truthfulness and uprightness', 'Timidity', 'Obedience to peer pressure', 'Competitiveness at all costs'],
        correctIndex: 0,
        explanation: 'Academic honesty is a fundamental moral quality of truthfulness and self-respect.'
    },

    // Computing BECE & Basic 8
    {
        subjectId: subjectIds.computing,
        level: 8,
        year: '2023',
        category: 'Core Concepts',
        text: 'In spreadsheet software like Microsoft Excel, which symbol must precede every mathematical formula?',
        options: ['=', '+', '@', '#'],
        correctIndex: 0,
        explanation: 'Formulas in spreadsheets always begin with the equal sign (=).'
    },
    {
        subjectId: subjectIds.computing,
        level: 'BECE',
        year: '2024',
        category: 'Past Papers & Mock',
        text: 'The keyboard shortcut used to copy selected text in most modern operating systems is:',
        options: ['Ctrl + C', 'Ctrl + V', 'Ctrl + X', 'Ctrl + Z'],
        correctIndex: 0,
        explanation: 'Ctrl + C copies, Ctrl + V pastes, and Ctrl + X cuts.'
    },
    {
        subjectId: subjectIds.computing,
        level: 'BECE',
        year: '2023',
        category: 'Past Papers & Mock',
        text: 'A malicious program that replicates itself across computer networks without human action is classified as a:',
        options: ['Computer Worm', 'Browser Cookie', 'Firewall', 'Device Driver'],
        correctIndex: 0,
        explanation: 'A computer worm spreads autonomously through network vulnerabilities.'
    }
];

function updateFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.questions)) data.questions = [];

    const existingTextSet = new Set(data.questions.map((q) => q.text.trim().toLowerCase()));
    let addedCount = 0;

    for (const nq of newQuestions) {
        if (!existingTextSet.has(nq.text.trim().toLowerCase())) {
            data.questions.push({
                ...nq,
                id: crypto.randomUUID(),
                createdAt: Date.now() + addedCount
            });
            existingTextSet.add(nq.text.trim().toLowerCase());
            addedCount++;
        }
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Updated ${filePath}: added ${addedCount} questions. Total: ${data.questions.length}`);
}

updateFile(seedPath);
updateFile(dbPath);

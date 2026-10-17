import { useEffect, useState } from 'react';

export type Route = 'home' | 'about' | 'services' | 'exams' | 'governance' | 'contact' | 'inbox';
export type Loc = { route: Route; sub: string };

export const NAV: { route: Route; label: string }[] = [
    { route: 'home', label: 'Home' },
    { route: 'about', label: 'About us' },
    { route: 'services', label: 'Services' },
    { route: 'exams', label: 'ExamHub' },
    // { route: 'governance', label: 'Governance' },
    { route: 'contact', label: 'Contact us' },
];

export const MOTTO = 'Innovating Today, Transforming Tomorrow.';

export function hrefFor(r: Route): string {
    return r === 'home' ? '#/' : `#/${r}`;
}

function parse(): Loc {
    const parts = window.location.hash
        .replace(/^#\/?/, '')
        .split('?')[0]
        .split('/')
        .filter(Boolean);
    const first = parts[0] ?? '';
    const all: string[] = [...NAV.map((n) => n.route), 'inbox'];
    const route = (all.includes(first) ? first : 'home') as Route;
    return { route, sub: route === 'exams' ? parts[1] ?? '' : '' };
}

export function useRoute(): Loc {
    const [loc, setLoc] = useState<Loc>(parse());
    useEffect(() => {
        const onChange = () => {
            setLoc(parse());
            window.scrollTo({ top: 0 });
        };
        window.addEventListener('hashchange', onChange);
        return () => window.removeEventListener('hashchange', onChange);
    }, []);
    return loc;
}

const PAGE = 'M31,170 L55,139 Q73,136 93,139 C121,156 143,178 158,194 C130,190 98,184 70,181 C50,181 36,177 31,170 Z';
const LEAF_A = 'M67,85 C105,78 140,110 145,167 C135,130 105,100 67,85 Z';
const LEAF_B = 'M67,122 C100,112 138,130 145,167 C132,150 100,128 67,122 Z';
const BASE = 'M20.5,184.5 H126 C136,184.5 140,192 141,205 C141.5,220 146,229.5 163,229.5';
const FLAME =
    'M163,71 C175,88 181,109 172,123 C169,129 166,133 163,136 C160,133 157,129 154,123 C145,109 151,88 163,71 Z M163,92 C168.5,103 168.5,117 163,127 C157.5,117 157.5,103 163,92 Z';

function Half() {
    return (
        <>
            <path d={PAGE} fill="#E6BB31" />
            <path d={LEAF_B} fill="#2A8759" />
            <path d={LEAF_A} fill="#2A8759" />
            <path d={BASE} fill="none" stroke="#E14947" strokeWidth="5.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
    );
}

export function LogoMark() {
    return (
        <svg className="logo-mark" viewBox="10 62 306 180" aria-hidden="true" focusable="false">
            <Half />
            <g transform="translate(326 0) scale(-1 1)">
                <Half />
            </g>
            <path d={FLAME} fill="#E6BB31" fillRule="evenodd" />
        </svg>
    );
}

export function Logo() {
    return (
        <a className="logo" href="#/" aria-label="Codecastic GH home">
            <LogoMark />
            <span className="logo-text">codeCasticgh</span>
        </a>
    );
}

export function PageHead({ title, lead }: { title: string; lead: string }) {
    return (
        <section className="page-head">
            <div className="wrap">
                <h1>{title}</h1>
                <p>{lead}</p>
            </div>
        </section>
    );
}

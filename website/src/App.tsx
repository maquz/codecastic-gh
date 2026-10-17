import { useEffect, useState } from 'react';
import { NAV, Logo, MOTTO, hrefFor, useRoute } from './ui';
import type { Route } from './ui';
import { TRACKS } from './exams';
import Home from './pages/Home';
import About from './pages/About';
import Services from './pages/Services';
import Exams from './pages/Exams';
import Governance from './pages/Governance';
import Contact from './pages/Contact';
import Inbox from './pages/Inbox';

const TITLES: Record<Route, string> = {
    home: 'Codecastic GH | Innovating Today, Transforming Tomorrow',
    about: 'About us | Codecastic GH',
    services: 'Services | Codecastic GH',
    exams: 'ExamHub exam practice | Codecastic GH',
    governance: 'Governance | Codecastic GH',
    contact: 'Contact us | Codecastic GH',
    inbox: 'Staff inbox | Codecastic GH',
};

function App() {
    const { route, sub } = useRoute();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        setOpen(false);
        document.title = TITLES[route];
    }, [route, sub]);

    return (
        <>
            <header className="site-header">
                <div className="wrap header-row">
                    <Logo />
                    <button
                        className="menu-btn"
                        aria-expanded={open}
                        aria-controls="main-nav"
                        onClick={() => setOpen((o) => !o)}
                    >
                        {open ? 'Close' : 'Menu'}
                    </button>
                    <nav id="main-nav" className={`nav${open ? ' open' : ''}`} aria-label="Main">
                        {NAV.map((n) =>
                            n.route === 'exams' ? (
                                <div className="nav-item-dropdown" key={n.route}>
                                    <a
                                        href={hrefFor(n.route)}
                                        aria-current={route === n.route ? 'page' : undefined}
                                        className="nav-dropdown-trigger"
                                    >
                                        {n.label}
                                        <span className="nav-caret" aria-hidden="true">▾</span>
                                    </a>
                                    <div className="nav-dropdown" role="menu" aria-label="ExamHub sections">
                                        <a
                                            href="#/exams"
                                            role="menuitem"
                                            aria-current={route === 'exams' && !sub ? 'page' : undefined}
                                        >
                                            Overview
                                        </a>
                                        {TRACKS.map((t) => (
                                            <a
                                                key={t.slug}
                                                href={`#/exams/${t.slug}`}
                                                role="menuitem"
                                                aria-current={route === 'exams' && sub === t.slug ? 'page' : undefined}
                                            >
                                                {t.label}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <a key={n.route} href={hrefFor(n.route)} aria-current={route === n.route ? 'page' : undefined}>
                                    {n.label}
                                </a>
                            )
                        )}
                    </nav>
                </div>
                {route === 'exams' && (
                    <div className="header-subtabs">
                        <div className="wrap header-subtabs-row" role="navigation" aria-label="ExamHub sub-tabs">
                            <a href="#/exams" aria-current={!sub ? 'page' : undefined}>
                                Overview
                            </a>
                            {TRACKS.map((t) => (
                                <a
                                    key={t.slug}
                                    href={`#/exams/${t.slug}`}
                                    aria-current={sub === t.slug ? 'page' : undefined}
                                >
                                    {t.label}
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </header>

            <main>
                {route === 'home' && <Home />}
                {route === 'about' && <About />}
                {route === 'services' && <Services />}
                {route === 'exams' && <Exams sub={sub} />}
                {route === 'governance' && <Governance />}
                {route === 'contact' && <Contact />}
                {route === 'inbox' && <Inbox />}
            </main>

            <footer className="site-footer">
                <div className="wrap">
                    <div className="footer-grid">
                        <div>
                            <Logo />
                            <p className="footer-motto">{MOTTO}</p>
                        </div>
                        <div>
                            <h4>Explore</h4>
                            <ul>
                                {NAV.slice(0, 3).map((n) => (
                                    <li key={n.route}>
                                        <a href={hrefFor(n.route)}>{n.label}</a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4>Company</h4>
                            <ul>
                                {NAV.slice(3).map((n) => (
                                    <li key={n.route}>
                                        <a href={hrefFor(n.route)}>{n.label}</a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <div className="footer-base">
                        <span>© {new Date().getFullYear()} Codecastic GH. Registered in Ghana.</span>
                        <a href="#/inbox">Staff inbox</a>
                    </div>
                </div>
            </footer>
        </>
    );
}

export default App;

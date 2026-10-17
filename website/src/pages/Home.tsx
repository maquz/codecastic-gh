import { GROUPS, VALUES } from '../content';
import { TRACKS } from '../exams';

export default function Home() {
    return (
        <>
            <section className="hero">
                <div className="wrap hero-grid">
                    <div>
                        <h1 className="hero-title">
                            Technology built in Ghana for businesses, schools and communities across Africa.
                        </h1>
                        <p className="hero-lead">
                            Codecastic GH designs software, websites and mobile apps, runs and secures your systems, and
                            trains the people who use them. Our ExamHub portal brings exam practice to students and
                            teachers.
                        </p>
                        <div className="hero-actions">
                            <a className="btn btn-gold" href="#/services">
                                See our services
                            </a>
                            <a className="btn btn-outline" href="#/exams">
                                Try ExamHub
                            </a>
                        </div>
                    </div>

                    <div
                        className="term"
                        role="img"
                        aria-label="What Codecastic GH does: build web, mobile and software. Run cloud, security and support. Advise on IT, data and digital change. Grow skills and marketing."
                    >
                        <div className="term-bar" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </div>
                        <div className="term-body" aria-hidden="true">
                            <div className="term-line">
                                <span className="t-prompt">$</span>
                                <span className="t-cmd">codecastic build</span>web, mobile, software
                            </div>
                            <div className="term-line">
                                <span className="t-prompt">$</span>
                                <span className="t-cmd">codecastic run</span>cloud, security, support
                            </div>
                            <div className="term-line">
                                <span className="t-prompt">$</span>
                                <span className="t-cmd">codecastic advise</span>IT, data, digital
                            </div>
                            <div className="term-line">
                                <span className="t-prompt">$</span>
                                <span className="t-cmd">codecastic grow</span>training, marketing
                            </div>
                            <div className="t-motto">
                                <span className="typed">&gt; Innovating Today, Transforming Tomorrow.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="wrap">
                    <div className="section-head">
                        <h2>What we do</h2>
                        <p>Four ways we help, from the first build to the people who use it every day.</p>
                    </div>
                    <div className="four-cols">
                        {GROUPS.map((g) => (
                            <div className="col-block" key={g.id}>
                                <h3>{g.name}</h3>
                                <p>{g.blurb}</p>
                                <ul>
                                    {g.items.map((s) => (
                                        <li key={s.name}>{s.name}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <p style={{ marginTop: 36 }}>
                        <a className="btn btn-line" href="#/services">
                            Read about each service
                        </a>
                    </p>
                </div>
            </section>

            <section className="section section-white">
                <div className="wrap split" style={{ alignItems: 'start' }}>
                    <div>
                        <h2>ExamHub: practice for school and professional exams</h2>
                        <p>
                            Students pick a level or exam section, answer multiple choice questions and see their score straight
                            away. Teachers and schools can add their own subjects and questions.
                        </p>
                        <a className="btn btn-navy" href="#/exams">
                            Open ExamHub
                        </a>
                    </div>
                    <div>
                        <p style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 12 }}>Jump straight to a section</p>
                        <ul className="pill-list">
                            {TRACKS.map((t) => (
                                <li key={t.slug}>
                                    <a href={`#/exams/${t.slug}`}>{t.label}</a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            <section className="section section-navy">
                <div className="wrap">
                    <h2 style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)' }}>What we stand for</h2>
                    <p className="lead">
                        Our vision is to become a leading technology solutions provider in Africa, empowering people and
                        organisations through innovative digital solutions.
                    </p>
                    <ul className="values-flow">
                        {VALUES.map((v) => (
                            <li key={v.name}>{v.name}</li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className="section">
                <div className="wrap cta-band">
                    <h2>Have a project, a problem or a training need?</h2>
                    <p>Tell us what you are trying to achieve and we will get back to you.</p>
                    <a className="btn btn-navy" href="#/contact">
                        Contact us
                    </a>
                </div>
            </section>
        </>
    );
}

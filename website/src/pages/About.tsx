import { PageHead, MOTTO } from '../ui';
import { VALUES, OBJECTIVES } from '../content';

export default function About() {
    return (
        <>
            <PageHead
                title="A Ghanaian technology company focused on practical results"
                lead="Codecastic GH is a technology and professional services provider helping individuals and organisations grow, learn and work better with digital tools."
            />

            <section className="section">
                <div className="wrap prose">
                    <p>
                        Codecastic GH offers software development, website and mobile app design, IT consultancy, cloud
                        and cybersecurity services, data analytics, digital marketing, technology support and ICT
                        training. We are registered in Ghana and work with clients across the country and beyond.
                    </p>
                    <p>
                        We are guided by a written constitution that sets out how the company is governed, how we
                        treat clients and colleagues, and how we protect the information entrusted to us.
                    </p>
                </div>
            </section>

            <section className="section section-white">
                <div className="wrap statement-grid">
                    <div className="statement">
                        <h2>Our vision</h2>
                        <p>
                            To become a leading technology solutions provider in Africa, empowering individuals and
                            organisations through innovative digital solutions.
                        </p>
                    </div>
                    <div className="statement">
                        <h2>Our mission</h2>
                        <p>
                            To deliver reliable, innovative, secure and affordable technology services that contribute to
                            business growth, educational advancement and digital transformation.
                        </p>
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="wrap">
                    <div className="section-head">
                        <h2>Our core values</h2>
                        <p>These are the standards every member, officer and employee is expected to work by.</p>
                    </div>
                    <ul className="def-grid">
                        {VALUES.map((v) => (
                            <li key={v.name}>
                                <h3>{v.name}</h3>
                                <p>{v.text}</p>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className="section section-white">
                <div className="wrap split" style={{ alignItems: 'start' }}>
                    <div>
                        <h2>What we are working towards</h2>
                        <p>Our objectives shape which projects we take on and how we invest in our team and partners.</p>
                    </div>
                    <ul className="check-list">
                        {OBJECTIVES.map((o) => (
                            <li key={o}>{o}</li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className="motto-band">
                <div className="wrap">
                    <p>{MOTTO}</p>
                </div>
            </section>

            <section className="section">
                <div className="wrap cta-band">
                    <h2>Want to work with us?</h2>
                    <p>We welcome clients, consultants and strategic partners whose work fits our objectives.</p>
                    <a className="btn btn-navy" href="/contact">
                        Get in touch
                    </a>
                </div>
            </section>
        </>
    );
}

import { PageHead } from '../ui';
import { GROUPS } from '../content';

export default function Services() {
    return (
        <>
            <PageHead
                title="Technology services from first build to everyday support"
                lead="Eleven services in four groups. Use one on its own, or combine them as your organisation grows."
            />

            <section className="section" style={{ paddingTop: 24 }}>
                <div className="wrap">
                    {GROUPS.map((g) => (
                        <div className="svc-group" key={g.id}>
                            <div className="svc-intro">
                                <h2>{g.name}</h2>
                                <p>{g.blurb}</p>
                            </div>
                            <ul className="svc-list">
                                {g.items.map((s) => (
                                    <li key={s.name}>
                                        <h3>{s.name}</h3>
                                        <p>{s.desc}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>

            <section className="section section-white">
                <div className="wrap cta-band">
                    <h2>Need something that is not listed?</h2>
                    <p>
                        We take on any lawful work related to information technology and innovation. Describe what you
                        need and we will tell you honestly whether we can help.
                    </p>
                    <a className="btn btn-navy" href="/contact">
                        Request a service
                    </a>
                </div>
            </section>
        </>
    );
}

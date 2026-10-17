import { PageHead } from '../ui';
import { OFFICERS, MEMBERSHIP } from '../content';

export default function Governance() {
    return (
        <>
            <PageHead
                title="How Codecastic GH is governed"
                lead="Our constitution sets out who makes decisions, how money and contracts are handled, and what we promise to clients about conduct and data."
            />

            <section className="section" style={{ paddingBottom: 24 }}>
                <div className="wrap">
                    <div className="section-head" style={{ marginBottom: 16 }}>
                        <h2>Who decides</h2>
                    </div>
                    <div className="role-row">
                        <div>
                            <h3>Board of Directors</h3>
                        </div>
                        <div>
                            <p>
                                Sets the strategic direction, approves major policies, monitors how the organisation is
                                performing and makes sure we comply with the law.
                            </p>
                        </div>
                    </div>
                    <div className="role-row">
                        <div>
                            <h3>Managing Director / CEO</h3>
                        </div>
                        <div>
                            <p>
                                Runs day-to-day operations, carries out the Board’s decisions, represents the company
                                externally and supervises staff and contractors.
                            </p>
                        </div>
                    </div>
                    <div className="role-row">
                        <div>
                            <h3>Management Team</h3>
                        </div>
                        <div>
                            <p>Supports the CEO with operations and the running of each department.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="section section-white">
                <div className="wrap">
                    <div className="section-head">
                        <h2>Principal officers</h2>
                        <p>Further positions are created whenever the company needs them.</p>
                    </div>
                    <ul className="pill-list">
                        {OFFICERS.map((o) => (
                            <li key={o}>{o}</li>
                        ))}
                    </ul>

                    <div className="section-head" style={{ marginTop: 56 }}>
                        <h2>Who we work with</h2>
                        <p>The constitution recognises these categories of people and organisations.</p>
                    </div>
                    <ul className="pill-list">
                        {MEMBERSHIP.map((m) => (
                            <li key={m}>{m}</li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className="section">
                <div className="wrap">
                    <div className="section-head">
                        <h2>How we run the company</h2>
                    </div>
                    <div className="practice-grid">
                        <div>
                            <h3>Meetings</h3>
                            <ul className="check-list">
                                <li>The Board meets at least quarterly, with special meetings when needed.</li>
                                <li>A quorum is at least half of the Board members.</li>
                                <li>Management meets monthly, and the CEO can call emergency meetings.</li>
                            </ul>
                        </div>
                        <div>
                            <h3>Finance and audit</h3>
                            <ul className="check-list">
                                <li>Proper financial records are kept at all times.</li>
                                <li>Company funds are used only for authorised purposes.</li>
                                <li>Annual financial statements are prepared, and independent audits can be carried out.</li>
                            </ul>
                        </div>
                        <div>
                            <h3>Procurement and contracts</h3>
                            <ul className="check-list">
                                <li>Buying follows transparency, fairness and value for money.</li>
                                <li>Contracts above set limits need Board approval.</li>
                                <li>Conflicts of interest must be disclosed before a contract is approved.</li>
                            </ul>
                        </div>
                        <div>
                            <h3>Ethics and data protection</h3>
                            <ul className="check-list">
                                <li>We respect client confidentiality and avoid corruption and bribery.</li>
                                <li>We protect intellectual property and comply with the law.</li>
                                <li>Client data is protected in line with applicable data protection laws.</li>
                                <li>Breaches can lead to disciplinary action or legal proceedings.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}

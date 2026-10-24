import { PageHead } from '../ui';
import { TRACKS } from '../exams';
import ExamHubPortal from '../components/ExamHubPortal';

export default function Exams({ sub }: { sub: string }) {
    const track = TRACKS.find((t) => t.slug === sub);

    if (track) {
        return <ExamHubPortal activeSlug={track.slug} initialLevel={track.code} sectionLabel={`${track.label} practice`} />;
    }

    return (
        <>
            <PageHead
                title="ExamHub: practice for school and professional exams"
                lead="Multiple choice practice from Basic 4 to Basic 9 and SHS 1 to SHS 3, plus sections for the BECE, WASSCE, GTLE and GES promotion exams."
            />

            <section className="section">
                <div className="wrap">
                    <div className="section-head" style={{ marginBottom: 12 }}>
                        <h2>Choose a section</h2>
                        <p>Each section opens the full ExamHub portal where students register or sign in to start practising.</p>
                    </div>
                    {TRACKS.map((t) => (
                        <div className="section-row" key={t.slug}>
                            <div>
                                <h3>
                                    <a href={`/exams/${t.slug}`}>{t.label}</a>
                                </h3>
                                <p className="small">{t.lead}</p>
                            </div>
                            <div>
                                <p style={{ marginBottom: 14 }}>{t.about}</p>
                                <a className="btn btn-navy" style={{ padding: '8px 18px', fontSize: '0.9rem' }} href={`/exams/${t.slug}`}>
                                    Open {t.label} Portal
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </>
    );
}

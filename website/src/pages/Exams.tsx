import { PageHead } from '../ui';
import { TRACKS } from '../exams';
import ExamHubPortal from '../components/ExamHubPortal';

export default function Exams({ sub }: { sub: string }) {
    const track = TRACKS.find((t) => t.slug === sub);

    if (track) {
        return (
            <>
                <PageHead title={track.title} lead={track.lead} />
                <section className="section" style={{ paddingTop: 32 }}>
                    <div className="wrap">
                        <div className="prose" style={{ marginBottom: 32 }}>
                            <p>{track.about}</p>
                        </div>
                        <ExamHubPortal initialLevel={track.code} sectionLabel={`${track.label} practice`} />
                        <p className="note">
                            Enter your name, pick a subject and start. The starter questions in this section are practice
                            questions written for ExamHub, not official past papers. Teachers and administrators can add
                            more from the Admin tab inside the portal.
                        </p>
                    </div>
                </section>
            </>
        );
    }

    return (
        <>
            <PageHead
                title="ExamHub: practice for school and professional exams"
                lead="Multiple choice practice from Basic 4 to Basic 9, plus sections for the BECE, WASSCE, GTLE and GES promotion exams."
            />

            <section className="section">
                <div className="wrap">
                    <div className="section-head" style={{ marginBottom: 12 }}>
                        <h2>Choose a section</h2>
                        <p>Each section opens the exam portal on the right questions for you.</p>
                    </div>
                    {TRACKS.map((t) => (
                        <div className="section-row" key={t.slug}>
                            <div>
                                <h3>
                                    <a href={`#/exams/${t.slug}`}>{t.label}</a>
                                </h3>
                                <p className="small">{t.lead}</p>
                            </div>
                            <p>{t.about}</p>
                        </div>
                    ))}
                </div>
            </section>
        </>
    );
}

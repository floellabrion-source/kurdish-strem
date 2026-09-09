import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
    Brain, CheckCircle2, ArrowRight, ArrowLeft, RotateCcw, 
    Sparkles, Trophy, Award, Film, Play, Star, ShieldCheck, ChevronRight
} from 'lucide-react';
import axios from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './LevelAssessment.css';

interface Question {
    id: number;
    level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
    contextKu?: string;
    contextEn?: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanationKu: string;
    explanationEn: string;
}

const QUESTIONS: Question[] = [
    {
        id: 1,
        level: 'A1',
        contextKu: 'دیالۆگی ناساندنی کەسایەتی:',
        contextEn: 'Character introduction dialogue:',
        question: '"Hello! My name is John and I ______ from London. Nice to meet you."',
        options: ['is', 'come', 'coming', 'comes'],
        correctIndex: 1,
        explanationKu: 'لەگەڵ جێناوی I لە کاتی ئێستای سادەدا وشەی "come" بەکاردێت.',
        explanationEn: 'With the pronoun "I" in Present Simple, the base verb "come" is used.'
    },
    {
        id: 2,
        level: 'A1',
        contextKu: 'دیالۆگی ڕۆژانە لە فیلمێکدا:',
        contextEn: 'Daily movie dialogue:',
        question: '"What time ______ your brother usually wake up in the morning?"',
        options: ['do', 'does', 'is', 'are'],
        correctIndex: 1,
        explanationKu: 'لەبەر ئەوەی "your brother" یەکسانە بە He، لە پرسیاردا "does" بەکاردێت.',
        explanationEn: 'Because "your brother" is third-person singular (he), we use "does" in questions.'
    },
    {
        id: 3,
        level: 'A2',
        contextKu: 'دیمەنی قسەکردن دەربارەی ڕابردوو:',
        contextEn: 'Scene discussing the past:',
        question: '"Did you see that new action movie yesterday?" — "Yes, I ______ it with my friends."',
        options: ['watch', 'watched', 'watching', 'have watched'],
        correctIndex: 1,
        explanationKu: 'لە کاتی ڕابردووی سادەدا (Past Simple) بۆ ڕستەی ئەرێیی شێوازی دووەمی کردار "watched" بەکاردێت.',
        explanationEn: 'In past simple affirmative sentences, the past form "watched" is required.'
    },
    {
        id: 4,
        level: 'A2',
        contextKu: 'داواکردنی ڕێنمایی لە شەقامدا:',
        contextEn: 'Asking for directions in a scene:',
        question: '"Excuse me officer, ______ you please tell me where the nearest cinema is?"',
        options: ['should', 'could', 'must', 'might'],
        correctIndex: 1,
        explanationKu: '"Could you please" شێوازێکی زۆر ڕێزدارە بۆ داواکردن و پرسیارکردن.',
        explanationEn: '"Could you please" is the polite modal phrase for making requests.'
    },
    {
        id: 5,
        level: 'B1',
        contextKu: 'دیمەنی لێکۆڵینەوە لە تاوان:',
        contextEn: 'Detective crime investigation scene:',
        question: 'The detective decided to ______ the investigation until they received more solid evidence.',
        options: ['call off', 'put off', 'look into', 'give up'],
        correctIndex: 1,
        explanationKu: '"Put off" واتای دواخستن (postpone) دەگەیەنێت.',
        explanationEn: '"Put off" is a phrasal verb meaning to postpone or delay an action.'
    },
    {
        id: 6,
        level: 'B1',
        contextKu: 'دیمەنی پەشیمانی و هەڵبژاردن:',
        contextEn: 'Scene expressing regret/conditionals:',
        question: '"If they ______ the flight on time, they wouldn\'t have missed the main event."',
        options: ['boarded', 'had boarded', 'would board', 'have boarded'],
        correctIndex: 1,
        explanationKu: 'لە مەرجی جۆری سێیەمدا (Third Conditional) لە بەشی If دەبێت Past Perfect (had + V3) دابنرێت.',
        explanationEn: 'In the Third Conditional, the "if" clause takes the Past Perfect (had + past participle).'
    },
    {
        id: 7,
        level: 'B1',
        contextKu: 'تێگەیشتن لە ئیدیۆم لە دیالۆگی کارەکتەر:',
        contextEn: 'Understanding dialogue idioms:',
        question: 'A character says: "I can\'t attend the meeting today because I\'m feeling under the weather." What does she mean?',
        options: ['She is enjoying the rainy weather.', 'She is feeling slightly sick or unwell.', 'She is traveling abroad.', 'She is very excited.'],
        correctIndex: 1,
        explanationKu: '"Feeling under the weather" ئیدیۆمێکە بە واتای هەستکردن بە نەخۆشی یان بێتاقەتی دێت.',
        explanationEn: '"Under the weather" is an idiom meaning feeling unwell or slightly sick.'
    },
    {
        id: 8,
        level: 'B2',
        contextKu: 'کەوالیزی شانۆ و فیلم:',
        contextEn: 'Behind the scenes movie moment:',
        question: 'Before walking onto the main stage, the director told the lead actor to "break a leg!". He was wishing him:',
        options: ['To be careful not to injure himself.', 'Good luck with his performance.', 'To hurry up quickly.', 'To stop performing immediately.'],
        correctIndex: 1,
        explanationKu: '"Break a leg" لە زمانی سینەمایی و شانۆدا بە واتای هیوای سەرکەوتن (Good luck) دێت.',
        explanationEn: '"Break a leg" is an idiom used in theatre/cinema to wish performers good luck.'
    },
    {
        id: 9,
        level: 'B2',
        contextKu: 'ڕستەی پێکەوەبەستنی ئاڵۆز:',
        contextEn: 'Complex sentence clause linking:',
        question: 'The film crew managed to finish shooting on schedule ______ the severe weather conditions and limited budget.',
        options: ['despite', 'although', 'even though', 'whereas'],
        correctIndex: 0,
        explanationKu: '"Despite" لەگەڵ وشەی ناوی یان دەستەواژەی ناویدا بەکاردێت بەبێ پێویستی بە کردار.',
        explanationEn: '"Despite" is followed by a noun phrase ("the severe weather conditions").'
    },
    {
        id: 10,
        level: 'B2',
        contextKu: 'وەسفکردنی کۆتایی فیلم:',
        contextEn: 'Describing a plot twist:',
        question: 'The plot twist at the end of the thriller was completely ______; nobody in the cinema anticipated it.',
        options: ['predictable', 'unforeseen', 'mundane', 'tedious'],
        correctIndex: 1,
        explanationKu: '"Unforeseen" بە واتای چاوەڕواننەکراو و پێشبینینەکراو دێت.',
        explanationEn: '"Unforeseen" means not anticipated or expected in advance.'
    },
    {
        id: 11,
        level: 'C1',
        contextKu: 'شیکاری ڕەخنەگرانی سینەما:',
        contextEn: 'Film critique commentary:',
        question: 'The historical documentary delivered a profound and ______ critique of economic inequality in the 20th century.',
        options: ['incisive', 'superficial', 'negligible', 'ambiguous'],
        correctIndex: 0,
        explanationKu: '"Incisive" وشەیەکی ئەکادیمی و پێشکەوتووە بە واتای قووڵ، ورد، و پڕ کاریگەر.',
        explanationEn: '"Incisive" is an advanced adjective meaning clear, sharp, penetrating, and profoundly analytical.'
    },
    {
        id: 12,
        level: 'C1',
        contextKu: 'تێگەیشتن لە لێکدانەوەی قووڵی کارەکتەر:',
        contextEn: 'Deep character dialogue inference:',
        question: 'The protagonist noted: "He possesses a silver tongue, yet his track record is fraught with deceit." The phrase "a silver tongue" implies:',
        options: ['Speaking with a strange foreign accent.', 'An extraordinary ability to speak persuasively and eloquently.', 'Staying completely silent during arguments.', 'Having expensive tastes.'],
        correctIndex: 1,
        explanationKu: '"A silver tongue" واتای زمانی پاراو، قسەخۆش و خاوەن توانای قەناعەتپێکەر دەگەیەنێت.',
        explanationEn: '"Silver tongue" denotes eloquence, charm, and the ability to persuade effortlessly through speech.'
    }
];

const LEVEL_DETAILS: Record<string, { titleKu: string, titleEn: string, badgeColor: string, descKu: string, descEn: string }> = {
    'A1': {
        titleKu: 'سەرەتایی (Beginner)',
        titleEn: 'Beginner (A1)',
        badgeColor: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        descKu: 'تۆ لە سەرەتای فێربووندایت! ئەنیمەیشن و کورتەفیلمە ئاسانەکان لەگەڵ سەبتایتڵی هاوکات باشترین بژاردەن بۆت.',
        descEn: 'You are at the beginner stage! Animations and family movies with dual subtitles will boost your foundation rapidly.'
    },
    'A2': {
        titleKu: 'بنەڕەتی (Elementary)',
        titleEn: 'Elementary (A2)',
        badgeColor: 'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)',
        descKu: 'ئاستێکی باشت هەیە لە دەستەواژە و دیالۆگە ڕۆژانەییەکان! فیلمە خێزانی و کۆمێدییەکان زۆر باشن بۆ خێرابوونت.',
        descEn: 'You have a good grasp of everyday expressions. Comedy and drama movies will help expand your vocabulary.'
    },
    'B1': {
        titleKu: 'مامناوەند (Intermediate)',
        titleEn: 'Intermediate (B1)',
        badgeColor: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
        descKu: 'ئاستێکی زۆر بەهێز! تۆ دەتوانیت لە زۆربەی زنجیرە و فیلمە دراماکان بە باشی تێبگەیت و ئیدیۆمەکان بەکاربهێنیت.',
        descEn: 'Strong intermediate level! You can follow the plot of most mainstream movies and grasp conversational idioms.'
    },
    'B2': {
        titleKu: 'سەروو مامناوەند (Upper Intermediate)',
        titleEn: 'Upper Intermediate (B2)',
        badgeColor: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        descKu: 'ئاستێکی نایاب! تۆ دەتوانیت لە فیلمە هەستبزوێن و ئاڵۆزەکان تێبگەیت بە بێ ئەوەی پێویستت بە سەبتایتڵی کوردی بێت.',
        descEn: 'Impressive fluency! You understand nuanced subtext, humor, and complex plots with minimal subtitle reliance.'
    },
    'C1': {
        titleKu: 'پێشکەوتوو (Advanced)',
        titleEn: 'Advanced (C1)',
        badgeColor: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
        descKu: 'ئاستی ماستەر و پێشکەوتوو! تۆ خاوەنی فەرهەنگێکی دەوڵەمەندی و دەتوانیت لە دۆکیۆمێنتاری و وتووێژە ئەکادیمییەکان تێبگەیت.',
        descEn: 'Mastery level! You effortlessly comprehend academic documentaries, historical dramas, and subtle linguistic artistry.'
    }
};

export default function LevelAssessment() {
    const navigate = useNavigate();
    const { user, syncProgress } = useAuth();
    const { lang, t } = useLanguage();

    const [hasStarted, setHasStarted] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
    const [isFinished, setIsFinished] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showExplanation, setShowExplanation] = useState(false);

    const currentQ = QUESTIONS[currentIndex];
    const totalQuestions = QUESTIONS.length;
    const progressPercent = Math.round(((currentIndex + 1) / totalQuestions) * 100);

    const handleSelectOption = (optIndex: number) => {
        setSelectedAnswers(prev => ({ ...prev, [currentIndex]: optIndex }));
        setShowExplanation(true);
    };

    const handleNext = () => {
        setShowExplanation(false);
        if (currentIndex + 1 < totalQuestions) {
            setCurrentIndex(prev => prev + 1);
        } else {
            finishAssessment();
        }
    };

    const handlePrevious = () => {
        if (currentIndex > 0) {
            setShowExplanation(false);
            setCurrentIndex(prev => prev - 1);
        }
    };

    const calculateScoreAndLevel = () => {
        let correctCount = 0;
        QUESTIONS.forEach((q, idx) => {
            if (selectedAnswers[idx] === q.correctIndex) {
                correctCount += 1;
            }
        });

        let assignedLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' = 'A1';
        if (correctCount <= 3) assignedLevel = 'A1';
        else if (correctCount <= 5) assignedLevel = 'A2';
        else if (correctCount <= 8) assignedLevel = 'B1';
        else if (correctCount <= 10) assignedLevel = 'B2';
        else assignedLevel = 'C1';

        return { correctCount, assignedLevel };
    };

    const finishAssessment = async () => {
        setIsFinished(true);
        const { correctCount, assignedLevel } = calculateScoreAndLevel();

        try {
            localStorage.setItem('kurdish_stream_user_level', assignedLevel);
            localStorage.setItem('kurdish_stream_assessment_date', Date.now().toString());
        } catch {}

        if (user) {
            setIsSaving(true);
            try {
                await axios.post('/api/user/level', {
                    level: assignedLevel,
                    assessmentResult: {
                        level: assignedLevel,
                        score: correctCount,
                        total: totalQuestions,
                        date: Date.now()
                    }
                });
                await syncProgress({
                    level: assignedLevel,
                    assessmentResult: {
                        level: assignedLevel,
                        score: correctCount,
                        total: totalQuestions,
                        date: Date.now()
                    }
                });
            } catch (err) {
                console.error('Failed to save assessment level:', err);
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleRestart = () => {
        setSelectedAnswers({});
        setCurrentIndex(0);
        setIsFinished(false);
        setHasStarted(false);
        setShowExplanation(false);
    };

    if (!user) {
        return (
            <div className="assessment-page">
                <div className="assessment-welcome-card glass auth-lock-card">
                    <div className="welcome-badge auth-badge">
                        <ShieldCheck size={16} /> {lang === 'en' ? 'Account Required' : 'پێویستی بە هەژمارە'}
                    </div>
                    <div className="auth-lock-icon-wrap">
                        <Brain size={44} className="auth-lock-icon" />
                    </div>
                    <h1 className="welcome-title">
                        {lang === 'en' ? 'Log in to take the Level Assessment' : 'دیاریکردنی ئاستی زمان پێویستی بە هەژمارە'}
                    </h1>
                    <p className="welcome-subtitle">
                        {lang === 'en' 
                            ? 'To take the 12-question movie-based assessment and save your official CEFR level (A1 - C1) to your profile, please log in or create an account.' 
                            : 'بۆ ئەوەی بتوانیت تاقیکردنەوەی ١٢ پرسیاری ستانداردی زمانی ئینگلیزی ئەنجام بدەیت و ئاستەکەت (A1 تا C1) لەسەر پرۆفایلەکەت پاشەکەوت بکرێت، تکایە سەرەتا بچۆ ژوورەوە یان خۆت تۆمار بکە.'}
                    </p>
                    <div className="welcome-actions">
                        <button className="btn-start-test" onClick={() => navigate('/auth')}>
                            <Sparkles size={18} /> {lang === 'en' ? 'Log In / Sign Up' : 'چوونەژوورەوە / خۆت تۆمار بکە'}
                        </button>
                        <Link to="/" className="btn-skip-test">
                            {lang === 'en' ? 'Back to Home' : 'گەڕانەوە بۆ سەرەکی'}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (!hasStarted) {
        return (
            <div className="assessment-page">
                <div className="assessment-welcome-card glass">
                    <div className="welcome-badge">
                        <Sparkles size={16} /> {lang === 'en' ? 'CEFR English Placement' : 'تاقیکردنەوەی ستانداردی CEFR'}
                    </div>
                    <h1 className="welcome-title">
                        {lang === 'en' ? 'Discover Your True English Level' : 'ئاستی ڕاستەقینەی زمانی ئینگلیزیت بزانە'}
                    </h1>
                    <p className="welcome-subtitle">
                        {lang === 'en' 
                            ? 'Answer 12 movie-based interactive questions to find out your CEFR proficiency level (A1 to C1) and receive personalized movie recommendations.' 
                            : 'لە ڕێگەی ١٢ پرسیاری کارلێککار و دیمەنی سینەمایی، ئاستی زمانی خۆت (A1 تا C1) دیاری بکە بۆ ئەوەی فیلم و زنجیرەی گونجاو بە ئاستەکەت بۆ پێشنیار بکرێت.'}
                    </p>

                    <div className="welcome-features-grid">
                        <div className="feat-box">
                            <Brain size={22} className="feat-icon" />
                            <h4>{lang === 'en' ? '12 Practical Questions' : '١٢ پرسیاری دیالۆگی'}</h4>
                            <p>{lang === 'en' ? 'Evaluates vocabulary, grammar & subtext' : 'شیکاری وشە، ڕێزمان و تێگەیشتن'}</p>
                        </div>
                        <div className="feat-box">
                            <Trophy size={22} className="feat-icon" />
                            <h4>{lang === 'en' ? 'Instant CEFR Rating' : 'پلەبەندی ڕاستەوخۆ'}</h4>
                            <p>{lang === 'en' ? 'Accurate level from A1 to C1' : 'دیاریکردنی ئاستی A1 تا C1'}</p>
                        </div>
                        <div className="feat-box">
                            <Film size={22} className="feat-icon" />
                            <h4>{lang === 'en' ? 'Smart Recommendations' : 'پێشنیاری زیرەک'}</h4>
                            <p>{lang === 'en' ? 'Curated movies matching your level' : 'فیلمی گونجاو لەگەڵ ئاستەکەت'}</p>
                        </div>
                    </div>

                    {user?.level && (
                        <div className="current-level-banner">
                            <Award size={18} />
                            <span>
                                {lang === 'en' ? `Your current saved level: ${user.level}` : `ئاستی تۆمارکراوی ئێستات: ${user.level}`}
                            </span>
                        </div>
                    )}

                    <div className="welcome-actions">
                        <button className="btn-start-test" onClick={() => setHasStarted(true)}>
                            <Play size={18} /> {lang === 'en' ? 'Start' : 'دەستپێکردن'}
                        </button>
                        <Link to="/" className="btn-skip-test">
                            {lang === 'en' ? 'Movies' : 'فیلمەکان'}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (isFinished) {
        const { correctCount, assignedLevel } = calculateScoreAndLevel();
        const details = LEVEL_DETAILS[assignedLevel];

        return (
            <div className="assessment-page">
                <div className="assessment-result-card glass">
                    <div className="result-header-glow" style={{ background: details.badgeColor }}></div>
                    <div className="result-trophy-wrapper">
                        <Trophy size={48} className="trophy-icon" />
                    </div>

                    <h2 className="result-congrats">
                        {lang === 'en' ? '🎉 Congratulations on Completing!' : '🎉 دەستخۆش، تاقیکردنەوەکەت تەواو کرد!'}
                    </h2>
                    <p className="result-score-text">
                        {lang === 'en' 
                            ? `You answered ${correctCount} out of ${totalQuestions} questions correctly.` 
                            : `توانیت وەڵامی دروستی ${correctCount} لە کۆی ${totalQuestions} پرسیار بدەیتەوە.`}
                    </p>

                    <div className="result-level-badge-box" style={{ background: details.badgeColor }}>
                        <span className="level-code">{assignedLevel}</span>
                        <span className="level-name">{lang === 'en' ? details.titleEn : details.titleKu}</span>
                    </div>

                    <p className="result-desc">
                        {lang === 'en' ? details.descEn : details.descKu}
                    </p>

                    <div className="result-actions">
                        <button 
                            className="btn-explore-level"
                            onClick={() => navigate(`/?level=${assignedLevel}`)}
                        >
                            <Film size={18} /> {lang === 'en' ? `Watch ${assignedLevel} Recommended Movies` : `فیلمە پێشنیارکراوەکانی ئاستی ${assignedLevel}`}
                        </button>
                        <button className="btn-retake" onClick={handleRestart}>
                            <RotateCcw size={16} /> {lang === 'en' ? 'Retake Test' : 'دووبارەکردنەوەی تاقیکردنەوە'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const isSelected = selectedAnswers[currentIndex] !== undefined;

    return (
        <div className="assessment-page">
            <div className="assessment-quiz-card glass">
                {/* Header & Progress */}
                <div className="quiz-header">
                    <div className="quiz-meta-info">
                        <span className="q-counter">
                            {lang === 'en' ? `Question ${currentIndex + 1} of ${totalQuestions}` : `پرسیاری ${currentIndex + 1} لە ${totalQuestions}`}
                        </span>
                        <span className="q-level-tag">{currentQ.level}</span>
                    </div>
                    <div className="quiz-progress-bar-wrap">
                        <div className="quiz-progress-fill" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                </div>

                {/* Question Body */}
                <div className="question-content">
                    <div className="question-context">
                        <Film size={15} />
                        <span>{lang === 'en' ? currentQ.contextEn : currentQ.contextKu}</span>
                    </div>

                    <h3 className="question-text">{currentQ.question}</h3>

                    {/* Options */}
                    <div className="options-grid">
                        {currentQ.options.map((opt, idx) => {
                            const isChosen = selectedAnswers[currentIndex] === idx;
                            const isCorrect = idx === currentQ.correctIndex;
                            let btnClass = 'quiz-option-btn';

                            if (isSelected) {
                                if (isCorrect) btnClass += ' correct';
                                else if (isChosen) btnClass += ' incorrect';
                            } else if (isChosen) {
                                btnClass += ' selected';
                            }

                            return (
                                <button
                                    key={idx}
                                    className={btnClass}
                                    onClick={() => handleSelectOption(idx)}
                                >
                                    <span className="opt-letter">{String.fromCharCode(65 + idx)}</span>
                                    <span className="opt-text">{opt}</span>
                                    {isSelected && isCorrect && <CheckCircle2 size={18} className="status-icon" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Explanation Box */}
                    {isSelected && (
                        <div className="explanation-box animated-fade">
                            <div className="explanation-title">
                                <Sparkles size={16} /> {lang === 'en' ? 'Explanation:' : 'ڕوونکردنەوەی فێرکاری:'}
                            </div>
                            <p>{lang === 'en' ? currentQ.explanationEn : currentQ.explanationKu}</p>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="quiz-footer">
                    <button 
                        className="btn-quiz-nav prev" 
                        onClick={handlePrevious}
                        disabled={currentIndex === 0}
                    >
                        <ArrowLeft size={16} /> {lang === 'en' ? 'Previous' : 'پێشوو'}
                    </button>

                    <button 
                        className="btn-quiz-nav next"
                        onClick={handleNext}
                        disabled={!isSelected}
                    >
                        <span>{currentIndex + 1 === totalQuestions ? (lang === 'en' ? 'See My Results 🎉' : 'بینینی ئەنجام 🎉') : (lang === 'en' ? 'Next Question' : 'پرسیاری دواتر')}</span>
                        <ArrowRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}

import { User } from '../types';

export interface AchievementBadge {
    id: string;
    titleKu: string;
    titleEn: string;
    descKu: string;
    descEn: string;
    category: 'streak' | 'flashcards' | 'watch' | 'assessment' | 'credits' | 'mastery';
    tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    iconName: string;
    currentValue: number;
    targetValue: number;
    isUnlocked: boolean;
    unlockedAt?: number;
    xpReward: number;
}

export interface UserRankInfo {
    level: number;
    titleKu: string;
    titleEn: string;
    currentXP: number;
    nextLevelXP: number;
    progressPercent: number;
}

export function calculateUserXP(user: User | null): number {
    if (!user) return 0;
    let xp = 0;

    // Points from activities
    xp += (user.points || 0) * 10;

    // Flashcards created
    xp += (user.flashcards?.length || 0) * 15;

    // Watch stats
    const totalMinutes = Object.values(user.dailyStats || {}).reduce((acc, curr) => acc + (curr.watchMinutes || 0), 0);
    xp += Math.floor(totalMinutes * 2);

    // CEFR test completed bonus
    if (user.level) xp += 100;

    // Credits bonus
    if ((user.credits || 0) > 0) xp += 50;

    return Math.max(0, xp);
}

export function getUserRank(xp: number): UserRankInfo {
    const RANKS = [
        { level: 1, titleKu: 'دەستپێکەری نوێ', titleEn: 'Novice Explorer', maxXP: 150 },
        { level: 2, titleKu: 'قوتابیی بەردەوام', titleEn: 'Dedicated Learner', maxXP: 450 },
        { level: 3, titleKu: 'شەیدای سینەما', titleEn: 'Cinema Polyglot', maxXP: 1000 },
        { level: 4, titleKu: 'شارەزای زمان', titleEn: 'Language Scholar', maxXP: 2500 },
        { level: 5, titleKu: 'ماستەری KST 👑', titleEn: 'KST Master 👑', maxXP: 6000 },
    ];

    let currentRank = RANKS[0];
    let prevMaxXP = 0;

    for (let i = 0; i < RANKS.length; i++) {
        if (xp < RANKS[i].maxXP) {
            currentRank = RANKS[i];
            prevMaxXP = i > 0 ? RANKS[i - 1].maxXP : 0;
            break;
        }
        if (i === RANKS.length - 1) {
            currentRank = RANKS[i];
            prevMaxXP = RANKS[i - 1].maxXP;
        }
    }

    const range = currentRank.maxXP - prevMaxXP;
    const currentInRange = xp - prevMaxXP;
    const progressPercent = Math.min(100, Math.max(5, Math.round((currentInRange / range) * 100)));

    return {
        level: currentRank.level,
        titleKu: currentRank.titleKu,
        titleEn: currentRank.titleEn,
        currentXP: xp,
        nextLevelXP: currentRank.maxXP,
        progressPercent
    };
}

export function calculateAchievements(user: User | null, streakDays: number = 0): AchievementBadge[] {
    if (!user) return [];

    const flashcardsCount = user.flashcards?.length || 0;
    const totalWatchMinutes = Object.values(user.dailyStats || {}).reduce((acc, curr) => acc + (curr.watchMinutes || 0), 0);
    const totalSentences = Object.values(user.dailyStats || {}).reduce((acc, curr) => acc + (curr.sentencesSeen || 0), 0);
    const hasLevel = Boolean(user.level || localStorage.getItem('kurdish_stream_user_level'));
    const credits = user.credits || 0;

    const badges: AchievementBadge[] = [
        // 1. Streak Badges
        {
            id: 'streak_3',
            titleKu: 'بەردەوامیی ٣ ڕۆژە',
            titleEn: '3-Day Fire',
            descKu: '٣ ڕۆژ بە بەردەوامی سەردانی پلاتفۆرم بکە و فێربە.',
            descEn: 'Maintain a 3-day active learning streak.',
            category: 'streak',
            tier: 'bronze',
            iconName: 'Flame',
            currentValue: streakDays,
            targetValue: 3,
            isUnlocked: streakDays >= 3,
            xpReward: 50
        },
        {
            id: 'streak_7',
            titleKu: 'پاڵەوانی هەفتانە',
            titleEn: 'Week Champion',
            descKu: '٧ ڕۆژ بە بەردەوامی بەشداری بکە و ئامانجت بپێکە.',
            descEn: 'Achieve a full 7-day learning streak.',
            category: 'streak',
            tier: 'silver',
            iconName: 'Zap',
            currentValue: streakDays,
            targetValue: 7,
            isUnlocked: streakDays >= 7,
            xpReward: 120
        },
        {
            id: 'streak_30',
            titleKu: 'ئەفسانەی بەردەوامی',
            titleEn: 'Monthly Legend',
            descKu: '٣٠ ڕۆژ بە بەردەوامی ڕاهێنان بکە.',
            descEn: 'Reach a legendary 30-day streak.',
            category: 'streak',
            tier: 'gold',
            iconName: 'Crown',
            currentValue: streakDays,
            targetValue: 30,
            isUnlocked: streakDays >= 30,
            xpReward: 500
        },

        // 2. Flashcards Badges
        {
            id: 'flashcards_10',
            titleKu: 'کۆکەرەوەی وشە',
            titleEn: 'Word Collector',
            descKu: '١٠ وشەی گرنگ لە سەبتایتڵەوە بخەرە فلاشکارت.',
            descEn: 'Save 10 difficult words to your flashcards.',
            category: 'flashcards',
            tier: 'bronze',
            iconName: 'BookOpen',
            currentValue: flashcardsCount,
            targetValue: 10,
            isUnlocked: flashcardsCount >= 10,
            xpReward: 40
        },
        {
            id: 'flashcards_50',
            titleKu: 'فەرهەنگی وشەسازی',
            titleEn: 'Vocabulary Builder',
            descKu: '٥٠ وشەی ئینگلیزی لە فلاشکارت پاشەکەوت بکە.',
            descEn: 'Accumulate 50 saved flashcard words.',
            category: 'flashcards',
            tier: 'silver',
            iconName: 'Library',
            currentValue: flashcardsCount,
            targetValue: 50,
            isUnlocked: flashcardsCount >= 50,
            xpReward: 150
        },
        {
            id: 'flashcards_150',
            titleKu: 'ماستەری فلاشکارت',
            titleEn: 'Flashcard Grandmaster',
            descKu: '١٥٠ وشەی بەپێز کۆبکەرەوە و فێربە.',
            descEn: 'Master 150 vocabulary flashcards.',
            category: 'flashcards',
            tier: 'gold',
            iconName: 'Sparkles',
            currentValue: flashcardsCount,
            targetValue: 150,
            isUnlocked: flashcardsCount >= 150,
            xpReward: 400
        },

        // 3. Watch Time Badges
        {
            id: 'watch_30m',
            titleKu: 'هەنگاوی یەکەمی بینین',
            titleEn: 'First Cinema Hour',
            descKu: '٣٠ خولەک لە سەیرکردنی فیلم و فێربوون بەسەربەرە.',
            descEn: 'Watch movies for at least 30 minutes.',
            category: 'watch',
            tier: 'bronze',
            iconName: 'Film',
            currentValue: Math.round(totalWatchMinutes),
            targetValue: 30,
            isUnlocked: totalWatchMinutes >= 30,
            xpReward: 30
        },
        {
            id: 'watch_180m',
            titleKu: 'شەیدای دراما و فلیم',
            titleEn: 'Binge Learner',
            descKu: '٣ کاتژمێر (١٨٠ خولەک) سەیری بەرهەمەکان بکە بە سەبتایتڵ.',
            descEn: 'Complete 3 full hours of movie immersion.',
            category: 'watch',
            tier: 'silver',
            iconName: 'Tv',
            currentValue: Math.round(totalWatchMinutes),
            targetValue: 180,
            isUnlocked: totalWatchMinutes >= 180,
            xpReward: 150
        },
        {
            id: 'watch_600m',
            titleKu: 'سینەفیلی پڕۆفیشناڵ',
            titleEn: 'Cinema Polyglot Pro',
            descKu: '١٠ کاتژمێر (٦٠٠ خولەک) بە فێربوون و بینین بەڕێبکە.',
            descEn: 'Reach 10 hours of active immersion watching.',
            category: 'watch',
            tier: 'gold',
            iconName: 'Award',
            currentValue: Math.round(totalWatchMinutes),
            targetValue: 600,
            isUnlocked: totalWatchMinutes >= 600,
            xpReward: 450
        },

        // 4. CEFR & Placement Badges
        {
            id: 'placement_tested',
            titleKu: 'ئاستی سەلمێنراوی CEFR',
            titleEn: 'CEFR Verified',
            descKu: 'تاقیکردنەوەی ئاستی زمانی ئینگلیزیت بە سەرکەوتوویی تەواو کرد.',
            descEn: 'Completed the CEFR placement assessment.',
            category: 'assessment',
            tier: 'platinum',
            iconName: 'Brain',
            currentValue: hasLevel ? 1 : 0,
            targetValue: 1,
            isUnlocked: hasLevel,
            xpReward: 100
        },

        // 5. Sentences & Pronunciation Badges
        {
            id: 'sentences_50',
            titleKu: 'گوێگری دیالۆگ',
            titleEn: 'Dialogue Listener',
            descKu: '٥٠ ڕستەی دیالۆگی سینەمایت شی کردۆتەوە.',
            descEn: 'Encountered and reviewed 50 subtitle dialogue lines.',
            category: 'mastery',
            tier: 'silver',
            iconName: 'MessageSquare',
            currentValue: totalSentences,
            targetValue: 50,
            isUnlocked: totalSentences >= 50,
            xpReward: 80
        },

        // 6. Pro / Credits Supporter Badge
        {
            id: 'credit_vip',
            titleKu: 'پاڵپشتیکاری KST',
            titleEn: 'KST VIP Supporter',
            descKu: 'خاوەنی باڵانسی کرێدیت یان پاکێجی تایبەت بە AI.',
            descEn: 'Possess active AI credits balance for continuous learning.',
            category: 'credits',
            tier: 'platinum',
            iconName: 'ShieldCheck',
            currentValue: credits,
            targetValue: 100,
            isUnlocked: credits >= 100,
            xpReward: 200
        }
    ];

    return badges;
}

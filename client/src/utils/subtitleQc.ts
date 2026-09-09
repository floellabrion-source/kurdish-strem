export interface QcIssue {
    id: string;
    lineId: number;
    lineIndex: number;
    type: 'overlap' | 'cps' | 'length' | 'too_short' | 'empty' | 'untranslated' | 'invalid_time' | 'formatting';
    severity: 'critical' | 'warning' | 'suggestion';
    title: string;
    description: string;
    currentValue?: string | number;
    suggestedValue?: string | number;
    canAutoFix: boolean;
}

export interface QcReport {
    totalIssues: number;
    criticalCount: number;
    warningCount: number;
    suggestionCount: number;
    score: number; // 0 to 100
    issues: QcIssue[];
}

export interface SubtitleLineData {
    id: number;
    startTime: string;
    endTime: string;
    startSec: number;
    endSec: number;
    english: string;
    kurdish: string;
}

export const secToTimeString = (sec: number): string => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

/**
 * Runs comprehensive Quality Control checks on a list of subtitle lines
 */
export const runSubtitleQc = (lines: SubtitleLineData[]): QcReport => {
    const issues: QcIssue[] = [];

    if (!lines || lines.length === 0) {
        return {
            totalIssues: 0,
            criticalCount: 0,
            warningCount: 0,
            suggestionCount: 0,
            score: 100,
            issues: []
        };
    }

    lines.forEach((line, idx) => {
        const kurdishText = (line.kurdish || '').trim();
        const englishText = (line.english || '').trim();
        const duration = line.endSec - line.startSec;

        // 1. Invalid or Zero Duration
        if (duration <= 0) {
            issues.push({
                id: `inv_time_${line.id}`,
                lineId: line.id,
                lineIndex: idx,
                type: 'invalid_time',
                severity: 'critical',
                title: 'کاتی نادروست یان سفر',
                description: `کاتی کۆتایی (${line.endTime}) یەکسانە یان پێش کاتی دەستپێکە (${line.startTime}).`,
                canAutoFix: true
            });
        } else if (duration < 0.6 && kurdishText.length > 0) {
            // 2. Too short duration
            issues.push({
                id: `too_short_${line.id}`,
                lineId: line.id,
                lineIndex: idx,
                type: 'too_short',
                severity: 'warning',
                title: 'کاتی کورت بۆ بینین',
                description: `کاتی پیشاندانی دێڕەکە تەنها (${duration.toFixed(2)} چرکە)یە کە زۆر کورتە بۆ خوێندنەوە.`,
                currentValue: `${duration.toFixed(2)}s`,
                suggestedValue: 'لانی کەم 1.0s',
                canAutoFix: true
            });
        }

        // 3. Time Overlaps with Next Line
        if (idx < lines.length - 1) {
            const nextLine = lines[idx + 1];
            if (line.endSec > nextLine.startSec) {
                const overlapAmount = line.endSec - nextLine.startSec;
                issues.push({
                    id: `overlap_${line.id}_${nextLine.id}`,
                    lineId: line.id,
                    lineIndex: idx,
                    type: 'overlap',
                    severity: 'critical',
                    title: 'پێکداچوونی کات لەگەڵ دێڕی دواتر',
                    description: `کۆتایی ئەم دێڕە بە بڕی (${(overlapAmount * 1000).toFixed(0)} میلی چرکە) دەچێتە ناو دەستپێکی دێڕی #${nextLine.id}.`,
                    currentValue: `${(overlapAmount * 1000).toFixed(0)}ms`,
                    suggestedValue: secToTimeString(Math.max(line.startSec + 0.5, nextLine.startSec - 0.05)),
                    canAutoFix: true
                });
            }
        }

        // 4. Missing or Empty Kurdish Translation
        if (englishText.length > 0 && kurdishText.length === 0) {
            issues.push({
                id: `empty_${line.id}`,
                lineId: line.id,
                lineIndex: idx,
                type: 'empty',
                severity: 'critical',
                title: 'دێڕی بەتاڵ (وەرنەگێڕدراو)',
                description: 'دەقی ئینگلیزی هەیە بەڵام دەقی وەرگێڕانی کوردی بەتاڵ بەجێماوە.',
                canAutoFix: false
            });
        }

        // 5. Untranslated Raw English in Kurdish Slot
        if (kurdishText.length > 3 && englishText.length > 3 && kurdishText.toLowerCase() === englishText.toLowerCase()) {
            issues.push({
                id: `untrans_${line.id}`,
                lineId: line.id,
                lineIndex: idx,
                type: 'untranslated',
                severity: 'critical',
                title: 'دەقی ئینگلیزی لە خانەی کوردی',
                description: 'دەقی کوردییەکە وەرنەگێڕدراوە و بە هەمان دەقی ئینگلیزی بەجێهێڵراوە.',
                canAutoFix: false
            });
        }

        // 6. Characters Per Second (Reading Speed CPS)
        if (duration > 0 && kurdishText.length > 0) {
            const cps = kurdishText.length / duration;
            if (cps > 25) {
                issues.push({
                    id: `cps_crit_${line.id}`,
                    lineId: line.id,
                    lineIndex: idx,
                    type: 'cps',
                    severity: 'critical',
                    title: 'خێرایی زۆر لەڕادەبەدەر (CPS)',
                    description: `خێرایی خوێندنەوە (${cps.toFixed(1)} پیت لە چرکەیەکدا)یە. بینەر ناتوانێت فریای بکەوێت.`,
                    currentValue: `${cps.toFixed(1)} CPS`,
                    suggestedValue: 'کەمتر لە 20 CPS',
                    canAutoFix: false
                });
            } else if (cps > 20) {
                issues.push({
                    id: `cps_warn_${line.id}`,
                    lineId: line.id,
                    lineIndex: idx,
                    type: 'cps',
                    severity: 'warning',
                    title: 'خێرایی بەرز (CPS)',
                    description: `خێرایی خوێندنەوە (${cps.toFixed(1)} پیت لە چرکەیەکدا) کەمێک بەرزە. پێشنیاز دەکرێت کاتەکەی زیاد بکرێت یان دەقەکە کورت بکرێتەوە.`,
                    currentValue: `${cps.toFixed(1)} CPS`,
                    suggestedValue: 'کەمتر لە 18 CPS',
                    canAutoFix: false
                });
            }
        }

        // 7. Line Length & Multi-line Overflow
        if (kurdishText.length > 0) {
            const subLines = kurdishText.split('\n');
            if (subLines.length > 2) {
                issues.push({
                    id: `lines_overflow_${line.id}`,
                    lineId: line.id,
                    lineIndex: idx,
                    type: 'length',
                    severity: 'warning',
                    title: 'زیاتر لە ٢ دێڕ لە یەک کاتدا',
                    description: `ئەم ژێرنووسە دابەشکراوە بەسەر (${subLines.length}) دێڕدا کە دەبێتە هۆی داگیرکردنی شاشە. ڕێژەی ستاندارد ١ بۆ ٢ دێڕە.`,
                    canAutoFix: true
                });
            }

            subLines.forEach((sLine, sIdx) => {
                if (sLine.trim().length > 42) {
                    issues.push({
                        id: `char_len_${line.id}_${sIdx}`,
                        lineId: line.id,
                        lineIndex: idx,
                        type: 'length',
                        severity: 'warning',
                        title: 'دێڕی زۆر درێژ (زیاتر لە ٤٢ پیت)',
                        description: `دێڕی ${sIdx + 1} لەم ژێرنووسە (${sLine.trim().length} پیت)ە کە لە شاشەی مۆبایل و تابلێت لەوانەیە لە پەراوێز دەربچێت.`,
                        currentValue: `${sLine.trim().length} پیت`,
                        suggestedValue: 'کەمتر لە 40 پیت',
                        canAutoFix: false
                    });
                }
            });
        }

        // 8. Formatting Issues (leading/trailing whitespace or unmatched brackets)
        if (kurdishText.length > 0) {
            const openParens = (kurdishText.match(/\(/g) || []).length;
            const closeParens = (kurdishText.match(/\)/g) || []).length;
            const openBrackets = (kurdishText.match(/\[/g) || []).length;
            const closeBrackets = (kurdishText.match(/\]/g) || []).length;

            if (openParens !== closeParens || openBrackets !== closeBrackets) {
                issues.push({
                    id: `brackets_${line.id}`,
                    lineId: line.id,
                    lineIndex: idx,
                    type: 'formatting',
                    severity: 'suggestion',
                    title: 'کەوانە یان هێمای دانەخراو',
                    description: 'کەوانە یان قوڵافە لە دەقەکەدا بە کراوەیی ماوەتەوە و دانەخراوە.',
                    canAutoFix: false
                });
            }
        }
    });

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const suggestionCount = issues.filter(i => i.severity === 'suggestion').length;

    // Calculate quality score: 100 - (critical * 5 + warning * 1.5 + suggestion * 0.5)
    let score = 100 - (criticalCount * 5 + warningCount * 1.5 + suggestionCount * 0.5);
    if (score < 0) score = 0;
    score = Math.round(score);

    return {
        totalIssues: issues.length,
        criticalCount,
        warningCount,
        suggestionCount,
        score,
        issues
    };
};

/**
 * Automatically fixes all fixable QC issues across subtitle lines
 */
export const autoFixQcIssues = (lines: SubtitleLineData[]): { fixedLines: SubtitleLineData[]; fixedCount: number } => {
    let fixedCount = 0;
    const newLines = lines.map(l => ({ ...l }));

    for (let i = 0; i < newLines.length; i++) {
        const line = newLines[i];
        let modified = false;

        // 1. Fix Invalid / Zero duration
        if (line.endSec <= line.startSec) {
            line.endSec = line.startSec + 2.0;
            line.endTime = secToTimeString(line.endSec);
            modified = true;
        }

        // 2. Fix Too short duration (< 0.6s) if there is room before next line
        const duration = line.endSec - line.startSec;
        if (duration < 0.6 && line.kurdish.trim().length > 0) {
            const nextStart = (i < newLines.length - 1) ? newLines[i + 1].startSec : line.startSec + 10;
            const newEndSec = Math.min(line.startSec + 1.2, nextStart - 0.05);
            if (newEndSec > line.endSec) {
                line.endSec = newEndSec;
                line.endTime = secToTimeString(line.endSec);
                modified = true;
            }
        }

        // 3. Fix Overlaps with next line
        if (i < newLines.length - 1) {
            const nextLine = newLines[i + 1];
            if (line.endSec > nextLine.startSec) {
                // Adjust endSec to be 50ms before next line start
                const targetEnd = nextLine.startSec - 0.05;
                if (targetEnd > line.startSec + 0.3) {
                    line.endSec = targetEnd;
                    line.endTime = secToTimeString(line.endSec);
                    modified = true;
                }
            }
        }

        // 4. Clean extra line breaks (> 2 lines)
        if (line.kurdish) {
            const subLines = line.kurdish.split('\n').map(s => s.trim()).filter(Boolean);
            if (subLines.length > 2) {
                line.kurdish = subLines.join(' ');
                modified = true;
            }
        }

        if (modified) {
            fixedCount++;
        }
    }

    return { fixedLines: newLines, fixedCount };
};

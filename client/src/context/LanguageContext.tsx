import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'ku' | 'en' | 'ar';

interface Translations {
    [key: string]: {
        ku: string;
        en: string;
        ar: string;
    };
}

export const translations: Translations = {
    "menu": { ku: "مینیو", en: "Menu", ar: "القائمة" },
    "home": { ku: "سەرەکی", en: "Home", ar: "الرئيسية" },
    "movies": { ku: "فیلمەکان", en: "Movies", ar: "أفلام" },
    "series": { ku: "زنجیرەکان", en: "Series", ar: "مسلسلات" },
    "animation": { ku: "ئەنیمێشن", en: "Animation", ar: "رسوم متحركة" },
    "account": { ku: "هەژمار", en: "Account", ar: "حساب" },
    "flashcards": { ku: "فلاش کارت", en: "Flashcards", ar: "بطاقات تعليمية" },
    "admin": { ku: "ئەدمین", en: "Admin", ar: "المسؤول" },
    "continue_watching_menu": { ku: "بینینەوە", en: "Continue", ar: "متابعة" },
    "continue_watching": { ku: "بەردەوامبە لە سەیرکردن", en: "Continue Watching", ar: "متابعة المشاهدة" },
    "popular_movies": { ku: "فیلمە بەناوبانگەکان", en: "Popular Movies", ar: "أفلام شهيرة" },
    "search_placeholder": { ku: "بگەڕێ بۆ فیلم، زنجیرە، ئەکتەر...", en: "Search for movies, series, actors...", ar: "ابحث عن أفلام، مسلسلات، ممثلين..." },
    "no_movies": { ku: "هیچ فیلمێک بارنەکراوە هێشتا. بڕۆ بۆ بەشی ئەدمین.", en: "No movies uploaded yet. Go to Admin.", ar: "لم يتم رفع أي أفلام بعد. انتقل للمسؤول." },
    "not_found": { ku: "هیچ فیلمێک نەدۆزرایەوە", en: "No movies found", ar: "لم يتم العثور على أفلام" },
    "time": { ku: "کات:", en: "Time:", ar: "الوقت:" },
    "kurdish_stream": { ku: "KST", en: "KST", ar: "KST" },
    "login": { ku: "چوونەژوورەوە", en: "Login", ar: "تسجيل الدخول" },
    "favorites": { ku: "لیستی دڵخواز", en: "Favorites", ar: "المفضلة" },
    "watch_later": { ku: "بینینی دواتر", en: "Watch Later", ar: "المشاهدة لاحقاً" },
    "language_metrics": { ku: "ئامارەکانی زمان", en: "Language Metrics", ar: "مقاييس اللغة" },
    "total_words": { ku: "سەرجەمی وشەکان", en: "Total Words", ar: "إجمالي الكلمات" },
    "lexical_density": { ku: "چڕی فەرهەنگی", en: "Lexical Density", ar: "الكثافة اللغوية" },
    "vocab_diversity": { ku: "جۆراوجۆری وشەکان", en: "Vocabulary Diversity", ar: "تنوع المفردات" },
    "cefr_level": { ku: "ئاستی CEFR", en: "CEFR Level", ar: "مستوى CEFR" },
    "seasons": { ku: "سیزن", en: "Seasons", ar: "مواسم" },
    "episodes": { ku: "ئەڵقە", en: "Episodes", ar: "حلقات" },
    "watch": { ku: "تماشا بکە", en: "Watch", ar: "شاهد الآن" },
    "fc_title": { ku: "فلاش کارتەکان", en: "Flashcards", ar: "البطاقات التعليمية" },
    "fc_subtitle": { ku: "سیستەمی فێربوون و بەهێزکردنی بیرگە بە زیرەکی دەستکرد و سندوقی لایتنەر", en: "Spaced Repetition & AI Language Learning System", ar: "نظام التعلم بالتكرار المتباعد والذكاء الاصطناعي" },
    "practice": { ku: "تاقیکردنەوە", en: "Practice", ar: "تدريب" },
    "voice_practice": { ku: "ڕاهێنانی دەنگ و AI", en: "AI Voice Coach", ar: "مدرب الصوت الذكي" },
    "leitner_boxes": { ku: "سندوقی لایتنەر", en: "Leitner Boxes", ar: "صناديق لايتنر" },
    "cards_manage": { ku: "کارتەکان", en: "Word Bank", ar: "بنك الكلمات" },
    "start_practice": { ku: "دەستپێکردنی تاقیکردنەوە", en: "Start Practice", ar: "ابدأ التدريب" },
    "flip_card_hint": { ku: "کلیک بکە بۆ سووڕاندنەوە", en: "Click to flip", ar: "انقر للقلب" },
    "again": { ku: "دووبارە", en: "Again", ar: "إعادة" },
    "hard": { ku: "سەخت", en: "Hard", ar: "صعب" },
    "good": { ku: "باش", en: "Good", ar: "جيد" },
    "easy": { ku: "ئاسان", en: "Easy", ar: "سهل" },
    "import": { ku: "هاوردەکردن", en: "Import", ar: "استيراد" },
    "export": { ku: "هەناردەکردن", en: "Export", ar: "تصدير" },
    "new_card": { ku: "کارتی نوێ", en: "New Card", ar: "بطاقة جديدة" },
    "close": { ku: "داخستن", en: "Close", ar: "إغلاق" },
    "total_words_stat": { ku: "سەرجەم کارتەکان", en: "Total Cards", ar: "إجمالي البطاقات" },
    "ready_review": { ku: "ئامادەی پێداچوونەوە", en: "Due for Review", ar: "جاهز للمراجعة" },
    "learned_stat": { ku: "پێداچوونەوەی بۆ کراوە", en: "Memorized", ar: "تمت مراجعتها" },
    "all_filter": { ku: "هەمووی", en: "All", ar: "الكل" },
    "from_movies": { ku: "لە فیلمەکانەوە", en: "From Movies", ar: "من الأفلام" },
    "custom_words": { ku: "وشەی دەستکرد", en: "Custom Words", ar: "كلمات مخصصة" },
    "select_all_cards": { ku: "هەڵبژاردنی هەموو کارتەکان", en: "Select All Cards", ar: "تحديد جميع البطاقات" },
    "delete_selected": { ku: "سڕینەوەی هەڵبژێردراوەکان", en: "Delete Selected", ar: "حذف المحدد" },
    "move_to": { ku: "گواستنەوە بۆ:", en: "Move to:", ar: "نقل إلى:" },
    "cancel": { ku: "پاشگەزبوونەوە", en: "Cancel", ar: "إلغاء" },
    "search_word_placeholder": { ku: "بگەڕێ لە وشە، وەرگێڕان، ژێرنووس و ناوی فیلمەکان...", en: "Search words, translations, subtitles & movies...", ar: "ابحث في الكلمات، الترجمات والمسلسلات..." },
    "sort_newest": { ku: "📅 نوێترین بەروار", en: "📅 Newest", ar: "📅 الأحدث" },
    "sort_oldest": { ku: "📅 کۆنترین بەروار", en: "📅 Oldest", ar: "📅 الأقدم" },
    "sort_az": { ku: "🔤 پیتەکان (A-Z)", en: "🔤 Alphabetical (A-Z)", ar: "🔤 أبجدياً (A-Z)" },
    "sort_ease": { ku: "⚡ ئاسانترین", en: "⚡ Easiest", ar: "⚡ الأسهل" },
    "box": { ku: "سندوقی", en: "Box", ar: "صندوق" },
    "review_schedule": { ku: "خشتەی پێداچوونەوە:", en: "Review Schedule:", ar: "جدول المراجعة:" },
    "practice_this_box": { ku: "تاقیکردنەوەی ئەم سندوقە", en: "Practice This Box", ar: "تدريب هذا الصندوق" },
    "ai_coach_analysis": { ku: "شیکاری ڕاهێنەری AI", en: "AI Coach Analysis", ar: "تحليل مدرب الذكاء الاصطناعي" },
    "try_again": { ku: "دووبارە هەوڵبدەوە", en: "Try Again", ar: "حاول مرة أخرى" },
    "listen_native": { ku: "گوێگرتن لە دەنگی ستاندارد", en: "Listen to Native Audio", ar: "استمع للنطق القياسي" },
    "tap_mic_read": { ku: "دەست بنێ بە مایکرۆفۆن تا پشکنینی دەنگت بۆ بکات", en: "Tap microphone to test your pronunciation", ar: "اضغط على الميكروفون لاختبار نطقك" },
    "speak_now": { ku: "ئێستا بە دەنگ بیخوێنەوە...", en: "Listening, speak clearly now...", ar: "جارٍ الاستماع، تحدث بوضوح..." },
    "front_input_label": { ku: "ڕووی پێشەوە (وشە یان ڕستەی ئینگلیزی)", en: "Front Side (English Word / Phrase)", ar: "الوجه الأمامي (الكلمة أو الجملة بالإنجليزية)" },
    "back_input_label": { ku: "ڕووی پشتەوە (وەرگێڕان)", en: "Back Side (Translation)", ar: "الوجه الخلفي (الترجمة)" },
    "word_bank_heading": { ku: "فەرهەنگی وشە و کارتەکان", en: "Word Bank & Flashcards", ar: "بنك الكلمات والبطاقات" },
    "word_bank_sub": { ku: "هەموو کارتە پاشەکەوتکراوەکانت بەڕێوەببە، هاوردە و هەناردەیان بکە یان دەستکارییان بکە.", en: "Manage all your saved cards, import, export, or edit them.", ar: "قم بإدارة جميع بطاقاتك، استيرادها، تصديرها أو تعديلها." },
    "quick_text_import": { ku: "هاوردەکردنی خێرا بە دەق", en: "Quick Text Import", ar: "استيراد سريع بالنص" },
    "json_export": { ku: "فایلی JSON (پشتیوانی تەواو)", en: "JSON File (Full Backup)", ar: "ملف JSON (نسخة كاملة)" },
    "csv_export": { ku: "فایلی CSV / Excel", en: "CSV / Excel File", ar: "ملف CSV / Excel" },
    "anki_export": { ku: "بەرنامەی Anki (.txt)", en: "Anki Deck (.txt)", ar: "تطبيق Anki (.txt)" },
    "json_csv_file": { ku: "فایلی JSON یان CSV", en: "JSON or CSV File", ar: "ملف JSON أو CSV" },
    "no_cards_in_bank": { ku: "هیچ کارتێک لە فەرهەنگدا نییە. کارتی نوێ دروست بکە یان فایلێک هاوردە بکە!", en: "No cards in the word bank. Create a new card or import a file!", ar: "لا توجد بطاقات في بنك الكلمات. أنشئ بطاقة جديدة أو استورد ملفاً!" },
    "no_cards_found_filter": { ku: "هیچ کارتێک بەپێی فلتەر یان گەڕانەکەت نەدۆزرایەوە.", en: "No cards found matching your search or filters.", ar: "لم يتم العثور على بطاقات تطابق البحث أو الفلتر." },
    "due_now_badge": { ku: "🔴 کاتی پێداچوونەوەیە", en: "🔴 Due for Review", ar: "🔴 حان وقت المراجعة" },
    "learned_badge": { ku: "✅ خوێنراوەتەوە", en: "✅ Learned", ar: "✅ تم تعلمها" },
    "ease_lbl": { ku: "ئاسانی:", en: "Ease:", ar: "السهولة:" },
    "edit_card": { ku: "دەستکاریکردنی کارت", en: "Edit Card", ar: "تعديل البطاقة" },
    "create_new_card": { ku: "زیادکردنی کارتی نوێ بۆ فەرهەنگ", en: "Add New Card to Word Bank", ar: "إضافة بطاقة جديدة إلى بنك الكلمات" },
    "save_btn": { ku: "پاشەکەوت", en: "Save", ar: "حفظ" },
    "add_btn": { ku: "زیاد بکە", en: "Add", ar: "إضافة" },
    "total_cards_stat": { ku: "کۆی گشتی کارتەکان", en: "Total Cards", ar: "إجمالي البطاقات" },
    "stored_in_memory": { ku: "کارتی خەزنکراو لە بیرگە", en: "Cards Stored in Memory", ar: "بطاقات محفوظة في الذاكرة" },
    "ready_review_desc": { ku: "پێویستە ئەمڕۆ بیخوێنیتەوە 🔴", en: "Review needed today 🔴", ar: "يجب مراجعتها اليوم 🔴" },
    "mastered_cards": { ku: "کارتە جێگیربووەکان (قۆناغی ٥)", en: "Mastered Cards (Box 5)", ar: "البطاقات المتقنة (المرحلة ٥)" },
    "mastered_desc": { ku: "ی کارتەکانت جێگیرکراون 🏆", en: "% of your cards mastered 🏆", ar: "% من بطاقاتك متقنة 🏆" },
    "cards_count_unit": { ku: "کارت", en: "cards", ar: "بطاقات" },
    "search_in_box": { ku: "بگەڕێ لە کارتەکانی", en: "Search in", ar: "ابحث في" },
    "no_cards_in_box_yet": { ku: "هیچ کارتێک لەم سندوقەدا نییە. لەگەڵ تاقیکردنەوە کارتەکان دێنە ئەم سندوقە!", en: "No cards in this box yet. They will move here as you practice!", ar: "لا توجد بطاقات في هذا الصندوق بعد. ستنتقل إلى هنا مع الممارسة!" },
    "no_cards_search": { ku: "هیچ کارتێک بەپێی ئەم گەڕانە نەدۆزرایەوە.", en: "No cards found matching this search.", ar: "لم يتم العثور على بطاقات تطابق هذا البحث." },
    "voice_coach_heading": { ku: "بە دەنگ ڕاهێنان لەسەر گۆکردنی وشە و ڕستەکان بکە", en: "Practice Pronunciation of Words & Phrases with Voice", ar: "تدرب على نطق الكلمات والجمل بالصوت" },
    "voice_coach_desc": { ku: "ڕستەیەک هەڵبژێرە، بە مایکرۆفۆن بیخوێنەرەوە تاوەکو زیرەکی دەستکرد شیکاری نمرە و هەڵەکانت بۆ بکات.", en: "Choose a sentence, read it aloud with microphone to get AI pronunciation score & feedback.", ar: "اختر جملة واقرأها بالميكروفون ليحلل الذكاء الاصطناعي نطقك وأخطاءك." },
    "quick_pick_cards": { ku: "هەڵبژاردنی خێرا لە کارتەکانت:", en: "Quick Pick from Your Cards:", ar: "اختيار سريع من بطاقاتك:" },
    "target_text_label": { ku: "دەقی ئامانج بۆ خوێندنەوە:", en: "Target Text to Read:", ar: "النص المستهدف للقراءة:" },
    "voice_textarea_placeholder": { ku: "دەقێک بنووسە یان لە سەرەوە کارتێک هەڵبژێرە...", en: "Type a sentence or select a card above...", ar: "اكتب جملة أو اختر بطاقة من الأعلى..." },
    "strict_accuracy_mode": { ku: "تەحەدای گۆکردن (Strict Accuracy Mode)", en: "Strict Accuracy Mode", ar: "وضع الدقة الصارمة" },
    "start_speaking_btn": { ku: "دەست بکە بە خوێندنەوە", en: "Tap Microphone to Speak", ar: "اضغط على الميكروفون وتحدث" },
    "remaining_for_review": { ku: "ماوە بۆ پێداچوونەوە:", en: "Remaining for Review:", ar: "المتبقي للمراجعة:" },
    "of_cards": { ku: "لە", en: "of", ar: "من" },
    "blur_lbl": { ku: "لێڵی:", en: "Blur:", ar: "التمويه:" },
    "hide_image": { ku: "وێنە لایبە", en: "Hide Image", ar: "إخفاء الصورة" },
    "show_image": { ku: "وێنە پێشان بدە", en: "Show Image", ar: "إظهار الصورة" },
    "click_to_see_answer": { ku: "کلیک بکە بۆ بینینی وەڵام", en: "Click to reveal answer", ar: "انقر لإظهار الإجابة" },
    "translation_and_context": { ku: "وەرگێڕان", en: "Translation", ar: "الترجمة" },
    "listen_btn": { ku: "گوێگرتن لە دەنگ 🔊", en: "Listen 🔊", ar: "استماع 🔊" },
    "scene_audio_btn": { ku: "دەنگی ڕاستەقینە 🔊", en: "Original Audio 🔊", ar: "صوت المشهد 🔊" },
    "show_answer_btn": { ku: "وەڵامم پێشان بدە", en: "Show Answer", ar: "أظهر الإجابة" },

    // General & Common
    "genres": { ku: "چەشنەکان", en: "Genres", ar: "الأنواع" },
    "select_genre": { ku: "هەڵبژاردنی چەشن", en: "Select Genre", ar: "اختر النوع" },
    "language_level": { ku: "ئاستی زمان", en: "Language Level", ar: "مستوى اللغة" },
    "clear": { ku: "سڕینەوە", en: "Clear", ar: "مسح" },
    "watch_now": { ku: "ئێستا بینەری بە", en: "Watch Now", ar: "شاهد الآن" },
    "previous": { ku: "پێشتر", en: "Previous", ar: "السابق" },
    "next": { ku: "دواتر", en: "Next", ar: "التالي" },
    "back": { ku: "گەڕانەوە", en: "Back", ar: "رجوع" },
    "loading": { ku: "چاوەڕوانبە...", en: "Loading...", ar: "جارٍ التحميل..." },
    "movie_not_found": { ku: "فیلمەکە نەدۆزرایەوە.", en: "Movie not found.", ar: "لم يتم العثور على الفيلم." },
    "season": { ku: "وەرز", en: "Season", ar: "الموسم" },
    "episode": { ku: "ئەڵقە", en: "Episode", ar: "الحلقة" },
    "story": { ku: "چیرۆک", en: "Story", ar: "القصة" },
    "watch_movie": { ku: "سەیرکردنی فیلم", en: "Watch Movie", ar: "مشاهدة الفيلم" },
    "watch_series": { ku: "سەیرکردنی زنجیرە", en: "Watch Series", ar: "مشاهدة المسلسل" },
    "watched": { ku: "بینراو", en: "Watched", ar: "تمت المشاهدة" },
    "watched_status": { ku: "بینراوە", en: "Watched", ar: "شوهد" },
    "advanced_words": { ku: "وشە ئەکادیمی و پێشکەوتووەکان", en: "Academic & Advanced Vocabulary", ar: "الكلمات الأكاديمية والمتقدمة" },
    "repeated_words": { ku: "وشە دووبارەبووەکان و وەرگێڕان", en: "Frequent Words & Translations", ar: "الكلمات المتكررة والترجمة" },
    "show_more": { ku: "زیاتر ▼", en: "Show More ▼", ar: "المزيد ▼" },
    "show_less": { ku: "کەمتر ▲", en: "Show Less ▲", ar: "أقل ▲" },
    "minutes": { ku: "خولەک", en: "min", ar: "دقيقة" },
    "comments_ratings": { ku: "کۆمێنت و هەڵسەنگاندن", en: "Comments & Reviews", ar: "التعليقات والتقييمات" },
    "your_rating": { ku: "هەڵسەنگاندنت:", en: "Your Rating:", ar: "تقييمك:" },
    "comment_placeholder": { ku: "ڕای خۆت لەسەر ئەم بەرهەمە بنووسە...", en: "Write your review about this title...", ar: "اكتب رأيك حول هذا العمل..." },
    "submitting": { ku: "دەنێردرێت...", en: "Submitting...", ar: "جارٍ الإرسال..." },
    "send_comment": { ku: "ناردن", en: "Post Review", ar: "إرسال" },
    "no_comments_yet": { ku: "هێشتا هیچ کۆمێنتێک نەنووسراوە. یەکەم کەس بە!", en: "No reviews yet. Be the first to review!", ar: "لا توجد تعليقات بعد. كن أول من يعلق!" },

    // Player & Watch Page
    "family_mode": { ku: "مۆدی خێزانی", en: "Family Mode", ar: "الوضع العائلي" },
    "family_mode_active": { ku: "مۆدی خێزانی چالاکە (دیمەنە نەشیاوەکان لێڵ دەکرێن)", en: "Family Mode Active (Sensitive scenes are blurred)", ar: "الوضع العائلي مفعّل (يتم تمويه المشاهد الحساسة)" },
    "sensitive_scene_blur": { ku: "دیمەنی نەشیاو - لێڵکراوە", en: "Sensitive Scene - Blurred", ar: "مشهد غير لائق - مموه" },
    "shadow_mode": { ku: "مۆدی سێبەر (ڕاهێنانی دەنگ)", en: "Shadowing Mode (Voice Practice)", ar: "وضع الظل (التدريب الصوتي)" },
    "subtitles": { ku: "ژێرنووس", en: "Subtitles", ar: "الترجمة" },
    "english_sub": { ku: "ئینگلیزی", en: "English", ar: "الإنجليزية" },
    "kurdish_sub": { ku: "کوردی", en: "Kurdish", ar: "الكردية" },
    "dual_sub": { ku: "هەردووکیان (دوانەیی)", en: "Dual Subtitles", ar: "ترجمة مزدوجة" },
    "sub_size": { ku: "قەبارەی ژێرنووس", en: "Subtitle Size", ar: "حجم الخط" },
    "sub_color": { ku: "ڕەنگی ژێرنووس", en: "Subtitle Color", ar: "لون الخط" },
    "playback_speed": { ku: "خێرایی لێدان", en: "Playback Speed", ar: "سرعة التشغيل" },
    "sync_sub": { ku: "هاوکاتکردنی ژێرنووس", en: "Sync Subtitles", ar: "مزامنة الترجمة" },
    "click_word_to_translate": { ku: "کلیک لە هەر وشەیەک بکە بۆ وەرگێڕان و فلاشکارت", en: "Click any word to translate & save flashcard", ar: "انقر على أي كلمة للترجمة وحفظ البطاقة" },
    "add_to_flashcards": { ku: "زیادکردن بۆ فلاش کارت", en: "Add to Flashcards", ar: "إضافة للبطاقات" },
    "added_to_flashcards": { ku: "زیادکرا بۆ فلاش کارت! 🎉", en: "Added to Flashcards! 🎉", ar: "تمت الإضافة للبطاقات! 🎉" },
    "ai_explanation": { ku: "شیکاری ژیری دەستکرد (AI)", en: "AI Linguistic Explanation", ar: "شرح الذكاء الاصطناعي" },
    "next_episode": { ku: "ئەڵقەی دواتر", en: "Next Episode", ar: "الحلقة التالية" },
    "prev_episode": { ku: "ئەڵقەی پێشتر", en: "Previous Episode", ar: "الحلقة السابقة" },
    "all_episodes": { ku: "هەموو ئەڵقەکان", en: "All Episodes", ar: "جميع الحلقات" },
    "video_error": { ku: "نەتوانرا ڤیدیۆکە لێبدرێت. تکایە دووبارە تاقی بکەرەوە.", en: "Unable to load video stream. Please try again.", ar: "تعذر تشغيل الفيديو. يرجى المحاولة مرة أخرى." },

    // Auth & Profile
    "sign_in": { ku: "چوونەژوورەوە", en: "Sign In", ar: "تسجيل الدخول" },
    "sign_up": { ku: "دروستکردنی هەژمار", en: "Create Account", ar: "إنشاء حساب" },
    "username": { ku: "ناوی بەکارهێنەر", en: "Username", ar: "اسم المستخدم" },
    "email": { ku: "ئیمەیڵ", en: "Email", ar: "البريد الإلكتروني" },
    "password": { ku: "وشەی نهێنی", en: "Password", ar: "كلمة المرور" },
    "confirm_password": { ku: "دووبارەکردنەوەی وشەی نهێنی", en: "Confirm Password", ar: "تأكيد كلمة المرور" },
    "logout": { ku: "چوونەدەرەوە", en: "Logout", ar: "تسجيل الخروج" },
    "profile_title": { ku: "پڕۆفایلی بەکارهێنەر", en: "User Profile", ar: "الملف الشخصي" },
    "saved_words_count": { ku: "وشە پاشەکەوتکراوەکان", en: "Saved Words", ar: "الكلمات المحفوظة" },
    "watch_history": { ku: "مێژووی سەیرکردن", en: "Watch History", ar: "سجل المشاهدة" },
    "buy_credits": { ku: "کڕینی باڵانس", en: "Buy Credits", ar: "شراء رصيد" },
    "no_favorites": { ku: "هیچ فیلمێک لە لیستی دڵخوازدا نییە.", en: "No movies in your favorites yet.", ar: "لا توجد أفلام في المفضلة بعد." },
    "no_watch_later": { ku: "هیچ فیلمێک لە بینینی دواتردا نییە.", en: "No movies in your watch later list yet.", ar: "لا توجد أفلام في المشاهدة لاحقاً بعد." }
};

interface LanguageContextType {
    lang: Language;
    setLang: (l: Language) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({} as LanguageContextType);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLang] = useState<Language>((localStorage.getItem('ks_lang') as Language) || 'ku');

    useEffect(() => {
        localStorage.setItem('ks_lang', lang);
        const dir = lang === 'en' ? 'ltr' : 'rtl';
        document.body.dir = dir;
        document.documentElement.setAttribute('dir', dir);
    }, [lang]);

    const t = (key: string): string => {
        if (!translations[key]) return key;
        return translations[key][lang] || translations[key]['ku'];
    };

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export const useLanguage = () => useContext(LanguageContext);

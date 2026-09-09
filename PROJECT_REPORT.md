# 📊 Comprehensive Report on Kurdish Stream Project

## 1. Introduction and Project Overview
**Kurdish Stream** is an advanced video streaming platform (movies and series) innovatively integrated with an **AI-powered language learning system**. This project is not merely an entertainment website, but an educational tool designed to help users learn English through watching movies and TV series.

## 2. Technology Stack
The project is built using modern web development technologies:
*   **Frontend:** Built with `React.js` and `Vite` for ultra-fast performance. Utilizes `React Router` for seamless page navigation and `Lucide React` for scalable icons.
*   **Backend:** Powered by `Node.js` and `Express.js` to manage APIs and server-side logic efficiently.
*   **Database:** Instead of a heavy relational database, a fast, lightweight local storage system (`JSON Files`) is implemented to store user data, media catalogs, and analytics.
*   **Artificial Intelligence (AI):** Integrated with `OpenRouter` APIs (specifically Gemini models) to perform intelligent tasks such as translation, grammar analysis, and content generation.
*   **Cloud and Storage:** Supports local file storage for videos and images, while also seamlessly connecting to `Cloudflare R2` for scalable cloud storage.

## 3. Core Features and System Logic

### A. Video Player and Streaming System
*   **Custom Player:** The video player is built from scratch to have full programmatic control over subtitles and media playback.
*   **Interactive Subtitles:** Users can click on any word or sentence within the subtitles to instantly receive AI-generated translations and grammatical analysis.
*   **Advanced Playback Features:** Supports Theater Mode, Picture-in-Picture (PiP), playback speed control, and quality adjustments.

### B. AI Learning System (EdTech)
This is the core strength of the project. Users can interact with the content in real-time:
1.  **Word & Sentence Analysis:** Understand grammar rules, tenses, and context-specific usage examples.
2.  **Pronunciation Check:** Users can speak a word into their microphone, and the AI evaluates their accuracy and corrects mistakes.
3.  **Flashcards:** Save new vocabulary to a dedicated flashcard page for spaced repetition and review.
4.  **Interactive Quizzes:** Generate multiple-choice questions based on the exact dialogue in the video to test listening comprehension.

### C. Economy and Credits System
*   Using advanced AI features requires **Credits**.
*   **Purchasing Credits:** Users can select a subscription plan on the dedicated `/buy-credits` page and upload a payment receipt.
*   **Request Management:** The Admin Dashboard allows administrators to view uploaded receipts, approve them (which instantly adds credits to the user's account), or reject them with a specified reason.
*   **Notification System:** Users receive real-time notifications when their credit requests are approved or rejected.

### D. User Profile and Gamification
*   **Daily Streak:** The system encourages consistency by requiring users to watch at least 15 minutes daily to maintain their "Streak Fire."
*   **Detailed Statistics:** Tracks minutes watched and sentences analyzed on a daily, weekly, and monthly basis.
*   **Collections:** Users can manage their Favorite Movies, Favorite Series, and a Watch Later list.

## 4. Admin Dashboard
A highly advanced control panel to manage the entire platform:
*   **Media Management:** Create, edit, and delete movies and series. Easily manage seasons and episodes.
*   **OMDb API Integration:** By simply entering a movie title, the server automatically fetches metadata (ratings, posters, plots) and automatically translates the English plot into Kurdish and Arabic.
*   **AI Data Import:** Admins can paste an AI-generated analysis text. The system uses smart `Regex` parsing to extract word counts, CEFR language levels, difficult vocabulary, and sensitive scenes, saving them directly to the database.
*   **User Management:** View user balances, suspend accounts (with duration and reasoning), and manually grant credits.
*   **Analytics:** Track daily, weekly, and monthly visitor metrics and individual movie views.

## 5. UI/UX Design
*   **Theme System (Light/Dark Mode):** Utilizes CSS Variables to toggle the entire website's color scheme flawlessly, featuring a signature Violet/Purple brand identity.
*   **Modern Aesthetics:** The UI heavily features Glassmorphism and Neumorphism (blur backdrops, sleek gradients) combined with smooth hover animations for cards and buttons.
*   **Fully Responsive:** The application provides a seamless experience across mobile devices, tablets, and desktops.

## 6. Conclusion
The **Kurdish Stream** project is an exemplary platform that bridges the gap between the entertainment and EdTech markets. With its independent credit economy, intelligent admin management, and stunning modern design, the project is perfectly positioned to become a primary resource for Kurdish and Arabic audiences who want to learn languages without the monotony of traditional courses.
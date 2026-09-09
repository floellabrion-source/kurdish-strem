-- ============================================================
-- Kurdish Stream - PostgreSQL / Supabase Schema (Phase 2)
-- ============================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    points INT NOT NULL DEFAULT 0,
    credits INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Movies & Series Table
CREATE TABLE IF NOT EXISTS movies (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    original_title VARCHAR(255),
    duration VARCHAR(100),
    poster_url TEXT,
    backdrop_url TEXT,
    release_year INT,
    imdb_rating NUMERIC(3,1),
    type VARCHAR(50) NOT NULL DEFAULT 'movie', -- 'movie' or 'series'
    language VARCHAR(100),
    description TEXT,
    video_file TEXT,
    video_url TEXT,
    original_srt TEXT,
    translated_srt TEXT,
    views INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Episodes Table (for Series)
CREATE TABLE IF NOT EXISTS episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movie_id VARCHAR(255) NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    season_number INT NOT NULL DEFAULT 1,
    episode_number INT NOT NULL DEFAULT 1,
    title VARCHAR(255),
    duration VARCHAR(100),
    video_file TEXT,
    video_url TEXT,
    original_srt TEXT,
    translated_srt TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_season_episode UNIQUE(movie_id, season_number, episode_number)
);

-- 4. User History Table (Watch Progress)
CREATE TABLE IF NOT EXISTS user_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    movie_id VARCHAR(255) NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    season_number INT NOT NULL DEFAULT 0,
    episode_number INT NOT NULL DEFAULT 0,
    watched_seconds INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_movie_episode UNIQUE(user_id, movie_id, season_number, episode_number)
);

-- 5. Global Words Dictionary
CREATE TABLE IF NOT EXISTS words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    english_word VARCHAR(255) UNIQUE NOT NULL,
    kurdish_translation TEXT NOT NULL,
    frequency_rank INT,
    difficulty_level VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. User Flashcards Table
CREATE TABLE IF NOT EXISTS user_flashcards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_id UUID REFERENCES words(id) ON DELETE SET NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    context_quote TEXT,
    translated_quote TEXT,
    ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.50,
    interval INT NOT NULL DEFAULT 0,
    next_review TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for maximum query performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_movies_type ON movies(type);
CREATE INDEX IF NOT EXISTS idx_episodes_movie ON episodes(movie_id, season_number, episode_number);
CREATE INDEX IF NOT EXISTS idx_user_history_lookup ON user_history(user_id, movie_id);
CREATE INDEX IF NOT EXISTS idx_words_english ON words(english_word);
CREATE INDEX IF NOT EXISTS idx_flashcards_user ON user_flashcards(user_id, next_review);

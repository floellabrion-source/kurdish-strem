const fs = require('fs');
const path = require('path');
const { isSupabaseActive, getSupabaseClient } = require('./index');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MOVIES_FILE = path.join(DATA_DIR, 'movies.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// --- JSON Helpers ---
function readJson(filePath, fallback = []) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) || fallback;
    } catch (e) {
        console.error(`Error reading ${filePath}:`, e.message);
        return fallback;
    }
}

function writeJson(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error(`Error writing ${filePath}:`, e.message);
    }
}

// ============================================================
// Repository Methods (Supabase + Local JSON Fallback)
// ============================================================

const UserRepository = {
    async findByUsername(username) {
        if (isSupabaseActive()) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('username', username)
                .single();
            if (error && error.code !== 'PGRST116') console.error('[Supabase User Error]:', error.message);
            return data || null;
        } else {
            const users = readJson(USERS_FILE);
            return users.find(u => u.username?.toLowerCase() === username?.toLowerCase()) || null;
        }
    },

    async findById(id) {
        if (isSupabaseActive()) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', id)
                .single();
            if (error && error.code !== 'PGRST116') console.error('[Supabase User Error]:', error.message);
            return data || null;
        } else {
            const users = readJson(USERS_FILE);
            return users.find(u => u.id === id) || null;
        }
    },

    async create(userObj) {
        if (isSupabaseActive()) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('users')
                .insert([{
                    username: userObj.username,
                    password_hash: userObj.passwordHash,
                    role: userObj.role || 'user',
                    points: userObj.points || 0,
                    credits: userObj.credits || 100
                }])
                .select()
                .single();
            if (error) throw new Error(error.message);
            return data;
        } else {
            const users = readJson(USERS_FILE);
            users.push(userObj);
            writeJson(USERS_FILE, users);
            return userObj;
        }
    },

    async update(id, updates) {
        if (isSupabaseActive()) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('users')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (error) console.error('[Supabase User Update Error]:', error.message);
            return data || null;
        } else {
            const users = readJson(USERS_FILE);
            const idx = users.findIndex(u => u.id === id);
            if (idx !== -1) {
                users[idx] = { ...users[idx], ...updates };
                writeJson(USERS_FILE, users);
                return users[idx];
            }
            return null;
        }
    },

    async getAll() {
        if (isSupabaseActive()) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase.from('users').select('*');
            if (error) console.error('[Supabase Users Fetch Error]:', error.message);
            return data || [];
        } else {
            return readJson(USERS_FILE);
        }
    }
};

const MovieRepository = {
    async getAll() {
        if (isSupabaseActive()) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('movies')
                .select('*, episodes(*)');
            if (error) console.error('[Supabase Movies Fetch Error]:', error.message);
            return data || [];
        } else {
            return readJson(MOVIES_FILE);
        }
    },

    async findById(id) {
        if (isSupabaseActive()) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('movies')
                .select('*, episodes(*)')
                .eq('id', id)
                .single();
            if (error && error.code !== 'PGRST116') console.error('[Supabase Movie Fetch Error]:', error.message);
            return data || null;
        } else {
            const movies = readJson(MOVIES_FILE);
            return movies.find(m => m.id === id) || null;
        }
    },

    async incrementViews(id) {
        if (isSupabaseActive()) {
            const supabase = getSupabaseClient();
            const movie = await this.findById(id);
            if (movie) {
                await supabase
                    .from('movies')
                    .update({ views: (movie.views || 0) + 1 })
                    .eq('id', id);
            }
        } else {
            const movies = readJson(MOVIES_FILE);
            const m = movies.find(x => x.id === id);
            if (m) {
                m.views = (m.views || 0) + 1;
                writeJson(MOVIES_FILE, movies);
            }
        }
    }
};

const WordsRepository = {
    async lookup(englishWord) {
        const clean = englishWord?.toLowerCase().trim();
        if (!clean) return null;

        if (isSupabaseActive()) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('words')
                .select('*')
                .eq('english_word', clean)
                .single();
            if (error && error.code !== 'PGRST116') console.error('[Supabase Word Error]:', error.message);
            return data || null;
        }
        return null;
    },

    async save(englishWord, kurdishTranslation, difficultyLevel = null) {
        const clean = englishWord?.toLowerCase().trim();
        if (!clean || !kurdishTranslation) return null;

        if (isSupabaseActive()) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('words')
                .upsert({
                    english_word: clean,
                    kurdish_translation: kurdishTranslation.trim(),
                    difficulty_level: difficultyLevel
                }, { onConflict: 'english_word' })
                .select()
                .single();
            if (error) console.error('[Supabase Save Word Error]:', error.message);
            return data || null;
        }
        return null;
    }
};

module.exports = {
    UserRepository,
    MovieRepository,
    WordsRepository
};

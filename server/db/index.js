const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;
let isSupabaseActive = false;

if (SUPABASE_URL && SUPABASE_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        isSupabaseActive = true;
        console.log('[Database] Connected to Supabase PostgreSQL Database.');
    } catch (e) {
        console.warn('[Database] Failed to initialize Supabase client, falling back to local JSON persistence:', e.message);
    }
} else {
    console.log('[Database] Running in Local JSON fallback mode (SUPABASE_URL not configured).');
}

module.exports = {
    isSupabaseActive: () => isSupabaseActive,
    getSupabaseClient: () => supabase,
    
    // Helper to log migration status
    getStatus: () => ({
        mode: isSupabaseActive ? 'supabase' : 'json',
        supabaseUrlConfigured: !!SUPABASE_URL
    })
};

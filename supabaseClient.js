const { createClient } = require('@supabase/supabase-js');

// Pick up environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Warn synchronously if env vars are missing
if (!supabaseUrl || !supabaseKey) {
    console.warn("[WARNING] SUPABASE_URL or SUPABASE_KEY is not defined in the environment variables!");
    console.warn("[WARNING] Server will start, but database operations will fail.");
}

// Create the Supabase client
const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co', 
    supabaseKey || 'placeholder-key'
);

module.exports = supabase;

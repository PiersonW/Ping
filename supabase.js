import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-url-polyfill/auto";

const supabaseUrl = "https://rmooxzkinakbyhvxcivv.supabase.co";
const supabaseAnonKey = "sb_publishable_O97fJjA2cNuR4vvRumRsvQ_P3RuxrhO";

// No storage adapter was ever configured here - supabase-js defaults to
// browser localStorage, which doesn't exist in React Native, so it fell
// back to keeping the session in memory only. That's why signing in never
// stuck: killing the app (not just backgrounding it) wiped it every time.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

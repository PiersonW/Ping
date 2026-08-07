import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

const supabaseUrl = "https://rmooxzkinakbyhvxcivv.supabase.co";
const supabaseAnonKey = "sb_publishable_O97fJjA2cNuR4vvRumRsvQ_P3RuxrhO";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

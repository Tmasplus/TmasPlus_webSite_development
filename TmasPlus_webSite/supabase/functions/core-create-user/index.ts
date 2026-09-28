import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createOnboardingHandler } from './handler.ts';

Deno.serve(createOnboardingHandler(createClient, (name: string) => Deno.env.get(name)));

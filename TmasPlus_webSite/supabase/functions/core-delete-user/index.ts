import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createDeleteUserHandler } from './handler.ts';

Deno.serve(createDeleteUserHandler(createClient, (name: string) => Deno.env.get(name)));

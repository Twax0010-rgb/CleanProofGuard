import { isSupabaseConfigured } from '../env'
import { mockRepo } from './mockRepo'
import { SITE_ID as MOCK_SITE_ID } from './seed'
import { supabaseRepo } from './supabaseRepo'
import type { DataRepo } from './types'

export const repo: DataRepo = isSupabaseConfigured() ? supabaseRepo : mockRepo

/**
 * The site this deployment operates on. In mock mode this is the seeded demo
 * site; once Supabase is wired up, point this at your real site's UUID (or
 * extend the app to support multiple sites / a site picker).
 */
export const CURRENT_SITE_ID = isSupabaseConfigured()
  ? (import.meta.env.VITE_SITE_ID as string | undefined) ?? '00000000-0000-0000-0000-000000000001'
  : MOCK_SITE_ID

export type { DataRepo } from './types'

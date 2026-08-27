'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/** Clear the session and return to the sign-in page. */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // Drop any cached render that was built against the old session.
  revalidatePath('/', 'layout')
  redirect('/login')
}

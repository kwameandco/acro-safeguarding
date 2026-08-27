import { getCurrentProfile } from '@/lib/supabase/cached-server'
import { redirect } from 'next/navigation'
import { SettingsForms } from '@/components/settings/SettingsForms'

export default async function SettingsPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-base font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          Signed in as {profile.email} · {profile.role}
          {profile.is_admin ? ' · admin' : ''}
        </p>
      </header>
      <SettingsForms
        displayName={profile.display_name ?? ''}
        bio={profile.bio ?? ''}
        email={profile.email ?? ''}
      />
    </div>
  )
}

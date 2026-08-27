import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import { createClient } from '@/lib/supabase/server'
import { SettingsForms } from '@/components/settings/SettingsForms'
import { Badge } from '@/components/ui/field'

export default async function SettingsPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  // Read-only lookup for the "Your team profile" block below — a single extra
  // query, only when the member actually has a community set.
  let communityName: string | null = null
  if (profile.community_id) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('communities')
      .select('name')
      .eq('id', profile.community_id)
      .maybeSingle()
    communityName = data?.name ?? null
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-base font-semibold">Settings</h1>
        <p className="text-muted-foreground">Signed in as {profile.email}</p>
      </header>

      <section className="max-w-xl space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">Your team profile</h2>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
          <dt className="text-muted-foreground">Community</dt>
          <dd>{communityName ?? 'No community'}</dd>

          <dt className="text-muted-foreground">Role</dt>
          <dd>
            <Badge tone={profile.role === 'owner' ? 'blue' : 'neutral'}>{profile.role}</Badge>
          </dd>

          <dt className="text-muted-foreground">Flags</dt>
          <dd className="flex flex-wrap gap-1.5">
            {profile.is_admin && <Badge tone="green">Admin</Badge>}
            {profile.is_safeguarding_lead && <Badge tone="amber">Safeguarding lead</Badge>}
            {!profile.is_admin && !profile.is_safeguarding_lead && (
              <span className="text-muted-foreground">None</span>
            )}
          </dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          An owner or admin changes these from the Team page — there&apos;s nothing to edit
          here.
        </p>
      </section>

      <SettingsForms
        displayName={profile.display_name ?? ''}
        bio={profile.bio ?? ''}
        avatarUrl={profile.avatar_url ?? ''}
        email={profile.email ?? ''}
      />
    </div>
  )
}

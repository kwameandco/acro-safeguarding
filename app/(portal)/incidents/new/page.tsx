import { createClient } from '@/lib/supabase/server'
import { NewIncidentForm } from '@/components/incidents/NewIncidentForm'
import type { CommunityOption } from '@/lib/incidents/types'

export default async function NewIncidentPage() {
  const supabase = await createClient()
  const { data: communities } = await supabase
    .from('communities')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
    .returns<CommunityOption[]>()

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-base font-semibold">Report a concern</h1>
        <p className="text-muted-foreground">
          Use this for anything that needs a safeguarding record — a welfare worry, a conduct
          concern, an injury, a boundary issue or a disclosure. Include only the detail actually
          needed to act on it. There’s no edit after you submit; a correction or update becomes a
          note on the report instead.
        </p>
      </header>
      <NewIncidentForm communities={communities ?? []} />
    </div>
  )
}

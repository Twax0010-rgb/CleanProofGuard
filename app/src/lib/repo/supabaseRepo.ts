import { colorForName, formatFrequency, generateAreaCode, generateStaffCode, initialsFrom } from '../domain'
import { supabase } from '../supabaseClient'
import type { AdminUser, Area, Assignment, AuditAction, AuditLogEntry, Branch, BranchStatus, ChecklistTask, ImportBatch, Issue, LocationCategory, PhotoReviewStatus, ProofPhoto, ProofPhotoView, ReportTemplate, ReportType, Staff, TaskTemplate } from '../types'
import type { CreateAdminInput, CreateBranchInput, CreateStaffInput, CreateTaskInput, DataRepo, ImportAreaRow, ProofPhotoFilter, SaveReportTemplateInput, SaveTaskTemplateInput, UpdateAdminAccessInput, UpdateAdminInput, UpdateBranchInput, UpdateStaffInput, UpdateTaskInput } from './types'

/** Turn a raw Postgres/RPC error into the friendly duplicate messages the UI expects. */
function friendlyAdminError(message: string, email: string, staffCode: string): string {
  if (message.includes('already exists') || message.includes('admin_profiles_email_key')) {
    return `An account with "${email.trim().toLowerCase()}" already exists.`
  }
  if (message.includes('already in use') || message.includes('admin_profiles_staff_id_key')) {
    return `Staff ID "${staffCode}" is already in use.`
  }
  return message
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured — check your .env')
  return supabase
}

/** Monotonic counter so each subscribe() call gets its own realtime channel topic. */
let subscribeSeq = 0

function mapAuditLog(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    actorId: (row.actor_id as string) ?? null,
    actorName: row.actor_name as string,
    action: row.action as AuditAction,
    targetLabel: row.target_label as string,
    detail: (row.detail as string) ?? null,
    createdAt: row.created_at as string,
  }
}

/** Appends an accountability record for a privileged action — logged after the mutation already succeeded, so this never itself gates access. */
async function logAudit(siteId: string, action: AuditAction, targetLabel: string, detail: string | null = null) {
  const { data: authUser } = await client().auth.getUser()
  if (!authUser.user) return
  const { data: profile } = await client()
    .from('admin_profiles')
    .select('name')
    .eq('id', authUser.user.id)
    .maybeSingle()
  await client()
    .from('audit_logs')
    .insert({
      site_id: siteId,
      actor_id: authUser.user.id,
      actor_name: profile?.name ?? 'Unknown admin',
      action,
      target_label: targetLabel,
      detail,
    })
}

function mapImportBatch(row: Record<string, unknown>): ImportBatch {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    fileName: row.file_name as string,
    importedByName: row.imported_by_name as string,
    importedAt: row.imported_at as string,
    successCount: row.success_count as number,
    failedCount: row.failed_count as number,
    status: row.status as ImportBatch['status'],
  }
}

function mapTaskTemplate(row: Record<string, unknown>): TaskTemplate {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    name: row.name as string,
    taskType: row.task_type as TaskTemplate['taskType'],
    checklistItems: (row.checklist_items as string[]) ?? [],
    defaultPriority: row.default_priority as TaskTemplate['defaultPriority'],
    requirePhoto: row.require_photo as boolean,
    status: row.status as TaskTemplate['status'],
    createdAt: row.created_at as string,
  }
}

function mapReportTemplate(row: Record<string, unknown>): ReportTemplate {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    ownerAdminId: row.owner_admin_id as string,
    name: row.name as string,
    reportType: row.report_type as ReportType,
    fields: (row.fields as string[]) ?? [],
    sortBy: (row.sort_by as string) ?? null,
    groupBy: (row.group_by as string) ?? null,
    shared: row.shared as boolean,
    createdAt: row.created_at as string,
  }
}

function mapBranch(row: Record<string, unknown>): Branch {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    provinceState: (row.province_state as string) ?? '',
    name: row.name as string,
    code: row.code as string,
    address: (row.address as string) ?? null,
    timezone: (row.timezone as string) ?? null,
    contactPerson: (row.contact_person as string) ?? null,
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    status: (row.status as Branch['status']) ?? 'active',
    notes: (row.notes as string) ?? null,
    createdAt: (row.created_at as string) ?? new Date(0).toISOString(),
    createdByName: (row.created_by_name as string) ?? null,
  }
}

function mapStaff(row: Record<string, unknown>): Staff {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    branchId: (row.branch_id as string) ?? '',
    staffCode: row.staff_code as string,
    fullName: row.full_name as string,
    initials: row.initials as string,
    colorHex: row.color_hex as string,
    role: row.role as string,
    status: row.status as Staff['status'],
    accountStatus: (row.account_status as Staff['accountStatus']) ?? 'active',
    email: (row.email as string) ?? null,
    phone: (row.phone as string) ?? null,
    shiftStart: (row.shift_start as string) ?? null,
    shiftEnd: (row.shift_end as string) ?? null,
    createdAt: (row.created_at as string) ?? new Date(0).toISOString(),
    lastLoginAt: (row.last_login_at as string) ?? null,
  }
}

function mapAdmin(row: Record<string, unknown>, email: string): AdminUser {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    name: row.name as string,
    initials: row.initials as string,
    colorHex: row.color_hex as string,
    title: row.title as string,
    role: (row.role as AdminUser['role']) ?? 'read_only',
    email: (row.email as string) || email,
    phone: (row.phone as string) ?? null,
    staffCode: (row.staff_id as string) ?? null,
    accountStatus: (row.account_status as AdminUser['accountStatus']) ?? 'active',
    branchAll: (row.branch_all as boolean) ?? false,
    branchIds: (row.branch_ids as string[]) ?? [],
    defaultBranchId: (row.default_branch_id as string) ?? null,
    permissions: (row.permissions as AdminUser['permissions']) ?? {},
  }
}

function mapArea(row: Record<string, unknown>): Area {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    branchId: (row.branch_id as string) ?? '',
    name: row.name as string,
    code: row.code as string,
    category: (row.category as Area['category']) ?? 'other',
    categoryId: (row.category_id as string) ?? null,
    frequencyMinutes: (row.frequency_minutes as number) ?? null,
    taskTemplate: (row.task_template as string[]) ?? [],
    lastCleanedAt: (row.last_cleaned_at as string) ?? null,
    active: (row.active as boolean) ?? true,
  }
}

function mapCategory(row: Record<string, unknown>): LocationCategory {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string) ?? null,
    icon: (row.icon as string) ?? null,
    color: (row.color as string) ?? null,
    branchId: (row.branch_id as string) ?? null,
    isGlobal: (row.is_global as boolean) ?? true,
    isActive: (row.is_active as boolean) ?? true,
    sortOrder: (row.sort_order as number) ?? 0,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    archivedAt: (row.archived_at as string) ?? null,
  }
}

function mapIssue(row: Record<string, unknown>): Issue {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    branchId: (row.branch_id as string) ?? '',
    areaId: row.area_id as string,
    areaName: row.area_name as string,
    areaCode: row.area_code as string,
    assignmentId: (row.assignment_id as string) ?? null,
    staffId: (row.staff_id as string) ?? null,
    staffName: (row.staff_name as string) ?? null,
    description: row.description as string,
    severity: row.severity as Issue['severity'],
    status: row.status as Issue['status'],
    createdAt: row.created_at as string,
    resolvedAt: (row.resolved_at as string) ?? null,
  }
}

function mapTask(row: Record<string, unknown>): ChecklistTask {
  return {
    id: row.id as string,
    label: row.label as string,
    completed: row.completed as boolean,
    sortOrder: row.sort_order as number,
  }
}

function mapPhoto(row: Record<string, unknown>): ProofPhoto {
  return {
    id: row.id as string,
    label: row.label as ProofPhoto['label'],
    dataUrl: row.url as string,
    reviewStatus: (row.review_status as ProofPhoto['reviewStatus']) ?? 'pending',
    reviewNote: (row.review_note as string) ?? null,
    reviewedByName: (row.reviewed_by_name as string) ?? null,
  }
}

function mapAssignment(row: Record<string, unknown>): Assignment {
  const tasks = ((row.assignment_tasks as Record<string, unknown>[]) ?? [])
    .map(mapTask)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const photos = ((row.assignment_photos as Record<string, unknown>[]) ?? []).map(mapPhoto)
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    branchId: (row.branch_id as string) ?? '',
    areaId: row.area_id as string,
    areaName: row.area_name as string,
    areaCode: row.area_code as string,
    staffId: (row.staff_id as string) ?? null,
    status: row.status as Assignment['status'],
    dueAt: (row.due_at as string) ?? null,
    startedAt: (row.started_at as string) ?? null,
    submittedAt: (row.submitted_at as string) ?? null,
    sortOrder: row.sort_order as number,
    tasks,
    photos,
    note: (row.note as string) ?? null,
    priority: (row.priority as Assignment['priority']) ?? 'medium',
    taskType: (row.task_type as Assignment['taskType']) ?? 'cleaning',
    templateId: (row.template_id as string) ?? null,
    templateName: (row.template_name as string) ?? null,
    createdByName: (row.created_by_name as string) ?? null,
    requirePhoto: (row.require_photo as boolean) ?? false,
  }
}

const ASSIGNMENT_SELECT = '*, assignment_tasks(*), assignment_photos(*)'

/** Resolve which site a photo belongs to, via its assignment — used by the photo review/lookup paths. */
async function siteIdForPhoto(photoId: string): Promise<string | null> {
  const { data: photoRow } = await client().from('assignment_photos').select('assignment_id').eq('id', photoId).maybeSingle()
  if (!photoRow) return null
  const { data: aRow } = await client().from('assignments').select('site_id').eq('id', photoRow.assignment_id as string).maybeSingle()
  return (aRow?.site_id as string) ?? null
}

async function fetchAssignment(id: string): Promise<Assignment | null> {
  const { data, error } = await client()
    .from('assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? mapAssignment(data) : null
}

async function fetchArea(id: string): Promise<Area | null> {
  const { data, error } = await client().from('areas').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapArea(data) : null
}

/** Mirrors mockRepo's spawnNextCycle: inserts the next cleaning cycle for a recurring area. */
async function spawnNextCycle(area: Area, staffId: string | null, sortOrder: number) {
  if (!area.frequencyMinutes || !area.active) return
  const dueAt = new Date(Date.now() + area.frequencyMinutes * 60_000).toISOString()
  const { data: inserted, error } = await client()
    .from('assignments')
    .insert({
      site_id: area.siteId,
      area_id: area.id,
      area_name: area.name,
      area_code: area.code,
      staff_id: staffId,
      status: 'todo',
      due_at: dueAt,
      sort_order: sortOrder,
    })
    .select('id')
    .single()
  if (error) throw error
  if (area.taskTemplate.length > 0) {
    const { error: taskError } = await client()
      .from('assignment_tasks')
      .insert(
        area.taskTemplate.map((label, i) => ({
          assignment_id: inserted.id,
          label,
          completed: false,
          sort_order: i,
        })),
      )
    if (taskError) throw taskError
  }
}

export const supabaseRepo: DataRepo = {
  mode: 'supabase',

  async authenticateStaff(staffCode, pin) {
    const { data, error } = await client().rpc('authenticate_staff', {
      p_staff_code: staffCode.trim(),
      p_pin: pin,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    return row ? mapStaff(row) : null
  },

  async authenticateAdmin(email, password) {
    const { data, error } = await client().auth.signInWithPassword({ email, password })
    if (error || !data.user) return null
    const { data: profile, error: profileError } = await client()
      .from('admin_profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle()
    if (profileError || !profile) return null
    // Disabled/archived admins keep their history but can't sign in — drop the session.
    if ((profile.account_status as string) !== 'active') {
      await client().auth.signOut()
      return null
    }
    return mapAdmin(profile, email)
  },

  setActingAdmin() {
    // No-op — Supabase RLS reads the real authenticated session (auth.uid())
    // directly, so there's no separate "acting admin" to track client-side.
  },

  async getStaff(id) {
    // Via RPC, not a direct select: the staff app holds only the anon key, and the
    // staff table's RLS is admins-only (get_staff_public returns the row sans pin_hash).
    const { data, error } = await client().rpc('get_staff_public', { p_staff_id: id })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    return row ? mapStaff(row) : null
  },

  async getAdmin(id) {
    const { data, error } = await client()
      .from('admin_profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const { data: authUser } = await client().auth.getUser()
    return mapAdmin(data, authUser.user?.email ?? '')
  },

  async getSite(id) {
    const { data, error } = await client().from('sites').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? { id: data.id, name: data.name } : null
  },

  async listStaffForSite(siteId) {
    const { data, error } = await client().from('staff').select('*').eq('site_id', siteId)
    if (error) throw error
    return (data ?? []).map(mapStaff)
  },

  async setStaffStatus(staffId, status) {
    const { data, error } = await client().rpc('set_staff_status', {
      p_staff_id: staffId,
      p_status: status,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    return mapStaff(row)
  },

  async createStaff(siteId, input: CreateStaffInput) {
    const staffCode = input.staffCode?.trim() || generateStaffCode(input.fullName)
    const { data, error } = await client().rpc('create_staff', {
      p_site_id: siteId,
      p_branch_id: input.branchId,
      p_full_name: input.fullName,
      p_initials: initialsFrom(input.fullName),
      p_color_hex: colorForName(input.fullName),
      p_role: input.role,
      p_staff_code: staffCode,
      p_email: input.email,
      p_phone: input.phone,
      p_pin: input.pin,
    })
    if (error) {
      if (error.message.includes('staff_code')) throw new Error(`Staff ID "${staffCode}" is already in use.`)
      if (error.message.includes('staff_email_unique')) throw new Error(`Email "${input.email}" is already in use.`)
      throw error
    }
    const row = Array.isArray(data) ? data[0] : data
    const staff = mapStaff(row)
    await logAudit(siteId, 'user_added', staff.fullName, staff.staffCode)
    return staff
  },

  async updateStaff(staffId, patch: UpdateStaffInput) {
    const { data: beforeRow } = await client().from('staff').select('account_status').eq('id', staffId).maybeSingle()
    const beforeStatus = beforeRow?.account_status as Staff['accountStatus'] | undefined

    const payload: Record<string, unknown> = {}
    if (patch.fullName !== undefined) payload.full_name = patch.fullName
    if (patch.role !== undefined) payload.role = patch.role
    if (patch.email !== undefined) payload.email = patch.email
    if (patch.phone !== undefined) payload.phone = patch.phone
    if (patch.accountStatus !== undefined) payload.account_status = patch.accountStatus
    if (patch.staffCode !== undefined) payload.staff_code = patch.staffCode
    const { error } = await client().from('staff').update(payload).eq('id', staffId)
    if (error) {
      if (error.message.includes('staff_email_unique')) throw new Error(`Email "${patch.email}" is already in use.`)
      if (error.message.includes('staff_code')) throw new Error(`Staff ID "${patch.staffCode}" is already in use.`)
      throw error
    }
    const { data, error: fetchError } = await client()
      .from('staff')
      .select('*')
      .eq('id', staffId)
      .single()
    if (fetchError) throw fetchError

    // Disabling/archiving/deleting someone shouldn't strand their unfinished work
    // on a hidden column — send it back to Unassigned. Completed work keeps its
    // staff_id so their name still shows correctly in reports/history.
    if (patch.accountStatus && patch.accountStatus !== 'active') {
      const { error: unassignError } = await client()
        .from('assignments')
        .update({ staff_id: null })
        .eq('staff_id', staffId)
        .neq('status', 'done')
      if (unassignError) throw unassignError
    }

    const staff = mapStaff(data)
    if (patch.accountStatus === 'deleted' && beforeStatus !== 'deleted') {
      await logAudit(staff.siteId, 'user_deleted', staff.fullName)
    } else if (patch.accountStatus === 'archived' && beforeStatus !== 'archived') {
      await logAudit(staff.siteId, 'user_archived', staff.fullName)
    } else if (
      patch.accountStatus === 'active' &&
      (beforeStatus === 'archived' || beforeStatus === 'deleted')
    ) {
      await logAudit(staff.siteId, 'user_restored', staff.fullName)
    } else {
      await logAudit(staff.siteId, 'user_updated', staff.fullName)
    }
    return staff
  },

  async resetStaffPin(staffId, newPin) {
    const { data: staffRow } = await client().from('staff').select('site_id, full_name').eq('id', staffId).maybeSingle()
    const { error } = await client().rpc('reset_staff_pin', {
      p_staff_id: staffId,
      p_new_pin: newPin,
    })
    if (error) throw error
    if (staffRow) await logAudit(staffRow.site_id as string, 'pin_reset', staffRow.full_name as string)
  },

  async getMyAssignments(staffId) {
    const { data, error } = await client()
      .from('assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('staff_id', staffId)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data ?? []).map(mapAssignment)
  },

  async getAssignment(id) {
    return fetchAssignment(id)
  },

  async startAssignment(id) {
    const { error } = await client()
      .from('assignments')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'todo')
    if (error) throw error
    const a = await fetchAssignment(id)
    if (!a) throw new Error('Assignment not found')
    return a
  },

  async toggleTask(assignmentId, taskId) {
    const a = await fetchAssignment(assignmentId)
    if (!a) throw new Error('Assignment not found')
    const task = a.tasks.find((t) => t.id === taskId)
    if (task) {
      const { error } = await client()
        .from('assignment_tasks')
        .update({ completed: !task.completed })
        .eq('id', taskId)
      if (error) throw error
    }
    const updated = await fetchAssignment(assignmentId)
    if (!updated) throw new Error('Assignment not found')
    return updated
  },

  async addPhoto(assignmentId, label, dataUrl) {
    const blob = await (await fetch(dataUrl)).blob()
    const path = `${assignmentId}/${label}-${Date.now()}.jpg`
    const { error: uploadError } = await client().storage.from('proof-photos').upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,
    })
    if (uploadError) throw uploadError
    const { data: publicUrl } = client().storage.from('proof-photos').getPublicUrl(path)
    const { error } = await client()
      .from('assignment_photos')
      .insert({ assignment_id: assignmentId, label, url: publicUrl.publicUrl })
    if (error) throw error
    const updated = await fetchAssignment(assignmentId)
    if (!updated) throw new Error('Assignment not found')
    return updated
  },

  async setNote(assignmentId, note) {
    const { error } = await client().from('assignments').update({ note }).eq('id', assignmentId)
    if (error) throw error
    const updated = await fetchAssignment(assignmentId)
    if (!updated) throw new Error('Assignment not found')
    return updated
  },

  async submitProof(assignmentId) {
    const before = await fetchAssignment(assignmentId)
    if (!before) throw new Error('Assignment not found')
    const beforeArea = await fetchArea(before.areaId)
    if (beforeArea && !beforeArea.active) {
      throw new Error('This area has been deactivated and can no longer be cleaned.')
    }
    const now = new Date().toISOString()
    const { error } = await client()
      .from('assignments')
      .update({ status: 'done', submitted_at: now })
      .eq('id', assignmentId)
    if (error) throw error
    const updated = await fetchAssignment(assignmentId)
    if (!updated) throw new Error('Assignment not found')

    const area = await fetchArea(updated.areaId)
    if (area) {
      const { error: areaError } = await client()
        .from('areas')
        .update({ last_cleaned_at: now })
        .eq('id', area.id)
      if (areaError) throw areaError
      await spawnNextCycle({ ...area, lastCleanedAt: now }, updated.staffId, updated.sortOrder)
    }

    return updated
  },

  async getSiteAssignments(siteId) {
    const { data, error } = await client()
      .from('assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('site_id', siteId)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data ?? []).map(mapAssignment)
  },

  async assignStaffToArea(assignmentId, staffId) {
    const { error } = await client().rpc('assign_staff_to_area', {
      p_assignment_id: assignmentId,
      p_staff_id: staffId,
    })
    if (error) throw error
    const updated = await fetchAssignment(assignmentId)
    if (!updated) throw new Error('Assignment not found')
    const staffName = staffId
      ? ((await client().from('staff').select('full_name').eq('id', staffId).maybeSingle()).data?.full_name as string | undefined) ?? 'someone'
      : 'Unassigned'
    await logAudit(updated.siteId, 'route_reassigned', updated.areaName, `→ ${staffName}`)
    return updated
  },

  async listOpenAssignments(branchId) {
    const { data, error } = await client()
      .from('assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('branch_id', branchId)
      .is('staff_id', null)
      .neq('status', 'done')
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data ?? []).map(mapAssignment)
  },

  async claimAssignment(assignmentId, staffId) {
    // Claim-once without an RPC: the `.is('staff_id', null)` filter only matches while
    // the task is still unassigned, so a second claimer updates zero rows and gets null.
    const { data, error } = await client()
      .from('assignments')
      .update({ staff_id: staffId })
      .eq('id', assignmentId)
      .is('staff_id', null)
      .neq('status', 'done')
      .select(ASSIGNMENT_SELECT)
      .maybeSingle()
    if (error) throw error
    return data ? mapAssignment(data) : null
  },

  async publishRoutes(siteId) {
    // No dedicated "published" state in the schema yet — routes are live as soon as
    // they're assigned. This still round-trips through a role-checked RPC so the
    // permission is enforced now and there's a real hook to extend later.
    const { error } = await client().rpc('publish_routes', { p_site_id: siteId })
    if (error) throw error
    const { data: site } = await client().from('sites').select('name').eq('id', siteId).maybeSingle()
    await logAudit(siteId, 'routes_published', (site?.name as string) ?? 'site')
  },

  async listAreasForSite(siteId) {
    const { data, error } = await client().from('areas').select('*').eq('site_id', siteId)
    if (error) throw error
    return (data ?? []).map(mapArea)
  },

  async getArea(id) {
    return fetchArea(id)
  },

  async getAreaByCode(siteId, code) {
    const { data, error } = await client()
      .from('areas')
      .select('*')
      .eq('site_id', siteId)
      .ilike('code', code.trim())
      .maybeSingle()
    if (error) throw error
    return data ? mapArea(data) : null
  },

  async setAreaFrequency(areaId, frequencyMinutes) {
    const { error } = await client().rpc('set_area_frequency', {
      p_area_id: areaId,
      p_frequency_minutes: frequencyMinutes,
    })
    if (error) throw error
    const area = await fetchArea(areaId)
    if (!area) throw new Error('Area not found')
    await logAudit(area.siteId, 'area_frequency_changed', area.name, formatFrequency(frequencyMinutes))
    return area
  },

  async createArea(siteId, input) {
    const code = input.code?.trim() || generateAreaCode(input.name)
    const { data, error } = await client().rpc('create_area', {
      p_site_id: siteId,
      p_branch_id: input.branchId,
      p_name: input.name,
      p_code: code,
      p_category: input.category,
      p_frequency_minutes: input.frequencyMinutes,
      p_task_template: input.taskTemplate,
      p_category_id: input.categoryId ?? null,
    })
    if (error) {
      if (error.message.includes('areas_code')) throw new Error(`Area code "${code}" is already in use.`)
      throw error
    }
    const row = Array.isArray(data) ? data[0] : data
    const area = mapArea(row)
    await logAudit(siteId, 'area_created', area.name, area.code)
    return area
  },

  async deleteArea(areaId) {
    const area = await fetchArea(areaId)
    if (!area) throw new Error('Area not found')
    // Same guard as mock mode: completed proof / photos / issues are compliance history.
    const { count: doneCount } = await client()
      .from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('area_id', areaId)
      .eq('status', 'done')
    const { count: issueCount } = await client()
      .from('issues')
      .select('id', { count: 'exact', head: true })
      .eq('area_id', areaId)
    if ((doneCount ?? 0) > 0 || (issueCount ?? 0) > 0) {
      throw new Error(`"${area.name}" has cleaning history (proof, photos, or issues) — deactivate it instead of deleting.`)
    }
    // FK cascade removes the area's remaining (not-done) assignments and their tasks/photos.
    const { error } = await client().from('areas').delete().eq('id', areaId)
    if (error) throw error
    await logAudit(area.siteId, 'area_deleted', area.name, area.code)
  },

  async updateArea(areaId, patch) {
    const before = await fetchArea(areaId)
    const { data, error } = await client().rpc('update_area', {
      p_area_id: areaId,
      p_name: patch.name ?? null,
      p_category: patch.category ?? null,
      p_task_template: patch.taskTemplate ?? null,
      p_active: patch.active ?? null,
      p_category_id: patch.categoryId ?? null,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const area = mapArea(row)
    if (patch.categoryId !== undefined && patch.categoryId !== before?.categoryId) {
      await logAudit(area.siteId, 'area_category_changed', area.name, area.category)
    } else {
      const statusNote = patch.active === false && before?.active ? 'deactivated' : patch.active === true && before?.active === false ? 'reactivated' : null
      await logAudit(area.siteId, 'area_updated', area.name, statusNote)
    }
    return area
  },

  async importAreas(siteId, fileName, rows: ImportAreaRow[], failedCount) {
    // Resolve each row's category slug to a real category_id (matched to an existing category).
    const { data: catRows } = await client().from('location_categories').select('id, slug').eq('site_id', siteId)
    const catIdBySlug = new Map((catRows ?? []).map((c) => [(c.slug as string).toLowerCase(), c.id as string]))
    const catId = (slug: string) => catIdBySlug.get(slug.toLowerCase()) ?? null
    let successCount = 0
    for (const row of rows) {
      if (row.isUpdate) {
        const { data: existing } = await client()
          .from('areas')
          .select('id')
          .eq('site_id', siteId)
          .ilike('code', row.code)
          .maybeSingle()
        if (!existing) continue
        const { error } = await client().rpc('update_area', {
          p_area_id: existing.id,
          p_name: row.name,
          p_category: row.category,
          p_task_template: row.taskTemplate,
          p_active: row.active,
          p_category_id: catId(row.category),
        })
        if (error) continue
      } else {
        const { error } = await client().rpc('create_area', {
          p_site_id: siteId,
          p_branch_id: row.branchId,
          p_name: row.name,
          p_code: row.code,
          p_category: row.category,
          p_frequency_minutes: row.frequencyMinutes,
          p_task_template: row.taskTemplate,
          p_category_id: catId(row.category),
        })
        if (error) continue
        if (!row.active) {
          // create_area always starts an area active — deactivate right after if the file said otherwise.
          const { data: created } = await client().from('areas').select('id').eq('site_id', siteId).ilike('code', row.code).maybeSingle()
          if (created) await client().rpc('update_area', { p_area_id: created.id, p_name: null, p_category: null, p_task_template: null, p_active: false, p_category_id: null })
        }
      }
      successCount++
    }

    const { data: authUser } = await client().auth.getUser()
    const { data: profile } = authUser.user
      ? await client().from('admin_profiles').select('name').eq('id', authUser.user.id).maybeSingle()
      : { data: null }
    const { data, error } = await client()
      .from('location_import_batches')
      .insert({
        site_id: siteId,
        file_name: fileName,
        imported_by_name: profile?.name ?? 'Unknown admin',
        success_count: successCount,
        failed_count: failedCount,
        status: successCount === 0 ? 'failed' : failedCount > 0 ? 'partial' : 'success',
      })
      .select('*')
      .single()
    if (error) throw error
    await logAudit(siteId, 'locations_imported', fileName, `${successCount} imported, ${failedCount} failed`)
    return mapImportBatch(data)
  },

  // ————— Location categories —————

  async listCategories(siteId) {
    const { data, error } = await client()
      .from('location_categories')
      .select('*')
      .eq('site_id', siteId)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data ?? []).map(mapCategory)
  },

  async createCategory(siteId, input) {
    const { data, error } = await client().rpc('create_location_category', {
      p_site_id: siteId,
      p_name: input.name.trim(),
      p_description: input.description ?? null,
      p_icon: input.icon ?? null,
      p_color: input.color ?? null,
      p_branch_id: input.isGlobal ? null : input.branchId ?? null,
      p_is_global: input.isGlobal,
    })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    const category = mapCategory(row)
    await logAudit(siteId, 'category_created', category.name)
    return category
  },

  async updateCategory(categoryId, patch) {
    const { data, error } = await client().rpc('update_location_category', {
      p_id: categoryId,
      p_name: patch.name ?? null,
      p_description: patch.description ?? null,
      p_icon: patch.icon ?? null,
      p_color: patch.color ?? null,
      p_sort_order: patch.sortOrder ?? null,
    })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    const category = mapCategory(row)
    await logAudit(category.siteId, 'category_updated', category.name)
    return category
  },

  async setCategoryActive(categoryId, active) {
    const { data, error } = await client().rpc('set_category_active', { p_id: categoryId, p_active: active })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    const category = mapCategory(row)
    await logAudit(category.siteId, active ? 'category_restored' : 'category_archived', category.name)
    return category
  },

  async deleteCategory(categoryId) {
    const { data: cat } = await client().from('location_categories').select('site_id, name').eq('id', categoryId).maybeSingle()
    const { error } = await client().rpc('delete_location_category', { p_id: categoryId })
    if (error) throw new Error(error.message)
    if (cat) await logAudit(cat.site_id as string, 'category_deleted', cat.name as string)
  },

  async reassignCategory(fromCategoryId, toCategoryId) {
    const { data: cats } = await client().from('location_categories').select('id, name, site_id').in('id', [fromCategoryId, toCategoryId])
    const { data, error } = await client().rpc('reassign_area_category', { p_from_id: fromCategoryId, p_to_id: toCategoryId })
    if (error) throw new Error(error.message)
    const from = (cats ?? []).find((c) => c.id === fromCategoryId)
    const to = (cats ?? []).find((c) => c.id === toCategoryId)
    if (from) await logAudit(from.site_id as string, 'category_reassigned', `${from.name} → ${to?.name ?? '—'}`, `${data ?? 0} location(s)`)
    return (data as number) ?? 0
  },

  async listImportBatches(siteId) {
    const { data, error } = await client()
      .from('location_import_batches')
      .select('*')
      .eq('site_id', siteId)
      .order('imported_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapImportBatch)
  },

  async listTaskTemplates(siteId) {
    const { data, error } = await client().from('task_templates').select('*').eq('site_id', siteId)
    if (error) throw error
    return (data ?? []).map(mapTaskTemplate)
  },

  async saveTaskTemplate(siteId, input: SaveTaskTemplateInput) {
    if (input.id) {
      const { data, error } = await client().rpc('update_task_template', {
        p_template_id: input.id,
        p_name: input.name,
        p_task_type: input.taskType,
        p_checklist_items: input.checklistItems,
        p_default_priority: input.defaultPriority,
        p_require_photo: input.requirePhoto,
        p_status: input.status,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      await logAudit(siteId, 'task_template_updated', input.name)
      return mapTaskTemplate(row)
    }
    const { data, error } = await client().rpc('create_task_template', {
      p_site_id: siteId,
      p_name: input.name,
      p_task_type: input.taskType,
      p_checklist_items: input.checklistItems,
      p_default_priority: input.defaultPriority,
      p_require_photo: input.requirePhoto,
      p_status: input.status,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    await logAudit(siteId, 'task_template_created', input.name)
    return mapTaskTemplate(row)
  },

  async createTask(siteId, input: CreateTaskInput, createdByName) {
    const { data: maxRow } = await client()
      .from('assignments')
      .select('sort_order')
      .eq('site_id', siteId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    let nextSortOrder = ((maxRow?.sort_order as number | undefined) ?? 0) + 1

    const staffIds = input.staffIds.length > 0 ? input.staffIds : [null]
    const created: Assignment[] = []
    let areaName = ''
    for (const staffId of staffIds) {
      const { data, error } = await client().rpc('create_task', {
        p_site_id: siteId,
        p_area_id: input.areaId,
        p_staff_id: staffId,
        p_task_type: input.taskType,
        p_priority: input.priority,
        p_due_at: input.dueAt,
        p_checklist_items: input.checklistItems,
        p_template_id: input.templateId,
        p_template_name: input.templateName,
        p_created_by_name: createdByName,
        p_sort_order: nextSortOrder,
        p_require_photo: input.requirePhoto,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      const assignment = await fetchAssignment(row.id)
      if (assignment) {
        created.push(assignment)
        areaName = assignment.areaName
      }
      nextSortOrder++
    }
    await logAudit(siteId, 'task_created', areaName, `${created.length} assignment${created.length === 1 ? '' : 's'} · ${createdByName}`)
    return created
  },

  async reopenAssignment(assignmentId, reason) {
    const trimmedReason = reason.trim()
    if (!trimmedReason) throw new Error('A reason is required to reopen a task.')
    const { data, error } = await client().rpc('reopen_assignment', { p_assignment_id: assignmentId })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const updated = await fetchAssignment(row.id)
    if (!updated) throw new Error('Assignment not found')
    await logAudit(updated.siteId, 'task_reopened', updated.areaName, trimmedReason)
    return updated
  },

  async updateTaskDetails(assignmentId, patch: UpdateTaskInput) {
    const { data, error } = await client().rpc('update_task_details', {
      p_assignment_id: assignmentId,
      p_task_type: patch.taskType ?? null,
      p_priority: patch.priority ?? null,
      p_due_at: patch.dueAt ?? null,
      p_clear_due: patch.dueAt === null,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const updated = await fetchAssignment(row.id)
    if (!updated) throw new Error('Assignment not found')
    await logAudit(updated.siteId, 'task_updated', updated.areaName)
    return updated
  },

  async cancelAssignment(assignmentId, reason) {
    const trimmedReason = reason.trim()
    if (!trimmedReason) throw new Error('A reason is required to cancel a task.')
    // Read the label before the row is gone, for the audit entry.
    const target = await fetchAssignment(assignmentId)
    const { error } = await client().rpc('cancel_assignment', { p_assignment_id: assignmentId })
    if (error) throw error
    if (target) await logAudit(target.siteId, 'task_cancelled', target.areaName, trimmedReason)
  },

  async reportIssue(assignmentId, staffId, description, severity) {
    const assignment = await fetchAssignment(assignmentId)
    if (!assignment) throw new Error('Assignment not found')
    const { data: staffRow } = await client()
      .from('staff')
      .select('full_name')
      .eq('id', staffId)
      .maybeSingle()
    const { data, error } = await client()
      .from('issues')
      .insert({
        site_id: assignment.siteId,
        area_id: assignment.areaId,
        area_name: assignment.areaName,
        area_code: assignment.areaCode,
        assignment_id: assignmentId,
        staff_id: staffId,
        staff_name: staffRow?.full_name ?? null,
        description,
        severity,
      })
      .select('*')
      .single()
    if (error) throw error
    return mapIssue(data)
  },

  async listIssuesForSite(siteId) {
    const { data, error } = await client().from('issues').select('*').eq('site_id', siteId)
    if (error) throw error
    return (data ?? []).map(mapIssue)
  },

  async resolveIssue(issueId) {
    const { data, error } = await client().rpc('resolve_issue', { p_issue_id: issueId })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const issue = mapIssue(row)
    await logAudit(issue.siteId, 'issue_resolved', issue.areaName)
    return issue
  },

  async listAuditLogForSite(siteId) {
    const { data, error } = await client()
      .from('audit_logs')
      .select('*')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapAuditLog)
  },

  async logReportExport(siteId, reportLabel, detail) {
    await logAudit(siteId, 'report_exported', reportLabel, detail)
  },

  async listReportTemplates(siteId, _adminId) {
    // RLS already restricts rows to shared-at-site or owned-by-me.
    const { data, error } = await client().from('report_templates').select('*').eq('site_id', siteId)
    if (error) throw error
    return (data ?? []).map(mapReportTemplate)
  },

  async saveReportTemplate(siteId, adminId, input: SaveReportTemplateInput) {
    const payload = {
      site_id: siteId,
      owner_admin_id: adminId,
      name: input.name,
      report_type: input.reportType,
      fields: input.fields,
      sort_by: input.sortBy,
      group_by: input.groupBy,
      shared: input.shared,
    }
    if (input.id) {
      const { data, error } = await client().from('report_templates').update(payload).eq('id', input.id).select('*').single()
      if (error) throw error
      return mapReportTemplate(data)
    }
    const { data, error } = await client().from('report_templates').insert(payload).select('*').single()
    if (error) throw error
    return mapReportTemplate(data)
  },

  async deleteReportTemplate(templateId) {
    const { error } = await client().from('report_templates').delete().eq('id', templateId)
    if (error) throw error
  },

  // ————— Branches & access ————— (RLS restricts rows to the caller's accessible branches server-side)

  async listBranches(siteId, includeArchived = false) {
    let query = client().from('branches').select('*').eq('site_id', siteId)
    if (!includeArchived) query = query.neq('status', 'archived')
    const { data, error } = await query.order('name', { ascending: true })
    if (error) throw error
    return (data ?? []).map(mapBranch)
  },

  async getBranch(id) {
    const { data, error } = await client().from('branches').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? mapBranch(data) : null
  },

  async createBranch(siteId, input: CreateBranchInput) {
    const { data: authUser } = await client().auth.getUser()
    const { data: profile } = authUser.user
      ? await client().from('admin_profiles').select('name').eq('id', authUser.user.id).maybeSingle()
      : { data: null }
    const { data, error } = await client().rpc('create_branch', {
      p_site_id: siteId,
      p_province_state: input.provinceState,
      p_name: input.name,
      p_code: input.code ?? null,
      p_address: input.address,
      p_timezone: input.timezone,
      p_contact_person: input.contactPerson,
      p_phone: input.phone,
      p_email: input.email,
      p_notes: input.notes,
      p_created_by_name: (profile?.name as string) ?? null,
    })
    if (error) {
      if (error.message.includes('branches_code')) throw new Error(`Branch code "${input.code}" is already in use.`)
      throw error
    }
    const row = Array.isArray(data) ? data[0] : data
    const branch = mapBranch(row)
    await logAudit(siteId, 'branch_created', branch.name, branch.code)
    return branch
  },

  async updateBranch(branchId, patch: UpdateBranchInput) {
    const payload: Record<string, unknown> = {}
    if (patch.provinceState !== undefined) payload.province_state = patch.provinceState
    if (patch.name !== undefined) payload.name = patch.name
    if (patch.address !== undefined) payload.address = patch.address
    if (patch.timezone !== undefined) payload.timezone = patch.timezone
    if (patch.contactPerson !== undefined) payload.contact_person = patch.contactPerson
    if (patch.phone !== undefined) payload.phone = patch.phone
    if (patch.email !== undefined) payload.email = patch.email
    if (patch.notes !== undefined) payload.notes = patch.notes
    const { data, error } = await client().from('branches').update(payload).eq('id', branchId).select('*').single()
    if (error) throw error
    const branch = mapBranch(data)
    await logAudit(branch.siteId, 'branch_updated', branch.name)
    return branch
  },

  async setBranchStatus(branchId, status: BranchStatus, reason) {
    const trimmed = reason.trim()
    if (!trimmed) throw new Error('A reason is required.')
    const { data, error } = await client().rpc('set_branch_status', { p_branch_id: branchId, p_status: status })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const branch = mapBranch(row)
    const action = status === 'archived' ? 'branch_archived' : status === 'active' ? 'branch_restored' : 'branch_updated'
    await logAudit(branch.siteId, action, branch.name, trimmed)
    return branch
  },

  async listAdmins(siteId) {
    const { data, error } = await client().from('admin_profiles').select('*').eq('site_id', siteId)
    if (error) throw error
    return (data ?? []).map((row) => mapAdmin(row, (row.email as string) ?? ''))
  },

  async createAdmin(siteId, input: CreateAdminInput) {
    // The anon key can't create auth users directly, so this goes through the
    // superuser-gated create_admin_account RPC (SECURITY DEFINER) which makes the
    // auth.users + identity + admin_profiles rows in one shot.
    const staffCode = input.staffCode?.trim() || generateStaffCode(input.name)
    const { data, error } = await client().rpc('create_admin_account', {
      p_site_id: siteId,
      p_name: input.name.trim(),
      p_email: input.email.trim(),
      p_password: input.password,
      p_phone: input.phone ?? null,
      p_title: input.title.trim(),
      p_role: input.role,
      p_staff_id: staffCode,
      p_initials: initialsFrom(input.name),
      p_color_hex: colorForName(input.name),
      p_branch_all: input.branchAll,
      p_branch_ids: input.branchAll ? [] : input.branchIds,
      p_default_branch_id: input.branchAll ? null : input.defaultBranchId ?? input.branchIds[0] ?? null,
      p_account_status: input.accountStatus ?? 'active',
    })
    if (error) throw new Error(friendlyAdminError(error.message, input.email, staffCode))
    const row = Array.isArray(data) ? data[0] : data
    const admin = mapAdmin(row, input.email.trim().toLowerCase())
    await logAudit(siteId, 'user_added', admin.name, `Dashboard account · ${admin.email}`)
    return admin
  },

  async updateAdmin(adminId, patch: UpdateAdminInput) {
    const payload: Record<string, unknown> = {}
    if (patch.name !== undefined) {
      payload.name = patch.name.trim()
      payload.initials = initialsFrom(patch.name)
    }
    if (patch.title !== undefined) payload.title = patch.title.trim() || 'Dashboard user'
    if (patch.email !== undefined) payload.email = patch.email.trim().toLowerCase()
    if (patch.phone !== undefined) payload.phone = patch.phone?.trim() || null
    if (patch.staffCode !== undefined) payload.staff_id = patch.staffCode.trim()
    if (patch.role !== undefined) payload.role = patch.role
    const { data, error } = await client().from('admin_profiles').update(payload).eq('id', adminId).select('*').single()
    if (error) throw new Error(friendlyAdminError(error.message, patch.email ?? '', patch.staffCode ?? ''))
    const admin = mapAdmin(data, (data.email as string) ?? '')
    await logAudit(admin.siteId, patch.role ? 'permissions_updated' : 'user_updated', admin.name)
    return admin
  },

  async setAdminStatus(adminId, status) {
    const { data, error } = await client().rpc('set_admin_status', { p_admin_id: adminId, p_status: status })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const admin = mapAdmin(row, (row.email as string) ?? '')
    const action = status === 'archived' ? 'user_archived' : status === 'active' ? 'user_restored' : 'user_updated'
    await logAudit(admin.siteId, action, admin.name, status === 'disabled' ? 'Disabled' : null)
    return admin
  },

  async updateAdminAccess(adminId, patch: UpdateAdminAccessInput) {
    const payload: Record<string, unknown> = {}
    if (patch.branchAll !== undefined) payload.branch_all = patch.branchAll
    if (patch.branchIds !== undefined) payload.branch_ids = patch.branchIds
    if (patch.defaultBranchId !== undefined) payload.default_branch_id = patch.defaultBranchId
    if (patch.permissions !== undefined) payload.permissions = patch.permissions
    if (patch.role !== undefined) payload.role = patch.role
    const { data, error } = await client().from('admin_profiles').update(payload).eq('id', adminId).select('*').single()
    if (error) throw error
    const admin = mapAdmin(data, (data.email as string) ?? '')
    await logAudit(admin.siteId, patch.role ? 'permissions_updated' : 'branch_access_updated', admin.name)
    return admin
  },

  // ————— Staff photo proof —————

  async listProofPhotos(siteId, filter: ProofPhotoFilter = {}) {
    // Fetch scoped assignments with their photos and flatten client-side (RLS enforces branch access).
    let query = client().from('assignments').select(ASSIGNMENT_SELECT).eq('site_id', siteId)
    if (filter.branchId) query = query.eq('branch_id', filter.branchId)
    if (filter.staffId) query = query.eq('staff_id', filter.staffId)
    if (filter.areaId) query = query.eq('area_id', filter.areaId)
    const { data, error } = await query
    if (error) throw error
    const assignments = (data ?? []).map(mapAssignment)
    const { data: branchRows } = await client().from('branches').select('*').eq('site_id', siteId)
    const branchesById = new Map((branchRows ?? []).map((b) => [b.id as string, mapBranch(b)]))
    const { data: staffRows } = await client().from('staff').select('id, full_name').eq('site_id', siteId)
    const staffById = new Map((staffRows ?? []).map((s) => [s.id as string, s.full_name as string]))
    let views: ProofPhotoView[] = assignments.flatMap((a) =>
      a.photos.map((p) => ({
        id: p.id, assignmentId: a.id, siteId: a.siteId, branchId: a.branchId,
        branchName: branchesById.get(a.branchId)?.name ?? '—', branchCode: branchesById.get(a.branchId)?.code ?? '—',
        areaId: a.areaId, areaName: a.areaName, areaCode: a.areaCode, staffId: a.staffId,
        staffName: a.staffId ? staffById.get(a.staffId) ?? null : null, taskType: a.taskType, label: p.label,
        dataUrl: p.dataUrl, capturedAt: a.submittedAt ?? a.startedAt ?? a.dueAt ?? new Date().toISOString(),
        assignmentStatus: a.status, hasOpenIssue: false, reviewStatus: p.reviewStatus ?? 'pending',
        reviewNote: p.reviewNote ?? null, reviewedByName: p.reviewedByName ?? null,
      })),
    )
    if (filter.taskType) views = views.filter((v) => v.taskType === filter.taskType)
    if (filter.label) views = views.filter((v) => v.label === filter.label)
    if (filter.reviewStatus) views = views.filter((v) => v.reviewStatus === filter.reviewStatus)
    if (filter.from) views = views.filter((v) => new Date(v.capturedAt).getTime() >= new Date(filter.from!).getTime())
    if (filter.to) views = views.filter((v) => new Date(v.capturedAt).getTime() < new Date(filter.to!).getTime())
    if (filter.search) {
      const q = filter.search.trim().toLowerCase()
      views = views.filter((v) => v.areaName.toLowerCase().includes(q) || v.areaCode.toLowerCase().includes(q) || v.branchName.toLowerCase().includes(q) || (v.staffName?.toLowerCase().includes(q) ?? false))
    }
    views.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
    return views
  },

  async getProofPhoto(photoId) {
    const siteId = await siteIdForPhoto(photoId)
    if (!siteId) return null
    const all = await this.listProofPhotos(siteId)
    return all.find((v) => v.id === photoId) ?? null
  },

  async reviewProofPhoto(photoId, status: PhotoReviewStatus, note) {
    const { data: authUser } = await client().auth.getUser()
    const { data: profile } = authUser.user
      ? await client().from('admin_profiles').select('name').eq('id', authUser.user.id).maybeSingle()
      : { data: null }
    const { error } = await client()
      .from('assignment_photos')
      .update({ review_status: status, review_note: note, reviewed_by_name: (profile?.name as string) ?? null })
      .eq('id', photoId)
    if (error) throw error
    const siteId = await siteIdForPhoto(photoId)
    const all = siteId ? await this.listProofPhotos(siteId) : []
    const view = all.find((v) => v.id === photoId)
    if (!view) throw new Error('Photo not found')
    await logAudit(view.siteId, 'photo_reviewed', view.areaName, `${status}${note ? ` · ${note}` : ''}`)
    return view
  },

  async logPhotoExport(siteId, detail) {
    await logAudit(siteId, 'photos_exported', 'Photo proof', detail)
  },

  subscribe(siteId, cb) {
    // Unique topic per subscription: supabase-js returns the existing channel for a
    // reused topic, and adding postgres_changes callbacks to an already-subscribed
    // channel throws — which unmounts whatever screen subscribed second.
    const channel = client()
      .channel(`site-${siteId}-changes-${++subscribeSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assignments', filter: `site_id=eq.${siteId}` },
        () => cb(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignment_tasks' }, () =>
        cb(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignment_photos' }, () =>
        cb(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'areas', filter: `site_id=eq.${siteId}` },
        () => cb(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff', filter: `site_id=eq.${siteId}` },
        () => cb(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'issues', filter: `site_id=eq.${siteId}` },
        () => cb(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'audit_logs', filter: `site_id=eq.${siteId}` },
        () => cb(),
      )
      .subscribe()
    return () => {
      client().removeChannel(channel)
    }
  },
}

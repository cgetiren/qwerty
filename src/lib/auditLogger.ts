import { supabase } from './supabase';

export type AuditActionType =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'flag'
  | 'resolve'
  | 'reanalyze'
  | 'export'
  | 'sync'
  | 'login'
  | 'logout'
  | 'assign'
  | 'revoke';

export type AuditEntityType =
  | 'chat'
  | 'chat_analysis'
  | 'personnel'
  | 'user'
  | 'role'
  | 'permission'
  | 'brand'
  | 'setting'
  | 'bonus_rule'
  | 'bonus_report'
  | 'coaching'
  | 'callback'
  | 'alert'
  | 'sync_job'
  | 'page';

interface AuditLogParams {
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId?: string;
  entityLabel?: string;
  description?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  brandId?: string;
}

export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', session.user.id)
      .maybeSingle();

    await supabase.from('audit_logs').insert({
      user_id: session.user.id,
      user_name: profile?.full_name || session.user.email || 'Bilinmeyen',
      action_type: params.actionType,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      entity_label: params.entityLabel || null,
      description: params.description || null,
      old_values: params.oldValues || null,
      new_values: params.newValues || null,
      metadata: params.metadata || {},
      brand_id: params.brandId || null,
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

export function logPageView(pageName: string, brandId?: string): void {
  logAudit({
    actionType: 'view',
    entityType: 'page',
    entityLabel: pageName,
    description: `${pageName} sayfasi goruntulendi`,
    brandId,
  });
}

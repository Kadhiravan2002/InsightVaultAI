import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

const CreateClientInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  company_name: z.string().optional().default(""),
});

export const createClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateClientInput.parse(data))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, company_name: data.company_name },
    });
    if (error) throw new Error(error.message);
    return { user_id: created.user?.id };
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "client");
    if (rolesErr) throw new Error(rolesErr.message);
    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, company_name, created_at")
      .in("id", ids);
    if (pErr) throw new Error(pErr.message);
    return profiles ?? [];
  });

export const deleteClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, description, client_user_id, created_at, project_files(count), conversations(count)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(1),
      description: z.string().optional().default(""),
      client_user_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ws, error } = await supabaseAdmin
      .from("workspaces")
      .insert({
        name: data.name,
        description: data.description,
        client_user_id: data.client_user_id,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ws;
  });

export const listWorkspaceFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Admin gets full list via RLS; clients also allowed via their own RLS policy
    const { data: files, error } = await context.supabase
      .from("project_files")
      .select("id, name, mime_type, size_bytes, indexed, created_at")
      .eq("workspace_id", data.workspace_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return files ?? [];
  });

export const listConversationsForWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: convs, error } = await supabaseAdmin
      .from("conversations")
      .select("id, title, created_at, updated_at, user_id, messages(count)")
      .eq("workspace_id", data.workspace_id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return convs ?? [];
  });

export const getConversationMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Admin uses adminClient; client uses RLS via context.supabase — both work.
    const { data: adminRow } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (adminRow) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: msgs, error } = await supabaseAdmin
        .from("messages").select("*").eq("conversation_id", data.conversation_id).order("created_at");
      if (error) throw new Error(error.message);
      return msgs ?? [];
    }
    const { data: msgs, error } = await context.supabase
      .from("messages").select("*").eq("conversation_id", data.conversation_id).order("created_at");
    if (error) throw new Error(error.message);
    return msgs ?? [];
  });
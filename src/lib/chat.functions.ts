import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callLovableAI, type ChatMessage } from "./ai-gateway.server";

const AskInput = z.object({
  conversation_id: z.string().uuid(),
  question: z.string().min(1),
});

export const getMyWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workspaces")
      .select("*, project_files(id, name, mime_type, size_bytes, indexed, created_at)")
      .eq("client_user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const listMyConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("conversations")
      .select("id, title, created_at, updated_at, workspace_id")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace_id: z.string().uuid(), title: z.string().optional().default("New conversation") }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conv, error } = await context.supabase
      .from("conversations")
      .insert({ workspace_id: data.workspace_id, user_id: context.userId, title: data.title })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return conv;
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: msgs, error } = await context.supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", data.conversation_id)
      .order("created_at");
    if (error) throw new Error(error.message);
    return msgs ?? [];
  });

/**
 * Answer a client question using only their own workspace documents.
 * Persists user + assistant messages, returns the assistant message row.
 */
export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AskInput.parse(d))
  .handler(async ({ data, context }) => {
    // Load conversation (RLS enforces ownership)
    const { data: conv, error: cErr } = await context.supabase
      .from("conversations")
      .select("id, workspace_id, user_id, title")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (cErr || !conv) throw new Error("Conversation not found");

    // Load workspace + files (RLS enforces client only sees their own workspace files)
    const { data: ws } = await context.supabase
      .from("workspaces").select("id, name, description").eq("id", conv.workspace_id).maybeSingle();
    const { data: files, error: fErr } = await context.supabase
      .from("project_files")
      .select("id, name, mime_type, extracted_text")
      .eq("workspace_id", conv.workspace_id);
    if (fErr) throw new Error(fErr.message);

    // Prior messages for context (last 20)
    const { data: history } = await context.supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(20);

    // Save user message first
    await context.supabase.from("messages").insert({
      conversation_id: conv.id,
      role: "user",
      content: data.question,
    });

    // Build documents context. Cap total chars to avoid gigantic prompts.
    const MAX_TOTAL = 120_000;
    let used = 0;
    const docBlocks: string[] = [];
    const sources: Array<{ file_id: string; name: string }> = [];
    for (const f of files ?? []) {
      const text = (f.extracted_text ?? "").trim();
      if (!text) continue;
      const room = Math.max(0, MAX_TOTAL - used);
      if (room <= 0) break;
      const snippet = text.slice(0, Math.min(text.length, room));
      docBlocks.push(`--- FILE: ${f.name} (id:${f.id}) ---\n${snippet}`);
      used += snippet.length;
      sources.push({ file_id: f.id, name: f.name });
    }

    const systemPrompt = `You are InsightVault AI, a senior data-analytics consultant assistant for the client "${ws?.name ?? ""}". Answer questions ONLY using the provided project documents below. If the answer is not in the documents, say so clearly and suggest what the analyst might need to provide.

RULES:
- Use markdown. Be concise, professional, and structured (bullets, short sections).
- When you cite information, mention the source filename in-line, e.g. "(from Q4_Report.pdf)".
- Never reference documents from other clients.
- If asked to summarize the project, cover: goal, methods, key findings, and recommendations from the docs.

PROJECT DOCUMENTS:
${docBlocks.length ? docBlocks.join("\n\n") : "(No indexed documents are available yet.)"}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).map((m) => ({ role: m.role as any, content: m.content })),
      { role: "user", content: data.question },
    ];

    let answer = "";
    try {
      answer = await callLovableAI({ messages });
    } catch (e) {
      answer = `I couldn't reach the AI service right now. ${(e as Error).message}`;
    }

    // Detect which sources were actually referenced by filename (simple substring match)
    const usedSources = sources.filter((s) => answer.toLowerCase().includes(s.name.toLowerCase()));

    const { data: inserted, error: iErr } = await context.supabase
      .from("messages")
      .insert({
        conversation_id: conv.id,
        role: "assistant",
        content: answer,
        sources: (usedSources.length ? usedSources : sources.slice(0, 3)) as any,
      })
      .select()
      .single();
    if (iErr) throw new Error(iErr.message);

    // Auto-title first exchange
    if ((history ?? []).length === 0) {
      const title = data.question.slice(0, 60);
      await context.supabase.from("conversations").update({ title }).eq("id", conv.id);
    } else {
      await context.supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conv.id);
    }

    return inserted;
  });
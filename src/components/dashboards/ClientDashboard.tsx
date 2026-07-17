import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, MessageSquare, Plus, Send, Sparkles, ArrowRight } from "lucide-react";
import { getMyWorkspace, listMyConversations, createConversation, listMessages, askAssistant } from "@/lib/chat.functions";
import { getSignedFileUrl } from "@/lib/files.functions";

const SUGGESTIONS = [
  "Summarize my project.",
  "What were the key findings?",
  "Which recommendations were made?",
  "Which KPIs improved?",
];

export default function ClientDashboard() {
  const getWs = useServerFn(getMyWorkspace);
  const listConvs = useServerFn(listMyConversations);
  const createConv = useServerFn(createConversation);
  const listMsgs = useServerFn(listMessages);
  const ask = useServerFn(askAssistant);
  const signFn = useServerFn(getSignedFileUrl);

  const [ws, setWs] = useState<any>(null);
  const [convs, setConvs] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadAll() {
    const [w, c] = await Promise.all([getWs({}), listConvs({})]);
    setWs(w); setConvs(c);
    if (c.length && !activeConv) setActiveConv(c[0].id);
  }
  useEffect(() => { loadAll().catch((e) => toast.error(e.message)); }, []);
  useEffect(() => { if (activeConv) listMsgs({ data: { conversation_id: activeConv } }).then(setMessages).catch(() => {}); }, [activeConv]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);

  async function ensureConv(): Promise<string | null> {
    if (activeConv) return activeConv;
    if (!ws?.id) { toast.error("No workspace assigned. Ask your consultant."); return null; }
    const c = await createConv({ data: { workspace_id: ws.id, title: "New conversation" } });
    setActiveConv(c.id); setConvs((prev) => [c, ...prev]);
    return c.id;
  }

  async function send(question: string) {
    if (!question.trim() || busy) return;
    const cid = await ensureConv(); if (!cid) return;
    setInput("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: question, sources: [] }]);
    setBusy(true);
    try {
      await ask({ data: { conversation_id: cid, question } });
      const fresh = await listMsgs({ data: { conversation_id: cid } });
      setMessages(fresh);
      listConvs({}).then(setConvs);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function download(id: string) {
    try { const { url } = await signFn({ data: { file_id: id } }); window.open(url, "_blank"); }
    catch (e: any) { toast.error(e.message); }
  }

  if (!ws) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div className="max-w-md">
          <Sparkles className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-xl font-semibold">No workspace assigned yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your consultant will assign your project shortly. Check back once they've set up your workspace.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen grid grid-rows-[auto_1fr]">
      <div className="border-b border-border/60 bg-card/40 px-6 py-5 backdrop-blur">
        <p className="text-xs uppercase tracking-widest text-primary/80">Project</p>
        <h1 className="mt-1 text-2xl font-semibold">{ws.name}</h1>
        {ws.description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{ws.description}</p>}
      </div>

      <div className="grid min-h-0 lg:grid-cols-[320px_1fr_320px]">
        {/* Conversations */}
        <aside className="hidden overflow-y-auto border-r border-border/60 p-4 lg:block">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Conversations</h2>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => {
              const c = await createConv({ data: { workspace_id: ws.id, title: "New conversation" } });
              setConvs((p) => [c, ...p]); setActiveConv(c.id); setMessages([]);
            }}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-1">
            {convs.map((c) => (
              <button key={c.id} onClick={() => setActiveConv(c.id)}
                className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm ${activeConv === c.id ? "bg-accent/40" : "hover:bg-accent/20"}`}>
                <div className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5 text-muted-foreground" /><span className="truncate">{c.title}</span></div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{new Date(c.updated_at).toLocaleDateString()}</div>
              </button>
            ))}
            {convs.length === 0 && <p className="text-xs text-muted-foreground">Ask your first question below.</p>}
          </div>
        </aside>

        {/* Chat */}
        <section className="flex min-h-0 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 && !busy ? (
              <div className="mx-auto max-w-2xl py-16 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl gradient-primary shadow-elegant">
                  <Sparkles className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="mt-5 text-2xl font-semibold">Ask InsightVault anything about your project</h3>
                <p className="mt-2 text-sm text-muted-foreground">Answers are grounded in your uploaded documents only.</p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="group flex items-center justify-between rounded-lg border border-border/60 bg-card/60 px-4 py-3 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent/20">
                      <span>{s}</span>
                      <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-4">
                {messages.map((m) => (
                  <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                    {m.role === "assistant" && (
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg gradient-primary"><Sparkles className="h-4 w-4 text-primary-foreground" /></div>
                    )}
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border/60"}`}>
                      {m.role === "assistant" ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                      )}
                      {m.role === "assistant" && Array.isArray(m.sources) && m.sources.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Sources</span>
                          {m.sources.map((s: any) => (
                            <Badge key={s.file_id} variant="secondary" className="cursor-pointer" onClick={() => download(s.file_id)}>
                              <FileText className="mr-1 h-3 w-3" /> {s.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="flex gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg gradient-primary"><Sparkles className="h-4 w-4 animate-pulse text-primary-foreground" /></div>
                    <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">Thinking…</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border/60 bg-card/40 p-4 backdrop-blur">
            <form className="mx-auto flex max-w-3xl gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Ask a question about your project…"
                rows={1}
                className="min-h-[44px] resize-none"
              />
              <Button type="submit" disabled={busy || !input.trim()} className="gradient-primary text-primary-foreground shadow-elegant">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </section>

        {/* Files */}
        <aside className="hidden overflow-y-auto border-l border-border/60 p-4 lg:block">
          <h2 className="mb-3 text-sm font-semibold">Project files</h2>
          <div className="space-y-1.5">
            {(ws.project_files ?? []).map((f: any) => (
              <div key={f.id} className="rounded-lg border border-border/50 bg-card/60 p-3">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.name}</div>
                    <div className="text-xs text-muted-foreground">{f.size_bytes ? Math.round(f.size_bytes / 1024) : 0} KB</div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => download(f.id)}><Download className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
            {(!ws.project_files || ws.project_files.length === 0) && (
              <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
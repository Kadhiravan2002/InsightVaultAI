import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Upload, FileText, RefreshCw, MessageSquare, Building2 } from "lucide-react";
import {
  createClientAccount, listClients, deleteClientAccount,
  listWorkspaces, createWorkspace, listWorkspaceFiles,
  listConversationsForWorkspace, getConversationMessages,
} from "@/lib/admin.functions";
import { indexFile, deleteFile, getSignedFileUrl } from "@/lib/files.functions";
import { supabase } from "@/integrations/supabase/client";

type Client = { id: string; email: string; full_name: string | null; company_name: string | null };
type Workspace = { id: string; name: string; description: string | null; client_user_id: string | null; created_at: string };

export default function AdminDashboard() {
  const listClientsFn = useServerFn(listClients);
  const listWsFn = useServerFn(listWorkspaces);
  const deleteClientFn = useServerFn(deleteClientAccount);

  const [clients, setClients] = useState<Client[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWs, setSelectedWs] = useState<Workspace | null>(null);

  async function refresh() {
    const [c, w] = await Promise.all([listClientsFn({}), listWsFn({})]);
    setClients(c as Client[]);
    setWorkspaces(w as Workspace[]);
  }

  useEffect(() => { refresh().catch((e) => toast.error(String(e.message ?? e))); }, []);

  return (
    <div className="p-6 md:p-10 max-w-7xl">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary/80">Admin console</p>
          <h1 className="mt-1 text-3xl font-semibold">Clients & workspaces</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage client accounts, project workspaces, and files. Clients only see their own workspace.</p>
        </div>
        <div className="flex gap-2">
          <CreateClientDialog onCreated={refresh} />
          <CreateWorkspaceDialog clients={clients} onCreated={refresh} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Workspaces</h2>
            <Badge variant="secondary">{workspaces.length}</Badge>
          </div>
          <div className="space-y-1.5">
            {workspaces.map((w) => {
              const client = clients.find((c) => c.id === w.client_user_id);
              const active = selectedWs?.id === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => setSelectedWs(w)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${active ? "border-primary/50 bg-accent/30" : "border-transparent hover:bg-accent/20"}`}
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="truncate text-sm font-medium">{w.name}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {client ? (client.company_name || client.full_name || client.email) : "— unassigned —"}
                  </div>
                </button>
              );
            })}
            {workspaces.length === 0 && (
              <p className="text-sm text-muted-foreground">No workspaces yet. Create a client, then a workspace.</p>
            )}
          </div>

          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">Clients</h2>
            <div className="space-y-1.5">
              {clients.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.full_name || c.email}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.email}</div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      if (!confirm(`Delete client ${c.email}? This is irreversible.`)) return;
                      try { await deleteClientFn({ data: { user_id: c.id } }); toast.success("Client deleted"); refresh(); }
                      catch (e: any) { toast.error(e.message); }
                    }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {clients.length === 0 && <p className="text-sm text-muted-foreground">No client accounts yet.</p>}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-card">
          {selectedWs ? (
            <WorkspaceDetail ws={selectedWs} clients={clients} onChange={refresh} />
          ) : (
            <div className="grid h-full place-items-center py-24 text-center text-muted-foreground">
              <div>
                <Building2 className="mx-auto h-10 w-10 text-primary/50" />
                <p className="mt-3">Select a workspace to view files & chat history.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateClientDialog({ onCreated }: { onCreated: () => void }) {
  const create = useServerFn(createClientAccount);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus className="mr-1 h-4 w-4" /> New client</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create client account</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div><Label>Company</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          </div>
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Temporary password</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button disabled={busy} className="gradient-primary text-primary-foreground" onClick={async () => {
            setBusy(true);
            try { await create({ data: { email, password, full_name: fullName, company_name: company } }); toast.success("Client created"); setOpen(false); onCreated(); }
            catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
          }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateWorkspaceDialog({ clients, onCreated }: { clients: Client[]; onCreated: () => void }) {
  const create = useServerFn(createWorkspace);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gradient-primary text-primary-foreground"><Plus className="mr-1 h-4 w-4" /> New workspace</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create workspace</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div><Label>Project name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Q4 Sales Analysis" /></div>
          <div><Label>Description</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} /></div>
          <div>
            <Label>Assign to client</Label>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— Select client —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name || c.full_name || c.email}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={busy || !name || !clientId} className="gradient-primary text-primary-foreground" onClick={async () => {
            setBusy(true);
            try { await create({ data: { name, description: desc, client_user_id: clientId } }); toast.success("Workspace created"); setOpen(false); onCreated(); }
            catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
          }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceDetail({ ws, clients, onChange }: { ws: Workspace; clients: Client[]; onChange: () => void }) {
  const client = clients.find((c) => c.id === ws.client_user_id);
  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{ws.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{ws.description || "No description"}</p>
          <div className="mt-2 text-xs text-muted-foreground">
            Client: <span className="text-foreground">{client ? (client.company_name || client.full_name || client.email) : "unassigned"}</span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="files" className="mt-6">
        <TabsList>
          <TabsTrigger value="files"><FileText className="mr-1.5 h-4 w-4" /> Files</TabsTrigger>
          <TabsTrigger value="chats"><MessageSquare className="mr-1.5 h-4 w-4" /> Chat history</TabsTrigger>
        </TabsList>
        <TabsContent value="files" className="pt-4"><FilesPanel workspaceId={ws.id} onChange={onChange} /></TabsContent>
        <TabsContent value="chats" className="pt-4"><ChatsPanel workspaceId={ws.id} /></TabsContent>
      </Tabs>
    </div>
  );
}

function FilesPanel({ workspaceId, onChange }: { workspaceId: string; onChange: () => void }) {
  const listFn = useServerFn(listWorkspaceFiles);
  const indexFn = useServerFn(indexFile);
  const delFn = useServerFn(deleteFile);
  const signFn = useServerFn(getSignedFileUrl);
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  async function load() {
    const f = await listFn({ data: { workspace_id: workspaceId } });
    setFiles(f);
  }
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [workspaceId]);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const path = `${workspaceId}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from("project-files").upload(path, file, { contentType: file.type });
      if (upErr) { toast.error(`Upload failed: ${upErr.message}`); continue; }
      const { data: row, error: iErr } = await supabase.from("project_files").insert({
        workspace_id: workspaceId,
        name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        storage_path: path,
      }).select().single();
      if (iErr || !row) { toast.error(`Register failed: ${iErr?.message}`); continue; }
      toast.success(`${file.name} uploaded — indexing…`);
      indexFn({ data: { file_id: row.id } })
        .then(() => { toast.success(`${file.name} indexed`); load(); })
        .catch((e) => toast.error(`Index failed: ${e.message}`));
    }
    setUploading(false);
    load(); onChange();
  }

  async function download(id: string) {
    try { const { url } = await signFn({ data: { file_id: id } }); window.open(url, "_blank"); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Label className="cursor-pointer">
          <input type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
          <span className="inline-flex items-center gap-2 rounded-md gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-elegant">
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload files"}
          </span>
        </Label>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh</Button>
        <p className="text-xs text-muted-foreground">PDF, Excel, CSV, Word, PowerPoint, images.</p>
      </div>

      <div className="mt-4 divide-y divide-border/60 rounded-xl border border-border/60 bg-background/40">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-3 px-4 py-3">
            <FileText className="h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{f.name}</div>
              <div className="text-xs text-muted-foreground">
                {(f.size_bytes ? Math.round(f.size_bytes / 1024) : 0)} KB · {f.mime_type || "unknown"} · {f.indexed ? <span className="text-emerald-400">indexed</span> : <span className="text-amber-400">pending</span>}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => download(f.id)}>Download</Button>
            {!f.indexed && (
              <Button variant="ghost" size="sm" onClick={async () => {
                toast.info("Re-indexing…");
                try { await indexFn({ data: { file_id: f.id } }); toast.success("Indexed"); load(); }
                catch (e: any) { toast.error(e.message); }
              }}>Index</Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={async () => {
                if (!confirm(`Delete ${f.name}?`)) return;
                try { await delFn({ data: { file_id: f.id } }); toast.success("Deleted"); load(); onChange(); }
                catch (e: any) { toast.error(e.message); }
              }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {files.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No files yet.</div>}
      </div>
    </div>
  );
}

function ChatsPanel({ workspaceId }: { workspaceId: string }) {
  const listFn = useServerFn(listConversationsForWorkspace);
  const msgFn = useServerFn(getConversationMessages);
  const [convs, setConvs] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => { listFn({ data: { workspace_id: workspaceId } }).then(setConvs).catch((e) => toast.error(e.message)); }, [workspaceId]);
  useEffect(() => { if (selected) msgFn({ data: { conversation_id: selected } }).then(setMessages); }, [selected]);

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <div className="space-y-1">
        {convs.map((c) => (
          <button key={c.id} onClick={() => setSelected(c.id)}
            className={`w-full truncate rounded-md px-3 py-2 text-left text-sm ${selected === c.id ? "bg-accent/30" : "hover:bg-accent/20"}`}>
            {c.title}
            <div className="text-xs text-muted-foreground">{new Date(c.updated_at).toLocaleString()}</div>
          </button>
        ))}
        {convs.length === 0 && <p className="text-sm text-muted-foreground">No conversations yet.</p>}
      </div>
      <div className="min-h-[300px] rounded-xl border border-border/60 bg-background/40 p-4">
        {selected ? (
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={`rounded-lg p-3 ${m.role === "user" ? "bg-accent/20" : "bg-card"}`}>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">{m.role}</div>
                <div className="whitespace-pre-wrap text-sm">{m.content}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a conversation to view its transcript.</p>
        )}
      </div>
    </div>
  );
}
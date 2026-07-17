import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callLovableAI } from "./ai-gateway.server";

const IndexFileInput = z.object({ file_id: z.string().uuid() });

/**
 * Extract text from an uploaded file and store it on the row.
 * Admin-only. Downloads the file from storage, sends to Gemini for text extraction.
 */
export const indexFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IndexFileInput.parse(data))
  .handler(async ({ data, context }) => {
    // Verify caller is admin
    const { data: adminRow } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!adminRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file, error: fErr } = await supabaseAdmin
      .from("project_files").select("*").eq("id", data.file_id).maybeSingle();
    if (fErr || !file) throw new Error("File not found");

    const mime = file.mime_type ?? "";
    let extracted = "";

    try {
      const { data: blob, error: dErr } = await supabaseAdmin.storage
        .from("project-files").download(file.storage_path);
      if (dErr || !blob) throw new Error(dErr?.message ?? "download failed");
      const buf = new Uint8Array(await blob.arrayBuffer());

      if (mime.startsWith("text/") || mime === "application/json" || mime === "text/csv" || file.name.match(/\.(txt|csv|md|json)$/i)) {
        extracted = new TextDecoder().decode(buf).slice(0, 200_000);
      } else if (mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const b64 = btoa(String.fromCharCode(...buf));
        extracted = await callLovableAI({
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Extract ALL text content, headings, tables, figure captions and key data from this document. Preserve structure with headings. Output plain text only, no commentary." },
                { type: "file", file: { filename: file.name, file_data: `data:application/pdf;base64,${b64}` } },
              ],
            },
          ],
        });
      } else if (mime.startsWith("image/")) {
        const b64 = btoa(String.fromCharCode(...buf));
        extracted = await callLovableAI({
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Describe this image in detail. If it is a chart, extract every data point, axis label, legend, title, and key insight. Output plain text." },
                { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
              ],
            },
          ],
        });
      } else {
        // Excel/Word/PowerPoint: not directly parsed in MVP. Store metadata note.
        extracted = `[File "${file.name}" (${mime}) is stored but its content is not automatically indexed. Ask the admin to upload a PDF export for full AI search.]`;
      }
    } catch (e) {
      extracted = `[Indexing failed for ${file.name}: ${(e as Error).message}]`;
    }

    await supabaseAdmin.from("project_files")
      .update({ extracted_text: extracted, indexed: true })
      .eq("id", data.file_id);

    return { ok: true, length: extracted.length };
  });

/** Generate a signed URL for downloading a file (client & admin). */
export const getSignedFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ file_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS on project_files ensures caller can only see their files
    const { data: file, error } = await context.supabase
      .from("project_files").select("id, storage_path, name").eq("id", data.file_id).maybeSingle();
    if (error || !file) throw new Error("Not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("project-files").createSignedUrl(file.storage_path, 300, { download: file.name });
    if (sErr || !signed) throw new Error(sErr?.message ?? "signing failed");
    return { url: signed.signedUrl, name: file.name };
  });

export const deleteFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ file_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: adminRow } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!adminRow) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file } = await supabaseAdmin
      .from("project_files").select("storage_path").eq("id", data.file_id).maybeSingle();
    if (file?.storage_path) {
      await supabaseAdmin.storage.from("project-files").remove([file.storage_path]);
    }
    await supabaseAdmin.from("project_files").delete().eq("id", data.file_id);
    return { ok: true };
  });
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");

const API = `${SUPABASE_URL}/rest/v1/content_items?select=id,content_type,title,slug,excerpt,body,body_format,status,source_path,seo_title,seo_description,metadata,updated_at&status=eq.published&metadata->>cms_managed=eq.true&order=updated_at.asc`;
const res = await fetch(API, {
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
});
if (!res.ok) throw new Error(`Supabase query failed: ${res.status} ${await res.text()}`);
const items = await res.json();

const fs = await import("node:fs/promises");
const path = await import("node:path");

function escHtml(s="") {
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
}
function markdownToHtml(md="") {
  const s = String(md).replace(/\r\n/g,"\n").trim();
  if (!s) return "";
  const lines = s.split("\n"), out = [];
  let inList = false;
  const inline = x => x.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g,'<a href="$2">$1</a>');
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/,""))}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    const m = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (m) { const n = m[1].length; out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}
function bodyHtml(item) {
  if (item.body_format === "markdown") return markdownToHtml(item.body);
  if (item.body_format === "text") return `<pre>${escHtml(item.body)}</pre>`;
  return item.body || "";
}
function relPrefix(file) {
  const depth = file.split("/").length - 1;
  return depth > 0 ? "../".repeat(depth) : "";
}
function inferredPath(item) {
  let p = String(item.source_path || "").trim().replace(/^\/+/, "");
  if (!p) p = `${String(item.slug || "page").replace(/^\/+|\/+$/g,"")}.html`;
  if (!p.endsWith(".html")) p += ".html";
  return p;
}
function newTemplate(item, file) {
  const prefix = relPrefix(file);
  const title = escHtml(item.seo_title || item.title);
  const desc = escHtml(item.seo_description || item.excerpt || "");
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="icon" href="${prefix}assets/LARACHE%20LOGO.webp">
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f6f8fb;color:#172033}header{padding:18px 6%;background:#fff;border-bottom:1px solid #e5e9f0}main{max-width:900px;margin:40px auto;padding:0 20px;background:#fff;border-radius:18px;box-shadow:0 8px 30px rgba(0,0,0,.06)}article{padding:32px}a{color:#2563eb}img{max-width:100%;height:auto}</style>
</head>
<body>
<header><a href="${prefix}index.html"><img src="${prefix}assets/LARACHE%20LOGO.webp" alt="Larache Web Dev" height="42"></a></header>
<main><article>
<h1>${escHtml(item.title)}</h1>
${item.excerpt ? `<p>${escHtml(item.excerpt)}</p>` : ""}
${bodyHtml(item)}
</article></main>
</body>
</html>
`;
}
function updateExisting(html,item) {
  const title = escHtml(item.seo_title || item.title);
  const desc = escHtml(item.seo_description || item.excerpt || "");
  let out = html;
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(out)) out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/i,`<title>${title}</title>`);
  else out = out.replace(/<head([^>]*)>/i,`<head$1>\n<title>${title}</title>`);
  const metaRe = /<meta\s+name=["']description["'][^>]*>/i;
  const meta = `<meta name="description" content="${desc}">`;
  if (metaRe.test(out)) out = out.replace(metaRe,meta);
  else out = out.replace(/<head([^>]*)>/i,`<head$1>\n${meta}`);
  const bodyRe = /<body([^>]*)>[\s\S]*?<\/body>/i;
  if (bodyRe.test(out)) out = out.replace(bodyRe,(_,attrs)=>`<body${attrs}>\n${bodyHtml(item)}\n</body>`);
  return out;
}

let changed=0, created=0, skipped=0;
for (const item of items) {
  const file = inferredPath(item);
  if (!file.endsWith(".html") || file.startsWith(".github/")) { skipped++; continue; }
  let current = "", exists = true;
  try { current = await fs.readFile(file,"utf8"); } catch { exists = false; }
  const next = exists ? updateExisting(current,item) : newTemplate(item,file);
  if (next !== current) {
    const dir = path.dirname(file);
    if (dir !== ".") await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(file,next);
    changed++;
    if (!exists) created++;
  }
}
console.log(JSON.stringify({publishedCmsItems:items.length,changed,created,skipped},null,2));

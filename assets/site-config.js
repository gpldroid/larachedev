(async()=>{try{
  const res=await fetch("/larachedev/assets/site-config.json?ts="+Date.now(),{cache:"no-store"});if(!res.ok)return;
  const d=await res.json(),root=document.documentElement,css=root.style;
  if(d.lang)root.lang=d.lang;if(d.dir)root.dir=d.dir;
  if(d.font_family)css.setProperty("--font-main","'"+String(d.font_family).replace(/['"]/g,"")+"', system-ui, -apple-system, sans-serif");
  if(d.primary_color){css.setProperty("--brand-primary",d.primary_color);css.setProperty("--brand-hover",d.accent_color||d.primary_color)}
  if(d.accent_color)css.setProperty("--brand-accent",d.accent_color);if(d.background_color)css.setProperty("--bg-main",d.background_color);
  if(d.site_title)document.title=d.seo_title||d.site_title;
  const setMeta=(name,content)=>{if(!content)return;let el=document.querySelector('meta[name="'+name+'"]');if(!el){el=document.createElement("meta");el.name=name;document.head.appendChild(el)}el.content=content};
  setMeta("description",d.seo_description||d.site_description);
  const theme=document.querySelector('meta[name="theme-color"]');if(theme&&d.primary_color)theme.content=d.primary_color;
  document.querySelectorAll('link[rel="icon"]').forEach(el=>{if(d.favicon_path)el.href="/larachedev/"+String(d.favicon_path).replace(/^\/+?/,"")});
  document.querySelectorAll(".brand img").forEach(img=>{if(d.logo_path)img.src="/larachedev/"+String(d.logo_path).replace(/^\/+?/,"");if(d.site_title)img.alt=d.site_title});
  const nav=Array.isArray(d.navigation)?d.navigation:[],rootUrl="/larachedev/";
  const hrefFor=h=>String(h||"").startsWith("#")?rootUrl+h:h;
  document.querySelectorAll(".navlinks,.mobile-nav").forEach(el=>{if(nav.length)el.innerHTML=nav.map(item=>'<a href="'+hrefFor(item.href).replace(/"/g,"&quot;")+'">'+String(item.label||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))+"</a>").join("")});
  document.querySelectorAll("footer .footer-grid > div:first-child strong").forEach(el=>{if(d.site_title)el.textContent=d.site_title});
  document.querySelectorAll("footer .footer-grid > div:first-child p:first-of-type").forEach(el=>{if(d.footer_text)el.textContent=d.footer_text});
  const header=document.querySelector("header.header");if(header){header.dataset.designVariant=d.header_variant||"default";header.classList.add("design-"+(d.header_variant||"default"))}
}catch(e){console.warn("site-config:",e)}})();
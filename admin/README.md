# LaracheDev Admin

Admin dashboard داخل مستودع gpldroid/larachedev.

Architecture:
- GitHub Pages: الواجهة الثابتة.
- Supabase: Auth + PostgreSQL + RLS + Realtime.
- Supabase Edge Functions: بوابة GitHub API الآمنة.
- GitHub API: إدارة الملفات والbranches والcommits وActions وReleases.

Security:
- لا نضع GitHub PAT داخل GitHub Pages.
- لا نضع Supabase service_role أو secret key في JavaScript عام.
- عمليات الكتابة تمر عبر Edge Function محمية بالمصادقة والصلاحيات.

Current status:
- Dashboard shell: جاهز.
- Website Viewer: جاهز.
- Website Files Manager UI: جاهز.
- Supabase project مستقل: متعذر حاليًا لأن حساب Free وصل إلى الحد الأقصى للمشاريع النشطة.

Website:
https://gpldroid.github.io/larachedev/

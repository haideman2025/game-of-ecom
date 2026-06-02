# Phase 2 Setup Guide — Backend với CF Workers + D1 + Google OAuth

Sau khi deploy code Phase 2, mày cần làm 4 việc thủ công trong dashboard để kích hoạt auth:

---

## ✅ 1. D1 database — ĐÃ TẠO SẴN

Database: **`fb-pack-studio-db`**
UUID: `e5257ed6-51a9-42cf-8970-eb610fb9291f`
Region: APAC
Schema: 4 tables (users, packs, sessions, oauth_states) + indexes — đã apply

Mày không cần làm gì với DB. Chỉ cần bind nó vào Pages project (step 3 dưới).

---

## 🔐 2. Tạo Google OAuth Client ID

1. Vào https://console.cloud.google.com/apis/credentials
2. Chọn project (hoặc tạo mới "FB Pack Studio")
3. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
4. Application type: **Web application**
5. Name: `FB Pack Studio`
6. **Authorized JavaScript origins**:
   - `https://fb-pack-studio.pages.dev`
7. **Authorized redirect URIs**:
   - `https://fb-pack-studio.pages.dev/auth/callback`
8. Click **CREATE** → copy 2 giá trị:
   - **Client ID** (dạng `xxx.apps.googleusercontent.com`)
   - **Client secret** (dạng `GOCSPX-xxx`)

⚠️ Nếu chưa có "OAuth consent screen" config, làm:
- APIs & Services → OAuth consent screen → **External** → fill app name, support email, dev email → Save
- Scopes: chỉ cần default (openid, email, profile)
- Test users (nếu app ở testing mode): add email mày để test

---

## 🔗 3. Bind D1 + add Env Vars trong Cloudflare Pages

Vào https://dash.cloudflare.com → **Workers & Pages** → click project **`fb-pack-studio`**

### 3a. D1 binding
- Tab **Settings** → mục **Functions** → **D1 database bindings**
- Click **Add binding**:
  - Variable name: **`DB`** (chính xác chữ này — code tham chiếu `env.DB`)
  - D1 database: chọn **`fb-pack-studio-db`** từ dropdown
- Save

### 3b. Environment variables (Production)
- Same Settings page → mục **Environment variables**
- Click **Add variable** → chọn **Production** environment
- Add 3 biến (Encrypt cho an toàn):

| Variable name | Value | Type |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` từ Step 2 | Secret |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxx` từ Step 2 | Secret |
| `BASE_URL` | `https://fb-pack-studio.pages.dev` | Plaintext |

Click **Save**.

---

## 🚀 4. Redeploy

Sau khi bind D1 + env vars, các Function mới reload với config đúng. Chạy 1 trong 2 cách:

**Cách A — Re-deploy via wrangler (CLI):**
```bash
cd C:\Users\Admin\Documents\Claude\Projects\DEMAN\fb-pack-studio-deploy
npx wrangler pages deploy . --project-name=fb-pack-studio --branch=main --commit-dirty=true
```

**Cách B — Trigger redeploy via dashboard:**
- Workers & Pages → `fb-pack-studio` → **Deployments** tab
- Click **...** trên deployment mới nhất → **Retry deployment**

---

## 🧪 Test sau khi config xong

1. Mở https://fb-pack-studio.pages.dev/
2. Top bar phải có nút **☁️ Sign in**
3. Click → redirect tới Google → chọn account → quay về app
4. Sau khi login, nút đổi thành avatar + email → click → **Account modal** hiện info + tier
5. Test API trực tiếp:
   ```bash
   # Trong browser DevTools Console:
   await fetch('/api/me').then(r => r.json())
   # Expected: { user: {...}, tier: {...}, packs_count: 0 }
   ```

---

## 🔍 Troubleshooting

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| "Server not configured: GOOGLE_CLIENT_ID missing" | Env var chưa set | Step 3b |
| "Token exchange failed: redirect_uri_mismatch" | Redirect URI trong Google Console không khớp | Phải EXACT `https://fb-pack-studio.pages.dev/auth/callback` |
| `/api/me` trả 401 | OK — nghĩa là chưa login | Bình thường |
| `/api/me` trả 500 | D1 binding chưa setup hoặc tên sai | Step 3a, binding name phải là `DB` |
| OAuth callback page show "Invalid state" | State expired (>10 min) hoặc cookie blocked | Retry login, đảm bảo browser cho cookie từ pages.dev |

---

## 📋 API Endpoints Reference

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/auth/google` | - | Redirect → Google OAuth consent |
| GET | `/auth/callback` | - | Handle code → set session cookie |
| POST | `/auth/logout` | Cookie | Clear session |
| GET | `/api/me` | Cookie | Current user + tier + packs_count |
| GET | `/api/packs` | Cookie | List user's packs |
| POST | `/api/packs` | Cookie | Create pack (quota enforced) |
| GET | `/api/packs/:id` | Cookie | Get pack detail |
| PUT | `/api/packs/:id` | Cookie | Update pack |
| DELETE | `/api/packs/:id` | Cookie | Delete pack |

---

## 🗄️ D1 Schema

### users
```
id TEXT PK
email TEXT UNIQUE
name, picture TEXT
google_id TEXT UNIQUE
tier TEXT ('trial'|'tier1'|'tier2'|'expired')
tier_started_at INTEGER (ms)
tier_expires_at INTEGER (ms, NULL for trial)
max_packs INTEGER (default 5)
is_admin INTEGER (0/1)
created_at, last_login_at INTEGER
```

### packs
```
id TEXT PK
user_id TEXT FK → users.id (CASCADE)
name TEXT
brand_json, posts_json, mascot_refs_json, product_refs_json TEXT
image_count, audio_count, video_count, scene_count INTEGER
created_at, updated_at INTEGER
```

⚠️ Note: `*_refs_json` chỉ chứa metadata (NO base64). Base64 ảnh/audio/video vẫn lưu IndexedDB ở client. Cross-device sync **chỉ brand + post text + counts**, không sync media files.

### sessions
```
token TEXT PK (random 64 hex chars)
user_id TEXT FK → users.id
expires_at, created_at INTEGER
user_agent TEXT
```

Session sống 30 ngày, refresh on each /api/me call.

### oauth_states
```
state TEXT PK (CSRF token)
expires_at INTEGER (10 min from creation)
return_url TEXT
```

State token one-use, deleted after callback consumed.

---

## 🛣️ Roadmap V2.x

- **V2.1 — Cloud pack CRUD wiring**: Frontend tự động dùng cloud API khi user logged in (currently only auth UI + display). Cần wire: ProjectsModal call `/api/packs` thay vì IDB.
- **V2.2 — Local → Cloud migration**: Khi user lần đầu login, prompt "Sync N local packs to cloud?" → POST tất cả.
- **V2.3 — R2 asset storage**: Upload mascot/product refs + generated images lên R2, cross-device sync media.
- **V2.4 — Billing**: Stripe integration → Tier 1 paid → server-side tier update via webhook.
- **V2.5 — Admin panel**: `/api/admin/users` (chỉ admin) để manage users + tiers + ban.

---

## 🔒 Security Notes

- Session cookie: HttpOnly + Secure + SameSite=Lax — không thể đọc từ JS
- OAuth state: random 32 hex chars, one-use, 10 min TTL → chống CSRF
- D1 prepared statements: tránh SQL injection
- User isolation: mọi query `WHERE user_id = ?` enforce ở DB layer
- API key Gemini của user: vẫn lưu client-side localStorage (BYOK model, mỗi user tự cấp key của họ)

---

## 💰 Cost (estimated)

| Service | Free tier | Realistic usage |
|---|---|---|
| Pages | 500 builds/month, unlimited bandwidth | Đủ thoải mái |
| Workers (Functions) | 100k requests/day | ~1k req per active user, 100 users = 100k/day = limit |
| D1 | 5GB storage, 5M reads/day, 100k writes/day | Đủ cho hàng nghìn users |
| OAuth | Free | - |

Khi vượt free tier → Workers Paid plan $5/month = 10M requests/month, đủ cho ~10k users.

Sources:
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Google OAuth 2.0 setup](https://developers.google.com/identity/protocols/oauth2/web-server)

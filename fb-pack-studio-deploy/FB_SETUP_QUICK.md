# 🚀 Setup Facebook — Phiên bản ngắn nhất có thể

> Trước đây t bắt mày làm 4 bước (tạo App + Page + grant scope + lấy token thủ công).
> Giờ chỉ còn **2 bước** + **3 lệnh PowerShell**. App tự handle OAuth.

---

## ✅ Bước 1 — Setup Meta App (1 lần, ~5 phút)

### 1a. Tạo Facebook Page (skip nếu đã có)
👉 https://www.facebook.com/pages/create/ → đặt tên → Save

### 1b. Tạo Meta Developer App
👉 https://developers.facebook.com/ → Login bằng FB

1. Top-right **My Apps** → **Create App**
2. Use case: **Other** → Next
3. Type: **Business** → Next
4. Tên: `FB Pack Studio` → Create App
5. Trên Dashboard, copy **App ID** (16 số ở top)
6. **Settings → Basic → Show** (nhập password FB) → copy **App Secret**

### 1c. Add "Facebook Login for Business" product
1. Sidebar **Add Product** → tìm **Facebook Login for Business** → Set up
2. **Settings** → **Valid OAuth Redirect URIs** → paste 2 dòng:
   ```
   https://fb-pack-studio.pages.dev/auth/fb/callback
   https://fb-pack-studio.pages.dev/
   ```
3. **Save**

✅ Done. Mày có 2 giá trị:
- `APP_ID` (vd `1418755999999124`)
- `APP_SECRET` (chuỗi 32 ký tự, giữ kín)

---

## ✅ Bước 2 — Setup Cloudflare + Deploy (~2 phút)

Mở **PowerShell**:

```powershell
cd C:\Users\Admin\Documents\Claude\Projects\DEMAN\fb-pack-studio-deploy

# Copy source mới nhất
copy ..\fb-pack-studio.html .\index.html

# (Nếu chưa apply schema) Apply D1 tables
npx wrangler d1 execute fb-pack-studio-db --remote --file=schema_v9_fb.sql
```

Sau đó chạy **lần lượt** 3 lệnh (đợi mỗi lệnh xong):

```powershell
npx wrangler pages secret put FB_APP_ID --project-name=fb-pack-studio
```
→ Khi prompt `Enter a secret value:` → paste **App ID** → Enter

```powershell
npx wrangler pages secret put FB_APP_SECRET --project-name=fb-pack-studio
```
→ Paste **App Secret** → Enter

```powershell
npx wrangler pages secret put BASE_URL --project-name=fb-pack-studio
```
→ Paste: `https://fb-pack-studio.pages.dev` → Enter

Cuối cùng:
```powershell
npx wrangler pages deploy . --project-name=fb-pack-studio --branch=main --commit-dirty=true
```

---

## 🎉 Test (không cần làm gì thêm trên Meta)

1. Mở https://fb-pack-studio.pages.dev/ → **Ctrl+Shift+R** (hard refresh)
2. Sign in Google
3. Header → nút **📘 Connect FB** (amber) → click
4. Modal hiện ra → click **Sign in with Facebook** (xanh)
5. Popup Facebook → chọn page mày muốn connect → **Continue** → cấp permissions → **Allow**
6. Quay về app → toast `✅ Connected to "Page Name"`
7. Header nút đổi thành **📘 FB Connected** (xanh)

App giờ tự handle 100% OAuth flow: code → user token → long-lived → page token → save encrypted.

---

## 🧪 Publish bài đầu tiên

1. Vào 1 post có ảnh đã gen
2. Click **📤 Publish to FB**
3. Modal preview hiện ra → confirm caption
4. Click **📤 Publish Now** → đợi 5s → ✅ + link bài thật

Mở fanpage thật → bài lên 🎉

---

## ⏭️ Phase B (Boost Ads) — sau khi Phase A OK

Khi mày publish được 1 bài organic thành công, ping t → t code:
- Nút **📣 Boost** trên PostCard
- Modal chọn audience + budget + duration
- Backend gọi Marketing API tạo Campaign → AdSet → Ad

---

## 🚨 Nếu lỗi

| Triệu chứng | Fix |
|---|---|
| `redirect_uri_mismatch` khi popup FB | Check Bước 1c — URL phải EXACT `https://fb-pack-studio.pages.dev/auth/fb/callback` |
| `Server not configured: FB_APP_ID` | Chạy lại lệnh secret put + deploy |
| Popup FB không hiện | Browser chặn popup → check icon address bar |
| `No Pages found` | Mày phải là **admin** của Page, không phải Editor |
| `Session lost` | Sign out Google + sign in lại |

Screenshot error → ping t.

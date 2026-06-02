# 📁 Google Drive Integration — Setup Guide (V11)

> App giờ sync media trực tiếp vào **Drive của user** thay vì R2. User trust cao + free 15GB/Gmail account.

## 🎯 Cần làm trước khi deploy

### Bước 1 — Enable Drive API trong Google Cloud Console

1. Mở: https://console.cloud.google.com/apis/library/drive.googleapis.com
2. Chọn project có Meta App + Gemini key (vd `fb-pack-studio`)
3. Click **Enable** → đợi 30 giây

### Bước 2 — Update OAuth Consent Screen

1. Mở: https://console.cloud.google.com/apis/credentials/consent
2. Click **Edit App**
3. **App information**:
   - App name: `FB Pack Studio`
   - User support email: email mày
   - App logo: optional (làm sau khi verify)
4. **Scopes** → click **Add or Remove Scopes**:
   - Tìm `https://www.googleapis.com/auth/drive.file`
   - Tick ✅ → Update
5. **Test users** (nếu app ở Testing mode):
   - Click **+ Add Users** → add email của mày + 2 đồng nghiệp pilot
   - Save
6. **Publishing status**:
   - Đang ở **Testing** → OK cho mày + Test Users dùng
   - Nếu muốn public cho mọi user Gmail → click **Publish App** → Google đòi verify (1-2 tuần)

### Bước 3 — Verify Authorized Redirect URIs

1. Mở: https://console.cloud.google.com/apis/credentials
2. Click OAuth 2.0 Client ID của app
3. **Authorized redirect URIs** phải có:
   ```
   https://fb-pack-studio.pages.dev/auth/callback
   ```
   (Đã có sẵn từ V4 setup — kiểm tra lại thôi)
4. Save

---

## 🚀 Deploy V11

```powershell
cd C:\Users\Admin\Documents\Claude\Projects\DEMAN\fb-pack-studio-deploy
copy ..\fb-pack-studio.html .\index.html

# Apply schema v11 (idempotent fails OK)
npx wrangler d1 execute fb-pack-studio-db --remote --file=schema_v11_drive.sql

# Deploy
npx wrangler pages deploy . --project-name=fb-pack-studio --branch=main --commit-dirty=true
```

Nếu schema báo `duplicate column` cho 1 trong 3 columns → bỏ qua, các columns còn lại đã tạo OK.

---

## 🧪 Test sau deploy

### Lần đầu activate Drive trên máy A

1. Mở https://fb-pack-studio.pages.dev/ → **Ctrl+Shift+R**
2. **Sign out** (nếu đang sign in) → vào Account → Sign out
3. Click **Sign in with Google** lại
4. Popup Google hiện ra **thêm permission**:
   > FB Pack Studio wants to access...
   > 📁 See, edit, create, and delete only the specific Google Drive files you use with this app
5. Click **Allow**
6. Quay về app → Settings → bật **☁️ Google Drive Sync** ON

### Sync existing media lên Drive

1. 📁 Packs → click **🚀 Sync ALL Packs**
2. Đợi (~2-5 phút cho ~250MB / pack)
3. Vào https://drive.google.com → My Drive → folder **"FB Pack Studio"** → mỗi pack 1 subfolder
4. Mở subfolder → thấy ảnh/voice/video đầy đủ ✓

### Test cross-device

1. Login máy B (điện thoại) cùng Gmail
2. Lần đầu: cũng phải Allow Drive permission
3. Settings → bật Cloud Sync
4. 📁 Packs → 📂 Open → auto popup `Download N media?` → OK
5. Background download từ Drive → ảnh/voice/video hiện đầy đủ

### Test share với đồng nghiệp

1. Trên máy A: 📁 Packs → 🔗 Share → email đồng nghiệp → Editor
2. Đồng nghiệp login → Accept invite
3. Họ Allow Drive permission (lần đầu)
4. Pack mở ra → ảnh hiện từ Drive của MÀY (proxy qua app)
5. Họ gen ảnh mới → upload vào Drive của HỌ

---

## 📂 Cấu trúc Drive của user

```
My Drive/
└── FB Pack Studio/          ← Root folder app tạo
    ├── ONIIZ/                ← Pack 1
    │   ├── image_post01_xxx.png
    │   ├── image_post02_xxx.png
    │   ├── audio_post15_xxx.wav
    │   ├── video_post15_clip01_xxx.mp4
    │   └── storyboard_post15_scene01_xxx.png
    ├── Acne Brand/           ← Pack 2
    │   └── ...
    └── Test Pack/
```

⚠️ App **chỉ thấy folder + files do app tạo** (scope `drive.file`) — KHÔNG access được phần còn lại của Drive user.

---

## 🚨 Troubleshooting

| Lỗi | Fix |
|---|---|
| `Drive not connected. User needs to re-login` | Sign out → sign in lại → Allow Drive permission |
| `Drive refresh token revoked` | User đã revoke access tại myaccount.google.com → sign in lại |
| Popup không hiện Drive scope | Vào https://myaccount.google.com/permissions → Remove `FB Pack Studio` → sign in lại app |
| `403 access denied` khi upload | App chưa add Test User → mày add email đó vào Console |
| `App not verified` warning màu vàng | Bình thường ở Testing mode — click **Advanced** → **Go to fb-pack-studio (unsafe)** |
| Drive folder không hiện trong My Drive | Check My Drive → Shared with me hoặc tìm theo tên `FB Pack Studio` |
| `quotaExceeded` khi upload | User Drive hết 15GB free → upgrade Google One $2/100GB |

---

## 💡 Lợi ích vs R2

| Tiêu chí | Trước (R2) | Sau (Drive) |
|---|---|---|
| **Storage cost** | $0.015/GB/month — mày trả | **0đ** — user trả Drive của họ |
| **Free tier** | 10GB shared | 15GB MỖI user |
| **User trust** | "App lưu hộ" | "File trong Drive TÔI" |
| **Native UI** | Phải qua app | Mở Drive xem/share/download trực tiếp |
| **Backup** | Mất R2 = mất | Google backup tự động |
| **Sharing** | Qua D1 only | Có thể share Drive folder cho ai bất kỳ |
| **Mobile offline** | Phải download lại | Google Drive native cache |
| **Setup app side** | Bind R2 bucket | Không cần (Drive API tự động) |

---

## 📋 Files đã tạo V11

- `schema_v11_drive.sql` — D1 columns + drive_files table
- `functions/auth/google.js` — thêm Drive scope + offline access
- `functions/auth/callback.js` — lưu drive_refresh_token
- `functions/_drive.js` — Drive API helper (token refresh, folder, upload, download)
- `functions/api/drive/setup.js` — tạo root + per-pack folder
- `functions/api/drive/upload.js` — upload file lên Drive
- `functions/api/drive/download/[fileId].js` — proxy download
- `functions/api/drive/list.js` — list files của pack
- Frontend: `uploadAssetToCloud`, `listCloudMedia`, `downloadCloudMediaToLocal` đã swap qua `/api/drive/*`

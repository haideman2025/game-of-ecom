# Hướng dẫn Setup Facebook Integration

> Mày cần làm 4 bước này TRƯỚC khi t code feature publish/boost. Toàn bộ mất ~20-30 phút lần đầu.

---

## 🎯 Bước 1 — Tạo Facebook Page mới (5 phút)

Skip bước này nếu đã có page rồi.

1. Truy cập https://www.facebook.com/pages/create/
2. **Tên Page**: vd `ONIIZ Vietnam` (hoặc brand mày đang test)
3. **Category**: pick 1-3 categories phù hợp (vd `Brand`, `Personal Care`, `Health/Beauty`)
4. **Bio**: viết 1 câu mô tả ngắn
5. Click **Create Page**
6. Skip phần thêm ảnh đại diện/cover (làm sau cũng được)

✅ Sau bước này: mày có **Page ID** (lấy từ URL hoặc Settings → About → Page transparency).
   Ví dụ URL `facebook.com/yourpagename/` hoặc `facebook.com/pages/.../1234567890`.

---

## 🎯 Bước 2 — Tạo Meta Developer App (10 phút)

Đây là cái app trung gian để API gọi Facebook trên danh nghĩa app của mày.

1. Truy cập https://developers.facebook.com/
2. Login bằng tài khoản Facebook chính (cùng tài khoản admin Page ở bước 1)
3. Top-right click **My Apps** → **Create App**
4. **Use case**: chọn **Other** → Next
5. **App type**: chọn **Business** → Next
6. **App details**:
   - **App name**: vd `FB Pack Studio - Năng` (sẽ hiện cho user end khi OAuth, đặt rõ ràng)
   - **App contact email**: email mày
   - **Business Account**: chọn account hoặc tạo mới (auto-tạo cũng OK)
7. Click **Create App** → có thể yêu cầu password Facebook để confirm

✅ Sau bước này: mày landing vào **App Dashboard**. Note 2 thứ:
- **App ID** (số ~16 chữ số, ở top dashboard)
- **App Secret** (Settings → Basic → Show → cần password Facebook lần nữa)

⚠️ **App Secret KHÔNG được share/commit lên git.** T sẽ lưu nó trong Cloudflare Env Vars (encrypted).

---

## 🎯 Bước 3 — Add 2 Products vào App (5 phút)

App cần 2 capability để publish + boost:

### 3a. Facebook Login for Business
1. Dashboard → sidebar **Add Product**
2. Tìm **Facebook Login for Business** → **Set up**
3. Cấu hình:
   - Skip quickstart, vào **Settings**
   - **Valid OAuth Redirect URIs**: thêm 2 URLs:
     ```
     https://fb-pack-studio.pages.dev/api/fb/callback
     https://fb-pack-studio.pages.dev/
     ```
   - **Allowed Domains for the JavaScript SDK**: `fb-pack-studio.pages.dev`
   - Save

### 3b. Marketing API (cho Phase B Boost Ads)
1. Sidebar **Add Product** → **Marketing API** → **Set up**
2. Sẽ thấy access token sandbox (chỉ test, sau cần app review để live)
3. Skip cấu hình chi tiết, để Phase B làm sau

✅ Sau bước này: App có 2 capability sẵn sàng.

---

## 🎯 Bước 4 — Lấy Page Access Token với scope đúng (10 phút)

Đây là TOKEN dùng để publish lên page.

### Phương án nhanh (Graph API Explorer):

1. Truy cập https://developers.facebook.com/tools/explorer/
2. Top-right dropdown:
   - **Meta App**: chọn app vừa tạo
   - **User or Page**: chọn **User Token**
3. Click **Add a Permission** → check các scope:
   - ☑️ `pages_show_list`
   - ☑️ `pages_read_engagement`
   - ☑️ `pages_manage_posts` (publish bài)
   - ☑️ `pages_manage_metadata`
   - ☑️ `pages_read_user_content`
   - ☑️ `publish_video` (post video lên page)
   - ☑️ `ads_management` (cho Phase B)
   - ☑️ `business_management` (cho Phase B)
4. Click **Generate Access Token** → grant permissions trong popup
5. Token User Access Token hiện ra ở textbox lớn — đây là **SHORT-LIVED** (2h)

### Đổi sang LONG-LIVED Page Token (60 ngày):

1. Vẫn ở Graph Explorer, paste vào URL bar:
   ```
   GET /me/accounts
   ```
   Submit → trả về danh sách pages, mỗi page có 1 `access_token` field
2. **Copy `access_token` của page mày** — đây là Short-Lived Page Token

3. Đổi sang Long-Lived (60 ngày). Mở browser tab mới, gõ URL (thay các giá trị):
   ```
   https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=PAGE_TOKEN_VỪA_COPY
   ```
   - Thay `APP_ID` = App ID ở bước 2
   - Thay `APP_SECRET` = App Secret
   - Thay `PAGE_TOKEN_VỪA_COPY` = token vừa lấy
4. Response trả về `access_token` mới — **đây là Long-Lived Page Access Token (60 ngày)**, copy lại

### Verify Token (optional):
Paste token vào https://developers.facebook.com/tools/debug/accesstoken/ → check:
- Type: **Page**
- Expires: ~60 ngày
- Scopes: phải đủ các scope tick ở trên

✅ Sau bước này, mày có **5 thứ** đem cho t:
1. **Page ID**: `1234567890`
2. **App ID**: `9876543210123456`
3. **App Secret**: `abc123...` (sẽ encrypt vào Cloudflare)
4. **Long-Lived Page Access Token**: `EAAxxx...` (sẽ encrypt vào Cloudflare)
5. **Page Name** + URL (cho UI hiển thị)

---

## 📋 Tóm tắt: cần gửi t 4 giá trị này

```
PAGE_ID = 
APP_ID = 
APP_SECRET = (nhạy cảm — đừng paste vào chat public, tao paste vào Cloudflare giúp mày)
PAGE_ACCESS_TOKEN = (nhạy cảm — như trên)
```

Sau khi mày gửi 4 giá trị này:
- T sẽ code **Phase A** (organic publish): UI Settings + button **📤 Publish to FB** trên PostCard
- Mày test publish 1 bài → nếu OK → t code **Phase B** (boost ads)

---

## 🚨 Lưu ý bảo mật

| Thứ | Lưu ở đâu | Có expose ra browser ko? |
|---|---|---|
| App ID | Plaintext env var Cloudflare | ✅ Có thể (public) |
| Page ID | Plaintext D1 / localStorage | ✅ Có thể (public) |
| **App Secret** | Encrypted env var Cloudflare ONLY | ❌ Không bao giờ |
| **Page Access Token** | Encrypted D1 hoặc env var | ❌ Không bao giờ |

App của mày tuân thủ pattern: token nhạy cảm chỉ tồn tại ở Cloudflare backend, browser chỉ thấy `{ connected: true, pageName: 'ONIIZ Vietnam' }`.

---

## ❓ Troubleshooting

| Lỗi | Fix |
|---|---|
| "App not in Live mode" khi gọi Graph API | OK cho mày test (Dev Mode app vẫn dùng được với Page admin), chỉ cần Live khi mở rộng cho user khác |
| Token expire sau 60 ngày | Cần refresh — t code tự động extend khi gần expire |
| "Permission scope missing" | Quay lại bước 4, thêm scope thiếu, generate token mới |
| "Cannot post — page restricted" | Page mới tạo có thể bị FB restrict 24h đầu, đợi |
| OAuth redirect mismatch | Check Bước 3a, URL phải EXACT khớp |

---

## 📚 References

- [Meta for Developers](https://developers.facebook.com/)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/)
- [Pages API reference](https://developers.facebook.com/docs/pages-api)
- [Marketing API reference](https://developers.facebook.com/docs/marketing-apis)

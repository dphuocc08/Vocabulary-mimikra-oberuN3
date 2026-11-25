# Mimi Kara Oboeru JLPT — Web App Ôn Tập Từ Vựng N5 – N4 – N3

Ứng dụng web tĩnh (Static Web App) hỗ trợ ôn luyện **2.240 từ vựng JLPT N5 – N4 – N3**, lưu dữ liệu bằng **JSON gọn nhẹ** tải lười (lazy-load) song song theo từng cấp độ, không cần backend hay cơ sở dữ liệu, sẵn sàng triển khai miễn phí trên **GitHub Pages** hoặc **Vercel**.

---

## Kho từ vựng hiện có (2.240 từ)

| Cấp độ | Giáo trình / Nguồn | Số bài / Unit | Số từ vựng | Dải ID |
| :--- | :--- | :---: | :---: | :---: |
| **JLPT N5** | Minna no Nihongo I (Bài 1–25) | 25 bài | 760 từ | `50101` – `52513` |
| **JLPT N4** | Minna no Nihongo II (Bài 26–50) | 25 bài | 600 từ | `42601` – `45023` |
| **JLPT N3** | Mimi Kara Oboeru Goi N3 (Unit 01–14) | 14 Unit | 880 từ | `1` – `880` |
| **Tổng cộng** | | **64 bài/Unit** | **2.240 từ** | |

---

## Tính năng chính

1. **Đa cấp độ JLPT (N5 – N4 – N3) & Tải lười JSON:**
   * Chuyển nhanh giữa N5, N4 và N3 ngay trên trang chủ; chỉ tải dữ liệu JSON của cấp độ đang chọn (`fetch` song song + cache theo phiên).
   * Tiến độ học và Sổ tay từ sai tự động lọc theo từng cấp độ.
2. **2 Chế độ học linh hoạt:**
   * **Chế độ 1 (2 Bước liên hoàn):** Nhìn Kanji → chọn cách đọc Hiragana (tự động bỏ qua bước 1 với từ thuần Kana) → gõ nghĩa tiếng Việt theo câu ngữ cảnh.
   * **Chế độ 2 (Điền từ ngữ cảnh):** Đọc câu ví dụ tiếng Nhật có chỗ trống `（　）` kèm gợi ý nghĩa tiếng Việt → chọn từ vựng phù hợp nhất.
3. **Chia chặng nhỏ (25–30 từ/chặng):**
   * Quét sạch 100% từ vựng từng bài/Unit mà không bị ngợp.
   * Lưu điểm cao nhất và trạng thái hoàn thành của từng chặng.
4. **Sổ tay từ sai (`localStorage`):**
   * Tự động lưu mọi từ làm sai vào trình duyệt.
   * Hỗ trợ xem danh sách, tìm kiếm theo Kanji / Hiragana / nghĩa Việt, nghe phát âm và làm bài ôn riêng; trả lời đúng lại sẽ tự động gỡ khỏi sổ.
5. **Hỗ trợ học tập thông minh:**
   * Tự động phát âm chuẩn Hiragana qua **Web Speech API** (`ja-JP`).
   * Nút **"Đánh dấu là Đúng (Chấm nhầm)"** khi câu trả lời tiếng Việt là từ đồng nghĩa.
   * Phím tắt nhanh: `1`–`4` chọn đáp án, `R` nghe lại phát âm, `Enter` kiểm tra / sang câu tiếp theo.
   * **Sao lưu / Khôi phục JSON:** Xuất và nhập tiến độ học để đồng bộ giữa máy tính và điện thoại.

---

## Cấu trúc thư mục

```text
mimikara-n3/
├── index.html              # Giao diện chính
├── css/
│   └── styles.css          # CSS tùy chỉnh & animation
├── data/
│   ├── manifest.json       # Danh sách cấp độ (N5, N4, N3) và đường dẫn các tệp Unit JSON
│   ├── n5/
│   │   └── bai01.json ... bai25.json   # 25 bài Minna no Nihongo I (760 từ)
│   ├── n4/
│   │   └── bai26.json ... bai50.json   # 25 bài Minna no Nihongo II (600 từ)
│   └── n3/
│       └── unit01.json ... unit14.json # 14 Unit Mimi Kara Oboeru N3 (880 từ)
├── js/
│   ├── storage.js          # Quản lý localStorage (cấp độ, tiến độ, sổ tay) & Export/Import JSON
│   ├── quiz-engine.js      # Tạo đề, đáp án nhiễu & so sánh nghĩa tiếng Việt
│   ├── state.js            # Nạp manifest.json & các Unit JSON song song, quản lý state
│   ├── audio.js            # Phát âm Web Speech API & phím tắt bàn phím
│   ├── home-view.js        # Màn hình chính, chuyển cấp độ, chọn chế độ & danh sách Unit
│   ├── quiz-controller.js  # Điều khiển phiên học, chấm điểm & hiển thị giải thích
│   ├── summary-view.js     # Màn hình tổng kết sau buổi học & ôn lại câu sai
│   ├── mistake-bank.js     # Quản lý & tìm kiếm Sổ tay từ sai
│   ├── backup-modal.js     # Hộp thoại Sao lưu / Khôi phục tiến độ JSON
│   └── app.js              # Điểm khởi chạy & ghép nối public API (window.MimiApp)
└── README.md
```

---

## Chạy trên máy cá nhân

Vì ứng dụng tải dữ liệu từ các tệp `.json` qua `fetch()`, trình duyệt sẽ chặn nếu mở trực tiếp bằng đường dẫn `file://`. Hãy chạy bằng một máy chủ tĩnh cục bộ:

**Cách 1 — Dùng Node.js (`serve`):**
```bash
npx serve .
```
Sau đó mở đường dẫn hiển thị trên terminal (thường là `http://localhost:3000`).

**Cách 2 — Dùng VS Code:**
Cài tiện ích **Live Server**, bấm chuột phải vào `index.html` → chọn **Open with Live Server**.

---

## Cách mở rộng thêm Unit hoặc Cấp độ mới (ví dụ N2)

1. Tạo tệp JSON mới (ví dụ `data/n2/unit01.json`) với cấu trúc chuẩn:
   ```json
   {
     "id": "n2-unit01",
     "level": "n2",
     "code": "Unit 01",
     "title": "Tên chủ đề",
     "range": "1 ~ 50",
     "batchSize": 25,
     "items": [
       {
         "id": 20101,
         "part": "Chặng 1 (1~25)",
         "partTitle": "Tên chặng",
         "word": "漢字",
         "reading": "かんじ",
         "pos": "Danh từ",
         "meaning": "Nghĩa tiếng Việt",
         "synonyms": ["từ đồng nghĩa"],
         "sentence": "Câu ví dụ có chỗ trống（　）.",
         "sentenceVi": "Nghĩa tiếng Việt của câu ví dụ.",
         "note": ""
       }
     ]
   }
   ```
   > **Lưu ý:** Mỗi từ phải có `id` là **số nguyên dương duy nhất** trên toàn hệ thống và `sentence` chứa ký tự chỗ trống `（　）` để chế độ Điền từ theo ngữ cảnh hoạt động.
2. Đăng ký đường dẫn tệp JSON mới vào `data/manifest.json` (không cần sửa `index.html`).
3. Tải lại trang — cấp độ hoặc Unit mới sẽ tự động hiển thị.

---

## Triển khai miễn phí lên mạng

### Cách 1: GitHub Pages
1. Tạo Repository mới trên [GitHub](https://github.com/) (chế độ **Public**).
2. Đẩy toàn bộ nội dung trong thư mục `mimikara-n3/` lên nhánh `main` (đảm bảo `index.html` nằm ở thư mục gốc repo).
3. Vào **Settings** → **Pages** → tại **Build and deployment**, chọn Branch **`main`** và thư mục **`/ (root)`** → bấm **Save**.
4. Sau 1–2 phút, truy cập trang web tại `https://<ten-user>.github.io/<ten-repo>/`.

### Cách 2: Vercel
1. Đẩy code lên GitHub, đăng nhập [Vercel](https://vercel.com/) → chọn **Add New Project** → chọn repo của bạn.
2. Để nguyên cấu hình mặc định (Static Site, không cần lệnh build) → bấm **Deploy**.

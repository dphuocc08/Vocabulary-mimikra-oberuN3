# Mimi Kara Oboeru Goi N3 — Web App Ôn Tập Từ Vựng JLPT N3

Ứng dụng web tĩnh (Static Web App) hỗ trợ ôn luyện từ vựng JLPT N3 theo giáo trình **Mimi Kara Oboeru Goi N3**, không cần server hay database backend, chạy trực tiếp khi mở file hoặc triển khai miễn phí trên **GitHub Pages**.

---

## Tính năng chính

1. **2 Chế độ học linh hoạt:**
   * **Chế độ 1 (2 Bước liên hoàn):** Nhìn Kanji $\rightarrow$ chọn cách đọc Hiragana (bỏ qua tự động bước 1 nếu là từ thuần Kana) $\rightarrow$ gõ nghĩa tiếng Việt dựa trên câu ngữ cảnh thực tế.
   * **Chế độ 2 (Điền từ ngữ cảnh):** Đọc câu ví dụ tiếng Nhật có chỗ trống và gợi ý nghĩa tiếng Việt $\rightarrow$ chọn từ vựng phù hợp nhất.
2. **Chia chặng nhỏ (25–30 từ/chặng):**
   * Giúp học dứt điểm từng nhóm từ, không bị ngợp và quét sạch 100% từ vựng trong mỗi Unit.
   * Ghi nhận điểm cao nhất và trạng thái hoàn thành của từng chặng.
3. **Sổ tay từ sai (`localStorage`):**
   * Tự động lưu lại mọi từ làm sai vào bộ nhớ trình duyệt.
   * Cho phép xem danh sách, tìm kiếm, nghe phát âm và làm bài ôn riêng cho các từ sai.
   * Khi trả lời đúng lại trong phiên ôn Sổ tay, từ đó tự động được **"xóa nợ"** khỏi sổ.
4. **Hỗ trợ học tập thông minh:**
   * Tự động phát âm chuẩn Hiragana qua **Web Speech API** (`ja-JP`).
   * Nút **"Đánh dấu là Đúng (Chấm nhầm)"** khi câu trả lời tiếng Việt là từ đồng nghĩa.
   * Phím tắt nhanh: `1`–`4` chọn đáp án, `R` nghe lại phát âm, `Enter` kiểm tra / qua câu tiếp theo.
   * **Sao lưu / Khôi phục JSON:** Dễ dàng chuyển tiến độ học giữa máy tính và điện thoại.

---

## Cấu trúc thư mục

```text
mimikara-n3/
├── index.html          # Giao diện chính
├── css/
│   └── styles.css      # CSS tùy chỉnh & animation
├── data/
│   ├── unit01.js       # Unit 01: Danh từ A (120 từ, 4 chặng)
│   └── unit02.js       # Unit 02: Động từ A (100 từ, 4 chặng)
├── js/
│   ├── storage.js      # Quản lý localStorage & Export/Import JSON
│   ├── quiz-engine.js  # Logic tạo đề, đáp án nhiễu & so sánh nghĩa tiếng Việt
│   └── app.js          # Điều khiển giao diện & tương tác
└── README.md
```

---

## Chạy trên máy cá nhân

* Chỉ cần nhấp đúp chuột vào file **`index.html`** để mở bằng trình duyệt (Chrome, Edge, Safari, Cốc Cốc...). Không cần chạy server hay cài đặt thêm thư viện nào.

---

## Cách mở rộng thêm Unit mới (Unit 03, Unit 04...)

1. Tạo file mới trong thư mục `data/`, ví dụ `data/unit03.js`, sao chép cấu trúc từ `data/unit01.js` và đẩy dữ liệu vào `window.MIMI_UNITS`.
2. Mở file `index.html`, thêm một thẻ `<script>` ngay dưới `unit02.js`:
   ```html
   <script src="data/unit01.js"></script>
   <script src="data/unit02.js"></script>
   <script src="data/unit03.js"></script>
   ```
3. Lưu lại và tải lại trang — giao diện sẽ tự động hiển thị Unit mới kèm các chặng con tương ứng.

---

## Đưa lên GitHub Pages miễn phí

1. Tạo một Repository mới trên [GitHub](https://github.com/) (để chế độ **Public**).
2. Tải toàn bộ nội dung bên trong thư mục `mimikara-n3/` lên thư mục gốc của Repository (đảm bảo `index.html` nằm ở thư mục gốc repo).
3. Vào **Settings** $\rightarrow$ **Pages**.
4. Tại mục **Build and deployment**, chọn Branch **`main`** và thư mục **`/ (root)`** $\rightarrow$ bấm **Save**.
5. Sau 1–2 phút, truy cập trang web qua đường dẫn `https://<ten-user>.github.io/<ten-repo>/`.

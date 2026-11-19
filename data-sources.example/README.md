# Dữ liệu nguồn cho gói luyện thi

Nội dung tự soạn (có commit) nằm ở `vocab/`; thư mục này dành cho dữ liệu riêng từ sách / PDF có bản quyền. Gói cùng tên (VD `toeic/`) ở hai nơi được gộp.

Sao chép thư mục này thành `data-sources/` (đã có trong `.gitignore`, không commit vì chứa dữ liệu có bản quyền), thêm dữ liệu rồi chạy:

```
npm run build:packs              # dựng mọi gói → src/renderer/src/data/packs/<id>.json (cũng không commit)
npm run build:packs -- --enrich  # Gemini điền nghĩa / IPA / ví dụ / đồng nghĩa còn thiếu (cần GEMINI_API_KEY)
```

Sau đó mở app → **Luyện thi** → **Cài gói**. Có thể gửi file `.json` của gói sang máy khác và dùng **Nhập gói từ file**.

## Cấu trúc

- `_levels/*.txt` — bảng cấp độ CEFR dùng chung, mỗi dòng một từ, dạng Oxford 3000/5000:
  `abandon v. B2`, `access n. B1, v. B2`. (Mở PDF Oxford 3000/5000 → chọn tất cả → dán vào file .txt.)
  Có thể dùng `.csv` với cột `word, pos, cefr` (VD từ English Vocabulary Profile).
- `<gói>/pack.json` — tên, phiên bản (tăng `version` để app báo "Có bản mới"), loại kỳ thi (`toeic` | `ielts` | `general`) và danh sách chủ đề.
- `<gói>/*.csv` — từ vựng. Cột (chỉ `word` là bắt buộc; thiếu `meaning` thì cần `--enrich`):
  `word, meaning, ipa, pos, cefr, topic, example, exampleVi, synonyms, collocations, family, tags, emoji`.
  `topic` là `id` hoặc tên chủ đề trong `pack.json` (tên lạ → tự tạo chủ đề mới; để trống → nhóm theo cấp độ CEFR).
  Danh sách (`synonyms`, `collocations`, `family`, `tags`) cách nhau bởi `;`. Tên file được thêm làm nhãn (tag), VD `barrons-600.csv`.
- `<gói>/*.txt` — danh sách dạng Oxford (chỉ từ + loại từ + cấp độ), cần `--enrich` để có nghĩa.

## Gợi ý nguồn

- TOEIC: 600 Essential Words for the TOEIC (Barron's — 50 bài, đặt `topic` = số bài), Hackers TOEIC Vocabulary, TOEIC Service List (TSL).
- IELTS: Academic Word List (AWL, 10 sublist), Oxford Phrasal Academic Lexicon (OPAL), Cambridge / Collins Vocabulary for IELTS.
- Cấp độ: Oxford 3000 & 5000, English Vocabulary Profile.

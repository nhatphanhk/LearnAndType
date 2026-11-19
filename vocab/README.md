# Kho từ vựng luyện thi (tự soạn)

Nội dung trong thư mục này do LearnAndType tự soạn: nghĩa, IPA, câu ví dụ, bản dịch, từ đồng nghĩa, collocation và họ từ. Vì vậy thư mục được commit. Dữ liệu chép từ sách hoặc tài liệu có bản quyền thì đặt ở `data-sources/`, thư mục này không commit (xem `data-sources.example/`).

`npm run dev` và `npm run build` tự chạy `scripts/build-exam-packs.mjs`. Script này dựng:

- `src/renderer/src/data/packs/<gói>.json`: gói từ vựng đóng kèm app. Cài ở trang **Luyện thi**.
- `src/renderer/src/data/cefr-levels.json`: bảng cấp độ, dùng cho mục **Phân loại từ vựng đang có**.

## Gói hiện có

| Gói | Số từ | Chủ đề |
|---|---|---|
| `toeic/` | ~540 | 16 bối cảnh: văn phòng, nhân sự, họp, tài chính, ngân hàng, marketing, hợp đồng, mua hàng, vận chuyển, sản xuất, du lịch, nhà hàng, sức khỏe, bất động sản, công nghệ, chăm sóc khách hàng |
| `ielts/` | ~510 | 17 chủ đề: động từ, danh từ và tính từ học thuật, AWL mở rộng, mô tả số liệu (Task 1), lập luận (Task 2), Speaking, môi trường, giáo dục, công nghệ, sức khỏe, xã hội, kinh tế, chính phủ, đô thị, truyền thông, văn hóa, khoa học |

`_levels/core.csv` chứa cấp độ CEFR cho 240 từ có sẵn của app. Cấp độ ở đây là ước lượng gần với Oxford 3000/5000.

## Định dạng CSV

```
word,meaning,ipa,pos,cefr,example,exampleVi,synonyms,collocations,family[,tags]
```

- Tên file trùng `id` của một chủ đề trong `pack.json` (ví dụ `finance.csv`) thì toàn bộ từ trong file thuộc chủ đề đó.
- Các danh sách cách nhau bằng `;`.
- Họ từ ghi kèm loại từ, ví dụ `decision (n);decisive (adj)`. Chế độ **Họ từ** cần phần loại từ này để biết phải hỏi dạng nào.
- Collocation phải chứa đúng từ đang học, ví dụ `meet a deadline`. App tạo chỗ trống từ cụm này.
- Câu ví dụ nên chứa từ đang học ở dạng gốc hoặc thêm `-s/-es/-ed/-ing`. Khi đó từ dùng được cho **Điền vào câu** và **Trắc nghiệm** dạng Part 5.

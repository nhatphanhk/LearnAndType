# LearnAndType

Học từ vựng tiếng Anh theo chủ đề thông qua luyện gõ. Ứng dụng desktop (Electron) — mỗi lần gõ **một từ**, kèm **nghĩa tiếng Việt, phiên âm, hình ảnh** và **phát âm**, có **theo dõi tiến độ** và **ôn tập lặp lại ngắt quãng**.

## Tính năng

- **12 chủ đề có sẵn (240 từ)**: Động vật, Thức ăn & đồ uống, Trái cây & rau củ, Gia đình, Nghề nghiệp, Cơ thể người, Nhà cửa, Trường học, Phương tiện & du lịch, Thời tiết & thiên nhiên, Thể thao, Quần áo. Mỗi từ có IPA, loại từ, nghĩa, emoji và câu ví dụ kèm bản dịch.
- **Nhiều chế độ gõ**
  | Chế độ | Cách chơi |
  |---|---|
  | 🎓 Bài học | Chép từng từ mới để làm quen, sau đó tự nhớ lại cả nhóm. Từ sai được đưa lại cuối hàng đợi. |
  | ⌨️ Chép từ | Nhìn từ + phiên âm + nghĩa + ảnh rồi gõ lại; chữ đúng xanh, sai đỏ. |
  | 🧠 Nhớ từ | Chỉ thấy nghĩa và ảnh, tự gõ ra từ tiếng Anh. |
  | 🎧 Nghe & gõ | Nghe phát âm (giọng đọc có sẵn của Windows) và gõ lại. |
  | 🧩 Điền vào câu | Điền từ còn thiếu vào câu ví dụ. |
  | 🔁 Ôn tập | Trộn các chế độ trên với những từ đến hạn ôn. |
- **Theo dõi tiến độ**: số từ đã học / đã thuộc / cần ôn, chuỗi ngày học, thời gian gõ, WPM, độ chính xác, heatmap hoạt động, tiến độ từng chủ đề, biểu đồ theo ngày, danh sách từ khó, lịch sử phiên học.
- **Ôn tập lặp lại ngắt quãng (Leitner)**: 5 hộp với khoảng ôn 1 → 3 → 7 → 14 → 30 ngày. Gõ đúng khi đến hạn (không dùng gợi ý) thì lên hộp, sai thì về hộp 1. Từ ở hộp 4 trở lên được tính là **đã thuộc**.
- **Từ vựng của tôi**: tạo chủ đề riêng, thêm từ kèm emoji / URL ảnh / ảnh chọn từ máy, nhập & xuất CSV.
- **Sao lưu / khôi phục** toàn bộ dữ liệu ra file JSON; giao diện sáng / tối.

### Phím tắt khi luyện gõ

| Phím | Tác dụng |
|---|---|
| `Enter` | Nộp đáp án / sang từ tiếp |
| `Tab` | Gợi ý thêm 1 chữ (lượt đó không được tính lên hộp) |
| `Ctrl` + `Space` | Nghe lại phát âm |
| `Esc` | Kết thúc phiên |

> Nếu đang bật bộ gõ tiếng Việt (Unikey/EVKey…), hãy chuyển sang chế độ gõ tiếng Anh. Ứng dụng sẽ cảnh báo khi phát hiện chữ có dấu.

## Cài đặt & chạy

Yêu cầu: Node.js 22+ (đã thử với Node 24, npm 11).

```bash
npm install
npm run dev        # chạy ở chế độ phát triển (hot reload)
```

Nếu `npm install` không tải được Electron (npm mới có thể chặn install script), chạy:

```bash
npm install-scripts approve electron && npm rebuild electron
```

### Lệnh khác

```bash
npm test           # unit test (Vitest)
npm run typecheck  # kiểm tra kiểu TypeScript
npm run build      # build ra thư mục out/
npm run build:win  # tạo bộ cài Windows: dist/LearnAndType-Setup-<version>.exe
```

## Nhập từ vựng bằng CSV

File UTF-8, dòng đầu là tên cột. Bắt buộc `word` và `meaning`; các cột khác tùy chọn:

```csv
word,meaning,ipa,partOfSpeech,emoji,example,exampleVi,imageUrl
laptop,máy tính xách tay,/ˈlæp.tɑːp/,n,💻,I bring my laptop to work every day.,Tôi mang máy tính xách tay đi làm mỗi ngày.,
deadline,hạn chót,/ˈded.laɪn/,n,⏳,"The deadline is Friday, so hurry up.","Hạn chót là thứ Sáu, nên nhanh lên.",
```

- Tên cột tiếng Việt cũng được chấp nhận (`từ`, `nghĩa`, `phiên âm`, `ví dụ`…).
- Từ đã có trong chủ đề sẽ được **cập nhật**; ô trống không xóa dữ liệu cũ.
- `partOfSpeech`: `n`, `v`, `adj`, `adv`, `prep`, `pron`, `conj`, `phr`.
- Câu ví dụ nên chứa từ đang học để dùng được chế độ *Điền vào câu*.

## Dữ liệu được lưu ở đâu

Toàn bộ dữ liệu (tiến độ, chủ đề tự tạo, ảnh) nằm trong IndexedDB tại `%APPDATA%\LearnAndType`. Dùng **Cài đặt → Sao lưu dữ liệu** để chuyển sang máy khác. Có thể chỉ định thư mục khác qua biến môi trường `LEARNANDTYPE_USER_DATA`.

## Cấu trúc mã nguồn

```
src/main/            Tiến trình chính của Electron (cửa sổ, bảo mật)
src/preload/         Cầu nối tối thiểu sang giao diện
src/renderer/src/
  core/              Logic thuần + test: so khớp gõ phím, SRS Leitner, hàng đợi, thống kê, CSV
  data/builtin/      12 chủ đề có sẵn
  db/                Dexie (IndexedDB): schema, seed, truy vấn, sao lưu
  store/             Zustand: phiên luyện gõ (máy trạng thái), cài đặt
  pages/             Tổng quan, Chủ đề, Luyện gõ, Ôn tập, Thống kê, Từ vựng của tôi, Cài đặt
  components/        Thành phần giao diện dùng chung
```

Công nghệ: Electron · electron-vite · React · TypeScript · Tailwind CSS · Dexie · Zustand · Recharts · Vitest.

## Giấy phép

MIT

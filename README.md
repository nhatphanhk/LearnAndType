# LearnAndType

Học từ vựng tiếng Anh theo chủ đề thông qua luyện gõ. Ứng dụng desktop (Electron) — mỗi lần gõ **một từ**, kèm **nghĩa tiếng Việt, phiên âm, hình ảnh** và **phát âm**, có **theo dõi tiến độ** và **ôn tập lặp lại ngắt quãng**.

## Tính năng

- **12 chủ đề có sẵn (240 từ)**: Động vật, Thức ăn & đồ uống, Trái cây & rau củ, Gia đình, Nghề nghiệp, Cơ thể người, Nhà cửa, Trường học, Phương tiện & du lịch, Thời tiết & thiên nhiên, Thể thao, Quần áo. Mỗi từ có IPA, loại từ, nghĩa, emoji và câu ví dụ kèm bản dịch.
- **Nhiều chế độ gõ**
  | Chế độ | Cách chơi |
  |---|---|
  | 🎓 Bài học | Chép từng từ mới để làm quen, sau đó tự nhớ lại cả nhóm. Từ sai được đưa lại cuối hàng đợi. |
  | ⌨️ Chép từ | Nhìn từ + phiên âm + nghĩa (+ ảnh nếu có) rồi gõ lại; chữ đúng xanh, sai đỏ. |
  | 🧠 Nhớ từ | Chỉ thấy nghĩa (+ ảnh nếu có), tự gõ ra từ tiếng Anh. |
  | 🎧 Nghe & gõ | Nghe phát âm (giọng đọc có sẵn của Windows) và gõ lại. |
  | 🧩 Điền vào câu | Điền từ còn thiếu vào câu ví dụ. |
  | 🔁 Ôn tập | Trộn các chế độ trên với những từ đến hạn ôn. |
- **🔤 Gõ chữ (không hình ảnh)**: trang riêng trên thanh bên. Chọn chủ đề rồi chọn *Chép từ / Nhớ từ / Nghe & gõ / Điền vào câu*. Màn gõ và màn tổng kết chỉ có chữ (từ, phiên âm, nghĩa, câu ví dụ), không có ảnh hay icon, kể cả với chủ đề có sẵn. Nút **✨ Nhập thông minh** tạo ngay một chủ đề mới từ danh sách hoặc đoạn văn bạn dán vào. Phiên gõ chữ được đánh dấu **Chỉ chữ** trong lịch sử phiên học.
- **Dữ liệu không cần ảnh hay icon**: ảnh/emoji của từ và icon của chủ đề đều **không bắt buộc**. Từ không có ảnh chỉ hiện dạng chữ, chủ đề không có icon thì hiện chữ cái đầu của tên.
- **Theo dõi tiến độ**: số từ đã học / đã thuộc / cần ôn, chuỗi ngày học, thời gian gõ, WPM, độ chính xác, heatmap hoạt động, tiến độ từng chủ đề, biểu đồ theo ngày, danh sách từ khó, lịch sử phiên học.
- **Ôn tập lặp lại ngắt quãng (Leitner)**: 5 hộp với khoảng ôn 1 → 3 → 7 → 14 → 30 ngày. Gõ đúng khi đến hạn (không dùng gợi ý) thì lên hộp, sai thì về hộp 1. Từ ở hộp 4 trở lên được tính là **đã thuộc**.
- **Từ vựng của tôi**: tạo chủ đề riêng, thêm từng từ (emoji / URL ảnh / ảnh từ máy đều tùy chọn), **nhập thông minh** (dán danh sách lộn xộn, chỉ từ tiếng Anh, cả đoạn văn hoặc file CSV), **tự phân loại từ vào nhiều chủ đề** khi nhập, và xuất CSV.
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

## Nhập từ vựng

### ✨ Nhập thông minh

Ở trang **Gõ chữ** (tạo chủ đề mới) hoặc **Từ vựng của tôi → ✨ Nhập thông minh** (thêm vào chủ đề đang mở). Có hai bước:

1. **Nhập liệu**: chọn một trong hai tab.
   - **📋 Danh sách từ**: dán chữ hoặc bấm **📂 Mở file** (.csv, .tsv, .txt).
   - **📰 Trích từ đoạn văn**: dán bài báo, email hay phụ đề.
2. **Xem lại**: bảng gồm từ, nghĩa (sửa được), phiên âm, loại từ, câu ví dụ và trạng thái. Bỏ chọn dòng không muốn lưu rồi bấm **Thêm vào chủ đề**.

#### Danh sách từ: dạng nào cũng đọc được

```text
laptop - máy tính xách tay
meeting (n) /ˈmiː.t̬ɪŋ/: cuộc họp
hạn chót | deadline
1. printer = máy in
negotiate
crucial, deadline, invoice
```

- Dấu ngăn cách được nhận: ` - `, `:`, `=`, `|`, tab. Dấu phẩy chỉ được dùng khi dòng không có dấu nào khác. Từ có gạch nối như `well-known` vẫn đọc đúng.
- **Nghĩa đứng trước từ** (`hạn chót | deadline`) được tự đảo lại cho đúng.
- **Phiên âm** `/…/` hoặc `[…]` ở bất kỳ đâu trong dòng được tách riêng. **Loại từ** như `(n)`, `(v.)`, `(adj)`, `(noun)`, `(danh từ)` hoặc `n.` ngay sau từ cũng vậy. Ngoặc nằm trong phần nghĩa, như `ngân hàng (tài chính)`, được giữ nguyên.
- Vế thứ ba là một câu tiếng Anh (`meeting - cuộc họp - We have a meeting at nine.`) sẽ thành câu ví dụ.
- **Bảng copy từ Excel / Google Sheets** không cần dòng tên cột. App tự nhận ra cột nào là từ, nghĩa, phiên âm, loại từ, câu ví dụ hay dịch câu ví dụ, kể cả khi thứ tự cột bị đảo. Bảng ngăn bằng tab, `;` hoặc `|` đều được. Nếu dòng đầu là tên cột (`word`, `meaning`, …) thì danh sách được đọc như CSV.
- Danh sách **dòng Anh / dòng Việt xen kẽ** (copy từ flashcard) được ghép thành từng cặp.
- **Chỉ có từ tiếng Anh** (mỗi dòng một từ, hoặc nhiều từ cách nhau bằng dấu phẩy) cũng được: app tự tra nghĩa, xem mục dưới.
- Đánh số (`1.`, `2)`) và gạch đầu dòng (`-`, `•`) được tự bỏ. Dòng chỉ có tiếng Việt và từ trùng bị bỏ qua, kèm thông báo.

#### Trích từ đoạn văn

App gợi ý các từ đáng học trong đoạn văn và bỏ qua: từ chức năng và từ rất cơ bản (khoảng 600 từ), tên riêng, chữ viết tắt (NASA), dạng rút gọn (isn't), cùng những từ đã có trong chủ đề. Dạng số nhiều được gộp về số ít khi cả hai cùng xuất hiện. **Câu chứa từ trong đoạn văn trở thành câu ví dụ**, nên luyện được ngay chế độ *Điền vào câu*.

#### Tự tra nghĩa, phiên âm, ví dụ (cần mạng)

Khi sang bước Xem lại, app tự tra những từ còn thiếu nghĩa hoặc phiên âm, theo thứ tự:

1. **~240 từ có sẵn trong app**: tra offline, có đủ nghĩa, phiên âm và ví dụ.
2. **[dictionaryapi.dev](https://dictionaryapi.dev)**: phiên âm (ưu tiên Anh-Mỹ), loại từ, câu ví dụ có chứa từ. Từ không tìm thấy thì thử dạng gốc, ví dụ `negotiating → negotiate`.
3. **[MyMemory](https://mymemory.translated.net)**: nghĩa tiếng Việt. Miễn phí, không cần key, nhưng giới hạn khoảng 5.000 ký tự mỗi ngày (đủ cho vài trăm từ). Khi hết hạn mức, app báo lại để bạn tự nhập nghĩa.

App chỉ điền vào **ô còn trống**, không ghi đè nghĩa hay ví dụ bạn đã có. Nghĩa dịch máy có thể chưa sát, nên hãy xem lại trước khi lưu. Không có mạng thì các từ có sẵn vẫn được điền, còn từ khác sẽ hiện *Lỗi mạng*: bạn có thể tự nhập nghĩa hoặc bấm **✨ Tra từ còn thiếu** khi có mạng trở lại. Việc tra online chỉ diễn ra trong lúc nhập; phần luyện gõ vẫn chạy hoàn toàn offline.

### 🗂️ Phân loại vào chủ đề khi nhập

Có một file CSV chứa nhiều mảng từ vựng lẫn lộn? Ở **Từ vựng của tôi**, bấm **🗂️ Nhập & phân loại** (đầu trang) rồi **📂 Mở file**. App sẽ tự chia từ vào các chủ đề và lưu một lần. Trong modal ✨ Nhập thông minh ở các trang khác, bạn cũng có thể bật công tắc **🗂️ Phân loại vào nhiều chủ đề** ở bước Xem lại.

Bảng Xem lại có thêm cột **Chủ đề** (đổi được từng dòng) và dòng tóm tắt, ví dụ "Sẽ lưu vào 4 chủ đề: Văn phòng · 5, Kinh doanh & tài chính · 3 · mới…". Mỗi từ được xếp theo thứ tự ưu tiên:

1. **Cột `topic` trong file** (hoặc `chủ đề`, `category`, `danh mục`). Có cột này thì công tắc phân loại tự bật.
2. **Từ đã có** trong một chủ đề của bạn: giữ nguyên chủ đề đó và cập nhật từ, không tạo bản trùng.
3. **Chủ đề bạn đã tạo** có cùng mảng với từ. App nhận ra mảng của chủ đề qua tên (ví dụ "Văn phòng" → công việc & văn phòng), hoặc qua đa số các từ đang có trong chủ đề đó.
4. **Chủ đề mẫu**, tự tạo khi lưu: Động vật, Thức ăn & đồ uống, Trái cây & rau củ, Gia đình, Nghề nghiệp, Cơ thể người, Nhà cửa & đồ dùng, Trường học, Phương tiện & du lịch, Thời tiết & thiên nhiên, Thể thao, Quần áo & phụ kiện, Công việc & văn phòng, Kinh doanh & tài chính, Công nghệ & máy tính, Sức khỏe & y tế, Cảm xúc & tính cách, Mua sắm, Nghệ thuật & giải trí, Khoa học, Pháp luật & xã hội.
5. Từ không đoán được thì vào chủ đề dự phòng:
   - Nếu mở modal từ trong một chủ đề: chủ đề đó.
   - Nếu mở từ trang Gõ chữ: chủ đề mới bạn vừa đặt tên.
   - Nếu dùng nút đầu trang: chủ đề **"Từ vựng khác"**.

App đoán mảng của từ dựa trên:
- ~240 từ có sẵn trong app.
- Từ khóa trong nghĩa tiếng Việt, ví dụ "con …", "quả …", "bệnh", "hợp đồng".
- Chính từ tiếng Anh.
- **Định nghĩa tiếng Anh** lấy từ dictionaryapi.dev. Khi phân loại, app tra cả những từ đã đủ nghĩa nhưng không gọi MyMemory, nên không tốn hạn mức dịch.

Khi không có mạng, app vẫn đoán được nhờ ba nguồn đầu, chỉ kém chính xác hơn. Gợi ý có thể chưa đúng, nên hãy xem lại cột Chủ đề trước khi lưu. Chủ đề mới trùng tên với chủ đề đã có (không phân biệt hoa thường và dấu) thì app dùng lại chủ đề đó.

### File CSV

File UTF-8, dòng đầu là tên cột. Chỉ cần 2 cột `word` và `meaning`:

```csv
word,meaning
laptop,máy tính xách tay
deadline,hạn chót
```

Có thể thêm các cột tùy chọn: `ipa`, `partOfSpeech`, `emoji`, `example`, `exampleVi`, `imageUrl`, `topic`. Cột `topic` là tên chủ đề, dùng để chia từ vào nhiều chủ đề trong một lần nhập:

```csv
word,meaning,topic
printer,máy in,Văn phòng
invoice,hóa đơn,Kinh doanh
zebra,ngựa vằn,Động vật
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
  core/              Logic thuần + test: so khớp gõ phím, SRS Leitner, hàng đợi, thống kê, CSV, nhập thông minh (smartParse, extract, lookup), phân loại chủ đề (classify)
  data/builtin/      12 chủ đề có sẵn
  db/                Dexie (IndexedDB): schema, seed, truy vấn, sao lưu
  store/             Zustand: phiên luyện gõ (máy trạng thái), cài đặt
  pages/             Tổng quan, Chủ đề, Gõ chữ, Luyện gõ, Ôn tập, Thống kê, Từ vựng của tôi, Cài đặt
  components/        Thành phần giao diện dùng chung
```

Công nghệ: Electron · electron-vite · React · TypeScript · Tailwind CSS · Dexie · Zustand · Recharts · Vitest.

## Giấy phép

MIT

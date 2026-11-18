import { BUILTIN_TOPICS } from '@/data/builtin'
import type { Topic, Word } from '@/types'
import { pluralBases } from './extract'
import { builtinTopicOf } from './lookup'
import { wordnetTopicOf, type WordnetTopics } from './wordnet'

/**
 * Phân loại từ vào chủ đề khi nhập (offline + định nghĩa tiếng Anh nếu đã tra được).
 * Ưu tiên chủ đề người dùng đã tạo; không khớp thì đề xuất chủ đề mẫu (tạo khi lưu).
 */

export interface Category {
  id: string
  name: string
  nameEn: string
  emoji: string
  description: string
  /** Tên (viết thường, không dấu) để nhận ra chủ đề người dùng tương ứng. */
  aliases: string[]
  /** Từ khóa tiếng Anh: chính từ đó, hoặc có trong định nghĩa / câu ví dụ. */
  en: string[]
  /** Từ khóa tìm trong nghĩa tiếng Việt. */
  vi: string[]
}

type CategorySpec = Omit<Category, 'name' | 'nameEn' | 'emoji' | 'description'> &
  Partial<Pick<Category, 'name' | 'nameEn' | 'emoji' | 'description'>>

const w = (s: string): string[] => s.trim().split(/\s+/)
const v = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean)

const SPECS: CategorySpec[] = [
  {
    id: 'animals',
    aliases: ['dong vat', 'con vat', 'animal', 'animals', 'thu cung', 'pet'],
    en: w(`animal mammal bird fish insect reptile amphibian species pet beast creature breed fur feather wing tail paw hoof
      claw beak prey predator livestock cattle poultry herd flock zoo horse dog cat cow pig sheep goat chicken duck lion tiger
      bear wolf fox deer rabbit mouse rat snake frog whale dolphin shark monkey ape elephant giraffe zebra camel bee ant spider
      butterfly eagle owl parrot penguin turtle crocodile squirrel kangaroo panda genus equine canine feline`),
    vi: v('con, loài, động vật, chim, thú, côn trùng, gia súc, gia cầm, bò sát, thú cưng, lông vũ')
  },
  {
    id: 'food',
    aliases: ['an uong', 'do an', 'thuc an', 'mon an', 'am thuc', 'food', 'drink', 'drinks', 'cooking', 'nau an'],
    en: w(`food dish meal cook cooking edible drink beverage flavor flavour taste sweet sour salty spicy bake baked fried
      boiled roast recipe ingredient sauce soup bread rice noodle meat beef pork cheese butter sugar salt pepper flour dessert
      cake candy chocolate breakfast lunch dinner restaurant cuisine snack juice coffee tea milk wine beer alcoholic dough
      pastry sandwich pizza egg cereal`),
    vi: v(`món, đồ ăn, thức ăn, đồ uống, thức uống, nước uống, bánh, cơm, phở, bún, mì, thịt, canh, súp, kẹo, nấu, nướng, chiên,
      rán, luộc, gia vị, nước sốt, bữa, trà, cà phê, sữa, rượu, bia, nước ép, ẩm thực`)
  },
  {
    id: 'fruits',
    aliases: ['trai cay', 'hoa qua', 'rau cu', 'rau qua', 'fruit', 'fruits', 'vegetable', 'vegetables'],
    en: w(`fruit vegetable berry seed peel juicy ripe citrus apple banana orange grape mango lemon melon pear peach cherry
      strawberry pineapple tomato potato carrot onion garlic cabbage lettuce cucumber pumpkin bean pea corn mushroom herb
      tuber legume`),
    vi: v('quả, trái, trái cây, hoa quả, rau, củ, hạt, đậu, nấm')
  },
  {
    id: 'family',
    aliases: ['gia dinh', 'ho hang', 'family', 'relatives'],
    en: w(`family relative parent mother father child son daughter brother sister sibling husband wife spouse marriage
      married wedding grandparent grandmother grandfather grandchild uncle aunt cousin nephew niece baby infant ancestor
      descendant household kin divorce adopt twin orphan`),
    vi: v(`gia đình, bố, cha, mẹ, ông, bà, anh trai, chị gái, em trai, em gái, con trai, con gái, vợ, chồng, cô, dì, chú,
      bác, cháu, họ hàng, anh chị em, cưới, hôn nhân, em bé`)
  },
  {
    id: 'jobs',
    aliases: ['nghe nghiep', 'viec lam', 'job', 'jobs', 'occupation', 'occupations', 'career'],
    en: w(`job occupation profession professional worker employ career trade skilled practitioner specialist doctor nurse
      teacher engineer lawyer farmer driver chef pilot police soldier firefighter mechanic plumber electrician carpenter
      journalist accountant architect dentist artist actor singer waiter cashier clerk`),
    vi: v(`nghề, nghề nghiệp, thợ, người làm, bác sĩ, y tá, giáo viên, kỹ sư, luật sư, nông dân, tài xế, đầu bếp, phi công,
      cảnh sát, lính, công nhân, kiến trúc sư, nhà báo, kế toán, bồi bàn, người phục vụ`)
  },
  {
    id: 'body',
    aliases: ['co the', 'bo phan co the', 'body', 'human body'],
    en: w(`body organ limb head face eye ear nose mouth lip tooth teeth tongue neck shoulder arm elbow wrist hand finger thumb
      nail chest stomach belly hip leg knee ankle foot feet toe skin hair bone skeleton muscle heart lung liver kidney brain
      joint anatomy anatomical torso spine skull vein jaw cheek chin forehead eyebrow`),
    vi: v(`cơ thể, đầu, khuôn mặt, mặt, mắt, tai, mũi, miệng, môi, răng, lưỡi, cổ, vai, cánh tay, bàn tay, tay, ngón, móng,
      ngực, lưng, bụng, hông, chân, đầu gối, làn da, tóc, xương, cơ bắp, máu, tim, phổi, gan, thận, não, cằm, má, trán, lông mày`)
  },
  {
    id: 'house',
    aliases: ['nha cua', 'do dung', 'gia dung', 'noi that', 'house', 'home', 'household'],
    en: w(`house home room furniture kitchen bedroom bathroom door window wall floor ceiling roof stairs table chair bed sofa
      couch shelf cupboard cabinet drawer lamp mirror curtain carpet rug pillow blanket towel sink toilet shower bathtub oven
      stove fridge refrigerator microwave appliance utensil plate bowl cup spoon fork knife pot pan broom garage garden yard
      balcony domestic residence apartment`),
    vi: v(`nhà, căn nhà, phòng, cửa, cửa sổ, tường, sàn, trần nhà, mái, cầu thang, bàn, ghế, giường, tủ, kệ, đèn, gương, rèm,
      thảm, gối, chăn, khăn, bồn, nhà vệ sinh, bếp, lò, tủ lạnh, đồ dùng, đồ đạc, nội thất, bát, đĩa, cốc, chén, thìa, muỗng,
      nĩa, dao, nồi, chảo, chổi, vườn, sân`)
  },
  {
    id: 'school',
    aliases: ['truong hoc', 'hoc tap', 'giao duc', 'school', 'education', 'study'],
    en: w(`school student pupil teacher class classroom lesson course study learn learning education educational academic
      university college exam examination test homework assignment grade subject lecture textbook notebook pencil pen eraser
      ruler chalk blackboard library semester degree diploma curriculum tuition scholarship campus essay quiz graduate
      kindergarten`),
    vi: v(`trường, trường học, học, học sinh, sinh viên, lớp, bài học, bài tập, môn, kỳ thi, thi, sách giáo khoa, vở, bút,
      thước, tẩy, phấn, bảng, thư viện, đại học, bằng cấp, học bổng, giáo dục, khóa học, bài giảng`)
  },
  {
    id: 'transport',
    aliases: ['phuong tien', 'giao thong', 'du lich', 'transport', 'travel', 'traffic'],
    en: w(`vehicle transport transportation travel journey trip tour tourist passenger car bus train plane aircraft airplane
      airport flight ship boat ferry bicycle bike motorcycle truck taxi subway railway station road street highway traffic
      wheel engine fuel ticket luggage baggage suitcase passport visa hotel destination map route voyage sail cruise port
      harbor vacation holiday abroad sightseeing`),
    vi: v(`xe, tàu, máy bay, thuyền, con đường, đường phố, ga, sân bay, bến, vé, hành lý, hộ chiếu, du lịch, chuyến, hành khách,
      giao thông, lái, khách sạn, xe đạp, xe buýt, phương tiện, chuyến bay, kỳ nghỉ`)
  },
  {
    id: 'nature',
    aliases: ['thien nhien', 'thoi tiet', 'moi truong', 'nature', 'weather', 'environment'],
    en: w(`weather climate rain snow wind storm cloud sun sunny sky temperature season summer autumn winter fog thunder
      lightning rainbow nature natural environment mountain hill river lake sea ocean beach forest jungle desert island
      valley tree flower grass leaf rock stone soil earth planet volcano earthquake flood drought pollution landscape wildlife
      waterfall cave coast`),
    vi: v(`thời tiết, mưa, tuyết, gió, bão, mây, mặt trời, trời, nắng, nhiệt độ, mùa, sương, sấm, sét, cầu vồng, thiên nhiên,
      môi trường, núi, đồi, sông, hồ, biển, đại dương, bãi biển, rừng, sa mạc, đảo, thung lũng, cây, hoa, cỏ, lá, đá, đất,
      hành tinh, núi lửa, động đất, lũ, hạn hán, ô nhiễm`)
  },
  {
    id: 'sports',
    aliases: ['the thao', 'sport', 'sports', 'fitness'],
    en: w(`sport game player team match competition compete tournament championship champion score goal ball football soccer
      basketball tennis volleyball baseball golf swim swimming race racing athlete athletic coach referee stadium gym exercise
      fitness workout training medal olympic league racket boxing wrestling cycling ski skiing skate yoga marathon`),
    vi: v(`thể thao, bóng, bóng đá, đội, cầu thủ, vận động viên, trận, thi đấu, giải đấu, huấn luyện, sân vận động, bơi, chạy,
      đua, thể dục, huy chương, vô địch, trọng tài, quần vợt, cầu lông, võ`)
  },
  {
    id: 'clothes',
    aliases: ['quan ao', 'thoi trang', 'phu kien', 'trang phuc', 'clothes', 'clothing', 'fashion'],
    en: w(`clothes clothing garment wear worn dress shirt trousers pants jeans skirt coat jacket sweater hat cap scarf glove
      sock shoe boot sandal belt tie suit uniform pocket collar sleeve button zipper fabric cloth cotton wool silk leather
      jewelry jewellery necklace ring earring bracelet handbag wallet sunglasses umbrella accessory fashion outfit costume
      underwear pajamas`),
    vi: v(`áo, quần, váy, đầm, mũ, nón, khăn quàng, găng tay, tất, vớ, giày, dép, ủng, thắt lưng, cà vạt, đồng phục, túi, ví,
      kính, trang sức, vòng, nhẫn, khuyên tai, thời trang, quần áo, vải, len, lụa, cúc, túi xách, trang phục`)
  },
  {
    id: 'office',
    name: 'Công việc & văn phòng',
    nameEn: 'Work & Office',
    emoji: '💼',
    description: 'Từ vựng nơi công sở: cuộc họp, báo cáo, đồng nghiệp, hạn chót.',
    aliases: ['van phong', 'cong so', 'cong viec', 'noi lam viec', 'office', 'work', 'workplace'],
    en: w(`office work workplace meeting deadline colleague coworker boss manager staff employee report schedule appointment
      agenda project task presentation email memo document file folder printer photocopier copier stapler desk paperwork
      department supervisor promotion salary resign hire interview overtime shift conference calendar submit approve
      signature administrative clerical corporate cubicle secretary receptionist intern internship workload`),
    vi: v(`văn phòng, công việc, cuộc họp, họp, hạn chót, thời hạn, đồng nghiệp, sếp, quản lý, nhân viên, báo cáo, lịch làm việc,
      cuộc hẹn, dự án, nhiệm vụ, thuyết trình, tài liệu, hồ sơ, máy in, bàn làm việc, phòng ban, thăng chức, lương, tuyển dụng,
      phỏng vấn, tăng ca, ca làm, hội nghị, chữ ký, thư ký, thực tập`)
  },
  {
    id: 'business',
    name: 'Kinh doanh & tài chính',
    nameEn: 'Business & Finance',
    emoji: '💰',
    description: 'Công ty, mua bán, tiền bạc, hợp đồng, đầu tư.',
    aliases: ['kinh doanh', 'tai chinh', 'kinh te', 'thuong mai', 'ngan hang', 'business', 'finance', 'economy', 'banking'],
    en: w(`business company firm corporation enterprise commerce commercial trade market marketing sale sell seller buyer
      customer client consumer supplier product service price cost profit loss revenue income expense budget finance financial
      money cash bank banking account accounting invest investment investor stock share shareholder capital loan debt credit
      interest tax invoice bill payment contract deal agreement negotiate negotiation partner partnership merger economy
      economic currency dollar export import retail wholesale brand advertise advertising entrepreneur startup goods purchase
      transaction fee wage insurance`),
    vi: v(`kinh doanh, công ty, doanh nghiệp, thương mại, thị trường, khách hàng, nhà cung cấp, cung cấp, sản phẩm, dịch vụ, giá,
      chi phí, lợi nhuận, doanh thu, thu nhập, ngân sách, tài chính, tiền, ngân hàng, tài khoản, kế toán, đầu tư, cổ phiếu,
      cổ đông, vốn, khoản vay, nợ, tín dụng, lãi, thuế, hóa đơn, thanh toán, hợp đồng, thỏa thuận, đàm phán, thương lượng,
      đối tác, kinh tế, tiền tệ, xuất khẩu, nhập khẩu, bán lẻ, bán buôn, thương hiệu, quảng cáo, doanh nhân, hàng hóa,
      giao dịch, phí, bảo hiểm`)
  },
  {
    id: 'technology',
    name: 'Công nghệ & máy tính',
    nameEn: 'Technology',
    emoji: '💻',
    description: 'Máy tính, phần mềm, internet, thiết bị điện tử.',
    aliases: ['cong nghe', 'may tinh', 'tin hoc', 'technology', 'tech', 'computer', 'computers'],
    en: w(`technology technological computer computing software hardware program programming code coding data database
      internet online website web network digital electronic electronics device gadget machine laptop tablet smartphone phone
      mobile keyboard screen monitor printer camera battery charger cable wireless wifi app application download upload server
      algorithm robot artificial intelligence cyber password browser interface chip processor memory storage hacker calculator`),
    vi: v(`công nghệ, máy tính, phần mềm, phần cứng, chương trình, lập trình, dữ liệu, mạng, trang web, kỹ thuật số, điện tử,
      thiết bị, máy, điện thoại, bàn phím, màn hình, pin, sạc, cáp, không dây, ứng dụng, tải xuống, tải lên, máy chủ,
      thuật toán, người máy, trí tuệ nhân tạo, mật khẩu, trình duyệt, máy ảnh, xách tay`)
  },
  {
    id: 'health',
    name: 'Sức khỏe & y tế',
    nameEn: 'Health',
    emoji: '🏥',
    description: 'Bệnh tật, thuốc men, bệnh viện, chăm sóc sức khỏe.',
    aliases: ['suc khoe', 'y te', 'benh', 'health', 'medical', 'medicine'],
    en: w(`health healthy medical medicine medication drug disease illness ill sick sickness symptom pain ache fever cough flu
      infection virus bacteria injury wound hurt treatment treat cure therapy patient hospital clinic pharmacy prescription
      pill vaccine surgery surgeon diagnosis diet nutrition vitamin allergy cancer diabetes headache recover recovery mental
      stress emergency ambulance injection bandage`),
    vi: v(`sức khỏe, y tế, thuốc, bệnh, ốm, đau, sốt, ho, cảm, cúm, nhiễm, chấn thương, vết thương, điều trị, chữa, liệu pháp,
      bệnh nhân, bệnh viện, phòng khám, nhà thuốc, đơn thuốc, viên thuốc, vắc xin, phẫu thuật, chẩn đoán, chế độ ăn,
      dinh dưỡng, dị ứng, ung thư, tiểu đường, hồi phục, tâm lý, căng thẳng, cấp cứu, xe cứu thương, tiêm`)
  },
  {
    id: 'emotions',
    name: 'Cảm xúc & tính cách',
    nameEn: 'Feelings & Personality',
    emoji: '😊',
    description: 'Cảm xúc, tâm trạng và tính cách con người.',
    aliases: ['cam xuc', 'tinh cach', 'tam trang', 'feelings', 'emotions', 'personality'],
    en: w(`feeling emotion emotional mood happy happiness sad sadness angry anger fear afraid scared worry worried anxious
      anxiety nervous excited excitement surprise surprised love hate jealous jealousy proud pride shame ashamed embarrassed
      lonely bored calm joy delight grief regret hope disappointed frustrated confident shy brave kind friendly honest polite
      rude generous selfish lazy character personality attitude behavior behaviour temper cheerful curious ambitious stubborn
      sympathy`),
    vi: v(`cảm xúc, cảm giác, cảm thấy, tâm trạng, vui, hạnh phúc, buồn, giận, tức giận, sợ, lo lắng, hồi hộp, phấn khích,
      ngạc nhiên, yêu, ghét, ghen, tự hào, xấu hổ, ngượng, cô đơn, chán, bình tĩnh, niềm vui, đau buồn, hối hận, hy vọng,
      thất vọng, tự tin, nhút nhát, dũng cảm, tốt bụng, thân thiện, trung thực, lịch sự, thô lỗ, hào phóng, ích kỷ, lười,
      tính cách, thái độ, hành vi, tò mò, tham vọng, bướng bỉnh, cảm thông, kiên nhẫn`)
  },
  {
    id: 'shopping',
    name: 'Mua sắm',
    nameEn: 'Shopping',
    emoji: '🛍️',
    description: 'Cửa hàng, giá cả, thanh toán, giao hàng.',
    aliases: ['mua sam', 'shopping', 'shop'],
    en: w(`shop shopping store supermarket mall buy purchase discount cheap expensive receipt refund cashier bargain checkout
      cart basket order delivery deliver coupon voucher size item retail counter shopper boutique`),
    vi: v(`mua sắm, cửa hàng, siêu thị, chợ, trung tâm thương mại, giảm giá, rẻ, đắt, biên lai, hoàn tiền, thu ngân, mặc cả,
      giỏ hàng, đặt hàng, giao hàng, phiếu giảm giá, khuyến mãi, mua, bán`)
  },
  {
    id: 'arts',
    name: 'Nghệ thuật & giải trí',
    nameEn: 'Arts & Entertainment',
    emoji: '🎨',
    description: 'Âm nhạc, phim ảnh, hội họa, văn học, giải trí.',
    aliases: ['nghe thuat', 'giai tri', 'am nhac', 'phim anh', 'van hoa', 'arts', 'art', 'music', 'movies', 'entertainment'],
    en: w(`art artist artistic music musical musician song sing singer dance dancer dancing painting paint painter drawing draw
      sculpture film movie cinema theater theatre actor actress performance perform concert instrument guitar piano violin
      drum band orchestra novel poem poetry poet literature story author writer photography photograph photo entertainment
      entertain festival museum gallery culture cultural comedy drama hobby celebrity television radio media`),
    vi: v(`nghệ thuật, nghệ sĩ, âm nhạc, nhạc, bài hát, hát, ca sĩ, nhảy, múa, vẽ, tranh, hội họa, điêu khắc, phim, điện ảnh,
      rạp, kịch, diễn viên, biểu diễn, buổi hòa nhạc, nhạc cụ, đàn, trống, ban nhạc, dàn nhạc, tiểu thuyết, thơ, nhà thơ,
      văn học, truyện, tác giả, nhiếp ảnh, giải trí, lễ hội, bảo tàng, triển lãm, văn hóa, hài, sở thích, truyền hình`)
  },
  {
    id: 'science',
    name: 'Khoa học',
    nameEn: 'Science',
    emoji: '🔬',
    description: 'Vật lý, hóa học, sinh học, vũ trụ, nghiên cứu.',
    aliases: ['khoa hoc', 'science', 'sciences'],
    en: w(`science scientific scientist research experiment laboratory lab theory hypothesis physics chemistry biology
      chemical element atom molecule cell gene genetic dna energy force gravity matter mass magnet magnetic space universe
      galaxy star astronomy telescope microscope evolution organism oxygen carbon hydrogen acid formula equation measure
      measurement analysis mathematics math calculate geology ecology particle radiation nuclear solar`),
    vi: v(`khoa học, nhà khoa học, nghiên cứu, thí nghiệm, phòng thí nghiệm, lý thuyết, giả thuyết, vật lý, hóa học, sinh học,
      hóa chất, nguyên tố, nguyên tử, phân tử, tế bào, gen, di truyền, năng lượng, lực, trọng lực, vật chất, khối lượng,
      nam châm, vũ trụ, thiên hà, ngôi sao, thiên văn, kính thiên văn, kính hiển vi, tiến hóa, sinh vật, axit, công thức,
      phương trình, phân tích, toán học, tính toán, địa chất, sinh thái, phóng xạ, hạt nhân`)
  },
  {
    id: 'law',
    name: 'Pháp luật & xã hội',
    nameEn: 'Law & Society',
    emoji: '⚖️',
    description: 'Luật pháp, chính trị, chính phủ và các vấn đề xã hội.',
    aliases: ['phap luat', 'xa hoi', 'chinh tri', 'luat', 'law', 'society', 'politics', 'government'],
    en: w(`law legal illegal crime criminal court judge jury lawyer attorney police arrest prison jail trial justice rights
      government politics political politician election vote voter democracy president minister parliament congress citizen
      society social public policy regulation constitution nation national official authority protest war army military
      peace community poverty welfare immigrant immigration punish punishment steal theft thief murder witness evidence
      guilty innocent sue`),
    vi: v(`luật, pháp luật, pháp lý, hợp pháp, bất hợp pháp, tội, tội phạm, tòa án, thẩm phán, luật sư, cảnh sát, bắt giữ,
      nhà tù, xét xử, công lý, quyền, chính phủ, chính trị, chính trị gia, bầu cử, bỏ phiếu, dân chủ, tổng thống, bộ trưởng,
      quốc hội, công dân, xã hội, công cộng, chính sách, quy định, hiến pháp, quốc gia, chính quyền, biểu tình, chiến tranh,
      quân đội, hòa bình, cộng đồng, nghèo đói, phúc lợi, nhập cư, trừng phạt, ăn cắp, trộm, giết người, nhân chứng,
      bằng chứng, có tội, vô tội, kiện`)
  }
]

/** Chủ đề mẫu; 12 chủ đề đầu trùng id / tên / emoji với chủ đề có sẵn. */
export const CATEGORIES: readonly Category[] = SPECS.map((s) => {
  const b = BUILTIN_TOPICS.find((t) => t.id === s.id)
  return {
    ...s,
    name: s.name ?? b?.name ?? s.id,
    nameEn: s.nameEn ?? b?.nameEn ?? '',
    emoji: s.emoji ?? b?.emoji ?? '',
    description: s.description ?? b?.description ?? ''
  }
})

const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]))

/* ------------------------------ Chuẩn hóa chữ ------------------------------ */

/** Tên viết thường, bỏ dấu, chỉ giữ chữ / số — để so khớp tên chủ đề. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Đưa dấu thanh về một kiểu (hoá → hóa, thuỷ → thủy) để so khớp tiếng Việt. */
function normVi(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/o([áàảãạ])/g, (_, a: string) => 'óòỏõọ'['áàảãạ'.indexOf(a)] + 'a')
    .replace(/o([éèẻẽẹ])/g, (_, e: string) => 'óòỏõọ'['éèẻẽẹ'.indexOf(e)] + 'e')
    .replace(/u([ýỳỷỹỵ])/g, (_, y: string) => 'úùủũụ'['ýỳỷỹỵ'.indexOf(y)] + 'y')
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* ------------------------------ Chỉ mục từ khóa ------------------------------ */

const EN_INDEX = new Map<string, string[]>()
for (const c of CATEGORIES) {
  for (const k of c.en) {
    const list = EN_INDEX.get(k) ?? []
    if (!list.includes(c.id)) list.push(c.id)
    EN_INDEX.set(k, list)
  }
}

/** Mỗi chủ đề một biểu thức tìm từ khóa tiếng Việt, khớp theo ranh giới âm tiết. */
const VI_PATTERNS = CATEGORIES.map((c) => ({
  id: c.id,
  re: new RegExp(
    `(?:^|[\\s,;:()/.!?–-])(${[...c.vi]
      .map(normVi)
      .sort((a, b) => b.length - a.length)
      .map(escapeRe)
      .join('|')})(?=$|[\\s,;:()/.!?–-])`,
    'gu'
  )
}))

function enCategories(token: string): string[] {
  const t = token.toLowerCase()
  const direct = EN_INDEX.get(t)
  if (direct) return direct
  for (const b of pluralBases(t)) {
    const hit = EN_INDEX.get(b)
    if (hit) return hit
  }
  return []
}

const tokens = (s: string): string[] => s.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? []

/* --------------------------------- Đoán chủ đề --------------------------------- */

export interface ClassifyInput {
  word: string
  meaningVi: string
  example?: string
  /** Định nghĩa tiếng Anh (từ dictionaryapi.dev), nếu đã tra. */
  definitions?: readonly string[]
}

export interface CategoryGuess {
  id: string
  score: number
}

const MIN_SCORE = 2

/**
 * Chấm điểm từng chủ đề mẫu: từ có sẵn +10, WordNet +5 (chỉ khớp chữ cuối của cụm: +2), chính từ là từ khóa +4,
 * nghĩa tiếng Việt +2/âm tiết khớp (tối đa 8), định nghĩa tiếng Anh +1/từ khóa (tối đa 5), câu ví dụ +0.5/từ khóa (tối đa 2).
 * `prefer`: chủ đề mẫu đã có chủ đề người dùng tương ứng → +2 khi đã có bằng chứng (ưu tiên chủ đề của bạn).
 * `wordnet`: bảng chủ đề WordNet (tải lười, xem core/wordnet.ts) — không có thì bỏ qua.
 */
export function categorize(
  input: ClassifyInput,
  prefer: ReadonlySet<string> = new Set(),
  wordnet?: WordnetTopics
): CategoryGuess | null {
  const score = new Map<string, number>()
  const add = (id: string, n: number): void => {
    score.set(id, (score.get(id) ?? 0) + n)
  }

  const word = input.word.trim()
  const builtin = builtinTopicOf(word)
  if (builtin && CATEGORY_BY_ID.has(builtin)) add(builtin, 10)
  const wn = wordnet ? wordnetTopicOf(wordnet, word) : null
  if (wn && CATEGORY_BY_ID.has(wn.topic)) add(wn.topic, wn.exact ? 5 : 2)

  const wordTokens = tokens(word)
  const whole = wordTokens.length === 1 ? enCategories(wordTokens[0]) : (EN_INDEX.get(word.toLowerCase()) ?? [])
  whole.forEach((id) => add(id, 4))
  if (wordTokens.length > 1) for (const t of wordTokens) enCategories(t).forEach((id) => add(id, 1))

  const meaning = normVi(input.meaningVi)
  if (meaning) {
    for (const { id, re } of VI_PATTERNS) {
      let pts = 0
      re.lastIndex = 0
      for (const m of meaning.matchAll(re)) pts += 1 + m[1].split(' ').length
      if (pts) add(id, Math.min(pts, 8))
    }
  }

  const countHits = (texts: readonly string[], each: number, cap: number): void => {
    const hits = new Map<string, Set<string>>()
    for (const text of texts) {
      for (const t of tokens(text)) {
        if (wordTokens.includes(t)) continue // chính từ đó đã tính ở trên
        for (const id of enCategories(t)) {
          const set = hits.get(id) ?? new Set<string>()
          set.add(t)
          hits.set(id, set)
        }
      }
    }
    hits.forEach((set, id) => add(id, Math.min(set.size * each, cap)))
  }
  if (input.definitions?.length) countHits(input.definitions, 1, 5)
  if (input.example) countHits([input.example], 0.5, 2)

  let best: CategoryGuess | null = null
  for (const c of CATEGORIES) {
    let s = score.get(c.id) ?? 0
    if (s >= MIN_SCORE && prefer.has(c.id)) s += 2
    if (s >= MIN_SCORE && (!best || s > best.score)) best = { id: c.id, score: s }
  }
  return best
}

/** Chủ đề người dùng ứng với chủ đề mẫu nào: theo tên, nếu không thì theo đa số từ bên trong. */
export function topicCategory(
  topic: Pick<Topic, 'name' | 'nameEn'>,
  words: readonly Pick<Word, 'word' | 'meaningVi'>[] = [],
  wordnet?: WordnetTopics
): string | null {
  const names = [normalizeName(topic.name), normalizeName(topic.nameEn ?? '')].filter(Boolean)
  for (const c of CATEGORIES) {
    const keys = [...c.aliases, normalizeName(c.name), normalizeName(c.nameEn)]
    if (names.some((n) => keys.some((k) => n === k || ` ${n} `.includes(` ${k} `)))) return c.id
  }
  if (words.length < 3) return null
  const counts = new Map<string, number>()
  for (const wd of words) {
    const g = categorize({ word: wd.word, meaningVi: wd.meaningVi }, undefined, wordnet)
    if (g) counts.set(g.id, (counts.get(g.id) ?? 0) + 1)
  }
  let best: string | null = null
  let max = 0
  counts.forEach((n, id) => {
    if (n > max) {
      best = id
      max = n
    }
  })
  return max / words.length >= 0.5 ? best : null
}

/* --------------------------------- Chủ đề đích --------------------------------- */

export type Target =
  | { kind: 'topic'; topicId: string }
  | { kind: 'new'; name: string; nameEn: string; emoji: string; description: string }

export type TargetReason = 'csv' | 'existing' | 'mine' | 'template' | 'fallback'

export interface Suggestion {
  target: Target
  reason: TargetReason
  categoryId?: string
}

export function targetKey(t: Target): string {
  return t.kind === 'topic' ? `topic:${t.topicId}` : `new:${normalizeName(t.name)}`
}

/** Tên chủ đề dự phòng mặc định (từ không đoán được chủ đề). */
export const FALLBACK_TOPIC_NAME = 'Từ vựng khác'

export function newTarget(name: string, extra: Partial<Omit<Extract<Target, { kind: 'new' }>, 'kind' | 'name'>> = {}): Target {
  return { kind: 'new', name: name.trim(), nameEn: '', emoji: '', description: '', ...extra }
}

export function categoryTarget(c: Category): Target {
  return { kind: 'new', name: c.name, nameEn: c.nameEn, emoji: c.emoji, description: c.description }
}

export interface ClassifyContext {
  /** Chủ đề do người dùng tạo (không gồm chủ đề có sẵn). */
  topics: readonly Topic[]
  wordsByTopic: ReadonlyMap<string, readonly Word[]>
  /** Nơi lưu từ không đoán được chủ đề. */
  fallback: Target
  /** Bảng chủ đề WordNet (nếu đã tải). */
  wordnet?: WordnetTopics
}

export interface Classifier {
  suggest: (row: ClassifyInput & { topic?: string }) => Suggestion
  /** Chủ đề mẫu → id chủ đề của người dùng tương ứng. */
  categoryTopic: ReadonlyMap<string, string>
  /** Đổi chủ đề "mới" trùng tên với chủ đề đã có thành chủ đề đó. */
  resolve: (t: Target) => Target
}

export function buildClassifier(ctx: ClassifyContext): Classifier {
  const byName = new Map<string, Topic>()
  for (const t of ctx.topics) if (!byName.has(normalizeName(t.name))) byName.set(normalizeName(t.name), t)

  const wordTopic = new Map<string, string>()
  for (const t of ctx.topics) {
    for (const wd of ctx.wordsByTopic.get(t.id) ?? []) {
      const k = wd.word.trim().toLowerCase()
      if (!wordTopic.has(k)) wordTopic.set(k, t.id)
    }
  }

  // Mỗi chủ đề mẫu ứng với một chủ đề của người dùng (nếu nhiều thì lấy chủ đề nhiều từ hơn)
  const categoryTopic = new Map<string, string>()
  const sizeOf = (id: string): number => ctx.wordsByTopic.get(id)?.length ?? 0
  for (const t of ctx.topics) {
    const cat = topicCategory(t, ctx.wordsByTopic.get(t.id) ?? [], ctx.wordnet)
    if (!cat) continue
    const cur = categoryTopic.get(cat)
    if (!cur || sizeOf(t.id) > sizeOf(cur)) categoryTopic.set(cat, t.id)
  }
  const prefer = new Set(categoryTopic.keys())

  const resolve = (t: Target): Target => {
    if (t.kind === 'topic') return t
    const hit = byName.get(normalizeName(t.name))
    return hit ? { kind: 'topic', topicId: hit.id } : t
  }

  const suggest = (row: ClassifyInput & { topic?: string }): Suggestion => {
    if (row.topic?.trim()) return { target: resolve(newTarget(row.topic)), reason: 'csv' }
    const existing = wordTopic.get(row.word.trim().toLowerCase())
    if (existing) return { target: { kind: 'topic', topicId: existing }, reason: 'existing' }
    const guess = categorize(row, prefer, ctx.wordnet)
    if (guess) {
      const mine = categoryTopic.get(guess.id)
      if (mine) return { target: { kind: 'topic', topicId: mine }, reason: 'mine', categoryId: guess.id }
      return { target: resolve(categoryTarget(CATEGORY_BY_ID.get(guess.id)!)), reason: 'template', categoryId: guess.id }
    }
    return { target: resolve(ctx.fallback), reason: 'fallback' }
  }

  return { suggest, categoryTopic, resolve }
}

/* ------------------------------ Danh sách chủ đề đích ------------------------------ */

export interface TargetOption {
  key: string
  target: Target
  label: string
  /** Chủ đề sẽ được tạo khi lưu. */
  isNew: boolean
}

/**
 * Các chủ đề để chọn: chủ đề của tôi (trừ `exclude`) + chủ đề mới (`extra`, và mọi chủ đề mẫu nếu `withCategories`).
 * Chủ đề "mới" trùng tên chủ đề đã có được gộp (qua `classifier.resolve`).
 */
export function buildTargetOptions(opts: {
  classifier: Pick<Classifier, 'resolve'>
  topics: readonly Pick<Topic, 'id' | 'name' | 'emoji'>[]
  extra?: readonly Target[]
  withCategories?: boolean
  exclude?: string
}): Map<string, TargetOption> {
  const options = new Map<string, TargetOption>()
  for (const t of opts.topics) {
    if (t.id === opts.exclude) continue
    const key = `topic:${t.id}`
    options.set(key, { key, target: { kind: 'topic', topicId: t.id }, label: t.emoji ? `${t.emoji} ${t.name}` : t.name, isNew: false })
  }
  const addNew = (t: Target): void => {
    const resolved = opts.classifier.resolve(t)
    const key = targetKey(resolved)
    if (resolved.kind === 'new' && !options.has(key)) {
      options.set(key, { key, target: resolved, label: `${resolved.emoji ? `${resolved.emoji} ` : ''}${resolved.name} (mới)`, isNew: true })
    }
  }
  opts.extra?.forEach(addNew)
  if (opts.withCategories) CATEGORIES.forEach((c) => addNew(categoryTarget(c)))
  return options
}

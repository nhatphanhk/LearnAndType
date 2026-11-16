import type { BuiltinTopic } from './types'

export const transport: BuiltinTopic = {
  id: 'transport',
  name: 'Phương tiện & du lịch',
  nameEn: 'Transport & Travel',
  emoji: '✈️',
  description: 'Phương tiện giao thông và từ vựng khi đi du lịch.',
  words: [
    ['car', '/kɑːr/', 'n', 'ô tô', '🚗', 'My father drives a red car.', 'Bố tôi lái một chiếc ô tô màu đỏ.'],
    ['bus', '/bʌs/', 'n', 'xe buýt', '🚌', 'I take the bus to work.', 'Tôi đi xe buýt đi làm.'],
    ['bicycle', '/ˈbaɪ.sɪ.kəl/', 'n', 'xe đạp', '🚲', 'She rides her bicycle to school.', 'Cô ấy đạp xe đến trường.'],
    ['motorbike', '/ˈmoʊ.t̬ɚ.baɪk/', 'n', 'xe máy', '🏍️', 'Many people in Vietnam ride a motorbike.', 'Nhiều người ở Việt Nam đi xe máy.'],
    ['train', '/treɪn/', 'n', 'tàu hỏa', '🚆', 'The train leaves at seven.', 'Tàu khởi hành lúc bảy giờ.'],
    ['airplane', '/ˈer.pleɪn/', 'n', 'máy bay', '✈️', 'The airplane is landing now.', 'Máy bay đang hạ cánh.'],
    ['ship', '/ʃɪp/', 'n', 'tàu thủy', '🚢', 'The ship sailed across the ocean.', 'Con tàu đi qua đại dương.'],
    ['boat', '/boʊt/', 'n', 'con thuyền', '⛵', 'We took a boat to the island.', 'Chúng tôi đi thuyền ra đảo.'],
    ['taxi', '/ˈtæk.si/', 'n', 'xe taxi', '🚕', "Let's call a taxi.", 'Mình gọi taxi đi.'],
    ['helicopter', '/ˈhel.ɪˌkɑːp.tɚ/', 'n', 'trực thăng', '🚁', 'A helicopter flew over the city.', 'Một chiếc trực thăng bay qua thành phố.'],
    ['truck', '/trʌk/', 'n', 'xe tải', '🚚', 'The truck is carrying vegetables.', 'Chiếc xe tải đang chở rau.'],
    ['airport', '/ˈer.pɔːrt/', 'n', 'sân bay', '🛫', 'We arrived at the airport early.', 'Chúng tôi đến sân bay sớm.'],
    ['ticket', '/ˈtɪk.ɪt/', 'n', 'vé', '🎫', 'I bought a train ticket online.', 'Tôi đã mua vé tàu trên mạng.'],
    ['passport', '/ˈpæs.pɔːrt/', 'n', 'hộ chiếu', '🛂', "Don't forget your passport.", 'Đừng quên hộ chiếu của bạn.'],
    ['suitcase', '/ˈsuːt.keɪs/', 'n', 'va li', '🧳', 'My suitcase is too heavy.', 'Va li của tôi quá nặng.'],
    ['hotel', '/hoʊˈtel/', 'n', 'khách sạn', '🏨', 'We stayed at a hotel near the beach.', 'Chúng tôi ở khách sạn gần bãi biển.'],
    ['tourist', '/ˈtʊr.ɪst/', 'n', 'khách du lịch', '📸', 'Many tourists visit Ha Long Bay.', 'Nhiều khách du lịch đến thăm vịnh Hạ Long.'],
    ['beach', '/biːtʃ/', 'n', 'bãi biển', '🏖️', 'We played on the beach all day.', 'Chúng tôi chơi trên bãi biển cả ngày.'],
    ['traffic light', '/ˈtræf.ɪk ˌlaɪt/', 'n', 'đèn giao thông', '🚦', 'Stop when the traffic light is red.', 'Dừng lại khi đèn giao thông màu đỏ.'],
    ['station', '/ˈsteɪ.ʃən/', 'n', 'nhà ga, bến xe', '🚉', 'Meet me at the train station.', 'Gặp tôi ở ga tàu nhé.']
  ]
}

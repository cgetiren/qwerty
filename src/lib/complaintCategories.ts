export interface ComplaintCategory {
  category: string;
  keywords: string[];
  icon: string;
}

export const complaintCategories: ComplaintCategory[] = [
  {
    category: 'Para Yatırma/Çekim',
    keywords: ['yatırım', 'para yatır', 'çekim', 'para çek', 'deposit', 'withdrawal', 'transfer', 'ödeme', 'hesap yükle'],
    icon: '💰'
  },
  {
    category: 'Bonus/Promosyon',
    keywords: ['bonus', 'promosyon', 'kod', 'kampanya', 'hediye', 'özel kod', 'kupon'],
    icon: '🎁'
  },
  {
    category: 'Hesap Erişimi',
    keywords: ['giriş', 'şifre', 'hesap', 'erişim', 'login', 'oturum', 'kayıt', 'üyelik'],
    icon: '🔐'
  },
  {
    category: 'İşlem Gecikmeleri',
    keywords: ['gecikme', 'bekleme', 'gecikmesi', 'yavaş', 'hızlı', 'süre', 'işlem süresi', 'bekliyor'],
    icon: '⏱️'
  },
  {
    category: 'Güvenlik/Lisans',
    keywords: ['lisans', 'güvenlik', 'dolandırıcı', 'güven', 'yasal', 'sahtekarlık', 'izin'],
    icon: '🛡️'
  },
  {
    category: 'Müşteri Hizmetleri',
    keywords: ['destek', 'yanıt', 'cevap', 'ilgi', 'otomatik', 'bot', 'temsilci', 'yardım', 'çözüm'],
    icon: '👤'
  },
  {
    category: 'Bahis/Oyun Sorunları',
    keywords: ['bahis', 'oyun', 'maç', 'casino', 'slot', 'kazanç', 'oran', 'kupon'],
    icon: '🎮'
  },
  {
    category: 'Teknik Sorunlar',
    keywords: ['site', 'uygulama', 'açılmıyor', 'hata', 'çalışmıyor', 'mobil', 'yüklenmiyor', 'bug'],
    icon: '⚙️'
  },
  {
    category: 'Doğrulama/KYC',
    keywords: ['doğrulama', 'kimlik', 'belge', 'evrak', 'onay', 'kyc', 'verification'],
    icon: '📄'
  }
];

export function categorizeComplaint(text: string): string[] {
  if (!text) return ['Diğer'];

  const lowerText = text.toLowerCase();
  const matchedCategories: string[] = [];

  for (const { category, keywords } of complaintCategories) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matchedCategories.push(category);
        break;
      }
    }
  }

  return matchedCategories.length > 0 ? matchedCategories : ['Diğer'];
}

export function extractComplaintTopics(aiSummary: string): string[] {
  const categories = categorizeComplaint(aiSummary);

  const specificTopics: string[] = [];
  const lowerText = aiSummary.toLowerCase();

  if (lowerText.includes('yatırım') && lowerText.includes('gecik')) {
    specificTopics.push('Yatırım İşleminin Gecikmesi');
  }
  if (lowerText.includes('çekim') && lowerText.includes('gecik')) {
    specificTopics.push('Çekim İşleminin Gecikmesi');
  }
  if (lowerText.includes('kod') && (lowerText.includes('kabul') || lowerText.includes('geçersiz'))) {
    specificTopics.push('Bonus Kodu Kabul Edilmiyor');
  }
  if (lowerText.includes('lisans')) {
    specificTopics.push('Lisans Bilgisi Eksikliği');
  }
  if (lowerText.includes('otomatik') && lowerText.includes('yanıt')) {
    specificTopics.push('Otomatik Yanıtlar/Bot Problemi');
  }
  if (lowerText.includes('giriş') && (lowerText.includes('yapamı') || lowerText.includes('sorun'))) {
    specificTopics.push('Hesap Giriş Sorunu');
  }
  if (lowerText.includes('şifre')) {
    specificTopics.push('Şifre Problemi');
  }
  if (lowerText.includes('doğrulama') || lowerText.includes('kimlik')) {
    specificTopics.push('Kimlik Doğrulama Sorunu');
  }
  if (lowerText.includes('bonus') && !specificTopics.some(t => t.includes('Bonus'))) {
    specificTopics.push('Bonus Tanımlanmadı');
  }
  if (lowerText.includes('ödeme') || lowerText.includes('para')) {
    specificTopics.push('Ödeme/Para İşlemleri');
  }

  return specificTopics.length > 0 ? specificTopics : categories;
}

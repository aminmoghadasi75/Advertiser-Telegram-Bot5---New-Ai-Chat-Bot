/**
 * Decoupled Product Configuration & Knowledge Base
 * Isolates product specifications, plans, pricing, and support details from the prompt.
 */

export interface ProductPlan {
  id: string;
  name: string;
  price: string;
  priceNumeric: number;
  duration: string;
  traffic: string;
  deviceLimit: string;
  popular?: boolean;
}

export interface ProductConfig {
  productId: string;
  productName: string;
  productDescription: string;
  tagline: string;
  features: string[];
  plans: ProductPlan[];
  freeTrial: {
    available: boolean;
    durationHours: number;
    description: string;
  };
  refundPolicy: {
    available: boolean;
    guaranteeHours: number;
    description: string;
  };
  support: {
    handle: string; // e.g. "nova_vpn10" (strictly without @)
    link: string;   // e.g. "https://t.me/nova_vpn10"
    operatingHours: string;
  };
  bannerImageUrl?: string;
}

export const DEFAULT_PRODUCT_CONFIG: ProductConfig = {
  productId: 'nova_vpn',
  productName: 'فیلترشکن اختصاصی نوا (Nova VPN)',
  productDescription: 'سرورهای اختصاصی پرسرعت و پایدار بدون قطعی، مناسب تمام اپراتورها (همراه اول، ایرانسل، رایتل و مخابرات)',
  tagline: 'سرعت بالا، بدون قطعی، پینگ پایین مناسب بازی و استریم',
  features: [
    'اتصال فوری با پروتکل‌های ضد فیلتر V2Ray / VMess / VLESS',
    'پینگ فوق‌العاده پایین مناسب گیمینگ و تماس صوتی/تصویری',
    'بدون قطعی و بدون افت سرعت در ساعات شلوغی',
    'پشتیبانی کامل از اندروید، آیفون (iOS)، ویندوز و مک',
    'پشتیبانی ۲۴ ساعته و تست کیفیت قبل از خرید',
  ],
  plans: [
    {
      id: 'plan_1m_30g',
      name: 'پلن یک ماهه ۳۰ گیگ',
      price: '۸۵ هزار تومان',
      priceNumeric: 85000,
      duration: 'یک ماهه',
      traffic: '۳۰ گیگابایت',
      deviceLimit: '۲ کاربر همزمان',
    },
    {
      id: 'plan_1m_unlimited',
      name: 'پلن یک ماهه نامحدود',
      price: '۱۴۰ هزار تومان',
      priceNumeric: 140000,
      duration: 'یک ماهه',
      traffic: 'نامحدود',
      deviceLimit: '۲ کاربر همزمان',
      popular: true,
    },
    {
      id: 'plan_3m_unlimited',
      name: 'پلن سه ماهه نامحدود اقتصادی',
      price: '۳۵۰ هزار تومان',
      priceNumeric: 350000,
      duration: 'سه ماهه',
      traffic: 'نامحدود',
      deviceLimit: '۳ کاربر همزمان',
    },
  ],
  freeTrial: {
    available: true,
    durationHours: 24,
    description: 'اکانت تست رایگان یک روزه برای اطمینان از سرعت و کیفیت اتصال',
  },
  refundPolicy: {
    available: true,
    guaranteeHours: 48,
    description: '۴۸ ساعت ضمانت بازگشت وجه در صورت عدم رضایت یا قطعی',
  },
  support: {
    handle: 'nova_vpn10',
    link: 'https://t.me/nova_vpn10',
    operatingHours: '۲۴ ساعته',
  },
  bannerImageUrl: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80',
};

/**
 * Builds formatted product context string for injection into prompts or decision engines.
 * Restricts Support ID exposure when supportIdAvailable is false (<120 seconds).
 */
export function formatProductPromptContext(
  config: ProductConfig = DEFAULT_PRODUCT_CONFIG,
  supportIdAvailable: boolean = false
): string {
  const lines: string[] = [];

  lines.push(`[اطلاعات ساختاریافته محصول]:`);
  lines.push(`- نام محصول: ${config.productName}`);
  lines.push(`- خلاصه: ${config.productDescription}`);
  
  if (config.features && config.features.length > 0) {
    lines.push(`- مزایا و ویژگی‌ها:`);
    config.features.forEach((feat) => lines.push(`  • ${feat}`));
  }

  if (config.plans && config.plans.length > 0) {
    lines.push(`- پلن‌ها و تعرفه‌ها:`);
    config.plans.forEach((p) => {
      lines.push(`  • ${p.name}: ${p.price} (${p.duration}، ${p.traffic}، ${p.deviceLimit})`);
    });
  }

  if (config.freeTrial.available) {
    lines.push(`- تست رایگان: ${config.freeTrial.description}`);
  }

  if (config.refundPolicy.available) {
    lines.push(`- گارانتی: ${config.refundPolicy.description}`);
  }

  if (supportIdAvailable) {
    lines.push(`- آیدی پشتیبانی: ${config.support.handle} (اکیداً بدون علامت @)`);
  } else {
    lines.push(`- آیدی پشتیبانی: [قفل زمانی: مکالمه زیر ۱۲۰ ثانیه است - هنوز مجاز به ارسال آیدی پشتیبانی نیستید]`);
  }

  return lines.join('\n');
}

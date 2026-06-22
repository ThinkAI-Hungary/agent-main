import type { BrandKit, PostTemplate, PostCreative, Brief, SystemLog } from './types';

export const DUMMY_TEMPLATES: PostTemplate[] = [
  {
    id: 'quote',
    name: 'Idézet Kártya (Quote)',
    description: 'Szöveg-központú sablon elegáns elrendezéssel és hangsúlyos betűkkel, tökéletes gondolatok vagy idézetek megosztására.',
    category: 'quote'
  },
  {
    id: 'product',
    name: 'Termék Fókusz (Product Spotlight)',
    description: 'Képpel és hangsúlyos CTA-val ellátott sablon, ahol a termék és annak előnyei kapják a főszerepet.',
    category: 'product'
  },
  {
    id: 'testimonial',
    name: 'Visszajelzés (Testimonial)',
    description: 'Vásárlói értékeléseket bemutató sablon, csillagos osztályzással és elszigetelt szövegdobozzal.',
    category: 'testimonial'
  },
  {
    id: 'list',
    name: 'Lista / Lépések (List & Facts)',
    description: '3 pontba szedett, függőlegesen tagolt sablon infografikaszerű részletekhez és tényekhez.',
    category: 'list'
  }
];

export const INITIAL_BRAND_KITS: BrandKit[] = [
  {
    id: 'kit-v1',
    version: 1,
    createdAt: '2026-06-15T09:30:00Z',
    colors: {
      primary: '#5C4033',    // Dark Coffee Brown
      secondary: '#E8DCC4',  // Light Latte Warm Beige
      accent: '#D2691E',     // Warm Amber/Orange Chocolate
      rules: 'Elsődleges színt (sötétbarna) használjuk háttérként és címsorokhoz. A másodlagos meleg bézs alkalmas kiemelő blokkokhoz és idézet dobozokhoz. Az élénk borostyán színt szigorúan csak a CTA gomboknál és apró vizuális elemeknél vesszük elő.'
    },
    typography: {
      fontName: 'Playfair Display', // Beautiful serif
      titleSize: '48px',
      subtitleSize: '24px',
      bodySize: '16px',
      maxLineLength: 45
    },
    logoUrl: 'coffee-bean-circle', // Symbolizes SVG coffee bean logo
    logoPosition: 'top-right',
    tone: ['meleg', 'otthonos', 'őszinte'],
    toneExampleGood: 'Már a sütőben van a holnapi friss málnás pite! Gyere be hozzánk reggel, és élvezd a frissen pörkölt kávénk melegségét a kedvenc foteledben. ☕️🥧',
    toneExampleBad: 'A céges szabályzat értelmében akciós kávét forgalmazunk a mai napon. Kérjük, látogasson el az üzletegységbe a kedvezmény igénybevételéért.',
    visualRules: ['Mindig felülnézet vagy közeli makró', 'Természetes meleg fények, napfényes árnyékok', 'Tiszta háttér, semmi mesterséges stúdiófény', 'Emberek és arcok nélkül, a termék a hős'],
    negativePrompt: 'emberek, arcok, hideg stúdióvilágítás, neonfények, műanyag csészék, generikus iroda, stock-fotó érzés, elmosódott részletek',
    brandDna: {
      formal_vs_casual: 30,
      rational_vs_emotional: 70,
      modern_vs_traditional: 40,
      simple_vs_technical: 20,
      authority_vs_peer: 80,
      price_segment_score: 60,
      b2b_vs_b2c: 90,
      product_vs_service: 70,
      minimalist_vs_decorative: 50,
      warmth_vs_coolness: 80,
      vibrancy: 70,
      humor_level: 40,
      storytelling_level: 80,
      educational_level: 50,
      promotional_level: 40,
      cta_aggressiveness: 30,
      emoji_usage: 60,
      hashtag_density: 30,
      interaction_asking: 70
    }
  },
  {
    id: 'kit-v2',
    version: 2,
    createdAt: '2026-06-16T14:15:00Z',
    colors: {
      primary: '#3E2723',    // Richer Espresso Brown
      secondary: '#F5F5DC',  // Elegant cream/latte
      accent: '#FF8F00',     // Neon Amber/Orange Spark
      rules: 'Az eszpresszó barna dominál a háttereken. A krémszín a szövegeknél és konténereknél jelenik meg a kiváló kontrasztért. A tüzes narancs borostyán az akciós elemek és gombok exkluzív színe.'
    },
    typography: {
      fontName: 'Montserrat', // Modern geometric sans-serif
      titleSize: '52px',
      subtitleSize: '22px',
      bodySize: '15px',
      maxLineLength: 40
    },
    logoUrl: 'coffee-cup-minimal', // Dynamic SVG Minimal cup logo
    logoPosition: 'top-left',
    tone: ['játékos', 'direkt', 'meleg'],
    toneExampleGood: 'Megérkezett az új tavaszi specialty kreációnk! 🌸 Selymes zabtej, zamatos eper és egy dupla löket etióp eszpresszó. Kóstold meg még ma, mielőtt elkapkodják! 🍓☕️',
    toneExampleBad: 'Értesítjük tisztelt vásárlóinkat, hogy új tavaszi ital érhető el a kínálatunkban. Fogyasztása a nyitvatartási idő alatt lehetséges.',
    visualRules: ['Közeli, textúrákat mutató képek', 'Tavaszi napfény, pasztell virágszirmok a háttérben', 'Zöld növényi levelek természetes reflexiói', 'Kovászos kenyerek és kávék rusztikus tálalásban'],
    negativePrompt: 'emberek, arcok, plasztik felszín, generikus iroda, vakuvilágítás, sötét pincék, koszos asztalok',
    brandDna: {
      formal_vs_casual: 80,
      rational_vs_emotional: 75,
      modern_vs_traditional: 80,
      simple_vs_technical: 30,
      authority_vs_peer: 60,
      price_segment_score: 50,
      b2b_vs_b2c: 95,
      product_vs_service: 80,
      minimalist_vs_decorative: 30,
      warmth_vs_coolness: 90,
      vibrancy: 85,
      humor_level: 70,
      storytelling_level: 85,
      educational_level: 40,
      promotional_level: 60,
      cta_aggressiveness: 50,
      emoji_usage: 80,
      hashtag_density: 50,
      interaction_asking: 80
    }
  }
];

export const INITIAL_BRIEFS: Brief[] = [
  {
    id: 'brief-1',
    text: 'Új tavaszi szezonális kávénk van, mutassuk meg a frissességet és a meleg tónusokat.',
    createdAt: '2026-06-16T19:00:00Z'
  },
  {
    id: 'brief-2',
    text: 'Hétvégi brunch ajánlatunk népszerűsítése: házi készítésű kovászos kenyér és krémes kapucsínó.',
    createdAt: '2026-06-16T19:10:00Z'
  }
];

export const INITIAL_CREATIVES: PostCreative[] = [
  {
    id: 'creative-1',
    briefId: 'brief-1',
    templateId: 'quote',
    status: 'draft',
    text: '„A tavasz a természet ébredése, a kávé pedig a miénk.” 🌸☕️ Kóstold meg az új szezonális eszpresszónkat, amit a tavaszi napsütés ihletett.',
    imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=1080',
    imagePrompt: 'cozy coffee cup on wooden table with pink cherry blossom petals scattered around, top-down view, warm sunlight casting soft shadows, photorealistic, fal.ai Flux',
    colorVariation: 'default',
    logoVariant: 'light',
    createdAt: '2026-06-16T19:01:20Z'
  },
  {
    id: 'creative-2',
    briefId: 'brief-1',
    templateId: 'product',
    status: 'draft',
    text: 'Megérkezett a Tavaszi Zsongás Latte! 🍓🥛 Kézműves eszpresszó, házi eperöntet és selymes zabtej harmonikus találkozása a csészédben.',
    cta: 'Megkóstolom!',
    imageUrl: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=1080',
    imagePrompt: 'latte art in a ceramic cup on a rustic wooden tray, surrounded by fresh ripe strawberries and coffee beans, shallow depth of field, morning light, volumetric rays',
    colorVariation: 'accent',
    logoVariant: 'dark',
    createdAt: '2026-06-16T19:01:25Z'
  },
  {
    id: 'creative-3',
    briefId: 'brief-1',
    templateId: 'testimonial',
    status: 'draft',
    text: '„A legfinomabb szezonális kávé, amit Budapesten ittam! Az eper és a csoki ízjegyei tökéletesen kiegészítik egymást, a hangulat pedig csodás.”',
    cta: 'Kovács Anna, Törzsvendég',
    imageUrl: 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=1080',
    imagePrompt: 'steam rising from a cup of hot black coffee, warm cozy coffee shop background out of focus, moody cinematic lighting, golden hour reflection',
    colorVariation: 'inverted',
    logoVariant: 'light',
    createdAt: '2026-06-16T19:01:30Z'
  },
  {
    id: 'creative-4',
    briefId: 'brief-1',
    templateId: 'list',
    status: 'draft',
    text: 'Mitől különleges az új tavaszi kávénk?\n1. Friss eper infúzió\n2. Single-origin etióp kávé\n3. Biominősítésű zabtej',
    cta: 'Nézd meg a teljes menüt!',
    imageUrl: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&q=80&w=1080',
    imagePrompt: 'raw ethiopian coffee beans in a canvas sack, warm color grading, detailed texture, organic look, macro photography, natural daylight',
    colorVariation: 'default',
    logoVariant: 'light',
    createdAt: '2026-06-16T19:01:35Z'
  }
];

export const INITIAL_SCHEDULED_POSTS: PostCreative[] = [
  {
    id: 'scheduled-1',
    briefId: 'brief-preset',
    templateId: 'product',
    status: 'published',
    text: 'A reggeli napfény mellé jár egy krémes kapucsínó és egy ropogós croissant. Indítsd a napot velünk a Belváros szívében! 🥐☕️',
    cta: 'Irány a kávézó!',
    imageUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&q=80&w=1080',
    imagePrompt: 'rustic cafe table with croissant and cappuccino, morning sunlight shining through window, cozy warm atmosphere',
    colorVariation: 'default',
    logoVariant: 'light',
    createdAt: '2026-06-14T08:00:00Z',
    publishedAt: '2026-06-15T09:00:00Z',
    instagramUrl: 'https://instagram.com/p/mock_post_1/'
  },
  {
    id: 'scheduled-2',
    briefId: 'brief-preset',
    templateId: 'quote',
    status: 'scheduled',
    text: '„A kávé egy csésze folyékony optimizmus.” Gyere be ma egy kis feltöltődésre! ✨☕️',
    imageUrl: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&q=80&w=1080',
    imagePrompt: 'flat lay of a coffee cup next to a green plant, modern aesthetic, bright table',
    colorVariation: 'inverted',
    logoVariant: 'light',
    createdAt: '2026-06-15T15:00:00Z',
    scheduledAt: '2026-06-17T09:00:00Z'
  }
];

export const INITIAL_LOGS: SystemLog[] = [
  {
    id: 'log-1',
    timestamp: '2026-06-16T19:00:00Z',
    level: 'info',
    message: 'Rendszer inicializálva. Kovács Anna profil betöltve (Anna Kávézója).',
    step: 'queue'
  },
  {
    id: 'log-2',
    timestamp: '2026-06-16T19:00:05Z',
    level: 'info',
    message: 'Aktív Brand Kit ellenőrizve: "Montserrat" betűtípus elérhető, magyar ékezetek (őűéáí) támogatása: OK.',
    step: 'orchestrator'
  },
  {
    id: 'log-3',
    timestamp: '2026-06-16T19:01:00Z',
    level: 'info',
    message: 'Új brief érkezett: "Új tavaszi szezonális kávénk van..." (brief-1)',
    step: 'queue'
  },
  {
    id: 'log-4',
    timestamp: '2026-06-16T19:01:05Z',
    level: 'info',
    message: 'AI Orchestrator (Claude Sonnet 3.5) meghívása... Input: Brand Kit v2, Brief brief-1, és 5 korábbi jóváhagyott poszt.',
    step: 'orchestrator'
  },
  {
    id: 'log-5',
    timestamp: '2026-06-16T19:01:10Z',
    level: 'success',
    message: 'AI Orchestrator válasz megérkezett: 4 db kreatív variáns strukturált JSON formában legenerálva.',
    step: 'orchestrator'
  },
  {
    id: 'log-6',
    timestamp: '2026-06-16T19:01:12Z',
    level: 'info',
    message: 'Render Service (Playwright head-less böngészők) 4 szálon elindult.',
    step: 'renderer'
  },
  {
    id: 'log-7',
    timestamp: '2026-06-16T19:01:20Z',
    level: 'success',
    message: 'Render kész (1/4): Quote sablon, background image stock-Unsplash, PNG mentve a fájltárolóba.',
    step: 'renderer'
  },
  {
    id: 'log-8',
    timestamp: '2026-06-16T19:01:25Z',
    level: 'success',
    message: 'Render kész (2/4): Product sablon, Flux AI generált háttérkép letöltve, PNG mentve.',
    step: 'renderer'
  },
  {
    id: 'log-9',
    timestamp: '2026-06-16T19:01:30Z',
    level: 'success',
    message: 'Render kész (3/4): Testimonial sablon, PNG mentve a fájltárolóba.',
    step: 'renderer'
  },
  {
    id: 'log-10',
    timestamp: '2026-06-16T19:01:35Z',
    level: 'success',
    message: 'Render kész (4/4): List sablon, PNG mentve a fájltárolóba. Összes kép készen áll.',
    step: 'renderer'
  }
];

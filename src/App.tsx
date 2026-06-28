import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";

/* ══════════════════════════════════════════════════════════════════════════════════════
   ███ IlmTech ███ — Маркетплейс Таджикистана (аналог Somon.tj)
   ──────────────────────────────────────────────────────────────────────────────────────
   Школьный проект. React + TypeScript + Tailwind + Supabase.

   ★ ОБЩЕЕ ХРАНИЛИЩЕ В ИНТЕРНЕТЕ (Supabase) ★
     Пользователи, товары и сообщения синхронизируются между разными
     ноутбуками в реальном времени. Можно открыть с своего ноутбука и
     с ноутбука брата — увидите данные друг друга и сможете переписываться.

   Запуск:
     1) В терминале VS Code один раз:  npm install @supabase/supabase-js
     2) npm run dev
     3) Открыть http://localhost:5173
   ══════════════════════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════════
   РАЗДЕЛ 1. ПОДКЛЮЧЕНИЕ К SUPABASE (общий сервер)
   ════════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = "https://dyevvtzjuanzptzdgymf.supabase.co";
const SUPABASE_KEY = "sb_publishable_yA0dpEk61vGM_cdbPZRcfg_zEfc9rfq";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

/* ════════════════════════════════════════════════════════════════════════════
   РАЗДЕЛ 2. ТИПЫ ДАННЫХ
   ════════════════════════════════════════════════════════════════════════════ */

type Screen = "home" | "search" | "add" | "favorites" | "profile" | "messages";
type AuthView = "welcome" | "login" | "register" | "verify" | "accounts";
type Role = "seller" | "buyer";
type SortMode = "new" | "asc" | "desc";

interface User {
  id: string;
  email: string;
  nickname: string;
  password: string;
  role: Role;
  avatar: string;
  avatarIsPhoto: boolean;
  createdAt: number;
  lastSeen: number;  // время последнего захода на сайт (для статуса «в сети»)
}

interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorIsPhoto: boolean;
  text: string;
  ts: number;
}

interface Product {
  id: string;
  title: string;
  price: number;
  category: string;
  city: string;
  images: string[];
  phone: string;
  description: string;
  sellerId: string;
  sellerName: string;
  sellerAvatar: string;
  sellerIsPhoto: boolean;
  views: number;
  createdAt: number;
  badge: "VIP" | "Топ" | null;
  comments: Comment[];
  condition?: "new" | "used"; // Новое или Б/У (старые товары без поля считаем Б/У)
  _emoji?: string;
}

interface Message {
  id: string;
  conversationId: string;
  fromId: string;
  toId: string;
  kind: "text" | "voice" | "sticker";
  text?: string;
  audio?: string;
  ts: number;
  read: boolean;
}

interface Follow {
  followerId: string;  // кто подписался
  followingId: string; // на кого подписался
  ts: number;
}

interface BotMsg { from: "user" | "bot"; text: string; ts: number; }
interface Toast { msg: string; type: "ok" | "err" | "info"; }

/* ════════════════════════════════════════════════════════════════════════════
   РАЗДЕЛ 3. КОНСТАНТЫ
   ════════════════════════════════════════════════════════════════════════════ */

const LS = { SESSION: "ilm_session_v6", KNOWN: "ilm_known_v6", FAVS: "ilm_favs_v6" } as const;

const CATEGORIES: { key: string; emoji: string }[] = [
  { key: "Все", emoji: "🔥" },
  { key: "Электроника", emoji: "📱" },
  { key: "Авто", emoji: "🚗" },
  { key: "Недвижимость", emoji: "🏠" },
  { key: "Одежда", emoji: "👕" },
  { key: "Обувь", emoji: "👟" },
  { key: "Красота", emoji: "💄" },
  { key: "Детское", emoji: "🧸" },
  { key: "Для дома", emoji: "🛋️" },
  { key: "Техника", emoji: "🔌" },
  { key: "Спорт", emoji: "⚽" },
  { key: "Книги", emoji: "📚" },
  { key: "Продукты", emoji: "🍎" },
  { key: "Работа", emoji: "💼" },
  { key: "Услуги", emoji: "🔧" },
  { key: "Хобби", emoji: "🎨" },
  { key: "Музыка", emoji: "🎸" },
];

const CITIES = ["Душанбе", "Худжанд", "Бохтар", "Куляб", "Хорог", "Пенджикент"];
const AVATARS = ["😎", "🦊", "🐯", "🦁", "🐼", "🦄", "🐲", "👨‍💻", "👩‍🎓", "🧑‍🚀", "🐰", "🐸", "🦉", "🐵", "🐱"];
const STICKERS = ["👍", "❤️", "😂", "🔥", "🎉", "👏", "😍", "🤝", "✅", "🙏", "😎", "💯", "🥳", "😅", "🤔", "👌", "🫶", "😢", "😡", "🤩", "🥰", "😜", "🤗", "😴"];

/* ────────────────────────────────────────────────────────────────────────────
   СОЗДАТЕЛЬ САЙТА — особая СИНЯЯ галочка, которая есть ТОЛЬКО у этого аккаунта.
   Этот ник зарезервирован: другие пользователи не смогут его занять.
   Если поменяешь свой ник — просто впиши сюда новый (маленькими буквами).
   ──────────────────────────────────────────────────────────────────────────── */
const CREATOR_NICKS = ["osimsadulloev8", "yud1x"];
const isCreator = (nick: string | null | undefined): boolean =>
  !!nick && CREATOR_NICKS.includes(nick.trim().toLowerCase());

const productEmoji: Record<string, string> = {
  Электроника: "📱", Авто: "🚗", Недвижимость: "🏠", Одежда: "👕", Обувь: "👟",
  Красота: "💄", Детское: "🧸", "Для дома": "🛋️", Техника: "🔌", Спорт: "⚽",
  Книги: "📚", Продукты: "🍎", Работа: "💼", Услуги: "🔧", Хобби: "🎨", Музыка: "🎸",
};

/* ────────────────────────────────────────────────────────────────────────────
   ИКОНКИ КАТЕГОРИЙ — нарисованные SVG (стиль линий, как у Avito/Lucide).
   Цвет берётся из currentColor, поэтому управляется классом text-* у родителя.
   ──────────────────────────────────────────────────────────────────────────── */
const CAT_ICON_PATHS: Record<string, string> = {
  "Все": '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  "Электроника": '<rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M11 18h2"/>',
  "Авто": '<path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13"/><path d="M4 13h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1"/><path d="M6 18H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1"/><circle cx="7.5" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/><path d="M9.5 17.5h5"/>',
  "Недвижимость": '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-7h6v7"/>',
  "Одежда": '<path d="M8 3l-5 3 2 4 2-1v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-9l2 1 2-4-5-3a3 3 0 0 1-6 0z"/>',
  "Обувь": '<path d="M3 8v4c0 1-.3 2-1 3l-.7 1.2a1 1 0 0 0 .9 1.8H20a3 3 0 0 0 3-3c0-1.4-1-2.3-2.4-2.7l-5-1.6c-.6-.2-1-.5-1.4-1L11.2 5.5C10.8 5 10.2 4.7 9.5 4.7H4a1 1 0 0 0-1 1z"/><path d="m6.5 11.5 1.5-1"/><path d="m9.5 13 1.5-1"/>',
  "Красота": '<path d="M11.5 3.5 13 8.5 18 10l-5 1.5L11.5 16.5 10 11.5 5 10l5-1.5z"/><path d="M18 4v3"/><path d="M19.5 5.5h-3"/><path d="M5 16v2"/><path d="M6 17H4"/>',
  "Детское": '<circle cx="12" cy="13.5" r="5.5"/><circle cx="6.8" cy="8" r="2.4"/><circle cx="17.2" cy="8" r="2.4"/><path d="M10 12.5h.01"/><path d="M14 12.5h.01"/><path d="M10.5 15.5a2 2 0 0 0 3 0"/>',
  "Для дома": '<path d="M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M2 16a2 2 0 0 1 2-2 2 2 0 0 1 2 2v1h12v-1a2 2 0 0 1 2-2 2 2 0 0 1 2 2v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/><path d="M5 21v1"/><path d="M19 21v1"/>',
  "Техника": '<path d="M9 8V3"/><path d="M15 8V3"/><path d="M7 8h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5z"/><path d="M12 17v4"/>',
  "Спорт": '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M3.5 9.5h17"/><path d="M3.5 14.5h17"/>',
  "Книги": '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/>',
  "Продукты": '<path d="m6 9 2-5"/><path d="m18 9-2-5"/><path d="M3 9h18"/><path d="m4.5 9 1.4 8.2a2 2 0 0 0 2 1.8h8.2a2 2 0 0 0 2-1.8L19.5 9"/><path d="M5 13.5h14"/>',
  "Работа": '<path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6"/><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 12h18"/>',
  "Услуги": '<path d="M14.5 6a3.5 3.5 0 0 0 4.6 4.6l-7.8 7.8a2.1 2.1 0 0 1-3-3l7.8-7.8A3.5 3.5 0 0 0 14.5 6z"/><path d="m17.5 6.5-2 2"/>',
  "Хобби": '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.7 1.7 0 0 1 1.7-1.7H16a5.5 5.5 0 0 0 5.5-5.5C21.5 6 17.5 3 12 3z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="9.5" cy="7.5" r="1"/><circle cx="14.5" cy="7" r="1"/><circle cx="16.5" cy="11" r="1"/>',
  "Музыка": '<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
};

/** Нарисованная иконка категории. Цвет = currentColor (управляется классом text-*). */
function CategoryIcon({ name, size = 24 }: { name: string; size?: number }) {
  const inner = CAT_ICON_PATHS[name] ?? '<circle cx="12" cy="12" r="9"/>';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${inner}</svg>`;
  return <span className="inline-flex" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/* ════════════════════════════════════════════════════════════════════════════
   ЯЗЫКИ — словарь переводов
   ════════════════════════════════════════════════════════════════════════════ */

type Lang = "ru" | "tg" | "en";

const LANG_NAMES: Record<Lang, string> = {
  ru: "Русский",
  tg: "Тоҷикӣ",
  en: "English",
};

const T_RU = {
  // навигация
  home: "Главная", search: "Поиск", sell: "Продать", chats: "Чаты", favs: "Избр.", profile: "Профиль",
  // авторизация
  login: "Войти", register: "Зарегистрироваться", myAccounts: "Мои аккаунты",
  loginTitle: "Вход", regStep1: "Регистрация · Шаг 1", regStep2: "Регистрация · Шаг 2",
  email: "📧 Почта (name@mail.com)", nickname: "👤 Никнейм", password: "🔒 Пароль (мин. 4)",
  passwordRepeat: "🔒 Повторите пароль", next: "Далее →", back: "← Назад",
  selectRole: "Выберите роль:", buyer: "Покупатель", seller: "Продавец",
  createAccount: "Создать аккаунт ✓", creating: "Создаём...",
  // главная
  homeBanner1: "Купи и продай Б/У", homeBanner2: "Вещи с рук по всему Таджикистану ⚡",
  usedNote: "🏷️ IlmTech — площадка для вещей б/у. Честно опиши состояние товара.",
  adsCount: "объявлений", noAds: "Объявлений пока нет. Будь первым! 🚀",
  sortNew: "Новые", sortAsc: "Цена ↑", sortDesc: "Цена ↓",
  more: "Ещё", allCategories: "Все категории",
  // поиск
  searchPlaceholder: "iPhone, BMW, квартира...",
  priceFrom: "Цена от", priceTo: "Цена до", foundCount: "Найдено",
  // карточка товара
  call: "📞 Позвонить", write: "💬 Написать", myAd: "Это ваше объявление",
  commentsCount: "Комментарии", noComments: "Комментариев пока нет",
  writeComment: "Написать комментарий...",
  // новое объявление
  newAd: "➕ Новое объявление", title: "Название", price: "Цена (TJS)",
  phone: "📞 Номер телефона", description: "Описание", publish: "⚡ Опубликовать",
  // профиль
  editProfile: "✏️ Редактировать профиль", changeAvatar: "📷 Загрузить фото",
  myAdsCount: "Объявлений", favsCount: "Избранное", viewsCount: "Просмотры",
  followers: "Подписчики", following: "Подписки",
  notifications: "Уведомления", verification: "Верификация", security: "Безопасность",
  language: "Язык", help: "Помощь",
  switchAccount: "🔄 Сменить аккаунт", logout: "🚪 Выйти",
  // профиль другого
  follow: "➕ Подписаться", unfollow: "✓ Вы подписаны",
  adsLabel: "🏪 Объявления", followersShort: "Подписч.", followingShort: "Подписки", adsShort: "Объявл.",
  // чаты
  messages: "💬 Сообщения", findById: "🔍 Найти по ID (ILM-XXXXX)", findBtn: "Найти",
  yourIdHint: "Твой ID: ", giveItToFriend: " — дай его другу или брату, чтобы он написал тебе с другого ноутбука.",
  noDialogs: "Нет диалогов. Найди человека по ID или напиши продавцу из карточки.",
  noMessages: "Сообщений пока нет. Напишите первым 👇",
  messageInput: "Сообщение...", recording: "● Идёт запись... отпустите кнопку",
  online: "🟢 в сети", voiceMsg: "🎤 Голосовое", stickerLabel: "Стикер",
  deleteChat: "Удалить переписку", deleteMsg: "Удалить", confirmDeleteChat: "Удалить всю переписку? Это нельзя отменить.",
  confirmDeleteMsg: "Удалить это сообщение?",
  // прочее
  sortMode: "Сортировка", post: "Подать", bot: "IlmBot", askBot: "Спроси что-нибудь...",
  // языки
  langTitle: "Выберите язык",
};

const T_TG: typeof T_RU = {
  home: "Асосӣ", search: "Ҷустуҷӯ", sell: "Фурӯш", chats: "Чатҳо", favs: "Дӯстдошта", profile: "Профил",
  login: "Даромадан", register: "Бақайдгирӣ", myAccounts: "Аккаунтҳои ман",
  loginTitle: "Даромадан", regStep1: "Бақайдгирӣ · Қадами 1", regStep2: "Бақайдгирӣ · Қадами 2",
  email: "📧 Почта (name@mail.com)", nickname: "👤 Лақаб", password: "🔒 Парол (мин. 4)",
  passwordRepeat: "🔒 Паролро такрор кунед", next: "Минбаъд →", back: "← Бозгашт",
  selectRole: "Нақшро интихоб кунед:", buyer: "Харидор", seller: "Фурӯшанда",
  createAccount: "Аккаунт сохтан ✓", creating: "Сохта истода...",
  homeBanner1: "Хариду фурӯши молҳои дастидуюм", homeBanner2: "Ашёи дастидуюм дар Тоҷикистон ⚡",
  usedNote: "🏷️ IlmTech — майдон барои ашёи дастидуюм. Ҳолати молро рост нависед.",
  adsCount: "эълон", noAds: "Ҳоло эълон нест. Якум шав! 🚀",
  sortNew: "Нав", sortAsc: "Нарх ↑", sortDesc: "Нарх ↓",
  more: "Бештар", allCategories: "Ҳамаи категорияҳо",
  searchPlaceholder: "iPhone, BMW, хонадон...",
  priceFrom: "Нарх аз", priceTo: "Нарх то", foundCount: "Ёфт шуд",
  call: "📞 Занг задан", write: "💬 Навиштан", myAd: "Ин эълони шумост",
  commentsCount: "Шарҳҳо", noComments: "Ҳоло шарҳ нест",
  writeComment: "Шарҳ нависед...",
  newAd: "➕ Эълони нав", title: "Ном", price: "Нарх (TJS)",
  phone: "📞 Рақами телефон", description: "Тавсиф", publish: "⚡ Нашр кардан",
  editProfile: "✏️ Профилро таҳрир кунед", changeAvatar: "📷 Сурат бор кунед",
  myAdsCount: "Эълонҳо", favsCount: "Дӯстдошта", viewsCount: "Дидашуда",
  followers: "Обуначиён", following: "Обуна",
  notifications: "Огоҳиномаҳо", verification: "Тасдиқ", security: "Бехатарӣ",
  language: "Забон", help: "Кӯмак",
  switchAccount: "🔄 Аккаунт иваз кардан", logout: "🚪 Баромадан",
  follow: "➕ Обуна шудан", unfollow: "✓ Шумо обуна шудаед",
  adsLabel: "🏪 Эълонҳо", followersShort: "Обунач.", followingShort: "Обуна", adsShort: "Эълон.",
  messages: "💬 Паёмҳо", findById: "🔍 Бо ID ёфтан (ILM-XXXXX)", findBtn: "Ёфтан",
  yourIdHint: "ID-и шумо: ", giveItToFriend: " — онро ба бародар ё дӯсти худ диҳед, то ӯ ба шумо нависад.",
  noDialogs: "Чате нест. Ҳамсӯҳбатро бо ID ёбед ё ба фурӯшанда нависед.",
  noMessages: "Ҳоло паём нест. Якум нависед 👇",
  messageInput: "Паём...", recording: "● Сабт меравад... тугмаро раҳо кунед",
  online: "🟢 дар тамос", voiceMsg: "🎤 Овозӣ", stickerLabel: "Стикер",
  deleteChat: "Чатро тоза кардан", deleteMsg: "Тоза кардан", confirmDeleteChat: "Тамоми чатро тоза кунам? Барқарорнопазир.",
  confirmDeleteMsg: "Ин паёмро тоза кунам?",
  sortMode: "Тартиб", post: "Гузоштан", bot: "IlmBot", askBot: "Чизе пурсед...",
  langTitle: "Забонро интихоб кунед",
};

const T_EN: typeof T_RU = {
  home: "Home", search: "Search", sell: "Sell", chats: "Chats", favs: "Favs", profile: "Profile",
  login: "Log in", register: "Sign up", myAccounts: "My accounts",
  loginTitle: "Log in", regStep1: "Sign up · Step 1", regStep2: "Sign up · Step 2",
  email: "📧 Email (name@mail.com)", nickname: "👤 Nickname", password: "🔒 Password (min 4)",
  passwordRepeat: "🔒 Repeat password", next: "Next →", back: "← Back",
  selectRole: "Choose role:", buyer: "Buyer", seller: "Seller",
  createAccount: "Create account ✓", creating: "Creating...",
  homeBanner1: "Buy & sell used goods", homeBanner2: "Second-hand deals across Tajikistan ⚡",
  usedNote: "🏷️ IlmTech is for used (second-hand) goods. Describe the condition honestly.",
  adsCount: "ads", noAds: "No ads yet. Be the first! 🚀",
  sortNew: "Newest", sortAsc: "Price ↑", sortDesc: "Price ↓",
  more: "More", allCategories: "All categories",
  searchPlaceholder: "iPhone, BMW, apartment...",
  priceFrom: "Price from", priceTo: "Price to", foundCount: "Found",
  call: "📞 Call", write: "💬 Message", myAd: "This is your ad",
  commentsCount: "Comments", noComments: "No comments yet",
  writeComment: "Write a comment...",
  newAd: "➕ New ad", title: "Title", price: "Price (TJS)",
  phone: "📞 Phone number", description: "Description", publish: "⚡ Publish",
  editProfile: "✏️ Edit profile", changeAvatar: "📷 Upload photo",
  myAdsCount: "Ads", favsCount: "Favs", viewsCount: "Views",
  followers: "Followers", following: "Following",
  notifications: "Notifications", verification: "Verification", security: "Security",
  language: "Language", help: "Help",
  switchAccount: "🔄 Switch account", logout: "🚪 Log out",
  follow: "➕ Follow", unfollow: "✓ Following",
  adsLabel: "🏪 Ads", followersShort: "Followers", followingShort: "Following", adsShort: "Ads",
  messages: "💬 Messages", findById: "🔍 Find by ID (ILM-XXXXX)", findBtn: "Find",
  yourIdHint: "Your ID: ", giveItToFriend: " — give it to a friend so they can message you from another device.",
  noDialogs: "No chats yet. Find someone by ID or message a seller from a card.",
  noMessages: "No messages yet. Be the first 👇",
  messageInput: "Message...", recording: "● Recording... release the button",
  online: "🟢 online", voiceMsg: "🎤 Voice", stickerLabel: "Sticker",
  deleteChat: "Delete chat", deleteMsg: "Delete", confirmDeleteChat: "Delete entire chat? This cannot be undone.",
  confirmDeleteMsg: "Delete this message?",
  sortMode: "Sort", post: "Post", bot: "IlmBot", askBot: "Ask something...",
  langTitle: "Choose language",
};

const TRANSLATIONS: Record<Lang, typeof T_RU> = { ru: T_RU, tg: T_TG, en: T_EN };


/* ════════════════════════════════════════════════════════════════════════════
   РАЗДЕЛ 4. ЛОКАЛЬНОЕ ХРАНИЛИЩЕ (только сессия и избранное; основные данные — в Supabase)
   ════════════════════════════════════════════════════════════════════════════ */

const local = {
  get<T>(key: string, fb: T): T {
    try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : fb; }
    catch { return fb; }
  },
  set(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } },
};

const session = {
  get(): string | null { try { return sessionStorage.getItem(LS.SESSION); } catch { return null; } },
  set(id: string) { try { sessionStorage.setItem(LS.SESSION, id); } catch { /* ignore */ } },
  clear() { try { sessionStorage.removeItem(LS.SESSION); } catch { /* ignore */ } },
};

/* ════════════════════════════════════════════════════════════════════════════
   РАЗДЕЛ 5. ОБЁРТКА API SUPABASE (просто и понятно)
   ════════════════════════════════════════════════════════════════════════════ */

/** Загрузить всех пользователей */
async function apiLoadUsers(): Promise<User[]> {
  const { data, error } = await supabase.from("ilm_users").select("*").order("created_at", { ascending: true });
  if (error || !data) { console.warn("loadUsers", error); return []; }
  return data.map((r: Record<string, unknown>) => ({
    id: (r.id as string) || "",
    email: (r.email as string) || "",
    nickname: (r.nickname as string) || "",
    password: (r.password as string) || "",
    role: (r.role as Role) || "buyer",
    avatar: (r.avatar as string) || "😎",
    avatarIsPhoto: !!r.avatar_is_photo,
    createdAt: Number(r.created_at) || 0,
    lastSeen: Number(r.last_seen) || 0,
  }));
}

/** Создать пользователя на сервере */
async function apiInsertUser(u: User): Promise<{ ok: boolean; err?: string }> {
  const { error } = await supabase.from("ilm_users").insert({
    id: u.id, email: u.email, nickname: u.nickname, password: u.password,
    role: u.role, avatar: u.avatar, avatar_is_photo: u.avatarIsPhoto, created_at: u.createdAt,
    last_seen: u.lastSeen,
  });
  if (error) return { ok: false, err: error.message };
  return { ok: true };
}

/** Обновить пользователя (ник / аватар) */
async function apiUpdateUser(u: User): Promise<void> {
  await supabase.from("ilm_users").update({
    nickname: u.nickname, avatar: u.avatar, avatar_is_photo: u.avatarIsPhoto,
  }).eq("id", u.id);
}

/** Загрузить все товары */
async function apiLoadProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from("ilm_products").select("*").order("created_at", { ascending: false });
  if (error || !data) { console.warn("loadProducts", error); return []; }
  return data.map((r: Record<string, unknown>) => r.data as Product);
}

/** Создать товар */
async function apiInsertProduct(p: Product): Promise<void> {
  await supabase.from("ilm_products").insert({ id: p.id, data: p, created_at: p.createdAt });
}

/** Обновить товар целиком (после просмотра/комментария) */
async function apiUpdateProduct(p: Product): Promise<void> {
  await supabase.from("ilm_products").update({ data: p }).eq("id", p.id);
}

/** Удалить товар по id */
async function apiDeleteProduct(productId: string): Promise<void> {
  await supabase.from("ilm_products").delete().eq("id", productId);
}

/** Загрузить все сообщения */
async function apiLoadMessages(): Promise<Message[]> {
  const { data, error } = await supabase.from("ilm_messages").select("*").order("ts", { ascending: true });
  if (error || !data) { console.warn("loadMessages", error); return []; }
  return data.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    conversationId: r.conversation_id as string,
    fromId: r.from_id as string,
    toId: r.to_id as string,
    kind: r.kind as Message["kind"],
    text: (r.text as string) || undefined,
    audio: (r.audio as string) || undefined,
    ts: Number(r.ts),
    read: !!r.read,
  }));
}

/** Отправить сообщение */
async function apiInsertMessage(m: Message): Promise<void> {
  await supabase.from("ilm_messages").insert({
    id: m.id, conversation_id: m.conversationId, from_id: m.fromId, to_id: m.toId,
    kind: m.kind, text: m.text ?? null, audio: m.audio ?? null, ts: m.ts, read: m.read,
  });
}

/** Пометить входящие сообщения от партнёра как прочитанные */
async function apiMarkRead(fromId: string, toId: string): Promise<void> {
  await supabase.from("ilm_messages").update({ read: true })
    .eq("from_id", fromId).eq("to_id", toId).eq("read", false);
}

/** Обновить «время последней активности» — для статуса «в сети». Молча игнорирует ошибку (если колонки нет). */
async function apiTouchLastSeen(userId: string): Promise<void> {
  try {
    await supabase.from("ilm_users").update({ last_seen: Date.now() }).eq("id", userId);
  } catch { /* колонки может не быть */ }
}

/** Удалить всю переписку между двумя пользователями */
async function apiDeleteConversation(myId: string, partnerId: string): Promise<void> {
  // удаляем сообщения в обе стороны
  await supabase.from("ilm_messages").delete().eq("from_id", myId).eq("to_id", partnerId);
  await supabase.from("ilm_messages").delete().eq("from_id", partnerId).eq("to_id", myId);
}

/** Удалить одно конкретное сообщение по id */
async function apiDeleteMessage(messageId: string): Promise<void> {
  await supabase.from("ilm_messages").delete().eq("id", messageId);
}

/** Загрузить все подписки */
async function apiLoadFollows(): Promise<Follow[]> {
  const { data, error } = await supabase.from("ilm_follows").select("*");
  if (error || !data) { console.warn("loadFollows", error); return []; }
  return data.map((r: Record<string, unknown>) => ({
    followerId: (r.follower_id as string) || "",
    followingId: (r.following_id as string) || "",
    ts: Number(r.ts) || 0,
  }));
}

/** Подписаться: я (myId) подписываюсь на (targetId) */
async function apiFollow(myId: string, targetId: string): Promise<void> {
  await supabase.from("ilm_follows").insert({
    follower_id: myId,
    following_id: targetId,
    ts: Date.now(),
  });
}

/** Отписаться */
async function apiUnfollow(myId: string, targetId: string): Promise<void> {
  await supabase.from("ilm_follows").delete()
    .eq("follower_id", myId)
    .eq("following_id", targetId);
}

/* ════════════════════════════════════════════════════════════════════════════
   РАЗДЕЛ 6. УТИЛИТЫ
   ════════════════════════════════════════════════════════════════════════════ */

const uid = (): string => Math.random().toString(36).slice(2) + Date.now().toString(36);

const makeUserId = (existing: User[]): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 100; attempt++) {
    let s = "";
    for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    const id = "ILM-" + s;
    if (!existing.some((u) => u.id === id)) return id;
  }
  return "ILM-" + Date.now().toString(36).toUpperCase();
};

const convId = (a: string, b: string): string => [a, b].sort().join("__");

/** Сделать уникальный ник из имени/почты (для входа через Google). */
const makeUniqueNick = (base: string, existing: User[]): string => {
  const clean = ((base || "user").split("@")[0].replace(/[^a-zA-Zа-яА-Я0-9_]/g, "").slice(0, 14)) || "user";
  const taken = (n: string): boolean =>
    isCreator(n) || existing.some((u) => (u.nickname || "").toLowerCase() === n.toLowerCase());
  if (!taken(clean)) return clean;
  for (let i = 1; i < 9999; i++) {
    if (!taken(clean + i)) return clean + i;
  }
  return clean + Date.now().toString(36);
};

const timeAgo = (ts: number): string => {
  const minutes = Math.floor((Date.now() - ts) / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} дн назад`;
  return `${Math.floor(days / 30)} мес назад`;
};

const fmtTime = (ts: number): string => {
  const d = new Date(ts);
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
};

const fmtPrice = (n: number): string => n.toLocaleString("ru-RU");

const isEmail = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

const normalize = (s: string): string =>
  s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9 ]/gi, " ").replace(/\s+/g, " ").trim();

/** Расстояние Левенштейна — для распознавания опечаток */
const levenshtein = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
};

const fuzzyHas = (text: string, keywords: string[]): boolean => {
  const words = text.split(" ").filter(Boolean);
  for (const kw of keywords) {
    if (text.includes(kw)) return true;
    for (const w of words) {
      if (Math.abs(w.length - kw.length) > 2) continue;
      const limit = kw.length <= 4 ? 1 : 2;
      if (levenshtein(w, kw) <= limit) return true;
    }
  }
  return false;
};

/** Считается ли пользователь «в сети»: был активен в последние 2 минуты */
const isOnline = (lastSeen: number): boolean => {
  if (!lastSeen) return false;
  return Date.now() - lastSeen < 2 * 60 * 1000;
};

/** Текст «был N мин/ч/дн назад» */
const lastSeenText = (lastSeen: number): string => {
  if (!lastSeen) return "был давно";
  const diff = Date.now() - lastSeen;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `был ${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `был ${hours} ч назад`;
  return `был ${Math.floor(hours / 24)} дн назад`;
};

/** Галочка верификации по количеству подписчиков */
type VerifyBadge = { emoji: string; title: string; color: string } | null;
const verifyBadge = (followers: number): VerifyBadge => {
  if (followers >= 10000) return { emoji: "✔️", title: "Жёлтая галочка (10000+ подписчиков)", color: "#eab308" };
  if (followers >= 7000)  return { emoji: "✔️", title: "Зелёная галочка (7000+ подписчиков)", color: "#10b981" };
  if (followers >= 1000)  return { emoji: "✔️", title: "Чёрная галочка (1000+ подписчиков)", color: "#111827" };
  return null;
};

/** Компонент: галочка верификации рядом с ником.
 *  Если ник принадлежит создателю — показываем особую СИНЮЮ галочку «Создатель». */
function VerifyMark({ followers, size = 16, nick }: { followers: number; size?: number; nick?: string }) {
  if (isCreator(nick)) {
    return (
      <span
        title="Создатель IlmTech ⚡"
        className="inline-flex items-center justify-center rounded-full text-white font-black"
        style={{
          width: size, height: size, fontSize: size * 0.66, lineHeight: 1,
          background: "linear-gradient(135deg,#3b82f6,#06b6d4)",
          boxShadow: "0 0 0 2px rgba(59,130,246,0.25)",
        }}
      >
        ✓
      </span>
    );
  }
  const b = verifyBadge(followers);
  if (!b) return null;
  return (
    <span
      title={b.title}
      className="inline-flex items-center justify-center rounded-full text-white font-black"
      style={{ width: size, height: size, fontSize: size * 0.7, backgroundColor: b.color, lineHeight: 1 }}
    >
      ✓
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   РАЗДЕЛ 7. ЧАТ-БОТ — база знаний (32 темы, понимает опечатки)
   ════════════════════════════════════════════════════════════════════════════ */

interface BotTopic { keys: string[]; answer: string; }

const BOT_TOPICS: BotTopic[] = [
  // ═══════════════════════ ПРИВЕТСТВИЯ ═══════════════════════
  { keys: ["привет", "салом", "здравствуй", "хай", "ассалом", "хеллоу", "ку", "дарова", "хелло"], answer: "Салом! 👋 Я IlmBot — помощник по сайту IlmTech. Знаю всё про сайт: как продать, купить, написать в чат, добавить фото, подписки, безопасность. Спрашивай!" },
  { keys: ["как дела", "че как", "как ты", "че делаешь"], answer: "У меня всё отлично! 😊 Готов рассказать тебе про IlmTech. Что хочешь узнать?" },
  { keys: ["спасибо", "благодарю", "рахмат", "сенкс", "спс", "пасиб"], answer: "Пожалуйста! Всегда рад помочь 😊 Если есть ещё вопросы про IlmTech — спрашивай!" },
  { keys: ["пока", "до свидания", "бай", "хайр", "до встречи"], answer: "Пока! Удачных продаж на IlmTech 👋⚡" },
  { keys: ["кто ты", "ты кто", "что ты", "ты бот", "что за бот"], answer: "🤖 Я IlmBot — официальный помощник IlmTech. Я знаю про сайт всё: как зарегистрироваться, продать, купить, написать, подписаться. Спроси что-нибудь!" },
  { keys: ["кто тебя создал", "кто сделал", "разработчик", "автор", "кто написал", "кто хозяин"], answer: "🤖 Меня создал школьник из Таджикистана — Осимсаддуло. IlmTech это его проект для школьного конкурса ⚡" },
  { keys: ["умеешь", "что умеешь", "что можешь", "функции", "помощь", "помоги"], answer: "Я знаю всё про IlmTech! Могу рассказать про:\n• Регистрацию и вход\n• Как продать товар\n• Как купить\n• Чат, голосовые, стикеры\n• Фото профиля, аватары\n• Подписки и галочки\n• Безопасность\n• Установку как приложение\nПросто спроси!" },

  // ═══════════════════════ ЧТО ТАКОЕ ILMTECH ═══════════════════════
  { keys: ["что такое ilmtech", "что за сайт", "о сайте", "что это", "расскажи о сайте", "что такое илм", "что такое илмтеч"], answer: "⚡ IlmTech — маркетплейс Таджикистана. Тут люди покупают и продают вещи. Как Somon.tj, только новее и удобнее. Категории: электроника, авто, недвижимость, одежда и др. Регистрация бесплатная." },
  { keys: ["илмтеч", "ilmtech", "илм теч", "ilm tech"], answer: "⚡ IlmTech — это место где можно бесплатно продать или купить что угодно в Таджикистане. Без комиссий, с чатом, голосовыми сообщениями и стикерами." },
  { keys: ["для чего сайт", "зачем сайт", "цель сайта"], answer: "🎯 IlmTech нужен чтобы люди в Таджикистане могли быстро продать ненужное или найти то что нужно. Никаких посредников — пишешь продавцу напрямую и встречаешься." },
  { keys: ["бесплатно", "сколько стоит", "цена сайта", "платить", "комиссия"], answer: "🆓 IlmTech полностью БЕСПЛАТНЫЙ! Никаких подписок, никаких комиссий. Никто не возьмёт с тебя денег за публикацию или продажу." },
  { keys: ["безопасно", "не обманут", "доверять", "надёжно"], answer: "🛡️ Безопасность — это твоя ответственность. Советы:\n• Встречайся в людном месте днём\n• Проверь товар ДО передачи денег\n• Не плати вперёд незнакомцам\n• Не пересылай деньги на карту, плати наличными при встрече" },
  { keys: ["город", "где работает", "куда доставка", "регионы"], answer: "🏙️ IlmTech работает по всему Таджикистану: Душанбе, Худжанд, Бохтар, Куляб, Хорог, Пенджикент. Доставку организуете сами с продавцом — обычно встречаетесь лично." },

  // ═══════════════════════ РЕГИСТРАЦИЯ И ВХОД ═══════════════════════
  { keys: ["регистрация", "зарегистрироваться", "создать аккаунт", "регнуться", "как создать"], answer: "📝 Чтобы зарегистрироваться:\n1) Нажми «Зарегистрироваться» на экране входа\n2) Введи почту (например, name@mail.com)\n3) Придумай никнейм\n4) Пароль минимум 4 символа\n5) Повтори пароль\n6) Нажми «Создать аккаунт ✓»\nГотово! Можешь сразу пользоваться." },
  { keys: ["войти", "вход", "залогиниться", "логин", "как зайти"], answer: "🔑 Чтобы войти: введи свой никнейм и пароль, нажми «Войти». Если забыл пароль — пока нет восстановления, придётся регистрироваться заново на новую почту." },
  { keys: ["пароль", "забыл пароль", "не помню пароль", "сменить пароль"], answer: "🔒 Если забыл пароль — пока его нельзя восстановить (это учебный проект). Зарегистрируйся заново с другой почтой. В будущем добавим восстановление!" },
  { keys: ["несколько аккаунтов", "много аккаунтов", "разные аккаунты", "переключить"], answer: "👥 На одном устройстве можно держать несколько аккаунтов! Когда выходишь из аккаунта — он сохраняется в «Мои аккаунты». Нажми «Сменить аккаунт» в профиле и переключайся одним нажатием." },
  { keys: ["удалить аккаунт", "стереть аккаунт"], answer: "🗑️ Пока удаления аккаунта нет (это учебный проект). Но ты можешь просто выйти из него и не пользоваться — никто его не увидит без пароля." },
  { keys: ["почта", "email", "имейл", "какая почта"], answer: "📧 При регистрации нужна любая почта с собачкой @ и точкой. Например: anvar@mail.com, dushanbe@gmail.com. Письма мы не отправляем — почта нужна просто как уникальный логин." },

  // ═══════════════════════ ПРОДАЖА ═══════════════════════
  { keys: ["продать", "разместить", "подать объявление", "выставить", "опубликовать товар", "как продать", "продаю", "хочу продать"], answer: "🏪 Чтобы продать:\n1) Нажми ➕ внизу экрана (или «Подать» сверху)\n2) Добавь до 4 фотографий товара\n3) Введи название\n4) Цену в TJS (сомони)\n5) Выбери категорию и город\n6) Опиши товар подробно\n7) Укажи свой телефон\n8) Нажми «⚡ Опубликовать»\nГотово! Объявление появится на главной." },
  { keys: ["сколько фото", "сколько фотографий", "фото", "картинки", "снимки"], answer: "📸 До 4 фотографий на одно объявление. Делай чёткие фото при дневном свете, показывай товар со всех сторон. Хорошие фото = быстрее продашь!" },
  { keys: ["цена", "как поставить цену", "сколько просить"], answer: "💰 Ставь цену в TJS (сомони). Чтобы быстро продать — посмотри похожие товары на сайте и поставь чуть ниже. Можно завышать и торговаться, но это дольше." },
  { keys: ["описание", "как описать", "что писать"], answer: "📝 В описании укажи: состояние (новое/б.у.), причину продажи, что в комплекте, гарантию если есть. Чем подробнее — тем больше доверия и быстрее продажа." },
  { keys: ["категория", "категории", "разделы"], answer: "🗂️ На IlmTech 17 категорий: Электроника 📱, Авто 🚗, Недвижимость 🏠, Одежда 👕, Обувь 👟, Красота 💄, Детское 🧸, Для дома 🛋️, Техника 🔌, Спорт ⚽, Книги 📚, Продукты 🍎, Работа 💼, Услуги 🔧, Хобби 🎨, Музыка 🎸. На главной первые 11, остальные в «Ещё»." },
  { keys: ["удалить объявление", "снять объявление", "убрать товар", "удалить товар"], answer: "🗑️ Открой свой профиль → найди вкладку «Мои объявления» → нажми на товар → внизу будет кнопка «Удалить объявление». Также удалить можно прямо из карточки своего товара." },
  { keys: ["редактировать объявление", "изменить объявление", "поменять цену"], answer: "✏️ Пока редактирование объявлений в работе. Чтобы изменить — удали старое и создай новое с правильными данными." },
  { keys: ["продано", "как пометить продано", "товар продан"], answer: "✅ Когда товар продан — просто удали объявление, чтобы его больше не показывали другим пользователям." },
  { keys: ["сколько объявлений", "лимит", "ограничение"], answer: "📊 Никаких лимитов! Можешь публиковать сколько угодно объявлений." },

  // ═══════════════════════ ПОКУПКА ═══════════════════════
  { keys: ["купить", "покупка", "как заказать", "приобрести", "хочу купить", "как купить"], answer: "🛒 Чтобы купить:\n1) Найди товар на главной или в Поиске\n2) Открой карточку (нажми на товар)\n3) Прочитай описание, посмотри все фото\n4) Нажми 💬 «Написать» или 📞 «Позвонить» продавцу\n5) Договорись о встрече\n6) Встретьтесь лично и оплати наличными" },
  { keys: ["позвонить", "звонок", "номер телефона"], answer: "📞 На карточке товара есть зелёная кнопка «📞 Позвонить» с номером продавца. Нажми — телефон сразу наберёт номер." },
  { keys: ["оплата", "платеж", "карта", "оплатить", "перевод", "наличными"], answer: "💸 На IlmTech нет встроенной оплаты! Покупатель и продавец встречаются ЛИЧНО и платят наличными из рук в руки. Это безопасней всего." },
  { keys: ["доставка", "привезти", "курьер", "почта"], answer: "🚚 IlmTech — это место для встреч. Доставку и курьеров мы не предоставляем. Договоритесь с продавцом — он может либо подъехать сам, либо ты приедешь к нему." },
  { keys: ["торг", "торговаться", "скидка"], answer: "🤝 Торг — это нормально на маркетплейсе! Напиши продавцу в чат и предложи свою цену. Многие соглашаются скинуть 5-15%." },
  { keys: ["проверить товар", "осмотреть", "тест"], answer: "🔍 Обязательно осматривай товар при встрече! Включи телефон, проверь экран, аккумулятор. Не плати пока не убедился что всё работает." },
  { keys: ["вернуть", "возврат", "обмен"], answer: "↩️ На IlmTech нет возвратов от сайта — это сделка между людьми. Если товар не подошёл, договаривайся с продавцом сам. Поэтому проверяй всё ДО оплаты!" },

  // ═══════════════════════ ЧАТ ═══════════════════════
  { keys: ["написать", "сообщение", "чат", "переписка", "связаться", "мессенджер"], answer: "💬 На IlmTech есть встроенный чат! Возможности:\n• Текстовые сообщения\n• Голосовые 🎤\n• Стикеры 😀 (24 шт)\n• Удаление сообщений\n• Статус «в сети»\n• Доставка мгновенно через интернет\nНе нужны WhatsApp или Telegram!" },
  { keys: ["голосовое", "voice", "запись", "микрофон", "голосовое сообщение"], answer: "🎤 Чтобы записать голосовое: в чате, когда поле сообщения пустое, справа появится кнопка микрофона. Зажми её → говори → отпусти. Сообщение отправится." },
  { keys: ["стикер", "sticker", "эмодзи", "смайлик"], answer: "😀 В чате слева есть кнопка с улыбкой. Нажми её — откроется панель из 24 стикеров. Кликни любой — он сразу отправится собеседнику." },
  { keys: ["удалить сообщение", "стереть сообщение"], answer: "🗑️ Чтобы удалить своё сообщение:\n• На компьютере: наведи мышь — слева появится крестик ✕\n• На телефоне: зажми сообщение пальцем\nПодтверди — оно пропадёт у обоих." },
  { keys: ["удалить чат", "удалить переписку"], answer: "🗑️ Открой чат с собеседником, нажми на корзинку 🗑️ в правом верхнем углу. Подтверди — вся переписка удалится у вас обоих." },
  { keys: ["читал", "прочитано", "галочки", "две галочки"], answer: "✓✓ Когда собеседник прочитает твоё сообщение, появятся две галочки. Одна галочка = доставлено, не прочитано." },

  // ═══════════════════════ ID и ПОИСК ЛЮДЕЙ ═══════════════════════
  { keys: ["id", "айди", "найти человека", "идентификатор", "что за id", "ilm id"], answer: "🆔 У каждого пользователя свой уникальный ID вида ILM-XXXXX (например ILM-56SCN). Свой ID смотри в Профиле. Дай ID другу/брату — он сможет тебе написать с другого телефона." },
  { keys: ["как найти друга", "найти по id", "найти знакомого", "написать другу"], answer: "🔍 Чтобы найти человека: открой «Чаты», вверху поле «Найти по ID (ILM-XXXXX)». Введи ID того человека, нажми «Найти» — откроется чат с ним." },
  { keys: ["как меня найти", "мой id", "поделиться id"], answer: "📋 Открой Профиль — там твой ID (например ILM-ABC12) и кнопка «копир.». Скопируй и отправь другу — он сможет с тобой связаться." },

  // ═══════════════════════ В СЕТИ ═══════════════════════
  { keys: ["в сети", "онлайн", "офлайн", "статус", "зелёная точка", "не в сети"], answer: "🟢 Зелёная точка на аватаре = человек сейчас в сети (был активен меньше 2 минут назад).\n⚪ Без точки = офлайн. В чате видно когда человек был в последний раз («был 5 мин назад»)." },
  { keys: ["когда был", "когда заходил", "последний раз"], answer: "🕐 В чате под именем собеседника написано: «🟢 в сети» или «был N мин назад / N ч назад / N дн назад». Обновляется каждые 30 секунд." },

  // ═══════════════════════ ПРОФИЛЬ ═══════════════════════
  { keys: ["аватар", "аватарка", "фото профиля", "поменять аватар", "сменить фото"], answer: "🖼️ В Профиле нажми на свой аватар сверху → откроется выбор:\n• 15 классных смайликов (лиса, тигр, единорог, дракон и т.д.)\n• Или загрузи свою фотографию с компьютера\nВыбирай что нравится!" },
  { keys: ["загрузить фото", "своё фото", "моё фото"], answer: "📷 В Профиле нажми на аватар → внизу зелёная кнопка «📷 Загрузить фото». Выбери картинку с компьютера/телефона — она станет твоей аватаркой." },
  { keys: ["ник", "никнейм", "сменить имя", "поменять ник", "имя"], answer: "✏️ В Профиле нажми «Редактировать профиль» → появится поле с твоим ником → введи новый → нажми галочку ✓. Ник сменится у всех." },
  { keys: ["статистика", "сколько у меня", "мой профиль"], answer: "📊 В профиле видишь:\n• Количество твоих объявлений\n• Сколько у тебя избранного\n• Сколько просмотров всего у твоих товаров\n• Подписчики и подписки" },

  // ═══════════════════════ ПОДПИСКИ И ГАЛОЧКИ ═══════════════════════
  { keys: ["подписаться", "подписка", "как подписаться", "подписки"], answer: "➕ Чтобы подписаться: нажми на ник или аватар любого пользователя (в чате, в карточке товара, в комментариях). Откроется его профиль с кнопкой «➕ Подписаться»." },
  { keys: ["отписаться", "убрать подписку"], answer: "✓ Открой профиль человека → кнопка «✓ Вы подписаны» → нажми ещё раз → отписался." },
  { keys: ["мои подписчики", "кто подписан", "список подписчиков"], answer: "👥 В Профиле есть счётчик «Подписчики» — нажми на него, откроется список всех кто на тебя подписан. Так же с «Подписки» — увидишь на кого подписан ты." },
  { keys: ["галочка", "галочки", "верификация", "значок"], answer: "✓ Галочки даются за количество подписчиков:\n🖤 Чёрная — 1000+ подписчиков\n💚 Зелёная — 7000+\n💛 Жёлтая — 10000+\nГалочка появляется рядом с ником автоматически." },
  { keys: ["как получить галочку", "хочу галочку"], answer: "✓ Просто публикуй классные товары и помогай людям! Когда у тебя наберётся 1000 подписчиков — автоматически дадим чёрную галочку 🖤. 7000 — зелёную 💚. 10000 — жёлтую 💛." },

  // ═══════════════════════ ПОИСК И ФИЛЬТРЫ ═══════════════════════
  { keys: ["поиск", "найти товар", "искать", "как найти"], answer: "🔍 Раздел «Поиск» внизу. Возможности:\n• Поиск по названию (например «iPhone»)\n• Выбор категории\n• Цена ОТ и ДО\n• Сортировка: новые / дешёвые сначала / дорогие сначала" },
  { keys: ["сортировка", "по цене", "по дате"], answer: "🔢 На главной справа кнопка сортировки. Жми её — переключаются режимы:\n• Новые (по умолчанию)\n• Цена ↑ (дешёвые сначала)\n• Цена ↓ (дорогие сначала)" },
  { keys: ["избранное", "сохранить", "сердечко", "лайк", "favorites"], answer: "❤️ На любом товаре справа сверху есть сердечко 🤍. Нажми — товар добавится в Избранное. Открыть избранное: внизу кнопка ❤️ «Избр.»." },
  { keys: ["комментарии", "комменты", "написать комментарий"], answer: "💬 В карточке товара есть кнопка «Комментарии». Все могут писать публичные комментарии — продавец и покупатели общаются открыто." },

  // ═══════════════════════ ПРИЛОЖЕНИЕ ═══════════════════════
  { keys: ["приложение", "установить", "на телефон", "пва", "pwa", "значок", "иконка"], answer: "📱 IlmTech можно установить как приложение на телефон!\n1) Открой ilm-tech.vercel.app в Chrome\n2) Меню браузера (⋮) → «Установить приложение» или «На экран Домой»\n3) На рабочем столе появится иконка ilmTECH\n4) Тапаешь — открывается как настоящее приложение!" },
  { keys: ["chrome", "хром", "браузер", "samsung internet"], answer: "🌐 Лучше всего работает в Google Chrome. В Samsung Internet тоже работает, но кнопка установки называется «Добавить на гл. экран» — это то же самое." },
  { keys: ["офлайн", "без интернета", "интернет"], answer: "📶 IlmTech работает ТОЛЬКО с интернетом! Без интернета сообщения не дойдут, товары не загрузятся. Это нормально для маркетплейса." },
  { keys: ["обновить", "обновление", "новая версия"], answer: "🔄 Когда мы выпускаем обновление — оно автоматически приезжает к тебе. Если не видишь новые функции — нажми Ctrl+Shift+R (на компьютере) или закрой/открой приложение." },

  // ═══════════════════════ ЯЗЫКИ ═══════════════════════
  { keys: ["язык", "сменить язык", "поменять язык", "language", "забон"], answer: "🌐 В IlmTech 3 языка: Русский, Тоҷикӣ, English. Открой Профиль → пункт «🌐 Язык» → выбери язык. Весь интерфейс мгновенно переведётся." },
  { keys: ["таджикский", "точики", "tajik"], answer: "🇹🇯 Да, IlmTech полностью переведён на таджикский (Тоҷикӣ). Открой Профиль → 🌐 Язык → Тоҷикӣ." },
  { keys: ["английский", "english", "англ"], answer: "🇬🇧 Yes, IlmTech supports English. Profile → 🌐 Language → English." },

  // ═══════════════════════ БЕЗОПАСНОСТЬ И МОШЕННИКИ ═══════════════════════
  { keys: ["мошенник", "обман", "развод", "кидала", "обманули", "обманывает"], answer: "🛡️ Главные правила безопасности на IlmTech:\n1) Встречайся в людных местах ДНЁМ\n2) Не плати ВПЕРЁД\n3) Проверяй товар ДО оплаты\n4) Не отправляй деньги на карту незнакомцам\n5) Если что-то слишком хорошо чтобы быть правдой — это подвох\n6) Спрашивай дополнительные фото если сомневаешься" },
  { keys: ["слишком дешево", "очень дешево", "подозрительно"], answer: "⚠️ Если цена в 2-3 раза ниже рыночной — будь осторожен! Это может быть мошенник. Попроси видеозвонок чтобы убедиться что товар существует и продавец реален." },
  { keys: ["предоплата", "залог", "перевод вперед"], answer: "❌ НЕ ДЕЛАЙ предоплату незнакомцам! 99% случаев когда человек просит «залог» или «предоплату чтобы товар не забрали» — это мошенник. Плати ТОЛЬКО при встрече и осмотре товара." },
  { keys: ["пожаловаться", "жалоба", "репорт"], answer: "📢 Пока кнопки жалобы нет, но если встретил мошенника — напиши создателю IlmTech через профиль osimsadulloev8. Аккаунт заблокируем." },

  // ═══════════════════════ КОНТАКТЫ ═══════════════════════
  { keys: ["связаться с создателем", "связаться с админом", "автор сайта", "хозяин сайта"], answer: "👨‍💻 Создатель IlmTech — школьник Осимсаддуло. Его ник на сайте: osimsadulloev8. Найди его через поиск по ID или напрямую через ник в комментариях." },
  { keys: ["идея", "предложение", "функция", "что добавить"], answer: "💡 Есть идея для IlmTech? Напиши осими! Хорошие идеи попадут в следующее обновление. Главное чтобы было полезно всем пользователям." },
  { keys: ["баг", "ошибка", "глюк", "не работает", "сломалось"], answer: "🔧 Что-то не работает? Напиши создателю что именно и где. Чем подробнее — тем быстрее починим. Скриншот сильно поможет!" },

  // ═══════════════════════ ТЕХНИЧЕСКОЕ ═══════════════════════
  { keys: ["сервер", "база данных", "supabase", "технологии"], answer: "💻 IlmTech построен на React + TypeScript + Tailwind CSS, данные в облаке Supabase. Хостинг бесплатный — Vercel. Весь проект делает один школьник 🚀" },
  { keys: ["открытый код", "github", "исходный код"], answer: "🐙 Код IlmTech открытый, лежит на GitHub: github.com/osimsadulloev8-lgtm/IlmTech. Можешь посмотреть как всё работает изнутри!" },
  { keys: ["сколько пользователей", "сколько людей", "статистика сайта"], answer: "👥 Пока IlmTech только-только запустился. Расскажи друзьям и братьям — чем больше людей, тем интереснее всем! Поделись ссылкой ilm-tech.vercel.app" },

  // ═══════════════════════ ШУТКИ И РАЗНОЕ ═══════════════════════
  { keys: ["шутка", "анекдот", "пошути", "юмор"], answer: "😄 — Что сказал один товар на IlmTech другому? — «Не толкайся, тут на всех места хватит!» 🛒" },
  { keys: ["возраст", "сколько лет", "когда создан"], answer: "🤖 Мне нисколько — я программа. А IlmTech создан в 2026 году школьником из Душанбе." },
  { keys: ["работа", "вакансия", "ищу работу"], answer: "💼 На IlmTech есть категория «Работа» — там объявления о вакансиях! Открой Поиск → выбери категорию «Работа»." },
  { keys: ["квартира", "снять", "аренда", "недвижимость"], answer: "🏠 Открой категорию «Недвижимость» — там объявления о продаже и аренде квартир, домов, комнат." },
  { keys: ["машина", "авто", "тачка"], answer: "🚗 Категория «Авто» — там продают и покупают машины. Можно использовать фильтр по цене и городу." },
  { keys: ["айфон", "iphone", "телефон купить"], answer: "📱 Открой Поиск → введи «iPhone» → выбери категорию «Электроника». Найдёшь много объявлений с разных городов." },
];

const botReply = (raw: string): string => {
  const text = normalize(raw);
  if (!text) return "Напиши свой вопрос про IlmTech 🙂";
  for (const topic of BOT_TOPICS) {
    if (fuzzyHas(text, topic.keys)) return topic.answer;
  }
  return "Не совсем понял 🤔 Спроси по-другому. Я знаю про IlmTech всё: регистрация, продажа, покупка, чат, голосовые, стикеры, подписки, галочки, установка как приложение, безопасность и многое другое!";
};

const BOT_QUICK = ["Как продать?", "Как купить?", "Что такое IlmTech?", "Как установить как приложение?", "Как подписаться?", "Безопасность"];

/* ════════════════════════════════════════════════════════════════════════════
   ФОНОВАЯ МУЗЫКА — её играет САМ КОД (Web Audio API), а не файл из интернета.
   Поэтому у музыки НЕТ авторских прав (никто её не написал — её рисует код),
   и её можно спокойно публиковать в Google Play. Качать ничего не нужно.
   Браузеры запрещают музыке включаться саму до первого касания экрана —
   поэтому она стартует при первом тапе/клике. Кнопка 🔊/🔇 в шапке выключает её.
   ════════════════════════════════════════════════════════════════════════════ */
const Music = (() => {
  // Хип-хоп / лоу-фай бит: барабаны (бочка/снейр/хэт) + бас + мягкие аккорды.
  // Всё рисует код — без авторских прав, безопасно для Google Play.
  const STEP_MS = 168; // 16-я нота, темп ~89 BPM (хип-хоп «кивок головой»)

  // Прогрессия аккордов Am – F – C – G (по 1 такту = 16 шагов на аккорд).
  const ROOTS: number[] = [110.0, 87.31, 130.81, 98.0];
  const CHORDS: number[][] = [
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
    [261.63, 329.63, 392.0], // C
    [196.0, 246.94, 293.66], // G
  ];
  // Рисунок барабанов на 16 шагов (1 = удар):
  const KICK = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0];
  const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
  const HAT = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1];

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let timer: number | null = null;
  let step = 0;
  let on = false;

  const ensureCtx = (): boolean => {
    if (ctx && master) return true;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    // буфер белого шума для снейра и хэтов
    const len = Math.floor(ctx.sampleRate * 0.4);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return true;
  };

  const envGain = (g: GainNode, t0: number, peak: number, dur: number): void => {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  };

  const kick = (t0: number): void => {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(48, t0 + 0.12);
    envGain(g, t0, 1.0, 0.22);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + 0.26);
  };

  const drum = (t0: number, cut: number, peak: number, dur: number): void => {
    if (!ctx || !master || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = cut;
    const g = ctx.createGain();
    envGain(g, t0, peak, dur);
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.03);
  };

  const tone = (freq: number, t0: number, dur: number, type: OscillatorType, peak: number): void => {
    if (!ctx || !master || freq <= 0) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  };

  const tick = (): void => {
    if (!on || !ctx || !master) return;
    const t0 = ctx.currentTime + 0.02;
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    if (KICK[s]) { kick(t0); tone(ROOTS[bar], t0, 0.26, "triangle", 0.5); } // бас вместе с бочкой
    if (SNARE[s]) drum(t0, 1200, 0.5, 0.18);  // снейр
    if (HAT[s]) drum(t0, 7000, 0.22, 0.05);   // хэт
    if (s === 0) { for (const f of CHORDS[bar]) tone(f, t0, 1.4, "sine", 0.12); } // мягкий аккорд
    step += 1;
  };

  return {
    start(): void {
      if (!ensureCtx() || !ctx || !master) return;
      if (ctx.state === "suspended") void ctx.resume();
      on = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.6);
      if (timer === null) timer = window.setInterval(tick, STEP_MS);
    },
    stop(): void {
      on = false;
      if (ctx && master) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
      }
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    },
  };
})();

/* ════════════════════════════════════════════════════════════════════════════
   ТЁМНАЯ ТЕМА (ночной режим). Эти правила срабатывают ТОЛЬКО когда на странице
   стоит класс .ilm-night. В светлом режиме ничего не меняется — полностью безопасно.
   ════════════════════════════════════════════════════════════════════════════ */
const NIGHT_CSS = `
html.ilm-night body { background:#0f172a; }
html.ilm-night .ilm-app-root { background-image:none !important; background-color:#0f172a !important; }
html.ilm-night .bg-white { background-color:#1e293b !important; }
html.ilm-night .bg-white\\/90 { background-color:rgba(30,41,59,0.92) !important; }
html.ilm-night .bg-white\\/95 { background-color:rgba(30,41,59,0.96) !important; }
html.ilm-night .bg-gray-100 { background-color:#334155 !important; }
html.ilm-night .bg-gray-200 { background-color:#475569 !important; }
html.ilm-night .bg-emerald-50 { background-color:rgba(16,185,129,0.15) !important; }
html.ilm-night .bg-orange-50 { background-color:rgba(249,115,22,0.15) !important; }
html.ilm-night .bg-red-50 { background-color:rgba(239,68,68,0.15) !important; }
html.ilm-night .text-gray-900 { color:#f1f5f9 !important; }
html.ilm-night .text-gray-700 { color:#e2e8f0 !important; }
html.ilm-night .text-gray-500 { color:#94a3b8 !important; }
html.ilm-night .text-gray-400 { color:#64748b !important; }
html.ilm-night .text-emerald-700 { color:#6ee7b7 !important; }
html.ilm-night .text-orange-800 { color:#fdba74 !important; }
html.ilm-night .border-gray-200 { border-color:#334155 !important; }
html.ilm-night .border-gray-300 { border-color:#475569 !important; }
html.ilm-night .border-emerald-100 { border-color:#334155 !important; }
html.ilm-night .border-emerald-200 { border-color:#2a4a42 !important; }
html.ilm-night .border-emerald-300 { border-color:#2a4a42 !important; }
html.ilm-night input, html.ilm-night textarea, html.ilm-night select { color:#f1f5f9 !important; }
html.ilm-night input::placeholder, html.ilm-night textarea::placeholder { color:#94a3b8 !important; }
`;

/* ════════════════════════════════════════════════════════════════════════════
   РАЗДЕЛ 8. ГЛАВНЫЙ КОМПОНЕНТ
   ════════════════════════════════════════════════════════════════════════════ */

export default function App() {
  /* ---- основные данные (приходят с сервера) ---- */
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null); // чей профиль смотрим
  const [followsListView, setFollowsListView] = useState<{ userId: string; mode: "followers" | "following" } | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [knownIds, setKnownIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [connected, setConnected] = useState(false);

  /* ---- авторизация ---- */
  const [authView, setAuthView] = useState<AuthView>("welcome");
  const [authStep, setAuthStep] = useState(1);
  const [authEmail, setAuthEmail] = useState("");
  const [authNick, setAuthNick] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authPass2, setAuthPass2] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [loginNick, setLoginNick] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [authCode, setAuthCode] = useState(""); // код подтверждения с почты

  /* ---- навигация ---- */
  const [screen, setScreen] = useState<Screen>("home");

  /* ---- лента ---- */
  const [category, setCategory] = useState("Все");
  const [sortMode, setSortMode] = useState<SortMode>("new");
  const [query, setQuery] = useState("");
  const [searchCat, setSearchCat] = useState("Все");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");

  /* ---- товар ---- */
  const [openProduct, setOpenProduct] = useState<Product | null>(null);
  const [commentText, setCommentText] = useState("");

  /* ---- новое объявление ---- */
  const [npTitle, setNpTitle] = useState("");
  const [npPrice, setNpPrice] = useState("");
  const [npCat, setNpCat] = useState("Электроника");
  const [npCity, setNpCity] = useState("Душанбе");
  const [npDesc, setNpDesc] = useState("");
  const [npPhone, setNpPhone] = useState("");
  const [npImages, setNpImages] = useState<string[]>([]);
  const [npCond, setNpCond] = useState<"new" | "used">("used"); // по умолчанию Б/У
  const [condFilter, setCondFilter] = useState<"all" | "used" | "new">("all"); // фильтр на главной
  const [theme, setTheme] = useState<"light" | "night">(() => (local.get<string>("ilm_theme", "light") === "night" ? "night" : "light"));

  /* ---- профиль ---- */
  const [editingNick, setEditingNick] = useState(false);
  const [newNick, setNewNick] = useState("");
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [allCatsOpen, setAllCatsOpen] = useState(false);
  const [lang, setLang] = useState<Lang>(() => (local.get<Lang>("ilm_lang", "ru") || "ru"));
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const t = TRANSLATIONS[lang];
  const setLangAndSave = (l: Lang) => { setLang(l); local.set("ilm_lang", l); };

  /* ---- фоновая музыка (её рисует код — без авторских прав, можно в Google Play) ---- */
  const [musicOn, setMusicOn] = useState(true);
  const musicStartedRef = useRef(false);
  useEffect(() => {
    // Браузер не даёт включить музыку до первого касания — ждём первый тап/клик.
    const kick = () => {
      if (musicStartedRef.current) return;
      musicStartedRef.current = true;
      if (musicOn) Music.start();
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, [musicOn]);
  const toggleMusic = () => {
    if (musicOn) { Music.stop(); setMusicOn(false); }
    else { musicStartedRef.current = true; Music.start(); setMusicOn(true); }
  };

  /* ---- тёмная тема (ночной режим) ---- */
  useEffect(() => {
    // вставляем стили тёмной темы один раз
    const el = document.createElement("style");
    el.textContent = NIGHT_CSS;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("ilm-night", theme === "night");
    local.set("ilm_theme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme((p) => (p === "night" ? "light" : "night"));

  /* ---- чат ---- */
  const [chatPartnerId, setChatPartnerId] = useState<string | null>(null);
  const [msgInput, setMsgInput] = useState("");
  const [findId, setFindId] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  /* ---- бот ---- */
  const [botOpen, setBotOpen] = useState(false);
  const [botMsgs, setBotMsgs] = useState<BotMsg[]>([
    { from: "bot", text: "Привет! Я IlmBot 🤖\nЗнаю про IlmTech, математику 🧮, Таджикистан 🇹🇯, страны мира 🌍, природу 🌳, школу 📚, спорт ⚽ и многое другое. Спрашивай!", ts: Date.now() },
  ]);
  const [botInput, setBotInput] = useState("");
  const botEndRef = useRef<HTMLDivElement | null>(null);

  /* ---- уведомления ---- */
  const showToast = useCallback((msg: string, type: Toast["type"] = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  /* ════════════════════════════════════════════════════════════════════════
     ИНИЦИАЛИЗАЦИЯ + REALTIME
  ════════════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    (async () => {
      try {
        const [u, p, m, f] = await Promise.all([apiLoadUsers(), apiLoadProducts(), apiLoadMessages(), apiLoadFollows()]);
        setProducts(p);
        setMessages(m);
        setFollows(f);
        setConnected(true);

        let usersList = u;

        // ── Возврат после входа через Google? ──
        const googlePending = sessionStorage.getItem("ilm_google_pending");
        if (googlePending) {
          sessionStorage.removeItem("ilm_google_pending");
          try {
            const { data } = await supabase.auth.getSession();
            const gEmail = (data.session?.user?.email || "").trim();
            const gName = ((data.session?.user?.user_metadata?.name as string) || gEmail.split("@")[0] || "user");
            if (gEmail) {
              let acc = usersList.find((x) => (x.email || "").toLowerCase() === gEmail.toLowerCase());
              if (!acc) {
                const nu: User = {
                  id: makeUserId(usersList),
                  email: gEmail,
                  nickname: makeUniqueNick(gName, usersList),
                  password: uid(),
                  role: "seller",
                  avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
                  avatarIsPhoto: false,
                  createdAt: Date.now(),
                  lastSeen: Date.now(),
                };
                const res = await apiInsertUser(nu);
                if (res.ok) { usersList = [...usersList, nu]; acc = nu; }
              }
              if (acc) {
                setCurrentUser(acc);
                session.set(acc.id);
                const known = local.get<string[]>(LS.KNOWN, []);
                if (!known.includes(acc.id)) local.set(LS.KNOWN, [...known, acc.id]);
                setFavorites(local.get<string[]>(LS.FAVS + "_" + acc.id, []));
                showToast(`Вошли как ${acc.nickname} ✅`, "ok");
              }
            }
          } catch (ge) { console.error("google-return", ge); }
          try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ }
        } else {
          // ── обычное восстановление сессии ──
          const sid = session.get();
          if (sid) {
            const found = usersList.find((x) => x.id === sid);
            if (found) {
              setCurrentUser(found);
              setFavorites(local.get<string[]>(LS.FAVS + "_" + found.id, []));
            }
          }
        }

        setUsers(usersList);
        setKnownIds(local.get<string[]>(LS.KNOWN, []));
      } catch (e) {
        console.error("init", e);
        showToast("Не удалось подключиться к серверу", "err");
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  /* подписка на изменения в Supabase (realtime) */
  useEffect(() => {
    const channels: RealtimeChannel[] = [];

    channels.push(
      supabase.channel("rt-users").on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ilm_users" },
        async () => setUsers(await apiLoadUsers())
      ).subscribe()
    );

    channels.push(
      supabase.channel("rt-products").on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ilm_products" },
        async () => setProducts(await apiLoadProducts())
      ).subscribe()
    );

    channels.push(
      supabase.channel("rt-messages").on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ilm_messages" },
        (payload) => {
          const r = payload.new as Record<string, unknown>;
          const m: Message = {
            id: r.id as string,
            conversationId: r.conversation_id as string,
            fromId: r.from_id as string,
            toId: r.to_id as string,
            kind: r.kind as Message["kind"],
            text: (r.text as string) || undefined,
            audio: (r.audio as string) || undefined,
            ts: Number(r.ts),
            read: !!r.read,
          };
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
        }
      ).on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ilm_messages" },
        (payload) => {
          const r = payload.new as Record<string, unknown>;
          setMessages((prev) => prev.map((x) => x.id === r.id ? { ...x, read: !!r.read } : x));
        }
      ).on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "ilm_messages" },
        (payload) => {
          const r = payload.old as Record<string, unknown>;
          const deletedId = r.id as string;
          if (deletedId) setMessages((prev) => prev.filter((x) => x.id !== deletedId));
        }
      ).subscribe()
    );

    channels.push(
      supabase.channel("rt-follows").on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ilm_follows" },
        async () => setFollows(await apiLoadFollows())
      ).subscribe()
    );

    return () => { channels.forEach((c) => { supabase.removeChannel(c); }); };
  }, []);

  /* уведомление о новых сообщениях */
  const lastNotifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUser) return;
    const incoming = messages.filter((m) => m.toId === currentUser.id && m.fromId !== currentUser.id);
    if (incoming.length === 0) return;
    const newest = incoming[incoming.length - 1];
    if (lastNotifiedRef.current === newest.id) return;
    if (chatPartnerId === newest.fromId) { lastNotifiedRef.current = newest.id; return; }
    if (!newest.read) {
      const from = users.find((u) => u.id === newest.fromId);
      showToast(`🔔 Сообщение от ${from ? from.nickname : "пользователя"}`, "info");
    }
    lastNotifiedRef.current = newest.id;
  }, [messages, currentUser, chatPartnerId, users, showToast]);

  /* пометка прочитанным пока открыт чат */
  useEffect(() => {
    if (!currentUser || !chatPartnerId) return;
    const hasUnread = messages.some((m) => m.fromId === chatPartnerId && m.toId === currentUser.id && !m.read);
    if (hasUnread) {
      apiMarkRead(chatPartnerId, currentUser.id);
      setMessages((prev) => prev.map((m) =>
        m.fromId === chatPartnerId && m.toId === currentUser.id ? { ...m, read: true } : m
      ));
    }
  }, [messages, chatPartnerId, currentUser]);

  /* автоскролл */
  /* автоскролл вниз: мгновенно при открытии чата, плавно при новых сообщениях */
  useEffect(() => {
    // при открытии чата прыгаем в самый низ мгновенно
    if (chatPartnerId && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [chatPartnerId]);
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);
  useEffect(() => {
    if (botEndRef.current) {
      botEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [botMsgs, botOpen]);

  /* ════════════════ HEARTBEAT — обновляю «время последней активности» каждые 30 сек ════════════════ */
  useEffect(() => {
    if (!currentUser) return;
    // первый раз — сразу
    apiTouchLastSeen(currentUser.id);
    // дальше — каждые 30 секунд
    const interval = setInterval(() => apiTouchLastSeen(currentUser.id), 30_000);
    return () => clearInterval(interval);
  }, [currentUser]);

  /* ════════════════ Периодически перезагружаю список юзеров чтобы видеть кто в сети ════════════════ */
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(async () => {
      const fresh = await apiLoadUsers();
      setUsers(fresh);
    }, 30_000);
    return () => clearInterval(interval);
  }, [currentUser]);

  /* ════════════════════════════════════════════════════════════════════════
     АВТОРИЗАЦИЯ
  ════════════════════════════════════════════════════════════════════════ */
  const rememberAccount = (id: string) => {
    const known = local.get<string[]>(LS.KNOWN, []);
    if (!known.includes(id)) {
      const next = [...known, id];
      local.set(LS.KNOWN, next);
      setKnownIds(next);
    }
  };

  /* ── РЕГИСТРАЦИЯ ШАГ 1: проверяем данные и отправляем КОД на почту ── */
  const startRegister = async () => {
    if (authBusy) return;
    if (!isEmail(authEmail)) { setAuthErr("Введите корректную почту, например name@mail.com"); return; }
    if (authNick.trim().length < 2) { setAuthErr("Никнейм: минимум 2 символа"); return; }
    if (authPass.length < 4) { setAuthErr("Пароль: минимум 4 символа"); return; }
    if (authPass !== authPass2) { setAuthErr("Пароли не совпадают"); return; }
    setAuthErr("");
    setAuthBusy(true);
    try {
      const fresh = await apiLoadUsers();
      setUsers(fresh);
      if (fresh.some((u) => (u.email || "").toLowerCase() === authEmail.trim().toLowerCase())) {
        setAuthErr("Этот email уже зарегистрирован! Войди вместо регистрации."); return;
      }
      if (isCreator(authNick)) {
        setAuthErr("Этот никнейм зарезервирован для создателя 👑"); return;
      }
      if (fresh.some((u) => (u.nickname || "").toLowerCase() === authNick.trim().toLowerCase())) {
        setAuthErr("Этот никнейм уже занят!"); return;
      }
      // Просим Supabase прислать код на почту
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) { setAuthErr("Не удалось отправить код: " + error.message); return; }
      setAuthCode("");
      setAuthView("verify");
      showToast(`Код отправлен на ${authEmail.trim()} 📧`, "ok");
    } catch (e) {
      console.error("startRegister", e);
      setAuthErr("Ошибка сети. Попробуй ещё раз.");
    } finally {
      setAuthBusy(false);
    }
  };

  /* ── РЕГИСТРАЦИЯ ШАГ 2: проверяем КОД и создаём аккаунт ── */
  const confirmRegisterCode = async () => {
    if (authBusy) return;
    const code = authCode.trim();
    if (code.length < 4) { setAuthErr("Введите код из письма"); return; }
    setAuthErr("");
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: authEmail.trim(),
        token: code,
        type: "email",
      });
      if (error) { setAuthErr("Неверный или просроченный код. Проверь письмо."); return; }

      // Почта подтверждена — создаём аккаунт в нашей базе
      const fresh = await apiLoadUsers();
      if (fresh.some((u) => (u.nickname || "").toLowerCase() === authNick.trim().toLowerCase())) {
        setAuthErr("Никнейм только что заняли. Вернись и выбери другой."); return;
      }
      const nu: User = {
        id: makeUserId(fresh),
        email: authEmail.trim(),
        nickname: authNick.trim(),
        password: authPass,
        role: "seller",
        avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
        avatarIsPhoto: false,
        createdAt: Date.now(),
        lastSeen: Date.now(),
      };
      const res = await apiInsertUser(nu);
      if (!res.ok) { setAuthErr("Ошибка сервера: " + (res.err || "")); return; }
      try { await supabase.auth.signOut(); } catch { /* временная сессия больше не нужна */ }
      setUsers([...fresh, nu]);
      setCurrentUser(nu);
      session.set(nu.id);
      rememberAccount(nu.id);
      setFavorites([]);
      setAuthView("welcome"); setAuthStep(1);
      setAuthEmail(""); setAuthNick(""); setAuthPass(""); setAuthPass2(""); setAuthCode("");
      setScreen("home");
      showToast(`✅ Почта подтверждена! Твой ID: ${nu.id}`, "ok");
    } catch (e) {
      console.error("confirmRegisterCode", e);
      setAuthErr("Ошибка. Попробуй ещё раз.");
    } finally {
      setAuthBusy(false);
    }
  };

  /* ── Отправить код заново ── */
  const resendCode = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) { setAuthErr("Не удалось отправить: " + error.message); return; }
      showToast("Код отправлен заново 📧", "ok");
    } catch (e) {
      console.error("resendCode", e);
      setAuthErr("Ошибка сети.");
    } finally {
      setAuthBusy(false);
    }
  };

  /* ── Вход через Google ── */
  const signInWithGoogle = async () => {
    try {
      sessionStorage.setItem("ilm_google_pending", "1");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        sessionStorage.removeItem("ilm_google_pending");
        showToast("Вход через Google пока не настроен", "err");
        console.error("google", error);
      }
    } catch (e) {
      sessionStorage.removeItem("ilm_google_pending");
      showToast("Вход через Google пока не настроен", "err");
      console.error("google", e);
    }
  };

  const doLogin = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      const fresh = await apiLoadUsers();
      const found = fresh.find((u) => (u.nickname || "").toLowerCase() === loginNick.trim().toLowerCase() && u.password === loginPass);
      if (!found) { setAuthErr("Неверный ник или пароль"); return; }
      setUsers(fresh);
      setCurrentUser(found);
      session.set(found.id);
      rememberAccount(found.id);
      setFavorites(local.get<string[]>(LS.FAVS + "_" + found.id, []));
      setAuthErr("");
      setLoginNick(""); setLoginPass("");
      setScreen("home");
      showToast(`С возвращением, ${found.nickname}!`, "ok");
    } finally {
      setAuthBusy(false);
    }
  };

  const switchTo = (id: string) => {
    const found = users.find((u) => u.id === id);
    if (!found) { showToast("Аккаунт не найден", "err"); return; }
    setCurrentUser(found);
    session.set(found.id);
    setFavorites(local.get<string[]>(LS.FAVS + "_" + found.id, []));
    setScreen("home");
    setChatPartnerId(null);
    showToast(`Вошли как ${found.nickname}`, "ok");
  };

  const logout = () => {
    session.clear();
    setCurrentUser(null);
    setAuthView("welcome");
    setScreen("home");
    setChatPartnerId(null);
  };

  /* ── Удалить свой аккаунт навсегда ── */
  const deleteMyAccount = async () => {
    if (!currentUser) return;
    if (!window.confirm("Удалить аккаунт навсегда? Все твои объявления тоже удалятся. Это нельзя отменить!")) return;
    if (!window.confirm("Точно-точно? Назад дороги нет 😢")) return;
    const myId = currentUser.id;
    try {
      // удаляем все объявления пользователя
      for (const p of products.filter((x) => x.sellerId === myId)) {
        try { await apiDeleteProduct(p.id); } catch { /* пропускаем ошибку одного товара */ }
      }
      // удаляем подписки и сообщения, связанные с пользователем
      try { await supabase.from("ilm_follows").delete().eq("follower_id", myId); } catch { /* ignore */ }
      try { await supabase.from("ilm_follows").delete().eq("following_id", myId); } catch { /* ignore */ }
      try { await supabase.from("ilm_messages").delete().eq("from_id", myId); } catch { /* ignore */ }
      try { await supabase.from("ilm_messages").delete().eq("to_id", myId); } catch { /* ignore */ }
      // удаляем самого пользователя
      await supabase.from("ilm_users").delete().eq("id", myId);
      // чистим локальные данные
      const known = local.get<string[]>(LS.KNOWN, []).filter((x) => x !== myId);
      local.set(LS.KNOWN, known);
      setKnownIds(known);
      local.set(LS.FAVS + "_" + myId, []);
      setProducts((prev) => prev.filter((x) => x.sellerId !== myId));
      setUsers((prev) => prev.filter((x) => x.id !== myId));
      showToast("Аккаунт удалён 👋", "ok");
      logout();
    } catch (e) {
      console.error("deleteMyAccount", e);
      showToast("Не удалось удалить аккаунт. Попробуй ещё раз.", "err");
    }
  };

  const knownAccounts = useMemo(
    () => knownIds.map((id) => users.find((u) => u.id === id)).filter((x): x is User => !!x),
    [knownIds, users]
  );

  /* ════════════════════════════════════════════════════════════════════════
     ИЗБРАННОЕ
  ════════════════════════════════════════════════════════════════════════ */
  const toggleFav = (id: string) => {
    if (!currentUser) return;
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
    setFavorites(next);
    local.set(LS.FAVS + "_" + currentUser.id, next);
  };

  /* ════════════════════════════════════════════════════════════════════════
     ФОТО (товар + аватар)
  ════════════════════════════════════════════════════════════════════════ */
  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const slots = 4 - npImages.length;
    files.slice(0, slots).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setNpImages((prev) => (prev.length < 4 ? [...prev, reader.result as string] : prev));
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleAvatarPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files || [])[0];
    if (!file || !currentUser) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      if (dataUrl.length > 400_000) { showToast("Фото слишком большое, выбери поменьше", "err"); return; }
      const updated = { ...currentUser, avatar: dataUrl, avatarIsPhoto: true };
      await apiUpdateUser(updated);
      setCurrentUser(updated);
      setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      setAvatarPicker(false);
      showToast("Фото профиля обновлено 🖼️", "ok");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  /* ════════════════════════════════════════════════════════════════════════
     ТОВАРЫ
  ════════════════════════════════════════════════════════════════════════ */
  const publishProduct = async () => {
    if (!currentUser) return;
    if (!npTitle.trim()) { showToast("Введите название", "err"); return; }
    const priceNum = parseInt(npPrice, 10);
    if (!priceNum || priceNum <= 0) { showToast("Введите корректную цену", "err"); return; }
    if (!npPhone.trim()) { showToast("Введите номер телефона", "err"); return; }
    const np: Product = {
      id: uid(),
      title: npTitle.trim(),
      price: priceNum,
      category: npCat,
      city: npCity,
      images: npImages,
      phone: npPhone.trim(),
      description: npDesc.trim(),
      sellerId: currentUser.id,
      sellerName: currentUser.nickname,
      sellerAvatar: currentUser.avatar,
      sellerIsPhoto: currentUser.avatarIsPhoto,
      views: 0,
      createdAt: Date.now(),
      badge: null,
      comments: [],
      condition: npCond,
    };
    await apiInsertProduct(np);
    setProducts((prev) => [np, ...prev]);
    setNpTitle(""); setNpPrice(""); setNpDesc(""); setNpPhone(""); setNpImages([]);
    setNpCat("Электроника"); setNpCity("Душанбе"); setNpCond("used");
    setScreen("home");
    showToast("Объявление опубликовано! ⚡", "ok");
  };

  const openCard = async (p: Product) => {
    const updatedProduct = { ...p, views: p.views + 1 };
    setOpenProduct(updatedProduct);
    setProducts((prev) => prev.map((x) => x.id === p.id ? updatedProduct : x));
    apiUpdateProduct(updatedProduct);
  };

  const addComment = async () => {
    if (!currentUser || !openProduct || !commentText.trim()) return;
    const c: Comment = {
      id: uid(),
      authorId: currentUser.id,
      authorName: currentUser.nickname,
      authorAvatar: currentUser.avatar,
      authorIsPhoto: currentUser.avatarIsPhoto,
      text: commentText.trim(),
      ts: Date.now(),
    };
    const updated = { ...openProduct, comments: [...openProduct.comments, c] };
    setOpenProduct(updated);
    setProducts((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    await apiUpdateProduct(updated);
    setCommentText("");
  };

  /* ════════════════════════════════════════════════════════════════════════
     ЧАТ
  ════════════════════════════════════════════════════════════════════════ */
  const openChatWith = (partnerId: string) => {
    if (!currentUser) return;
    if (partnerId === currentUser.id) { showToast("Нельзя написать самому себе 🙂", "err"); return; }
    setChatPartnerId(partnerId);
    setScreen("messages");
    setOpenProduct(null);
  };

  const pushMessage = async (partial: Omit<Message, "id" | "conversationId" | "fromId" | "toId" | "ts" | "read">) => {
    if (!currentUser || !chatPartnerId) return;
    const m: Message = {
      id: uid(),
      conversationId: convId(currentUser.id, chatPartnerId),
      fromId: currentUser.id,
      toId: chatPartnerId,
      ts: Date.now(),
      read: false,
      ...partial,
    };
    // оптимистично добавим локально (а realtime подтвердит)
    setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
    await apiInsertMessage(m);
  };

  const sendText = () => { if (msgInput.trim()) { pushMessage({ kind: "text", text: msgInput.trim() }); setMsgInput(""); } };
  const sendSticker = (emoji: string) => pushMessage({ kind: "sticker", text: emoji });
  const sendVoice = (b64: string) => {
    if (b64.length > 400_000) { showToast("Голосовое слишком длинное (макс ~20 сек)", "err"); return; }
    pushMessage({ kind: "voice", audio: b64 });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => sendVoice(reader.result as string);
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecRef.current = mr;
      setIsRecording(true);
    } catch {
      showToast("Нет доступа к микрофону 🎤", "err");
    }
  };

  const stopRecording = () => {
    if (mediaRecRef.current && isRecording) { mediaRecRef.current.stop(); setIsRecording(false); }
  };

  const findUserById = () => {
    const id = findId.trim().toUpperCase();
    if (!id) return;
    const found = users.find((u) => u.id.toUpperCase() === id);
    if (!found) { showToast("Пользователь с таким ID не найден", "err"); return; }
    if (found.id === currentUser?.id) { showToast("Это ваш собственный ID 🙂", "err"); return; }
    setFindId("");
    openChatWith(found.id);
  };

  /** Удалить всю переписку с собеседником */
  const deleteChat = async (partnerId: string) => {
    if (!currentUser) return;
    if (!window.confirm(t.confirmDeleteChat)) return;
    await apiDeleteConversation(currentUser.id, partnerId);
    setMessages((prev) => prev.filter((m) =>
      !((m.fromId === currentUser.id && m.toId === partnerId) ||
        (m.fromId === partnerId && m.toId === currentUser.id))
    ));
    setChatPartnerId(null);
    showToast("Переписка удалена", "ok");
  };

  /** Удалить одно сообщение (только своё) */
  const deleteMessage = async (messageId: string) => {
    if (!currentUser) return;
    const m = messages.find((x) => x.id === messageId);
    if (!m) return;
    if (m.fromId !== currentUser.id) { showToast("Можно удалять только свои сообщения", "err"); return; }
    if (!window.confirm(t.confirmDeleteMsg)) return;
    await apiDeleteMessage(messageId);
    setMessages((prev) => prev.filter((x) => x.id !== messageId));
    showToast("Сообщение удалено", "ok");
  };

  /** Удалить своё объявление */
  const deleteProduct = async (productId: string) => {
    if (!currentUser) return;
    const product = products.find((x) => x.id === productId);
    if (!product) return;
    if (product.sellerId !== currentUser.id) { showToast("Можно удалять только свои объявления", "err"); return; }
    if (!window.confirm("Удалить это объявление? Это нельзя отменить.")) return;
    await apiDeleteProduct(productId);
    setProducts((prev) => prev.filter((x) => x.id !== productId));
    setOpenProduct(null);
    showToast("Объявление удалено", "ok");
  };

  /* ════════════════════════════════════════════════════════════════════════
     ПОДПИСКИ
  ════════════════════════════════════════════════════════════════════════ */
  /** Я подписан на этого пользователя? */
  const amIFollowing = (targetId: string): boolean => {
    if (!currentUser) return false;
    return follows.some((f) => f.followerId === currentUser.id && f.followingId === targetId);
  };

  /** Сколько подписчиков у пользователя */
  const followersCount = (userId: string): number =>
    follows.filter((f) => f.followingId === userId).length;

  /** На скольких подписан пользователь */
  const followingCount = (userId: string): number =>
    follows.filter((f) => f.followerId === userId).length;

  /** Подписаться / отписаться */
  const toggleFollow = async (targetId: string) => {
    if (!currentUser) return;
    if (targetId === currentUser.id) { showToast("Нельзя подписаться на самого себя 🙂", "err"); return; }
    if (amIFollowing(targetId)) {
      // оптимистично убираем локально
      setFollows((prev) => prev.filter((f) => !(f.followerId === currentUser.id && f.followingId === targetId)));
      await apiUnfollow(currentUser.id, targetId);
      showToast("Вы отписались", "info");
    } else {
      const newFollow: Follow = { followerId: currentUser.id, followingId: targetId, ts: Date.now() };
      setFollows((prev) => [...prev, newFollow]);
      await apiFollow(currentUser.id, targetId);
      const target = users.find((u) => u.id === targetId);
      showToast(`Вы подписались на ${target ? target.nickname : "пользователя"} ✓`, "ok");
    }
  };


  /* ════════════════════════════════════════════════════════════════════════
     ПОДСЧЁТЫ
  ════════════════════════════════════════════════════════════════════════ */
  const conversations = useMemo(() => {
    if (!currentUser) return [] as { partner: User; last: Message; unread: number }[];
    const map = new Map<string, Message[]>();
    messages.forEach((m) => {
      if (m.fromId === currentUser.id || m.toId === currentUser.id) {
        const pid = m.fromId === currentUser.id ? m.toId : m.fromId;
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid)!.push(m);
      }
    });
    const list: { partner: User; last: Message; unread: number }[] = [];
    map.forEach((msgs, pid) => {
      const partner = users.find((u) => u.id === pid);
      if (!partner) return;
      const sorted = [...msgs].sort((a, b) => a.ts - b.ts);
      const unread = msgs.filter((m) => m.toId === currentUser.id && !m.read).length;
      list.push({ partner, last: sorted[sorted.length - 1], unread });
    });
    return list.sort((a, b) => b.last.ts - a.last.ts);
  }, [messages, users, currentUser]);

  const totalUnread = useMemo(
    () => (currentUser ? messages.filter((m) => m.toId === currentUser.id && !m.read).length : 0),
    [messages, currentUser]
  );

  const activeThread = useMemo(() => {
    if (!currentUser || !chatPartnerId) return [] as Message[];
    const cid = convId(currentUser.id, chatPartnerId);
    return messages.filter((m) => m.conversationId === cid).sort((a, b) => a.ts - b.ts);
  }, [messages, currentUser, chatPartnerId]);

  /* ════════════════════════════════════════════════════════════════════════
     БОТ
  ════════════════════════════════════════════════════════════════════════ */
  const sendBot = (textArg?: string) => {
    const text = (textArg ?? botInput).trim();
    if (!text) return;
    setBotMsgs((prev) => [...prev, { from: "user", text, ts: Date.now() }]);
    setBotInput("");
    setTimeout(() => setBotMsgs((prev) => [...prev, { from: "bot", text: botReply(text), ts: Date.now() }]), 350);
  };

  /* ════════════════════════════════════════════════════════════════════════
     ПРОФИЛЬ
  ════════════════════════════════════════════════════════════════════════ */
  const saveNick = async () => {
    if (!currentUser) return;
    const nn = newNick.trim();
    if (nn.length < 2) { showToast("Минимум 2 символа", "err"); return; }
    if (isCreator(nn) && !isCreator(currentUser.nickname)) { showToast("Этот ник зарезервирован 👑", "err"); return; }
    if (users.some((u) => u.id !== currentUser.id && (u.nickname || "").toLowerCase() === nn.toLowerCase())) {
      showToast("Этот ник занят", "err"); return;
    }
    const updated = { ...currentUser, nickname: nn };
    await apiUpdateUser(updated);
    setCurrentUser(updated);
    setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    setEditingNick(false);
    showToast("Ник изменён", "ok");
  };

  const changeAvatar = async (a: string) => {
    if (!currentUser) return;
    const updated = { ...currentUser, avatar: a, avatarIsPhoto: false };
    await apiUpdateUser(updated);
    setCurrentUser(updated);
    setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    setAvatarPicker(false);
    showToast("Аватар обновлён", "ok");
  };

  /* ════════════════════════════════════════════════════════════════════════
     ФИЛЬТРАЦИЯ
  ════════════════════════════════════════════════════════════════════════ */
  const homeProducts = useMemo(() => {
    let list = category === "Все" ? [...products] : products.filter((p) => p.category === category);
    if (condFilter === "used") list = list.filter((p) => (p.condition || "used") === "used");
    else if (condFilter === "new") list = list.filter((p) => p.condition === "new");
    if (sortMode === "asc") list.sort((a, b) => a.price - b.price);
    else if (sortMode === "desc") list.sort((a, b) => b.price - a.price);
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [products, category, sortMode, condFilter]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = parseInt(priceFrom, 10);
    const to = parseInt(priceTo, 10);
    return products.filter((p) => {
      if (q && !(p.title || "").toLowerCase().includes(q) && !(p.description || "").toLowerCase().includes(q)) return false;
      if (searchCat !== "Все" && p.category !== searchCat) return false;
      if (!isNaN(from) && p.price < from) return false;
      if (!isNaN(to) && p.price > to) return false;
      return true;
    });
  }, [products, query, searchCat, priceFrom, priceTo]);

  const favProducts = useMemo(() => products.filter((p) => favorites.includes(p.id)), [products, favorites]);
  const myProducts = useMemo(() => (currentUser ? products.filter((p) => p.sellerId === currentUser.id) : []), [products, currentUser]);

  /* ════════════════════════════════════════════════════════════════════════
     ЭКРАН ЗАГРУЗКИ
  ════════════════════════════════════════════════════════════════════════ */
  if (loading) {
    return (
      <div className="w-full h-screen bg-white text-gray-900 flex flex-col items-center justify-center gap-4">
        <div className="text-6xl animate-pulse">⚡</div>
        <p className="text-emerald-600 font-bold">Подключение к серверу IlmTech...</p>
        <p className="text-gray-400 text-xs">Если долго — проверь интернет</p>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     АВТОРИЗАЦИЯ
  ════════════════════════════════════════════════════════════════════════ */
  if (!currentUser) {
    return (
      <div className="ilm-app-root relative w-full min-h-screen bg-white text-gray-900 flex items-center justify-center p-4 overflow-hidden">
        <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-emerald-200 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-red-500/30 blur-3xl" />

        <div className="relative z-10 w-full max-w-md bg-white/95 backdrop-blur-xl border border-emerald-200 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-7">
            <div className="text-6xl mb-2">⚡</div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-emerald-500 to-green-500 bg-clip-text text-transparent">IlmTech TJ</h1>
            <p className="text-gray-500 text-sm mt-1">Маркетплейс Таджикистана</p>
            <p className="text-green-400 text-xs mt-1">{connected ? "🟢 Подключено к серверу" : "🔴 Нет связи"}</p>
          </div>

          {authView === "welcome" && (
            <div className="space-y-3">
              <button onClick={() => { setAuthView("login"); setAuthErr(""); }} className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold text-lg shadow-lg active:scale-95 transition">{t.login}</button>
              <button onClick={() => { setAuthView("register"); setAuthStep(1); setAuthErr(""); }} className="w-full py-4 rounded-2xl bg-gray-100 border border-emerald-300 font-bold text-lg active:scale-95 transition">{t.register}</button>
              <GoogleButton onClick={signInWithGoogle} />
              {knownAccounts.length > 0 && (
                <button onClick={() => setAuthView("accounts")} className="w-full py-3 rounded-2xl bg-gray-100 border border-gray-300 font-bold text-sm active:scale-95 transition">🔄 {t.myAccounts} ({knownAccounts.length})</button>
              )}
            </div>
          )}

          {authView === "accounts" && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold mb-2">🔄 {t.myAccounts}</h2>
              <p className="text-gray-500 text-xs mb-2">Аккаунты, в которые ты входил на этом устройстве.</p>
              {knownAccounts.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Пока нет сохранённых аккаунтов</p>}
              {knownAccounts.map((u) => (
                <button key={u.id} onClick={() => switchTo(u.id)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gray-100 border border-gray-300 active:scale-95 transition text-left">
                  <AvatarView user={u} size={44} showOnline />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{u.nickname}</div>
                    <div className="text-xs text-gray-500">🏪 IlmTech · {u.id}</div>
                  </div>
                  <span className="text-emerald-600 text-sm">Войти →</span>
                </button>
              ))}
              <button onClick={() => setAuthView("welcome")} className="w-full py-2 text-gray-500 text-sm">{t.back}</button>
            </div>
          )}

          {authView === "login" && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold mb-2">{t.loginTitle}</h2>
              <input value={loginNick} onChange={(e) => setLoginNick(e.target.value)} placeholder={t.nickname} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder={t.password} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              {authErr && <p className="text-red-500 text-sm">{authErr}</p>}
              <button onClick={doLogin} disabled={authBusy} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold shadow-lg active:scale-95 transition disabled:opacity-60">{authBusy ? "..." : "Войти →"}</button>
              <GoogleButton onClick={signInWithGoogle} />
              <button onClick={() => { setAuthView("welcome"); setAuthErr(""); }} className="w-full py-2 text-gray-500 text-sm">{t.back}</button>
            </div>
          )}

          {authView === "register" && authStep === 1 && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold mb-2">{t.register}</h2>
              <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder={t.email} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <input value={authNick} onChange={(e) => setAuthNick(e.target.value)} placeholder={t.nickname} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <input type="password" value={authPass} onChange={(e) => setAuthPass(e.target.value)} placeholder={t.password} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <input type="password" value={authPass2} onChange={(e) => setAuthPass2(e.target.value)} placeholder={t.passwordRepeat} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              {authErr && <p className="text-red-500 text-sm">{authErr}</p>}
              <button onClick={startRegister} disabled={authBusy} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold shadow-lg active:scale-95 transition disabled:opacity-60">{authBusy ? "Отправляем код..." : "Получить код на почту →"}</button>
              <GoogleButton onClick={signInWithGoogle} />
              <button onClick={() => { setAuthView("welcome"); setAuthErr(""); }} className="w-full py-2 text-gray-500 text-sm">{t.back}</button>
            </div>
          )}

          {authView === "verify" && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold mb-1">📧 Подтверди почту</h2>
              <p className="text-gray-500 text-sm">Мы отправили код на<br /><b className="text-gray-700">{authEmail}</b>. Введи его ниже 👇</p>
              <input
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && confirmRegisterCode()}
                inputMode="numeric"
                maxLength={8}
                placeholder="123456"
                className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500 text-center text-2xl tracking-[0.4em] font-bold"
              />
              {authErr && <p className="text-red-500 text-sm">{authErr}</p>}
              <button onClick={confirmRegisterCode} disabled={authBusy} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold shadow-lg active:scale-95 transition disabled:opacity-60">{authBusy ? "Проверяем..." : "Подтвердить ✓"}</button>
              <div className="flex items-center justify-between text-sm">
                <button onClick={() => { setAuthView("register"); setAuthErr(""); }} className="text-gray-500">← Назад</button>
                <button onClick={resendCode} disabled={authBusy} className="text-emerald-600 font-semibold disabled:opacity-50">Отправить код заново</button>
              </div>
              <p className="text-gray-400 text-xs">Письмо не пришло? Подожди минуту и проверь папку «Спам».</p>
            </div>
          )}
        </div>
        {toast && <ToastView toast={toast} />}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     ОСНОВНОЕ ПРИЛОЖЕНИЕ
  ════════════════════════════════════════════════════════════════════════ */
  const isSeller = true; // все могут и продавать и покупать

  return (
    <div className="ilm-app-root relative w-full h-screen flex flex-col bg-gradient-to-b from-gray-50 to-white text-gray-900 overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-emerald-100 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-red-100 blur-3xl" />

      <header className="relative z-10 shrink-0 flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-xl border-b border-emerald-100">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚡</span>
          <span className="font-black text-lg bg-gradient-to-r from-emerald-500 to-green-500 bg-clip-text text-transparent">IlmTech</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleMusic} title={musicOn ? "Выключить музыку" : "Включить музыку"} className="w-9 h-9 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-lg active:scale-90 transition">{musicOn ? "🔊" : "🔇"}</button>
          {isSeller && <button onClick={() => setScreen("add")} className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white text-sm font-bold shadow-md active:scale-95 transition">➕ {t.post}</button>}
          <button onClick={() => setScreen("profile")} className="active:scale-90 transition"><AvatarView user={currentUser} size={34} /></button>
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 overflow-hidden">
        {screen === "home" && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <div className="rounded-3xl bg-gradient-to-r from-emerald-500 to-green-500 text-white p-6 shadow-xl relative overflow-hidden">
              <div className="absolute -right-4 -top-4 text-7xl opacity-20">⚡</div>
              <h2 className="text-2xl font-black leading-tight relative">{t.homeBanner1}</h2>
              <p className="text-gray-900/80 relative">{t.homeBanner2}</p>
            </div>

            <div className="grid grid-cols-6 gap-2">
              {CATEGORIES.slice(0, 11).map((c) => (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className={`aspect-square flex flex-col items-center justify-center rounded-xl border font-medium transition active:scale-90 ${category === c.key ? "bg-gradient-to-br from-emerald-500 to-green-500 text-white border-emerald-400 shadow-md" : "bg-white border-gray-200"}`}>
                  <span className={category === c.key ? "text-white" : "text-emerald-600"}><CategoryIcon name={c.key} size={24} /></span>
                  <span className="leading-none mt-0.5 text-center px-0.5" style={{ fontSize: "9px" }}>{c.key}</span>
                </button>
              ))}
              <button onClick={() => setAllCatsOpen(true)}
                className="aspect-square flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 text-emerald-700 font-medium active:scale-90 transition">
                <span className="text-lg">➕</span>
                <span className="leading-none mt-0.5" style={{ fontSize: "9px" }}>{t.more}</span>
              </button>
            </div>

            <div className="flex gap-2 bg-gray-100 p-1 rounded-2xl">
              {([["all", "🛍️ Все"], ["used", "♻️ Б/У"], ["new", "✨ Новые"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setCondFilter(key)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition active:scale-95 ${condFilter === key ? "bg-white text-emerald-600 shadow" : "text-gray-500"}`}>{label}</button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-sm">{homeProducts.length} {t.adsCount}</span>
              <button onClick={() => setSortMode(sortMode === "new" ? "asc" : sortMode === "asc" ? "desc" : "new")} className="px-3 py-1.5 rounded-xl bg-gray-100 text-sm border border-gray-300">{sortMode === "new" ? t.sortNew : sortMode === "asc" ? t.sortAsc : t.sortDesc}</button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {homeProducts.length === 0 && <p className="col-span-full text-center text-gray-400 py-10">{t.noAds}</p>}
              {homeProducts.map((p) => <ProductCard key={p.id} p={p} fav={favorites.includes(p.id)} mine={p.sellerId === currentUser.id} onOpen={() => openCard(p)} onFav={() => toggleFav(p.id)} />)}
            </div>
          </div>
        )}

        {screen === "search" && (
          <div className="h-full overflow-y-auto p-4 space-y-3">
            <h2 className="text-xl font-bold">🔍 {t.search}</h2>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchPlaceholder} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
            <div className="flex gap-2 overflow-x-auto pb-1">{CATEGORIES.map((c) => <button key={c.key} onClick={() => setSearchCat(c.key)} className={`whitespace-nowrap px-3 py-1.5 rounded-xl text-sm border inline-flex items-center gap-1.5 ${searchCat === c.key ? "bg-emerald-500 border-emerald-400 text-white" : "bg-white border-gray-200 text-emerald-700"}`}><CategoryIcon name={c.key} size={15} />{c.key}</button>)}</div>
            <div className="flex gap-2">
              <input value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} inputMode="numeric" placeholder={t.priceFrom} className="w-1/2 px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <input value={priceTo} onChange={(e) => setPriceTo(e.target.value)} inputMode="numeric" placeholder={t.priceTo} className="w-1/2 px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
            </div>
            <span className="text-gray-500 text-sm">{t.foundCount}: {searchResults.length}</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{searchResults.map((p) => <ProductCard key={p.id} p={p} fav={favorites.includes(p.id)} mine={p.sellerId === currentUser.id} onOpen={() => openCard(p)} onFav={() => toggleFav(p.id)} />)}</div>
          </div>
        )}

        {screen === "add" && (
          <div className="h-full overflow-y-auto p-4 flex justify-center">
            <div className="w-full max-w-xl space-y-3">
              <h2 className="text-xl font-bold">{t.newAd}</h2>
              <div className="rounded-xl bg-orange-50 border border-orange-200 text-orange-800 text-sm px-3 py-2">{t.usedNote}</div>
              <div className="grid grid-cols-4 gap-2">
                {npImages.map((img, i) => (
                  <div key={i} className="relative rounded-xl overflow-hidden border border-gray-300" style={{ aspectRatio: "1/1" }}>
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    {i === 0 && <span className="absolute top-1 left-1 bg-emerald-500 text-white px-1 rounded" style={{ fontSize: "8px" }}>ГЛАВНОЕ</span>}
                    <button onClick={() => setNpImages(npImages.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-black/60 rounded-full w-5 h-5 text-xs">✕</button>
                  </div>
                ))}
                {npImages.length < 4 && <label className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-400 cursor-pointer text-2xl" style={{ aspectRatio: "1/1" }}>＋<input type="file" accept="image/*" multiple className="hidden" onChange={handleAddImages} /></label>}
              </div>
              <input value={npTitle} onChange={(e) => setNpTitle(e.target.value)} placeholder={t.title} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <input value={npPrice} onChange={(e) => setNpPrice(e.target.value)} inputMode="numeric" placeholder={t.price} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setNpCond("used")} className={`flex-1 py-3 rounded-xl border font-bold transition active:scale-95 ${npCond === "used" ? "bg-emerald-500 text-white border-emerald-500" : "bg-gray-100 border-gray-300 text-gray-500"}`}>♻️ Б/У</button>
                <button type="button" onClick={() => setNpCond("new")} className={`flex-1 py-3 rounded-xl border font-bold transition active:scale-95 ${npCond === "new" ? "bg-orange-500 text-white border-orange-500" : "bg-gray-100 border-gray-300 text-gray-500"}`}>✨ Новое</button>
              </div>
              <select value={npCat} onChange={(e) => setNpCat(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none">{CATEGORIES.filter((c) => c.key !== "Все").map((c) => <option key={c.key}>{c.key}</option>)}</select>
              <select value={npCity} onChange={(e) => setNpCity(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none">{CITIES.map((c) => <option key={c}>{c}</option>)}</select>
              <input value={npPhone} onChange={(e) => setNpPhone(e.target.value)} placeholder={t.phone} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <textarea value={npDesc} onChange={(e) => setNpDesc(e.target.value)} placeholder={t.description} rows={3} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <button onClick={publishProduct} className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold text-lg shadow-lg active:scale-95 transition">{t.publish}</button>
            </div>
          </div>
        )}

        {screen === "favorites" && (
          <div className="h-full overflow-y-auto p-4 space-y-3">
            <h2 className="text-xl font-bold">❤️ {t.favs}</h2>
            {favProducts.length === 0 ? <p className="text-gray-500 text-center py-10">Пока пусто. Жми ❤️ на товарах.</p> : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{favProducts.map((p) => <ProductCard key={p.id} p={p} fav onOpen={() => openCard(p)} onFav={() => toggleFav(p.id)} mine={p.sellerId === currentUser.id} />)}</div>}
          </div>
        )}

        {screen === "messages" && !chatPartnerId && (
          <div className="h-full overflow-y-auto p-4 flex justify-center">
            <div className="w-full max-w-2xl space-y-3">
              <h2 className="text-xl font-bold">{t.messages}</h2>
              <div className="flex gap-2">
                <input value={findId} onChange={(e) => setFindId(e.target.value)} placeholder={t.findById} onKeyDown={(e) => e.key === "Enter" && findUserById()} className="flex-1 px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500 uppercase" />
                <button onClick={findUserById} className="px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold shadow-md">{t.findBtn}</button>
              </div>
              <p className="text-xs text-gray-400">Твой ID: <b className="text-emerald-600">{currentUser.id}</b> — дай его другу или брату, чтобы он написал тебе с другого ноутбука.</p>
              {conversations.length === 0 ? <p className="text-gray-500 text-center py-10">Нет диалогов. Найди человека по ID или напиши продавцу из карточки.</p> : (
                <div className="space-y-2">
                  {conversations.map((c) => (
                    <button key={c.partner.id} onClick={() => openChatWith(c.partner.id)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white border border-gray-200 active:scale-[0.98] transition text-left">
                      <AvatarView user={c.partner} size={48} showOnline />
                      <div className="flex-1 min-w-0"><div className="flex items-center justify-between"><span className="font-bold truncate inline-flex items-center gap-1">{c.partner.nickname} <VerifyMark followers={followersCount(c.partner.id)} nick={c.partner.nickname} size={12} /></span><span className="text-xs text-gray-400 shrink-0">{fmtTime(c.last.ts)}</span></div><p className="text-sm text-gray-500 truncate">{c.last.kind === "voice" ? "🎤 Голосовое" : c.last.kind === "sticker" ? `Стикер ${c.last.text}` : c.last.text}</p></div>
                      {c.unread > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">{c.unread}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {screen === "messages" && chatPartnerId && (
          <div className="h-full flex justify-center">
            <div className="w-full max-w-2xl h-full">
              <ChatWindow
                partner={users.find((u) => u.id === chatPartnerId)!}
                thread={activeThread}
                myId={currentUser.id}
                msgInput={msgInput}
                setMsgInput={setMsgInput}
                onSend={sendText}
                onSticker={sendSticker}
                isRecording={isRecording}
                startRecording={startRecording}
                stopRecording={stopRecording}
                onBack={() => setChatPartnerId(null)}
                onDelete={() => deleteChat(chatPartnerId)}
                onDeleteMessage={deleteMessage}
                onOpenProfile={() => setViewingProfileId(chatPartnerId)}
                partnerFollowers={followersCount(chatPartnerId)}
                chatEndRef={chatEndRef}
              />
            </div>
          </div>
        )}

        {screen === "profile" && (
          <div className="h-full overflow-y-auto p-4 flex justify-center">
            <div className="w-full max-w-xl space-y-4">
              <div className="rounded-3xl bg-white border border-emerald-100 p-6 text-center shadow-lg">
                <button onClick={() => setAvatarPicker(!avatarPicker)} className="inline-block active:scale-90 transition"><AvatarView user={currentUser} size={88} /></button>
                {avatarPicker && (
                  <div className="my-4 space-y-3">
                    <div className="grid grid-cols-5 gap-2">
                      {AVATARS.map((a) => <button key={a} onClick={() => changeAvatar(a)} className="text-3xl p-2 rounded-xl bg-gray-100 active:scale-90">{a}</button>)}
                    </div>
                    <label className="block w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 font-bold cursor-pointer active:scale-95 transition">
                      📷 Загрузить фото
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarPhoto} />
                    </label>
                  </div>
                )}
                {editingNick ? (
                  <div className="flex gap-2 mt-3"><input value={newNick} onChange={(e) => setNewNick(e.target.value)} placeholder="Новый ник" className="flex-1 px-3 py-2 rounded-xl bg-gray-100 border border-gray-300 outline-none" /><button onClick={saveNick} className="px-3 rounded-xl bg-emerald-500 text-white font-bold">✓</button></div>
                ) : (
                  <h2 className="text-2xl font-bold mt-2 inline-flex items-center justify-center gap-2">
                    {currentUser.nickname}
                    <VerifyMark followers={followersCount(currentUser.id)} nick={currentUser.nickname} size={22} />
                  </h2>
                )}
                <p className="text-gray-500 text-sm mt-1">{isCreator(currentUser.nickname) ? "👑 Создатель IlmTech" : "🏪 Пользователь IlmTech"}</p>
                <div className="mt-2 inline-flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-xl"><span className="text-sm">ID: <b className="text-emerald-600">{currentUser.id}</b></span><button onClick={() => { navigator.clipboard?.writeText(currentUser.id); showToast("ID скопирован", "ok"); }} className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded">копир.</button></div>

                {/* Подписчики / подписки */}
                <div className="mt-4 flex items-center justify-center gap-6">
                  <button onClick={() => setFollowsListView({ userId: currentUser.id, mode: "followers" })} className="text-center active:scale-95 transition">
                    <div className="text-2xl font-black text-emerald-600">{followersCount(currentUser.id)}</div>
                    <div className="text-xs text-gray-500">{t.followers}</div>
                  </button>
                  <div className="w-px h-10 bg-gray-200" />
                  <button onClick={() => setFollowsListView({ userId: currentUser.id, mode: "following" })} className="text-center active:scale-95 transition">
                    <div className="text-2xl font-black text-emerald-600">{followingCount(currentUser.id)}</div>
                    <div className="text-xs text-gray-500">{t.following}</div>
                  </button>
                </div>

                <div className="mt-4"><button onClick={() => { setEditingNick(!editingNick); setNewNick(currentUser.nickname); }} className="px-4 py-2 rounded-xl bg-gray-100 border border-gray-300 text-sm">{t.editProfile}</button></div>
              </div>

              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4"><h3 className="font-bold mb-1">🤝 Как проходят сделки на IlmTech</h3><p className="text-sm text-gray-700">Без оплаты в приложении и без комиссий. Покупатель пишет продавцу 💬, договаривается, встречаетесь лично и платите наличными.</p></div>

              <div className="grid grid-cols-3 gap-2 text-center"><Stat label={t.myAdsCount} value={myProducts.length} /><Stat label={t.favsCount} value={favorites.length} /><Stat label={t.viewsCount} value={myProducts.reduce((s, p) => s + p.views, 0)} /></div>

              <div className="space-y-2">
                <button onClick={() => showToast(`«${t.notifications}» скоро будет доступно`, "info")} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 text-left"><span className="text-xl">🔔</span><span>{t.notifications}</span><span className="ml-auto text-gray-400">›</span></button>
                <button onClick={() => showToast(`«${t.verification}» скоро будет доступно`, "info")} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 text-left"><span className="text-xl">✅</span><span>{t.verification}</span><span className="ml-auto text-gray-400">›</span></button>
                <button onClick={() => showToast(`«${t.security}» скоро будет доступно`, "info")} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 text-left"><span className="text-xl">🛡️</span><span>{t.security}</span><span className="ml-auto text-gray-400">›</span></button>
                <button onClick={toggleTheme} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 text-left"><span className="text-xl">{theme === "night" ? "🌙" : "☀️"}</span><span>Тёмная тема</span><span className={`ml-auto w-12 h-7 rounded-full p-1 transition ${theme === "night" ? "bg-emerald-500" : "bg-gray-300"}`}><span className={`block w-5 h-5 rounded-full bg-white transition-transform ${theme === "night" ? "translate-x-5" : ""}`} /></span></button>
                <button onClick={() => setLangPickerOpen(true)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 text-left"><span className="text-xl">🌐</span><span>{t.language}</span><span className="ml-auto text-emerald-600 font-semibold">{LANG_NAMES[lang]}</span></button>
                <button onClick={() => showToast(`«${t.help}» скоро будет доступно`, "info")} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 text-left"><span className="text-xl">❓</span><span>{t.help}</span><span className="ml-auto text-gray-400">›</span></button>
              </div>

              <button onClick={() => { logout(); setAuthView("accounts"); }} className="w-full py-3 rounded-xl bg-gray-100 border border-gray-300 font-bold">{t.switchAccount}</button>
              <button onClick={logout} className="w-full py-3 rounded-xl bg-red-50 border border-red-300 text-red-600 font-bold">{t.logout}</button>
              <button onClick={deleteMyAccount} className="w-full py-3 rounded-xl bg-white border border-red-200 text-red-400 text-sm font-semibold active:scale-95 transition">🗑️ Удалить аккаунт навсегда</button>
            </div>
          </div>
        )}

        {!botOpen && screen !== "messages" && (
          <button onClick={() => setBotOpen(true)} className="absolute bottom-4 right-4 w-14 h-14 rounded-full bg-gradient-to-r from-emerald-500 to-green-500 text-2xl shadow-lg animate-bounce">🤖</button>
        )}

        {botOpen && (
          <div className="absolute bottom-3 right-3 flex flex-col bg-white border border-emerald-300 rounded-2xl overflow-hidden shadow-2xl" style={{ width: "min(360px, calc(100% - 24px))", height: "min(72%, 540px)" }}>
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-500"><span className="font-bold">🤖 {t.bot}</span><button onClick={() => setBotOpen(false)} className="text-xl">✕</button></div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">{botMsgs.map((m, i) => <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}><div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-line ${m.from === "user" ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-900"}`} style={{ maxWidth: "82%" }}>{m.text}</div></div>)}<div ref={botEndRef} /></div>
            <div className="px-3 pb-2 flex flex-wrap gap-1">{BOT_QUICK.map((q) => <button key={q} onClick={() => sendBot(q)} className="text-xs px-2 py-1 rounded-lg bg-gray-100 border border-gray-300">{q}</button>)}</div>
            <div className="flex gap-2 p-3 border-t border-gray-200"><input value={botInput} onChange={(e) => setBotInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendBot()} placeholder={t.askBot} className="flex-1 px-3 py-2 rounded-xl bg-gray-100 border border-gray-300 outline-none text-sm" /><button onClick={() => sendBot()} className="px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold">➤</button></div>
          </div>
        )}
      </main>

      <nav className="relative z-10 shrink-0 flex items-center justify-around bg-white/90 backdrop-blur-xl border-t border-emerald-100 py-2">
        <span className="pointer-events-none absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 via-green-400 to-orange-500" />
        <NavBtn emoji="🏠" label={t.home} active={screen === "home"} onClick={() => setScreen("home")} />
        <NavBtn emoji="🔍" label={t.search} active={screen === "search"} onClick={() => setScreen("search")} />
        {isSeller && <NavBtn emoji="➕" label={t.sell} active={screen === "add"} onClick={() => setScreen("add")} />}
        <NavBtn emoji="💬" label={t.chats} active={screen === "messages"} onClick={() => { setScreen("messages"); setChatPartnerId(null); }} badge={totalUnread} />
        <NavBtn emoji="❤️" label={t.favs} active={screen === "favorites"} onClick={() => setScreen("favorites")} badge={favorites.length} />
        <NavBtn emoji="👤" label={t.profile} active={screen === "profile"} onClick={() => setScreen("profile")} />
      </nav>

      {openProduct && (
        <ProductModal
          p={openProduct}
          fav={favorites.includes(openProduct.id)}
          mine={openProduct.sellerId === currentUser.id}
          commentText={commentText}
          setCommentText={setCommentText}
          onAddComment={addComment}
          onFav={() => toggleFav(openProduct.id)}
          onClose={() => { setOpenProduct(null); setCommentText(""); }}
          onWrite={() => openChatWith(openProduct.sellerId)}
          onOpenProfile={() => { setOpenProduct(null); setViewingProfileId(openProduct.sellerId); }}
          onDeleteProduct={() => deleteProduct(openProduct.id)}
          sellerFollowers={followersCount(openProduct.sellerId)}
        />
      )}

      {allCatsOpen && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setAllCatsOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl" style={{ maxHeight: "85%", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-gray-900">{t.allCategories}</h2>
              <button onClick={() => setAllCatsOpen(false)} className="w-9 h-9 rounded-full bg-gray-100 text-lg active:scale-90 transition">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button key={c.key} onClick={() => { setCategory(c.key); setAllCatsOpen(false); }}
                  className={`flex flex-col items-center justify-center py-4 rounded-xl border-2 transition active:scale-95 ${category === c.key ? "bg-gradient-to-br from-emerald-500 to-green-500 text-white border-emerald-500 shadow-md" : "bg-white border-gray-200 hover:border-emerald-300"}`}>
                  <span className={`mb-1 ${category === c.key ? "text-white" : "text-emerald-600"}`}><CategoryIcon name={c.key} size={30} /></span>
                  <span className="text-xs font-semibold">{c.key}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Модалка чужого профиля */}
      {viewingProfileId && (() => {
        const target = users.find((u) => u.id === viewingProfileId);
        if (!target) return null;
        const targetFollowers = followersCount(target.id);
        const targetFollowing = followingCount(target.id);
        const targetProducts = products.filter((p) => p.sellerId === target.id);
        const following = amIFollowing(target.id);
        const isMe = target.id === currentUser.id;
        return (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setViewingProfileId(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl" style={{ maxHeight: "90%", overflowY: "auto" }}>
              <button onClick={() => setViewingProfileId(null)} className="float-right w-9 h-9 rounded-full bg-gray-100 text-lg active:scale-90 transition">✕</button>
              <div className="text-center pt-2">
                <AvatarView user={target} size={92} showOnline />
                <h2 className="text-2xl font-bold mt-3 inline-flex items-center gap-2">
                  {target.nickname}
                  <VerifyMark followers={targetFollowers} nick={target.nickname} size={22} />
                </h2>
                <p className="text-gray-500 text-sm mt-1">🏪 IlmTech · {target.id}</p>
                <p className="text-xs mt-1">
                  {isOnline(target.lastSeen) ? <span className="text-emerald-600 font-semibold">🟢 в сети</span> : <span className="text-gray-400">{lastSeenText(target.lastSeen)}</span>}
                </p>

                <div className="mt-4 flex items-center justify-center gap-4">
                  <div className="text-center"><div className="text-xl font-black text-emerald-600">{targetProducts.length}</div><div className="text-xs text-gray-500">{t.adsShort}</div></div>
                  <div className="w-px h-10 bg-gray-200" />
                  <button onClick={() => setFollowsListView({ userId: target.id, mode: "followers" })} className="text-center active:scale-95 transition"><div className="text-xl font-black text-emerald-600">{targetFollowers}</div><div className="text-xs text-gray-500">{t.followersShort}</div></button>
                  <div className="w-px h-10 bg-gray-200" />
                  <button onClick={() => setFollowsListView({ userId: target.id, mode: "following" })} className="text-center active:scale-95 transition"><div className="text-xl font-black text-emerald-600">{targetFollowing}</div><div className="text-xs text-gray-500">{t.following}</div></button>
                </div>

                {!isMe && (
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => toggleFollow(target.id)}
                      className={`py-3 rounded-xl font-bold shadow-md active:scale-95 transition ${following ? "bg-gray-200 text-gray-700 border border-gray-300" : "bg-gradient-to-r from-emerald-500 to-green-500 text-white"}`}
                    >
                      {following ? t.unfollow : t.follow}
                    </button>
                    <button
                      onClick={() => { setViewingProfileId(null); openChatWith(target.id); }}
                      className="py-3 rounded-xl font-bold bg-white border-2 border-emerald-500 text-emerald-600 active:scale-95 transition"
                    >
                      {t.write}
                    </button>
                  </div>
                )}
              </div>

              {/* Объявления пользователя */}
              {targetProducts.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    🏪 Объявления ({targetProducts.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {targetProducts.map((p) => (
                      <ProductCard
                        key={p.id}
                        p={p}
                        fav={favorites.includes(p.id)}
                        mine={p.sellerId === currentUser.id}
                        onOpen={() => { setViewingProfileId(null); openCard(p); }}
                        onFav={() => toggleFav(p.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Модалка списка подписчиков / подписок */}
      {followsListView && (() => {
        const ownerUser = users.find((u) => u.id === followsListView.userId);
        const list: User[] = followsListView.mode === "followers"
          ? follows.filter((f) => f.followingId === followsListView.userId).map((f) => users.find((u) => u.id === f.followerId)).filter((x): x is User => !!x)
          : follows.filter((f) => f.followerId === followsListView.userId).map((f) => users.find((u) => u.id === f.followingId)).filter((x): x is User => !!x);
        const title = followsListView.mode === "followers" ? "Подписчики" : "Подписки";
        return (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setFollowsListView(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl" style={{ maxHeight: "85%", overflowY: "auto" }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-black text-gray-900">{title}</h2>
                  {ownerUser && <p className="text-xs text-gray-500">{ownerUser.nickname}</p>}
                </div>
                <button onClick={() => setFollowsListView(null)} className="w-9 h-9 rounded-full bg-gray-100 text-lg active:scale-90 transition">✕</button>
              </div>
              {list.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">
                  {followsListView.mode === "followers" ? "Пока никого 😊" : "Пока ни на кого не подписан"}
                </p>
              ) : (
                <div className="space-y-2">
                  {list.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => { setFollowsListView(null); setViewingProfileId(u.id); }}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white border border-gray-200 active:scale-[0.98] transition text-left"
                    >
                      <AvatarView user={u} size={44} showOnline />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate inline-flex items-center gap-1">
                          {u.nickname}
                          <VerifyMark followers={followersCount(u.id)} nick={u.nickname} size={12} />
                        </div>
                        <div className="text-xs text-gray-400">🏪 IlmTech · {u.id}</div>
                      </div>
                      <span className="text-emerald-600 text-sm">›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Модалка выбора языка */}
      {langPickerOpen && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setLangPickerOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-gray-900">🌐 {t.langTitle}</h2>
              <button onClick={() => setLangPickerOpen(false)} className="w-9 h-9 rounded-full bg-gray-100 text-lg active:scale-90 transition">✕</button>
            </div>
            <div className="space-y-2">
              {(["ru", "tg", "en"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => { setLangAndSave(l); setLangPickerOpen(false); showToast("✓ " + LANG_NAMES[l], "ok"); }}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-2 active:scale-95 transition ${lang === l ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-white"}`}
                >
                  <span className="font-bold text-gray-900">{LANG_NAMES[l]}</span>
                  {lang === l && <span className="text-emerald-600 text-xl">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && <ToastView toast={toast} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   ПОДКОМПОНЕНТЫ
   ════════════════════════════════════════════════════════════════════════════ */

function AvatarView({ user, size, showOnline }: { user: { avatar: string; avatarIsPhoto: boolean; lastSeen?: number }; size: number; showOnline?: boolean }) {
  const online = showOnline && typeof user.lastSeen === "number" && isOnline(user.lastSeen);
  const dotSize = Math.max(10, Math.floor(size * 0.28));
  const inner = user.avatarIsPhoto
    ? <img src={user.avatar} alt="" className="rounded-full object-cover border-2 border-emerald-400 shadow-sm w-full h-full" />
    : <span className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-50 to-green-100 border border-emerald-200 w-full h-full" style={{ fontSize: size * 0.55 }}>{user.avatar}</span>;
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      {inner}
      {online && (
        <span
          className="absolute bg-emerald-500 border-2 border-white rounded-full"
          style={{ width: dotSize, height: dotSize, right: 0, bottom: 0 }}
          title="В сети"
        />
      )}
    </span>
  );
}

function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2 my-1">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">или</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <button onClick={onClick} className="w-full py-3 rounded-2xl bg-white border border-gray-300 font-bold text-gray-700 flex items-center justify-center gap-2 active:scale-95 transition shadow-sm">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        Continue with Google
      </button>
    </>
  );
}

function NavBtn({ emoji, label, active, onClick, badge }: { emoji: string; label: string; active: boolean; onClick: () => void; badge?: number; }) {
  return (
    <button onClick={onClick} className={`relative flex flex-col items-center gap-0.5 px-2 pt-1 ${active ? "text-emerald-600" : "text-gray-500"}`}>
      <span className="text-xl">{emoji}</span>
      <span style={{ fontSize: "10px" }}>{label}</span>
      {active && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-6 rounded-full bg-orange-500" />}
      {badge !== undefined && badge > 0 && <span className="absolute -top-1 right-0 bg-red-500 text-gray-900 rounded-full px-1.5 py-0.5 font-bold" style={{ fontSize: "9px" }}>{badge}</span>}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-200 py-4">
      <div className="text-2xl font-black text-emerald-600">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function ProductCard({ p, fav, mine, onOpen, onFav }: { p: Product; fav: boolean; mine: boolean; onOpen: () => void; onFav: () => void; }) {
  const emoji = p._emoji || productEmoji[p.category] || "📦";
  return (
    <div onClick={onOpen} className="rounded-2xl bg-white border border-gray-200 overflow-hidden cursor-pointer active:scale-[0.97] hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 shadow-sm">
      <div className="relative h-32 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        {p.images.length > 0 ? <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" /> : <span className="text-5xl">{emoji}</span>}
        {mine ? <span className="absolute top-1 left-1 bg-blue-500 text-white px-1.5 py-0.5 rounded font-bold" style={{ fontSize: "9px" }}>Моё</span> : p.badge ? <span className={`absolute top-1 left-1 px-1.5 py-0.5 rounded font-bold ${p.badge === "VIP" ? "bg-amber-400 text-gray-900" : "bg-red-500 text-white"}`} style={{ fontSize: "9px" }}>{p.badge}</span> : null}
        <button onClick={(e) => { e.stopPropagation(); onFav(); }} className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">{fav ? "❤️" : "🤍"}</button>
        {p.condition === "new" && <span className="absolute bottom-1 left-1 bg-orange-500 text-white px-1.5 py-0.5 rounded font-bold" style={{ fontSize: "9px" }}>✨ Новое</span>}
      </div>
      <div className="p-2">
        <div className="font-black text-emerald-600">{fmtPrice(p.price)} TJS</div>
        <div className="text-sm truncate">{p.title}</div>
        <div className="text-gray-400 flex items-center justify-between mt-1" style={{ fontSize: "11px" }}><span>📍 {p.city}</span><span>👁 {p.views}</span></div>
      </div>
    </div>
  );
}

function ProductModal({ p, fav, mine, commentText, setCommentText, onAddComment, onFav, onClose, onWrite, onOpenProfile, onDeleteProduct, sellerFollowers }: {
  p: Product; fav: boolean; mine: boolean; commentText: string; setCommentText: (s: string) => void;
  onAddComment: () => void; onFav: () => void; onClose: () => void; onWrite: () => void;
  onOpenProfile: () => void; onDeleteProduct: () => void; sellerFollowers: number;
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const emoji = p._emoji || productEmoji[p.category] || "📦";
  return (
    <div className="absolute inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg overflow-y-auto bg-white border border-emerald-200 rounded-t-3xl sm:rounded-3xl" style={{ maxHeight: "92%" }}>
        <div className="relative h-64 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
          {p.images.length > 0 ? <img src={p.images[imgIdx]} alt={p.title} className="w-full h-full object-cover" /> : <span className="text-8xl">{emoji}</span>}
          <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-lg">✕</button>
          <button onClick={onFav} className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/60 text-lg">{fav ? "❤️" : "🤍"}</button>
          {p.badge && !mine && <span className={`absolute bottom-3 left-3 text-xs px-2 py-1 rounded font-bold ${p.badge === "VIP" ? "bg-amber-400 text-gray-900" : "bg-red-500 text-white"}`}>{p.badge}</span>}
          {p.images.length > 1 && <div className="absolute bottom-3 right-3 flex gap-1">{p.images.map((_, i) => <button key={i} onClick={() => setImgIdx(i)} className={`w-2 h-2 rounded-full ${i === imgIdx ? "bg-white" : "bg-white/40"}`} />)}</div>}
        </div>
        <div className="p-4 space-y-3">
          <div className="text-3xl font-black text-emerald-600">{fmtPrice(p.price)} TJS</div>
          <h2 className="text-xl font-bold">{p.title}</h2>
          <p className="text-gray-700 text-sm">{p.description}</p>
          <div className="flex items-center gap-3 text-xs text-gray-500"><span>📍 {p.city}</span><span>🕐 {timeAgo(p.createdAt)}</span><span>👁 {p.views}</span></div>
          <button onClick={onOpenProfile} className="flex items-center gap-2 text-sm active:scale-95 transition">
            <AvatarView user={{ avatar: p.sellerAvatar, avatarIsPhoto: p.sellerIsPhoto }} size={28} />
            <span className="font-bold inline-flex items-center gap-1">{p.sellerName} <VerifyMark followers={sellerFollowers} nick={p.sellerName} size={14} /></span>
          </button>
          {!mine ? (
            <div className="grid grid-cols-2 gap-2">
              <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="py-3 rounded-xl bg-green-500 text-white font-bold text-center active:scale-95 transition">📞 Позвонить</a>
              <button onClick={onWrite} className="py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold shadow-md active:scale-95 transition">💬 Написать</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="py-2 text-center text-gray-500 text-sm">📌 Это ваше объявление</div>
              <button onClick={onDeleteProduct} className="w-full py-3 rounded-xl bg-red-50 border-2 border-red-300 text-red-600 font-bold active:scale-95 transition">🗑️ Удалить объявление</button>
            </div>
          )}
          <button onClick={() => setShowComments(!showComments)} className="w-full py-2 rounded-xl bg-gray-100 border border-gray-300 text-sm">💬 Комментарии ({p.comments.length})</button>
          {showComments && (
            <div className="space-y-2">
              {p.comments.length === 0 && <p className="text-gray-400 text-sm text-center py-2">Комментариев пока нет</p>}
              {p.comments.map((c) => (
                <div key={c.id} className="flex gap-2 bg-gray-100 rounded-xl p-2">
                  <AvatarView user={{ avatar: c.authorAvatar, avatarIsPhoto: c.authorIsPhoto }} size={28} />
                  <div className="flex-1"><div className="text-xs text-emerald-600 font-bold">{c.authorName} <span className="text-gray-400 font-normal">· {timeAgo(c.ts)}</span></div><div className="text-sm">{c.text}</div></div>
                </div>
              ))}
              <div className="flex gap-2"><input value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onAddComment()} placeholder="Написать комментарий..." className="flex-1 px-3 py-2 rounded-xl bg-gray-100 border border-gray-300 outline-none text-sm" /><button onClick={onAddComment} className="px-3 rounded-xl bg-emerald-500 text-white font-bold">➤</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatWindow({ partner, thread, myId, msgInput, setMsgInput, onSend, onSticker, isRecording, startRecording, stopRecording, onBack, onDelete, onDeleteMessage, onOpenProfile, partnerFollowers, chatEndRef }: {
  partner: User; thread: Message[]; myId: string; msgInput: string; setMsgInput: (s: string) => void;
  onSend: () => void; onSticker: (e: string) => void; isRecording: boolean;
  startRecording: () => void; stopRecording: () => void; onBack: () => void; onDelete: () => void;
  onDeleteMessage: (id: string) => void;
  onOpenProfile: () => void; partnerFollowers: number;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [stickersOpen, setStickersOpen] = useState(false);
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <button onClick={onBack} className="text-xl">←</button>
        <button onClick={onOpenProfile} className="active:scale-90 transition"><AvatarView user={partner} size={40} showOnline /></button>
        <button onClick={onOpenProfile} className="flex-1 min-w-0 text-left active:opacity-70 transition">
          <div className="font-bold truncate inline-flex items-center gap-1">{partner.nickname} <VerifyMark followers={partnerFollowers} nick={partner.nickname} size={14} /></div>
          <div className="text-xs text-gray-400">
            {isOnline(partner.lastSeen) ? <span className="text-emerald-600 font-semibold">🟢 в сети</span> : lastSeenText(partner.lastSeen)} · {partner.id}
          </div>
        </button>
        <button onClick={onDelete} className="text-xl active:scale-90 transition" title="Удалить переписку">🗑️</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {thread.length === 0 && <p className="text-gray-400 text-center py-10 text-sm">Сообщений пока нет. Напишите первым 👇</p>}
        {thread.map((m) => {
          const mine = m.fromId === myId;
          // долгое нажатие или контекстное меню = предложить удалить (только своё сообщение)
          const handleLongPress = (e: React.MouseEvent | React.TouchEvent) => {
            e.preventDefault();
            if (mine) onDeleteMessage(m.id);
          };
          if (m.kind === "sticker") {
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} group relative items-center gap-2`}>
                {mine && <button onClick={() => onDeleteMessage(m.id)} className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-red-500 text-sm" title="Удалить">✕</button>}
                <div onContextMenu={handleLongPress} className="text-5xl select-none">{m.text}</div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} group items-center gap-2`}>
              {mine && <button onClick={() => onDeleteMessage(m.id)} className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-red-500 text-sm shrink-0" title="Удалить">✕</button>}
              <div onContextMenu={handleLongPress} className={`px-3 py-2 rounded-2xl ${mine ? "bg-gradient-to-r from-emerald-500 to-green-500 text-white" : "bg-gray-100 text-gray-900"}`} style={{ maxWidth: "75%" }}>
                {m.kind === "voice" ? <audio controls src={m.audio} style={{ height: 36, maxWidth: 200 }} /> : <span className="text-sm">{m.text}</span>}
                <div className="text-right mt-0.5" style={{ fontSize: "10px", color: "rgba(255,255,255,0.85)" }}>{fmtTime(m.ts)}</div>
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>
      {stickersOpen && (
        <div className="grid grid-cols-8 gap-1 p-2 bg-white border-t border-gray-200 shrink-0" style={{ maxHeight: 140, overflowY: "auto" }}>
          {STICKERS.map((s) => <button key={s} onClick={() => { onSticker(s); setStickersOpen(false); }} className="text-2xl p-1 rounded-lg active:scale-90 hover:bg-gray-100">{s}</button>)}
        </div>
      )}
      <div className="flex items-center gap-2 p-3 border-t border-gray-200 bg-white shrink-0">
        <button onClick={() => setStickersOpen(!stickersOpen)} className="text-2xl">😀</button>
        <input value={msgInput} onChange={(e) => setMsgInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()} onFocus={() => setStickersOpen(false)} placeholder="Сообщение..." className="flex-1 px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none" />
        {msgInput.trim() ? (
          <button onClick={onSend} className="w-12 h-12 rounded-full bg-gradient-to-r from-emerald-500 to-green-500 font-bold text-lg flex items-center justify-center shadow-md">➤</button>
        ) : (
          <button onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={() => isRecording && stopRecording()} onTouchStart={(e) => { e.preventDefault(); startRecording(); }} onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }} className={`w-12 h-12 rounded-full flex items-center justify-center text-lg ${isRecording ? "bg-red-600 animate-pulse" : "bg-gray-200"}`}>🎤</button>
        )}
      </div>
      {isRecording && <div className="text-center text-xs text-red-600 pb-2 shrink-0">● Идёт запись... отпустите кнопку</div>}
    </div>
  );
}

function ToastView({ toast }: { toast: Toast }) {
  const color = toast.type === "ok" ? "bg-emerald-500" : toast.type === "err" ? "bg-red-500 text-white" : "bg-emerald-500";
  return <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 ${color} text-white px-4 py-2 rounded-xl shadow-lg text-sm font-medium text-center`} style={{ maxWidth: "90%" }}>{toast.msg}</div>;
}

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
type AuthView = "welcome" | "login" | "register" | "accounts";
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

const productEmoji: Record<string, string> = {
  Электроника: "📱", Авто: "🚗", Недвижимость: "🏠", Одежда: "👕", Обувь: "👟",
  Красота: "💄", Детское: "🧸", "Для дома": "🛋️", Техника: "🔌", Спорт: "⚽",
  Книги: "📚", Продукты: "🍎", Работа: "💼", Услуги: "🔧", Хобби: "🎨", Музыка: "🎸",
};

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

/** Компонент: галочка верификации рядом с ником */
function VerifyMark({ followers, size = 16 }: { followers: number; size?: number }) {
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
  // ═══════════════════════ ПРИВЕТСТВИЯ И ОБЩЕЕ ═══════════════════════
  { keys: ["привет", "салом", "здравствуй", "хай", "ассалом", "хеллоу", "ку", "дарова", "хелло"], answer: "Привет! 👋 Я IlmBot — твой умный помощник. Знаю про IlmTech, а ещё про математику, школу, Таджикистан, страны мира, природу, спорт, технику. Просто спрашивай! 🤖" },
  { keys: ["как дела", "че как", "как ты", "че делаешь"], answer: "У меня всё отлично! 😊 Я тут — отвечаю на твои вопросы. О чём поговорим?" },
  { keys: ["спасибо", "благодарю", "рахмат", "сенкс", "спс", "благодарность"], answer: "Пожалуйста! Всегда рад помочь 😊" },
  { keys: ["пока", "до свидания", "бай", "хайр", "до встречи"], answer: "Пока! Удачи тебе во всём 👋⚡" },
  { keys: ["кто ты", "ты кто", "что ты", "ты бот"], answer: "🤖 Я IlmBot — помощник для IlmTech. Я не настоящий человек, а программа. Но могу подсказать многое: про сайт, про учёбу, про мир." },
  { keys: ["кто тебя создал", "кто сделал", "разработчик", "автор", "кто написал"], answer: "🤖 Меня создал школьник из Таджикистана для приложения IlmTech — это его проект для конкурса. ⚡" },
  { keys: ["умеешь", "что умеешь", "что можешь", "функции", "помощь", "помоги"], answer: "Я могу:\n• Рассказать про IlmTech (продажа, покупка, чат)\n• Помочь с математикой 🧮\n• Рассказать про Таджикистан 🇹🇯 и другие страны 🌍\n• Объяснить школьные темы 📚\n• Поговорить про спорт ⚽, технику 💻, природу 🌳\nПросто спроси!" },

  // ═══════════════════════ САЙТ ILMTECH ═══════════════════════
  { keys: ["продать", "разместить", "подать объявление", "выставить", "опубликовать товар"], answer: "🏪 Чтобы продать: 1) быть Продавцом; 2) нажми ➕ внизу; 3) добавь до 4 фото, название, цену, категорию, город, описание и телефон; 4) «Опубликовать». Готово!" },
  { keys: ["купить", "покупка", "как заказать", "приобрести"], answer: "🛒 Открой карточку товара → 💬 «Написать» или 📞 «Позвонить» продавцу. Встретьтесь лично и оплатите наличными." },
  { keys: ["позвонить", "звонок", "номер телефона"], answer: "📞 На карточке товара зелёная кнопка с номером продавца." },
  { keys: ["деньги", "оплата", "платеж", "комиссия", "карта", "оплатить", "перевод"], answer: "💸 На IlmTech нет оплаты в приложении и нет комиссий. Покупатель и продавец встречаются и платят наличными." },
  { keys: ["написать", "сообщение", "чат", "переписка", "связаться", "мессенджер"], answer: "💬 Нажми «Чаты» → введи ID человека → пиши. Поддерживаются текст, голосовые 🎤 и стикеры 😀. Доходит мгновенно!" },
  { keys: ["голосовое", "voice", "запись", "микрофон"], answer: "🎤 В чате при пустом поле справа кнопка микрофона. Зажми → говори → отпусти." },
  { keys: ["стикер", "sticker", "эмодзи"], answer: "😀 В чате слева смайлик — нажми и выбирай стикеры." },
  { keys: ["id", "айди", "найти человека", "идентификатор"], answer: "🆔 У каждого свой ID вида ILM-XXXXX. Свой смотри в Профиле. В чате введи чужой ID и пиши!" },
  { keys: ["поиск", "найти товар", "искать"], answer: "🔍 Раздел «Поиск»: введи название, выбери категорию, задай цену от-до." },
  { keys: ["избранное", "сохранить", "сердечко", "лайк"], answer: "❤️ Жми сердечко на товаре — попадёт в Избранное." },
  { keys: ["безопасность", "обман", "мошенник", "развод", "кидала"], answer: "🛡️ Встречайтесь в людном месте днём, проверяйте товар до передачи денег, не платите вперёд незнакомцам." },
  { keys: ["регистрация", "зарегистрироваться", "создать аккаунт"], answer: "📝 Почта, ник, пароль (4+) → роль (Покупатель/Продавец) → «Создать»." },
  { keys: ["войти", "вход", "залогиниться", "логин"], answer: "🔑 Ник и пароль → «Войти». На одном устройстве можно держать несколько аккаунтов." },
  { keys: ["аватар", "аватарка", "фото профиля"], answer: "🖼️ В Профиле нажми на аватар → выбери смайлик или загрузи своё фото." },
  { keys: ["ник", "никнейм", "сменить имя", "поменять ник"], answer: "✏️ Профиль → «Редактировать профиль» → меняй ник." },
  { keys: ["удалить сообщение", "удалить чат", "удалить переписку"], answer: "🗑️ В чате наведи на своё сообщение → крестик. Всю переписку — корзина в шапке чата." },
  { keys: ["в сети", "онлайн", "офлайн", "статус"], answer: "🟢 Зелёная точка на аватаре = человек сейчас в сети (был активен <2 минут назад)." },
  { keys: ["город", "регион", "где работает", "куда доставка"], answer: "🏙️ 6 городов: Душанбе, Худжанд, Бохтар, Куляб, Хорог, Пенджикент." },
  { keys: ["что такое ilmtech", "что за сайт", "о сайте"], answer: "⚡ IlmTech — маркетплейс Таджикистана. Покупай, продавай, общайся. Бесплатно!" },
  { keys: ["бесплатно", "сколько стоит", "цена сайта"], answer: "🆓 IlmTech полностью бесплатен. Никаких подписок и комиссий." },
  { keys: ["приложение", "установить", "на телефон", "пва", "pwa"], answer: "📱 Открой ilm-tech.vercel.app на телефоне → меню браузера → «Установить приложение» / «На экран Домой». Появится иконка на рабочем столе!" },

  // ═══════════════════════ МАТЕМАТИКА ═══════════════════════
  { keys: ["математика", "матем", "матеша", "мат"], answer: "🧮 Математика — наука о числах, формах и закономерностях. Хочешь узнать про сложение, умножение, дроби, проценты, площадь? Спроси конкретно!" },
  { keys: ["сложение", "плюс", "прибавить", "сложить"], answer: "➕ Сложение — это когда мы складываем числа. Например: 2+3=5. Порядок не важен: 2+3 = 3+2." },
  { keys: ["вычитание", "минус", "отнять"], answer: "➖ Вычитание — это когда из числа отнимаем другое. Например: 7-3=4. Здесь порядок важен!" },
  { keys: ["умножение", "умножить", "произведение"], answer: "✖️ Умножение — быстрое сложение одинаковых чисел. 4×3 = 4+4+4 = 12. Таблицу умножения учи!" },
  { keys: ["деление", "разделить", "поделить"], answer: "➗ Деление — на сколько одинаковых частей разделить. 12÷4=3 (12 разделить поровну на 4 — по 3)." },
  { keys: ["дробь", "дроби", "одна вторая"], answer: "½ Дробь — часть целого. Числитель сверху, знаменатель снизу. 1/2 = половина, 1/4 = четверть. Чтобы сложить дроби — приводи к общему знаменателю!" },
  { keys: ["процент", "проценты", "процентов"], answer: "% Процент — одна сотая часть. 100% = всё, 50% = половина, 25% = четверть. Чтобы найти 20% от 200: 200×20÷100=40." },
  { keys: ["площадь", "найти площадь"], answer: "📐 Площадь квадрата = сторона × сторона. Прямоугольника = длина × ширина. Круга = π × радиус². π ≈ 3,14." },
  { keys: ["периметр"], answer: "📏 Периметр — сумма всех сторон. У квадрата = 4 × сторона. У прямоугольника = 2×(длина+ширина)." },
  { keys: ["уравнение", "решить уравнение"], answer: "🟰 Уравнение: x+5=12. Чтобы найти x — отними 5 с обеих сторон: x=12-5=7. Главное правило: что слева, то и справа!" },
  { keys: ["пифагор", "теорема пифагора"], answer: "📐 Теорема Пифагора: в прямоугольном треугольнике a² + b² = c² (квадрат гипотенузы = сумме квадратов катетов)." },
  { keys: ["таблица умножения"], answer: "✖️ Таблицу 1-10 надо знать наизусть! Самое сложное: 7×8=56, 6×7=42, 7×9=63, 8×9=72. Учи каждый день по строчке." },

  // ═══════════════════════ ТАДЖИКИСТАН ═══════════════════════
  { keys: ["таджикистан", "точикистон", "тадж", "о таджикистане"], answer: "🇹🇯 Таджикистан — страна в Центральной Азии. Столица — Душанбе. Население ~10 миллионов. Язык — таджикский. Большинство территории — горы (93%). Главная вершина — пик Исмоила Сомони (7495 м)." },
  { keys: ["душанбе", "столица таджикистана"], answer: "🏙️ Душанбе — столица Таджикистана. Население ~1 миллион. «Душанбе» означает «понедельник» — раньше тут был базар по понедельникам. Главная достопримечательность — флагшток (одна из самых высоких в мире, 165 м)!" },
  { keys: ["памир", "горы памира", "крыша мира"], answer: "🏔️ Памир — горная система в Таджикистане, прозвище «Крыша мира». Самые высокие вершины: пик Сомони (7495м), пик Ленина (7134м), пик Корженевской (7105м)." },
  { keys: ["исмоил сомони", "сомони"], answer: "👑 Исмаил Самани (Сомони) — основатель государства Саманидов в IX веке, национальный герой Таджикистана. В его честь названы валюта (сомони) и высочайшая гора." },
  { keys: ["сомони деньги", "валюта таджикистана"], answer: "💵 Сомони — валюта Таджикистана. 1 сомони = 100 дирамов. Введена в 2000 году вместо рубля." },
  { keys: ["навруз"], answer: "🌸 Навруз (Наврӯз) — праздник весны и нового года, отмечается 21 марта. Семейный праздник: сумалак, плов, гулянья. Главный праздник у таджиков!" },
  { keys: ["рудаки"], answer: "📜 Абуабдуллох Рудаки (858-941) — отец персидско-таджикской поэзии. Жил при дворе Саманидов в Бухаре. Его именем назван проспект в Душанбе." },
  { keys: ["авиценна", "ибн сино"], answer: "🩺 Ибн Сино (Авиценна, 980-1037) — великий учёный, врач, философ. Его «Канон медицины» учили в Европе 500 лет! Родился в Бухаре." },
  { keys: ["худжанд"], answer: "🏛️ Худжанд — второй по величине город Таджикистана, на севере страны. Один из древнейших городов Центральной Азии (2500+ лет)." },
  { keys: ["исркулъ", "иссык куль", "сарез", "каракуль"], answer: "🏞️ Озёра Таджикистана: Каракуль (на Памире, 3914м над морем), Сарез (образовалось в 1911 после землетрясения), Искандеркуль (легенды связывают с Александром Македонским)." },

  // ═══════════════════════ СТРАНЫ МИРА ═══════════════════════
  { keys: ["россия", "москва"], answer: "🇷🇺 Россия — самая большая страна в мире (17 млн км²). Столица — Москва. Население ~145 млн. Язык — русский." },
  { keys: ["сша", "америка", "вашингтон"], answer: "🇺🇸 США — третья по населению страна (~330 млн). Столица — Вашингтон. 50 штатов. Известна Голливудом и долиной Силикон-Вэлли." },
  { keys: ["китай", "пекин", "поднебесная"], answer: "🇨🇳 Китай — самая населённая страна (~1,4 млрд). Столица — Пекин. Великая Китайская стена — длина >20 000 км! Изобрели бумагу, порох, компас." },
  { keys: ["япония", "токио", "самураи"], answer: "🇯🇵 Япония — островное государство в Азии. Столица — Токио. Известна аниме, технологиями, гора Фудзи. Население ~125 млн." },
  { keys: ["франция", "париж", "эйфелева"], answer: "🇫🇷 Франция — страна в Европе. Столица — Париж. Эйфелева башня (324 м), Лувр, круассаны, мода, парфюм." },
  { keys: ["англия", "британия", "лондон"], answer: "🇬🇧 Великобритания — состоит из Англии, Шотландии, Уэльса, Северной Ирландии. Столица — Лондон. Биг-Бен, королева/король, английский язык." },
  { keys: ["германия", "берлин"], answer: "🇩🇪 Германия — страна в Европе. Столица — Берлин. Известна BMW, Mercedes, Volkswagen, философами (Кант, Ницше), пивом, Октоберфестом." },
  { keys: ["узбекистан", "ташкент", "самарканд"], answer: "🇺🇿 Узбекистан — сосед Таджикистана. Столица — Ташкент. Самарканд, Бухара, Хива — древние города на Великом шёлковом пути." },
  { keys: ["казахстан", "астана", "алма ата"], answer: "🇰🇿 Казахстан — крупнейшая страна Центральной Азии. Столица — Астана (раньше Алматы). Космодром Байконур!" },
  { keys: ["турция", "стамбул", "анкара"], answer: "🇹🇷 Турция — на стыке Европы и Азии. Столица — Анкара, крупнейший город — Стамбул. Кебаб, баклава, мечети, море." },
  { keys: ["сколько стран", "сколько государств"], answer: "🌍 В мире 195 признанных государств: 193 члена ООН + Ватикан и Палестина. На каждом континенте свои страны." },

  // ═══════════════════════ ПРИРОДА И НАУКА ═══════════════════════
  { keys: ["солнце", "звезда"], answer: "☀️ Солнце — звезда в центре нашей системы. Температура поверхности 5500°C. Свет идёт до Земли 8 минут. Возраст — 4,6 млрд лет." },
  { keys: ["земля", "планета"], answer: "🌍 Земля — третья планета от Солнца. Возраст 4,5 млрд лет. 71% поверхности — вода. Единственная известная планета с жизнью." },
  { keys: ["луна", "месяц"], answer: "🌙 Луна — спутник Земли. От неё до Земли ~384 000 км. Влияет на приливы. Первый человек на Луне — Нил Армстронг (1969)." },
  { keys: ["планеты", "солнечная система"], answer: "🪐 8 планет: Меркурий, Венера, Земля, Марс, Юпитер (самая большая), Сатурн (с кольцами), Уран, Нептун. Плутон с 2006 года — карликовая планета." },
  { keys: ["марс", "красная планета"], answer: "🔴 Марс — красная планета, сосед Земли. Красный цвет от ржавчины (оксид железа). Самая высокая гора Солнечной системы — Олимп (22 км)." },
  { keys: ["вода", "h2o"], answer: "💧 Вода (H₂O) — 2 атома водорода + 1 кислорода. Без неё нет жизни. Кипит при 100°C, замерзает при 0°C. На Земле её 1,4 миллиарда км³!" },
  { keys: ["воздух", "атмосфера", "кислород"], answer: "💨 Воздух: 78% азот, 21% кислород, 1% другие газы. Без кислорода человек живёт ~3 минуты. Озоновый слой защищает от ультрафиолета." },
  { keys: ["динозавры", "динозавр"], answer: "🦖 Динозавры жили 230-65 млн лет назад. Вымерли из-за падения астероида. Самые большие: брахиозавр (24 м), тираннозавр (хищник 12 м)." },
  { keys: ["самый большой", "самый высокий", "самый длинный"], answer: "🏆 Рекорды: высочайшая гора — Эверест (8849 м), длиннейшая река — Нил (6650 км), глубочайший океан — Тихий (Марианская впадина 11 км), самое большое животное — синий кит (30 м)." },
  { keys: ["алмаз", "бриллиант"], answer: "💎 Алмаз — самый твёрдый природный материал. Состоит из углерода (как графит в карандаше, но молекулы по-другому соединены!). Бриллиант — это огранённый алмаз." },

  // ═══════════════════════ КОМПЬЮТЕРЫ И ТЕХНОЛОГИИ ═══════════════════════
  { keys: ["компьютер", "пк", "ноутбук"], answer: "💻 Компьютер — устройство для обработки информации. Главные части: процессор (CPU), память (RAM), диск (SSD/HDD), монитор, клавиатура, мышь." },
  { keys: ["интернет", "сеть"], answer: "🌐 Интернет — глобальная сеть, соединяющая миллиарды устройств. Создан в 1969 году в США (ARPANET). Сегодня им пользуются >5 миллиардов человек." },
  { keys: ["программирование", "код", "программист"], answer: "👨‍💻 Программирование — написание команд для компьютера. Популярные языки: Python (легко учить), JavaScript (сайты), Java, C++. Программисты создают всё цифровое!" },
  { keys: ["искусственный интеллект", "ии", "ai", "нейросеть"], answer: "🤖 ИИ (искусственный интеллект) — программы, имитирующие мышление. Примеры: ChatGPT, Claude, переводчики, голосовые помощники. Я тоже простой бот!" },
  { keys: ["телефон", "смартфон", "iphone", "айфон"], answer: "📱 Смартфон — карманный компьютер. Первый iPhone — 2007 год. Сегодня в мире >7 миллиардов смартфонов. Android и iOS — две главные операционки." },
  { keys: ["wi-fi", "вайфай", "wifi"], answer: "📶 Wi-Fi — беспроводной интернет. Работает через радиоволны. Расшифровка «Wireless Fidelity». Был придуман в Австралии в 1990-х." },
  { keys: ["вирус компьютерный", "вирус", "хакер"], answer: "🦠 Компьютерный вирус — вредная программа. Защита: антивирус, не открывай странные ссылки, обновляй систему, не качай пиратку." },
  { keys: ["python", "питон"], answer: "🐍 Python — популярный язык программирования. Простой и читаемый. Используется в ИИ, веб-сайтах, играх, науке. Создан в 1991 году." },

  // ═══════════════════════ СПОРТ ═══════════════════════
  { keys: ["футбол"], answer: "⚽ Футбол — самый популярный спорт в мире. 22 игрока, 2 ворот, 90 минут. Чемпионат мира раз в 4 года. Аргентина выиграла в 2022 (Месси!)." },
  { keys: ["месси"], answer: "🐐 Лионель Месси — аргентинский футболист, многие считают его лучшим в истории. 8 «Золотых мячей», ЧМ 2022. Играл в Барселоне, ПСЖ, Интер Майами." },
  { keys: ["роналду", "рональдо", "криштиано"], answer: "⚽ Криштиану Роналду — португальский футболист, легенда. 5 «Золотых мячей», >900 голов в карьере. Играл в МЮ, Реале, Ювентусе, сейчас Аль-Наср." },
  { keys: ["баскетбол"], answer: "🏀 Баскетбол — 5 на 5, 4 четверти по 12 минут. Главная лига — NBA в США. Легенды: Майкл Джордан, Леброн Джеймс, Коби Брайант." },
  { keys: ["волейбол"], answer: "🏐 Волейбол — 6 на 6, через сетку. Изобретён в США в 1895. Российская и бразильская сборные — одни из лучших." },
  { keys: ["олимпиада", "олимпийские игры"], answer: "🏅 Олимпийские игры — раз в 4 года (летние и зимние чередуются). Возникли в Древней Греции. Современные — с 1896 года в Афинах." },

  // ═══════════════════════ ШКОЛА И УЧЁБА ═══════════════════════
  { keys: ["школа", "учёба", "учеба", "урок"], answer: "🏫 Школа — место учёбы. В Таджикистане 11 классов. Главные предметы: математика, родной язык, русский, английский, физика, химия, биология, история, география." },
  { keys: ["экзамен", "контрольная", "тест"], answer: "📝 Совет: учись понемногу каждый день, а не за ночь до. Высыпайся, ешь нормально перед экзаменом, читай задание внимательно. Удачи! 🍀" },
  { keys: ["как учиться", "учиться лучше", "повысить оценки"], answer: "🎓 Секреты учёбы: 1) делай домашку сразу после школы; 2) повторяй пройденное; 3) задавай вопросы — это не стыдно; 4) высыпайся; 5) меньше телефона. Работает!" },
  { keys: ["сочинение", "эссе", "как написать"], answer: "✍️ Структура сочинения: вступление (о чём пишешь) → основная часть (примеры, аргументы) → заключение (вывод). План = половина успеха!" },
  { keys: ["английский", "english", "учить язык"], answer: "🗣️ Советы по английскому: смотри сериалы с субтитрами, учи 5 слов каждый день, слушай песни, говори с собой. За год — серьёзный прогресс!" },

  // ═══════════════════════ ИСТОРИЯ ═══════════════════════
  { keys: ["великая отечественная", "вторая мировая", "вов", "вторая мировая война"], answer: "🕊️ Вторая мировая (1939-1945) — крупнейшая война в истории. СССР потерял ~27 млн человек. Победа — 9 мая 1945." },
  { keys: ["александр македонский"], answer: "⚔️ Александр Македонский (356-323 до н.э.) — великий полководец. К 30 годам создал империю от Греции до Индии. Прошёл и через территорию нынешнего Таджикистана." },
  { keys: ["шелковый путь", "великий шелковый путь"], answer: "🐪 Великий шёлковый путь — древняя торговая сеть из Китая в Европу. Проходил через Среднюю Азию (включая Таджикистан). По нему везли шёлк, специи, идеи." },
  { keys: ["египет", "пирамиды", "фараон"], answer: "🐫 Древний Египет существовал >3000 лет. Пирамида Хеопса (4500 лет!) — единственное сохранившееся чудо света. Фараоны верили в загробную жизнь." },

  // ═══════════════════════ СОВЕТЫ ПО ЖИЗНИ ═══════════════════════
  { keys: ["как стать сильным", "сильным", "качаться"], answer: "💪 Регулярные тренировки: отжимания, подтягивания, приседания. Начни с 3 раз в неделю по 30 минут. Главное — ешь нормально и спи 8 часов!" },
  { keys: ["не получается", "грустно", "плохо", "депрессия"], answer: "🌱 Бывает. Все ошибаются и расстраиваются — это нормально. Совет: погуляй, поговори с близким, отдохни. Завтра будет лучше. Если совсем тяжело — расскажи родителям или учителю." },
  { keys: ["мечта", "цель", "хочу стать"], answer: "🌟 Запиши свою мечту на бумаге. Раздели на маленькие шаги. Делай по шагу каждый день. Год работы — и ты удивишься, сколько достиг!" },
  { keys: ["мотивация", "лень"], answer: "🔥 Не жди вдохновения — начни даже 5 минут. После 5 минут уже втянешься. Дисциплина > мотивация!" },

  // ═══════════════════════ РАЗНОЕ ═══════════════════════
  { keys: ["шутка", "анекдот", "пошути"], answer: "😄 Программист стучится в стену 8 раз. — Зачем? — Ищу дверь. Не нашёл? — Нет, я ищу `for` (для), но в стене его нет!" },
  { keys: ["какое сегодня число", "какой день", "дата"], answer: "📅 Я не знаю точное число, потому что это зависит от твоего устройства. Посмотри в правом нижнем углу экрана — там есть дата и время!" },
  { keys: ["погода", "холодно", "жарко"], answer: "☁️ Я не вижу погоду, но могу подсказать сайты: yandex.ru/pogoda, gismeteo.ru. В Таджикистане летом +30-40°C, зимой -5+10°C (в горах холоднее)." },
  { keys: ["возраст", "сколько лет"], answer: "🤖 Мне нисколько — я программа, у меня нет возраста. А тебе сколько? Я могу подсказать что-то интересное для твоего возраста!" },
];

const botReply = (raw: string): string => {
  const text = normalize(raw);
  if (!text) return "Напиши свой вопрос 🙂";
  for (const topic of BOT_TOPICS) {
    if (fuzzyHas(text, topic.keys)) return topic.answer;
  }
  return "Не совсем понял 🤔 Спроси по-другому. Я знаю про IlmTech, математику 🧮, Таджикистан 🇹🇯, страны мира 🌍, природу 🌳, школу 📚, спорт ⚽, технику 💻.";
};

const BOT_QUICK = ["Как продать?", "Расскажи про Таджикистан", "Помоги с математикой", "Сколько планет?", "Как учиться лучше?", "Что такое ИИ?"];

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
  const [authRole, setAuthRole] = useState<Role>("buyer");
  const [authErr, setAuthErr] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [loginNick, setLoginNick] = useState("");
  const [loginPass, setLoginPass] = useState("");

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

  /* ---- профиль ---- */
  const [editingNick, setEditingNick] = useState(false);
  const [newNick, setNewNick] = useState("");
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [allCatsOpen, setAllCatsOpen] = useState(false);

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
        setUsers(u);
        setProducts(p);
        setMessages(m);
        setFollows(f);
        setConnected(true);

        // восстановление сессии
        const sid = session.get();
        if (sid) {
          const found = u.find((x) => x.id === sid);
          if (found) {
            setCurrentUser(found);
            setFavorites(local.get<string[]>(LS.FAVS + "_" + found.id, []));
          }
        }
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

  const regStep1 = () => {
    if (!isEmail(authEmail)) { setAuthErr("Введите корректную почту, например name@mail.com"); return; }
    if (users.some((u) => (u.email || "").toLowerCase() === authEmail.trim().toLowerCase())) { setAuthErr("Этот email уже зарегистрирован!"); return; }
    if (authNick.trim().length < 2) { setAuthErr("Никнейм: минимум 2 символа"); return; }
    if (users.some((u) => (u.nickname || "").toLowerCase() === authNick.trim().toLowerCase())) { setAuthErr("Этот никнейм уже занят!"); return; }
    if (authPass.length < 4) { setAuthErr("Пароль: минимум 4 символа"); return; }
    if (authPass !== authPass2) { setAuthErr("Пароли не совпадают"); return; }
    setAuthErr("");
    setAuthStep(2);
  };

  const finishRegister = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      const fresh = await apiLoadUsers();
      if (fresh.some((u) => (u.email || "").toLowerCase() === authEmail.trim().toLowerCase())) {
        setAuthErr("Этот email уже зарегистрирован!"); setAuthStep(1); return;
      }
      if (fresh.some((u) => (u.nickname || "").toLowerCase() === authNick.trim().toLowerCase())) {
        setAuthErr("Этот никнейм уже занят!"); setAuthStep(1); return;
      }
      const nu: User = {
        id: makeUserId(fresh),
        email: authEmail.trim(),
        nickname: authNick.trim(),
        password: authPass,
        role: authRole,
        avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
        avatarIsPhoto: false,
        createdAt: Date.now(),
        lastSeen: Date.now(),
      };
      const res = await apiInsertUser(nu);
      if (!res.ok) { setAuthErr("Ошибка сервера: " + (res.err || "")); return; }
      setUsers([...fresh, nu]);
      setCurrentUser(nu);
      session.set(nu.id);
      rememberAccount(nu.id);
      setFavorites([]);
      setAuthView("welcome"); setAuthStep(1);
      setAuthEmail(""); setAuthNick(""); setAuthPass(""); setAuthPass2("");
      setScreen("home");
      showToast(`Аккаунт создан! Твой ID: ${nu.id}`, "ok");
    } finally {
      setAuthBusy(false);
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
    };
    await apiInsertProduct(np);
    setProducts((prev) => [np, ...prev]);
    setNpTitle(""); setNpPrice(""); setNpDesc(""); setNpPhone(""); setNpImages([]);
    setNpCat("Электроника"); setNpCity("Душанбе");
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
    if (!window.confirm("Удалить всю переписку? Это нельзя отменить.")) return;
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
    if (!window.confirm("Удалить это сообщение?")) return;
    await apiDeleteMessage(messageId);
    setMessages((prev) => prev.filter((x) => x.id !== messageId));
    showToast("Сообщение удалено", "ok");
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
    if (sortMode === "asc") list.sort((a, b) => a.price - b.price);
    else if (sortMode === "desc") list.sort((a, b) => b.price - a.price);
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [products, category, sortMode]);

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
      <div className="relative w-full min-h-screen bg-white text-gray-900 flex items-center justify-center p-4 overflow-hidden">
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
              <button onClick={() => { setAuthView("login"); setAuthErr(""); }} className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold text-lg shadow-lg active:scale-95 transition">Войти</button>
              <button onClick={() => { setAuthView("register"); setAuthStep(1); setAuthErr(""); }} className="w-full py-4 rounded-2xl bg-gray-100 border border-emerald-300 font-bold text-lg active:scale-95 transition">Зарегистрироваться</button>
              {knownAccounts.length > 0 && (
                <button onClick={() => setAuthView("accounts")} className="w-full py-3 rounded-2xl bg-gray-100 border border-gray-300 font-bold text-sm active:scale-95 transition">🔄 Мои аккаунты ({knownAccounts.length})</button>
              )}
            </div>
          )}

          {authView === "accounts" && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold mb-2">🔄 Мои аккаунты</h2>
              <p className="text-gray-500 text-xs mb-2">Аккаунты, в которые ты входил на этом устройстве.</p>
              {knownAccounts.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Пока нет сохранённых аккаунтов</p>}
              {knownAccounts.map((u) => (
                <button key={u.id} onClick={() => switchTo(u.id)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gray-100 border border-gray-300 active:scale-95 transition text-left">
                  <AvatarView user={u} size={44} showOnline />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{u.nickname}</div>
                    <div className="text-xs text-gray-500">{u.role === "seller" ? "🏪 Продавец" : "🛒 Покупатель"} · {u.id}</div>
                  </div>
                  <span className="text-emerald-600 text-sm">Войти →</span>
                </button>
              ))}
              <button onClick={() => setAuthView("welcome")} className="w-full py-2 text-gray-500 text-sm">← Назад</button>
            </div>
          )}

          {authView === "login" && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold mb-2">Вход</h2>
              <input value={loginNick} onChange={(e) => setLoginNick(e.target.value)} placeholder="👤 Никнейм" className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder="🔒 Пароль" className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              {authErr && <p className="text-red-500 text-sm">{authErr}</p>}
              <button onClick={doLogin} disabled={authBusy} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold shadow-lg active:scale-95 transition disabled:opacity-60">{authBusy ? "..." : "Войти →"}</button>
              <button onClick={() => { setAuthView("welcome"); setAuthErr(""); }} className="w-full py-2 text-gray-500 text-sm">← Назад</button>
            </div>
          )}

          {authView === "register" && authStep === 1 && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold mb-2">Регистрация · Шаг 1</h2>
              <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="📧 Почта (name@mail.com)" className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <input value={authNick} onChange={(e) => setAuthNick(e.target.value)} placeholder="👤 Никнейм" className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <input type="password" value={authPass} onChange={(e) => setAuthPass(e.target.value)} placeholder="🔒 Пароль (мин. 4)" className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <input type="password" value={authPass2} onChange={(e) => setAuthPass2(e.target.value)} placeholder="🔒 Повторите пароль" className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              {authErr && <p className="text-red-500 text-sm">{authErr}</p>}
              <button onClick={regStep1} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold shadow-lg active:scale-95 transition">Далее →</button>
              <button onClick={() => { setAuthView("welcome"); setAuthErr(""); }} className="w-full py-2 text-gray-500 text-sm">← Назад</button>
            </div>
          )}

          {authView === "register" && authStep === 2 && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold mb-2">Регистрация · Шаг 2</h2>
              <p className="text-gray-500 text-sm">Выберите роль:</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setAuthRole("buyer")} className={`py-6 rounded-2xl border-2 font-bold transition ${authRole === "buyer" ? "border-emerald-500 bg-emerald-100" : "border-gray-300 bg-gray-100"}`}><div className="text-3xl mb-1">🛒</div>Покупатель</button>
                <button onClick={() => setAuthRole("seller")} className={`py-6 rounded-2xl border-2 font-bold transition ${authRole === "seller" ? "border-red-400 bg-red-100" : "border-gray-300 bg-gray-100"}`}><div className="text-3xl mb-1">🏪</div>Продавец</button>
              </div>
              {authErr && <p className="text-red-500 text-sm">{authErr}</p>}
              <button onClick={finishRegister} disabled={authBusy} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold shadow-lg active:scale-95 transition disabled:opacity-60">{authBusy ? "Создаём..." : "Создать аккаунт ✓"}</button>
              <button onClick={() => setAuthStep(1)} className="w-full py-2 text-gray-500 text-sm">← Назад</button>
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
  const isSeller = currentUser.role === "seller";

  return (
    <div className="relative w-full h-screen flex flex-col bg-gradient-to-b from-gray-50 to-white text-gray-900 overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-emerald-100 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-red-100 blur-3xl" />

      <header className="relative z-10 shrink-0 flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-xl border-b border-emerald-100">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚡</span>
          <span className="font-black text-lg bg-gradient-to-r from-emerald-500 to-green-500 bg-clip-text text-transparent">IlmTech</span>
        </div>
        <div className="flex items-center gap-2">
          {isSeller && <button onClick={() => setScreen("add")} className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white text-sm font-bold shadow-md active:scale-95 transition">➕ Подать</button>}
          <button onClick={() => setScreen("profile")} className="active:scale-90 transition"><AvatarView user={currentUser} size={34} /></button>
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 overflow-hidden">
        {screen === "home" && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <div className="rounded-3xl bg-gradient-to-r from-emerald-500 to-green-500 text-white p-6 shadow-xl relative overflow-hidden">
              <div className="absolute -right-4 -top-4 text-7xl opacity-20">⚡</div>
              <h2 className="text-2xl font-black leading-tight relative">Найди. Продай. Купи.</h2>
              <p className="text-gray-900/80 relative">Всё на IlmTech ⚡</p>
            </div>

            <div className="grid grid-cols-6 gap-2">
              {CATEGORIES.slice(0, 11).map((c) => (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className={`aspect-square flex flex-col items-center justify-center rounded-xl border font-medium transition active:scale-90 ${category === c.key ? "bg-gradient-to-br from-emerald-500 to-green-500 text-white border-emerald-400 shadow-md" : "bg-white border-gray-200"}`}>
                  <span className="text-lg">{c.emoji}</span>
                  <span className="leading-none mt-0.5 text-center px-0.5" style={{ fontSize: "9px" }}>{c.key}</span>
                </button>
              ))}
              <button onClick={() => setAllCatsOpen(true)}
                className="aspect-square flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 text-emerald-700 font-medium active:scale-90 transition">
                <span className="text-lg">➕</span>
                <span className="leading-none mt-0.5" style={{ fontSize: "9px" }}>Ещё</span>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-sm">{homeProducts.length} объявлений</span>
              <button onClick={() => setSortMode(sortMode === "new" ? "asc" : sortMode === "asc" ? "desc" : "new")} className="px-3 py-1.5 rounded-xl bg-gray-100 text-sm border border-gray-300">{sortMode === "new" ? "Новые" : sortMode === "asc" ? "Цена ↑" : "Цена ↓"}</button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {homeProducts.length === 0 && <p className="col-span-full text-center text-gray-400 py-10">Объявлений пока нет. Будь первым! 🚀</p>}
              {homeProducts.map((p) => <ProductCard key={p.id} p={p} fav={favorites.includes(p.id)} mine={p.sellerId === currentUser.id} onOpen={() => openCard(p)} onFav={() => toggleFav(p.id)} />)}
            </div>
          </div>
        )}

        {screen === "search" && (
          <div className="h-full overflow-y-auto p-4 space-y-3">
            <h2 className="text-xl font-bold">🔍 Поиск</h2>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="iPhone, BMW, квартира..." className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
            <div className="flex gap-2 overflow-x-auto pb-1">{CATEGORIES.map((c) => <button key={c.key} onClick={() => setSearchCat(c.key)} className={`whitespace-nowrap px-3 py-1.5 rounded-xl text-sm border ${searchCat === c.key ? "bg-emerald-500 border-emerald-400" : "bg-white border-gray-200"}`}>{c.emoji} {c.key}</button>)}</div>
            <div className="flex gap-2">
              <input value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} inputMode="numeric" placeholder="Цена от" className="w-1/2 px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <input value={priceTo} onChange={(e) => setPriceTo(e.target.value)} inputMode="numeric" placeholder="Цена до" className="w-1/2 px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
            </div>
            <span className="text-gray-500 text-sm">Найдено: {searchResults.length}</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{searchResults.map((p) => <ProductCard key={p.id} p={p} fav={favorites.includes(p.id)} mine={p.sellerId === currentUser.id} onOpen={() => openCard(p)} onFav={() => toggleFav(p.id)} />)}</div>
          </div>
        )}

        {screen === "add" && (
          <div className="h-full overflow-y-auto p-4 flex justify-center">
            <div className="w-full max-w-xl space-y-3">
              <h2 className="text-xl font-bold">➕ Новое объявление</h2>
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
              <input value={npTitle} onChange={(e) => setNpTitle(e.target.value)} placeholder="Название" className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <input value={npPrice} onChange={(e) => setNpPrice(e.target.value)} inputMode="numeric" placeholder="Цена (TJS)" className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <select value={npCat} onChange={(e) => setNpCat(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none">{CATEGORIES.filter((c) => c.key !== "Все").map((c) => <option key={c.key}>{c.key}</option>)}</select>
              <select value={npCity} onChange={(e) => setNpCity(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none">{CITIES.map((c) => <option key={c}>{c}</option>)}</select>
              <input value={npPhone} onChange={(e) => setNpPhone(e.target.value)} placeholder="📞 Номер телефона" className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <textarea value={npDesc} onChange={(e) => setNpDesc(e.target.value)} placeholder="Описание" rows={3} className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500" />
              <button onClick={publishProduct} className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold text-lg shadow-lg active:scale-95 transition">⚡ Опубликовать</button>
            </div>
          </div>
        )}

        {screen === "favorites" && (
          <div className="h-full overflow-y-auto p-4 space-y-3">
            <h2 className="text-xl font-bold">❤️ Избранное</h2>
            {favProducts.length === 0 ? <p className="text-gray-500 text-center py-10">Пока пусто. Жми ❤️ на товарах.</p> : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{favProducts.map((p) => <ProductCard key={p.id} p={p} fav onOpen={() => openCard(p)} onFav={() => toggleFav(p.id)} mine={p.sellerId === currentUser.id} />)}</div>}
          </div>
        )}

        {screen === "messages" && !chatPartnerId && (
          <div className="h-full overflow-y-auto p-4 flex justify-center">
            <div className="w-full max-w-2xl space-y-3">
              <h2 className="text-xl font-bold">💬 Сообщения</h2>
              <div className="flex gap-2">
                <input value={findId} onChange={(e) => setFindId(e.target.value)} placeholder="🔍 Найти по ID (ILM-XXXXX)" onKeyDown={(e) => e.key === "Enter" && findUserById()} className="flex-1 px-4 py-3 rounded-xl bg-gray-100 border border-gray-300 outline-none focus:border-emerald-500 uppercase" />
                <button onClick={findUserById} className="px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold shadow-md">Найти</button>
              </div>
              <p className="text-xs text-gray-400">Твой ID: <b className="text-emerald-600">{currentUser.id}</b> — дай его другу или брату, чтобы он написал тебе с другого ноутбука.</p>
              {conversations.length === 0 ? <p className="text-gray-500 text-center py-10">Нет диалогов. Найди человека по ID или напиши продавцу из карточки.</p> : (
                <div className="space-y-2">
                  {conversations.map((c) => (
                    <button key={c.partner.id} onClick={() => openChatWith(c.partner.id)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white border border-gray-200 active:scale-[0.98] transition text-left">
                      <AvatarView user={c.partner} size={48} showOnline />
                      <div className="flex-1 min-w-0"><div className="flex items-center justify-between"><span className="font-bold truncate inline-flex items-center gap-1">{c.partner.nickname} <VerifyMark followers={followersCount(c.partner.id)} size={12} /></span><span className="text-xs text-gray-400 shrink-0">{fmtTime(c.last.ts)}</span></div><p className="text-sm text-gray-500 truncate">{c.last.kind === "voice" ? "🎤 Голосовое" : c.last.kind === "sticker" ? `Стикер ${c.last.text}` : c.last.text}</p></div>
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
                    <VerifyMark followers={followersCount(currentUser.id)} size={22} />
                  </h2>
                )}
                <p className="text-gray-500 text-sm mt-1">{isSeller ? "🏪 Продавец" : "🛒 Покупатель"}</p>
                <div className="mt-2 inline-flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-xl"><span className="text-sm">ID: <b className="text-emerald-600">{currentUser.id}</b></span><button onClick={() => { navigator.clipboard?.writeText(currentUser.id); showToast("ID скопирован", "ok"); }} className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded">копир.</button></div>

                {/* Подписчики / подписки */}
                <div className="mt-4 flex items-center justify-center gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-black text-emerald-600">{followersCount(currentUser.id)}</div>
                    <div className="text-xs text-gray-500">Подписчики</div>
                  </div>
                  <div className="w-px h-10 bg-gray-200" />
                  <div className="text-center">
                    <div className="text-2xl font-black text-emerald-600">{followingCount(currentUser.id)}</div>
                    <div className="text-xs text-gray-500">Подписки</div>
                  </div>
                </div>

                <div className="mt-4"><button onClick={() => { setEditingNick(!editingNick); setNewNick(currentUser.nickname); }} className="px-4 py-2 rounded-xl bg-gray-100 border border-gray-300 text-sm">✏️ Редактировать профиль</button></div>
              </div>

              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4"><h3 className="font-bold mb-1">🤝 Как проходят сделки на IlmTech</h3><p className="text-sm text-gray-700">Без оплаты в приложении и без комиссий. Покупатель пишет продавцу 💬, договаривается, встречаетесь лично и платите наличными.</p></div>

              <div className="grid grid-cols-3 gap-2 text-center"><Stat label="Объявлений" value={myProducts.length} /><Stat label="Избранное" value={favorites.length} /><Stat label="Просмотры" value={myProducts.reduce((s, p) => s + p.views, 0)} /></div>

              <div className="space-y-2">
                {[{ e: "🔔", t: "Уведомления" }, { e: "✅", t: "Верификация" }, { e: "🛡️", t: "Безопасность" }, { e: "🌐", t: "Язык" }, { e: "❓", t: "Помощь" }].map((m) => (
                  <button key={m.t} onClick={() => showToast(`«${m.t}» скоро будет доступно`, "info")} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 text-left"><span className="text-xl">{m.e}</span><span>{m.t}</span><span className="ml-auto text-gray-400">›</span></button>
                ))}
              </div>

              <button onClick={() => { logout(); setAuthView("accounts"); }} className="w-full py-3 rounded-xl bg-gray-100 border border-gray-300 font-bold">🔄 Сменить аккаунт</button>
              <button onClick={logout} className="w-full py-3 rounded-xl bg-red-50 border border-red-300 text-red-600 font-bold">🚪 Выйти</button>
            </div>
          </div>
        )}

        {!botOpen && screen !== "messages" && (
          <button onClick={() => setBotOpen(true)} className="absolute bottom-4 right-4 w-14 h-14 rounded-full bg-gradient-to-r from-emerald-500 to-green-500 text-2xl shadow-lg animate-bounce">🤖</button>
        )}

        {botOpen && (
          <div className="absolute bottom-3 right-3 flex flex-col bg-white border border-emerald-300 rounded-2xl overflow-hidden shadow-2xl" style={{ width: "min(360px, calc(100% - 24px))", height: "min(72%, 540px)" }}>
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-500"><span className="font-bold">🤖 IlmBot</span><button onClick={() => setBotOpen(false)} className="text-xl">✕</button></div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">{botMsgs.map((m, i) => <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}><div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-line ${m.from === "user" ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-900"}`} style={{ maxWidth: "82%" }}>{m.text}</div></div>)}<div ref={botEndRef} /></div>
            <div className="px-3 pb-2 flex flex-wrap gap-1">{BOT_QUICK.map((q) => <button key={q} onClick={() => sendBot(q)} className="text-xs px-2 py-1 rounded-lg bg-gray-100 border border-gray-300">{q}</button>)}</div>
            <div className="flex gap-2 p-3 border-t border-gray-200"><input value={botInput} onChange={(e) => setBotInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendBot()} placeholder="Спроси что-нибудь..." className="flex-1 px-3 py-2 rounded-xl bg-gray-100 border border-gray-300 outline-none text-sm" /><button onClick={() => sendBot()} className="px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold">➤</button></div>
          </div>
        )}
      </main>

      <nav className="relative z-10 shrink-0 flex items-center justify-around bg-white/90 backdrop-blur-xl border-t border-emerald-100 py-2">
        <NavBtn emoji="🏠" label="Главная" active={screen === "home"} onClick={() => setScreen("home")} />
        <NavBtn emoji="🔍" label="Поиск" active={screen === "search"} onClick={() => setScreen("search")} />
        {isSeller && <NavBtn emoji="➕" label="Продать" active={screen === "add"} onClick={() => setScreen("add")} />}
        <NavBtn emoji="💬" label="Чаты" active={screen === "messages"} onClick={() => { setScreen("messages"); setChatPartnerId(null); }} badge={totalUnread} />
        <NavBtn emoji="❤️" label="Избр." active={screen === "favorites"} onClick={() => setScreen("favorites")} badge={favorites.length} />
        <NavBtn emoji="👤" label="Профиль" active={screen === "profile"} onClick={() => setScreen("profile")} />
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
          sellerFollowers={followersCount(openProduct.sellerId)}
        />
      )}

      {allCatsOpen && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setAllCatsOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl" style={{ maxHeight: "85%", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-gray-900">Все категории</h2>
              <button onClick={() => setAllCatsOpen(false)} className="w-9 h-9 rounded-full bg-gray-100 text-lg active:scale-90 transition">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button key={c.key} onClick={() => { setCategory(c.key); setAllCatsOpen(false); }}
                  className={`flex flex-col items-center justify-center py-4 rounded-xl border-2 transition active:scale-95 ${category === c.key ? "bg-gradient-to-br from-emerald-500 to-green-500 text-white border-emerald-500 shadow-md" : "bg-white border-gray-200 hover:border-emerald-300"}`}>
                  <span className="text-3xl mb-1">{c.emoji}</span>
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
        const targetProducts = products.filter((p) => p.sellerId === target.id).length;
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
                  <VerifyMark followers={targetFollowers} size={22} />
                </h2>
                <p className="text-gray-500 text-sm mt-1">{target.role === "seller" ? "🏪 Продавец" : "🛒 Покупатель"} · {target.id}</p>
                <p className="text-xs mt-1">
                  {isOnline(target.lastSeen) ? <span className="text-emerald-600 font-semibold">🟢 в сети</span> : <span className="text-gray-400">{lastSeenText(target.lastSeen)}</span>}
                </p>

                <div className="mt-4 flex items-center justify-center gap-4">
                  <div className="text-center"><div className="text-xl font-black text-emerald-600">{targetProducts}</div><div className="text-xs text-gray-500">Объявл.</div></div>
                  <div className="w-px h-10 bg-gray-200" />
                  <div className="text-center"><div className="text-xl font-black text-emerald-600">{targetFollowers}</div><div className="text-xs text-gray-500">Подписч.</div></div>
                  <div className="w-px h-10 bg-gray-200" />
                  <div className="text-center"><div className="text-xl font-black text-emerald-600">{targetFollowing}</div><div className="text-xs text-gray-500">Подписки</div></div>
                </div>

                {!isMe && (
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => toggleFollow(target.id)}
                      className={`py-3 rounded-xl font-bold shadow-md active:scale-95 transition ${following ? "bg-gray-200 text-gray-700 border border-gray-300" : "bg-gradient-to-r from-emerald-500 to-green-500 text-white"}`}
                    >
                      {following ? "✓ Вы подписаны" : "➕ Подписаться"}
                    </button>
                    <button
                      onClick={() => { setViewingProfileId(null); openChatWith(target.id); }}
                      className="py-3 rounded-xl font-bold bg-white border-2 border-emerald-500 text-emerald-600 active:scale-95 transition"
                    >
                      💬 Написать
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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

function NavBtn({ emoji, label, active, onClick, badge }: { emoji: string; label: string; active: boolean; onClick: () => void; badge?: number; }) {
  return (
    <button onClick={onClick} className={`relative flex flex-col items-center gap-0.5 px-2 ${active ? "text-emerald-600" : "text-gray-500"}`}>
      <span className="text-xl">{emoji}</span>
      <span style={{ fontSize: "10px" }}>{label}</span>
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
      </div>
      <div className="p-2">
        <div className="font-black text-emerald-600">{fmtPrice(p.price)} TJS</div>
        <div className="text-sm truncate">{p.title}</div>
        <div className="text-gray-400 flex items-center justify-between mt-1" style={{ fontSize: "11px" }}><span>📍 {p.city}</span><span>👁 {p.views}</span></div>
      </div>
    </div>
  );
}

function ProductModal({ p, fav, mine, commentText, setCommentText, onAddComment, onFav, onClose, onWrite, onOpenProfile, sellerFollowers }: {
  p: Product; fav: boolean; mine: boolean; commentText: string; setCommentText: (s: string) => void;
  onAddComment: () => void; onFav: () => void; onClose: () => void; onWrite: () => void;
  onOpenProfile: () => void; sellerFollowers: number;
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
            <span className="font-bold inline-flex items-center gap-1">{p.sellerName} <VerifyMark followers={sellerFollowers} size={14} /></span>
          </button>
          {!mine ? (
            <div className="grid grid-cols-2 gap-2">
              <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="py-3 rounded-xl bg-green-500 text-white font-bold text-center active:scale-95 transition">📞 Позвонить</a>
              <button onClick={onWrite} className="py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold shadow-md active:scale-95 transition">💬 Написать</button>
            </div>
          ) : <div className="py-2 text-center text-gray-500 text-sm">Это ваше объявление</div>}
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
          <div className="font-bold truncate inline-flex items-center gap-1">{partner.nickname} <VerifyMark followers={partnerFollowers} size={14} /></div>
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

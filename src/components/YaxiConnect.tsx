"use client";

// Подключение банка через YAXI (docs.yaxi.tech): пользователь вводит данные
// онлайн-банка прямо здесь, они уходят в банк по сквозному шифрованному каналу
// YAXI — наш сервер их не видит. Бэкенд только выпускает тикеты и принимает
// подписанные (HMAC) result-JWT: Accounts → Balances → Transactions → импорт.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RoutexClient,
  Result,
  Dialog,
  Redirect,
  Confirmation,
  Selection,
  Field,
  AccountField,
  SecrecyLevel,
  InvalidCredentialsException,
  ServiceBlockedException,
  ConsentExpiredException,
  CanceledException,
  type OBResponse,
  type ConnectionInfo,
  type Credentials,
  type ConfirmationOptions,
  type ResponseOptions,
} from "routex-client";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";
import { translator } from "@/lib/i18n/dictionaries";
import {
  claimSnapshot,
  saveSnapshot,
  clearSnapshot,
  bytesToB64,
  b64ToBytes,
  type FlowSnapshot,
  type FlowStage,
} from "@/lib/yaxi/flow-snapshot";
import { fetchTicket, decodeJwtData, fetchUserSecret, saveAccess } from "@/lib/yaxi/flow-client";

const L = {
  ru: {
    search: "Найди свой банк", searchPh: "Название банка, BIC…", loading: "Ищем…",
    notFound: "Ничего не нашлось — попробуй другое название или страну.",
    credsTitle: "Вход в {bank}", userId: "Логин", password: "Пароль",
    credsNote: "Данные уходят в банк по сквозному шифрованному каналу YAXI. Zori не видит и не хранит их.",
    back: "← Назад", connect: "Подключить", running: "Подключаем…",
    stAccounts: "Счета", stBalances: "Остатки", stTx: "Операции", stImport: "Импорт в Zori",
    scaTitle: "Подтверждение банка", confirm: "Я подтвердил(а)", send: "Отправить",
    waiting: "Ждём подтверждения в приложении банка…", cancel: "Отмена",
    done: "Банк подключён! Операции и остаток уже в Zori.", close: "Закрыть",
    errCreds: "Банк не принял логин или пароль.", errBlocked: "Банк требует действия: зайди в свой онлайн-банк и попробуй снова.",
    errConsent: "Доступ истёк — подключи банк заново.", errGeneric: "Не получилось. Попробуй ещё раз.",
    noAccounts: "Банк не вернул ни одного счёта.", retry: "Попробовать снова",
    scaRedirectMsg: "Переходим на страницу банка. Подтверди там доступ — вернёшься в Zori, и подключение продолжится само.",
    scaConfirmMsg: "Подтверди запрос в приложении банка или на его устройстве, затем нажми кнопку ниже.",
    openBank: "Открыть страницу банка",
    thinCoverage: "Для этой страны в каталоге пока в основном необанки. Свой банк ищи по названию — или добавь его выпиской CSV/PDF на «Интеграциях».",
  },
  en: {
    search: "Find your bank", searchPh: "Bank name, BIC…", loading: "Searching…",
    notFound: "Nothing found — try another name or country.",
    credsTitle: "Sign in to {bank}", userId: "User ID", password: "Password",
    credsNote: "Credentials go to the bank via YAXI's end-to-end encrypted channel. Zori never sees or stores them.",
    back: "← Back", connect: "Connect", running: "Connecting…",
    stAccounts: "Accounts", stBalances: "Balances", stTx: "Transactions", stImport: "Import into Zori",
    scaTitle: "Bank confirmation", confirm: "I confirmed", send: "Send",
    waiting: "Waiting for confirmation in your banking app…", cancel: "Cancel",
    done: "Bank connected! Transactions and balance are in Zori.", close: "Close",
    errCreds: "The bank rejected the user ID or password.", errBlocked: "The bank requires action: log in to your online banking and retry.",
    errConsent: "Access expired — reconnect the bank.", errGeneric: "Something went wrong. Please try again.",
    noAccounts: "The bank returned no accounts.", retry: "Try again",
    scaRedirectMsg: "Taking you to your bank's page. Approve access there — you'll return to Zori and the connection continues on its own.",
    scaConfirmMsg: "Approve the request in your banking app or device, then press the button below.",
    openBank: "Open bank page",
    thinCoverage: "For this country the catalog is mostly neobanks for now. Search your bank by name — or add it via CSV/PDF statement on the Integrations page.",
  },
  es: {
    search: "Encuentra tu banco", searchPh: "Nombre del banco, BIC…", loading: "Buscando…",
    notFound: "Sin resultados — prueba otro nombre o país.",
    credsTitle: "Acceso a {bank}", userId: "Usuario", password: "Contraseña",
    credsNote: "Las credenciales van al banco por el canal cifrado de extremo a extremo de YAXI. Zori nunca las ve ni las guarda.",
    back: "← Atrás", connect: "Conectar", running: "Conectando…",
    stAccounts: "Cuentas", stBalances: "Saldos", stTx: "Operaciones", stImport: "Importar a Zori",
    scaTitle: "Confirmación del banco", confirm: "Confirmado", send: "Enviar",
    waiting: "Esperando confirmación en tu app bancaria…", cancel: "Cancelar",
    done: "¡Banco conectado! Operaciones y saldo ya están en Zori.", close: "Cerrar",
    errCreds: "El banco rechazó el usuario o la contraseña.", errBlocked: "El banco requiere acción: entra en tu banca online y reinténtalo.",
    errConsent: "El acceso caducó — vuelve a conectar el banco.", errGeneric: "Algo falló. Inténtalo de nuevo.",
    noAccounts: "El banco no devolvió ninguna cuenta.", retry: "Reintentar",
    scaRedirectMsg: "Te llevamos a la página de tu banco. Aprueba el acceso allí — volverás a Zori y la conexión continúa sola.",
    scaConfirmMsg: "Aprueba la solicitud en tu app bancaria o dispositivo y pulsa el botón de abajo.",
    openBank: "Abrir página del banco",
    thinCoverage: "Para este país el catálogo aún tiene sobre todo neobancos. Busca tu banco por nombre — o añádelo con un extracto CSV/PDF en «Integraciones».",
  },
  uk: {
    search: "Знайди свій банк", searchPh: "Назва банку, BIC…", loading: "Шукаємо…",
    notFound: "Нічого не знайшлося — спробуй іншу назву чи країну.",
    credsTitle: "Вхід до {bank}", userId: "Логін", password: "Пароль",
    credsNote: "Дані йдуть у банк наскрізним шифрованим каналом YAXI. Zori їх не бачить і не зберігає.",
    back: "← Назад", connect: "Підключити", running: "Підключаємо…",
    stAccounts: "Рахунки", stBalances: "Залишки", stTx: "Операції", stImport: "Імпорт у Zori",
    scaTitle: "Підтвердження банку", confirm: "Я підтвердив(ла)", send: "Надіслати",
    waiting: "Чекаємо підтвердження в застосунку банку…", cancel: "Скасувати",
    done: "Банк підключено! Операції та залишок уже в Zori.", close: "Закрити",
    errCreds: "Банк не прийняв логін або пароль.", errBlocked: "Банк вимагає дій: зайди у свій онлайн-банк і спробуй знову.",
    errConsent: "Доступ вичерпано — підключи банк заново.", errGeneric: "Не вийшло. Спробуй ще раз.",
    noAccounts: "Банк не повернув жодного рахунку.", retry: "Спробувати знову",
    scaRedirectMsg: "Переходимо на сторінку банку. Підтверди там доступ — повернешся в Zori, і підключення продовжиться саме.",
    scaConfirmMsg: "Підтверди запит у застосунку банку або на його пристрої, потім натисни кнопку нижче.",
    openBank: "Відкрити сторінку банку",
    thinCoverage: "Для цієї країни в каталозі поки що переважно необанки. Шукай свій банк за назвою — або додай його випискою CSV/PDF на «Інтеграціях».",
  },
} as const;

const COUNTRY_CODES = ["DE", "AT", "FR", "ES", "IT", "NL", "PT", "IE", "PL", "BE", "FI", "GB"] as const;

type Step = "search" | "creds" | "progress" | "done" | "error";
type Svc = FlowStage;

// Живое состояние флоу: то же, что снимок, но context появляется только
// в момент редиректа (см. drive), а v/ts проставляются при сохранении.
type Flow = Omit<FlowSnapshot, "v" | "ts" | "context">;

interface TicketRes {
  ticket: string;
  ticketId: string;
  clientUrl: string | null;
}

interface DialogView {
  message?: string;
  imageUrl?: string;
  kind: "confirm" | "waiting" | "select" | "field" | "redirect";
  options?: { key: string; label: string; explanation?: string }[];
  secret?: boolean;
  redirectUrl?: string;
}

type DialogAction = { type: "confirm" } | { type: "respond"; response: string } | { type: "cancel" };

// Снимок забирает ровно один инстанс YaxiConnect на странице (на «Интеграциях»
// их два: line и hero); флаг живёт до перезагрузки — новый снимок появляется
// только после навигации в банк и обратно, когда модуль создаётся заново.
let resumeTaken = false;

export function YaxiConnect({
  defaultCountry = "DE",
  locale = DEFAULT_LOCALE,
  variant = "card",
  cta,
}: {
  defaultCountry?: string;
  locale?: Locale;
  variant?: "card" | "hero" | "line";
  /** Текст кнопки для variant="line" (напр. «Обновить данные» у подключённого банка). */
  cta?: string;
}) {
  const t = L[locale] ?? L.ru;
  const tr = translator(locale);
  const router = useRouter();
  const regionNames = new Intl.DisplayNames([localeTag(locale)], { type: "region" });
  const COUNTRIES = COUNTRY_CODES.map((code) => [code, regionNames.of(code) ?? code] as const);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("search");
  const [country, setCountry] = useState(
    (COUNTRY_CODES as readonly string[]).includes(defaultCountry.toUpperCase()) ? defaultCountry.toUpperCase() : "DE"
  );
  const [query, setQuery] = useState("");
  const [banks, setBanks] = useState<ConnectionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [bank, setBank] = useState<ConnectionInfo | null>(null);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState(0);
  const [dialog, setDialog] = useState<DialogView | null>(null);
  const [fieldValue, setFieldValue] = useState("");
  const [selected, setSelected] = useState("");
  const [redirectOpened, setRedirectOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<RoutexClient | null>(null);
  const searchTicketRef = useRef<TicketRes | null>(null);
  const pendingRef = useRef<((a: DialogAction) => void) | null>(null);
  const cancelledRef = useRef(false);

  function getClient(clientUrl: string | null): RoutexClient {
    if (!clientRef.current) {
      clientRef.current = new RoutexClient(clientUrl ? { url: new URL(clientUrl) } : undefined);
      // SCA-редирект банка вернёт вкладку на /bank-return, оттуда флоу
      // продолжается по снимку (см. drive и resume-эффект ниже).
      clientRef.current.setRedirectUri(`${window.location.origin}/bank-return`);
    }
    return clientRef.current;
  }

  // ── Поиск банков (тикет выпускаем один на сессию модалки) ────────────────
  useEffect(() => {
    if (!open || step !== "search") return;
    let dead = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        if (!searchTicketRef.current) searchTicketRef.current = await fetchTicket("Accounts");
        const tk = searchTicketRef.current;
        const client = getClient(tk.clientUrl);
        // Фильтры в YAXI складываются как «И». Текстовый поиск НЕ ограничиваем
        // страной: у части банков страна в каталоге не проставлена, и связка
        // «ES + santander» даёт пусто, хотя банк по имени находится.
        const filters: ({ countries: string[] } | { term: string })[] = query.trim()
          ? query.trim().split(/\s+/).map((term) => ({ term }))
          : [{ countries: [country] }];
        const found = await client.search({ ticket: tk.ticket, filters, limit: 25 });
        if (!dead) setBanks(found);
      } catch (err) {
        console.error("yaxi search error:", err);
        if (!dead) {
          searchTicketRef.current = null; // тикет мог истечь — перевыпустим
          setError(tr("bc.loadError"));
        }
      } finally {
        if (!dead) setLoading(false);
      }
    }, 350);
    return () => {
      dead = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, country, query]);

  // ── Возврат из банка: SCA-редирект увёл эту вкладку на страницу банка,
  // /bank-return привёл обратно с сохранённым снимком флоу. Забираем снимок
  // (claim удаляет его — продолжит ровно один инстанс), подтверждаем редирект
  // по сохранённому context и доводим подключение до импорта.
  useEffect(() => {
    if (resumeTaken) return;
    const snap = claimSnapshot();
    if (!snap) return;
    resumeTaken = true;
    cancelledRef.current = false;
    setOpen(true);
    setStep("progress");
    setStage(snap.stage === "accounts" ? 0 : snap.stage === "balances" ? 1 : 2);
    (async () => {
      try {
        getClient(snap.clientUrl);
        const resp = await confirmFn[snap.stage]({
          ticket: snap.ticket,
          context: b64ToBytes(snap.context)!,
        });
        const { v: _v, ts: _ts, context: _ctx, ...flow } = snap;
        await continueFlow(flow, resp);
      } catch (err) {
        failFlow(err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Возврат из ПРИЛОЖЕНИЯ банка (app-to-app, iOS): переход по universal
  // link открывает приложение, не трогая нашу страницу. Когда вкладка снова
  // становится видимой — подтверждаем редирект сами: YAXI вернёт Result,
  // а если банк ещё думает — Confirmation с поллингом, цикл её обработает.
  useEffect(() => {
    if (dialog?.kind !== "redirect") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") act({ type: "confirm" });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog?.kind]);

  // ── Интерапты: показываем диалог и ждём действия пользователя ───────────
  function waitUser(view: DialogView): Promise<DialogAction> {
    setFieldValue("");
    setSelected("");
    setRedirectOpened(false);
    setDialog(view);
    return new Promise((resolve) => {
      pendingRef.current = resolve;
    });
  }

  function act(action: DialogAction) {
    const resolve = pendingRef.current;
    pendingRef.current = null;
    setDialog(null);
    resolve?.(action);
  }

  function imageUrl(d: Dialog): string | undefined {
    if (!d.image) return undefined;
    const bytes = new Uint8Array(d.image.data);
    return URL.createObjectURL(new Blob([bytes], { type: d.image.mimeType }));
  }

  const confirmFn: Record<Svc, (o: ConfirmationOptions) => Promise<OBResponse>> = {
    accounts: (o) => clientRef.current!.confirmAccounts(o),
    balances: (o) => clientRef.current!.confirmBalances(o),
    transactions: (o) => clientRef.current!.confirmTransactions(o),
  };
  const respondFn: Record<Svc, (o: ResponseOptions) => Promise<OBResponse>> = {
    accounts: (o) => clientRef.current!.respondAccounts(o),
    balances: (o) => clientRef.current!.respondBalances(o),
    transactions: (o) => clientRef.current!.respondTransactions(o),
  };

  async function drive(first: OBResponse, flow: Flow): Promise<Result> {
    const svc = flow.stage;
    let resp = first;
    for (let i = 0; i < 60; i++) {
      if (cancelledRef.current) throw new CanceledException();

      if (resp instanceof Result) return resp;

      if (resp instanceof Dialog) {
        const input = resp.input;

        // Decoupled SCA с поллингом: подтверждаем сами с заданной паузой.
        if (input instanceof Confirmation && input.pollingDelaySecs != null) {
          const delaySecs = Math.max(1, input.pollingDelaySecs);
          setDialog({ kind: "waiting", message: resp.message ?? t.waiting, imageUrl: imageUrl(resp) });
          await new Promise((r) => setTimeout(r, delaySecs * 1000));
          if (cancelledRef.current) throw new CanceledException();
          resp = await confirmFn[svc]({ ticket: flow.ticket, context: input.context });
          continue;
        }

        if (input instanceof Confirmation) {
          const a = await waitUser({ kind: "confirm", message: resp.message, imageUrl: imageUrl(resp) });
          if (a.type === "cancel") throw new CanceledException();
          resp = await confirmFn[svc]({ ticket: flow.ticket, context: input.context });
          continue;
        }
        if (input instanceof Selection) {
          const a = await waitUser({
            kind: "select",
            message: resp.message,
            imageUrl: imageUrl(resp),
            options: input.options,
          });
          if (a.type === "cancel") throw new CanceledException();
          resp = await respondFn[svc]({ ticket: flow.ticket, context: input.context, response: a.type === "respond" ? a.response : "" });
          continue;
        }
        if (input instanceof Field) {
          const a = await waitUser({
            kind: "field",
            message: resp.message,
            imageUrl: imageUrl(resp),
            secret: input.secrecyLevel === SecrecyLevel.Password,
          });
          if (a.type === "cancel") throw new CanceledException();
          resp = await respondFn[svc]({ ticket: flow.ticket, context: input.context, response: a.type === "respond" ? a.response : "" });
          continue;
        }
        throw new Error("unknown dialog input");
      }

      if (resp instanceof Redirect) {
        // SCA-редирект: уводим ЭТУ вкладку на страницу банка — так задумано
        // YAXI для веба (никаких попапов: их страницы подтверждения умеют
        // дёргать window.opener и ломать флоу). Прогресс сохраняем в снимок;
        // банк вернёт на /bank-return, оттуда продолжим с confirm.
        const url = resp.url.toString();
        saveSnapshot({ ...flow, v: 1, ts: Date.now(), context: bytesToB64(resp.context)! });
        setDialog({ kind: "waiting", message: t.scaRedirectMsg });
        window.location.assign(url);
        // iOS может перехватить переход приложением банка (universal link)
        // или молча отказать без жеста пользователя — страница остаётся жить.
        // Тогда показываем кнопку «Открыть страницу банка» (тап = жест),
        // а возврат во вкладку ловит visibilitychange-эффект выше.
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelledRef.current) throw new CanceledException();
        const a = await waitUser({ kind: "redirect", message: t.scaRedirectMsg, redirectUrl: url });
        if (a.type === "cancel") {
          clearSnapshot();
          throw new CanceledException();
        }
        clearSnapshot(); // продолжаем прямо здесь — снимок не понадобится
        resp = await confirmFn[svc]({ ticket: flow.ticket, context: resp.context });
        continue;
      }

      throw new Error("unexpected YAXI response");
    }
    throw new Error("too many interaction steps");
  }

  // ── Флоу от текущей стадии до импорта. resume — ответ, с которого
  // продолжается прерванная редиректом стадия (после confirm); при свежем
  // запуске null. Пароль в снимок не пишется: редирект-банки работают без
  // него, а если банк с паролем всё же уйдёт в редирект и сессии не хватит,
  // упадём в errCreds — пользователь введёт пароль ещё раз.
  async function continueFlow(flow: Flow, resume: OBResponse | null) {
    const client = getClient(flow.clientUrl);
    const credentials: Credentials = {
      connectionId: flow.connectionId,
      userId: flow.userId,
      password: password || undefined,
    };
    let resp = resume;
    // connectionData — опаковый «токен» повторного доступа от банка; копим его
    // из результатов, чтобы в конце сохранить доступ для тихого автосинка.
    let connData: Uint8Array | undefined;

    if (flow.stage === "accounts") {
      setStage(0);
      const first =
        resp ??
        (await client.accounts({
          credentials,
          ticket: flow.ticket,
          // Постоянное согласие с максимальными правами (вместо одноразового
          // минимального на каждый сервис): один поход в банк вместо трёх+,
          // и позже можно синкать без повторного SCA (ING: 180 дней).
          recurringConsents: true,
          fields: [AccountField.Iban, AccountField.Currency, AccountField.Name, AccountField.DisplayName, AccountField.Type],
        }));
      resp = null;
      const res = await drive(first, flow);
      flow.session = bytesToB64(res.session) ?? flow.session;
      connData = res.connectionData ?? connData;
      const accounts = ((decodeJwtData(res.jwt) as { iban?: string; currency?: string }[]) ?? []).filter(
        (a) => a.iban
      );
      if (accounts.length === 0) throw new Error(t.noAccounts);
      flow.accounts = accounts.map((a) => ({ iban: a.iban!, currency: a.currency }));
      flow.accountsJwt = res.jwt;
      flow.stage = "balances";
      flow.ticket = (await fetchTicket("Balances")).ticket;
    }

    if (flow.stage === "balances") {
      setStage(1);
      const first =
        resp ??
        (await client.balances({
          credentials,
          session: b64ToBytes(flow.session),
          ticket: flow.ticket,
          recurringConsents: true,
          accounts: flow.accounts ?? [],
        }));
      resp = null;
      const res = await drive(first, flow);
      flow.session = bytesToB64(res.session) ?? flow.session;
      connData = res.connectionData ?? connData;
      flow.balancesJwt = res.jwt;
      flow.stage = "transactions";
      flow.txIndex = 0;
    }

    setStage(2);
    // До 15 счетов: у Revolut много валютных карманов — иначе часть операций
    // не тянется (Иван: «берёт не все операции»).
    const accs = (flow.accounts ?? []).slice(0, 15);
    const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    while (flow.txIndex < accs.length) {
      const a = accs[flow.txIndex]!;
      let first = resp;
      resp = null;
      if (!first) {
        flow.ticket = (
          await fetchTicket("Transactions", { account: { iban: a.iban, currency: a.currency }, range: { from } })
        ).ticket;
        first = await client.transactions({
          credentials,
          session: b64ToBytes(flow.session),
          ticket: flow.ticket,
          recurringConsents: true,
        });
      }
      const res = await drive(first, flow);
      flow.session = bytesToB64(res.session) ?? flow.session;
      connData = res.connectionData ?? connData;
      flow.txJwts.push(res.jwt);
      flow.txIndex++;
    }

    setStage(3);
    const res = await fetch("/api/bank/yaxi/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: flow.connectionId,
        institutionName: flow.institutionName,
        accountsJwt: flow.accountsJwt,
        balancesJwt: flow.balancesJwt,
        transactionsJwts: flow.txJwts,
      }),
    });
    if (!res.ok) throw new Error(`import ${res.status}`);

    // Сохраняем доступ в браузере (зашифрован userSecret) для тихого автосинка
    // при следующих заходах. Не критично: упадёт — останется ручное обновление.
    try {
      const userSecret = await fetchUserSecret();
      if (userSecret) {
        saveAccess(flow.connectionId, userSecret, {
          userId: flow.userId,
          password: password || undefined,
          connectionData: connData,
        });
      }
    } catch {
      /* автосинк опционален */
    }

    clearSnapshot();
    setStep("done");
    router.refresh();
  }

  function failFlow(err: unknown) {
    clearSnapshot(); // флоу оборвался на этой странице — снимок больше не нужен
    setDialog(null);
    pendingRef.current = null;
    if (err instanceof CanceledException || cancelledRef.current) {
      setStep(bank ? "creds" : "search");
      return;
    }
    console.error("yaxi flow error:", err);
    const msg =
      err instanceof InvalidCredentialsException
        ? t.errCreds
        : err instanceof ServiceBlockedException
          ? t.errBlocked
          : err instanceof ConsentExpiredException
            ? t.errConsent
            : err instanceof Error && err.message === t.noAccounts
              ? t.noAccounts
              : t.errGeneric;
    setError(msg);
    setStep("error");
  }

  // ── Полный флоу: Accounts → Balances → Transactions → импорт ────────────
  async function runFlow() {
    if (!bank) return;
    cancelledRef.current = false;
    setStep("progress");
    setStage(0);
    setError(null);
    try {
      const t1 = await fetchTicket("Accounts");
      await continueFlow(
        {
          clientUrl: t1.clientUrl,
          connectionId: bank.id,
          institutionName: bank.displayName,
          userId: userId || undefined,
          stage: "accounts",
          ticket: t1.ticket,
          txJwts: [],
          txIndex: 0,
        },
        null
      );
    } catch (err) {
      failFlow(err);
    }
  }

  function close() {
    cancelledRef.current = true;
    act({ type: "cancel" });
    setOpen(false);
    setStep("search");
    setBank(null);
    setUserId("");
    setPassword("");
    setDialog(null);
    setError(null);
    searchTicketRef.current = null;
  }

  const stages = [t.stAccounts, t.stBalances, t.stTx, t.stImport];

  return (
    <>
      {variant === "hero" ? (
        <button className="btn bh-cta-btn" onClick={() => setOpen(true)}>
          {tr("int.bankHeroCta")}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      ) : variant === "line" ? (
        <button className="btn btn-line btn-sm" onClick={() => setOpen(true)}>{cta ?? tr("int.bankHeroCta")}</button>
      ) : (
        <button className="btn btn-accent btn-sm" style={{ width: "100%" }} onClick={() => setOpen(true)}>
          {tr("int.connect")}
        </button>
      )}

      {open && (
        <div className="modal-overlay" onClick={step === "progress" ? undefined : close}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>
                {step === "creds" && bank
                  ? t.credsTitle.replace("{bank}", bank.displayName)
                  : step === "progress"
                    ? t.running
                    : t.search}
              </b>
              <button className="modal-x" onClick={close} aria-label={tr("cal.close")}>✕</button>
            </div>

            {step === "search" && (
              <>
                <div className="modal-controls">
                  <select className="modal-select" value={country} onChange={(e) => setCountry(e.target.value)}>
                    {COUNTRIES.map(([code, name]) => (
                      <option key={code} value={code}>{name}</option>
                    ))}
                  </select>
                  <input
                    className="modal-search"
                    placeholder={t.searchPh}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                  />
                </div>
                {error && <div className="note warn" style={{ margin: "0 0 12px" }}>{error}</div>}
                {!loading && !error && !query.trim() && banks.length > 0 && banks.length < 6 && (
                  <div className="cap" style={{ margin: "0 0 10px" }}>{t.thinCoverage}</div>
                )}
                <div className="bank-list">
                  {loading ? (
                    <div className="cap" style={{ padding: 16 }}>{t.loading}</div>
                  ) : banks.length === 0 ? (
                    <div className="cap" style={{ padding: 16 }}>{t.notFound}</div>
                  ) : (
                    banks.map((b) => (
                      <button
                        key={b.id}
                        className="bank-row"
                        onClick={() => {
                          setBank(b);
                          setStep("creds");
                          setError(null);
                        }}
                      >
                        <span className="bank-ic">{b.displayName.slice(0, 1).toUpperCase()}</span>
                        <span className="bank-name">{b.displayName}</span>
                        <span className="cap">→</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            {step === "creds" && bank && (
              <>
                <div className="field">
                  <label>{bank.userId || t.userId}</label>
                  <input value={userId} onChange={(e) => setUserId(e.target.value)} autoFocus autoComplete="off" />
                </div>
                {bank.credentials.full && (
                  <div className="field">
                    <label>{bank.password || t.password}</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
                  </div>
                )}
                {bank.advice && <div className="cap" style={{ marginBottom: 10 }}>{bank.advice}</div>}
                <div className="note info" style={{ marginTop: 0, marginBottom: 14 }}>
                  <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <span>{t.credsNote}</span>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setStep("search")}>{t.back}</button>
                  <button className="btn btn-accent" onClick={runFlow} disabled={!userId.trim() && !bank.credentials.none}>
                    {t.connect}
                  </button>
                </div>
              </>
            )}

            {step === "progress" && (
              <>
                <ol className="yx-stages">
                  {stages.map((s, i) => (
                    <li key={s} className={i < stage ? "done" : i === stage ? "on" : ""}>
                      <span className="yx-dot">{i < stage ? "✓" : ""}</span>
                      {s}
                    </li>
                  ))}
                </ol>

                {dialog && (
                  <div className="yx-dialog">
                    <div className="yx-dialog-head">
                      <span className="yx-dialog-ic">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                      </span>
                      <b>{t.scaTitle}</b>
                    </div>
                    <p>{dialog.message ?? (dialog.kind === "confirm" ? t.scaConfirmMsg : null)}</p>
                    {dialog.imageUrl && <img src={dialog.imageUrl} alt="" />}

                    {dialog.kind === "waiting" && (
                      <div className="cap" style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 0 }}>
                        <span className="yx-spin" />{t.waiting}
                      </div>
                    )}

                    {dialog.kind === "select" && dialog.options && (
                      <div className="yx-options">
                        {dialog.options.map((o) => (
                          <label key={o.key} className={`yx-opt ${selected === o.key ? "on" : ""}`}>
                            <input type="radio" name="yx-sel" checked={selected === o.key} onChange={() => setSelected(o.key)} />
                            <span>{o.label}{o.explanation ? ` — ${o.explanation}` : ""}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {dialog.kind === "field" && (
                      <input
                        className="modal-search"
                        style={{ width: "100%" }}
                        type={dialog.secret ? "password" : "text"}
                        value={fieldValue}
                        onChange={(e) => setFieldValue(e.target.value)}
                        autoFocus
                      />
                    )}

                    <div className="yx-dialog-actions">
                      <button className="btn btn-ghost btn-sm" style={{ marginRight: "auto" }} onClick={() => act({ type: "cancel" })}>{t.cancel}</button>
                      {dialog.kind === "confirm" && (
                        <button className="btn btn-accent btn-sm" onClick={() => act({ type: "confirm" })}>{t.confirm}</button>
                      )}
                      {dialog.kind === "select" && (
                        <button className="btn btn-accent btn-sm" disabled={!selected} onClick={() => act({ type: "respond", response: selected })}>{t.send}</button>
                      )}
                      {dialog.kind === "field" && (
                        <button className="btn btn-accent btn-sm" disabled={!fieldValue.trim()} onClick={() => act({ type: "respond", response: fieldValue.trim() })}>{t.send}</button>
                      )}
                      {/* Автопереход не случился (iOS требует жеста для app-switch) —
                          даём кнопку; после неё запасная «Я подтвердил(а)», если
                          visibilitychange вдруг не сработал. */}
                      {dialog.kind === "redirect" && dialog.redirectUrl && (
                        <>
                          {redirectOpened && (
                            <button className="btn btn-line btn-sm" onClick={() => act({ type: "confirm" })}>{t.confirm}</button>
                          )}
                          <button
                            className="btn btn-accent btn-sm"
                            onClick={() => {
                              setRedirectOpened(true);
                              window.location.assign(dialog.redirectUrl!);
                            }}
                          >
                            {t.openBank}
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {step === "done" && (
              <>
                <div className="note ok" style={{ marginTop: 0 }}>
                  <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
                  <span>{t.done}</span>
                </div>
                <button className="btn btn-dark btn-sm" style={{ marginTop: 14, alignSelf: "flex-end" }} onClick={close}>{t.close}</button>
              </>
            )}

            {step === "error" && (
              <>
                <div className="note warn" style={{ marginTop: 0 }}>
                  <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                  <span>{error}</span>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
                  <button className="btn btn-ghost btn-sm" onClick={close}>{t.close}</button>
                  <button className="btn btn-accent btn-sm" onClick={() => setStep(bank ? "creds" : "search")}>{t.retry}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

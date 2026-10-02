/** Pure Gemini Live function declarations (no browser/db imports) — shared by the browser session and the server token setup. */
import { Type, type FunctionDeclaration } from "@google/genai";
import { PERIODS } from "../metrics/periods";

const PERIOD = { type: Type.STRING, enum: ["this_month", "last_month", "last_7_days"] };

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "propose_transactions",
    description: "پیشنهاد ثبت یک یا چند تراکنش (حداکثر ۸) با یک فراخوانی؛ کارت تأیید دسته‌جمعی نشان داده می‌شود و تا تأیید کاربر چیزی ذخیره نمی‌شود. ثبت تکی هم با آرایه‌ی یک‌عضوی.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          maxItems: "8",
          items: {
            type: Type.OBJECT,
            properties: {
              amount_toman: { type: Type.INTEGER, description: "مبلغ به تومان" },
              kind: { type: Type.STRING, enum: ["income", "expense"] },
              category_name: { type: Type.STRING },
              account_name: { type: Type.STRING },
              occurred_at: { type: Type.STRING, description: "ISO 8601" },
              note: { type: Type.STRING },
              decision_id: { type: Type.STRING, description: "شناسه‌ی تصمیمی که record_decision برگرداند (اختیاری)" },
            },
            required: ["amount_toman", "kind", "category_name"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "resolve_pending_transaction",
    description: "لغو همه (cancel_all) یا حذف یک ردیف (remove_item با index از صفر) از پنجره‌ی تأیید. ثبت فقط با لمس دکمه است.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ["cancel_all", "remove_item"] },
        index: { type: Type.INTEGER, description: "شماره‌ی ردیف از صفر؛ فقط برای remove_item" },
      },
      required: ["action"],
    },
  },
  {
    name: "get_period_summary",
    description: "جمع درآمد، هزینه و مانده در یک دوره.",
    parameters: { type: Type.OBJECT, properties: { period: PERIOD }, required: ["period"] },
  },
  {
    name: "get_category_spending",
    description: "جمع هزینه‌ی یک دسته در یک دوره.",
    parameters: {
      type: Type.OBJECT,
      properties: { category_name: { type: Type.STRING }, period: PERIOD },
      required: ["category_name", "period"],
    },
  },
  {
    name: "get_budget_status",
    description: "مصرف و باقی‌مانده‌ی بودجه‌ی ماه جاری (یک دسته یا همه).",
    parameters: { type: Type.OBJECT, properties: { category_name: { type: Type.STRING } } },
  },
  {
    name: "get_financial_vitals",
    description: "علائم حیاتی مالی کاربر: Runway (ماه)، نرخ پس‌انداز، سهم هزینه‌ی ضروری از درآمد، پیشرفت صندوق اضطراری. همه با کد محاسبه شده‌اند.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

const M_PERIOD = { type: Type.STRING, enum: [...PERIODS] };
const CAT = { type: Type.STRING, description: "نام دسته" };

export const METRIC_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_top_expenses",
    description: "بزرگ‌ترین هزینه‌های یک دوره (حداکثر ۵)، اختیاری برای یک دسته.",
    parameters: { type: Type.OBJECT, properties: { period: M_PERIOD, limit: { type: Type.INTEGER }, category_name: CAT }, required: ["period"] },
  },
  {
    name: "compare_periods",
    description: "مقایسه‌ی درآمد و هزینه‌ی دو دوره و تغییر هر دسته.",
    parameters: { type: Type.OBJECT, properties: { period_a: M_PERIOD, period_b: M_PERIOD }, required: ["period_a", "period_b"] },
  },
  {
    name: "explain_change",
    description: "چرا هزینه‌ی این دوره نسبت به دوره‌ی هم‌اندازه‌ی قبلی بیشتر شد: سه دسته‌ی با بیشترین افزایش و بزرگ‌ترین خریدهایشان.",
    parameters: { type: Type.OBJECT, properties: { period: M_PERIOD }, required: ["period"] },
  },
  {
    name: "search_transactions",
    description: "جستجوی تراکنش‌ها با دوره، دسته، حداقل مبلغ یا متن یادداشت (حداکثر ۵ نتیجه).",
    parameters: { type: Type.OBJECT, properties: { period: M_PERIOD, category_name: CAT, min_amount_toman: { type: Type.INTEGER }, text: { type: Type.STRING }, limit: { type: Type.INTEGER } } },
  },
  {
    name: "get_daily_budget",
    description: "بودجه‌ی خرج آزاد امروز و مقدار خرج‌شده تا الان.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_month_forecast",
    description: "بازه‌ی تخمینی مانده‌ی پایان ماه جاری.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "simulate_scenario",
    description: "شبیه‌سازی «اگر...» تا ۳ تغییر در ۳، ۶ یا ۱۲ ماه. type: reduce_category (category_name + percent یا amount_toman در ماه)، increase_saving (amount_toman در ماه)، one_time_expense (amount_toman + month_offset)، income_change (amount_toman در ماه؛ منفی برای کاهش).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        months: { type: Type.INTEGER, description: "۳، ۶ یا ۱۲" },
        inflation_annual_percent: { type: Type.NUMBER },
        items: {
          type: Type.ARRAY, maxItems: "3",
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ["reduce_category", "increase_saving", "one_time_expense", "income_change"] },
              category_name: CAT, percent: { type: Type.NUMBER }, amount_toman: { type: Type.INTEGER }, month_offset: { type: Type.INTEGER },
            },
            required: ["type"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "check_purchase",
    description: "قبل از خرید: اثر یک خرید روی بودجه‌ی امروز، بودجه‌ی آزاد ماه، پیش‌بینی پایان ماه، Runway و صندوق اضطراری. چیزی ذخیره نمی‌کند.",
    parameters: { type: Type.OBJECT, properties: { amount_toman: { type: Type.INTEGER }, category_name: CAT }, required: ["amount_toman"] },
  },
  {
    name: "record_decision",
    description: "ثبت تصمیم خرید در دفتر تصمیم؛ فقط وقتی خود کاربر صریحاً گفت می‌خرد/عقب می‌اندازد/نمی‌خرد. شناسه‌ی برگشتی را برای decision_id در propose_transactions استفاده کن.",
    parameters: {
      type: Type.OBJECT,
      properties: { title: { type: Type.STRING }, amount_toman: { type: Type.INTEGER }, category_name: CAT, choice: { type: Type.STRING, enum: ["bought", "postponed", "skipped"] }, reason: { type: Type.STRING } },
      required: ["title", "amount_toman", "choice"],
    },
  },
  {
    name: "get_alerts",
    description: "هشدارهای تازه‌ی هزینه‌ی غیرمعمول (هزینه‌ی بزرگ، تکراری احتمالی، خرج تند یک دسته).",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_assets_summary",
    description: "دارایی‌های غیرنقدی (ارز، سکه، طلا): جمع ارزش، تفکیک نوع، سن قیمت‌ها (ساعت) و ثروت خالص تخمینی بدون احتساب بدهی. مقدار null یعنی قیمت در دسترس نیست.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];


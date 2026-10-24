// Category display helpers (pure, client-safe).
const EMOJI: Record<string, string> = {
  "Food & Drink": "🍙",
  Groceries: "🛒",
  Housing: "🏠",
  Transport: "🚇",
  Utilities: "📱",
  Education: "📚",
  Shopping: "🛍️",
  Health: "💊",
  Subscriptions: "🔁",
  Income: "💼",
  Family: "🇺🇿",
  Transfer: "🔄",
  Entertainment: "🎬",
  Travel: "✈️",
  "Bank Fees": "🏦",
  Other: "•",
};

export const categoryEmoji = (c: string) => EMOJI[c] ?? "💳";

/** Map Plaid personal_finance_category.primary (e.g. FOOD_AND_DRINK) to our category names. */
export function fromPlaidCategory(primary?: string | null): string {
  switch (primary) {
    case "FOOD_AND_DRINK":
      return "Food & Drink";
    case "GENERAL_MERCHANDISE":
      return "Shopping";
    case "TRANSPORTATION":
      return "Transport";
    case "TRAVEL":
      return "Travel";
    case "RENT_AND_UTILITIES":
      return "Utilities";
    case "INCOME":
      return "Income";
    case "TRANSFER_IN":
    case "TRANSFER_OUT":
    case "LOAN_PAYMENTS":
      return "Transfer";
    case "ENTERTAINMENT":
      return "Entertainment";
    case "MEDICAL":
    case "PERSONAL_CARE":
      return "Health";
    case "BANK_FEES":
      return "Bank Fees";
    case "HOME_IMPROVEMENT":
      return "Housing";
    case "GENERAL_SERVICES":
    case "GOVERNMENT_AND_NON_PROFIT":
      return "Other";
    default:
      return "Other";
  }
}

/** Categories that move money between own accounts; excluded from "spending". */
export const NON_SPEND_CATEGORIES = ["Transfer"];

// Подписи участников «кто это» — храним КЛЮЧ (локализуется в UI через mem.<key>).
// Это описание человека, а не права: права задаёт role (finance/viewer).

export const PERSONAL_MEMBER_LABELS = [
  "husband",
  "wife",
  "partner",
  "son",
  "daughter",
  "mother",
  "father",
  "relative",
  "other",
] as const;

export const BUSINESS_MEMBER_LABELS = [
  "accountant",
  "coowner",
  "manager",
  "investor",
  "employee",
  "other",
] as const;

export type MemberLabel =
  | (typeof PERSONAL_MEMBER_LABELS)[number]
  | (typeof BUSINESS_MEMBER_LABELS)[number];

export function memberLabelsFor(personal: boolean): readonly string[] {
  return personal ? PERSONAL_MEMBER_LABELS : BUSINESS_MEMBER_LABELS;
}

export function isValidMemberLabel(label: string, personal: boolean): boolean {
  return memberLabelsFor(personal).includes(label);
}

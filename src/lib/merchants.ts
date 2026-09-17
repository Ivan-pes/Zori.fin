/**
 * Единый ключ мерчанта во всём продукте: категоризация, правила пользователя,
 * регулярные списания, концентрация. Нормализует «шумное» описание банковской
 * транзакции в устойчивый ключ (бренд), убирая номера, url-мусор и пунктуацию.
 *
 * Пример: "www.1global.com/*London" → "global com".
 */
export function merchantKey(desc: string | null): string {
  return (desc ?? "")
    .toLowerCase()
    .replace(/https?:\/\/|www\./g, "")
    .replace(/[0-9]/g, " ")
    .replace(/[*/\\.,:|()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
}

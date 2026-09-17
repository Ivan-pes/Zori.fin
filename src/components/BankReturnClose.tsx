"use client";

import { useEffect } from "react";
import { peekSnapshot } from "@/lib/yaxi/flow-snapshot";

// Сюда банк возвращает вкладку после подтверждения SCA. Если есть
// незавершённый снимок флоу — сразу везём пользователя на «Интеграции»,
// где YaxiConnect подхватит подключение с того же места (снимок заберёт он).
// Снимка нет (устаревшая вкладка, прямой заход) — пробуем закрыть вкладку,
// иначе остаётся подсказка с кнопкой «Вернуться в Zori».
export function BankReturnClose() {
  useEffect(() => {
    if (peekSnapshot()) {
      window.location.replace("/app/integrations?bank=resume");
      return;
    }
    const t = setTimeout(() => {
      try {
        window.close();
      } catch {
        /* остаёмся на странице с подсказкой */
      }
    }, 1200);
    return () => clearTimeout(t);
  }, []);
  return null;
}

"use client";

import { createContext, useContext } from "react";
import { DICTIONARIES, type Dictionary, type Locale } from "@/lib/i18n";

const LOCALE_KEY = "mithpasong-locale";

/** 저장된 언어가 없으면 브라우저 언어를 따른다. (한국어가 아니면 영어) */
export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (saved === "ko" || saved === "en") return saved;
  } catch {
    // 저장소를 못 쓰는 환경이면 브라우저 언어로 정한다.
  }
  return navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // 저장하지 못해도 이번 접속에서는 바뀐 언어로 보인다.
  }
}

export const I18nContext = createContext<Dictionary>(DICTIONARIES.ko);

export function useT(): Dictionary {
  return useContext(I18nContext);
}

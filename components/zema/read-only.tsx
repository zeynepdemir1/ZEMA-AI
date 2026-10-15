'use client';

import { createContext, useContext } from 'react';

/**
 * Salt okunur vitrin — istemci tarafı.
 *
 * Bayrak sunucuda (lib/read-only.ts → READ_ONLY) okunuyor ve kök layout'tan
 * buraya prop olarak geliyor; NEXT_PUBLIC_ olmadığı için istemci kendisi
 * okuyamaz. Bu katman yalnızca UX: asıl kilit sunucudaki assertWritable().
 */
const ReadOnlyContext = createContext(false);

export function ReadOnlyProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <ReadOnlyContext.Provider value={value}>{children}</ReadOnlyContext.Provider>;
}

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

/**
 * İçindeki TÜM form kontrollerini (button, input, select, textarea) pasif
 * yapar — `<fieldset disabled>` tarayıcının kendi mekanizması, tek tek
 * `disabled` prop'u eklemeye gerek yok. `display: contents` ile yerleşimi
 * bozmaz. Linkler etkilenmez; gezinme serbest kalır.
 *
 * YALNIZCA mutasyon bölgelerini sarmalayın — sekme/filtre gibi gezinme
 * butonları içeride kalırsa onlar da pasifleşir.
 */
export function ReadOnlyFieldset({ children }: { children: React.ReactNode }) {
  const readOnly = useReadOnly();
  return (
    <fieldset disabled={readOnly} data-read-only={readOnly || undefined} className="contents">
      {children}
    </fieldset>
  );
}

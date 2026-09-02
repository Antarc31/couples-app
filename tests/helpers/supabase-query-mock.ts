// =============================================================================
// Helper condiviso per mockare la catena query-builder di Supabase nei test
// (`.from(table).select(cols).eq(col, val).maybeSingle()`).
// =============================================================================
//
// Nota importante sull'uso di `jest` in questo file e in chi lo importa:
// usare SEMPRE il global ambient `jest` (nessun `import { jest } from
// "@jest/globals"`). Con `@jest/globals`, sotto il transform SWC di
// next/jest, `jest.mock(...)` non viene hoistato sopra gli `import`
// sottostanti — il modulo reale verrebbe caricato al posto del mock e i
// test fallirebbero a runtime nonostante il typecheck passi (bug trovato e
// documentato in tests/lib/auth-actions.test.ts). Vedi anche
// tests/setup.smoke.test.tsx, che segue lo stesso pattern.
//
// Nota sui generici: `jest.fn<T, Y>()` qui usa lo stile `@types/jest`
// (primo generico = tipo di ritorno, secondo = tupla degli argomenti), non
// lo stile a generico singolo di `@jest/globals`/`jest-mock` — per
// coerenza con l'uso del global ambient sopra.

/** Riga generica ritornata da `.maybeSingle()` (es. tabelle `profiles`/`couples`). */
export type MockRow = Record<string, unknown> | null;

/**
 * Mock tipizzato della catena `.from(table).select(cols).eq(col, val).maybeSingle()`.
 * Ogni `jest.fn()` ha la firma reale della funzione che sta mockando, così
 * `mockResolvedValue`/`mockReturnValue` vengono validati correttamente da
 * TypeScript invece di collassare a `never` (bug noto di `jest.fn()` senza
 * generico esplicito, vedi commento sopra).
 */
export function makeQueryBuilderMock(row: MockRow) {
  const maybeSingle = jest
    .fn<Promise<{ data: MockRow }>, []>()
    .mockResolvedValue({ data: row });
  const eq = jest
    .fn<{ maybeSingle: typeof maybeSingle }, [column: string, value: string]>()
    .mockReturnValue({ maybeSingle });
  const select = jest
    .fn<{ eq: typeof eq }, [columns: string]>()
    .mockReturnValue({ eq });
  return { select, eq, maybeSingle };
}

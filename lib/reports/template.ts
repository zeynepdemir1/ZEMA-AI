export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Şablon PDF'lerinin depo yolu. Önek yarışmacılara kapalı (bkz. template-url rotası). */
export const TEMPLATE_PREFIX = '_templates';

export function templateStoragePath(competitionId: string): string {
  return `${TEMPLATE_PREFIX}/${competitionId}/${crypto.randomUUID()}.pdf`;
}

/** İstemciden gelen yol gerçekten BU yarışmanın şablon klasöründe mi? */
export function templatePathBelongsTo(path: string, competitionId: string): boolean {
  return (
    path.startsWith(`${TEMPLATE_PREFIX}/${competitionId}/`) &&
    !path.includes('..') &&
    path.endsWith('.pdf')
  );
}

/** Şablon PDF'i için sınır — rapordan küçük tutuluyor, şablonlar kısa belgeler. */
export const TEMPLATE_MAX_BYTES = 10 * 1024 * 1024;
export const TEMPLATE_MIN_TEXT_CHARS = 300;

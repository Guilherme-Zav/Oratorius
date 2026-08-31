/** Modelo de dados persistido. Ver ADR-003 para a politica de retencao. */
export const SCHEMA_VERSION = 1;
export const DEFAULT_SETTINGS = {
    schemaVersion: SCHEMA_VERSION,
    codaRhoticTarget: 'fricativa',
    strictness: 2,
    dailyGoalMin: 12,
    handsFree: false,
    keepAudioDays: 30,
    lastBackupAt: null,
    micNoiseFloorDb: null,
    createdAt: new Date().toISOString(),
};
export function todayKey(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function newId(prefix) {
    const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now().toString(36)}_${rand}`;
}
//# sourceMappingURL=model.js.map
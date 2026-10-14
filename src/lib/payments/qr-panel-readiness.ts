export type BankPanelBlocker = "vault" | "storage" | "connection" | null;

export function bankPanelReadiness(input: { vaultConfigured: boolean; storageError: boolean; certificationConnections: number }) {
  const saveBlocker: BankPanelBlocker = !input.vaultConfigured ? "vault" : input.storageError ? "storage" : null;
  const generateBlocker: BankPanelBlocker = saveBlocker ?? (input.certificationConnections > 0 ? null : "connection");
  return { canSave: saveBlocker === null, canGenerate: generateBlocker === null, saveBlocker, generateBlocker };
}

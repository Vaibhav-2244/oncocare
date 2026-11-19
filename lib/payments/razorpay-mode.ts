export type RazorpayMode = 'test' | 'live';

export function resolveRazorpayMode({
  configuredMode,
  livePaymentsEnabled,
  keyId,
}: {
  configuredMode: string | undefined;
  livePaymentsEnabled: boolean;
  keyId: string | null;
}): { mode: RazorpayMode; modeValid: boolean; inferred: boolean } {
  const requestedMode = configuredMode?.trim().toLowerCase();
  if (livePaymentsEnabled) {
    if (requestedMode && requestedMode !== 'live') {
      return { mode: 'live', modeValid: false, inferred: false };
    }
    if (keyId && !keyId.startsWith('rzp_live_')) {
      return { mode: 'live', modeValid: false, inferred: false };
    }
    return {
      mode: 'live',
      modeValid: requestedMode !== 'test' && (!keyId || keyId.startsWith('rzp_live_')),
      inferred: requestedMode !== 'live',
    };
  }

  if (requestedMode) {
    if (requestedMode === 'test' || requestedMode === 'live') {
      return { mode: requestedMode, modeValid: true, inferred: false };
    }
    return {
      mode: keyId?.startsWith('rzp_live_') ? 'live' : 'test',
      modeValid: false,
      inferred: false,
    };
  }

  if (keyId?.startsWith('rzp_live_')) {
    return { mode: 'live', modeValid: true, inferred: true };
  }
  return { mode: 'test', modeValid: true, inferred: true };
}

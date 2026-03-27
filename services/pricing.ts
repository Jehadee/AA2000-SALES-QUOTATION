/**
 * Tier prices from base cost only (DB supplies base; all tiers computed on the frontend).
 * Final price = base × (1 + markup%) per your pricing table.
 */

/** SRP (end-user): small volume 50%, big volume 30% */
export const END_USER_SV_MULT = 1.5;
export const END_USER_BV_MULT = 1.3;

/** Dealer: small volume 30%, big volume 20% */
export const DEALER_SV_MULT = 1.3;
export const DEALER_BV_MULT = 1.2;

/** Contractor: small volume 15%, big volume 10% */
export const CONTRACTOR_SV_MULT = 1.15;
export const CONTRACTOR_BV_MULT = 1.1;

/** When inferring base from a known SRP (small volume), divide by this. */
export const END_USER_MARKUP = END_USER_SV_MULT;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function deriveTierPricesFromBasePrice(base: number): {
  dealerPrice: number;
  contractorPrice: number;
  endUserPrice: number;
  dealerBigVolumePrice: number;
  contractorBigVolumePrice: number;
  endUserBigVolumePrice: number;
} {
  if (!Number.isFinite(base) || base <= 0) {
    return {
      dealerPrice: 0,
      contractorPrice: 0,
      endUserPrice: 0,
      dealerBigVolumePrice: 0,
      contractorBigVolumePrice: 0,
      endUserBigVolumePrice: 0,
    };
  }
  return {
    dealerPrice: roundMoney(base * DEALER_SV_MULT),
    contractorPrice: roundMoney(base * CONTRACTOR_SV_MULT),
    endUserPrice: roundMoney(base * END_USER_SV_MULT),
    dealerBigVolumePrice: roundMoney(base * DEALER_BV_MULT),
    contractorBigVolumePrice: roundMoney(base * CONTRACTOR_BV_MULT),
    endUserBigVolumePrice: roundMoney(base * END_USER_BV_MULT),
  };
}

import { COMBO_NAMESPACE } from "../../combos";
import type { ResolvedFastPolicy } from "../../providers/fastwire";
import { catalogModelSlug, type CatalogModel, type RawEntry } from "./parsing";
import { preserveOperatorUltraFastTiers } from "./operator-tiers";

const MANAGED_ULTRAFAST = "opencodex_managed_ultrafast";

/** Flex is a foreign caller tier: advertise it only when the final wire can forward it verbatim. */
export function supportsConfiguredFlex(policy: ResolvedFastPolicy | undefined): boolean {
  return policy?.eligibility === "eligible"
    && policy.forwardCallerTier === true
    && policy.fastWire?.kind === "service-tier"
    && policy.fastWire.foreignCallerTiers === "verbatim"
    && policy.fastWire.canonicalToWire.flex === "flex";
}

/** An exact routed capability, never inferred from a model family or template. */
export function configuredFlexSlugs(models: readonly CatalogModel[]): ReadonlySet<string> {
  const declarations = new Map<string, boolean>();
  for (const model of models) {
    const slug = catalogModelSlug(model);
    const supported = model.provider !== COMBO_NAMESPACE && model.nativeAlias !== true
      && model.supportsServiceTier === true && model.supportsFlexTier === true;
    declarations.set(slug, supported && declarations.get(slug) !== false);
  }
  return new Set([...declarations].filter(([, supported]) => supported).map(([slug]) => slug));
}

/**
 * Publish the optional Flex selector. A generated tier is marked so a stale
 * persisted row cannot keep it after the live capability has been withdrawn.
 */
export function applyConfiguredFlex(entry: RawEntry, configured: boolean): void {
  const marker = "opencodex_managed_flex";
  if (entry[marker] === entry.slug) {
    if (Array.isArray(entry.service_tiers)) {
      entry.service_tiers = entry.service_tiers.filter(tier => tier?.id !== "flex");
    }
    if (Array.isArray(entry.additional_speed_tiers)) {
      entry.additional_speed_tiers = entry.additional_speed_tiers.filter(tier => tier !== "flex");
    }
  }
  delete entry[marker];
  if (!configured) return;
  const tiers = Array.isArray(entry.service_tiers) ? entry.service_tiers : [];
  if (!tiers.some(tier => tier?.id === "flex")) {
    entry.service_tiers = [...tiers, {
      id: "flex", name: "Flex",
      description: "Lower cost, slower processing; provider access required",
    }];
  }
  const speeds = Array.isArray(entry.additional_speed_tiers) ? entry.additional_speed_tiers : [];
  if (!speeds.includes("flex")) entry.additional_speed_tiers = [...speeds, "flex"];
  entry[marker] = entry.slug;
}

/** Advertise Ultra Fast only when the eligible final wire explicitly maps that exact tier. */
export function supportsConfiguredUltraFast(policy: ResolvedFastPolicy | undefined): boolean {
  return policy?.eligibility === "eligible"
    && policy.fastWire?.kind === "service-tier"
    && policy.fastWire.canonicalToWire.ultrafast === "ultrafast";
}

/** Carry captured capability to catalog projection without treating persisted metadata as authority. */
export function configuredUltraFastSlugs(models: readonly CatalogModel[]): ReadonlySet<string> {
  const declarations = new Map<string, boolean>();
  for (const model of models) {
    const slug = catalogModelSlug(model);
    const supported = model.provider !== COMBO_NAMESPACE && model.nativeAlias !== true
      && model.supportsServiceTier === true && model.supportsUltraFastTier === true;
    // A conflicting duplicate cannot lend its capability to the surviving row.
    declarations.set(slug, supported && declarations.get(slug) !== false);
  }
  return new Set([...declarations].filter(([, supported]) => supported).map(([slug]) => slug));
}

/** Apply current configuration, or retain an independently supplied exact-row operator tier. */
export function applyConfiguredUltraFast(
  entry: RawEntry,
  previous: RawEntry | undefined,
  configured: boolean,
  retainOperatorTier: boolean,
): void {
  // This marker only rejects stale generated metadata; it never authorizes a new tier.
  const wasManaged = previous?.[MANAGED_ULTRAFAST] === entry.slug;
  preserveOperatorUltraFastTiers(entry, wasManaged || configured ? undefined : previous, retainOperatorTier);
  delete entry[MANAGED_ULTRAFAST];
  if (!configured) return;
  entry.service_tiers = [...(Array.isArray(entry.service_tiers) ? entry.service_tiers : []), {
    id: "ultrafast",
    name: "Ultra Fast",
    description: "Higher speed and usage; provider access required",
  }];
  entry.additional_speed_tiers = [
    ...(Array.isArray(entry.additional_speed_tiers) ? entry.additional_speed_tiers : []), "ultrafast",
  ];
  // Advertising a selectable capability does not opt the user into its increased usage.
  entry[MANAGED_ULTRAFAST] = entry.slug;
}

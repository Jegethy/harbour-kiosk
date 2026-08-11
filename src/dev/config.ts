/**
 * DEV ONLY — hardware simulator.
 *
 * Everything under src/dev/ exists so the fob flows can be tested before the
 * physical 125kHz reader arrives. It is not part of the product.
 *
 * To remove it entirely: delete src/dev/, delete the two <FobSimulator> call
 * sites (grep for "@/dev"), and drop NEXT_PUBLIC_ENABLE_FOB_SIMULATOR from the
 * environment. See DEPLOYMENT.md.
 *
 * The flag is checked at every entry point, so even if this directory ships by
 * accident the simulator cannot render unless the variable is explicitly
 * "true" — Next bakes the value in at build time and the guards return null.
 *
 * Be clear about what that does and does not buy: it is a runtime guard, not
 * removal. Verified by building with the flag off — the constant is inlined as
 * false, but the component code and its strings are still present in the
 * client bundle. Anyone reading the JavaScript can see the simulator exists.
 * Deleting this directory is the only thing that actually removes it, which is
 * why that is the checklist item rather than "set the flag to false".
 */
export const SIMULATOR_ENABLED = process.env.NEXT_PUBLIC_ENABLE_FOB_SIMULATOR === "true";

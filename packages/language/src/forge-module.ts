import {
  type DefaultSharedCoreModuleContext,
  type LangiumCoreServices,
  type LangiumSharedCoreServices,
  type Module,
  type PartialLangiumCoreServices,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  inject
} from 'langium';
import { ForgeGeneratedModule, ForgeGeneratedSharedModule } from './generated/module.js';

export type ForgeAddedServices = Record<string, never>;
export type ForgeServices = LangiumCoreServices & ForgeAddedServices;

export const ForgeModule: Module<ForgeServices, PartialLangiumCoreServices & ForgeAddedServices> = {};

export function createForgeServices(context: DefaultSharedCoreModuleContext): {
  shared: LangiumSharedCoreServices;
  Forge: ForgeServices;
} {
  const shared = inject(createDefaultSharedCoreModule(context), ForgeGeneratedSharedModule);
  const Forge = inject(createDefaultCoreModule({ shared }), ForgeGeneratedModule, ForgeModule);
  shared.ServiceRegistry.register(Forge);
  return { shared, Forge };
}

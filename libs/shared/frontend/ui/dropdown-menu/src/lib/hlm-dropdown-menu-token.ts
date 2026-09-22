import { InjectionToken, type ValueProvider, inject } from '@angular/core';
import { type MenuAlign, type MenuSide } from '@spartan-ng/brain/core';

export interface HlmDropdownMenuConfig {
	align: MenuAlign;
	side: MenuSide;
}

export interface HlmDropdownMenuTriggerContext {
	triggerWidth(): number;
}

export const HLM_DROPDOWN_MENU_TRIGGER = new InjectionToken<HlmDropdownMenuTriggerContext>(
	'HlmDropdownMenuTrigger',
);

const defaultConfig: HlmDropdownMenuConfig = {
	align: 'start',
	side: 'bottom',
};

const HlmDropdownMenuConfigToken = new InjectionToken<HlmDropdownMenuConfig>('HlmDropdownMenuConfig');

export function provideHlmDropdownMenuConfig(config: Partial<HlmDropdownMenuConfig>): ValueProvider {
	return { provide: HlmDropdownMenuConfigToken, useValue: { ...defaultConfig, ...config } };
}

export function injectHlmDropdownMenuConfig(): HlmDropdownMenuConfig {
	return inject(HlmDropdownMenuConfigToken, { optional: true }) ?? defaultConfig;
}

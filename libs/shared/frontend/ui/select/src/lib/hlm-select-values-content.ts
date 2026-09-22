import { Directive } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';

@Directive({ selector: '[hlmSelectValuesContent],hlm-select-values-content' })
export class HlmSelectValuesContent {
	constructor() {
		classes(() => 'gap-2 flex min-w-0 flex-1 overflow-hidden *:min-w-0 *:truncate');
	}
}

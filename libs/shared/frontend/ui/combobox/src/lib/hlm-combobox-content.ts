import { Directive, input } from '@angular/core';
import { BrnComboboxContent } from '@spartan-ng/brain/combobox';
import { classes, type HlmOverlayWidth } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmComboboxContent],hlm-combobox-content',
	hostDirectives: [BrnComboboxContent],
})
export class HlmComboboxContent {
	public readonly width = input<HlmOverlayWidth>('trigger');

	constructor() {
		classes(() => [
			'bg-popover text-popover-foreground data-open:animate-in **:has-[[data-slot=input-group-control]:focus-visible]:border-input data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 **:data-[slot=input-group]:bg-input/30 **:data-[slot=input-group]:border-input/30 max-h-72 overflow-hidden rounded-lg shadow-md ring-1 duration-100 **:has-[[data-slot=input-group-control]:focus-visible]:ring-0 **:data-[slot=input-group]:m-1 **:data-[slot=input-group]:mb-0 **:data-[slot=input-group]:h-8 **:data-[slot=input-group]:shadow-none group/combobox-content relative flex flex-col p-0',
			this.width() === 'content'
				? 'w-max min-w-(--brn-combobox-width) max-w-[calc(100vw-2rem)] sm:max-w-lg'
				: 'w-(--brn-combobox-width) max-w-[calc(100vw-2rem)]',
		]);
	}
}
